'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Calendar, Download, Home } from 'lucide-react';
import RoleGate from '@/components/auth/RoleGate';
import { supabase } from '@/lib/supabase';

type UnitStatusKind = 'booked' | 'temporary' | 'available' | 'maintenance' | 'cleaning';

type Row = {
  unit_id: string;
  unit_number: string;
  unit_type_name: string;
  unit_type_price: number;
  unit_monthly_price: number;
  unit_status_kind: UnitStatusKind;
  unit_status_text: string;
  check_in: string | null;
  check_out: string | null;
  has_future_booking: boolean;
  future_check_in: string | null;
  future_check_out: string | null;
  future_nights: number | null;
  booking_status: string | null;
  hotel_name: string;
};

const formatDate = (value: string | null) => {
  if (!value) return '-';
  return String(value).split('T')[0];
};

const formatDateShort = (value: string | null) => {
  const d = formatDate(value);
  if (!d || d === '-') return '-';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}`;
};

const formatDateYmd = (value: string | null) => {
  return formatDate(value);
};

const diffNights = (startDate: string | null, endDate: string | null) => {
  const s = formatDate(startDate);
  const e = formatDate(endDate);
  if (s === '-' || e === '-') return null;
  const sd = new Date(s);
  const ed = new Date(e);
  if (Number.isNaN(sd.getTime()) || Number.isNaN(ed.getTime())) return null;
  const diff = Math.round((ed.getTime() - sd.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : null;
};

export default function UpdatesReportPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [selectedHotel, setSelectedHotel] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const printFileName = useMemo(() => `تحديثات مساكن الصفا ${todayStr}`, [todayStr]);

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const today = todayStr;

      const { data: units, error: unitsErr } = await supabase
        .from('units')
        .select(`
          id,
          unit_number,
          status,
          hotel:hotels(id, name),
          unit_type:unit_types(id, name, daily_price, annual_price)
        `)
        .order('unit_number', { ascending: true });
      if (unitsErr) throw unitsErr;

      const unitIds = (units || []).map((u: any) => u.id);

      let bookings: any[] = [];
      if (unitIds.length > 0) {
        const { data: bookData, error: bookErr } = await supabase
          .from('bookings')
          .select('id, unit_id, check_in, check_out, status')
          .in('unit_id', unitIds)
          .gte('check_out', today)
          .in('status', ['confirmed', 'checked_in', 'pending_deposit', 'pending']);
        if (bookErr) throw bookErr;
        bookings = bookData || [];
      }

      const byUnit: Record<string, any[]> = {};
      bookings.forEach((b: any) => {
        byUnit[b.unit_id] = byUnit[b.unit_id] || [];
        byUnit[b.unit_id].push(b);
      });

      const rowsBuilt: Row[] = (units || []).map((u: any) => {
        const unitBookings = byUnit[u.id] || [];
        const current = unitBookings
          .filter((b: any) => String(b.check_in) <= today)
          .sort((a: any, b: any) => String(a.check_out).localeCompare(String(b.check_out)))[0];
        const upcoming = unitBookings
          .filter((b: any) => String(b.check_in) > today)
          .sort((a: any, b: any) => String(a.check_in).localeCompare(String(b.check_in)))[0];
        const picked = current || upcoming || null;
        const hasFuture = !current && !!upcoming;

        const rawUnitStatus = String(u.status || '').toLowerCase();
        const rawBookingStatus = picked ? String(picked.status || '').toLowerCase() : null;

        const isMaintenance = rawUnitStatus === 'maintenance';
        const isCleaning = rawUnitStatus === 'cleaning';
        const isBooked = rawBookingStatus === 'confirmed' || rawBookingStatus === 'checked_in';
        const isTemporary = rawBookingStatus === 'pending_deposit' || rawBookingStatus === 'pending';

        let kind: UnitStatusKind = 'available';
        let text = 'متاحة';
        if (isCleaning) {
          kind = 'cleaning';
          text = 'تنظيف';
        } else if (isMaintenance) {
          kind = 'maintenance';
          text = 'صيانة';
        } else if (!hasFuture && isBooked) {
          kind = 'booked';
          text = 'محجوزة';
        } else if (!hasFuture && isTemporary) {
          kind = 'temporary';
          text = 'حجز مؤقت';
        }

        const dailyPrice = Number(u.unit_type?.daily_price || 0);
        const annualPrice = Number(u.unit_type?.annual_price || 0);
        const monthlyPrice = annualPrice > 0 ? Math.round((annualPrice / 12) * 100) / 100 : Math.round(dailyPrice * 30 * 100) / 100;

        return {
          unit_id: u.id,
          unit_number: u.unit_number || '-',
          unit_type_name: u.unit_type?.name || 'غير محدد',
          unit_type_price: dailyPrice,
          unit_monthly_price: monthlyPrice,
          unit_status_kind: kind,
          unit_status_text: text,
          check_in: picked ? String(picked.check_in) : null,
          check_out: picked ? String(picked.check_out) : null,
          has_future_booking: hasFuture,
          future_check_in: hasFuture ? String(upcoming.check_in) : null,
          future_check_out: hasFuture ? String(upcoming.check_out) : null,
          future_nights: hasFuture ? diffNights(String(upcoming.check_in), String(upcoming.check_out)) : null,
          booking_status: picked ? String(picked.status) : null,
          hotel_name: u.hotel?.name || 'غير معروف'
        };
      });

      setRows(rowsBuilt);
    } catch (err: any) {
      console.error('Error building updates report:', err);
      alert('حدث خطأ أثناء تحميل تقرير التحديثيات: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  const hotelOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      map.set(r.hotel_name, r.hotel_name);
    });
    return Array.from(map.keys()).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const t = searchText.trim();
    return rows.filter((r) => {
      if (selectedHotel !== 'all' && r.hotel_name !== selectedHotel) return false;
      if (t && !(r.unit_number || '').includes(t)) return false;
      return true;
    });
  }, [rows, selectedHotel, searchText]);

  const printSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        model: string;
        total: number;
        available: number;
        booked: number;
        temporary: number;
        cleaning: number;
        maintenance: number;
        future: number;
      }
    >();

    for (const r of filteredRows) {
      const key = r.unit_type_name || 'غير محدد';
      if (!map.has(key)) {
        map.set(key, {
          model: key,
          total: 0,
          available: 0,
          booked: 0,
          temporary: 0,
          cleaning: 0,
          maintenance: 0,
          future: 0
        });
      }
      const agg = map.get(key)!;
      agg.total += 1;
      if (r.unit_status_kind === 'available') agg.available += 1;
      if (r.unit_status_kind === 'booked') agg.booked += 1;
      if (r.unit_status_kind === 'temporary') agg.temporary += 1;
      if (r.unit_status_kind === 'cleaning') agg.cleaning += 1;
      if (r.unit_status_kind === 'maintenance') agg.maintenance += 1;
      if (r.has_future_booking) agg.future += 1;
    }

    return Array.from(map.values()).sort((a, b) => a.model.localeCompare(b.model, 'ar'));
  }, [filteredRows]);

  const badgeClass = (kind: UnitStatusKind) => {
    if (kind === 'booked') return 'bg-red-100 text-red-700 border-red-200';
    if (kind === 'temporary') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (kind === 'maintenance') return 'bg-gray-200 text-gray-800 border-gray-300';
    if (kind === 'cleaning') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-green-100 text-green-700 border-green-200';
  };

  const printCardClass = (kind: UnitStatusKind) => {
    if (kind === 'booked') return 'p-card p-card-booked';
    if (kind === 'temporary') return 'p-card p-card-temp';
    if (kind === 'maintenance') return 'p-card p-card-maint';
    if (kind === 'cleaning') return 'p-card p-card-cleaning';
    return 'p-card p-card-available';
  };

  return (
    <RoleGate allow={['admin', 'manager', 'accountant', 'marketing']}>
    <>
        <style>{`
          .screen-only { display: block; }
          .print-only { display: none; }
          @media print {
            @page { size: A4 landscape; margin: 10mm; }
            .screen-only { display: none !important; }
            .print-only { display: block !important; }
            header, aside, nav, .sticky, .fixed { display: none !important; }
            .print-title { font-size: 16px; font-weight: 900; color: #111827; margin-bottom: 6px; }
            .print-sub { color: #6b7280; font-size: 11px; margin-bottom: 8px; }
            .p-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px; }
            .p-filters { font-size: 10px; color: #374151; }
            .p-legend { display: flex; flex-wrap: wrap; gap: 6px; font-size: 10px; color: #111827; }
            .p-leg { display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px; border: 1px solid #e5e7eb; border-radius: 999px; background: #fff; }
            .p-dot { width: 10px; height: 10px; border-radius: 999px; }
            .p-dot-booked { background: #ef4444; }
            .p-dot-temp { background: #f59e0b; }
            .p-dot-avail { background: #22c55e; }
            .p-dot-clean { background: #86efac; }
            .p-dot-maint { background: #9ca3af; }
            .p-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 5px; }
            .p-card { border: 0; border-radius: 10px; padding: 6px; break-inside: avoid; min-height: 52px; }
            .p-card-booked { background: #ef4444; color: #fff; }
            .p-card-temp { background: #f59e0b; color: #111827; }
            .p-card-available { background: #22c55e; color: #fff; }
            .p-card-cleaning { background: #bbf7d0; color: #111827; }
            .p-card-maint { background: #6b7280; color: #fff; }
            .p-row1 { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
            .p-unit { font-size: 18px; font-weight: 900; letter-spacing: 0.2px; }
            .p-out { font-size: 7px; font-weight: 800; opacity: 0.95; white-space: nowrap; display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
            .p-out-label { font-size: 6px; font-weight: 800; opacity: 0.9; }
            .p-out-date { font-size: 7px; font-weight: 900; letter-spacing: 0.1px; }
            .p-type-line { margin-top: 2px; font-size: 8px; opacity: 0.95; white-space: normal; word-break: break-word; line-height: 1.2; }
            .p-flags { margin-top: 3px; font-size: 8px; color: #111827; display: flex; gap: 4px; flex-wrap: wrap; }
            .p-flags { color: inherit; }
            .p-flag { padding: 0 4px; border-radius: 999px; border: 0; background: rgba(255,255,255,0.3); font-size: 7px; line-height: 1.3; }
            .p-note { margin-top: 3px; font-size: 7px; color: inherit; opacity: 0.95; }
            .p-summary { margin-top: 10px; }
            .p-summary-title { font-size: 11px; font-weight: 900; color: #111827; margin-bottom: 6px; }
            .p-summary-lines { display: flex; flex-wrap: wrap; gap: 6px; }
            .p-summary-line { padding: 4px 8px; border-radius: 999px; background: #111827; color: #fff; font-size: 10px; font-weight: 800; }
          }
        `}</style>

        <div className="p-6 max-w-7xl mx-auto space-y-6 screen-only">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
              <Link href="/reports" className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
                <ArrowRight size={24} />
              </Link>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Home className="text-emerald-600" />
                  تقرير التحديثيات
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">
                  عرض حالة كل وحدة مع تاريخ الخروج إن كانت عليها حجز.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                const prevTitle = document.title;
                document.title = printFileName;
                const restore = () => {
                  document.title = prevTitle;
                  window.removeEventListener('afterprint', restore);
                };
                window.addEventListener('afterprint', restore);
                window.print();
                setTimeout(restore, 2000);
              }}
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
                  الفندق
                </label>
                <select
                  value={selectedHotel}
                  onChange={(e) => setSelectedHotel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                >
                  <option value="all">كل الفنادق</option>
                  {hotelOptions.map((h) => (
                    <option key={h} value={h}>
                      {h}
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
                  {loading ? 'جارٍ التحميل...' : 'تحديث التقرير'}
                </button>
              </div>

              <div className="lg:col-span-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white">
                  <span className="w-3 h-3 rounded-full bg-red-500" />
                  محجوزة
                </span>
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white">
                  <span className="w-3 h-3 rounded-full bg-yellow-400" />
                  مؤقت
                </span>
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white">
                  <span className="w-3 h-3 rounded-full bg-green-500" />
                  متاحة
                </span>
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white">
                  <span className="w-3 h-3 rounded-full bg-amber-500" />
                  تنظيف
                </span>
              </div>
            </form>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">الوحدة</th>
                    <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">نوع النموذج</th>
                    <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">سعر النموذج</th>
                    <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">حالة الوحدة</th>
                    <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">تاريخ الخروج</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRows.length > 0 ? (
                    filteredRows.map((r) => (
                      <tr key={r.unit_id} className="hover:bg-gray-50 transition-colors odd:bg-white even:bg-gray-50">
                        <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap font-bold text-gray-900">{r.unit_number}</td>
                        <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">{r.unit_type_name}</td>
                        <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                          {Number(r.unit_type_price || 0).toLocaleString('en-US')} ر.س
                        </td>
                        <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-bold ${badgeClass(r.unit_status_kind)}`}>
                            {r.unit_status_text}
                          </span>
                        </td>
                        <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">{formatDate(r.check_out)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                        لا توجد بيانات
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="print-only">
          <div className="print-title">تقرير التحديثيات</div>
          <div className="p-head">
            <div className="p-filters">
              <div>الفندق: {selectedHotel === 'all' ? 'الكل' : selectedHotel}</div>
              <div>بحث الوحدة: {searchText.trim() ? searchText.trim() : '—'}</div>
            </div>
            <div className="p-legend">
              <span className="p-leg"><span className="p-dot p-dot-booked" /> محجوزة</span>
              <span className="p-leg"><span className="p-dot p-dot-temp" /> مؤقت</span>
              <span className="p-leg"><span className="p-dot p-dot-avail" /> متاحة</span>
              <span className="p-leg"><span className="p-dot p-dot-clean" /> تنظيف</span>
              <span className="p-leg"><span className="p-dot p-dot-maint" /> صيانة</span>
            </div>
          </div>
          <div className="print-sub">اللون يدل على الحالة. يظهر المتبقي للحجوزات الحالية.</div>
          <div className="p-grid">
            {filteredRows.map((r) => (
              <div key={r.unit_id} className={printCardClass(r.unit_status_kind)}>
                <div className="p-row1">
                  <div className="p-unit">{r.unit_number}</div>
                  <div className="p-out">
                    <div className="p-out-label">متبقي</div>
                    <div className="p-out-date">
                      {(r.unit_status_kind === 'booked' || r.unit_status_kind === 'temporary')
                        ? `${diffNights(todayStr, r.check_out) ?? 0} يوم`
                        : '-'}
                    </div>
                  </div>
                </div>
                <div className="p-type-line">{r.unit_type_name}</div>
                <div className="p-flags">
                  {(r.unit_status_kind === 'booked' || r.unit_status_kind === 'temporary') && formatDate(r.check_in) === todayStr && <span className="p-flag">وصول</span>}
                  {(r.unit_status_kind === 'booked' || r.unit_status_kind === 'temporary') && formatDate(r.check_out) === todayStr && <span className="p-flag">خروج</span>}
                </div>
                {r.has_future_booking && (
                  <div className="p-note">
                    محجوزة مستقبلاً {formatDateShort(r.future_check_in)}-{formatDateShort(r.future_check_out)}
                    {typeof r.future_nights === 'number' ? ` (${r.future_nights} ل)` : ''}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="p-summary">
            <div className="p-summary-title">ملخص حسب نوع النموذج</div>
            <div className="p-summary-lines">
              {printSummary.map((s) => (
                <div key={s.model} className="p-summary-line">
                  {s.model}: متاح {s.available} | تنظيف {s.cleaning}
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    </RoleGate>
  );
}
