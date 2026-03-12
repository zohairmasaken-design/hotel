import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const unitNumber = String(body?.unit_number || '').trim();
    if (!unitNumber) return NextResponse.json({ customers: [] }, { status: 200 });
    const supabase = await createClient();
    const { data: units } = await supabase
      .from('units')
      .select('id, unit_number')
      .eq('unit_number', unitNumber)
      .limit(1);
    const unitId = units && units.length > 0 ? units[0].id : null;
    if (!unitId) return NextResponse.json({ customers: [] }, { status: 200 });
    const { data } = await supabase
      .from('bookings')
      .select(`
        id,
        status,
        customer:customers(id, full_name)
      `)
      .eq('unit_id', unitId)
      .in('status', ['checked_in', 'confirmed', 'deposit_paid', 'pending_deposit']);
    const active = (data || []);
    const customers = active.map((b: any) => ({ id: b.customer?.id, full_name: b.customer?.full_name })).filter((c: any) => c.id && c.full_name);
    const deduped = Array.from(new Map(customers.map(c => [c.id, c])).values());
    return NextResponse.json({ customers: deduped }, { status: 200 });
  } catch {
    return NextResponse.json({ customers: [] }, { status: 200 });
  }
}
