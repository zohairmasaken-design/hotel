import React from 'react';
import { createClient } from '@/lib/supabase-server';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import Link from 'next/link';
import { Eye, Printer, FileText, Calendar, User, Home, Filter, Layers } from 'lucide-react';
import BookingQuickView from '@/components/bookings/BookingQuickView';
import ConfirmBookingButton from '@/components/bookings/ConfirmBookingButton';
import RoleGate from '@/components/auth/RoleGate';

export const runtime = 'edge';

export const metadata = {
  title: 'سجل الحجوزات',
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'مبدئي', color: 'bg-yellow-50 text-yellow-900' },
  pending_deposit: { label: 'بانتظار العربون', color: 'bg-yellow-100 text-yellow-900' },
  confirmed: { label: 'مؤكد', color: 'bg-green-100 text-green-900' },
  checked_in: { label: 'تم الدخول', color: 'bg-blue-100 text-blue-900' },
  checked_out: { label: 'تم الخروج', color: 'bg-gray-100 text-gray-900' },
  cancelled: { label: 'ملغي', color: 'bg-red-100 text-red-900' },
};

export default async function BookingsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; page?: string }>;
}) {
  const supabase = await createClient();
  const { status, type, page } = await searchParams;
  const pageSize = 50;
  const pageNum = Math.max(1, Number(page || 1) || 1);
  const fromIndex = (pageNum - 1) * pageSize;
  const toIndex = fromIndex + pageSize;

  // Fetch individual bookings
  let query = supabase
    .from('bookings')
    .select(`
      id,
      created_at,
      status,
      booking_type,
      check_in,
      check_out,
      total_price,
      customer:customers(full_name, phone),
      unit:units(unit_number, unit_type:unit_types(name))
    `)
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }
  if (type && type !== 'all') {
    query = query.eq('booking_type', type);
  }

  const { data: bookingsRaw, error } = await query.range(fromIndex, toIndex);

  if (error) {
    return <div className="text-red-500">حدث خطأ أثناء جلب البيانات: {error.message}</div>;
  }

  // Fetch group bookings (show alongside)
  let groupQuery = supabase
    .from('group_bookings')
    .select(`
      id, check_in, check_out, status, total_amount, created_at,
      customer:customers(full_name, phone),
      booking_type
    `)
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    groupQuery = groupQuery.eq('status', status);
  }
  if (type && type !== 'all') {
    groupQuery = groupQuery.eq('booking_type', type);
  }

  let { data: groupBookingsRaw, error: groupError } = await groupQuery.range(fromIndex, toIndex);
  // Fallback if booking_type column not present
  if (groupError && String(groupError.message || '').toLowerCase().includes('booking_type')) {
    let fallbackQuery = supabase
      .from('group_bookings')
      .select(`
        id, check_in, check_out, status, total_amount, created_at,
        customer:customers(full_name, phone)
      `)
      .order('created_at', { ascending: false });
    if (status && status !== 'all') {
      fallbackQuery = fallbackQuery.eq('status', status);
    }
    const { data: gb2, error: ge2 } = await fallbackQuery.range(fromIndex, toIndex);
    if (!ge2) {
      groupBookingsRaw = (gb2 || []).map((g: any) => ({ ...g, booking_type: undefined }));
      groupError = null;
    }
  }

  const bookings = (bookingsRaw || []) as any[];
  const groupBookings = (groupBookingsRaw || []) as any[];

  // Build unified rows
  const combinedRows = [
    ...(bookings || []).map((b: any) => ({
      id: b.id,
      isGroup: false,
      created_at: b.created_at,
      customer: b.customer,
      unit: b.unit,
      check_in: b.check_in,
      check_out: b.check_out,
      booking_type: b.booking_type,
      status: b.status,
      amount: b.total_price
    })),
    ...((groupBookings || []).map((g: any) => ({
      id: g.id,
      isGroup: true,
      created_at: g.created_at,
      customer: g.customer,
      unitCount: 0,
      check_in: g.check_in,
      check_out: g.check_out,
      booking_type: g.booking_type || 'group',
      status: g.status,
      amount: g.total_amount
    })))
  ].sort((a, b) => (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));

  const hasPrev = pageNum > 1;
  const hasNext = combinedRows.length > pageSize;
  const rows = combinedRows.slice(0, pageSize);

  // Compute unit counts only for the group bookings shown on this page
  let groupUnitCounts: Record<string, number> = {};
  const groupIdsOnPage = rows.filter((r: any) => r.isGroup).map((r: any) => r.id);
  if (groupIdsOnPage.length > 0) {
    const { data: unitRows } = await supabase
      .from('group_booking_units')
      .select('group_booking_id')
      .in('group_booking_id', groupIdsOnPage);
    if (unitRows) {
      for (const row of unitRows as Array<{ group_booking_id: string }>) {
        groupUnitCounts[row.group_booking_id] = (groupUnitCounts[row.group_booking_id] || 0) + 1;
      }
    }
  }

  const rowsWithCounts = rows.map((r: any) => (r.isGroup ? { ...r, unitCount: groupUnitCounts[r.id] || 0 } : r));

  const buildQueryString = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const nextStatus = patch.status ?? status;
    const nextType = patch.type ?? type;
    const nextPage = patch.page ?? String(pageNum);
    if (nextStatus && nextStatus !== 'all') params.set('status', nextStatus);
    if (nextType && nextType !== 'all') params.set('type', nextType);
    if (nextPage && nextPage !== '1') params.set('page', nextPage);
    const qs = params.toString();
    return qs ? `/bookings-list?${qs}` : '/bookings-list';
  };

  const FilterButton = ({ value, label }: { value: string, label: string }) => {
    const isActive = (status === value) || (!status && value === 'all');
    return (
      <Link
        href={buildQueryString({ status: value === 'all' ? 'all' : value, page: '1' })}
        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
          isActive
            ? 'bg-blue-600 text-white shadow-sm'
            : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
        }`}
      >
        {label}
      </Link>
    );
  };

  const TypeFilterButton = ({ value, label }: { value: string, label: string }) => {
    const isActive = (type === value) || (!type && value === 'all');
    return (
      <Link
        href={buildQueryString({ type: value === 'all' ? 'all' : value, page: '1' })}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
          isActive
            ? 'bg-purple-600 text-white shadow-sm'
            : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <RoleGate allow={['admin', 'manager', 'receptionist', 'accountant']}>
      <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">سجل الحجوزات</h1>
          <p className="text-gray-500 mt-1">عرض وإدارة جميع الحجوزات المسجلة في النظام</p>
        </div>
        <div className="flex gap-2">
          <Link 
            href="/bookings" 
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2"
          >
            <Calendar size={18} />
            حجز جديد
          </Link>
          <div 
            aria-disabled
            title="غير متاح حالياً"
            className="bg-violet-600 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2 opacity-50 cursor-not-allowed"
          >
            <Layers size={18} />
            حجز متعدد
          </div>
        </div>
      </div>

      {/* Status Filters */}
      <div className="flex flex-wrap gap-2">
        <FilterButton value="all" label="الكل" />
        <FilterButton value="pending_deposit" label="بانتظار العربون" />
        <FilterButton value="confirmed" label="مؤكد" />
        <FilterButton value="checked_in" label="تم الدخول" />
        <FilterButton value="checked_out" label="تم الخروج" />
        <FilterButton value="cancelled" label="ملغي" />
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 font-medium">نوع الحجز:</span>
        <TypeFilterButton value="all" label="الكل" />
        <TypeFilterButton value="daily" label="يومي" />
        <TypeFilterButton value="yearly" label="سنوي" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-100 border-b border-gray-200 text-gray-900 font-bold">
              <tr>
                <th className="px-6 py-4">رقم الحجز</th>
                <th className="px-6 py-4">العميل</th>
                <th className="px-6 py-4">الوحدة/الوحدات</th>
                <th className="px-6 py-4">تاريخ الوصول</th>
                <th className="px-6 py-4">تاريخ المغادرة</th>
                <th className="px-6 py-4">النوع</th>
                <th className="px-6 py-4">الحالة</th>
                <th className="px-6 py-4">المبلغ</th>
                <th className="px-6 py-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rowsWithCounts.map((row: any) => {
                const statusInfo = STATUS_MAP[row.status] || { label: row.status, color: 'bg-gray-100 text-gray-900' };
                const typeLabel = row.isGroup ? 'متعدد' : (row.booking_type === 'yearly' ? 'سنوي' : row.booking_type === 'daily' ? 'يومي' : 'ليلي');
                return (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors odd:bg-white even:bg-gray-50">
                    <td className="px-6 py-4 font-mono font-bold text-gray-900">
                      <span className={row.isGroup ? 'text-violet-700' : ''}>
                        #{row.id.slice(0, 8).toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-900">{row.customer?.full_name || 'غير معروف'}</div>
                      <div className="text-xs text-gray-500 font-mono" dir="ltr">{row.customer?.phone}</div>
                    </td>
                    <td className="px-6 py-4">
                      {row.isGroup ? (
                        <div className="flex items-center gap-2">
                          <Layers size={14} className="text-violet-500" />
                          <span className="font-medium text-gray-900">حجز متعدد</span>
                          <span className="text-xs text-gray-500">({row.unitCount || 0} وحدة)</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Home size={14} className="text-gray-400" />
                          <span className="font-medium text-gray-900">{row.unit?.unit_number}</span>
                          <span className="text-gray-500 text-xs">({row.unit?.unit_type?.name})</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {format(new Date(row.check_in), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {format(new Date(row.check_out), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${row.isGroup ? 'bg-violet-100 text-violet-900' : 'bg-purple-100 text-purple-900'}`}>
                        {typeLabel}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-900">
                      {Number(row.amount || 0).toLocaleString()} ر.س
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        {row.isGroup ? (
                          <Link
                            href={`/group-bookings/${row.id}`}
                            className="p-1.5 text-gray-500 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                            title="عرض الحجز الجماعي"
                          >
                            <Eye size={18} />
                          </Link>
                        ) : (
                          <>
                            <BookingQuickView id={row.id} />
                            {row.status !== 'confirmed' && (
                              <ConfirmBookingButton id={row.id} />
                            )}
                            <Link 
                                href={`/print/invoice/${row.id}`}
                                target="_blank"
                                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="الفاتورة"
                            >
                                <FileText size={18} />
                            </Link>
                            <Link 
                                href={`/print/contract/${row.id}`}
                                target="_blank"
                                className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                title="العقد"
                            >
                                <Printer size={18} />
                            </Link>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(rows.length === 0) && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500 font-medium">
                    لا توجد حجوزات مسجلة {status && status !== 'all' ? 'بهذه الحالة' : 'حالياً'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-gray-500">
          الصفحة {pageNum} | عرض {rows.length.toLocaleString()} {hasNext ? ' (يوجد المزيد)' : ''}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={buildQueryString({ page: String(pageNum - 1) })}
            aria-disabled={!hasPrev}
            className={`px-3 py-2 rounded-lg text-sm font-bold border transition-colors ${
              hasPrev ? 'bg-white hover:bg-gray-50 text-gray-800 border-gray-200' : 'bg-gray-50 text-gray-400 border-gray-200 pointer-events-none'
            }`}
          >
            السابق
          </Link>
          <Link
            href={buildQueryString({ page: String(pageNum + 1) })}
            aria-disabled={!hasNext}
            className={`px-3 py-2 rounded-lg text-sm font-bold border transition-colors ${
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
