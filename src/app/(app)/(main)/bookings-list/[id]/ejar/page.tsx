'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, ExternalLink, Loader2, Save } from 'lucide-react';
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

const monthsByNearest30 = (start: string | null, end: string | null) => {
  const s = ymd(start);
  const e = ymd(end);
  if (s === '-' || e === '-') return null;
  const sd = new Date(`${s}T00:00:00`);
  const ed = new Date(`${e}T00:00:00`);
  if (Number.isNaN(sd.getTime()) || Number.isNaN(ed.getTime())) return null;
  const days = Math.max(1, Math.round((ed.getTime() - sd.getTime()) / (1000 * 60 * 60 * 24)));
  return Math.max(1, Math.round(days / 30));
};

const ejarStatusLabel = (s: string | null) => {
  if (s === 'confirmed') return 'تم التأكيد';
  if (s === 'rejected') return 'تم الرفض';
  return 'تم الرفع بانتظار التأكيد';
};

export default function BookingEjarUploadPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const bookingId = String((params as any)?.id || '');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [booking, setBooking] = useState<any | null>(null);
  const [customer, setCustomer] = useState<any | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [extensionPeriods, setExtensionPeriods] = useState<Record<string, { start: string; end: string }>>({});
  const [ejarRow, setEjarRow] = useState<any | null>(null);

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [birthCalendar, setBirthCalendar] = useState<'gregorian' | 'hijri'>('gregorian');
  const [birthDateText, setBirthDateText] = useState<string>('');
  const [supervisorNote, setSupervisorNote] = useState<string>('');
  const [uploadNotes, setUploadNotes] = useState<string>('');
  const [paymentVerified, setPaymentVerified] = useState<boolean>(false);
  const [platformVerified, setPlatformVerified] = useState<boolean>(false);
  const [sendConfirmKey, setSendConfirmKey] = useState<string>('');

  const [selectedInvoicePaid, setSelectedInvoicePaid] = useState<number>(0);

  const nonVoidInvoices = useMemo(() => invoices.filter((i: any) => String(i?.status || '') !== 'void'), [invoices]);
  const selectedInvoice = useMemo(() => {
    if (!selectedInvoiceId) return null;
    return nonVoidInvoices.find((i: any) => String(i?.id || '') === String(selectedInvoiceId)) || null;
  }, [nonVoidInvoices, selectedInvoiceId]);

  const bookingMonthsCount = useMemo(() => monthsByNearest30(booking?.check_in || null, booking?.check_out || null) || 1, [booking?.check_in, booking?.check_out]);

  const selectedInvoicePeriod = useMemo(() => {
    if (!selectedInvoiceId) return null;
    const key = String(selectedInvoiceId);
    const invoiceNumber = String(selectedInvoice?.invoice_number || '');
    const isExtensionInvoice = invoiceNumber.includes('-EXT-');

    if (isExtensionInvoice) {
      const ext = extensionPeriods[key];
      if (ext?.start && ext?.end) return ext;
      const start = String(booking?.check_in || '').split('T')[0];
      const end = String(booking?.check_out || '').split('T')[0];
      if (start && end) return { start, end };
      return null;
    }

    const start = String(booking?.check_in || '').split('T')[0];
    const bookingEnd = String(booking?.check_out || '').split('T')[0];
    const earliestExtensionStart = Object.values(extensionPeriods)
      .map((p: any) => String(p?.start || '').slice(0, 10))
      .filter((s: string) => Boolean(s) && s !== '-')
      .sort()[0];

    const end = earliestExtensionStart || bookingEnd;
    if (start && end) return { start, end };
    return null;
  }, [selectedInvoiceId, selectedInvoice?.invoice_number, extensionPeriods, booking?.check_in, booking?.check_out]);

  const selectedInvoiceMonthsCount = useMemo(() => {
    if (!selectedInvoicePeriod) return 1;
    return monthsByNearest30(selectedInvoicePeriod.start, selectedInvoicePeriod.end) || 1;
  }, [selectedInvoicePeriod]);

  const selectedInvoiceDerived = useMemo(() => {
    if (!selectedInvoice) return null;
    const subtotal = toNum(selectedInvoice.subtotal);
    const discount = toNum(selectedInvoice.discount_amount);
    const extras = toNum(selectedInvoice.additional_services_amount);
    const tax = toNum(selectedInvoice.tax_amount);
    const total = toNum(selectedInvoice.total_amount);
    const paid = toNum(selectedInvoicePaid);
    const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
    const netBeforeExtras = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
    const perMonthNet = selectedInvoiceMonthsCount > 0 ? Math.round((netBeforeExtras / selectedInvoiceMonthsCount) * 100) / 100 : null;
    return { subtotal, discount, netBeforeExtras, extras, tax, total, paid, remaining, perMonthNet };
  }, [selectedInvoice, selectedInvoicePaid, selectedInvoiceMonthsCount]);

  const platformFee = useMemo(() => {
    if (!selectedInvoiceDerived) return 0;
    return Math.round(toNum(selectedInvoiceDerived.extras) * 100) / 100;
  }, [selectedInvoiceDerived]);

  const canEdit = useMemo(() => {
    const s = String(ejarRow?.status || '');
    if (!ejarRow) return true;
    if (s === 'confirmed') return false;
    return true;
  }, [ejarRow]);

  const canSendNow = useMemo(() => {
    if (!canEdit) return false;
    if (loading || saving) return false;
    if (!booking?.id || !booking?.customer_id) return false;
    if (!selectedInvoiceId) return false;
    if (!supervisorNote.trim()) return false;
    if (!birthDateText.trim()) return false;
    if (birthCalendar === 'gregorian' && !/^\d{4}-\d{2}-\d{2}$/.test(birthDateText.trim())) return false;
    return true;
  }, [canEdit, loading, saving, booking, selectedInvoiceId, supervisorNote, birthDateText, birthCalendar]);

  const load = async () => {
    if (!bookingId) return;
    setLoading(true);
    try {
      const { data: b, error: bErr } = await supabase
        .from('bookings')
        .select(
          `
          id,
          status,
          booking_type,
          booking_source,
          check_in,
          check_out,
          nights,
          customer_id,
          additional_services,
          unit:units(
            id,
            unit_number,
            floor,
            unit_type:unit_types(name, daily_price, annual_price, hotel:hotels(id, name, tax_rate))
          )
        `
        )
        .eq('id', bookingId)
        .maybeSingle();
      if (bErr) throw bErr;
      setBooking(b || null);

      const customerId = b?.customer_id ? String(b.customer_id) : null;
      if (customerId) {
        const { data: c, error: cErr } = await supabase.from('customers').select('id, full_name, phone, national_id, details').eq('id', customerId).maybeSingle();
        if (cErr) throw cErr;
        setCustomer(c || null);
      } else {
        setCustomer(null);
      }

      const { data: invs, error: invErr } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, invoice_date, created_at, subtotal, discount_amount, additional_services_amount, tax_amount, total_amount')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false });
      if (invErr) throw invErr;
      setInvoices(invs || []);

      try {
        const { data: extEvt } = await supabase
          .from('system_events')
          .select('payload')
          .eq('event_type', 'booking_extension_invoice_period')
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: false })
          .limit(50);
        const map: Record<string, { start: string; end: string }> = {};
        (extEvt || []).forEach((e: any) => {
          const p = (e?.payload as any) || {};
          const invoiceId = typeof p.invoice_id === 'string' ? p.invoice_id : null;
          const start = typeof p.period_start === 'string' ? p.period_start : null;
          const end = typeof p.period_end === 'string' ? p.period_end : null;
          if (!invoiceId || !start || !end) return;
          if (map[invoiceId]) return;
          map[invoiceId] = { start: String(start).slice(0, 10), end: String(end).slice(0, 10) };
        });
        setExtensionPeriods(map);
      } catch {
        setExtensionPeriods({});
      }

      const { data: ej, error: ejErr } = await supabase
        .from('ejar_contract_uploads')
        .select(
          'id, booking_id, customer_id, invoice_id, check_in, check_out, customer_birth_date_text, customer_birth_calendar, supervisor_note, upload_notes, status, decision_notes, decided_by_email, decided_at, is_payment_verified, is_platform_verified, uploaded_by_email, uploaded_at'
        )
        .eq('booking_id', bookingId)
        .limit(1)
        .maybeSingle();
      if (ejErr) throw ejErr;
      setEjarRow(ej || null);

      const nv = (invs || []).filter((i: any) => String(i?.status || '') !== 'void');
      const hasManyInvoices = nv.length > 1;
      const defaultInvoiceId = ej?.invoice_id
        ? String(ej.invoice_id)
        : hasManyInvoices
          ? ''
          : (nv[0]?.id ? String(nv[0].id) : '');
      setSelectedInvoiceId(defaultInvoiceId);

      setBirthCalendar((ej?.customer_birth_calendar as any) || 'gregorian');
      setBirthDateText(String(ej?.customer_birth_date_text || '').trim());
      setSupervisorNote(String(ej?.supervisor_note || '').trim());
      setUploadNotes(String(ej?.upload_notes || '').trim());
      setPaymentVerified(Boolean(ej?.is_payment_verified));
      setPlatformVerified(Boolean(ej?.is_platform_verified));
    } catch (e: any) {
      alert('تعذر تحميل صفحة رفع إيجار: ' + String(e?.message || e || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [bookingId]);

  useEffect(() => {
    if (!selectedInvoiceId) {
      setSelectedInvoicePaid(0);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const { data, error } = await supabase.from('payments').select('amount,status').eq('invoice_id', selectedInvoiceId).eq('status', 'posted');
        if (error) throw error;
        if (cancelled) return;
        const paid = (data || []).reduce((acc: number, p: any) => acc + toNum(p?.amount), 0);
        setSelectedInvoicePaid(Math.round(paid * 100) / 100);
      } catch {
        if (cancelled) return;
        setSelectedInvoicePaid(0);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedInvoiceId]);

  const onSave = async () => {
    if (saving) return;
    if (!booking?.id || !booking?.customer_id) {
      alert('بيانات الحجز/العميل غير مكتملة.');
      return;
    }
    const nv = nonVoidInvoices;
    if (nv.length > 1 && !selectedInvoiceId) {
      alert('اختر الفاتورة التي تريد اعتمادها لرفع عقد منصة إيجار.');
      return;
    }
    if (!selectedInvoiceId) {
      alert('لا توجد فاتورة صالحة للحجز.');
      return;
    }
    if (!supervisorNote.trim()) {
      alert('اكتب ملاحظة للمشرف قبل الحفظ.');
      return;
    }
    if (!birthDateText.trim()) {
      alert('تاريخ ميلاد العميل مطلوب (هجري أو ميلادي).');
      return;
    }
    if (birthCalendar === 'gregorian' && !/^\d{4}-\d{2}-\d{2}$/.test(birthDateText.trim())) {
      alert('تاريخ الميلاد (ميلادي) يجب أن يكون بصيغة YYYY-MM-DD.');
      return;
    }

    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const actorId = authData?.user?.id || null;
      const actorEmail = authData?.user?.email || null;
      if (!actorId) {
        alert('يجب تسجيل الدخول لتنفيذ العملية.');
        return;
      }

      const payload: any = {
        booking_id: booking.id,
        customer_id: booking.customer_id,
        invoice_id: selectedInvoiceId,
        check_in: selectedInvoicePeriod?.start || (String(booking?.check_in || '').split('T')[0] || null),
        check_out: selectedInvoicePeriod?.end || (String(booking?.check_out || '').split('T')[0] || null),
        customer_birth_date: birthCalendar === 'gregorian' ? birthDateText.trim() : null,
        customer_birth_date_text: birthDateText.trim(),
        customer_birth_calendar: birthCalendar,
        supervisor_note: supervisorNote.trim(),
        upload_notes: uploadNotes ? uploadNotes : null,
        is_payment_verified: Boolean(paymentVerified),
        is_platform_verified: Boolean(platformVerified),
        status: 'pending_confirmation',
        uploaded_by: actorId,
        uploaded_by_email: actorEmail,
        uploaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      let saved: any = null;
      if (ejarRow?.id) {
        const { data, error } = await supabase
          .from('ejar_contract_uploads')
          .update({
            ...payload,
            decision_notes: null,
            decided_by: null,
            decided_by_email: null,
            decided_at: null,
          })
          .eq('id', ejarRow.id)
          .select(
            'id, booking_id, customer_id, invoice_id, check_in, check_out, customer_birth_date_text, customer_birth_calendar, supervisor_note, upload_notes, status, decision_notes, decided_by_email, decided_at, is_payment_verified, is_platform_verified, uploaded_by_email, uploaded_at'
          )
          .maybeSingle();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await supabase
          .from('ejar_contract_uploads')
          .insert(payload)
          .select(
            'id, booking_id, customer_id, invoice_id, check_in, check_out, customer_birth_date_text, customer_birth_calendar, supervisor_note, upload_notes, status, decision_notes, decided_by_email, decided_at, is_payment_verified, is_platform_verified, uploaded_by_email, uploaded_at'
          )
          .maybeSingle();
        if (error) throw error;
        saved = data;
      }
      if (saved) setEjarRow(saved);

      try {
        await supabase.from('system_events').insert({
          event_type: ejarRow?.id ? 'ejar_contract_upload_edited' : 'ejar_contract_uploaded',
          booking_id: booking.id,
          customer_id: booking.customer_id,
          unit_id: booking.unit?.id || null,
          hotel_id: booking.unit?.hotel?.id || null,
          message: ejarRow?.id ? `تعديل رفع العقد إلى منصة إيجار` : `رفع العقد إلى منصة إيجار`,
          payload: {
            booking_id: booking.id,
            customer_id: booking.customer_id,
            invoice_id: selectedInvoiceId,
            actor_id: actorId,
            actor_email: actorEmail,
          },
        });
      } catch {}

      alert(ejarRow?.id ? 'تم تعديل الرفع وإعادته إلى (بانتظار التأكيد).' : 'تم حفظ الرفع وإرساله بانتظار التأكيد.');
      router.refresh();
    } catch (e: any) {
      const msg = String(e?.message || e || 'خطأ غير معروف');
      alert('تعذر الحفظ: ' + msg);
    } finally {
      setSaving(false);
    }
  };

  const statusMeta = useMemo(() => {
    if (!ejarRow) return null;
    const s = String(ejarRow?.status || 'pending_confirmation');
    const label = ejarStatusLabel(s);
    const className =
      s === 'confirmed' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : s === 'rejected' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-amber-50 text-amber-900 border-amber-200';
    return { s, label, className };
  }, [ejarRow]);

  const handleSendClick = async () => {
    const key = `${selectedInvoiceId}|${selectedInvoicePaid}|${platformFee}`;
    if (sendConfirmKey !== key) {
      const ok = window.confirm(
        `تنبيه قبل الإرسال:\n\n` +
          `هل أنت متأكد أن المبلغ المدفوع صحيح ورسوم المنصة صحيحة؟\n\n` +
          `المبلغ المدفوع: ${fmtSAR(selectedInvoicePaid)} ر.س\n` +
          `رسوم المنصة: ${fmtSAR(platformFee)} ر.س\n\n` +
          `ملاحظة: علامة (تم) اختيارية وهي للتأكيد اليدوي فقط.`
      );
      if (!ok) return;
      setSendConfirmKey(key);
    }
    await onSave();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/bookings-list/${bookingId}`} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
            <ArrowRight size={22} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-gray-900">رفع العقد إلى منصة إيجار</h1>
              {statusMeta ? <span className={`px-2 py-1 rounded-full border text-[10px] font-black ${statusMeta.className}`}>{statusMeta.label}</span> : null}
            </div>
            <div className="text-xs text-gray-500 mt-1 dir-ltr">Booking: {bookingId}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ejarRow?.id ? (
            <Link
              href={`/reports/ejar-contracts/${ejarRow.id}`}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-xs font-bold text-gray-700"
            >
              <ExternalLink size={14} />
              فتح سجل إيجار
            </Link>
          ) : null}
          <button
            type="button"
            onClick={handleSendClick}
            disabled={!canSendNow}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 text-sm font-black"
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            حفظ وإرسال
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-gray-600">
          <Loader2 className="animate-spin inline-block mr-2" size={18} /> جارٍ التحميل...
        </div>
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-black text-gray-900 mb-3">اختيار الفاتورة</div>
            {nonVoidInvoices.length === 0 ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm font-bold text-red-800">لا توجد فواتير صالحة لهذا الحجز.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">الفاتورة المختارة للحفظ</div>
                  <select
                    value={selectedInvoiceId}
                    onChange={(e) => setSelectedInvoiceId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg bg-white text-sm font-black"
                    disabled={!canEdit}
                  >
                    <option value="">-- اختر الفاتورة --</option>
                    {nonVoidInvoices.map((inv: any) => {
                      const n = String(inv?.invoice_number || '');
                      const isExt = n.includes('-EXT-');
                      const dt = ymd(inv?.invoice_date || inv?.created_at || null);
                      const total = toNum(inv?.total_amount);
                      return (
                        <option key={String(inv.id)} value={String(inv.id)}>
                          {(isExt ? 'تمديد' : 'أساسية')} • {n || String(inv.id).slice(0, 8)} • {dt} • {fmtSAR(total)} ر.س
                        </option>
                      );
                    })}
                  </select>
                  <div className="mt-2 text-[11px] text-gray-600">عند وجود تمديد اختر الفاتورة الأحدث (فاتورة التمديد).</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-xs font-black text-gray-800 mb-2">تفاصيل الفاتورة</div>
                  {selectedInvoice ? (
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-500">رقم الفاتورة</span>
                        <span className="font-black text-gray-900 dir-ltr">{selectedInvoice?.invoice_number || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-500">التاريخ</span>
                        <span className="font-bold text-gray-900 dir-ltr">{ymd(selectedInvoice?.invoice_date || selectedInvoice?.created_at || null)}</span>
                      </div>
                      <div className="h-px bg-gray-200 my-2" />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-500">Subtotal</span>
                        <span className="font-bold text-gray-900 dir-ltr">{fmtSAR(toNum(selectedInvoice.subtotal))} ر.س</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-500">الإضافة</span>
                        <span className="font-bold text-gray-900 dir-ltr">{fmtSAR(toNum(selectedInvoice.additional_services_amount))} ر.س</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-500">الضريبة</span>
                        <span className="font-bold text-gray-900 dir-ltr">{fmtSAR(toNum(selectedInvoice.tax_amount))} ر.س</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-700 font-black">الإجمالي</span>
                        <span className="font-black text-gray-900 dir-ltr">{fmtSAR(toNum(selectedInvoice.total_amount))} ر.س</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-600">اختر فاتورة لعرض تفاصيلها.</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {ejarRow?.status === 'rejected' && ejarRow?.decision_notes ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="text-xs font-black text-red-800 mb-1">ملاحظة الرفض</div>
              <div className="text-sm font-bold text-red-900 whitespace-pre-wrap">{String(ejarRow.decision_notes)}</div>
              <div className="mt-2 text-[11px] text-red-700 dir-ltr">
                {ejarRow.decided_by_email ? `by ${ejarRow.decided_by_email}` : ''} {ejarRow.decided_at ? `• ${ymd(String(ejarRow.decided_at))}` : ''}
              </div>
            </div>
          ) : null}

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-black text-gray-900 mb-3">بطاقة الملخص</div>
            <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 font-bold">
              قبل الإرسال يُفضّل التأكد من <span className="font-black">المبلغ المدفوع</span> و <span className="font-black">رسوم المنصة</span>. كلمة <span className="font-black">تم</span> هي تأكيد يدوي اختياري.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                <div className="text-xs text-gray-500">رقم الوحدة</div>
                <div className="font-black text-gray-900">{booking?.unit?.unit_number || '-'}</div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                <div className="text-xs text-gray-500">المدة</div>
                <div className="font-black text-gray-900">
                  {selectedInvoicePeriod ? `${selectedInvoiceMonthsCount} شهر` : `${bookingMonthsCount} شهر`}
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                <div className="text-xs text-gray-500">الدخول → الخروج</div>
                <div className="font-black text-gray-900 dir-ltr">
                  {selectedInvoicePeriod ? `${selectedInvoicePeriod.start} → ${selectedInvoicePeriod.end}` : `${ymd(booking?.check_in || null)} → ${ymd(booking?.check_out || null)}`}
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                <div className="text-xs text-gray-500">قيمة الشهر (حسب الفاتورة المختارة)</div>
                <div className="mt-1 font-black text-gray-900 dir-ltr">
                  {selectedInvoiceDerived?.perMonthNet != null ? `${fmtSAR(selectedInvoiceDerived.perMonthNet)} ر.س` : '-'}
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs text-gray-500">المبلغ المدفوع</div>
                    <div className="font-black text-gray-900 dir-ltr">{selectedInvoiceDerived ? `${fmtSAR(selectedInvoiceDerived.paid)} ر.س` : `${fmtSAR(selectedInvoicePaid)} ر.س`}</div>
                    <div className="mt-1 text-[11px] text-gray-600 font-bold">
                      المتبقي: <span className="dir-ltr">{selectedInvoiceDerived ? `${fmtSAR(selectedInvoiceDerived.remaining)} ر.س` : '-'}</span>
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-black text-gray-800">
                    <input type="checkbox" checked={paymentVerified} onChange={(e) => setPaymentVerified(e.target.checked)} disabled={!canEdit} />
                    تم (مدفوع)
                  </label>
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs text-gray-500">رسوم المنصة</div>
                    <div className="font-black text-gray-900 dir-ltr">{fmtSAR(platformFee)} ر.س</div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-black text-gray-800">
                    <input type="checkbox" checked={platformVerified} onChange={(e) => setPlatformVerified(e.target.checked)} disabled={!canEdit} />
                    تم
                  </label>
                </div>
                <div className="mt-1 text-[11px] text-gray-600 font-bold">ضع علامة تم بعد التأكد من رسوم منصة إيجار.</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="text-xs font-black text-red-800 mb-1">ملاحظة للمشرف (إجباري)</div>
                <textarea
                  value={supervisorNote}
                  onChange={(e) => setSupervisorNote(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  rows={3}
                  disabled={!canEdit}
                />
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                <div className="text-xs font-black text-gray-800 mb-2">بيانات العميل</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div className="bg-white border border-gray-100 rounded-lg p-2">
                    <div className="text-[11px] text-gray-500">الاسم</div>
                    <div className="font-black text-gray-900">{customer?.full_name || '-'}</div>
                  </div>
                  <div className="bg-white border border-gray-100 rounded-lg p-2">
                    <div className="text-[11px] text-gray-500">الهوية</div>
                    <div className="font-black text-gray-900 dir-ltr">{customer?.national_id || '-'}</div>
                  </div>
                  <div className="bg-white border border-gray-100 rounded-lg p-2">
                    <div className="text-[11px] text-gray-500">الجوال</div>
                    <div className="font-black text-gray-900 dir-ltr">{customer?.phone || '-'}</div>
                  </div>
                  <div className="bg-white border border-gray-100 rounded-lg p-2">
                    <div className="text-[11px] text-gray-500">تاريخ الميلاد</div>
                    <div className="mt-2">
                      <div className="inline-flex w-full p-1 rounded-xl bg-gray-100 border border-gray-200">
                        <button
                          type="button"
                          onClick={() => setBirthCalendar('gregorian')}
                          disabled={!canEdit}
                          className={`flex-1 px-3 py-2 rounded-lg text-xs font-black ${birthCalendar === 'gregorian' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-700 hover:bg-white/50'}`}
                        >
                          ميلادي
                        </button>
                        <button
                          type="button"
                          onClick={() => setBirthCalendar('hijri')}
                          disabled={!canEdit}
                          className={`flex-1 px-3 py-2 rounded-lg text-xs font-black ${birthCalendar === 'hijri' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-700 hover:bg-white/50'}`}
                        >
                          هجري
                        </button>
                      </div>
                      <div className="mt-2">
                        {birthCalendar === 'gregorian' ? (
                          <input
                            type="date"
                            value={birthDateText}
                            onChange={(e) => setBirthDateText(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg text-xs font-black bg-white"
                            disabled={!canEdit}
                          />
                        ) : (
                          <input
                            type="text"
                            value={birthDateText}
                            onChange={(e) => setBirthDateText(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg text-xs font-black bg-white"
                            placeholder="مثال: 1447-01-01"
                            dir="ltr"
                            disabled={!canEdit}
                          />
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-gray-600 font-bold">تاريخ الميلاد إجباري (اختر نوع التقويم ثم أدخل التاريخ).</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-black text-gray-900 mb-2">ملاحظات (اختياري)</div>
            <textarea value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" rows={3} disabled={!canEdit} />
            {!canEdit ? <div className="mt-2 text-xs font-bold text-red-700">لا يمكن التعديل لأن السجل في حالة (تم التأكيد).</div> : null}
          </div>
        </>
      )}
    </div>
  );
}
