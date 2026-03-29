'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import RoleGate from '@/components/auth/RoleGate';
import { ArrowRight, CalendarDays, Download, FileText, Loader2 } from 'lucide-react';

function toYMD(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

function nextYmd(ymd: string) {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return toYMD(d);
}

function formatDateOnly(value: string | null) {
  if (!value) return '-';
  const s = String(value);
  if (s.includes('T')) return s.split('T')[0];
  if (s.includes(' ')) return s.split(' ')[0];
  return s;
}

function formatCurrency(n: number) {
  return `${Math.round(n).toLocaleString('ar-SA')} ر.س`;
}

export default function DailyReportPage() {
  const searchParams = useSearchParams();
  const date = searchParams.get('date') || toYMD(new Date());
  const autoprint = searchParams.get('autoprint') === '1';
  const isEmbed = searchParams.get('embed') === '1';

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [todayInvoices, setTodayInvoices] = useState<any[]>([]);
  const [todayPayments, setTodayPayments] = useState<any[]>([]);
  const [remainingRows, setRemainingRows] = useState<Array<{ booking_id: string; unit_number: string; customer_name: string; remaining: number }>>([]);
  const [totals, setTotals] = useState<{ invoices: number; payments: number; remaining: number }>({ invoices: 0, payments: 0, remaining: 0 });

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const dayStart = `${date}T00:00:00`;
        const dayEnd = `${nextYmd(date)}T00:00:00`;

        const [{ data: ev }, { data: inv }, { data: pays }, { data: active }] = await Promise.all([
          supabase
            .from('system_events')
            .select('id,event_type,message,created_at,booking_id,unit_id,customer_id,payload')
            .gte('created_at', dayStart)
            .lt('created_at', dayEnd)
            .in('event_type', ['booking_created', 'check_in', 'check_out', 'payment_settled'])
            .order('created_at', { ascending: false }),
          supabase
            .from('invoices')
            .select('id,booking_id,invoice_number,invoice_date,total_amount,status,created_at')
            .eq('invoice_date', date)
            .neq('status', 'void')
            .order('created_at', { ascending: false }),
          supabase
            .from('payments')
            .select('id,invoice_id,customer_id,amount,status,payment_date,created_at,description,payment_method:payment_methods(name)')
            .eq('payment_date', date)
            .eq('status', 'posted')
            .order('created_at', { ascending: false }),
          supabase
            .from('bookings')
            .select('id, status, check_in, check_out, customer_id, unit_id, customers(full_name), units(unit_number)')
            .eq('status', 'checked_in')
            .lt('check_in', nextYmd(date))
            .gt('check_out', date)
        ]);

        const invoiceEvents = (inv || []).map((i: any) => ({
          id: `invoice_${i.id}`,
          event_type: 'invoice_issued',
          booking_id: i.booking_id,
          created_at: i.created_at || `${date}T00:00:00`,
          message: `إصدار فاتورة ${i.invoice_number || ''} بمبلغ ${formatCurrency(Number(i.total_amount) || 0)} (${i.status})`
        }));
        const mergedEvents = [...(ev || []), ...invoiceEvents].sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
        setEvents(mergedEvents);
        setTodayInvoices(inv || []);
        setTodayPayments(pays || []);

        const invTotal = (inv || []).reduce((sum: number, x: any) => sum + (Number(x.total_amount) || 0), 0);
        const payTotal = (pays || []).reduce((sum: number, x: any) => sum + (Number(x.amount) || 0), 0);

        const activeBookingIds = (active || []).map((b: any) => b.id);
        let remainingTotal = 0;
        let remainingList: Array<{ booking_id: string; unit_number: string; customer_name: string; remaining: number }> = [];
        if (activeBookingIds.length > 0) {
          const { data: activeInvs } = await supabase
            .from('invoices')
            .select('id, booking_id, total_amount, status')
            .in('booking_id', activeBookingIds)
            .neq('status', 'void');

          const invoiceIds = (activeInvs || []).map((i: any) => i.id);
          const { data: activePays } = invoiceIds.length
            ? await supabase.from('payments').select('invoice_id,amount,status').in('invoice_id', invoiceIds).eq('status', 'posted')
            : { data: [] as any[] };

          const paidByInvoice = new Map<string, number>();
          (activePays || []).forEach((p: any) => {
            if (!p.invoice_id) return;
            paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) || 0) + (Number(p.amount) || 0));
          });

          const invByBooking = new Map<string, number>();
          (activeInvs || []).forEach((i: any) => {
            const bid = i.booking_id;
            if (!bid) return;
            invByBooking.set(bid, (invByBooking.get(bid) || 0) + (Number(i.total_amount) || 0));
          });

          const paidByBooking = new Map<string, number>();
          (activeInvs || []).forEach((i: any) => {
            const bid = i.booking_id;
            if (!bid) return;
            paidByBooking.set(bid, (paidByBooking.get(bid) || 0) + (paidByInvoice.get(i.id) || 0));
          });

          remainingList = (active || [])
            .map((b: any) => {
              const customerName = Array.isArray(b.customers) ? b.customers[0]?.full_name : b.customers?.full_name;
              const unitNumber = Array.isArray(b.units) ? b.units[0]?.unit_number : b.units?.unit_number;
              const invSum = invByBooking.get(b.id) || 0;
              const paidSum = paidByBooking.get(b.id) || 0;
              const remaining = Math.max(0, invSum - paidSum);
              return { booking_id: b.id, unit_number: unitNumber || '-', customer_name: customerName || '-', remaining };
            })
            .filter((r) => r.remaining > 0.009)
            .sort((a, b) => b.remaining - a.remaining)
            .slice(0, 20);

          remainingTotal = remainingList.reduce((sum, r) => sum + r.remaining, 0);
        }

        setRemainingRows(remainingList);
        setTotals({ invoices: invTotal, payments: payTotal, remaining: remainingTotal });
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [date]);

  useEffect(() => {
    if (!autoprint) return;
    if (loading) return;
    const t = setTimeout(() => window.print(), 250);
    return () => clearTimeout(t);
  }, [autoprint, loading]);

  const groups = useMemo(() => {
    const byType = new Map<string, any[]>();
    for (const e of events) {
      const k = e.event_type || 'other';
      if (!byType.has(k)) byType.set(k, []);
      byType.get(k)!.push(e);
    }
    return byType;
  }, [events]);

  const checkIns = groups.get('check_in') || [];
  const checkOuts = groups.get('check_out') || [];
  const createdBookings = groups.get('booking_created') || [];
  const paymentSettled = groups.get('payment_settled') || [];

  const bookingIdsForMeta = useMemo(() => {
    const ids = new Set<string>();
    for (const e of events || []) {
      if (e.booking_id) ids.add(e.booking_id);
    }
    return Array.from(ids);
  }, [events]);
  const bookingIdsKey = useMemo(() => bookingIdsForMeta.join('|'), [bookingIdsForMeta]);

  const [bookingMeta, setBookingMeta] = useState<Map<string, { unit: string; customer: string; check_in: string; check_out: string }>>(new Map());
  useEffect(() => {
    const run = async () => {
      if (bookingIdsForMeta.length === 0) {
        setBookingMeta(new Map());
        return;
      }
      const { data } = await supabase
        .from('bookings')
        .select('id,check_in,check_out,booking_type, customers(full_name), units(unit_number)')
        .in('id', bookingIdsForMeta);
      const m = new Map<string, { unit: string; customer: string; check_in: string; check_out: string }>();
      (data || []).forEach((b: any) => {
        const customerName = Array.isArray(b.customers) ? b.customers[0]?.full_name : b.customers?.full_name;
        const unitNumber = Array.isArray(b.units) ? b.units[0]?.unit_number : b.units?.unit_number;
        const inD = formatDateOnly(b.check_in);
        const outRaw = formatDateOnly(b.check_out);
        let outD = outRaw;
        if (b.booking_type !== 'daily' && outRaw !== '-') {
          const dt = new Date(`${outRaw}T00:00:00`);
          dt.setDate(dt.getDate() - 1);
          outD = toYMD(dt);
        }
        m.set(b.id, { unit: unitNumber || '-', customer: customerName || '-', check_in: inD, check_out: outD });
      });
      setBookingMeta(m);
    };
    run();
  }, [bookingIdsKey, bookingIdsForMeta]);

  return (
    <RoleGate allow={['admin', 'manager', 'accountant', 'receptionist']}>
      <div className="space-y-6 p-4 sm:p-6 max-w-6xl mx-auto">
        <style>{`
          @media print {
            header, aside, nav, .screen-only { display: none !important; }
            .print-only { display: block !important; }
            body { background: #fff !important; }
            .p-card { break-inside: avoid; }
            .p-table { width: 100%; border-collapse: collapse; }
            .p-table th, .p-table td { border: 1px solid #e5e7eb; padding: 6px 8px; font-size: 10px; }
            .p-table th { background: #f3f4f6; font-weight: 800; }
          }
          .print-only { display: none; }
        `}</style>

        <div className="print-only">
          <div className="flex items-start justify-between border-b pb-3">
            <div>
              <div className="text-lg font-black text-gray-900">تقرير اليوم</div>
              <div className="text-xs text-gray-600">التاريخ: {date}</div>
            </div>
            <div className="text-xs text-gray-600">مساكن</div>
          </div>
        </div>

        {!isEmbed && (
          <div className="screen-only flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <Link href="/" className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
                <ArrowRight size={22} />
              </Link>
              <div>
                <h1 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2">
                  <CalendarDays className="text-blue-600" size={18} />
                  تقرير اليوم
                </h1>
                <p className="text-[11px] sm:text-sm text-gray-500 mt-1">ملخص منظم لكل أحداث اليوم المالية والتشغيلية</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  const v = e.target.value;
                  const sp = new URLSearchParams(searchParams.toString());
                  sp.set('date', v);
                  sp.delete('autoprint');
                  window.location.search = sp.toString();
                }}
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-bold"
              />
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 font-black text-sm hover:bg-gray-50"
              >
                <Download size={18} />
                طباعة
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 flex items-center justify-center gap-2 text-gray-700 font-bold">
            <Loader2 className="animate-spin" size={18} />
            جار تحميل تقرير اليوم…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-card bg-white border border-gray-200 rounded-2xl p-4">
                <div className="text-[11px] text-gray-500 font-bold">حجوزات جديدة</div>
                <div className="text-xl font-black text-gray-900">{createdBookings.length}</div>
              </div>
              <div className="p-card bg-white border border-gray-200 rounded-2xl p-4">
                <div className="text-[11px] text-gray-500 font-bold">تسجيل دخول</div>
                <div className="text-xl font-black text-gray-900">{checkIns.length}</div>
              </div>
              <div className="p-card bg-white border border-gray-200 rounded-2xl p-4">
                <div className="text-[11px] text-gray-500 font-bold">تسجيل خروج</div>
                <div className="text-xl font-black text-gray-900">{checkOuts.length}</div>
              </div>
              <div className="p-card bg-white border border-gray-200 rounded-2xl p-4">
                <div className="text-[11px] text-gray-500 font-bold">سندات اليوم (مقبوض)</div>
                <div className="text-xl font-black text-gray-900">{formatCurrency(totals.payments)}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="font-black text-gray-900 text-sm flex items-center gap-2">
                    <FileText size={18} className="text-blue-600" />
                    تنبيهات النظام (اليوم)
                  </div>
                  <div className="text-[11px] text-gray-500 font-bold">الإجمالي: {events.length}</div>
                </div>
                <table className="p-table w-full text-xs">
                  <thead>
                    <tr>
                      <th className="text-right">الوقت</th>
                      <th className="text-right">العملية</th>
                      <th className="text-right">الوحدة</th>
                      <th className="text-right">العميل</th>
                      <th className="text-right">من</th>
                      <th className="text-right">إلى</th>
                      <th className="text-right">ملاحظة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.slice(0, 60).map((e) => (
                      <tr key={e.id}>
                        <td className="text-right font-mono">{String(e.created_at).split('T')[1]?.slice(0, 5) || ''}</td>
                        <td className="text-right font-bold">
                          {e.event_type === 'booking_created' ? 'حجز جديد' :
                           e.event_type === 'check_in' ? 'تسجيل دخول' :
                           e.event_type === 'check_out' ? 'تسجيل خروج' :
                           e.event_type === 'payment_settled' ? 'سداد' :
                           e.event_type === 'invoice_issued' ? 'إصدار فاتورة' : e.event_type}
                        </td>
                        <td className="text-right">{e.booking_id && bookingMeta.get(e.booking_id)?.unit ? bookingMeta.get(e.booking_id)!.unit : '-'}</td>
                        <td className="text-right">{e.booking_id && bookingMeta.get(e.booking_id)?.customer ? bookingMeta.get(e.booking_id)!.customer : '-'}</td>
                        <td className="text-right font-mono">{e.booking_id && bookingMeta.get(e.booking_id)?.check_in ? bookingMeta.get(e.booking_id)!.check_in : '-'}</td>
                        <td className="text-right font-mono">{e.booking_id && bookingMeta.get(e.booking_id)?.check_out ? bookingMeta.get(e.booking_id)!.check_out : '-'}</td>
                        <td className="text-right">{e.message}</td>
                      </tr>
                    ))}
                    {events.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-6 text-gray-600 font-bold">لا توجد تنبيهات لهذا اليوم</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="space-y-4">
                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                  <div className="font-black text-gray-900 text-sm mb-2">الملخص المالي</div>
                  <div className="space-y-2 text-[12px]">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 font-bold">فواتير اليوم</span>
                      <span className="font-black text-gray-900">{formatCurrency(totals.invoices)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 font-bold">مقبوض اليوم</span>
                      <span className="font-black text-gray-900">{formatCurrency(totals.payments)}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-red-700 font-black">متبقي (نزلاء داخل)</span>
                      <span className="text-red-800 font-black">{formatCurrency(totals.remaining)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                  <div className="font-black text-gray-900 text-sm mb-2">تنبيهات اليوم</div>
                  <div className="space-y-2 text-[11px] text-gray-700">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">سداد</span>
                      <span className="font-black">{paymentSettled.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold">إصدار فاتورة</span>
                      <span className="font-black">{todayInvoices.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold">حجز جديد</span>
                      <span className="font-black">{createdBookings.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold">دخول / خروج</span>
                      <span className="font-black">{checkIns.length + checkOuts.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="font-black text-gray-900 text-sm">المتبقي على الحجوزات الحالية</div>
                <div className="text-[11px] text-gray-500 font-bold">({remainingRows.length})</div>
              </div>
              <table className="p-table w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-right">الوحدة</th>
                    <th className="text-right">العميل</th>
                    <th className="text-right">المتبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {remainingRows.map((r) => (
                    <tr key={r.booking_id}>
                      <td className="text-right font-bold">{r.unit_number}</td>
                      <td className="text-right">{r.customer_name}</td>
                      <td className="text-right font-black text-red-700">{formatCurrency(r.remaining)}</td>
                    </tr>
                  ))}
                  {remainingRows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center py-6 text-gray-600 font-bold">لا توجد مبالغ متبقية على النزلاء الحاليين</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <div className="font-black text-gray-900 text-sm mb-3">فواتير اليوم</div>
                <table className="p-table w-full text-xs">
                  <thead>
                    <tr>
                      <th className="text-right">رقم</th>
                      <th className="text-right">التاريخ</th>
                      <th className="text-right">المبلغ</th>
                      <th className="text-right">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayInvoices.slice(0, 20).map((i) => (
                      <tr key={i.id}>
                        <td className="text-right font-mono font-bold">{i.invoice_number || '-'}</td>
                        <td className="text-right font-mono">{formatDateOnly(i.invoice_date || i.created_at)}</td>
                        <td className="text-right font-black">{formatCurrency(Number(i.total_amount) || 0)}</td>
                        <td className="text-right">{i.status}</td>
                      </tr>
                    ))}
                    {todayInvoices.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center py-6 text-gray-600 font-bold">لا توجد فواتير صدرت اليوم</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <div className="font-black text-gray-900 text-sm mb-3">سندات اليوم (مقبوض)</div>
                <table className="p-table w-full text-xs">
                  <thead>
                    <tr>
                      <th className="text-right">الوقت</th>
                      <th className="text-right">المبلغ</th>
                      <th className="text-right">الطريقة</th>
                      <th className="text-right">الوصف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayPayments.slice(0, 25).map((p) => (
                      <tr key={p.id}>
                        <td className="text-right font-mono">{String(p.created_at).split('T')[1]?.slice(0, 5) || ''}</td>
                        <td className="text-right font-black">{formatCurrency(Number(p.amount) || 0)}</td>
                        <td className="text-right">{(p.payment_method as any)?.name || '-'}</td>
                        <td className="text-right">{p.description || '-'}</td>
                      </tr>
                    ))}
                    {todayPayments.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center py-6 text-gray-600 font-bold">لا توجد سندات قبض مرحلة اليوم</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-4 text-[11px] text-gray-600 font-bold">
              ملاحظة: تقرير اليوم يعتمد على سجلات النظام (system_events) وحركات السندات/الفواتير المسجلة بتاريخ اليوم.
            </div>
          </>
        )}
      </div>
    </RoleGate>
  );
}
