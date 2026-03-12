import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    const docType = String(fd.get('doc_type') || '').trim();
    const unitNumber = String(fd.get('unit_number') || '').trim();
    const customerId = String(fd.get('customer_id') || '').trim();
    const docDate = String(fd.get('doc_date') || '').trim();
    if (!file || !docType || !unitNumber || !customerId) return NextResponse.json({ ok: false }, { status: 400 });
    const ext = file.type === 'application/pdf' ? 'pdf' : 'jpg';
    const fileName = `DOC_${docType}_${unitNumber}_${Date.now()}.${ext}`;
    const path = `${unitNumber}/${fileName}`;
    const { error: uploadError } = await supabase.storage.from('documents').upload(path, file, { contentType: file.type });
    if (uploadError) {
      return NextResponse.json({ 
        ok: false, 
        error: 'upload_failed', 
        message: uploadError.message 
      }, { status: 500 });
    }
    const { data: units } = await supabase
      .from('units')
      .select('id')
      .eq('unit_number', unitNumber)
      .limit(1);
    const unitId = units && units.length > 0 ? units[0].id : null;
    const insertPayload = {
      doc_type: docType,
      unit_id: unitId,
      unit_number: unitNumber,
      customer_id: customerId,
      storage_path: path,
      content_type: file.type,
      doc_date: docDate ? new Date(docDate).toISOString() : new Date().toISOString()
    };
    const { error: insertError } = await supabase.from('documents').insert(insertPayload);
    if (insertError) {
      return NextResponse.json({ 
        ok: false, 
        error: 'insert_failed', 
        message: insertError.message 
      }, { status: 500 });
    }
    const { error: logError } = await supabase.from('system_events').insert({
      event_type: 'document_uploaded',
      message: `Document ${docType} uploaded for unit ${unitNumber}`,
      payload: { path, docType, unitNumber, customerId, docDate }
    });
    const { data: pubUrl } = supabase.storage.from('documents').getPublicUrl(path);
    return NextResponse.json({ ok: true, path, publicUrl: pubUrl?.publicUrl || null, logError: logError?.message || null }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
