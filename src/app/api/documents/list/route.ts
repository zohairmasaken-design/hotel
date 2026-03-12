import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const docType = body?.doc_type || null;
    const unitNumber = body?.unit_number || null;
    const customerId = body?.customer_id || null;
    const dateFrom = body?.date_from || null;
    const dateTo = body?.date_to || null;
    const query = String(body?.query || '').trim();

    let q = supabase
      .from('documents')
      .select(`
        id,
        doc_type,
        unit_id,
        unit_number,
        customer_id,
        storage_path,
        content_type,
        doc_date,
        uploaded_at,
        customer:customers(id, full_name)
      `)
      .order('uploaded_at', { ascending: false })
      .limit(100);

    if (docType) q = q.eq('doc_type', docType);
    if (unitNumber) q = q.eq('unit_number', unitNumber);
    if (customerId) q = q.eq('customer_id', customerId);
    if (dateFrom) q = q.gte('doc_date', dateFrom);
    if (dateTo) q = q.lte('doc_date', dateTo);
    if (query) q = q.or(`unit_number.ilike.%${query}%,storage_path.ilike.%${query}%`);

    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const dedupMap = new Map<string, any>();
    for (const d of (data || [])) {
      const key = d.storage_path || d.id;
      if (!dedupMap.has(key)) dedupMap.set(key, d);
    }
    const result = Array.from(dedupMap.values()).map((d: any) => {
      const { data: pub } = supabase.storage.from('documents').getPublicUrl(d.storage_path);
      return {
        ...d,
        public_url: pub?.publicUrl || null
      };
    });

    return NextResponse.json({ ok: true, documents: result }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
