'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight, ExternalLink, RefreshCw } from 'lucide-react';
import RoleGate from '@/components/auth/RoleGate';
import { supabase } from '@/lib/supabase';
import { addDays, differenceInDays, format } from 'date-fns';
import { useUserRole } from '@/hooks/useUserRole';
import { useActiveHotel } from '@/hooks/useActiveHotel';

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

const formatMonthsLabel = (months: number | null | undefined) => {
  const m = months == null ? null : Number(months);
  if (m == null || !Number.isFinite(m) || m <= 0) return '-';
  if (m === 0.25) return 'ربع شهر';
  if (m === 0.5) return 'نصف شهر';
  if (m === 1) return 'شهر';
  if (m === 2) return 'شهرين';
  if (m >= 3 && m <= 10) return `${m} أشهر`;
  return `${m} شهر`;
};

const ejarStatusLabel = (s: string | null) => {
  if (s === 'confirmed') return 'تم التأكيد';
  if (s === 'rejected') return 'تم الرفض';
  return 'تم الرفع بانتظار التأكيد';
};

export default function EjarContractDetailsPage() {
  const { role } = useUserRole();
  const isAdmin = role === 'admin';
  const { activeHotelId } = useActiveHotel();
  const selectedHotelId = activeHotelId || 'all';
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
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionType, setDecisionType] = useState<'confirm' | 'reject'>('confirm');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [docBusy, setDocBusy] = useState(false);

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
        .select('id, created_at, booking_id, customer_id, invoice_id, check_in, check_out, customer_birth_date, customer_birth_date_text, customer_birth_calendar, supervisor_note, is_payment_verified, is_platform_verified, status, upload_notes, decision_notes, uploaded_by_email, uploaded_at, decided_by_email, decided_at')
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
                hotel_id,
                status,
                booking_type,
                booking_source,
                check_in,
                check_out,
                nights,
                additional_services,
                total_price,
                subtotal,
                tax_amount,
                discount_amount,
                unit:units(
                  unit_number,
                  floor,
                  view_type,
                  hotel:hotels(id, name, tax_rate),
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

  const bookingHotelId = useMemo(() => {
    if (!booking) return null;
    if (booking?.hotel_id) return String(booking.hotel_id);
    const hid = booking?.unit?.hotel?.id;
    return hid ? String(hid) : null;
  }, [booking]);

  const bookingHotelName = useMemo(() => {
    const n = booking?.unit?.hotel?.name;
    return n ? String(n) : '-';
  }, [booking]);

  const hotelMismatch = useMemo(() => {
    if (selectedHotelId === 'all') return false;
    if (!bookingHotelId) return false;
    return String(bookingHotelId) !== String(selectedHotelId);
  }, [selectedHotelId, bookingHotelId]);

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

  const openDecision = (type: 'confirm' | 'reject') => {
    if (!isAdmin) return;
    setDecisionType(type);
    setDecisionNotes('');
    setDecisionOpen(true);
  };

  const submitDecision = async () => {
    if (!isAdmin) return;
    if (!eventRow?.id) return;
    if (decisionBusy) return;
    if (!decisionNotes.trim()) {
      alert('اكتب ملاحظات قبل المتابعة.');
      return;
    }
    setDecisionBusy(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const actorId = authData?.user?.id || null;
      const actorEmail = authData?.user?.email || null;
      if (!actorId) {
        alert('يجب تسجيل الدخول لتنفيذ العملية.');
        return;
      }
      const nowIso = new Date().toISOString();
      const newStatus = decisionType === 'confirm' ? 'confirmed' : 'rejected';
      const { data, error } = await supabase
        .from('ejar_contract_uploads')
        .update({
          status: newStatus,
          decision_notes: decisionNotes.trim(),
          decided_by: actorId,
          decided_by_email: actorEmail,
          decided_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', eventRow.id)
        .select('id, created_at, booking_id, customer_id, invoice_id, check_in, check_out, customer_birth_date, customer_birth_date_text, customer_birth_calendar, supervisor_note, is_payment_verified, is_platform_verified, status, upload_notes, decision_notes, uploaded_by_email, uploaded_at, decided_by_email, decided_at')
        .maybeSingle();
      if (error) throw error;
      if (data) setEventRow(data);
      setDecisionOpen(false);
    } catch (err: any) {
      alert('تعذر حفظ القرار: ' + String(err?.message || err || 'خطأ غير معروف'));
    } finally {
      setDecisionBusy(false);
    }
  };

  const approvalCountdown = useMemo(() => {
    if (!eventRow) return null;
    if (String(eventRow?.status || '') !== 'confirmed') return null;
    const base = eventRow?.decided_at || eventRow?.uploaded_at || eventRow?.created_at || null;
    if (!base) return null;
    const decidedAt = new Date(String(base));
    if (Number.isNaN(decidedAt.getTime())) return null;
    const decidedDay = new Date(decidedAt);
    decidedDay.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const elapsed = Math.max(0, differenceInDays(today, decidedDay));
    const remaining = Math.max(0, 7 - elapsed);
    const deadline = addDays(decidedDay, 7);
    return {
      remaining,
      decidedDate: format(decidedDay, 'yyyy-MM-dd'),
      deadlineDate: format(deadline, 'yyyy-MM-dd'),
    };
  }, [eventRow]);

  const markSupervisorNoteDocumented = async () => {
    if (!isAdmin) return;
    if (!eventRow?.id) return;
    if (docBusy) return;
    const current = String(eventRow?.supervisor_note || '').trim();
    if (current === 'تم توثيق') return;
    if (!confirm('هل تريد تحديث ملاحظة المشرف إلى: (تم توثيق) ؟')) return;
    setDocBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('ejar_contract_uploads')
        .update({ supervisor_note: 'تم توثيق', updated_at: nowIso })
        .eq('id', eventRow.id)
        .select('id, created_at, booking_id, customer_id, invoice_id, check_in, check_out, customer_birth_date, customer_birth_date_text, customer_birth_calendar, supervisor_note, is_payment_verified, is_platform_verified, status, upload_notes, decision_notes, uploaded_by_email, uploaded_at, decided_by_email, decided_at')
        .maybeSingle();
      if (error) throw error;
      if (data) setEventRow(data);
    } catch (err: any) {
      alert('تعذر توثيق الملاحظة: ' + String(err?.message || err || 'خطأ غير معروف'));
    } finally {
      setDocBusy(false);
    }
  };

  const derived = useMemo(() => {
    const nonVoid = (bookingInvoices || []).filter((i: any) => String(i?.status || '') !== 'void');
    const sumSubtotal = nonVoid.reduce((acc: number, i: any) => acc + toNum(i?.subtotal), 0);
    const sumDiscount = nonVoid.reduce((acc: number, i: any) => acc + toNum(i?.discount_amount), 0);
    const sumExtras = nonVoid.reduce((acc: number, i: any) => acc + toNum(i?.additional_services_amount), 0);
    const sumTax = nonVoid.reduce((acc: number, i: any) => acc + toNum(i?.tax_amount), 0);
    const sumTotal = nonVoid.reduce((acc: number, i: any) => acc + toNum(i?.total_amount), 0);
    const invoiceCount = (bookingInvoices || []).length;
    const periodStart = eventRow?.check_in ? String(eventRow.check_in) : (booking?.check_in || null);
    const periodEnd = eventRow?.check_out ? String(eventRow.check_out) : (booking?.check_out || null);
    const months = monthsByNearest30(periodStart, periodEnd);
    const baseAfterDiscount = Math.max(0, sumSubtotal - sumDiscount);
    const taxableBeforeTax = Math.max(0, baseAfterDiscount + sumExtras);
    const perMonthBase = months && months > 0 ? Math.round((sumSubtotal / months) * 100) / 100 : null;
    const platformFee = Math.max(0, Math.round(sumExtras * 100) / 100);
    const adjustedTotal = Math.max(0, Math.round((sumTotal - sumExtras) * 100) / 100);
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
      periodStart: periodStart ? ymd(String(periodStart)) : '-',
      periodEnd: periodEnd ? ymd(String(periodEnd)) : '-',
      baseAfterDiscount,
      taxableBeforeTax,
      perMonthBase,
      platformFee,
      adjustedTotal,
      birthDate,
      invoicePaid,
      invoiceTotal,
      invoiceRemaining
    };
  }, [bookingInvoices, booking, customer, invoicePayments, invoice, eventRow]);

  return (
    <RoleGate allow={['admin', 'manager', 'receptionist', 'housekeeping', 'accountant', 'marketing']}>
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
              <div className="text-xs text-gray-500 mt-1">
                الفندق: <span className="font-black text-gray-800">{bookingHotelName}</span>
                {hotelMismatch ? <span className="mr-2 px-2 py-0.5 rounded-full border bg-amber-50 text-amber-900 border-amber-200 text-[10px] font-black">ليس ضمن الفندق المحدد</span> : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && eventRow && String(eventRow?.status || '') === 'pending_confirmation' ? (
              <>
                <button
                  type="button"
                  onClick={() => openDecision('confirm')}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors text-sm font-black disabled:opacity-60"
                  disabled={loading}
                >
                  تأكيد
                </button>
                <button
                  type="button"
                  onClick={() => openDecision('reject')}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors text-sm font-black disabled:opacity-60"
                  disabled={loading}
                >
                  رفض
                </button>
              </>
            ) : null}
            <button
              onClick={load}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
              disabled={loading}
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              <span>{loading ? 'جارٍ التحديث...' : 'تحديث'}</span>
            </button>
          </div>
        </div>

        {isAdmin && decisionOpen ? (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={() => (decisionBusy ? null : setDecisionOpen(false))} />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                <div className={`px-4 py-3 border-b flex items-center justify-between ${decisionType === 'confirm' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <div className={`font-black text-sm ${decisionType === 'confirm' ? 'text-emerald-800' : 'text-red-800'}`}>
                    {decisionType === 'confirm' ? 'تأكيد عقد إيجار' : 'رفض عقد إيجار'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDecisionOpen(false)}
                    disabled={decisionBusy}
                    className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-xs font-black disabled:opacity-60"
                  >
                    إغلاق
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  <div className="text-xs font-black text-gray-700">ملاحظات (إجباري)</div>
                  <textarea
                    value={decisionNotes}
                    onChange={(e) => setDecisionNotes(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border rounded-xl text-sm"
                    disabled={decisionBusy}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setDecisionOpen(false)}
                      disabled={decisionBusy}
                      className="px-4 py-2 rounded-xl border bg-white hover:bg-gray-50 text-sm font-black disabled:opacity-60"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={submitDecision}
                      disabled={decisionBusy}
                      className={`px-4 py-2 rounded-xl text-white text-sm font-black disabled:opacity-60 ${decisionType === 'confirm' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                    >
                      {decisionType === 'confirm' ? 'تأكيد' : 'رفض'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {!eventRow ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-gray-500">
            لا توجد بيانات لهذا السجل.
          </div>
        ) : (
          <>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-black text-gray-900 mb-3">بطاقة الملخص</div>
              {approvalCountdown ? (
                <div className={`mb-2 rounded-xl border p-3 text-sm ${approvalCountdown.remaining > 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className={`${approvalCountdown.remaining > 0 ? 'text-blue-900' : 'text-red-900'} text-xs font-black`}>
                      تم تأكيد العقد وبانتظار الموافقة
                    </div>
                    {String(eventRow?.supervisor_note || '').trim() === 'تم توثيق' ? (
                      <span className="px-3 py-1.5 rounded-lg border bg-white text-[11px] font-black text-emerald-800 border-emerald-200">
                        موثق
                      </span>
                    ) : isAdmin ? (
                      <button
                        type="button"
                        onClick={markSupervisorNoteDocumented}
                        disabled={docBusy}
                        className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-[11px] font-black text-gray-800 disabled:opacity-60"
                      >
                        تم توثيق
                      </button>
                    ) : (
                      <span className="px-3 py-1.5 rounded-lg border bg-white text-[11px] font-black text-gray-700 border-gray-200">
                        غير موثق
                      </span>
                    )}
                  </div>
                  {approvalCountdown.remaining > 0 ? (
                    <div className="font-bold text-blue-900">متبقي {approvalCountdown.remaining} يوم من مدة 7 أيام للموافقة.</div>
                  ) : (
                    <div className="font-bold text-red-900">انتهت مدة 7 أيام للموافقة.</div>
                  )}
                  <div className={`mt-2 text-[11px] font-bold dir-ltr ${approvalCountdown.remaining > 0 ? 'text-blue-800' : 'text-red-800'}`}>
                    confirmed: {approvalCountdown.decidedDate} • deadline: {approvalCountdown.deadlineDate}
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-1 md:grid-cols-6 gap-2 text-sm">
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 md:col-span-2">
                  <div className="text-xs text-gray-500">رقم الوحدة</div>
                  <div className="font-black text-gray-900">{booking?.unit?.unit_number || '-'}</div>
                  <div className="text-xs text-gray-500 mt-1">{booking?.unit?.unit_type?.name ? String(booking.unit.unit_type.name) : ''}</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-xs text-gray-500">تاريخ الدخول</div>
                  <div className="font-black text-gray-900 dir-ltr">{derived.periodStart}</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-xs text-gray-500">المدة</div>
                  <div className="font-black text-gray-900">{formatMonthsLabel(derived.months)}</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-xs text-gray-500">تاريخ الخروج</div>
                  <div className="font-black text-gray-900 dir-ltr">{derived.periodEnd}</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 md:col-span-3">
                  <div className="text-xs text-gray-500">قيمة الشهر</div>
                  <div className="mt-1 font-black text-gray-900 dir-ltr">{derived.perMonthBase != null ? `${fmtSAR(derived.perMonthBase)} ر.س` : '-'}</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 md:col-span-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs text-gray-500">رسوم المنصة</div>
                      <div className="mt-1 font-black text-gray-900 dir-ltr">{fmtSAR(derived.platformFee)} ر.س</div>
                    </div>
                    <div className={`inline-flex px-3 py-1 rounded-full border text-xs font-black ${eventRow.is_platform_verified ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                      {eventRow.is_platform_verified ? 'مدفوعة' : 'غير مدفوعة'}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs text-gray-500">المبلغ المدفوع</div>
                      <div className="mt-1 font-black text-gray-900 dir-ltr">{fmtSAR(derived.invoicePaid)} ر.س</div>
                    </div>
                    <div className={`inline-flex px-3 py-1 rounded-full border text-xs font-black ${eventRow.is_payment_verified ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                      {eventRow.is_payment_verified ? 'تم الدفع' : 'غير مدفوع'}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 md:col-span-2">
                  <div className="text-xs font-black text-red-800 mb-1">ملاحظة للمشرف</div>
                  <div className="text-sm font-bold text-red-900 whitespace-pre-wrap">{eventRow.supervisor_note ? String(eventRow.supervisor_note) : '-'}</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-xs text-gray-500">العميل</div>
                  <div className="font-black text-gray-900">{customer?.full_name || '-'}</div>
                  <div className="text-xs text-gray-500 mt-1">الهوية</div>
                  <div className="font-black text-gray-900 dir-ltr">{customer?.national_id || '-'}</div>
                  <div className="text-xs text-gray-500 mt-1">الجوال</div>
                  <div className="font-black text-gray-900 dir-ltr">{customer?.phone || '-'}</div>
                  <div className="text-xs text-gray-500 mt-1">تاريخ الميلاد</div>
                  <div className="font-black text-gray-900 dir-ltr">{derived.birthDate || '-'}</div>
                </div>
              </div>
              <div className="mt-2 bg-gray-50 border border-gray-100 rounded-lg p-3">
                <div className="text-xs font-black text-gray-800 mb-2">إجمالي الحجز</div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-black text-gray-900 dir-ltr">{fmtSAR(derived.adjustedTotal)} ر.س</div>
                  <div className="text-[11px] text-gray-600 font-bold">
                    تم خصم الإضافة من الإجمالي: <span className="font-black dir-ltr">{fmtSAR(derived.sumExtras)} ر.س</span>
                  </div>
                </div>
              </div>
            </div>

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
              <div className="mt-3 flex flex-wrap gap-2">
                {eventRow.is_payment_verified ? (
                  <span className="px-3 py-1 rounded-full border bg-emerald-50 text-emerald-800 border-emerald-200 text-xs font-black">
                    تم الدفع
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full border bg-gray-50 text-gray-700 border-gray-200 text-xs font-black">
                    الدفع غير مؤكد
                  </span>
                )}
                {eventRow.is_platform_verified ? (
                  <span className="px-3 py-1 rounded-full border bg-emerald-50 text-emerald-800 border-emerald-200 text-xs font-black">
                    رسوم المنصة مؤكدة
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full border bg-gray-50 text-gray-700 border-gray-200 text-xs font-black">
                    رسوم المنصة غير مؤكدة
                  </span>
                )}
              </div>
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
