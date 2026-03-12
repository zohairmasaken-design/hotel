import React from 'react';
import { createClient } from '@/lib/supabase-server';
import { format } from 'date-fns';
import { notFound } from 'next/navigation';
import PrintActions from '../../PrintActions';
import Logo from '@/components/Logo';
import RoleGate from '@/components/auth/RoleGate';

export const runtime = 'edge';

function toArabicWords(n: number): string {
  const units = ['صفر','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة','عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'];
  const tens = ['','عشرة','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
  const hundreds = ['','مئة','مئتان','ثلاثمئة','أربعمئة','خمسمئة','ستمئة','سبعمئة','ثمانمئة','تسعمئة'];
  const seg = (x: number): string => {
    if (x === 0) return '';
    if (x < 20) return units[x];
    if (x < 100) {
      const t = Math.floor(x / 10);
      const r = x % 10;
      return r ? `${units[r]} و ${tens[t]}` : tens[t];
    }
    const h = Math.floor(x / 100);
    const r = x % 100;
    const hword = hundreds[h];
    const rword = seg(r);
    return r ? `${rword} و ${hword}` : hword;
  };
  const scale = (part: number, singular: string, dual: string, plural: string): string => {
    if (part === 0) return '';
    if (part === 1) return singular;
    if (part === 2) return dual;
    if (part >= 3 && part <= 10) return `${seg(part)} ${plural}`;
    return `${seg(part)} ${singular}`;
  };
  const b = Math.floor(n / 1_000_000_000);
  const m = Math.floor((n % 1_000_000_000) / 1_000_000);
  const th = Math.floor((n % 1_000_000) / 1000);
  const h = n % 1000;
  const parts = [scale(b, 'مليار', 'ملياران', 'مليارات'), scale(m, 'مليون', 'مليونان', 'ملايين'), scale(th, 'ألف', 'ألفان', 'آلاف'), seg(h)].filter(Boolean);
  if (parts.length === 0) return units[0];
  return parts.join(' و ');
}

export default async function InsuranceVoucherPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: ev } = await supabase
    .from('system_events')
    .select('*')
    .eq('id', id)
    .eq('event_type', 'insurance_voucher')
    .single();

  if (!ev) return notFound();

  const payload = (ev as any)?.payload || {};
  const voucherType = payload.voucher_type as 'deposit_receipt' | 'deposit_refund' | 'deposit_to_damage_income' | 'deposit_to_expense_offset';
  const amount = Number(payload.amount) || 0;
  const voucherDate = payload.voucher_date ? new Date(payload.voucher_date) : new Date(ev.created_at);
  const createdAt = new Date(ev.created_at);
  const bookingId = ev.booking_id;

  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      *,
      customer:customers(*),
      unit:units(
        *,
        unit_type:unit_types(
          *,
          hotel:hotels(*)
        )
      )
    `)
    .eq('id', bookingId)
    .single();

  if (!booking) return notFound();

  let paymentMethodName: string | null = null;
  if (payload.payment_method_id) {
    const { data: pm } = await supabase
      .from('payment_methods')
      .select('name')
      .eq('id', payload.payment_method_id)
      .single();
    paymentMethodName = pm?.name || null;
  }

  const normalizeName = (s: string) => {
    if (!s) return s;
    let r = s;
    r = r.replace(/فندق\s*الصفا/gi, 'مساكن الصفا');
    r = r.replace(/مساكن\s*الصفا/gi, 'مساكن الصفا');
    return r;
  };

  const hotelRaw =
    booking?.unit?.unit_type?.hotel || ({
      name: 'مساكن الصفى',
      address: 'المملكة العربية السعودية',
      phone: '0538159915',
      cr_number: '7073421299'
    } as any);
  const hotel = { ...hotelRaw, name: normalizeName((hotelRaw as any)?.name) };

  const debitCredit = (() => {
    if (voucherType === 'deposit_receipt') {
      return {
        debit: `1100 الصندوق/البنوك${paymentMethodName ? ` — ${paymentMethodName}` : ''}`,
        credit: `2100 تأمينات مستلمة من العملاء`
      };
    }
    if (voucherType === 'deposit_refund') {
      return {
        debit: `2100 تأمينات مستلمة من العملاء`,
        credit: `1100 الصندوق/البنوك${paymentMethodName ? ` — ${paymentMethodName}` : ''}`
      };
    }
    if (voucherType === 'deposit_to_damage_income') {
      return {
        debit: `2100 تأمينات مستلمة من العملاء`,
        credit: `5110 عوائد تلفيات عملاء`
      };
    }
    return {
      debit: `2100 تأمينات مستلمة من العملاء`,
      credit: `6110 صيانة وإصلاحات`
    };
  })();

  const title = voucherType === 'deposit_receipt'
    ? 'سند قبض تأمين'
    : voucherType === 'deposit_refund'
    ? 'سند صرف تأمين'
    : voucherType === 'deposit_to_damage_income'
    ? 'سند استخدام التأمين كتلفيات'
    : 'سند استخدام التأمين لمقاصة مصروف';

  const englishTitle = voucherType === 'deposit_receipt'
    ? 'INSURANCE RECEIPT'
    : voucherType === 'deposit_refund'
    ? 'INSURANCE DISBURSEMENT'
    : voucherType === 'deposit_to_damage_income'
    ? 'INSURANCE TO DAMAGE INCOME'
    : 'INSURANCE TO EXPENSE OFFSET';

  const voucherNumber = String(ev.id).slice(0, 8).toUpperCase();
  const bookingNumberShort = String(bookingId || '').slice(0, 8).toUpperCase();
  const amountWords = (() => {
    const integerAmount = Math.floor(amount);
    const fraction = Math.round((amount - integerAmount) * 100);
    return `${toArabicWords(integerAmount)} ريال سعودي${fraction ? ` و ${toArabicWords(fraction)} هللة` : ''}`;
  })();

  const qrData = `VID:${voucherNumber};BID:${bookingId};TYPE:${voucherType};DATE:${format(voucherDate, 'dd/MM/yyyy')};AMT:${amount}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrData)}`;

  return (
    <RoleGate allow={['admin','manager']}>
    <div
      className="max-w-3xl mx-auto p-4 sm:p-8 bg-white min-h-screen relative print:max-w-none print:p-4 print:m-0 print:min-h-0 print:shadow-none"
      dir="rtl"
    >
      <PrintActions />
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] flex items-center justify-center overflow-hidden">
        <div className="text-[170px] font-bold rotate-45 transform text-black whitespace-nowrap">
          {hotel.name}
        </div>
      </div>

      <div className="relative z-10">
        <div className="flex flex-col sm:flex-row justify-between items-start border-b-4 border-gray-900 pb-6 mb-8 gap-4">
          <div className="flex items-center w-full sm:w-auto gap-4">
            <div className="w-20 h-20 bg-gray-900 print-dark-bg flex items-center justify-center rounded-lg shadow-sm overflow-hidden">
              <Logo onDark className="w-16 h-16 object-contain" alt="Logo" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{hotel.name}</h2>
              <p className="text-sm text-gray-800 mt-1 max-w-[260px]">
                {hotel.address}
              </p>
              <p className="text-sm text-gray-800 mt-1">
                السجل التجاري:{' '}
                <span className="font-mono font-bold text-gray-900">
                  {hotel.cr_number || '7037421299'}
                </span>
              </p>
            </div>
          </div>

          <div className="text-left flex flex-col items-end w-full sm:w-auto">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-1 tracking-wider">
              {title}
            </h1>
            <p className="text-gray-900 font-bold text-base mb-4 tracking-widest">
              {englishTitle}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
          <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
            <h3 className="text-gray-900 font-bold border-b border-gray-300 pb-2 mb-4 flex justify-between">
              <span>بيانات السند</span>
              <span className="text-xs text-gray-800 pt-1">Voucher Details</span>
            </h3>
            <div className="space-y-3 text-sm text-gray-800">
              <div className="flex justify-between items-center">
                <span>رقم السند:</span>
                <span className="font-mono font-bold text-base">
                  {voucherNumber}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>رقم الحجز:</span>
                <span className="font-mono font-bold text-base">
                  {bookingNumberShort}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>تاريخ السند:</span>
                <span className="font-mono">
                  {format(voucherDate, 'dd/MM/yyyy')}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>تاريخ التحرير:</span>
                <span className="font-mono">
                  {format(createdAt, 'dd/MM/yyyy')}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>نوع العملية:</span>
                <span className="font-bold">
                  {title}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
            <h3 className="text-gray-900 font-bold border-b border-gray-300 pb-2 mb-4 flex justify-between">
              <span>بيانات العميل</span>
              <span className="text-xs text-gray-800 pt-1">Customer Details</span>
            </h3>
            <div className="space-y-3 text-sm text-gray-800">
              <div className="flex justify-between items-center">
                <span>الاسم:</span>
                <span className="font-bold">
                  {booking.customer?.full_name || '-'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>رقم الهاتف:</span>
                <span className="font-mono" dir="ltr">
                  {booking.customer?.phone || '-'}
                </span>
              </div>
              {booking.customer?.national_id && (
                <div className="flex justify-between items-center">
                  <span>رقم الهوية:</span>
                  <span className="font-mono">
                    {booking.customer.national_id}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span>طريقة الدفع:</span>
                <span className="font-bold">
                  {paymentMethodName || (voucherType === 'deposit_receipt' || voucherType === 'deposit_refund' ? 'الصندوق/البنوك' : '—')}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8 border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="py-3 px-4 text-right font-bold">
                  البيان
                  <span className="block text-xs font-normal opacity-75 mt-1">
                    Description
                  </span>
                </th>
                <th className="py-3 px-4 text-center font-bold w-40">
                  المبلغ
                  <span className="block text-xs font-normal opacity-75 mt-1">
                    Amount
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-200">
                <td className="py-4 px-4 align-top text-sm text-gray-900">
                  <div className="font-medium">
                    {payload.description || title}
                  </div>
                  <div className="text-xs text-gray-700 mt-1">
                    {voucherType === 'deposit_receipt'
                      ? 'تم استلام مبلغ تأمين من العميل وسيُحفظ كتأمينات مستلمة.'
                      : voucherType === 'deposit_refund'
                      ? 'تم صرف مبلغ التأمين للعميل وفق البيانات المرفقة.'
                      : voucherType === 'deposit_to_damage_income'
                      ? 'تم استخدام التأمين كتلفيات لصالح المنشأة.'
                      : 'تم استخدام التأمين لمقاصة مصروف صيانة.'}
                  </div>
                </td>
                <td className="py-4 px-4 text-center font-mono font-extrabold text-lg text-gray-900">
                  {amount.toLocaleString()} ر.س
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="text-xs text-gray-800 mb-2">
          المبلغ كتابة: <span className="font-bold">{amountWords}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-10 text-sm text-gray-800">
          <div>
            <div className="font-bold mb-2">المستلم</div>
            <div className="h-16 border border-dashed border-gray-400 rounded-lg" />
          </div>
          <div>
            <div className="font-bold mb-2">المحاسب</div>
            <div className="h-16 border border-dashed border-gray-400 rounded-lg" />
          </div>
          <div className="flex flex-col items-end">
            <img src={qrSrc} alt="QR" className="w-24 h-24 border border-gray-300 rounded-md" />
            <div className="text-xs text-gray-600 mt-2">رمز تحقق السند</div>
          </div>
        </div>
      </div>
    </div>
    </RoleGate>
  );
}
