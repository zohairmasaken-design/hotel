import React from 'react';
import { createClient } from '@/lib/supabase-server';
import { format } from 'date-fns';
import { CreditCard, Search, Filter, Calendar, Printer, Trash2 } from 'lucide-react';
import Link from 'next/link';
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
  }>;
}) {
  const { q, method, from, to, type, page } = await searchParams;
  const pageSize = 50;
  const pageNum = Math.max(1, Number(page || 1) || 1);
  const fromIndex = (pageNum - 1) * pageSize;
  const toIndex = fromIndex + pageSize - 1;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let isReceptionist = false;
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    isReceptionist = profile?.role === 'receptionist';
  }

  let paymentsQuery = supabase
    .from('payments')
    .select(`
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
        booking:bookings(id)
      )
    `, { count: 'exact' })
    .order('payment_date', { ascending: false });

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
    paymentsQuery = paymentsQuery.or(`id.ilike.%${query}%,description.ilike.%${query}%`);
  }

  const { data: payments, error, count: paymentsCount } = await paymentsQuery.range(fromIndex, toIndex);

  if (error) {
    console.error('Error fetching payments:', error);
  }

  const { data: paymentMethods } = await supabase
    .from('payment_methods')
    .select('id, name, is_active')
    .eq('is_active', true)
    .order('name', { ascending: true });

  const safePayments = (payments || []) as any[];
  const safePaymentMethods = (paymentMethods || []) as any[];

  let filteredPayments = safePayments;

  if (q && q.trim().length > 0) {
    const query = q.trim().toLowerCase();
    filteredPayments = filteredPayments.filter((payment) => {
      const values = [
        payment.id,
        payment.customer?.full_name,
        payment.invoice?.invoice_number,
        payment.description,
      ];

      return values.some((value) => {
        if (!value) return false;
        return value.toString().toLowerCase().includes(query);
      });
    });
  }

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

    if (nextQ && nextQ.trim()) params.set('q', nextQ);
    if (nextMethod && nextMethod !== 'all') params.set('method', nextMethod);
    if (nextFrom) params.set('from', nextFrom);
    if (nextTo) params.set('to', nextTo);
    if (nextType && nextType !== 'all') params.set('type', nextType);
    if (nextPage && nextPage !== '1') params.set('page', nextPage);
    const qs = params.toString();
    return qs ? `/payments?${qs}` : '/payments';
  };

  const total = Number(paymentsCount || filteredPayments.length);
  const hasPrev = pageNum > 1;
  const hasNext = paymentsCount != null ? paymentsCount > toIndex + 1 : filteredPayments.length === pageSize;

  return (
    <RoleGate allow={['admin', 'manager', 'receptionist', 'accountant']}>
    <div className="space-y-4 sm:space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900">المدفوعات</h1>
          <p className="text-xs sm:text-base text-gray-500 mt-0.5 sm:mt-1">سجل جميع سندات القبض والدفعات</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3 sm:p-4 space-y-4">
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
              className="w-full pr-9 sm:pr-10 pl-3 sm:pl-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[13px] sm:text-sm text-gray-900"
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
                className="pl-3 pr-9 sm:pr-10 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[13px] sm:text-sm text-gray-900"
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
                className="pl-3 pr-9 sm:pr-10 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[13px] sm:text-sm text-gray-900"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <select
              name="method"
              defaultValue={method || 'all'}
              className="px-3 py-2 border border-gray-200 rounded-xl bg-white text-[13px] sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
              className="px-3 py-2 border border-gray-200 rounded-xl bg-white text-[13px] sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="all">كل الأنواع</option>
              <option value="invoice">سداد فاتورة</option>
              <option value="advance">سند قبض / دفعة مقدمة</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs sm:text-sm font-bold hover:bg-blue-700 shadow-sm"
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

        <div className="text-xs text-gray-500 flex flex-wrap gap-3">
          <span>
            إجمالي السجلات: {total.toLocaleString()} | المعروضة: {filteredPayments.length.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-right min-w-[1000px] text-[11px] sm:text-sm">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">رقم السند</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900">العميل</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900">الحجز / الفاتورة</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">طريقة الدفع</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">التاريخ</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">المبلغ</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">نوع العملية</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900">البيان</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900 text-center whitespace-nowrap">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
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
                    className="hover:bg-gray-50 transition-colors odd:bg-white even:bg-gray-50"
                  >
                    <td className="px-2 py-2 sm:px-6 sm:py-4 font-mono font-medium text-gray-900 whitespace-nowrap">
                      {voucherNumber}
                    </td>
                    <td className="px-2 py-2 sm:px-6 sm:py-4 font-medium text-gray-900">
                      {payment.customer?.full_name || '-'}
                    </td>
                    <td className="px-2 py-2 sm:px-6 sm:py-4 text-gray-700">
                      <div>{bookingLabel}</div>
                      {invoiceLabel && (
                        <div className="text-[10px] sm:text-xs text-gray-500 mt-0.5">
                          {invoiceLabel}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 sm:px-6 sm:py-4 text-gray-900 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-[10px] sm:text-xs font-bold">
                        <CreditCard size={14} />
                        {payment.payment_method?.name || 'غير محدد'}
                      </span>
                    </td>
                    <td className="px-2 py-2 sm:px-6 sm:py-4 text-gray-600 whitespace-nowrap">
                      {payment.payment_date ? (
                        <>
                          <span className="sm:hidden">{format(new Date(payment.payment_date), 'dd/MM')}</span>
                          <span className="hidden sm:inline">{format(new Date(payment.payment_date), 'dd/MM/yyyy')}</span>
                        </>
                      ) : '-'}
                    </td>
                    <td className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">
                      {payment.amount?.toLocaleString()} ر.س
                    </td>
                    <td className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-800 whitespace-nowrap">
                      {paymentType}
                    </td>
                    <td className="px-2 py-2 sm:px-6 sm:py-4 text-gray-500 max-w-xs">
                      {description}
                    </td>
                    <td className="px-2 py-2 sm:px-6 sm:py-4 text-center whitespace-nowrap">
                      <div className="flex justify-center gap-2">
                        {!isReceptionist && (
                          <>
                            <Link
                              href={`/print/receipt/${payment.id}`}
                              target="_blank"
                              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
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
                <td colSpan={9} className="px-2 sm:px-6 py-10 sm:py-12 text-center text-gray-500">
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

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-gray-500">
          الصفحة {pageNum} | عرض {filteredPayments.length.toLocaleString()} من {total.toLocaleString()}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={buildQueryString({ page: String(pageNum - 1) })}
            aria-disabled={!hasPrev}
            className={`px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold border transition-colors ${
              hasPrev ? 'bg-white hover:bg-gray-50 text-gray-800 border-gray-200' : 'bg-gray-50 text-gray-400 border-gray-200 pointer-events-none'
            }`}
          >
            السابق
          </Link>
          <Link
            href={buildQueryString({ page: String(pageNum + 1) })}
            aria-disabled={!hasNext}
            className={`px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold border transition-colors ${
              hasNext ? 'bg-white hover:bg-gray-50 text-gray-800 border-gray-200' : 'bg-gray-50 text-gray-400 border-gray-200 pointer-events-none'
            }`}
          >
            التالي
          </Link>
        </div>
      </div>
    </div>
    </RoleGate>
  );
}
