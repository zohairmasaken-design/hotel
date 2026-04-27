import React from 'react';
import { createClient } from '@/lib/supabase-server';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import Logo from '@/components/Logo';
import PrintActions from '../../PrintActions';
import ContractSignature from '@/components/ContractSignature';
import DeviceStatusToggle from '@/components/print/DeviceStatusToggle';

export const runtime = 'edge';

const parseDbDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const dt = new Date(str);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

export default async function HandoverPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams?: Promise<{ embed?: string }> }) {
  const { id } = await params;
  const sp = (await searchParams) || {};
  const embed = String((sp as any).embed || '') === '1';
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user ?? null;
  if (!user) {
    return (
      <div dir="rtl" className="bg-white min-h-screen flex items-center justify-center p-6">
        <div className="max-w-lg w-full border border-gray-200 rounded-2xl p-6 text-center">
          <div className="font-black text-gray-900 mb-2">يلزم تسجيل الدخول</div>
          <div className="text-sm text-gray-600">الرجاء تسجيل الدخول لعرض صفحة الطباعة.</div>
        </div>
      </div>
    );
  }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (profile?.role as any) || 'receptionist';
  if (!['admin', 'manager', 'receptionist', 'accountant'].includes(role)) {
    return (
      <div dir="rtl" className="bg-white min-h-screen flex items-center justify-center p-6">
        <div className="max-w-lg w-full border border-gray-200 rounded-2xl p-6 text-center">
          <div className="font-black text-gray-900 mb-2">صلاحيات غير كافية</div>
          <div className="text-sm text-gray-600">لا تملك الصلاحيات لعرض صفحة الطباعة.</div>
        </div>
      </div>
    );
  }
  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      *,
      customer:customers(*),
      unit:units(
        *,
        unit_type:unit_types(*)
      )
    `)
    .eq('id', id)
    .single();
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, invoice_date')
    .eq('booking_id', id)
    .order('created_at', { ascending: false });
  const today = format(new Date(), 'dd/MM/yyyy', { locale: ar });
  const mainInvoice =
    invoices?.find((inv: any) => !inv?.invoice_number?.includes('-EXT-')) ||
    invoices?.[0];
  const invoiceNumber = mainInvoice?.invoice_number;
  const startDateObj = parseDbDate(booking?.check_in);
  const endDateObj = parseDbDate(booking?.check_out);
  const periodStart = startDateObj ? format(startDateObj, 'dd/MM/yyyy', { locale: ar }) : null;
  const periodEnd = endDateObj ? format(endDateObj, 'dd/MM/yyyy', { locale: ar }) : null;
  const qrData = `Handover:${booking?.id || ''};Customer:${booking?.customer?.full_name || ''};Unit:${booking?.unit?.unit_number || ''};Date:${today}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrData)}`;

  // Booking Source
  let bookingSourceLabel: string = '_';
  try {
    const { data: sourceEvent } = await supabase
      .from('system_events')
      .select('payload')
      .eq('booking_id', id)
      .eq('event_type', 'booking_source')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const src = sourceEvent?.payload as any;
    if (src?.booking_source === 'reception') bookingSourceLabel = 'استقبال';
    else if (src?.booking_source === 'platform') bookingSourceLabel = `منصة حجز: ${src?.platform_name || '—'}`;
    else if (src?.booking_source === 'broker') bookingSourceLabel = `وسيط: ${src?.broker_name || '—'}${src?.broker_id ? ` (${src.broker_id})` : ''}`;
  } catch {}

  return (
      <div dir="rtl" className="bg-gray-100 min-h-screen py-8 print:bg-white print:py-0 print:m-0 print:min-h-0">
        {!embed && <PrintActions />}
      <div className="mx-auto bg-white box-border w-full max-w-[194mm] min-h-[281mm] shadow-lg print:shadow-none p-[8mm] print:min-h-0 print:p-[6mm] text-[12.5px] leading-relaxed text-gray-900 relative" style={{ breakInside: 'avoid' }}>
        <style>{`@media print { @page { size: A4; margin: 8mm; } body { -webkit-print-color-adjust: exact; } }`}</style>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none z-0">
            <span className="font-extrabold text-gray-900/6 print:text-gray-900/8 tracking-widest rotate-[45deg] text-[28mm] whitespace-nowrap leading-none">
              مساكن الصفا
            </span>
          </div>

          <div className="border-b-2 border-gray-900 pb-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full border border-gray-300 flex items-center justify-center overflow-hidden">
                  <Logo className="w-12 h-12 object-contain" />
                </div>
                <div>
                  <h1 className="text-xl font-extrabold">محضر استلام وحدة</h1>
                  <p className="text-xs text-gray-600">وحدة سكنية مفروشة</p>
                </div>
              </div>
              <div className="text-left space-y-1 text-xs font-semibold">
                <p>
                  رقم الحجز:
                  <span className="font-mono">{booking?.id?.slice(0, 8)?.toUpperCase()}</span>
                </p>
                <p>تاريخ التحرير: {today}</p>
               
              </div>
            </div>
          </div>

          <section className="mb-3 grid grid-cols-2 gap-4 border border-gray-300 rounded-lg p-2">
            <div>
              <h2 className="font-bold mb-1 text-[12px]">المؤجر</h2>
              <p className="text-[11px]">المالك: شركة مساكن الرفاهية</p>
              <p className="text-[11px]">الممثل: شركة شموخ الرفاهية للتطوير والاستثمار العقاري</p>
              <p className="text-[10px] text-gray-700">السجل التجاري: <span className="font-mono font-bold">7037421299</span></p>
            </div>
            <div>
              <h2 className="font-bold mb-1 text-[12px]">المستأجر</h2>
              <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[11px]">
                <p className="text-gray-600 text-right">الاسم</p>
                <p className="text-center">{booking?.customer?.full_name || '—'}</p>
                <p className="text-gray-600 text-left">Name</p>

                <p className="text-gray-600 text-right">الهوية</p>
                <p className="text-center font-mono">{booking?.customer?.national_id || '—'}</p>
                <p className="text-gray-600 text-left">National ID</p>

                <p className="text-gray-600 text-right">الجوال</p>
                <p className="text-center font-mono" dir="ltr">{booking?.customer?.phone || '—'}</p>
                <p className="text-gray-600 text-left">Mobile</p>
              </div>
            </div>
          </section>

          <section className="mb-3 border border-gray-300 rounded-lg p-2">
            <h2 className="font-bold mb-1 text-[12px]">بيانات الوحدة</h2>
            <p className="text-[11px] text-gray-800">
              رقم الوحدة: <span className="font-mono">{booking?.unit?.unit_number || '—'}</span>
              <span className="mx-2">—</span>
              الدور: <span className="font-mono">{booking?.unit?.floor || '—'}</span>
              <span className="mx-2">—</span>
              النموذج: <span>{booking?.unit?.unit_type?.name || '—'}</span>
            </p>
          </section>

          <section className="mb-3 border border-gray-300 rounded-lg p-3">
            <h2 className="font-bold mb-2 text-sm">الاجهزة عند الاستلام</h2>
            <table className="w-full text-[11px] text-gray-900 border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-gray-300 px-1 py-1 text-right">الجهاز</th>
                  <th className="border border-gray-300 px-1 py-1 text-center">العدد</th>
                  <th className="border border-gray-300 px-1 py-1 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const unitTypeName = String(booking?.unit?.unit_type?.name || '');
                  const has24Split = unitTypeName.includes('غرفتين') && unitTypeName.includes('صاله');
                  const devices: Array<{ name: string; qty: number }> = [
                    { name: 'طباخ كهربائي ريفو (حجري) عينين (2) — موديل 8014', qty: 1 },
                    { name: 'ميكرويف فوجياك 20 لتر (مفتاح أسود) — موديل FJK-M20LDB', qty: 1 },
                    { name: 'مكيف سبليت سوبر كلاسك 18 وحدة — موديل SCSP-18C (شامل التركيب)', qty: 2 },
                    { name: 'ثلاجة جستنهاوس ستيل (بخار) 6.1 قدم — موديل JSRF-3199', qty: 1 },
                    { name: 'غسالة أوتوماتيك سوبر كلاسك 6 كجم فتحة أمامية — موديل SPWM-601', qty: 1 },
                    { name: 'شاشة تلفزيون 50 بوصة', qty: 1 }
                  ];
                  if (has24Split) {
                    devices.push({ name: 'مكيف سبليت سوبر كلاسك 24 وحدة — موديل SCSP-24 (شامل التركيب)', qty: 1 });
                  }
                  return devices.map((device, i) => (
                  <tr key={i} className="h-6">
                    <td className="border border-gray-300 px-1 py-1">{device.name}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{device.qty}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">
                      <DeviceStatusToggle defaultStatus="ok" />
                    </td>
                  </tr>
                  ));
                })()}
              </tbody>
            </table>
            <p className="mt-2 text-[10px] text-gray-600">
              ملاحظة مهمة: تجهيزات الشقة من تأثيث أو أدوات لم تذكر كأجهزة تندرج في التعهد.
            </p>
          </section>

          <section className="mb-3 border border-gray-900 rounded-lg p-4">
            <h2 className="font-bold mb-3 text-sm">إقرار الاستلام</h2>
            <p className="text-[12px] leading-relaxed">
              يقر المستأجر بأنه قد استلم الوحدة السكنية المذكورة أعلاه بكامل خدماتها وتجهيزاتها وأثاثها وأجهزتها 
              بحالة سليمة وصالحة للاستخدام، وأنه اطّلع على مواصفاتها ومحتوياتها وتأكد من مطابقتها لما تم الاتفاق عليه. 
              كما يلتزم بالحفاظ على الوحدة ومرافقها وعدم إساءة استخدامها أو تعريضها لأي ضرر متعمد أو ناتج عن إهمال، 
              ويتحمل المسؤولية الكاملة عن أي أعطال أو أضرار تنشأ بسبب سوء الاستخدام أو مخالفة التعليمات، 
              ويلتزم بسداد قيمة الإصلاحات بموجب سندات رسمية أو فواتير صادرة من إدارة المبنى أو الجهة المختصة، 
              وذلك فور المطالبة ودون تأخير، ولا يحق له الامتناع أو التأخير عن السداد لأي سبب.
            </p>
            <div className="mt-3 text-[11px] text-gray-600">
              تم الاستلام في التاريخ: {periodStart || '—'}، ويسري انتفاعه حتى: {periodEnd || '—'}.
            </div>
          </section>

          <ContractSignature customerName={booking?.customer?.full_name || '—'} />

        </div>
      </div>
  );
}
