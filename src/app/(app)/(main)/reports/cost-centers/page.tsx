'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { Building2, BedDouble, Calendar, Download, ArrowRight } from 'lucide-react';
import RoleGate from '@/components/auth/RoleGate';

interface CostCenterRow {
  hotel_id: string;
  hotel_name: string;
  unit_id: string | null;
  unit_number: string | null;
  level: 'hotel' | 'unit';
  invoices_count: number;
  total_billed: number;      // إجمالي المفوتر
  total_collected: number;   // إجمالي المحصل
  total_expense: number;     // إجمالي المصروفات
  net_profit: number;        // الصافي (مفوتر - مصروفات)
  collection_ratio: number;  // نسبة التحصيل
}

interface HotelGroup {
  hotel_id: string;
  hotel_name: string;
  units: CostCenterRow[];
}

export default function CostCentersReportPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CostCenterRow[]>([]);
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
  }, [startDate, endDate]); // Re-fetch on date change

  const fetchReport = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_cost_center_report', {
        p_start_date: startDate || null,
        p_end_date: endDate || null
      });

      if (error) throw error;
      setRows((data || []) as CostCenterRow[]);
      setSelectedHotelId('all');
      setSearchText('');
    } catch (err: any) {
      console.error('Error fetching cost center report:', err);
      alert('حدث خطأ أثناء تحميل تقرير مراكز التكلفة: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  const hotelOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((row) => {
      if (row.hotel_id && !map.has(row.hotel_id)) {
        map.set(row.hotel_id, row.hotel_name);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'ar'));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const trimmed = searchText.trim();
    return rows.filter((row) => {
      if (selectedHotelId !== 'all' && row.hotel_id !== selectedHotelId) return false;
      if (trimmed) {
        const t = trimmed;
        const unitMatch = (row.unit_number || '').includes(t);
        const hotelMatch = (row.hotel_name || '').includes(t);
        if (!unitMatch && !hotelMatch) return false;
      }
      return true;
    });
  }, [rows, selectedHotelId, searchText]);

  const groups: HotelGroup[] = useMemo(() => {
    const map = new Map<string, HotelGroup>();

    filteredRows.forEach((row) => {
      const key = row.hotel_id || 'general';
      if (!map.has(key)) {
        map.set(key, {
          hotel_id: row.hotel_id,
          hotel_name: row.hotel_name || 'غير مرتبط بفندق',
          units: []
        });
      }
      if (row.unit_id) {
        map.get(key)!.units.push(row);
      }
    });

    return Array.from(map.values()).sort((a, b) => a.hotel_name.localeCompare(b.hotel_name, 'ar'));
  }, [filteredRows]);

  const grandTotal = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        acc.invoices_count += Number(r.invoices_count || 0);
        acc.total_billed += Number(r.total_billed || 0);
        acc.total_collected += Number(r.total_collected || 0);
        acc.total_expense += Number(r.total_expense || 0);
        acc.net_profit += Number(r.net_profit || 0);
        return acc;
      },
      { invoices_count: 0, total_billed: 0, total_collected: 0, total_expense: 0, net_profit: 0 }
    );
  }, [filteredRows]);

  return (
    <RoleGate allow={['admin', 'accountant', 'manager']}>
    <div className="p-6 max-w-7xl mx-auto space-y-6">
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
              <Building2 className="text-blue-600" />
              تقرير مراكز التكلفة (فندق الصفا)
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              تقرير تفصيلي يربط الإيرادات المفوترة والمدفوعات النقدية والمصروفات بكل وحدة سكنية.
            </p>
          </div>
        </div>

        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download size={18} />
          <span>طباعة التقرير</span>
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchReport();
          }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 items-end"
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

          <div className="space-y-1.5">
            <label className="text-xs sm:text-sm font-medium text-gray-700">بحث</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="رقم الوحدة"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="flex sm:block">
            <button
              type="submit"
              className="w-full px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs sm:text-sm flex items-center justify-center gap-2"
            >
              تحديث البيانات
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <h2 className="font-bold text-gray-900">ملخص الأداء المالي للوحدات</h2>
          <div className="flex flex-wrap gap-4 text-xs sm:text-sm">
            <div className="flex flex-col">
              <span className="text-gray-500">إجمالي المفوتر</span>
              <span className="font-bold text-gray-900">{grandTotal.total_billed.toLocaleString('en-US')} ر.س</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-500">إجمالي المحصل</span>
              <span className="font-bold text-green-600">{grandTotal.total_collected.toLocaleString('en-US')} ر.س</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-500">المصروفات</span>
              <span className="font-bold text-red-600">{grandTotal.total_expense.toLocaleString('en-US')} ر.س</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-500">صافي الربح</span>
              <span className="font-bold text-blue-700">{grandTotal.net_profit.toLocaleString('en-US')} ر.س</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">جاري تحميل البيانات...</div>
        ) : groups.length === 0 ? (
          <div className="p-8 text-center text-gray-500">لا توجد بيانات للفترة المحددة</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {groups.map((group) => {
              const hotelTotals = group.units.reduce(
                (acc, r) => {
                  acc.invoices_count += Number(r.invoices_count || 0);
                  acc.total_billed += Number(r.total_billed || 0);
                  acc.total_collected += Number(r.total_collected || 0);
                  acc.total_expense += Number(r.total_expense || 0);
                  acc.net_profit += Number(r.net_profit || 0);
                  return acc;
                },
                { invoices_count: 0, total_billed: 0, total_collected: 0, total_expense: 0, net_profit: 0 }
              );

              return (
                <div key={group.hotel_id} className="p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-blue-100 text-blue-600">
                        <Building2 size={18} />
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-gray-900">
                        {group.hotel_name}
                      </h3>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs sm:text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                        <tr>
                          <th className="px-4 py-3 font-bold">رقم الوحدة</th>
                          <th className="px-4 py-3 text-left font-bold">المفوتر (استحقاق)</th>
                          <th className="px-4 py-3 text-left font-bold">المحصل (نقدي)</th>
                          <th className="px-4 py-3 text-left font-bold">المصروفات</th>
                          <th className="px-4 py-3 text-left font-bold">نسبة التحصيل</th>
                          <th className="px-4 py-3 text-left font-bold">صافي الربح</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {group.units.map((u) => (
                          <tr key={u.unit_id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-bold text-gray-900 flex items-center gap-2">
                              <BedDouble size={16} className="text-gray-400" />
                              <span>شقة {u.unit_number}</span>
                            </td>
                            <td className="px-4 py-3 text-left dir-ltr font-medium">
                              {Number(u.total_billed).toLocaleString('en-US')}
                            </td>
                            <td className="px-4 py-3 text-left dir-ltr font-bold text-green-600">
                              {Number(u.total_collected).toLocaleString('en-US')}
                            </td>
                            <td className="px-4 py-3 text-left dir-ltr text-red-600">
                              {Number(u.total_expense).toLocaleString('en-US')}
                            </td>
                            <td className="px-4 py-3 text-left">
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-gray-200 rounded-full h-1.5 hidden sm:block">
                                  <div 
                                    className="bg-green-500 h-1.5 rounded-full" 
                                    style={{ width: `${Math.min(u.collection_ratio, 100)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-bold text-gray-600">{u.collection_ratio}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-left dir-ltr font-extrabold text-blue-700">
                              {Number(u.net_profit).toLocaleString('en-US')}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                          <td className="px-4 py-3">إجمالي الفندق</td>
                          <td className="px-4 py-3 text-left dir-ltr">
                            {hotelTotals.total_billed.toLocaleString('en-US')}
                          </td>
                          <td className="px-4 py-3 text-left dir-ltr text-green-700">
                            {hotelTotals.total_collected.toLocaleString('en-US')}
                          </td>
                          <td className="px-4 py-3 text-left dir-ltr text-red-700">
                            {hotelTotals.total_expense.toLocaleString('en-US')}
                          </td>
                          <td className="px-4 py-3 text-left">
                            {hotelTotals.total_billed > 0 
                              ? Math.round((hotelTotals.total_collected / hotelTotals.total_billed) * 100) 
                              : 0}%
                          </td>
                          <td className="px-4 py-3 text-left dir-ltr text-blue-800">
                            {hotelTotals.net_profit.toLocaleString('en-US')}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    </RoleGate>
  );
}
