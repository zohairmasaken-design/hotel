import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const unit_id = String(body?.unit_id || '').trim();
    if (!unit_id) return NextResponse.json({ ok: false, error: 'missing_unit_id' }, { status: 400 });
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });

    await supabase.from('temporary_reservations').delete().eq('unit_id', unit_id);
  try {
    await supabase.from('system_events').insert({
      event_type: 'temporary_reservation_cancelled',
      unit_id,
      message: 'إلغاء حجز مؤقت للوحدة',
      payload: {
        actor_id: userRes.user.id,
        actor_email: userRes.user.email
      }
    });
  } catch {}

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
