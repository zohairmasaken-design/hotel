'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight, ExternalLink, RefreshCw } from 'lucide-react';
import RoleGate from '@/components/auth/RoleGate';
import { supabase } from '@/lib/supabase';

const ymd = (value: string | null) => {
  if (!value) return '-';
  const s = String(value);
  if (s.includes('T')) return s.split('T')[0];
  if (s.includes(' ')) return s.split(' ')[0];
  return s;
};

const toNum = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtSAR = (v: number | null) => {
  if (v == null) return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return `${Math.round(n * 100) / 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const parseBirthDateFromDetails = (details: string | null) => {
  if (!details) return null;
  const text = String(details);
  const m1 = text.match(/تاريخ\s*الميلاد[:\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
  if (m1?.[1]) return m1[1];
  const m2 = text.match(/تاريخ\s*الميلاد[:\-]?\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/);
  if (m2?.[1]) return m2[1];
  return null;
};

const monthsByNearest30 = (start: string | null, end: string | null) => {
  const s = ymd(start);
  const e = ymd(end);
  if (s === '-' || e === '-') return null;
  const sd = new Date(`${s}T00:00:00`);
  const ed = new Date(`${e}T00:00:00`);
  if (Number.isNaN(sd.getTime()) || Number.isNaN(ed.getTime())) return null;
  const days = Math.max(0, Math.round((ed.getTime() - sd.getTime()) / (1000 * 60 * 60 * 24)));
  return Math.max(1, Math.round(days / 30));
};

const ejarStatusLabel = (s: string | null) => {
  if (s === 'confirmed') return 'تم التأكيد';
  if (s === 'rejected') return 'تم الرفض';
  return 'تم الرفع بانتظار التأكيد';
};

export default function EjarContractDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = String((params as any)?.id || '');

  const [loading, setLoading] = useState(false);
  const [eventRow, setEventRow] = useState<any | null>(null);
  const [booking, setBooking] = useState<any | null>(null);
  const [customer, setCustomer] = useState<any | null>(null);
  const [invoice, setInvoice] = useState<any | null>(null);
  const [bookingInvoices, setBookingInvoices] = useState<any[]>([]);
  const [invoicePayments, setInvoicePayments] = useState<any[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');

  const loadInvoicePayments = async (invoiceId: string | null) => {
    if (!invoiceId) {
      setInvoicePayments([]);
      return;
    }
    const { data: pays, error: payErr } = await supabase
      .from('payments')
      .select('id, amount, payment_date, payment_method_id, journal_entry_id, description')
      .eq('invoice_id', invoiceId)
      .order('payment_date', { ascending: true });
    if (payErr) throw payErr;

    const list = pays || [];
    const pmIds = Array.from(new Set(list.map((p: any) => p.payment_method_id).filter(Boolean)));
    const jeIds = Array.from(new Set(list.map((p: any) => p.journal_entry_id).filter(Boolean)));

    const [pmRes, jeRes] = await Promise.all([
      pmIds.length > 0 ? supabase.from('payment_methods').select('id, name').in('id', pmIds) : Promise.resolve({ data: [], error: null } as any),
      jeIds.length > 0
        ? supabase.from('journal_entries').select('id, voucher_number, entry_date').in('id', jeIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (pmRes.error) throw pmRes.error;
    if (jeRes.error) throw jeRes.error;

    const pmMap = new Map<string, string>();
    (pmRes.data || []).forEach((m: any) => pmMap.set(String(m.id), String(m.name || '')));
    const jeMap = new Map<string, { voucher_number?: string; entry_date?: string }>();
    (jeRes.data || []).forEach((j: any) => jeMap.set(String(j.id), { voucher_number: j.voucher_number, entry_date: j.entry_date }));

    setInvoicePayments(
      list.map((p: any) => {
        const je = p.journal_entry_id ? jeMap.get(String(p.journal_entry_id)) : undefined;
        return {
          id: p.id,
          amount: toNum(p.amount),
          payment_date: p.payment_date ? String(p.payment_date) : null,
          description: p.description ? String(p.description) : null,
          payment_method_name: p.payment_method_id ? pmMap.get(String(p.payment_method_id)) || null : null,
          voucher_number: je?.voucher_number ? String(je.voucher_number) : null,
          entry_date: je?.entry_date ? String(je.entry_date) : null,
        };
      })
    );
  };

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: evt, error: evtErr } = await supabase
        .from('ejar_contract_uploads')
        .select('id, created_at, booking_id, customer_id, invoice_id, check_in, check_out, customer_birth_date, customer_birth_date_text, customer_birth_calendar, supervisor_note, status, upload_notes, decision_notes, uploaded_by_email, uploaded_at, decided_by_email, decided_at')
        .eq('id', id)
        .maybeSingle();

      if (evtErr) throw evtErr;
      if (!evt) {
        setEventRow(null);
        setBooking(null);
        setCustomer(null);
        setInvoice(null);
        setBookingInvoices([]);
        setInvoicePayments([]);
        return;
      }

      setEventRow(evt);

      const bookingId = evt?.booking_id || null;
      const customerId = evt?.customer_id || null;
      const invoiceId = evt?.invoice_id || null;

      const [bookingRes, customerRes] = await Promise.all([
        bookingId
          ? supabase
              .from('bookings')
              .select(
                `
                id,
                status,
                booking_type,
                booking_source,
                check_in,
                check_out,
                total_price,
                subtotal,
                tax_amount,
                discount_amount,
                unit:units(
                  unit_number,
                  floor,
                  view_type,
                  hotel:hotels(name, tax_rate),
                  unit_type:unit_types(name, daily_price, annual_price)
                )
              `
              )
              .eq('id', bookingId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        customerId
          ? supabase.from('customers').select('id, full_name, phone, national_id, details').eq('id', customerId).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
      ]);

      if (bookingRes.error) throw bookingRes.error;
      if (customerRes.error) throw customerRes.error;

      setBooking(bookingRes.data || null);
      setCustomer(customerRes.data || null);

      if (bookingId) {
        const { data: invs, error: invErr } = await supabase
          .from('invoices')
          .select('id, invoice_number, status, invoice_date, due_date, subtotal, discount_amount, additional_services_amount, tax_amount, total_amount, paid_amount, created_at')
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: false });
        if (invErr) throw invErr;
        setBookingInvoices(invs || []);

        const nonVoid = (invs || []).filter((i: any) => String(i?.status || '') !== 'void');
        const chosen =
          (invoiceId ? nonVoid.find((i: any) => String(i?.id || '') === String(invoiceId)) : null) ||
          nonVoid.find((i: any) => !String(i?.invoice_number || '').includes('-EXT-')) ||
          nonVoid[0] ||
          null;
        setInvoice(chosen);
        setSelectedInvoiceId(chosen?.id ? String(chosen.id) : '');

        await loadInvoicePayments(chosen?.id ? String(chosen.id) : null);
      } else {
        setBookingInvoices([]);
        setInvoice(null);
        setSelectedInvoiceId('');
        setInvoicePayments([]);
      }
    } catch (err: any) {
      alert('حدث خطأ أثناء تحميل تفاصيل عقد إيجار: ' + String(err?.message || err || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (!selectedInvoiceId) return;
    const found = (bookingInvoices || []).find((i: any) => String(i?.id || '') === String(selectedInvoiceId));
    if (!found) return;
    if (invoice?.id && String(invoice.id) === String(found.id)) return;
    setInvoice(found);
    (async () => {
      try {
        await loadInvoicePayments(String(found.id));
      } catch (err: any) {
        alert('تعذر تحميل سندات السداد لهذه الفاتورة: ' + String(err?.message || err || 'خطأ غير معروف'));
      }
    })();
  }, [selectedInvoiceId, bookingInvoices]);

  const derived = useMemo(() => {
    const nonVoid = (bookingInvoices || []).filter((i: any) => String(i?.status || '') !== 'void');
    const sumSubtotal = nonVoid.reduce((acc: number, i: any) => acc + toNum(i?.subtotal), 0);
    const sumDiscount = nonVoid.reduce((acc: number, i: any) => acc + toNum(i?.discount_amount), 0);
    const sumExtras = nonVoid.reduce((acc: number, i: any) => acc + toNum(i?.additional_services_amount), 0);
    const sumTax = nonVoid.reduce((acc: number, i: any) => acc + toNum(i?.tax_amount), 0);
    const sumTotal = nonVoid.reduce((acc: number, i: any) => acc + toNum(i?.total_amount), 0);
    const invoiceCount = (bookingInvoices || []).length;
    const months = monthsByNearest30(booking?.check_in || null, booking?.check_out || null);
    const baseAfterDiscount = Math.max(0, sumSubtotal - sumDiscount);
    const taxableBeforeTax = Math.max(0, baseAfterDiscount + sumExtras);
    const perMonthBase = months && months > 0 ? Math.round((sumSubtotal / months) * 100) / 100 : null;
    const birthFromUpload = (() => {
      const text = eventRow?.customer_birth_date_text ? String(eventRow.customer_birth_date_text) : null;
      const cal = eventRow?.customer_birth_calendar ? String(eventRow.customer_birth_calendar) : null;
      if (!text) return null;
      const suffix = cal === 'hijri' ? ' (هجري)' : cal === 'gregorian' ? ' (ميلادي)' : '';
      return `${text}${suffix}`;
    })();
    const birthDate =
      birthFromUpload ||
      (eventRow?.customer_birth_date ? String(eventRow.customer_birth_date) : null) ||
      parseBirthDateFromDetails(customer?.details ? String(customer.details) : null);
    const invoicePaid = (invoicePayments || []).reduce((acc: number, p: any) => acc + toNum(p?.amount), 0);
    const invoiceTotal = invoice?.total_amount != null ? toNum(invoice.total_amount) : null;
    const invoiceRemaining = invoiceTotal != null ? Math.max(0, Math.round((invoiceTotal - invoicePaid) * 100) / 100) : null;
    return {
      sumSubtotal,
      sumDiscount,
      sumExtras,
      sumTax,
      sumTotal,
      invoiceCount,
      months,
      baseAfterDiscount,
      taxableBeforeTax,
      perMonthBase,
      birthDate,
      invoicePaid,
      invoiceTotal,
      invoiceRemaining
    };
  }, [bookingInvoices, booking, customer, invoicePayments, invoice, eventRow]);

  return (
    <RoleGate allow={['admin']}>
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div className="flex items-center gap-3">
            <Link href="/reports/ejar-contracts" className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
              <ArrowRight size={22} />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900">تفاصيل عقد منصة إيجار</h1>
              <div className="text-xs text-gray-500 mt-1 dir-ltr">
                ID: <span className="font-bold">{id}</span>
              </div>
            </div>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
            disabled={loading}
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'جارٍ التحديث...' : 'تحديث'}</span>
          </button>
        </div>

        {!eventRow ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-gray-500">
            لا توجد بيانات لهذا السجل.
          </div>
        ) : (
          <>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-black text-gray-900 mb-2">معلومات الرفع</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-xs text-gray-500">تاريخ الرفع</div>
                  <div className="font-bold">{new Date(String(eventRow.uploaded_at || eventRow.created_at)).toLocaleString('ar-SA')}</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-xs text-gray-500">الحالة</div>
                  <div className="font-black text-gray-900">{ejarStatusLabel(String(eventRow.status || 'pending_confirmation'))}</div>
                  <div className="text-xs text-gray-500 mt-1">تم الرفع بواسطة</div>
                  <div className="font-bold text-gray-800 dir-ltr">{eventRow.uploaded_by_email || '-'}</div>
                </div>
              </div>
              {eventRow.supervisor_note ? (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="text-xs font-black text-red-800 mb-1">ملاحظة للمشرف</div>
                  <div className="text-sm font-bold text-red-900 whitespace-pre-wrap">{String(eventRow.supervisor_note)}</div>
                </div>
              ) : null}
              {(eventRow.upload_notes || eventRow.decision_notes) ? (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                    <div className="text-xs text-gray-500">ملاحظات الرفع</div>
                    <div className="text-sm font-bold text-gray-800 whitespace-pre-wrap">{eventRow.upload_notes || '-'}</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                    <div className="text-xs text-gray-500">ملاحظات القرار</div>
                    <div className="text-sm font-bold text-gray-800 whitespace-pre-wrap">{eventRow.decision_notes || '-'}</div>
                    <div className="text-xs text-gray-500 mt-2">تم القرار بواسطة</div>
                    <div className="text-xs font-bold text-gray-700 dir-ltr">{eventRow.decided_by_email || '-'}</div>
                    <div className="text-xs text-gray-500 mt-1">تاريخ القرار</div>
                    <div className="text-xs font-bold text-gray-700 dir-ltr">{eventRow.decided_at ? ymd(String(eventRow.decided_at)) : '-'}</div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-black text-gray-900 mb-2">العميل</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-xs text-gray-500">الاسم</div>
                  <div className="font-bold">{customer?.full_name || '-'}</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-xs text-gray-500">الجوال</div>
                  <div className="font-bold dir-ltr">{customer?.phone || '-'}</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-xs text-gray-500">الهوية</div>
                  <div className="font-bold dir-ltr">{customer?.national_id || '-'}</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-xs text-gray-500">تاريخ الميلاد</div>
                  <div className="font-bold dir-ltr">{derived.birthDate || '-'}</div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-black text-gray-900 mb-2">الحجز</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-xs text-gray-500">الوحدة</div>
                  <div className="font-bold">
                    {booking?.unit?.unit_number || '-'} {booking?.unit?.unit_type?.name ? `— ${booking.unit.unit_type.name}` : ''}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {booking?.unit?.hotel?.name ? `الفندق: ${booking.unit.hotel.name}` : 'الفندق: -'}
                  </div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-xs text-gray-500">الفترة</div>
                  <div className="font-bold dir-ltr">{ymd(booking?.check_in || null)} → {ymd(booking?.check_out || null)}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    الحالة: <span className="font-bold">{booking?.status || '-'}</span> • النوع: <span className="font-bold">{booking?.booking_type || '-'}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {booking?.id ? (
                  <Link
                    href={`/bookings-list/${booking.id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-xs font-bold text-gray-700"
                  >
                    <ExternalLink size={14} />
                    فتح الحجز
                  </Link>
                ) : null}
                {booking?.id ? (
                  <Link
                    href={`/print/contract/${booking.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-xs font-bold text-gray-700"
                  >
                    <ExternalLink size={14} />
                    طباعة العقد
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-sm font-black text-gray-900">الفاتورة</div>
                {invoice?.id ? (
                  <Link
                    href={`/print/invoice/${invoice.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-xs font-bold text-gray-700"
                  >
                    <ExternalLink size={14} />
                    طباعة الفاتورة
                  </Link>
                ) : null}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-sm">
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                  <div className="text-xs font-black text-gray-800 mb-2">ملخص الإقامة</div>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-500">عدد الفواتير</span>
                      <span className="font-black text-gray-900">{derived.invoiceCount}</span>
                    </div>
                    {bookingInvoices.length > 1 ? (
                      <div className="pt-2">
                        <div className="text-[11px] text-gray-500 mb-1">اختيار فاتورة للعرض</div>
                        <select
                          value={selectedInvoiceId}
                          onChange={(e) => setSelectedInvoiceId(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg bg-white text-xs font-bold"
                        >
                          {(bookingInvoices || []).map((inv: any) => {
                            const n = String(inv?.invoice_number || '');
                            const isExt = n.includes('-EXT-');
                            const dt = ymd(inv?.invoice_date || inv?.created_at || null);
                            const total = toNum(inv?.total_amount);
                            const status = String(inv?.status || '-');
                            return (
                              <option key={String(inv.id)} value={String(inv.id)}>
                                {(isExt ? 'تمديد' : 'أساسية')} • {n || String(inv.id).slice(0, 8)} • {dt} • {fmtSAR(total)} ر.س • {status}
                              </option>
                            );
                          })}
                        </select>
                        {eventRow?.invoice_id ? (
                          <div className="mt-1 text-[11px] text-gray-600">
                            الفاتورة المرفوعة وقت رفع العقد: <span className="font-black dir-ltr">{String(eventRow.invoice_id).slice(0, 8)}</span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="h-px bg-gray-200 my-2" />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-500">رقم الفاتورة</span>
                      <span className="font-black text-gray-900 dir-ltr">{invoice?.invoice_number || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-500">الحالة</span>
                      <span className="font-bold text-gray-800">{invoice?.status || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-500">التاريخ</span>
                      <span className="font-bold text-gray-800 dir-ltr">{ymd(invoice?.invoice_date || invoice?.created_at || null)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 lg:col-span-2">
                  <div className="text-xs font-black text-gray-800 mb-2">تفاصيل المبلغ (مثل الفاتورة)</div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-white border border-gray-100 rounded-lg p-3">
                      <div className="text-[11px] text-gray-500">عدد الأشهر</div>
                      <div className="text-lg font-black text-gray-900">{derived.months ?? '-'}</div>
                      <div className="mt-2 text-[11px] text-gray-500">قيمة الشهر (قبل الخصم والإضافة)</div>
                      <div className="text-lg font-black text-gray-900">
                        {derived.perMonthBase != null ? `${fmtSAR(derived.perMonthBase)} ر.س` : '-'}
                      </div>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
                      <div className="divide-y divide-gray-100 text-xs">
                        <div className="flex items-center justify-between gap-2 px-3 py-2">
                          <span className="text-gray-600">إجمالي الإقامة</span>
                          <span className="font-black text-gray-900">{fmtSAR(derived.sumSubtotal)} ر.س</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 px-3 py-2">
                          <span className="text-gray-600">الخصم</span>
                          <span className="font-bold text-gray-900">{fmtSAR(derived.sumDiscount)} ر.س</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 px-3 py-2">
                          <span className="text-gray-600">الإضافة</span>
                          <span className="font-bold text-gray-900">{fmtSAR(derived.sumExtras)} ر.س</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-50">
                          <span className="text-amber-900 font-bold">قبل الضريبة</span>
                          <span className="font-black text-amber-950">{fmtSAR(derived.taxableBeforeTax)} ر.س</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 px-3 py-2">
                          <span className="text-gray-600">الضريبة</span>
                          <span className="font-bold text-gray-900">{fmtSAR(derived.sumTax)} ر.س</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-emerald-50">
                          <span className="text-emerald-900 font-black">الإجمالي</span>
                          <span className="font-black text-emerald-950 text-sm">{fmtSAR(derived.sumTotal)} ر.س</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 text-[11px] text-gray-500">
                    إجمالي الإقامة هو مجموع Subtotal لفواتير الحجز (بدون الخصم والإضافة والضريبة). قيمة الشهر تُحسب قبل الخصم والإضافة.
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-black text-gray-900 mb-3">سندات السداد المرتبطة بالفاتورة</div>

              {!invoice?.id ? (
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 text-sm text-gray-600">
                  لا توجد فاتورة لعرض سندات السداد.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3 text-sm">
                    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                      <div className="text-xs text-gray-500">إجمالي الفاتورة</div>
                      <div className="text-lg font-black text-gray-900">{derived.invoiceTotal != null ? `${fmtSAR(derived.invoiceTotal)} ر.س` : '-'}</div>
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                      <div className="text-xs text-gray-500">إجمالي المسدد</div>
                      <div className="text-lg font-black text-gray-900">{fmtSAR(derived.invoicePaid)} ر.س</div>
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                      <div className="text-xs text-gray-500">المتبقي</div>
                      <div className="text-lg font-black text-gray-900">{derived.invoiceRemaining != null ? `${fmtSAR(derived.invoiceRemaining)} ر.س` : '-'}</div>
                    </div>
                  </div>

                  {invoicePayments.length === 0 ? (
                    <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 text-sm text-gray-600">
                      لا توجد سندات سداد مرتبطة بهذه الفاتورة.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-gray-200 rounded-xl">
                      <table className="w-full text-sm text-right">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">التاريخ</th>
                            <th className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">المبلغ</th>
                            <th className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">الطريقة</th>
                            <th className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">رقم القيد</th>
                            <th className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">الوصف</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {invoicePayments.map((p: any) => (
                            <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-2 whitespace-nowrap font-bold text-gray-900 dir-ltr">
                                {ymd(p.payment_date)}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap font-black text-gray-900">
                                {fmtSAR(toNum(p.amount))} ر.س
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-gray-700">
                                {p.payment_method_name || '-'}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-gray-700 dir-ltr">
                                {p.voucher_number || '-'}
                              </td>
                              <td className="px-4 py-2 text-gray-700">
                                {p.description || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </RoleGate>
  );
}
