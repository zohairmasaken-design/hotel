import React from 'react';
import { createClient } from '@/lib/supabase-server';
import { format, differenceInMonths, differenceInCalendarDays, addDays, parseISO } from 'date-fns';
import { notFound } from 'next/navigation';
import PrintActions from '../../PrintActions';
import Logo from '@/components/Logo';

export const runtime = 'edge';

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams?: Promise<{ mode?: string, print?: string }> }) {
  const { id } = await params;
  const qs = searchParams ? await searchParams : {};
  const embed = String((qs as any).embed || '') === '1';
  const mode = 'a4';
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

  let invoice: any = null;
  let booking: any = null;

  // 1. Try to fetch Invoice
  const { data: foundInvoice } = await supabase
    .from('invoices')
    .select(`
      *,
      booking:bookings(
        *,
        customer:customers(*),
        unit:units(
          *,
          unit_type:unit_types(
            *,
            hotel:hotels(*)
          )
        )
      )
    `)
    .eq('id', id)
    .single();

  if (foundInvoice) {
    invoice = foundInvoice;
    booking = foundInvoice.booking;
  } else {
    // 2. Fallback: Fetch Booking directly (Preview Mode)
    const { data: foundBooking } = await supabase
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
      .eq('id', id)
      .single();
    
    booking = foundBooking;
  }

  if (!booking) {
    return notFound();
  }

  // Determine displayed values (set after resolving current invoice)
  let invoiceNumber: string = '';
  const issueDateStr = invoice?.invoice_date || invoice?.created_at || booking.created_at;
  const issueDate = new Date(issueDateStr);

  // Fetch related invoices for the booking and payments for the main invoice
  const supInvoicesRes = await supabase
    .from('invoices')
    .select('id, invoice_number, status, subtotal, discount_amount, additional_services_amount, tax_amount, total_amount, created_at')
    .eq('booking_id', booking.id)
    .order('created_at', { ascending: false });
  const bookingInvoices = supInvoicesRes.data || [];
  // supabase query already returns newest first; pick أول فاتورة غير ملغاة (أحدث)
  const mainInvoice =
    bookingInvoices.find((inv: any) => inv.status !== 'void') ||
    bookingInvoices[0] ||
    null;
  const currentInvoice = invoice || mainInvoice;
  invoiceNumber = (currentInvoice?.invoice_number || invoice?.invoice_number || booking.id.slice(0, 8).toUpperCase());

  let extensionSupplyPeriod: { start: string; end: string } | null = null;
  if (currentInvoice?.id) {
    try {
      const { data: extEvt } = await supabase
        .from('system_events')
        .select('payload')
        .eq('event_type', 'booking_extension_invoice_period')
        .eq('booking_id', booking.id)
        .order('created_at', { ascending: false })
        .limit(25);
      const match = (extEvt || []).find((e: any) => (e?.payload as any)?.invoice_id === currentInvoice.id) as any;
      const payload = match?.payload as any;
      const ps = payload?.period_start;
      const pe = payload?.period_end;
      if (typeof ps === 'string' && typeof pe === 'string' && ps.length >= 10 && pe.length >= 10) {
        extensionSupplyPeriod = { start: ps, end: pe };
      }
    } catch {}
  }
  
  // Fetch booking source meta (from system_events)
  let bookingSourceLabel: string = '_';
  try {
    const { data: sourceEvent } = await supabase
      .from('system_events')
      .select('payload')
      .eq('booking_id', booking.id)
      .eq('event_type', 'booking_source')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const src = sourceEvent?.payload as any;
    if (src?.booking_source === 'reception') bookingSourceLabel = 'استقبال';
    else if (src?.booking_source === 'platform') bookingSourceLabel = `منصة حجز: ${src?.platform_name || '—'}`;
    else if (src?.booking_source === 'broker') bookingSourceLabel = `وسيط: ${src?.broker_name || '—'}${src?.broker_id ? ` (${src.broker_id})` : ''}`;
  } catch {}
  let payments: any[] = [];
  if (currentInvoice?.id) {
    const payRes = await supabase
      .from('payments')
      .select('id, amount, payment_date, invoice_id, journal_entry_id')
      .eq('invoice_id', currentInvoice.id)
      .order('payment_date', { ascending: true });
    payments = payRes.data || [];
  }
  // Also include booking-linked advance/receipt payments via journal entries referenced by booking or its invoices
  const referenceIds: string[] = [booking.id];
  if (bookingInvoices.length > 0) {
    bookingInvoices.forEach((inv: any) => referenceIds.push(inv.id));
    const invoiceIds = bookingInvoices.map((inv: any) => inv.id);
    // Include payments tied to any invoice of this booking (even if not linked to journal entries)
    const { data: invPaysDetails } = await supabase
      .from('payments')
      .select('id, amount, payment_date, invoice_id, journal_entry_id')
      .in('invoice_id', invoiceIds);
    if (invPaysDetails && invPaysDetails.length > 0) {
      const existingIds = new Set(payments.map(p => p.id));
      const extraInvoicePays = invPaysDetails.filter(p => !existingIds.has(p.id));
      payments = [...payments, ...extraInvoicePays];
      // Track their ids to check for linked journal entries as well
      extraInvoicePays.forEach((p: any) => referenceIds.push(p.id));
    }
  }
  const { data: refTxns } = await supabase
    .from('journal_entries')
    .select('id, reference_id')
    .in('reference_id', referenceIds);
  const txnIds = (refTxns || []).map((t: any) => t.id);
  if (txnIds.length > 0) {
    const { data: txnLinkedPays } = await supabase
      .from('payments')
      .select('id, amount, payment_date, invoice_id, journal_entry_id')
      .in('journal_entry_id', txnIds)
      .order('payment_date', { ascending: true });
    if (txnLinkedPays && txnLinkedPays.length > 0) {
      const existingIds = new Set(payments.map(p => p.id));
      const extras = txnLinkedPays.filter(p => !existingIds.has(p.id));
      payments = [...payments, ...extras];
    }
  }
  let jeMap: Record<string, { id: string, voucher_number?: string, entry_date?: string, description?: string, transaction_type?: string, reference_id?: string }> = {};
  const jeIds = Array.from(new Set(payments.map((p: any) => p.journal_entry_id).filter(Boolean)));
  if (jeIds.length > 0) {
    const { data: jeDetails } = await supabase
      .from('journal_entries')
      .select('id, voucher_number, entry_date, description, transaction_type, reference_id')
      .in('id', jeIds);
    (jeDetails || []).forEach((j: any) => {
      jeMap[j.id] = j;
    });
  }
  const startDate = new Date(booking.check_in);
  const endDate = new Date(booking.check_out);
  const displayEndDate = endDate;
  const isDailyBooking = booking.booking_type !== 'yearly';
  const supplyDate = issueDate;
  const supplyStartAt = extensionSupplyPeriod ? parseISO(extensionSupplyPeriod.start) : new Date(startDate);
  supplyStartAt.setHours(14, 0, 0, 0);
  const supplyEndAt = extensionSupplyPeriod ? parseISO(extensionSupplyPeriod.end) : new Date(displayEndDate);
  supplyEndAt.setHours(14, 0, 0, 0);
  const rawSubtotal = currentInvoice?.subtotal ?? booking.subtotal ?? 0;
  const additionalServices = (booking.additional_services as any[]) || [];
  const additionalServicesTotal =
    currentInvoice?.additional_services_amount != null
      ? Number(currentInvoice.additional_services_amount) || 0
      : additionalServices.reduce((acc: number, s: any) => acc + (s?.amount || 0), 0);
  const discountAmount = currentInvoice?.discount_amount ?? booking.discount_amount ?? 0;
  const roomBaseAmount = rawSubtotal;
  const netSubtotal = Math.max(0, Math.round((rawSubtotal - discountAmount + additionalServicesTotal) * 100) / 100);
  const taxRate = 0;
  const taxAmount = 0;
  const total = netSubtotal;
  // NOTE: لا نستخدم دفعات تركيبية هنا؛ سيتم حساب المدفوع فعليًا أدناه

  // Paid and remaining computations (STRICT by payments.invoice_id only)
  const directInvoicePayments = payments.filter((p: any) => !!(currentInvoice?.id && p.invoice_id === currentInvoice.id));
  const paidFinal = directInvoicePayments.reduce((sum: number, p: any) => sum + Number(p?.amount || 0), 0);
  const remainingFinal = Math.max(0, Math.round((Number(total) - Number(paidFinal)) * 100) / 100);
  
  // Hotel Info (Supplier)
  const normalizeName = (s: string) => {
    if (!s) return s;
    let r = s;
    r = r.replace(/فندق\s*الصفا/gi, 'مساكن الصفا');
    r = r.replace(/مساكن\s*الصفا/gi, 'مساكن الصفا');
    return r;
  };
  const hotelRaw = booking.unit?.unit_type?.hotel || {
    name: 'مساكن الصفى',
    address: 'المملكة العربية السعودية',
    phone: '0538159915',
    cr_number: '7037421299'
  };
  const hotel = { ...hotelRaw, name: normalizeName(hotelRaw?.name) };
  const crNumber = hotel?.cr_number || '7037421299';

  const formatArabicDuration = (q: number, unit: 'day' | 'month' | 'year') => {
    if (unit === 'day') {
      if (q === 1) return 'يوم واحد';
      if (q === 2) return 'يومان اثنين';
      if (q >= 3 && q <= 10) return `${q} أيام`;
      return `${q} يوم`;
    }
    if (unit === 'month') {
      if (q === 0.25) return 'ربع شهر';
      if (q === 0.5) return 'نصف شهر';
      if (q === 1) return 'شهر واحد';
      if (q === 2) return 'شهرين اثنين';
      if (q >= 3 && q <= 10) return `${q} أشهر`;
      if (q === 1.5) return 'شهر ونصف';
      if (q === 2.5) return 'شهرين ونصف';
      return `${q} شهر`;
    }
    if (unit === 'year') {
      if (q === 0.25) return 'ربع سنة';
      if (q === 0.5) return 'نصف سنة';
      if (q === 1) return 'سنة واحدة';
      if (q === 1.5) return 'سنة ونصف';
      if (q === 2) return 'سنتين اثنتين';
      if (q === 2.5) return 'سنتين ونصف';
      if (q >= 3 && q <= 10) return `${q} سنوات`;
      return `${q} سنة`;
    }
    return q.toString();
  };

  const start = new Date(booking.check_in);
  const end = new Date(booking.check_out);
  const monthsTotal = Math.max(0, differenceInMonths(end, start));
  const daysTotal = Math.max(0, differenceInCalendarDays(end, start));
  const isExactYears = monthsTotal >= 12 && monthsTotal % 12 === 0;

  let qty = 0;
  let unitLabel: 'day' | 'month' | 'year' = 'day';
  if (isExactYears) {
    unitLabel = 'year';
    qty = monthsTotal / 12;
  } else if (monthsTotal >= 1) {
    unitLabel = 'month';
    qty = monthsTotal;
  } else {
    unitLabel = 'day';
    qty = daysTotal;
  }
  const safeQty = qty > 0 ? qty : 1;
  const effectiveUnitPrice = Math.round((Number(roomBaseAmount || 0) / safeQty) * 100) / 100;
  const bookingTypeAr =
    booking.booking_type === 'yearly'
      ? 'حجز سنوي'
      : booking.booking_type === 'monthly'
      ? 'حجز شهري'
      : 'حجز يومي';
  const bookingTypeEn =
    booking.booking_type === 'yearly'
      ? 'Annual booking'
      : booking.booking_type === 'monthly'
      ? 'Monthly booking'
      : 'Daily booking';

  return (
    <div dir="rtl" className="bg-gray-100 min-h-screen py-8 print:bg-white print:py-0 print:m-0 print:min-h-0">
      <style>{`
        @media print { 
          @page { 
            size: A4; 
            margin: 0; /* Important: This removes browser header/footer (URLs, titles) */
          } 
          body { 
            -webkit-print-color-adjust: exact; 
            margin: 0;
            padding: 10mm; /* Add margin manually to the content instead of the page */
          } 
        }
        .num{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;direction:ltr;unicode-bidi:bidi-override;font-variant-numeric:tabular-nums}
        .cur-rtl{direction:rtl;unicode-bidi:bidi-override}
        .soft-panel{background-color:rgba(252, 252, 252, 0.06);border-color:rgba(127, 241, 99, 0.35)}
        .soft-header{background-color:rgba(18, 148, 6, 0.12);color:#1e1b4b}
      `}</style>
      <div className="mx-auto bg-white box-border w-full max-w-[194mm] min-h-[281mm] shadow-lg print:shadow-none p-[8mm] print:p-[8mm] text-[12.5px] leading-relaxed text-gray-900 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none z-0">
          <span className="font-extrabold text-gray-900/6 print:text-gray-900/8 tracking-widest rotate-[45deg] text-[28mm] whitespace-nowrap leading-none">
            مساكن الصفا
          </span>
        </div>
        {/* Header */}
        <div className="border-b-2 border-gray-900 pb-4 mb-4 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full border border-gray-300 flex items-center justify-center overflow-hidden">
                <Logo className="w-12 h-12 object-contain" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold">فاتورة</h1>
                <p className="text-xs text-gray-600">حجز إقامة</p>
              </div>
            </div>
            <div className="text-left space-y-1 text-xs font-semibold">
              <p className="font-semibold text-gray-900">
                رقم الفاتورة:{' '}
                <span className="font-mono num">{invoiceNumber}</span>
              </p>
              <p className="font-semibold text-gray-900">
                تاريخ الإصدار:{' '}
                <span className="num text-[11px]">{format(issueDate, 'dd/MM/yyyy HH:mm')}</span>
              </p>
              {booking?.id && (
                <p>
                  رقم الحجز:{' '}
                  <span className="font-mono num">#{booking.id.slice(0, 8).toUpperCase()}</span>
                </p>
              )}
              <p>
                السجل التجاري:{' '}
                <span className="font-mono num font-bold">{crNumber}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Meta boxes */}
        <section className="mb-4 grid grid-cols-2 gap-6 border-0">
          <div className="border rounded-lg p-3 space-y-2 soft-panel">
            <h3 className="font-bold text-sm">بيانات الفاتورة</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <p className="text-gray-900 font-bold">
                <span className="block">التوريد</span>
                <span className="block text-[10px] text-gray-500">Supply</span>
              </p>
              <div className="text-[11px] font-semibold space-y-0.5">
                <div className="num">{format(supplyDate, 'dd/MM/yyyy')}</div>
                <div className="num">2pm {format(supplyStartAt, 'dd/MM/yyyy')}</div>
                <div className="num">2pm {format(supplyEndAt, 'dd/MM/yyyy')}</div>
              </div>
              <p className="text-gray-900 font-bold">
                <span className="block">الوحدة</span>
                <span className="block text-[10px] text-gray-500">Unit</span>
              </p>
              <p>رقم <span className="num">{booking.unit?.unit_number || '—'}</span> — {booking.unit?.unit_type?.name || '—'}</p>
              <p className="text-gray-900 font-bold">
                <span className="block">المصدر</span>
                <span className="block text-[10px] text-gray-500">Source</span>
              </p>
              <p>{bookingSourceLabel}</p>
            </div>
          </div>
          <div className="border rounded-lg p-3 space-y-2 soft-panel">
            <h3 className="font-bold text-sm">بيانات العميل</h3>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
              <p className="text-gray-600 text-right">الاسم</p>
              <p className="text-center">{booking.customer?.full_name || '—'}</p>
              <p className="text-gray-600 text-left">Name</p>

              <p className="text-gray-600 text-right">الجوال</p>
              <p className="text-center font-mono" dir="ltr">{booking.customer?.phone || '—'}</p>
              <p className="text-gray-600 text-left">Mobile</p>

              <p className="text-gray-600 text-right">الهوية</p>
              <p className="text-center font-mono">{booking.customer?.national_id || '—'}</p>
              <p className="text-gray-600 text-left">National ID</p>
            </div>
          </div>
        </section>

        {/* Items */}
        <section className="mb-4 border border-gray-300 rounded-lg overflow-hidden soft-panel">
          <table className="w-full text-xs">
            <thead className="soft-header">
              <tr className="text-right">
                <th className="py-2 px-3 w-1/2 font-bold">
                  <div className="leading-tight">
                    <div>الوصف</div>
                    <div className="text-[10px] text-gray-600">Description</div>
                  </div>
                </th>
                <th className="py-2 px-3 text-center font-bold">
                  <div className="leading-tight text-center">
                    <div>الكمية</div>
                    <div className="text-[10px] text-gray-600">Quantity</div>
                  </div>
                </th>
                <th className="py-2 px-3 text-center font-bold">
                  <div className="leading-tight text-center">
                    <div>سعر الوحدة</div>
                    <div className="text-[10px] text-gray-600">Unit Price</div>
                  </div>
                </th>
                <th className="py-2 px-3 text-center font-bold">
                  <div className="leading-tight text-center">
                    <div>المجموع</div>
                    <div className="text-[10px] text-gray-600">Total</div>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr>
                <td className="py-2 px-3 align-top">
                  <div className="font-bold text-gray-900">إقامة  - {booking.unit?.unit_type?.name}</div>
                  <div className="text-[11px] text-gray-600">Hotel accommodation - {booking.unit?.unit_type?.name}</div>
                  <div className="text-[11px] text-gray-600 mt-1">
                    وحدة رقم <span className="num">{booking.unit?.unit_number}</span> ({bookingTypeAr})
                  </div>
                  <div className="text-[11px] text-gray-500">
                    Unit No. <span className="num">{booking.unit?.unit_number}</span> ({bookingTypeEn})
                  </div>
                  {discountAmount > 0 && (
                    <div className="text-[11px] text-red-600 mt-1">
                      يشمل خصم بقيمة <span className="cur-rtl mr-1">ر.س</span> <span className="font-mono num">{discountAmount.toLocaleString('en-US')}</span>
                      <span className="text-gray-500"> — Discount included</span>
                    </div>
                  )}
                </td>
                <td className="py-2.5 px-3 text-center">
                  <div className="font-bold text-gray-900">{formatArabicDuration(qty, unitLabel)}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{unitLabel === 'year' ? 'سنة' : unitLabel === 'month' ? 'شهر' : 'يوم'} / {unitLabel === 'year' ? 'Year' : unitLabel === 'month' ? 'Month' : 'Day'}</div>
                </td>
                <td className="py-2.5 px-3 text-center font-mono num">
                  <span className="cur-rtl mr-1">ر.س</span> {effectiveUnitPrice.toLocaleString('en-US')}
                </td>
                <td className="py-2.5 px-3 text-center font-mono num font-bold">
                  <span className="cur-rtl mr-1">ر.س</span> {Number(roomBaseAmount || 0).toLocaleString('en-US')}
                </td>
              </tr>
              {additionalServices.map((service: any, index: number) => (
                <tr key={`service-${index}`}>
                  <td className="py-2 px-3 align-top">
                    <div className="font-medium text-gray-900">
                      {service.name || 'خدمة إضافية'}
                      <div className="text-[11px] text-gray-600">Additional service</div>
                    </div>
                    {service.description && (
                      <div className="text-[11px] text-gray-600 mt-1">
                        {service.description}
                        <span className="text-[10px] text-gray-500 block">Description</span>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono num">
                    {service.quantity || 1}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono num">
                    <span className="cur-rtl mr-1">ر.س</span> {(service.amount || 0).toLocaleString('en-US')}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono num font-bold">
                    <span className="cur-rtl mr-1">ر.س</span> {(service.amount || 0).toLocaleString('en-US')}
                  </td>
                </tr>
              ))}
              {discountAmount > 0 && (
                <tr>
                  <td className="py-2 px-3 align-top">
                    <div className="font-medium text-gray-900">
                      خصم على الحجز
                      <div className="text-[11px] text-gray-600">Booking discount</div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono num">1</td>
                  <td className="py-2.5 px-3 text-center font-mono num"><span className="cur-rtl mr-1">ر.س</span> -{discountAmount.toLocaleString('en-US')}</td>
                  <td className="py-2.5 px-3 text-center font-mono num font-bold text-red-600"><span className="cur-rtl mr-1">ر.س</span> -{discountAmount.toLocaleString('en-US')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Totals */}
        <section className="mb-4">
          <div className="rounded-lg p-3 space-y-2 soft-panel border">
            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded p-2">
              <span className="text-indigo-900 font-extrabold">
                <span className="block">الإجمالي بعد الخصم</span>
                <span className="block text-[10px] text-gray-600">Net subtotal</span>
              </span>
              <span className="font-mono num text-2xl font-extrabold text-indigo-900"><span className="cur-rtl mr-1">ر.س</span> {netSubtotal.toLocaleString('en-US')}</span>
            </div>
            <div className="border-t border-gray-300 pt-2 space-y-2">
              {(Number(discountAmount || 0) > 0 || Number(additionalServicesTotal || 0) > 0) && (
                <div className="space-y-1">
                  {Number(additionalServicesTotal || 0) > 0 && (
                    <div className="flex items-center justify-between text-gray-700">
                      <span className="text-[11px]">
                        <span className="block">إضافات</span>
                        <span className="block text-[10px] text-gray-500">Additions</span>
                      </span>
                      <span className="font-mono num font-bold"><span className="cur-rtl mr-1">ر.س</span> {Number(additionalServicesTotal || 0).toLocaleString('en-US')}</span>
                    </div>
                  )}
                  {Number(discountAmount || 0) > 0 && (
                    <div className="flex items-center justify-between text-red-700">
                      <span className="text-[11px]">
                        <span className="block">الخصم</span>
                        <span className="block text-[10px] text-gray-500">Discount</span>
                      </span>
                      <span className="font-mono num font-bold"><span className="cur-rtl mr-1">ر.س</span> -{Number(discountAmount || 0).toLocaleString('en-US')}</span>
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-gray-800">
                  <span className="block">المدفوع </span>
                  <span className="block text-[10px] text-gray-500">Paid </span>
                </span>
                <span className="font-mono num font-bold"><span className="cur-rtl mr-1">ر.س</span> {paidFinal.toLocaleString('en-US')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-800">
                  <span className="block">المتبقي</span>
                  <span className="block text-[10px] text-gray-500">Remaining</span>
                </span>
                <span className="font-mono num font-bold"><span className="cur-rtl mr-1">ر.س</span> {remainingFinal.toLocaleString('en-US')}</span>
              </div>
            </div>
          </div>
        </section>

        

        {/* Simplified Status Only */}
      

        <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700">
          <p className="font-medium text-gray-900">بيان رسمي</p>
          <p>تصدر هذه الفاتورة عن شركة شموخ الرفاهية  – مساكن الصفا وفق الأنظمة المرعية، وتُعتمد كمستند مالي رسمي لدى المنشأة.</p>
          <p>تلتزم المنشأة بمعايير ضيافة وجودة رفيعة، ويعد هذا المستند مرجعاً لمستحقات الإقامة والخدمات الإضافية إن وجدت.</p>
        </div>

        <div className="mt-6 flex justify-between items-start">
          <div className="text-xs text-gray-600">
            <p>المنشأة: {hotel.name}</p>
            {hotel.address && <p className="mt-0.5">{hotel.address}</p>}
            <p className="mt-0.5">
              السجل التجاري: <span className="font-mono font-bold">{crNumber}</span>
            </p>
          </div>
          <div className="text-xs text-gray-600">
            <div className="border p-1 rounded">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(JSON.stringify({
                  invoice: invoiceNumber,
                  national_id: booking.customer?.national_id || '-',
                  room: booking.unit?.unit_number || '-',
                  date: format(new Date(), 'dd/MM/yyyy HH:mm')
                }))}`}
                alt="Invoice QR"
                className="w-24 h-24"
              />
            </div>
            <div className="text-[10px] text-gray-600 text-center mt-1">بيانات الفاتورة</div>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t border-gray-100 text-[9px] text-gray-400 flex justify-between items-center italic">
          <div className="flex gap-4">
            <span>نظام مساكن فندقية - فاتورة إلكترونية آلي</span>
            <span>بصمة الجهاز: {typeof window !== 'undefined' ? window.navigator.userAgent.slice(0, 45) : 'System Print'}</span>
          </div>
          <div>
            تاريخ الطباعة: {format(new Date(), 'dd/MM/yyyy HH:mm')}
          </div>
        </div>

        {!embed && <PrintActions />}
      </div>
    </div>
  );
}
