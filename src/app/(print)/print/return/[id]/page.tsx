import React from 'react';
import { createClient } from '@/lib/supabase-server';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import Logo from '@/components/Logo';
import PrintActions from '../../PrintActions';
import RoleGate from '@/components/auth/RoleGate';

export const runtime = 'edge';

export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
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
  const periodStart = booking?.check_in ? format(new Date(booking.check_in), 'dd/MM/yyyy', { locale: ar }) : null;
const periodEnd = booking?.check_out
  ? format(new Date(new Date(booking.check_out).getTime() - 24 * 60 * 60 * 1000), 'dd/MM/yyyy', { locale: ar })
  : null;  const qrData = `Return:${booking?.id || ''};Customer:${booking?.customer?.full_name || ''};Unit:${booking?.unit?.unit_number || ''};Date:${today}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrData)}`;

  return (
    <RoleGate allow={['admin', 'manager', 'receptionist', 'accountant']}>
      <div dir="rtl" className="bg-gray-100 min-h-screen py-8 print:bg-white print:py-0 print:m-0 print:min-h-0">
        <PrintActions />
        <div className="mx-auto bg-white box-border w-full max-w-[194mm] min-h-[281mm] shadow-lg print:shadow-none p-[8mm] text-[12.5px] leading-relaxed text-gray-900 relative">
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
                <h1 className="text-xl font-extrabold">محضر تسليم وحدة</h1>
                <p className="text-xs text-gray-600">وحدة سكنية مفروشة</p>
              </div>
            </div>
            <div className="text-left space-y-1 text-xs font-semibold">
              <p>
                رقم الحجز:
                <span className="font-mono">{booking?.id?.slice(0, 8)?.toUpperCase()}</span>
              </p>
              <p>تاريخ التحرير: {today}</p>
              {invoiceNumber && <p>رقم الفاتورة: {invoiceNumber}</p>}
             
            </div>
          </div>
        </div>

        <section className="mb-4 grid grid-cols-2 gap-6 border border-gray-300 rounded-lg p-3">
          <div>
            <h2 className="font-bold mb-2 text-sm">المؤجر</h2>
            <p>المالك: شركة مساكن الرفاهية</p>
            <p>الممثل: شركة شموخ الرفاهية للتطوير والاستثمار العقاري</p>
            <p className="text-xs text-gray-700">السجل التجاري: <span className="font-mono font-bold">7037421299</span></p>
          </div>
          <div>
            <h2 className="font-bold mb-2 text-sm">المستأجر</h2>
            <p>الاسم: {booking?.customer?.full_name || '—'}</p>
            <p>الهوية: {booking?.customer?.national_id || '—'}</p>
            <p>الجوال: {booking?.customer?.phone || '—'}</p>
          </div>
        </section>

        <section className="mb-4 border border-gray-300 rounded-lg p-3">
          <h2 className="font-bold mb-2 text-sm">بيانات الوحدة</h2>
          <div className="grid grid-cols-3 gap-3">
            <p>
              رقم الوحدة: <span className="font-mono">{booking?.unit?.unit_number || '—'}</span>
            </p>
            <p>
              الدور: <span className="font-mono">{booking?.unit?.floor || '—'}</span>
            </p>
            <p>الاستخدام: سكني فقط</p>
          </div>
          <p className="mt-2 text-xs text-gray-600">
            النموذج: {booking?.unit?.unit_type?.name || '—'}
            {booking?.unit?.unit_type?.description ? (
              <> — {booking?.unit?.unit_type?.description}</>
            ) : null}
          </p>
        </section>

        <section className="mb-4 border border-gray-900 rounded-lg p-4">
          <h2 className="font-bold mb-3 text-sm">إقرار التسليم</h2>
          <p className="text-[12px] leading-relaxed">
            يقر المستأجر عند إخلاء الوحدة وتسليمها إلى المؤجر بأنها سلمت بحالة سليمة وخالية من الأعطال أو التلف، 
            وبأن جميع الخدمات والأثاث والأجهزة التابعة للوحدة قد أُعيدت كما استلمها، 
            وأنه لا توجد ملاحظات جوهرية تستوجب الإصلاح على المؤجر، ما لم تكن ثابتة بسندات رسمية سابقة. 
            كما يقر المؤجر باستلام الوحدة وفق ذلك، ويحتفظ بحقه الكامل في المطالبة بقيمة الإصلاحات 
            لأي أضرار أو أعطال ناتجة عن سوء استخدام المستأجر، على أن تُسدد بموجب سندات أو فواتير رسمية 
            فور المطالبة ودون تأخير، ويجوز خصمها من التأمين إن كان ذلك متفقًا عليه أو المطالبة بسدادها مباشرة.
          </p>
          <div className="mt-3 text-[11px] text-gray-600">
            تم التسليم في التاريخ: {periodEnd  || today}.
          </div>
        </section>

        <section className="mt-6 grid grid-cols-2 gap-4 text-xs">
         
          <div className="flex items-center gap-4 p-4 border border-gray-300 rounded-xl bg-white">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="font-bold text-gray-900">المستلم </span>
                <span className="font-medium text-gray-800">بانيابة عن شركة شموخ الرفاهية </span>
              </div>
              <div className="mt-3 flex items-end gap-3">
                <div className="w-64 h-10 border-b-2 border-gray-800"></div>
                <span className="text-gray-700">الاسم / التوقيع</span>
              </div>
            </div>
          
          </div>
        </section>

        <div className="mt-4 text-center text-[11px] text-gray-700">
          هذه الوثيقة معمدة إلكترونياً ولا تحتاج إلى ختم
        </div>
        </div>
      </div>
    </RoleGate>
  );
}
