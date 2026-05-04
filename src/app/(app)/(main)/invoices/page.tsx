import React from 'react';
import { createClient } from '@/lib/supabase-server';
import { format } from 'date-fns';
import { FileText } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import RoleGate from '@/components/auth/RoleGate';
import InvoiceRowActions from '@/components/invoices/InvoiceRowActions';

export const runtime = 'edge';

export const metadata = {
  title: 'الفواتير',
};

export const dynamic = 'force-dynamic';

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; totals?: string }>;
}) {
  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

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

  const sp = (await searchParams) ?? {};
  const pageSize = 5;
  const page = Math.max(1, Number(sp.page || 1) || 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const showAllTotals = String(sp.totals || '') === '1';

  const baseSelect = `
    *,
    customer:customers(full_name),
    booking:bookings(
      id,
      hotel_id,
      unit:units(
        unit_number,
        hotel:hotels(id, name)
      )
    )
  `;

  const filteredSelect = `
    *,
    customer:customers(full_name),
    booking:bookings!inner(
      id,
      hotel_id,
      unit:units(
        unit_number,
        hotel:hotels(id, name)
      )
    )
  `;

  let query = supabase
    .from('invoices')
    .select(baseSelect, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (selectedHotelId !== 'all') {
    query = supabase
      .from('invoices')
      .select(filteredSelect, { count: 'exact' })
      .eq('booking.hotel_id', selectedHotelId)
      .order('created_at', { ascending: false })
      .range(from, to);
  }

  const { data: invoices, error, count } = await query;

  if (error) {
    console.error('Error fetching invoices:', {
      message: (error as any)?.message,
      code: (error as any)?.code,
      details: (error as any)?.details,
      hint: (error as any)?.hint,
    });
    return (
      <div className="p-6 bg-red-50 text-red-800 rounded-lg">
        <h2 className="font-bold mb-2">حدث خطأ أثناء تحميل الفواتير</h2>
        <p className="font-mono text-sm">{(error as any)?.message || 'حدث خطأ غير معروف'}</p>
        <p className="text-sm mt-2">يرجى التحقق من صلاحيات المستخدم أو الاتصال بالدعم الفني.</p>
      </div>
    );
  }

  const safeInvoices = invoices || [];
  const totalInvoices = typeof count === 'number' ? count : safeInvoices.length;
  const totalPages = Math.max(1, Math.ceil(totalInvoices / pageSize));

  const pageTotalAmount = safeInvoices.reduce((sum: number, inv: any) => sum + Number(inv.total_amount || 0), 0);
  const pagePaidAmount = safeInvoices.reduce((sum: number, inv: any) => {
    const total = Number(inv.total_amount || 0);
    const paid = Number(inv.paid_amount || 0);
    return sum + Math.min(total, Math.max(0, paid));
  }, 0);
  const pageUnpaidAmount = safeInvoices.reduce((sum: number, inv: any) => {
    const total = Number(inv.total_amount || 0);
    const paid = Number(inv.paid_amount || 0);
    return sum + Math.max(0, total - Math.max(0, paid));
  }, 0);

  let totalAmount = pageTotalAmount;
  let paidAmount = pagePaidAmount;
  let unpaidAmount = pageUnpaidAmount;
  if (showAllTotals) {
    const { data: totalsRow, error: totalsErr } = await supabase.rpc('get_invoices_totals', {
      p_hotel_id: selectedHotelId !== 'all' ? selectedHotelId : null,
    });
    if (!totalsErr && totalsRow) {
      const row = Array.isArray(totalsRow) ? totalsRow[0] : totalsRow;
      totalAmount = Number((row as any)?.total_amount || 0);
      paidAmount = Number((row as any)?.paid_amount || 0);
      unpaidAmount = Number((row as any)?.unpaid_amount || 0);
    }
  }

  const buildHref = (nextPage: number, totalsFlag = showAllTotals) => {
    const p = Math.max(1, nextPage);
    const q = new URLSearchParams();
    q.set('page', String(p));
    if (totalsFlag) q.set('totals', '1');
    return `/invoices?${q.toString()}`;
  };

  const pagesToShow = (() => {
    const maxButtons = 7;
    if (totalPages <= maxButtons) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const win: number[] = [];
    const start = Math.max(2, page - 2);
    const end = Math.min(totalPages - 1, page + 2);
    for (let p = start; p <= end; p++) win.push(p);
    return [1, ...win, totalPages];
  })();

  const fmtInt = (value: number | string) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const money = (value: number | string) =>
    Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  return (
    <RoleGate allow={['admin', 'manager', 'receptionist', 'accountant']}>
    <div className="space-y-4 sm:space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-emerald-950">الفواتير</h1>
          <p className="text-xs sm:text-base text-emerald-900/60 mt-0.5 sm:mt-1">إدارة وعرض الفواتير الضريبية</p>
        </div>
        <div className="text-xs sm:text-sm font-extrabold text-emerald-950 bg-gradient-to-r from-emerald-50 via-white to-white border border-emerald-200/70 rounded-xl px-3 py-2 shadow-sm">
          الفندق: {selectedHotelName}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-l from-emerald-800 via-emerald-900 to-emerald-950 border border-emerald-900/20 rounded-2xl p-3 sm:p-4 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-xs text-emerald-100/80 font-bold">عدد الفواتير</p>
            <p className="mt-1 text-lg sm:text-2xl font-extrabold text-white">
              {fmtInt(totalInvoices)}
            </p>
          </div>
          <div className="p-2 sm:p-2.5 rounded-xl bg-white/10 text-white ring-1 ring-white/15">
            <FileText size={18} className="sm:hidden opacity-90" />
            <FileText size={22} className="hidden sm:inline opacity-90" />
          </div>
        </div>
        <div className="bg-gradient-to-r from-emerald-50 via-white to-white border border-emerald-200/70 rounded-2xl p-3 sm:p-4 shadow-sm">
          <p className="text-xs text-emerald-900/70 font-bold">إجمالي قيمة الفواتير ({showAllTotals ? 'الكل' : 'هذه الصفحة'})</p>
          <p className="mt-1 text-base sm:text-xl font-extrabold text-emerald-950">
            {money(totalAmount)} <span className="text-sm font-bold">ر.س</span>
          </p>
        </div>
        <div className="bg-gradient-to-r from-emerald-50 via-white to-white border border-emerald-200/70 rounded-2xl p-3 sm:p-4 shadow-sm">
          <p className="text-xs text-emerald-800 font-bold">مدفوع ({showAllTotals ? 'الكل' : 'هذه الصفحة'})</p>
          <p className="mt-1 text-base sm:text-xl font-extrabold text-emerald-800">
            {money(paidAmount)} <span className="text-sm font-bold">ر.س</span>
          </p>
        </div>
        <div className="bg-gradient-to-r from-emerald-50 via-white to-white border border-emerald-200/70 rounded-2xl p-3 sm:p-4 shadow-sm">
          <p className="text-xs text-amber-800 font-bold">غير مدفوع ({showAllTotals ? 'الكل' : 'هذه الصفحة'})</p>
          <p className="mt-1 text-base sm:text-xl font-extrabold text-amber-800">
            {money(unpaidAmount)} <span className="text-sm font-bold">ر.س</span>
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs sm:text-sm font-extrabold text-emerald-900/70">
          صفحة {fmtInt(page)} من {fmtInt(totalPages)}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Link
            href={showAllTotals ? buildHref(page, false) : buildHref(page, true)}
            className={`px-3 py-2 rounded-lg border text-xs sm:text-sm font-extrabold transition-colors ${
              showAllTotals
                ? 'bg-white text-emerald-950 border-emerald-200/70 hover:bg-emerald-50'
                : 'bg-gradient-to-r from-emerald-50 via-white to-white text-emerald-950 border-emerald-200/70 hover:bg-emerald-50'
            }`}
          >
            {showAllTotals ? 'إجماليات هذه الصفحة' : 'عرض كل الإجماليات'}
          </Link>
          <Link
            href={buildHref(page - 1)}
            aria-disabled={page <= 1 ? true : undefined}
            className={`px-3 py-2 rounded-lg border text-xs sm:text-sm font-bold transition-colors ${
              page <= 1 ? 'bg-gray-50 text-gray-400 border-gray-200 pointer-events-none' : 'bg-gradient-to-r from-emerald-50 via-white to-white text-emerald-950 border-emerald-200/70 hover:bg-emerald-50'
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
                    href={buildHref(p)}
                    aria-current={p === page ? 'page' : undefined}
                    className={`min-w-9 h-9 inline-flex items-center justify-center rounded-lg text-xs sm:text-sm font-extrabold ring-1 transition-colors ${
                      p === page
                        ? 'bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white ring-emerald-700/30'
                        : 'bg-white text-emerald-950 ring-emerald-200/70 hover:bg-emerald-50'
                    }`}
                  >
                    {p}
                  </Link>
                </React.Fragment>
              );
            })}
          </div>
          <Link
            href={buildHref(page + 1)}
            aria-disabled={page >= totalPages ? true : undefined}
            className={`px-3 py-2 rounded-lg border text-xs sm:text-sm font-bold transition-colors ${
              page >= totalPages ? 'bg-gray-50 text-gray-400 border-gray-200 pointer-events-none' : 'bg-gradient-to-r from-emerald-700 via-emerald-800 to-emerald-900 text-white border-emerald-900/20 hover:from-emerald-800 hover:via-emerald-900 hover:to-emerald-950 shadow-sm'
            }`}
          >
            التالي
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-emerald-100/70 overflow-hidden overflow-x-auto">
        <table className="w-full text-right min-w-[1200px] text-[11px] sm:text-sm">
          <thead className="bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 border-b border-emerald-900/20">
            <tr>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">رقم الفاتورة</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">الفندق</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">العميل</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">رقم الحجز</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">التاريخ</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">الإجمالي</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">المدفوع</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">المتبقي</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">الحالة</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-50 text-center whitespace-nowrap">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-100/60">
            {safeInvoices.length > 0 ? (
              safeInvoices.map((invoice: any) => (
                <tr
                  key={invoice.id}
                  className="hover:bg-emerald-50/50 transition-colors odd:bg-white even:bg-emerald-50/20"
                >
                  <td className="px-2 py-2 sm:px-6 sm:py-4 font-mono font-extrabold text-emerald-950 whitespace-nowrap">
                    {invoice.invoice_number}
                  </td>
                  <td className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-950 whitespace-nowrap">
                    {invoice.booking?.unit?.hotel?.name || '-'}
                  </td>
                  <td className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-emerald-950 whitespace-nowrap">
                    {invoice.customer?.full_name || '-'}
                  </td>
                  <td className="px-2 py-2 sm:px-6 sm:py-4 text-emerald-900/70 font-mono whitespace-nowrap">
                    {invoice.booking?.id ? `#${invoice.booking.id.slice(0, 8).toUpperCase()}` : '-'}
                  </td>
                  <td className="px-2 py-2 sm:px-6 sm:py-4 text-emerald-900/70 whitespace-nowrap">
                    {invoice.invoice_date ? (
                      <>
                        <span className="sm:hidden">{format(new Date(invoice.invoice_date), 'dd/MM')}</span>
                        <span className="hidden sm:inline">{format(new Date(invoice.invoice_date), 'dd/MM/yyyy')}</span>
                      </>
                    ) : '-'}
                  </td>
                  {(() => {
                    const total = Number(invoice.total_amount || 0);
                    const paid = Math.min(total, Math.max(0, Number(invoice.paid_amount || 0)));
                    const remaining = Math.max(0, total - paid);
                    return (
                      <>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 font-black text-emerald-950 whitespace-nowrap">
                          {money(total)} ر.س
                        </td>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-emerald-800 whitespace-nowrap">
                          {money(paid)} ر.س
                        </td>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 font-extrabold text-amber-800 whitespace-nowrap">
                          {money(remaining)} ر.س
                        </td>
                      </>
                    );
                  })()}
                  <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-extrabold ring-1 ${
                        invoice.status === 'paid'
                          ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                          : invoice.status === 'posted'
                            ? 'bg-amber-50 text-amber-900 ring-amber-200'
                            : invoice.status === 'draft'
                              ? 'bg-gray-50 text-gray-800 ring-gray-200'
                              : 'bg-rose-50 text-rose-800 ring-rose-200'
                      }`}
                    >
                      {invoice.status === 'paid'
                        ? 'مدفوعة'
                        : invoice.status === 'posted'
                          ? 'غير مدفوعة'
                          : invoice.status === 'draft'
                            ? 'مسودة'
                            : String(invoice.status || '-')}
                    </span>
                  </td>
                  <td className="px-2 py-2 sm:px-6 sm:py-4 text-center whitespace-nowrap">
                    <InvoiceRowActions
                      invoiceId={invoice.id}
                      invoiceNumber={invoice.invoice_number}
                      status={invoice.status}
                      canPrint={!isReceptionist}
                      canHardDelete={role === 'admin'}
                    />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} className="px-2 sm:px-6 py-10 sm:py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-gray-50 rounded-full text-gray-400">
                      <FileText size={24} className="sm:hidden" />
                      <FileText size={32} className="hidden sm:inline" />
                    </div>
                    <p className="font-medium text-xs sm:text-sm">لا توجد فواتير حتى الآن</p>
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
