'use client';

import React from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronDown, Eye, FileText, Home, Key, Printer, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import BookingQuickView from '@/components/bookings/BookingQuickView';
import ConfirmBookingButton from '@/components/bookings/ConfirmBookingButton';
import { addDays, addMonths, differenceInDays, format as formatDate, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';

type BookingRow = {
  id: string;
  created_at: string;
  status: string;
  booking_type: string | null;
  check_in: string;
  check_out: string;
  total_price: number | null;
  customer: { full_name: string | null; phone: string | null } | null;
  unit: { unit_number: string | null; unit_type?: { name: string | null } | null } | null;
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'مبدئي', color: 'bg-yellow-50 text-yellow-900' },
  pending_deposit: { label: 'بانتظار العربون', color: 'bg-yellow-100 text-yellow-900' },
  confirmed: { label: 'مؤكد', color: 'bg-green-100 text-green-900' },
  checked_in: { label: 'تم الدخول', color: 'bg-blue-100 text-blue-900' },
  checked_out: { label: 'تم الخروج', color: 'bg-gray-100 text-gray-900' },
  cancelled: { label: 'ملغي', color: 'bg-red-100 text-red-900' },
};

function DatePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const popoverRef = React.useRef<HTMLDivElement | null>(null);

  const selectedDate = value ? new Date(`${value}T00:00:00Z`) : null;
  const [month, setMonth] = React.useState<Date>(() => selectedDate || new Date());

  React.useEffect(() => {
    if (!open) return;
    setMonth(selectedDate || new Date());
  }, [open, value]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (popoverRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [open]);

  const monthStart = startOfMonth(month);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const days = Array.from({ length: 42 }).map((_, i) => addDays(gridStart, i));
  const weekDays = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];

  const title = month.toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' });

  const setValueDate = (d: Date) => {
    onChange(formatDate(d, 'yyyy-MM-dd'));
    setOpen(false);
  };

  return (
    <div className="space-y-1.5">
      <label className="text-xs sm:text-sm font-bold text-emerald-950">{label}</label>
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full pr-10 pl-10 py-2.5 border border-emerald-200 bg-white rounded-xl text-xs sm:text-sm text-emerald-950 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-right"
        >
          {value ? (
            <span className="font-bold">{selectedDate?.toLocaleDateString('ar-SA')}</span>
          ) : (
            <span className="text-emerald-700">اختر التاريخ</span>
          )}
        </button>
        <CalendarDays size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-700 pointer-events-none" />
        {value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-emerald-700 hover:bg-emerald-50"
            title="مسح"
          >
            <X size={14} />
          </button>
        ) : null}

        {open ? (
          <div
            ref={popoverRef}
            className="absolute z-50 mt-2 w-full min-w-[280px] rounded-2xl border border-emerald-200 bg-white shadow-xl overflow-hidden"
          >
            <div className="bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 px-3 py-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMonth((m) => addMonths(m, -1))}
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold"
              >
                السابق
              </button>
              <div className="text-white font-extrabold text-xs sm:text-sm">{title}</div>
              <button
                type="button"
                onClick={() => setMonth((m) => addMonths(m, 1))}
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold"
              >
                التالي
              </button>
            </div>

            <div className="p-3 bg-emerald-50">
              <div className="grid grid-cols-7 gap-1 text-[10px] font-extrabold text-emerald-900 mb-2">
                {weekDays.map((d) => (
                  <div key={d} className="text-center">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {days.map((d) => {
                  const inMonth = isSameMonth(d, monthStart);
                  const isSelected = selectedDate ? isSameDay(d, selectedDate) : false;
                  const cls = isSelected
                    ? 'bg-emerald-800 text-white border-emerald-800'
                    : inMonth
                      ? 'bg-white text-emerald-950 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-white text-emerald-400 border-emerald-100 hover:bg-emerald-50';
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      onClick={() => setValueDate(d)}
                      className={`h-9 rounded-xl border text-xs font-bold transition-colors ${cls}`}
                    >
                      {formatDate(d, 'd')}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function BookingsListTable({
  selectedHotelId,
  pageSize = 5,
}: {
  selectedHotelId: string;
  pageSize?: number;
}) {
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<
    Array<{
      booking: BookingRow;
      amount: number;
      hasKey: boolean;
      ejar: null | {
        status: 'pending_confirmation' | 'confirmed' | 'rejected';
        supervisor_note: string | null;
        decided_at: string | null;
        updated_at: string | null;
        uploaded_at: string | null;
        created_at: string | null;
      };
    }>
  >([]);
  const [pageNum, setPageNum] = React.useState(1);
  const [hasNext, setHasNext] = React.useState(false);
  const [totalCount, setTotalCount] = React.useState<number | null>(null);
  const [status, setStatus] = React.useState<string>('all');
  const [type, setType] = React.useState<string>('all');
  const [arrival, setArrival] = React.useState('');
  const [departure, setDeparture] = React.useState('');
  const [q, setQ] = React.useState('');

  const nextYmd = (ymd: string) => {
    const [yy, mm, dd] = ymd.split('-').map((x) => Number(x));
    const d = new Date(Date.UTC(yy, (mm || 1) - 1, dd || 1));
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const fromIndex = (pageNum - 1) * pageSize;
      const toIndex = fromIndex + pageSize - 1;
      const searchTerm = q.trim();

      let customerIds: string[] = [];
      let unitIds: string[] = [];
      if (searchTerm) {
        const [custRes, unitsRes] = await Promise.all([
          supabase
            .from('customers')
            .select('id')
            .or(`full_name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
            .limit(200),
          (() => {
            let uq: any = supabase.from('units').select('id').ilike('unit_number', `%${searchTerm}%`).limit(200);
            if (selectedHotelId !== 'all') uq = uq.eq('hotel_id', selectedHotelId);
            return uq;
          })(),
        ]);
        customerIds = Array.from(new Set((custRes.data || []).map((r: any) => r?.id).filter(Boolean).map((x: any) => String(x))));
        unitIds = Array.from(new Set((unitsRes.data || []).map((r: any) => r?.id).filter(Boolean).map((x: any) => String(x))));
      }

      let query: any = supabase
        .from('bookings')
        .select(
          `
          id,
          created_at,
          status,
          booking_type,
          check_in,
          check_out,
          total_price,
          hotel_id,
          customer:customers(full_name, phone),
          unit:units(unit_number, unit_type:unit_types(name))
        `,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false });

      if (selectedHotelId !== 'all') query = query.eq('hotel_id', selectedHotelId);
      if (status !== 'all') query = query.eq('status', status);
      if (type !== 'all') query = query.eq('booking_type', type);
      if (arrival) query = query.gte('check_in', arrival).lt('check_in', nextYmd(arrival));
      if (departure) query = query.gte('check_out', departure).lt('check_out', nextYmd(departure));

      if (searchTerm) {
        const parts: string[] = [];
        if (customerIds.length > 0) parts.push(`customer_id.in.(${customerIds.join(',')})`);
        if (unitIds.length > 0) parts.push(`unit_id.in.(${unitIds.join(',')})`);
        if (parts.length > 0) query = query.or(parts.join(','));
        else query = query.in('id', ['00000000-0000-0000-0000-000000000000']);
      }

      const res = await query.range(fromIndex, toIndex);
      if (res.error) throw res.error;

      const bookings = (res.data || []) as any[];
      const bookingIds = bookings.map((b: any) => String(b.id));
      const nextOffset = fromIndex + pageSize;
      setHasNext(typeof res.count === 'number' ? nextOffset < res.count : bookings.length === pageSize);
      setTotalCount(typeof res.count === 'number' ? res.count : null);

      const invoiceSumByBooking = new Map<string, { sum: number; count: number }>();
      if (bookingIds.length > 0) {
        const { data: invs } = await supabase
          .from('invoices')
          .select('booking_id,total_amount,status')
          .in('booking_id', bookingIds)
          .neq('status', 'void');
        (invs || []).forEach((inv: any) => {
          const bid = inv.booking_id;
          if (!bid) return;
          const prev = invoiceSumByBooking.get(bid) || { sum: 0, count: 0 };
          invoiceSumByBooking.set(bid, { sum: prev.sum + (Number(inv.total_amount) || 0), count: prev.count + 1 });
        });
      }

      const bookingsWithKeys = new Set<string>();
      if (bookingIds.length > 0) {
        const { data: keysData } = await supabase.from('booking_keys').select('booking_id').in('booking_id', bookingIds);
        (keysData || []).forEach((k: any) => {
          if (k?.booking_id) bookingsWithKeys.add(String(k.booking_id));
        });
      }

      const ejarByBookingId = new Map<
        string,
        {
          status: 'pending_confirmation' | 'confirmed' | 'rejected';
          supervisor_note: string | null;
          decided_at: string | null;
          updated_at: string | null;
          uploaded_at: string | null;
          created_at: string | null;
        }
      >();
      if (bookingIds.length > 0) {
        const { data: ejarRows } = await supabase
          .from('ejar_contract_uploads')
          .select('booking_id,status,supervisor_note,decided_at,updated_at,uploaded_at,created_at')
          .in('booking_id', bookingIds);
        (ejarRows || []).forEach((r: any) => {
          if (!r?.booking_id) return;
          ejarByBookingId.set(String(r.booking_id), {
            status: String(r.status || 'pending_confirmation') as any,
            supervisor_note: r.supervisor_note ? String(r.supervisor_note) : null,
            decided_at: r.decided_at ? String(r.decided_at) : null,
            updated_at: r.updated_at ? String(r.updated_at) : null,
            uploaded_at: r.uploaded_at ? String(r.uploaded_at) : null,
            created_at: r.created_at ? String(r.created_at) : null,
          });
        });
      }

      setRows(
        bookings.map((b: any) => {
          const invAgg = invoiceSumByBooking.get(b.id);
          const amount = invAgg && invAgg.count > 0 ? invAgg.sum : Number(b.total_price || 0);
          return {
            booking: b as any,
            amount,
            hasKey: bookingsWithKeys.has(String(b.id)),
            ejar: ejarByBookingId.get(String(b.id)) ?? null,
          };
        })
      );
    } catch (e: any) {
      setRows([]);
      setHasNext(false);
      setTotalCount(null);
    } finally {
      setLoading(false);
    }
  }, [arrival, departure, pageNum, pageSize, q, selectedHotelId, status, type]);

  React.useEffect(() => {
    load();
  }, [load]);

  const ejarBadge = (ejar: NonNullable<(typeof rows)[number]['ejar']>) => {
    const s = ejar.status;
    const needsDoc = s === 'confirmed' && String(ejar.supervisor_note || '').trim() !== 'تم توثيق';
    const base = ejar.decided_at || ejar.updated_at || ejar.uploaded_at || ejar.created_at || null;
    const remaining = (() => {
      if (!needsDoc || !base) return null;
      const decidedAt = new Date(String(base));
      if (Number.isNaN(decidedAt.getTime())) return null;
      const decidedDay = new Date(decidedAt);
      decidedDay.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const elapsed = Math.max(0, differenceInDays(today, decidedDay));
      return Math.max(0, 7 - elapsed);
    })();

    const label =
      s === 'rejected'
        ? 'إيجار: لم يوافق'
        : s === 'pending_confirmation'
          ? 'إيجار: بانتظار التأكيد'
          : needsDoc
            ? `إيجار: بانتظار التوثيق${typeof remaining === 'number' ? ` • متبقي ${remaining} يوم` : ''}`
            : 'إيجار: تم التأكيد';

    const cls =
      s === 'rejected'
        ? 'bg-red-100 text-red-900'
        : s === 'pending_confirmation'
          ? 'bg-amber-100 text-amber-900'
          : needsDoc
            ? 'bg-amber-100 text-amber-900'
            : 'bg-emerald-100 text-emerald-900';
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold ${cls}`}>{label}</span>;
  };

  const canPrev = pageNum > 1;
  const canNext = hasNext;
  const totalPages = typeof totalCount === 'number' ? Math.max(1, Math.ceil(totalCount / pageSize)) : null;
  const pageButtons = React.useMemo(() => {
    if (!totalPages) return [] as Array<{ key: string; type: 'page' | 'dots'; page?: number }>;
    const maxButtons = 7;
    if (totalPages <= maxButtons) {
      return Array.from({ length: totalPages }).map((_, i) => ({ key: String(i + 1), type: 'page' as const, page: i + 1 }));
    }
    const items: Array<{ key: string; type: 'page' | 'dots'; page?: number }> = [];
    const windowSize = 3;
    const start = Math.max(2, pageNum - windowSize);
    const end = Math.min(totalPages - 1, pageNum + windowSize);

    items.push({ key: '1', type: 'page', page: 1 });
    if (start > 2) items.push({ key: 'dots-start', type: 'dots' });
    for (let p = start; p <= end; p++) items.push({ key: String(p), type: 'page', page: p });
    if (end < totalPages - 1) items.push({ key: 'dots-end', type: 'dots' });
    items.push({ key: String(totalPages), type: 'page', page: totalPages });
    return items;
  }, [pageNum, totalPages]);

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-visible relative z-30">
        <div className="bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 px-3 sm:px-4 py-2.5 flex items-center justify-between">
          <div className="text-white font-extrabold text-xs sm:text-sm">بحث وتصفية</div>
          <div className="text-white text-[10px] sm:text-xs font-bold">تظهر النتائج مباشرة</div>
        </div>
        <div className="p-3 sm:p-4 bg-emerald-50">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div className="space-y-1.5">
              <label className="text-xs sm:text-sm font-bold text-emerald-950">بحث</label>
              <div className="relative">
                <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-700" />
                <input
                  type="text"
                  value={q}
                  onChange={(e) => {
                    setPageNum(1);
                    setQ(e.target.value);
                  }}
                  placeholder="اسم العميل، جوال، رقم وحدة"
                  className="w-full pr-10 pl-3 py-2.5 border border-emerald-200 bg-white rounded-xl text-xs sm:text-sm text-emerald-950 placeholder:text-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
            </div>

            <DatePicker
              label="تاريخ الوصول"
              value={arrival}
              onChange={(v) => {
                setPageNum(1);
                setArrival(v);
              }}
            />

            <DatePicker
              label="تاريخ المغادرة"
              value={departure}
              onChange={(v) => {
                setPageNum(1);
                setDeparture(v);
              }}
            />

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs sm:text-sm font-bold text-emerald-950">الحالة</label>
                <div className="relative">
                  <ChevronDown size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-700 pointer-events-none" />
                  <select
                    value={status}
                    onChange={(e) => {
                      setPageNum(1);
                      setStatus(e.target.value);
                    }}
                    className="w-full pr-3 pl-9 py-2.5 border border-emerald-200 bg-white rounded-xl text-xs sm:text-sm text-emerald-950 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none appearance-none"
                  >
                    <option value="all">كل الحالات</option>
                    <option value="pending_deposit">بانتظار العربون</option>
                    <option value="confirmed">مؤكد</option>
                    <option value="checked_in">تم الدخول</option>
                    <option value="checked_out">تم الخروج</option>
                    <option value="cancelled">ملغي</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs sm:text-sm font-bold text-emerald-950">النوع</label>
                <div className="relative">
                  <ChevronDown size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-700 pointer-events-none" />
                  <select
                    value={type}
                    onChange={(e) => {
                      setPageNum(1);
                      setType(e.target.value);
                    }}
                    className="w-full pr-3 pl-9 py-2.5 border border-emerald-200 bg-white rounded-xl text-xs sm:text-sm text-emerald-950 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none appearance-none"
                  >
                    <option value="all">كل الأنواع</option>
                    <option value="daily">يومي</option>
                    <option value="yearly">سنوي</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-emerald-300 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[9px] sm:text-sm text-right">
            <thead className="bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 border-b border-emerald-950 text-white font-bold">
              <tr>
                <th className="px-2 sm:px-6 py-2 sm:py-4">رقم الحجز</th>
                <th className="px-2 sm:px-6 py-2 sm:py-4">العميل</th>
                <th className="px-2 sm:px-6 py-2 sm:py-4">الوحدة</th>
                <th className="px-2 sm:px-6 py-2 sm:py-4">الوصول</th>
                <th className="hidden sm:table-cell px-2 sm:px-6 py-2 sm:py-4">المغادرة</th>
                <th className="px-2 sm:px-6 py-2 sm:py-4">الحالة</th>
                <th className="px-2 sm:px-6 py-2 sm:py-4">المبلغ</th>
                <th className="px-2 sm:px-6 py-2 sm:py-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-100">
              {rows.map((r) => {
                const b = r.booking;
                const statusInfo = STATUS_MAP[b.status] || { label: b.status, color: 'bg-gray-100 text-gray-900' };
                return (
                  <tr key={b.id} className="hover:bg-emerald-50 transition-colors">
                    <td className="px-1 sm:px-6 py-1 sm:py-4 font-mono font-bold text-gray-900 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-800">
                          <span className="sm:hidden">#{String(b.id).slice(0, 6).toUpperCase()}</span>
                          <span className="hidden sm:inline">#{String(b.id).slice(0, 8).toUpperCase()}</span>
                        </span>
                        {r.hasKey ? (
                          <div title="يوجد مفتاح ذكي" className="bg-emerald-200 text-emerald-900 p-1 rounded-md">
                            <Key size={12} />
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-1 sm:px-6 py-1 sm:py-4">
                      <div className="font-bold text-gray-900">{b.customer?.full_name || 'غير معروف'}</div>
                      <div className="text-[9px] sm:text-xs text-gray-500 font-mono" dir="ltr">
                        {b.customer?.phone || '-'}
                      </div>
                    </td>
                    <td className="px-1 sm:px-6 py-1 sm:py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Home size={14} className="text-gray-400" />
                        <span className="font-medium text-gray-900">{b.unit?.unit_number || '-'}</span>
                        <span className="text-gray-500 text-[10px] sm:text-xs">({b.unit?.unit_type?.name || '-'})</span>
                      </div>
                    </td>
                    <td className="px-1 sm:px-6 py-1 sm:py-4 font-medium text-gray-900 whitespace-nowrap">
                      <span className="sm:hidden">{String(b.check_in || '').slice(8, 10)}/{String(b.check_in || '').slice(5, 7)}</span>
                      <span className="hidden sm:inline">{String(b.check_in || '').split('T')[0]}</span>
                    </td>
                    <td className="hidden sm:table-cell px-2 sm:px-6 py-2 sm:py-4 font-medium text-gray-900 whitespace-nowrap">
                      {String(b.check_out || '').split('T')[0]}
                    </td>
                    <td className="px-1 sm:px-6 py-1 sm:py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      {r.ejar ? <div className="mt-1">{ejarBadge(r.ejar)}</div> : null}
                    </td>
                    <td className="px-1 sm:px-6 py-1 sm:py-4 font-bold text-gray-900 whitespace-nowrap">{Number(r.amount || 0).toLocaleString()} ر.س</td>
                    <td className="px-1 sm:px-6 py-1 sm:py-4">
                      <div className="flex items-center justify-center gap-2">
                        <BookingQuickView id={b.id} />
                        {b.status !== 'confirmed' ? <ConfirmBookingButton id={b.id} /> : null}
                        <Link
                          href={`/print/invoice/${b.id}`}
                          target="_blank"
                          className="p-1.5 text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="الفاتورة"
                        >
                          <FileText size={16} className="sm:hidden" />
                          <FileText size={18} className="hidden sm:inline" />
                        </Link>
                        <Link
                          href={`/print/contract/${b.id}`}
                          target="_blank"
                          className="p-1.5 text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="العقد"
                        >
                          <Printer size={16} className="sm:hidden" />
                          <Printer size={18} className="hidden sm:inline" />
                        </Link>
                        <Link
                          href={`/bookings-list/${b.id}`}
                          className="p-1.5 text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="تفاصيل الحجز"
                        >
                          <Eye size={16} className="sm:hidden" />
                          <Eye size={18} className="hidden sm:inline" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-2 sm:px-6 py-10 sm:py-12 text-center text-gray-500 font-medium text-xs sm:text-sm">
                    لا توجد حجوزات مطابقة
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 sm:px-6 py-3 border-t border-emerald-950 bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900">
          <div className="text-[10px] sm:text-xs text-white font-bold">
            الصفحة {pageNum}
            {typeof totalCount === 'number' ? ` من ${totalPages}` : ''}
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-2">
            <div className="flex items-center gap-1">
              {pageButtons.length > 0 ? (
                <div className="hidden sm:flex items-center gap-1">
                  {pageButtons.map((item) =>
                    item.type === 'dots' ? (
                      <span key={item.key} className="px-2 text-white font-bold">
                        ...
                      </span>
                    ) : (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setPageNum(item.page || 1)}
                        disabled={loading}
                        className={`min-w-8 px-2 py-1 rounded-md text-xs font-bold border transition-colors ${
                          item.page === pageNum
                            ? 'bg-white text-emerald-900 border-white'
                            : 'bg-emerald-900 text-white border-emerald-950 hover:bg-emerald-950'
                        } ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        {item.page}
                      </button>
                    )
                  )}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setPageNum((p) => Math.max(1, p - 1))}
              disabled={!canPrev || loading}
              className={`px-2 py-1 sm:px-3 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-sm font-bold border transition-colors ${
                canPrev && !loading ? 'bg-white hover:bg-emerald-50 text-emerald-900 border-white' : 'bg-emerald-900 text-white/50 border-emerald-900 cursor-not-allowed'
              }`}
            >
              السابق
            </button>
            <button
              type="button"
              onClick={() => setPageNum((p) => p + 1)}
              disabled={!canNext || loading}
              className={`px-2 py-1 sm:px-3 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-sm font-bold border transition-colors ${
                canNext && !loading ? 'bg-white hover:bg-emerald-50 text-emerald-900 border-white' : 'bg-emerald-900 text-white/50 border-emerald-900 cursor-not-allowed'
              }`}
            >
              التالي
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
