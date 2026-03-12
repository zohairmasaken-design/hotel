import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'edge';

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const { data: myProfile, error: roleErr } = await supabase
      .from('profiles')
      .select('role, email')
      .eq('id', user.id)
      .maybeSingle();
    if (roleErr) {
      return NextResponse.json({ ok: false, error: roleErr.message }, { status: 500 });
    }
    if (!myProfile || myProfile.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    // Resolve target user id from dynamic param (await Promise) or fallback to URL parsing
    let targetUserId: string | undefined;
    try {
      const { id } = await ctx.params;
      targetUserId = id;
    } catch {}
    if (!targetUserId) {
      try {
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/').filter(Boolean);
        const last = pathParts[pathParts.length - 1];
        if (last && last !== 'users') targetUserId = last;
        if (!targetUserId) {
          const q = url.searchParams.get('id');
          if (q) targetUserId = q;
        }
      } catch {}
    }
    if (!targetUserId) {
      return NextResponse.json({ ok: false, error: 'missing_user_id' }, { status: 400 });
    }
    // Prevent deleting self
    if (targetUserId === user.id) {
      return NextResponse.json({ ok: false, error: 'cannot_delete_self' }, { status: 400 });
    }

    // Determine mode (hard|soft)
    let mode: 'hard' | 'soft' = 'hard';
    try {
      const url = new URL(req.url);
      const m = (url.searchParams.get('mode') || '').toLowerCase();
      if (m === 'soft') mode = 'soft';
    } catch {}

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if ((!supabaseUrl || !serviceKey) && mode === 'hard') {
      // If service role not configured and no soft mode requested, instruct client
      return NextResponse.json({ ok: false, error: 'missing_service_role', hint: 'configure_service_role_or_use_soft' }, { status: 409 });
    }

    if (mode === 'hard') {
      const admin = createSupabaseClient(supabaseUrl, serviceKey);
      const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId);
      if (delErr) {
        return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
      }
      // profiles row will be removed via ON DELETE CASCADE
      return NextResponse.json({ ok: true, mode }, { status: 200 });
    } else {
      // Soft delete fallback: remove profile and log an event (auth user remains)
      const { error: profErr } = await supabase.from('profiles').delete().eq('id', targetUserId);
      if (profErr) {
        return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 });
      }
      try {
        await supabase.from('system_events').insert({
          event_type: 'user_soft_deleted',
          message: 'تعطيل مستخدم داخل النظام (حذف ملف التعريف فقط)',
          payload: { target_user_id: targetUserId, actor_id: user.id, actor_email: user.email }
        });
      } catch {}
      return NextResponse.json({ ok: true, mode }, { status: 200 });
    }

  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'internal_error' }, { status: 500 });
  }
}
