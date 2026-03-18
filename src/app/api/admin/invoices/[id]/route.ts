import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'edge';

async function resolveTargetInvoiceId(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let targetId: string | undefined;
  try {
    const { id } = await ctx.params;
    targetId = id;
  } catch {}
  if (!targetId) {
    try {
      const url = new URL(req.url);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const last = pathParts[pathParts.length - 1];
      if (last && last !== 'invoices') targetId = last;
      if (!targetId) {
        const q = url.searchParams.get('id');
        if (q) targetId = q;
      }
    } catch {}
  }
  return targetId;
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const { data: myProfile, error: roleErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (roleErr) {
      return NextResponse.json({ ok: false, error: roleErr.message }, { status: 500 });
    }
    if (!myProfile || myProfile.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    const invoiceId = await resolveTargetInvoiceId(req, ctx);
    if (!invoiceId) return NextResponse.json({ ok: false, error: 'missing_invoice_id' }, { status: 400 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ ok: false, error: 'missing_service_role' }, { status: 409 });
    }

    const admin = createSupabaseClient(supabaseUrl, serviceKey);

    const { data: inv, error: invErr } = await admin
      .from('invoices')
      .select('id,status')
      .eq('id', invoiceId)
      .maybeSingle();
    if (invErr) return NextResponse.json({ ok: false, error: invErr.message }, { status: 500 });
    if (!inv) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

    if (inv.status !== 'draft' && inv.status !== 'void') {
      return NextResponse.json({ ok: false, error: 'only_draft_or_void_can_be_deleted' }, { status: 400 });
    }

    const { data: pays, error: payErr } = await admin
      .from('payments')
      .select('id,status')
      .eq('invoice_id', invoiceId);
    if (payErr) return NextResponse.json({ ok: false, error: payErr.message }, { status: 500 });
    if ((pays || []).some((p: any) => p?.status && p.status !== 'void')) {
      return NextResponse.json({ ok: false, error: 'invoice_has_payments' }, { status: 400 });
    }

    const { data: jes, error: jeErr } = await admin
      .from('journal_entries')
      .select('id,status')
      .eq('reference_id', invoiceId);
    if (jeErr) return NextResponse.json({ ok: false, error: jeErr.message }, { status: 500 });
    if ((jes || []).length > 0) {
      return NextResponse.json({ ok: false, error: 'invoice_has_journal_entries' }, { status: 400 });
    }

    const { error: delErr } = await admin.from('invoices').delete().eq('id', invoiceId);
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });

    try {
      await supabase.from('system_events').insert({
        event_type: 'invoice_hard_deleted',
        message: 'حذف فاتورة نهائياً',
        payload: { invoice_id: invoiceId, actor_id: user.id, actor_email: user.email }
      });
    } catch {}

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'internal_error' }, { status: 500 });
  }
}
