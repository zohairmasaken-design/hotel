import React from 'react';
import { createClient } from '@/lib/supabase-server';
import { format } from 'date-fns';
import { CreditCard, Search, Filter, Calendar, Printer, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import RoleGate from '@/components/auth/RoleGate';
import DeletePaymentButton from './DeletePaymentButton';

export const runtime = 'edge';

export const metadata = {
  title: 'المدفوعات',
};

function isAdvancePayment(payment: any) {
  const description = (payment?.description || '').toString();
  return description.includes('عربون') || description.includes('دفعة مقدمة');
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    method?: string;
    from?: string;
    to?: string;
    type?: string;
    page?: string;
    totals?: string;
  }>;
}) {
  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

  const { q, method, from, to, type, page, totals } = await searchParams;
  const pageSize = 5;
  const pageNum = Math.max(1, Number(page || 1) || 1);
  const fromIndex = (pageNum - 1) * pageSize;
  const toIndex = fromIndex + pageSize - 1;
  const showAllTotals = String(totals || '') === '1';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let isReceptionist = false;
  let role: string | null = null;
  let defaultHotelId: string | null = null;
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role, default_hotel_id').eq('id', user.id).single();
    isReceptionist = profile?.role === 'receptionist';
    role = profile?.role || null;
    defaultHotelId = (profile as any)?.default_hotel_id ? String((profile as any).default_hotel_id) : null;
  }

  const cookieStore = await cookies();
  const cookieHotelRaw = cookieStore.get('active_hotel_id')?.value || null;
  const cookieHotel = cookieHotelRaw ? String(cookieHotelRaw).trim() : null;
  const selectedHotelId = (() => {
    if (role === 'admin') {
      if (!cookieHotel || cookieHotel === 'all') return 'all';
      if (!isUuid(cookieHotel)) return 'all';
      return cookieHotel;
    }
    if (cookieHotel && cookieHotel !== 'all') {
      if (!isUuid(cookieHotel)) return 'all';
      return cookieHotel;
    }
    if (defaultHotelId && isUuid(defaultHotelId)) return defaultHotelId;
    return 'all';
  })();
  let selectedHotelName = 'الكل';
  if (selectedHotelId !== 'all') {
    const { data: hRow } = await supabase.from('hotels').select('name').eq('id', selectedHotelId).maybeSingle();
    selectedHotelName = (hRow as any)?.name ? String((hRow as any).name) : '-';
  }

  const paymentsSelectAll = `
      id,
      customer_id,
      invoice_id,
      payment_method_id,
      amount,
      payment_date,
      description,
      status,
      customer:customers(full_name),
      payment_method:payment_methods(name),
      invoice:invoices(
        invoice_number,
        booking:bookings(
          id,
          hotel_id,
          unit:units(
            unit_number,
            hotel:hotels(id, name)
          )
        )
      )
    `;
  const paymentsSelectHotel = `
      id,
      customer_id,
      invoice_id,
      payment_method_id,
      amount,
      payment_date,
      description,
      status,
      customer:customers(full_name),
      payment_method:payment_methods(name),
      invoice:invoices!inner(
        invoice_number,
        booking:bookings!inner(
          id,
          hotel_id,
          unit:units(
            unit_number,
            hotel:hotels(id, name)
          )
        )
      )
    `;

  let paymentsQuery = supabase
    .from('payments')
    .select(selectedHotelId !== 'all' ? paymentsSelectHotel : paymentsSelectAll, { count: 'exact' })
    .order('payment_date', { ascending: false });
  if (selectedHotelId !== 'all') {
    paymentsQuery = paymentsQuery.eq('invoice.booking.hotel_id', selectedHotelId);
  }

  if (from) {
    paymentsQuery = paymentsQuery.gte('payment_date', from);
  }
  if (to) {
    paymentsQuery = paymentsQuery.lte('payment_date', to);
  }
  if (method && method !== 'all') {
    paymentsQuery = paymentsQuery.eq('payment_method_id', method);
  }
  if (type && type !== 'all') {
    if (type === 'advance') {
      paymentsQuery = paymentsQuery.or('description.ilike.%عربون%,description.ilike.%دفعة مقدمة%');
    } else if (type === 'invoice') {
      paymentsQuery = paymentsQuery.not('invoice_id', 'is', null);
      paymentsQuery = paymentsQuery.not('description', 'ilike', '%عربون%');
      paymentsQuery = paymentsQuery.not('description', 'ilike', '%دفعة مقدمة%');
    }
  }
  if (q && q.trim().length > 0) {
    const query = q.trim();
    paymentsQuery = paymentsQuery.or(
      `id.ilike.%${query}%,description.ilike.%${query}%,customer.full_name.ilike.%${query}%,invoice.invoice_number.ilike.%${query}%`
    );
  }

  const { data: payments, error, count: paymentsCount } = await paymentsQuery.range(fromIndex, toIndex);

  if (error) {
    console.error('Error fetching payments:', {
      message: (error as any)?.message,
      code: (error as any)?.code,
      details: (error as any)?.details,
      hint: (error as any)?.hint,
    });
  }

  let paymentMethodsQuery = supabase
    .from('payment_methods')
    .select('id, name, is_active')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (selectedHotelId !== 'all') {
    paymentMethodsQuery = paymentMethodsQuery.or(`hotel_id.is.null,hotel_id.eq.${selectedHotelId}`);
  }
  const { data: paymentMethods } = await paymentMethodsQuery;

  const safePayments = (payments || []) as any[];
  const safePaymentMethods = (paymentMethods || []) as any[];

  const filteredPayments = safePayments;

  const hasActiveFilters =
    (q && q.trim().length > 0) ||
    (from && from.length > 0) ||
    (to && to.length > 0) ||
    (method && method !== 'all') ||
    (type && type !== 'all');

  const buildQueryString = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const nextQ = patch.q ?? q;
    const nextMethod = patch.method ?? method;
    const nextFrom = patch.from ?? from;
    const nextTo = patch.to ?? to;
    const nextType = patch.type ?? type;
    const nextPage = patch.page ?? String(pageNum);
    const nextTotals = patch.totals ?? totals;

    if (nextQ && nextQ.trim()) params.set('q', nextQ);
    if (nextMethod && nextMethod !== 'all') params.set('method', nextMethod);
    if (nextFrom) params.set('from', nextFrom);
    if (nextTo) params.set('to', nextTo);
    if (nextType && nextType !== 'all') params.set('type', nextType);
    if (nextPage && nextPage !== '1') params.set('page', nextPage);
    if (nextTotals && nextTotals === '1') params.set('totals', '1');
    const qs = params.toString();
    return qs ? `/payments?${qs}` : '/payments';
  };

  const total = Number(paymentsCount || 0);
  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const hasPrev = pageNum > 1;
  const hasNext = paymentsCount != null ? paymentsCount > toIndex + 1 : filteredPayments.length === pageSize;

  const pagesToShow = (() => {
    const maxButtons = 7;
    if (totalPages <= maxButtons) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const win: number[] = [];
    const start = Math.max(2, pageNum - 2);
    const end = Math.min(totalPages - 1, pageNum + 2);
    for (let p = start; p <= end; p++) win.push(p);
    return [1, ...win, totalPages];
  })();

  const fmtInt = (value: number | string) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const money = (value: number | string) =>
    Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const pageTotalAmount = filteredPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const pageInvoiceAmount = filteredPayments.reduce((sum, p) => {
    const isAdvance = isAdvancePayment(p);
    if (!isAdvance && p.invoice_id != null) return sum + Number(p.amount || 0);
    return sum;
  }, 0);
  const pageAdvanceAmount = filteredPayments.reduce((sum, p) => {
    if (isAdvancePayment(p)) return sum + Number(p.amount || 0);
    return sum;
  }, 0);

  let totalAmount = pageTotalAmount;
  let invoiceAmount = pageInvoiceAmount;
  let advanceAmount = pageAdvanceAmount;
  let totalsCount = filteredPayments.length;

  const qTrim = q?.trim() || '';
  const methodUuid = method && method !== 'all' && isUuid(String(method)) ? String(method) : null;

  if (showAllTotals) {
    const { data: totalsRow, error: totalsErr } = await supabase.rpc('get_payments_totals', {
      p_hotel_id: selectedHotelId !== 'all' ? selectedHotelId : null,
      p_from: from || null,
      p_to: to || null,
      p_method_id: methodUuid,
      p_type: type && type !== 'all' ? type : null,
      p_q: qTrim ? qTrim : null,
    });
    if (!totalsErr && totalsRow) {
      const row = Array.isArray(totalsRow) ? totalsRow[0] : totalsRow;
      totalAmount = Number((row as any)?.total_amount || 0);
      invoiceAmount = Number((row as any)?.invoice_amount || 0);
      advanceAmount = Number((row as any)?.advance_amount || 0);
      totalsCount = Number((row as any)?.total_count || 0);
    }
  }

  return (
    <RoleGate allow={['admin', 'manager', 'receptionist', 'accountant']}>
    <div className="space-y-4 sm:space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-emerald-950">المدفوعات</h1>
          <p className="text-xs sm:text-base text-emerald-900/60 mt-0.5 sm:mt-1">سجل جميع سندات القبض والدفعات</p>
        </div>
        <div className="text-xs sm:text-sm font-extrabold text-emerald-950 bg-gradient-to-r from-emerald-50 via-white to-white border border-emerald-200/70 rounded-xl px-3 py-2 shadow-sm">
          الفندق: {selectedHotelName}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-l from-emerald-800 via-emerald-900 to-emerald-950 border border-emerald-900/20 rounded-2xl p-3 sm:p-4 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-xs text-emerald-100/80 font-bold">عدد السجلات</p>
            <p className="mt-1 text-lg sm:text-2xl font-extrabold text-white">
              {fmtInt(showAllTotals ? totalsCount : total)}
            </p>
          </div>
          <div className="p-2 sm:p-2.5 rounded-xl bg-white/10 text-white ring-1 ring-white/15">
            <CreditCard size={18} className="sm:hidden opacity-90" />
            <CreditCard size={22} className="hidden sm:inline opacity-90" />
          </div>
        </div>
        <div className="bg-gradient-to-r from-emerald-50 via-white to-white border border-emerald-200/70 rounded-2xl p-3 sm:p-4 shadow-sm">
          <p className="text-xs text-emerald-900/70 font-bold">إجمالي المدفوعات ({showAllTotals ? 'الكل' : 'هذه الصفحة'})</p>
          <p className="mt-1 text-base sm:text-xl font-extrabold text-emerald-950">
            {money(totalAmount)} <span className="text-sm font-bold">ر.س</span>
          </p>
        </div>
        <div className="bg-gradient-to-r from-emerald-50 via-white to-white border border-emerald-200/70 rounded-2xl p-3 sm:p-4 shadow-sm">
          <p className="text-xs text-emerald-800 font-bold">سداد فواتير ({showAllTotals ? 'الكل' : 'هذه الصفحة'})</p>
          <p className="mt-1 text-base sm:text-xl font-extrabold text-emerald-800">
            {money(invoiceAmount)} <span className="text-sm font-bold">ر.س</span>
          </p>
        </div>
        <div className="bg-gradient-to-r from-emerald-50 via-white to-white border border-emerald-200/70 rounded-2xl p-3 sm:p-4 shadow-sm">
          <p className="text-xs text-amber-800 font-bold">عربون / دفعة مقدمة ({showAllTotals ? 'الكل' : 'هذه الصفحة'})</p>
          <p className="mt-1 text-base sm:text-xl font-extrabold text-amber-800">
            {money(advanceAmount)} <span className="text-sm font-bold">ر.س</span>
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-emerald-100/70 p-3 sm:p-4 space-y-4">
        <form className="flex flex-col md:flex-row gap-4 items-stretch" method="GET">
          <div className="flex-1 relative">
            <Search
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              name="q"
              defaultValue={q || ''}
              placeholder="بحث برقم السند، العميل، الفاتورة أو البيان..."
              className="w-full pr-9 sm:pr-10 pl-3 sm:pl-4 py-2 border border-emerald-200/70 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-[13px] sm:text-sm text-gray-900"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative">
              <Calendar
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="date"
                name="from"
                defaultValue={from || ''}
                className="pl-3 pr-9 sm:pr-10 py-2 border border-emerald-200/70 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-[13px] sm:text-sm text-gray-900"
              />
            </div>
            <div className="relative">
              <Calendar
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="date"
                name="to"
                defaultValue={to || ''}
                className="pl-3 pr-9 sm:pr-10 py-2 border border-emerald-200/70 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-[13px] sm:text-sm text-gray-900"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <select
              name="method"
              defaultValue={method || 'all'}
              className="px-3 py-2 border border-emerald-200/70 rounded-xl bg-white text-[13px] sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="all">كل طرق الدفع</option>
              {safePaymentMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>

            <select
              name="type"
              defaultValue={type || 'all'}
              className="px-3 py-2 border border-emerald-200/70 rounded-xl bg-white text-[13px] sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="all">كل الأنواع</option>
              <option value="invoice">سداد فاتورة</option>
              <option value="advance">سند قبض / دفعة مقدمة</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white text-xs sm:text-sm font-bold hover:from-emerald-800 hover:via-emerald-900 hover:to-emerald-950 shadow-sm"
            >
              <Filter size={16} />
              <span>تطبيق</span>
            </button>

            {hasActiveFilters && (
              <Link
                href="/payments"
                className="text-xs sm:text-sm text-gray-600 hover:text-red-600 underline-offset-4 hover:underline"
              >
                مسح الفلاتر
              </Link>
            )}
          </div>
        </form>

        <div className="text-xs text-emerald-900/60 flex flex-wrap gap-3 font-bold">
          <span>إجمالي السجلات: {fmtInt(total)} | المعروضة: {fmtInt(filteredPayments.length)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs sm:text-sm font-extrabold text-emerald-900/70">
          صفحة {fmtInt(pageNum)} من {fmtInt(totalPages)}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Link
            href={buildQueryString({ totals: showAllTotals ? undefined : '1', page: String(pageNum) })}
            className={`px-3 py-2 rounded-lg border text-xs sm:text-sm font-extrabold transition-colors ${
              showAllTotals
                ? 'bg-white text-emerald-950 border-emerald-200/70 hover:bg-emerald-50'
                : 'bg-gradient-to-r from-emerald-50 via-white to-white text-emerald-950 border-emerald-200/70 hover:bg-emerald-50'
            }`}
          >
            {showAllTotals ? 'إجماليات هذه الصفحة' : 'عرض كل الإجماليات'}
          </Link>
          <Link
            href={buildQueryString({ page: String(pageNum - 1) })}
            aria-disabled={!hasPrev}
            className={`px-3 py-2 rounded-lg border text-xs sm:text-sm font-bold transition-colors ${
              hasPrev
                ? 'bg-gradient-to-r from-emerald-50 via-white to-white text-emerald-950 border-emerald-200/70 hover:bg-emerald-50'
                : 'bg-gray-50 text-gray-400 border-gray-200 pointer-events-none'
            }`}
          >
            السابق
          </Link>
          <div className="flex items-center gap-1">
            {pagesToShow.map((p, idx) => {
              const prev = idx > 0 ? pagesToShow[idx - 1] : null;
              const showGap = prev != null && p - prev > 1;
              return (
                <React.Fragment key={p}>
                  {showGap ? (
                    <span className="px-2 text-xs font-extrabold text-emerald-900/40">…</span>
                  ) : null}
                  <Link
                    href={buildQueryString({ page: String(p) })}
                    aria-current={p === pageNum ? 'page' : undefined}
                    className={`min-w-9 h-9 inline-flex items-center justify-center rounded-lg text-xs sm:text-sm font-extrabold ring-1 transition-colors ${
                      p === pageNum
                        ? 'bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white ring-emerald-700/30'
                        : 'bg-white text-emerald-950 ring-emerald-200/70 hover:bg-emerald-50'
                    }`}
                  >
                    {fmtInt(p)}
                  </Link>
                </React.Fragment>
              );
            })}
          </div>
          <Link
            href={buildQueryString({ page: String(pageNum + 1) })}
            aria-disabled={!hasNext}
            className={`px-3 py-2 rounded-lg border text-xs sm:text-sm font-bold transition-colors ${
              hasNext
                ? 'bg-gradient-to-r from-emerald-700 via-emerald-800 to-emerald-900 text-white border-emerald-900/20 hover:from-emerald-800 hover:via-emerald-900 hover:to-emerald-950 shadow-sm'
                : 'bg-gray-50 text-gray-400 border-gray-200 pointer-events-none'
            }`}
          >
            التالي
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-emerald-100/70 overflow-x-auto">
        <table className="w-full text-right min-w-[1000px] text-[11px] sm:text-sm">
          <thead className="bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 border-b border-emerald-900/20">
            <tr>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">رقم السند</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">الفندق</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50">العميل</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50">الحجز / الفاتورة</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">طريقة الدفع</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">التاريخ</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">المبلغ</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">نوع العملية</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50">البيان</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50 text-center whitespace-nowrap">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-100/60">
            {filteredPayments.length > 0 ? (
              filteredPayments.map((payment: any) => {
                const voucherNumber =
                  payment.id.slice(0, 8).toUpperCase();

                const bookingLabel =
                  payment.invoice?.booking?.id
                    ? `حجز #${payment.invoice.booking.id
                        .slice(0, 8)
                        .toUpperCase()}`
                    : '-';

                const invoiceLabel = payment.invoice?.invoice_number
                  ? `فاتورة ${payment.invoice.invoice_number}`
                  : null;

                const isAdvance = isAdvancePayment(payment);

                const paymentType = isAdvance
                  ? 'عربون / دفعة مقدمة'
                  : payment.invoice_id != null
                  ? 'سداد فاتورة'
                  : 'سند قبض';

                const description = payment.description || '-';

                return (
                  <tr
                    key={payment.id}
                    className="hover:bg-emerald-50/50 transition-colors odd:bg-white even:bg-emerald-50/20"
                  >
                    <td className="px-2 py-2 sm:px-6 sm:py-4 font-mono font-extrabold text-emerald-950 whitespace-nowrap">
                      {voucherNumber}
                    </td>
                    <td className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-950 whitespace-nowrap">
                      {payment.invoice?.booking?.unit?.hotel?.name || '-'}
                    </td>
                    <td className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-emerald-950">
                      {payment.customer?.full_name || '-'}
                    </td>
                    <td className="px-2 py-2 sm:px-6 sm:py-4 text-emerald-900/80">
                      <div>{bookingLabel}</div>
                      {invoiceLabel && (
                        <div className="text-[10px] sm:text-xs text-emerald-900/50 mt-0.5 font-bold">
                          {invoiceLabel}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 sm:px-6 sm:py-4 text-gray-900 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 text-emerald-800 text-[10px] sm:text-xs font-extrabold ring-1 ring-emerald-200/70">
                        <CreditCard size={14} />
                        {payment.payment_method?.name || 'غير محدد'}
                      </span>
                    </td>
                    <td className="px-2 py-2 sm:px-6 sm:py-4 text-emerald-900/70 whitespace-nowrap font-bold">
                      {payment.payment_date ? (
                        <>
                          <span className="sm:hidden">{format(new Date(payment.payment_date), 'dd/MM')}</span>
                          <span className="hidden sm:inline">{format(new Date(payment.payment_date), 'dd/MM/yyyy')}</span>
                        </>
                      ) : '-'}
                    </td>
                    <td className="px-2 py-2 sm:px-6 sm:py-4 font-black text-emerald-950 whitespace-nowrap">
                      {money(payment.amount)} ر.س
                    </td>
                    <td className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-950 whitespace-nowrap">
                      {paymentType}
                    </td>
                    <td className="px-2 py-2 sm:px-6 sm:py-4 text-emerald-900/60 max-w-xs font-bold">
                      {description}
                    </td>
                    <td className="px-2 py-2 sm:px-6 sm:py-4 text-center whitespace-nowrap">
                      <div className="flex justify-center gap-2">
                        {!isReceptionist && (
                          <>
                            <Link
                              href={`/print/receipt/${payment.id}`}
                              target="_blank"
                              className="p-2 text-emerald-900/50 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="طباعة سند القبض"
                            >
                              <Printer size={16} className="sm:hidden" />
                              <Printer size={18} className="hidden sm:inline" />
                            </Link>
                            <DeletePaymentButton paymentId={payment.id} voucherNumber={voucherNumber} />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} className="px-2 sm:px-6 py-10 sm:py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-gray-50 rounded-full text-gray-400">
                      <CreditCard size={24} className="sm:hidden" />
                      <CreditCard size={32} className="hidden sm:inline" />
                    </div>
                    <p className="font-medium text-xs sm:text-sm">لا توجد مدفوعات / سندات قبض مسجلة</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    </RoleGate>
  );
}
