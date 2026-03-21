'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { CalendarDays, List, Calendar, Download, ArrowRight, Trash2, Loader2 } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import RoleGate from '@/components/auth/RoleGate';

interface Row {
  id: string;
  customer_name: string;
  phone?: string;
  hotel_id?: string;
  hotel_name?: string;
  unit_number?: string;
  check_in: string;
  check_out: string;
  nights: number;
  status: string;
}

export default function BookingsLogReportPage() {
  const { role } = useUserRole();
  const isAdmin = role === 'admin';
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedHotelId, setSelectedHotelId] = useState<string>('all');
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    fetchReport();
  }, []);

  const diffNights = (a: string, b: string) => {
    const d1 = new Date(a);
    const d2 = new Date(b);
    const ms = d2.getTime() - d1.getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  };
  const overlapNights = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
    const s = new Date(aStart) > new Date(bStart) ? aStart : bStart;
    const e = new Date(aEnd) < new Date(bEnd) ? aEnd : bEnd;
    return diffNights(s, e);
  };

  const fetchReport = async () => {
    setLoading(true);
    try {
      const { data: bookings, error } = await supabase
        .from('bookings')
        .select(`
          id,
          check_in,
          check_out,
          status,
          customer:customers(full_name, phone),
          unit:units(unit_number, hotel:hotels(id, name))
        `)
        .lte('check_in', endDate)
        .gt('check_out', startDate);
      if (error) throw error;

      const mapped: Row[] = (bookings || []).map((b: any) => {
        const checkInISO = String(b.check_in || '').split('T')[0];
        const checkOutISO = String(b.check_out || '').split('T')[0];
        const nights = overlapNights(startDate, endDate, checkInISO, checkOutISO);
        return {
          id: b.id,
          customer_name: b.customer?.full_name || 'بدون اسم',
          phone: b.customer?.phone || '',
          hotel_id: b.unit?.hotel?.id || '',
          hotel_name: b.unit?.hotel?.name || '',
          unit_number: b.unit?.unit_number || '',
          check_in: checkInISO,
          check_out: checkOutISO,
          nights,
          status: b.status || ''
        };
      });
      setRows(mapped);
    } catch (err: any) {
      console.error('Error loading bookings log:', err);
      alert('حدث خطأ أثناء تحميل تقرير سجل الحجوزات');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCancelled = async (bookingId: string) => {
    if (!isAdmin) {
      alert('ليس لديك صلاحية الحذف النهائي');
      return;
    }
    if (!confirm('هل أنت متأكد من حذف الحجز الملغي نهائياً؟ سيتم حذف الحجز والفواتير والمدفوعات والقيود المرتبطة.')) return;
    setDeletingId(bookingId);
    try {
      const { error } = await supabase.rpc('delete_cancelled_booking_fully', {
        p_booking_id: bookingId
      });
      if (error) throw error;
      setRows((prev) => prev.filter((r) => r.id !== bookingId));
      alert('تم حذف الحجز نهائياً');
      fetchReport();
    } catch (err: any) {
      console.error('Delete cancelled booking error:', err);
      alert('تعذر حذف الحجز: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setDeletingId(null);
    }
  };

  const hotelOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      if (r.hotel_id) map.set(r.hotel_id, r.hotel_name || 'غير معروف');
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'ar'));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const t = searchText.trim();
    return rows.filter((r) => {
      if (selectedHotelId !== 'all' && r.hotel_id !== selectedHotelId) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (t) {
        const inName = (r.customer_name || '').includes(t);
        const inPhone = (r.phone || '').includes(t);
        const inUnit = (r.unit_number || '').includes(t);
        if (!inName && !inPhone && !inUnit) return false;
      }
      return true;
    });
  }, [rows, selectedHotelId, statusFilter, searchText]);

  const totals = useMemo(() => {
    const count = filteredRows.length;
    const nights = filteredRows.reduce((s, r) => s + Number(r.nights || 0), 0);
    return { count, nights };
  }, [filteredRows]);

  return (
    <RoleGate allow={['admin', 'manager', 'accountant', 'marketing']}>
    <>
      <style>{`
        .screen-only { display: block; }
        .print-only { display: none; }
        @media print {
          .screen-only { display: none !important; }
          .print-only { display: block !important; }
          header, aside, nav, .sticky, .fixed { display: none !important; }
          .print-title { font-size: 18px; font-weight: 800; color: #111827; margin-bottom: 6px; }
          .print-sub { color: #6b7280; font-size: 12px; margin-bottom: 10px; }
          .p-table { width: 100%; border-collapse: collapse; }
          .p-table th, .p-table td { border: 1px solid #e5e7eb; padding: 6px; text-align: right; font-size: 12px; }
          .p-table th { background: #f9fafb; font-weight: 700; }
        }
      `}</style>
      <div className="p-6 max-w-7xl mx-auto space-y-6 screen-only">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/reports"
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
            >
              <ArrowRight size={24} />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
                <List className="text-purple-600" />
                تقرير سجل الحجوزات
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                عرض الحجوزات ضمن فترة محددة مع بحث وفلاتر بسيطة.
              </p>
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download size={18} />
            <span>طباعة</span>
          </button>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchReport();
            }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 sm:gap-4 items-end"
          >
            <div className="space-y-1.5">
              <label className="text-xs sm:text-sm font-medium text-gray-700 flex items-center gap-1">
                <Calendar size={14} />
                من تاريخ
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs sm:text-sm font-medium text-gray-700 flex items-center gap-1">
                <Calendar size={14} />
                إلى تاريخ
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs sm:text-sm font-medium text-gray-700">الحالة</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
              >
                <option value="all">كل الحالات</option>
                <option value="confirmed">confirmed</option>
                <option value="deposit_paid">deposit_paid</option>
                <option value="checked_in">checked_in</option>
                <option value="checked_out">checked_out</option>
                <option value="completed">completed</option>
                <option value="canceled">canceled</option>
                <option value="cancelled">cancelled</option>
                <option value="no_show">no_show</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs sm:text-sm font-medium text-gray-700">الفندق</label>
              <select
                value={selectedHotelId}
                onChange={(e) => setSelectedHotelId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
              >
                <option value="all">كل الفنادق</option>
                {hotelOptions.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs sm:text-sm font-medium text-gray-700">بحث (اسم، هاتف، رقم وحدة)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="أدخل نص البحث"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setSearchText('')}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-700 hover:bg-gray-50"
                >
                  مسح
                </button>
              </div>
            </div>
            <div className="flex sm:block">
              <button
                type="submit"
                className="w-full px-4 sm:px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-xs sm:text-sm flex items-center justify-center gap-2"
              >
                تحديث التقرير
              </button>
            </div>
          </form>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-xs text-gray-500">عدد الحجوزات</p>
            <p className="mt-1 text-2xl font-extrabold text-gray-900">{totals.count.toLocaleString()}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-xs text-gray-500">مجموع الليالي</p>
            <p className="mt-1 text-2xl font-extrabold text-gray-900">{totals.nights.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-right min-w-[1000px]">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">العميل</th>
                <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">الهاتف</th>
                <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">الفندق</th>
                <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">رقم الوحدة</th>
                <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">تشيك إن</th>
                <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">تشيك آوت</th>
                <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">ليالي</th>
                <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">الحالة</th>
                {isAdmin && (
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">إجراءات</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.length > 0 ? (
                filteredRows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors odd:bg-white even:bg-gray-50">
                    <td className="px-4 py-3 sm:px-6 sm:py-4 font-medium text-gray-900 whitespace-nowrap">
                      {r.customer_name}
                    </td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                      {r.phone || '-'}
                    </td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                      {r.hotel_name || '-'}
                    </td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4 font-mono whitespace-nowrap">
                      {r.unit_number || '-'}
                    </td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">{r.check_in}</td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">{r.check_out}</td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">{r.nights.toLocaleString()}</td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">{r.status}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                        {(r.status === 'cancelled' || r.status === 'canceled') ? (
                          <button
                            onClick={() => handleDeleteCancelled(r.id)}
                            disabled={!!deletingId}
                            className="inline-flex items-center gap-2 px-3 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 transition-colors text-xs font-bold disabled:opacity-50"
                            title="حذف نهائي للحجز الملغي"
                          >
                            {deletingId === r.id ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                            حذف نهائي
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8} className="px-6 py-12 text-center text-gray-500">
                    لا توجد بيانات ضمن الفترة المحددة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="print-only p-6">
        <div className="print-title">تقرير سجل الحجوزات</div>
        <div className="print-sub">الفترة: {startDate} إلى {endDate}</div>
        <table className="p-table">
          <thead>
            <tr>
              <th>العميل</th>
              <th>الهاتف</th>
              <th>الفندق</th>
              <th>رقم الوحدة</th>
              <th>تشيك إن</th>
              <th>تشيك آوت</th>
              <th>ليالي</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => (
              <tr key={r.id}>
                <td>{r.customer_name}</td>
                <td>{r.phone || '-'}</td>
                <td>{r.hotel_name || '-'}</td>
                <td>{r.unit_number || '-'}</td>
                <td>{r.check_in}</td>
                <td>{r.check_out}</td>
                <td>{r.nights.toLocaleString()}</td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>
    </RoleGate>
  );
}
