'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Building2, BedDouble, Calendar, Download, ArrowRight } from 'lucide-react';
import RoleGate from '@/components/auth/RoleGate';

interface UnitRow {
  unit_id: string;
  unit_number: string;
  hotel_id: string;
  hotel_name: string;
  occupied_nights: number;
  total_nights: number;
  occupancy_pct: number;
}

export default function OccupancyReportPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<UnitRow[]>([]);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
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
      const { data: units, error: unitsErr } = await supabase
        .from('units')
        .select('id, unit_number, hotel:hotels(id, name)');
      if (unitsErr) throw unitsErr;

      const hotelFilteredUnits = (units || []).filter((u: any) =>
        selectedHotelId === 'all' ? true : u.hotel?.id === selectedHotelId
      );
      const unitIds = hotelFilteredUnits.map((u: any) => u.id);

      let bookings: any[] = [];
      if (unitIds.length > 0) {
        const { data: bookData, error: bookErr } = await supabase
          .from('bookings')
          .select('id, unit_id, check_in, check_out, status')
          .in('unit_id', unitIds)
          .lte('check_in', endDate)
          .gt('check_out', startDate)
          .in('status', ['confirmed', 'deposit_paid', 'checked_in', 'checked_out', 'completed']);
        if (bookErr) throw bookErr;
        bookings = bookData || [];
      }

      const totalN = diffNights(startDate, endDate);
      const byUnitOcc: Record<string, number> = {};
      bookings.forEach((b) => {
        const n = overlapNights(startDate, endDate, b.check_in, b.check_out);
        byUnitOcc[b.unit_id] = (byUnitOcc[b.unit_id] || 0) + n;
      });
      const rowsBuilt: UnitRow[] = hotelFilteredUnits.map((u: any) => {
        const occ = byUnitOcc[u.id] || 0;
        const pct = totalN > 0 ? Math.round((occ / totalN) * 1000) / 10 : 0;
        return {
          unit_id: u.id,
          unit_number: u.unit_number || '-',
          hotel_id: u.hotel?.id || 'unknown',
          hotel_name: u.hotel?.name || 'غير معروف',
          occupied_nights: occ,
          total_nights: totalN,
          occupancy_pct: pct
        };
      }).sort((a, b) => b.occupancy_pct - a.occupancy_pct);
      setRows(rowsBuilt);
    } catch (err: any) {
      console.error('Error building occupancy report:', err);
      alert('حدث خطأ أثناء تحميل تقرير الإشغال: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  const hotelOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      map.set(r.hotel_id, r.hotel_name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'ar'));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const t = searchText.trim();
    return rows.filter((r) => {
      if (selectedHotelId !== 'all' && r.hotel_id !== selectedHotelId) return false;
      if (t && !(r.unit_number || '').includes(t)) return false;
      return true;
    });
  }, [rows, selectedHotelId, searchText]);

  const totals = useMemo(() => {
    const unitsCount = filteredRows.length;
    const occ = filteredRows.reduce((s, r) => s + Number(r.occupied_nights || 0), 0);
    const total = filteredRows.reduce((s, r) => s + Number(r.total_nights || 0), 0);
    const pct = total > 0 ? Math.round((occ / total) * 1000) / 10 : 0;
    return { unitsCount, occ, total, pct };
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
              <BedDouble className="text-cyan-600" />
              تقرير الإشغال
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              حساب نسبة الإشغال حسب الوحدات ضمن فترة محددة.
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
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4 items-end"
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
            <label className="text-xs sm:text-sm font-medium text-gray-700">الفندق</label>
            <select
              value={selectedHotelId}
              onChange={(e) => setSelectedHotelId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
            >
              <option value="all">كل الفنادق</option>
              {hotelOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs sm:text-sm font-medium text-gray-700">بحث برقم الوحدة</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="رقم الوحدة"
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-gray-500">عدد الوحدات</p>
          <p className="mt-1 text-2xl font-extrabold text-gray-900">{totals.unitsCount.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-gray-500">ليالي متاحة</p>
          <p className="mt-1 text-2xl font-extrabold text-gray-900">{totals.total.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-gray-500">ليالي مشغولة</p>
          <p className="mt-1 text-2xl font-extrabold text-gray-900">{totals.occ.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-cyan-700">نسبة الإشغال</p>
          <p className="mt-1 text-xl font-extrabold text-cyan-700">
            {totals.pct.toLocaleString()}%
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-right min-w-[900px]">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">الفندق</th>
              <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">رقم الوحدة</th>
              <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">مشغول</th>
              <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">المتاح</th>
              <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">% الإشغال</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredRows.length > 0 ? (
              filteredRows.map((r) => (
                <tr key={r.unit_id} className="hover:bg-gray-50 transition-colors odd:bg-white even:bg-gray-50">
                  <td className="px-4 py-3 sm:px-6 sm:py-4 font-medium text-gray-900 whitespace-nowrap">
                    {r.hotel_name}
                  </td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 font-mono whitespace-nowrap">
                    {r.unit_number}
                  </td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 text-gray-900 font-bold whitespace-nowrap">
                    {r.occupied_nights.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 text-gray-700 whitespace-nowrap">
                    {r.total_nights.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 font-extrabold text-cyan-700 whitespace-nowrap">
                    {r.occupancy_pct.toLocaleString()}%
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  لا توجد بيانات ضمن الفترة المحددة
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    <div className="print-only p-6">
      <div className="print-title">تقرير الإشغال</div>
      <div className="print-sub">الفترة: {startDate} إلى {endDate}</div>
      <table className="p-table">
        <thead>
          <tr>
            <th>الفندق</th>
            <th>رقم الوحدة</th>
            <th>مشغول</th>
            <th>المتاح</th>
            <th>% الإشغال</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.unit_id}>
              <td>{r.hotel_name}</td>
              <td>{r.unit_number}</td>
              <td>{r.occupied_nights.toLocaleString()}</td>
              <td>{r.total_nights.toLocaleString()}</td>
              <td>{r.occupancy_pct.toLocaleString()}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
    </RoleGate>
  );
}
