import React from 'react';
import { createClient } from '@/lib/supabase-server';
import { format } from 'date-fns';
import { FileText } from 'lucide-react';
import { cookies } from 'next/headers';
import RoleGate from '@/components/auth/RoleGate';
import InvoiceRowActions from '@/components/invoices/InvoiceRowActions';

export const runtime = 'edge';

export const metadata = {
  title: 'الفواتير',
};

export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
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
  const cookieHotel = cookieStore.get('active_hotel_id')?.value || null;
  const selectedHotelId = (() => {
    if (role === 'admin') return cookieHotel || 'all';
    if (cookieHotel && cookieHotel !== 'all') return cookieHotel;
    if (defaultHotelId) return defaultHotelId;
    return 'all';
  })();
  let selectedHotelName = 'الكل';
  if (selectedHotelId !== 'all') {
    const { data: hRow } = await supabase.from('hotels').select('name').eq('id', selectedHotelId).maybeSingle();
    selectedHotelName = (hRow as any)?.name ? String((hRow as any).name) : '-';
  }

  let query = supabase
    .from('invoices')
    .select(
      `
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
    `
    )
    .order('created_at', { ascending: false });

  if (selectedHotelId !== 'all') {
    query = supabase
      .from('invoices')
      .select(
        `
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
    `
      )
      .eq('booking.hotel_id', selectedHotelId)
      .order('created_at', { ascending: false });
  }

  const { data: invoices, error } = await query;

  if (error) {
    console.error('Error fetching invoices:', error);
    return (
      <div className="p-6 bg-red-50 text-red-800 rounded-lg">
        <h2 className="font-bold mb-2">حدث خطأ أثناء تحميل الفواتير</h2>
        <p className="font-mono text-sm">{error.message}</p>
        <p className="text-sm mt-2">يرجى التحقق من صلاحيات المستخدم أو الاتصال بالدعم الفني.</p>
      </div>
    );
  }

  const safeInvoices = invoices || [];
  const totalInvoices = safeInvoices.length;
  const totalAmount = safeInvoices.reduce(
    (sum: number, inv: any) => sum + (inv.total_amount || 0),
    0
  );
  // Compute paid per invoice by summing payments where payments.invoice_id = invoice.id
  let paidByInvoice: Record<string, number> = {};
  if (safeInvoices.length > 0) {
    const invoiceIds = safeInvoices.map((i: any) => i.id);
    const { data: pays } = await supabase
      .from('payments')
      .select('invoice_id, amount')
      .in('invoice_id', invoiceIds);
    (pays || []).forEach((p: any) => {
      const k = p.invoice_id;
      const amt = Number(p?.amount || 0);
      paidByInvoice[k] = (paidByInvoice[k] || 0) + amt;
    });
  }
  const remainingByInvoice: Record<string, number> = {};
  safeInvoices.forEach((inv: any) => {
    const paid = paidByInvoice[inv.id] || 0;
    const rem = Math.max(0, Number(inv.total_amount || 0) - Number(paid));
    remainingByInvoice[inv.id] = rem;
  });
  const paidAmount = safeInvoices.reduce((sum: number, inv: any) => {
    const paid = Math.min(Number(paidByInvoice[inv.id] || 0), Number(inv.total_amount || 0));
    return sum + paid;
  }, 0);
  const unpaidAmount = safeInvoices.reduce((sum: number, inv: any) => {
    const rem = remainingByInvoice[inv.id] || 0;
    return sum + rem;
  }, 0);

  return (
    <RoleGate allow={['admin', 'manager', 'receptionist', 'accountant']}>
    <div className="space-y-4 sm:space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900">الفواتير</h1>
          <p className="text-xs sm:text-base text-gray-500 mt-0.5 sm:mt-1">إدارة وعرض الفواتير الضريبية</p>
        </div>
        <div className="text-xs sm:text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-2">
          الفندق: {selectedHotelName}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">عدد الفواتير</p>
            <p className="mt-1 text-lg sm:text-2xl font-extrabold text-gray-900">
              {totalInvoices.toLocaleString()}
            </p>
          </div>
          <div className="p-2 sm:p-2.5 rounded-xl bg-purple-50 text-purple-600">
            <FileText size={18} className="sm:hidden" />
            <FileText size={22} className="hidden sm:inline" />
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-4">
          <p className="text-xs text-gray-500">إجمالي قيمة الفواتير</p>
          <p className="mt-1 text-base sm:text-xl font-extrabold text-gray-900">
            {totalAmount.toLocaleString()} <span className="text-sm font-bold">ر.س</span>
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-4">
          <p className="text-xs text-green-700">فواتير مدفوعة</p>
          <p className="mt-1 text-base sm:text-xl font-extrabold text-green-700">
            {paidAmount.toLocaleString()} <span className="text-sm font-bold">ر.س</span>
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-4">
          <p className="text-xs text-yellow-700">فواتير غير مدفوعة</p>
          <p className="mt-1 text-base sm:text-xl font-extrabold text-yellow-700">
            {unpaidAmount.toLocaleString()} <span className="text-sm font-bold">ر.س</span>
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-right min-w-[1000px] text-[11px] sm:text-sm">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">رقم الفاتورة</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">الفندق</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">العميل</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">رقم الحجز</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">التاريخ</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">المبلغ</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">الحالة</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900 text-center whitespace-nowrap">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {safeInvoices.length > 0 ? (
              safeInvoices.map((invoice: any) => (
                <tr
                  key={invoice.id}
                  className="hover:bg-gray-50 transition-colors odd:bg-white even:bg-gray-50"
                >
                  <td className="px-2 py-2 sm:px-6 sm:py-4 font-mono font-medium text-gray-900 whitespace-nowrap">
                    {invoice.invoice_number}
                  </td>
                  <td className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">
                    {invoice.booking?.unit?.hotel?.name || '-'}
                  </td>
                  <td className="px-2 py-2 sm:px-6 sm:py-4 font-medium text-gray-900 whitespace-nowrap">
                    {invoice.customer?.full_name || '-'}
                  </td>
                  <td className="px-2 py-2 sm:px-6 sm:py-4 text-gray-600 font-mono whitespace-nowrap">
                    {invoice.booking?.id ? `#${invoice.booking.id.slice(0, 8).toUpperCase()}` : '-'}
                  </td>
                  <td className="px-2 py-2 sm:px-6 sm:py-4 text-gray-600 whitespace-nowrap">
                    {invoice.invoice_date ? (
                      <>
                        <span className="sm:hidden">{format(new Date(invoice.invoice_date), 'dd/MM')}</span>
                        <span className="hidden sm:inline">{format(new Date(invoice.invoice_date), 'dd/MM/yyyy')}</span>
                      </>
                    ) : '-'}
                  </td>
                  <td className="px-2 py-2 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">
                    {invoice.total_amount?.toLocaleString()} ر.س
                  </td>
                  <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold ${
                      invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
                      invoice.status === 'posted' ? 'bg-yellow-100 text-yellow-800' :
                      invoice.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {invoice.status === 'paid' ? 'مدفوعة' : 
                       invoice.status === 'posted' ? 'غير مدفوعة' : 
                       invoice.status === 'draft' ? 'مسودة' : invoice.status}
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
                <td colSpan={8} className="px-2 sm:px-6 py-10 sm:py-12 text-center text-gray-500">
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
