import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const unit_id = String(body?.unit_id || '').trim();
    const status = String(body?.status || '').trim();
    if (!unit_id || !status) return NextResponse.json({ ok: false, error: 'missing_params' }, { status: 400 });
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });

    if (status !== 'reserved') {
      const { error: updErr } = await supabase.from('units').update({ status }).eq('id', unit_id);
      if (updErr) {
        return NextResponse.json({ ok: false, error: 'update_failed', message: updErr.message }, { status: 500 });
      }
      try {
        await supabase.from('system_events').insert({
          event_type: 'unit_status_changed',
          unit_id,
          message: `تغيير حالة الوحدة إلى ${status}`,
          payload: {
            status,
            actor_id: userRes.user.id,
            actor_email: userRes.user.email
          }
        });
      } catch {}
    }

    if (status === 'reserved') {
      const name = String(body?.customer_name || '').trim();
      const phone = String(body?.phone || '').trim();
      const reserve_date = String(body?.reserve_date || '').trim();
      const notes = String(body?.notes || '');
      if (!name || !reserve_date) return NextResponse.json({ ok: false, error: 'missing_reservation_data' }, { status: 400 });
      const { error: insErr } = await supabase.from('temporary_reservations').insert({
        unit_id,
        customer_name: name,
        phone,
        reserve_date,
        notes
      });
      if (insErr) return NextResponse.json({ ok: false, error: 'reservation_insert_failed', message: insErr.message }, { status: 500 });
      try {
        await supabase.from('system_events').insert({
          event_type: 'temporary_reservation_created',
          unit_id,
          message: `حجز مؤقت للوحدة`,
          payload: {
            customer_name: name,
            phone,
            reserve_date,
            actor_id: userRes.user.id,
            actor_email: userRes.user.email
          }
        });
      } catch {}
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
