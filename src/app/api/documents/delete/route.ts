import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const id = String(body?.id || '').trim();
    if (!id) return NextResponse.json({ ok: false, error: 'missing_id' }, { status: 400 });

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user || null;
    if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    const role = profile?.role || null;
    if (!['admin', 'manager'].includes(role)) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    const { data: doc, error: fetchErr } = await supabase
      .from('documents')
      .select('id, storage_path')
      .eq('id', id)
      .single();
    if (fetchErr || !doc) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

    let storageOk = true;
    if (doc.storage_path) {
      const { error: rmErr } = await supabase.storage.from('documents').remove([doc.storage_path]);
      if (rmErr) storageOk = false;
    }

    const { error: delErrAll } = await supabase.from('documents').delete().eq('storage_path', doc.storage_path);
    if (delErrAll) {
      const { error: delErrOne } = await supabase.from('documents').delete().eq('id', id);
      if (delErrOne) return NextResponse.json({ ok: false, error: 'delete_failed', message: delErrOne.message }, { status: 500 });
    }
    const { data: remains } = await supabase
      .from('documents')
      .select('id')
      .eq('storage_path', doc.storage_path);
    const deletedAll = !remains || remains.length === 0;

    try {
      await supabase.from('system_events').insert({
        event_type: 'document_deleted',
        message: 'حذف وثيقة',
        payload: {
          document_id: doc.id,
          storage_path: doc.storage_path,
          deleted_all: deletedAll,
          actor_id: user.id,
          actor_email: user.email
        }
      });
    } catch {}

    return NextResponse.json({ ok: true, storageOk, deletedAll }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
