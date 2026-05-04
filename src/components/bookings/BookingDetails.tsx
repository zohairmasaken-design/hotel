'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { format, addDays, startOfMonth, addMonths, differenceInDays, isSameDay } from 'date-fns';
import { 
  ArrowLeft, Printer, Mail, MessageCircle, CreditCard, 
  CheckCircle, Check as CheckIcon, Banknote, Calendar, User, Home, FileText,
  AlertCircle, Plus, X, Loader2, LogIn, LogOut, Ban, Clock, Edit, Trash2,
  Bell, Timer, AlertTriangle, AlertOctagon, DollarSign, PieChart, Save, Edit2, ExternalLink, RefreshCw, Send, History, MapPin, Phone, Hash, Tag, BarChart2, Briefcase, Building, Layers, Search, ChevronDown, ChevronUp, MoreVertical, Key, Shield, Settings, HelpCircle, Power, UserPlus, Users, LayoutDashboard, Database, Activity, Lock, Unlock, Eye, EyeOff, Check, AlertOctagon as AlertOctagonIcon
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import ExtendBookingModal from './ExtendBookingModal';

interface BookingDetailsProps {
  booking: any;
  transactions: any[];
  paymentMethods: any[];
  invoices: any[];
  paymentJournalMap?: Record<string, string>;
}

export default function BookingDetails({ booking, transactions: initialTransactions, paymentMethods, invoices: initialInvoices, paymentJournalMap = {} }: BookingDetailsProps) {
  const router = useRouter();
  const { role } = useUserRole();
  const isAdmin = role === 'admin';
  const isAccountant = role === 'accountant';
  const canAccounting = isAdmin || isAccountant;
  const [transactions, setTransactions] = useState(initialTransactions);
  const [invoices, setInvoices] = useState<any[]>(initialInvoices || []);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEditPaymentModal, setShowEditPaymentModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [showEditInvoiceModal, setShowEditInvoiceModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [ejarUploadBusy, setEjarUploadBusy] = useState(false);
  const [showEjarUploadModal, setShowEjarUploadModal] = useState(false);
  const [ejarEditMode, setEjarEditMode] = useState(false);
  const [ejarSelectedInvoiceId, setEjarSelectedInvoiceId] = useState<string>('');
  const [ejarBirthCalendar, setEjarBirthCalendar] = useState<'gregorian' | 'hijri'>('gregorian');
  const [ejarBirthDateText, setEjarBirthDateText] = useState<string>('');
  const [ejarSupervisorNote, setEjarSupervisorNote] = useState<string>('');
  const [ejarUploadNotes, setEjarUploadNotes] = useState<string>('');
  const [ejarExistingUpload, setEjarExistingUpload] = useState<any | null>((booking as any)?.ejar_upload ?? null);
  const [ejarDocBusy, setEjarDocBusy] = useState(false);
  const [ejarDeleteBusy, setEjarDeleteBusy] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showInsuranceVoucher, setShowInsuranceVoucher] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showDelay, setShowDelay] = useState(false);
  const [showChangeUnit, setShowChangeUnit] = useState(false);
  const [showEditPrice, setShowEditPrice] = useState(false);
  const [showEarlyCheckoutModal, setShowEarlyCheckoutModal] = useState(false);
  const [earlyExitDate, setEarlyExitDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [earlyPricingMode, setEarlyPricingMode] = useState<'full' | 'monthly' | 'daily'>('monthly');
  const [earlyBusy, setEarlyBusy] = useState(false);
  const [earlyError, setEarlyError] = useState<string>('');
  const [earlyResult, setEarlyResult] = useState<any | null>(null);
  const [showTerminateContractModal, setShowTerminateContractModal] = useState(false);
  const [terminateExitDate, setTerminateExitDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [terminateInvoiceTotal, setTerminateInvoiceTotal] = useState<string>('0');
  const [terminateDocDate, setTerminateDocDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [terminateBusy, setTerminateBusy] = useState(false);
  const [terminateError, setTerminateError] = useState<string>('');
  const [newTotalPrice, setNewTotalPrice] = useState(String(booking.total_price || 0));
  const [newSubtotal, setNewSubtotal] = useState(String(booking.subtotal || 0));
  const [newTaxAmount, setNewTaxAmount] = useState(String(booking.tax_amount || 0));
  const [newDiscountAmount, setNewDiscountAmount] = useState(String(booking.discount_amount || 0));
  const [newExtrasAmount, setNewExtrasAmount] = useState('0');
  const [includeTax, setIncludeTax] = useState(Number(booking.tax_amount || 0) > 0);
  const hotelTaxRate = booking.unit?.hotel?.tax_rate || 0.15;
  const [monthlyRateEdit, setMonthlyRateEdit] = useState('0');
  const [availableUnits, setAvailableUnits] = useState<any[]>([]);
  const [selectedNewUnitId, setSelectedNewUnitId] = useState<string>('');
  const [isChangingUnit, setIsChangingUnit] = useState(false);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [directPayments, setDirectPayments] = useState<any[]>([]);
  const [newCheckIn, setNewCheckIn] = useState<string>(booking.check_in?.split('T')[0] || '');
  const [newCheckOut, setNewCheckOut] = useState<string>(booking.check_out?.split('T')[0] || '');
  const [delayDays, setDelayDays] = useState<number>(1);
  const canAdminEditDates = isAdmin && ['pending_deposit', 'confirmed', 'checked_in'].includes(booking.status);

  const maxEarlyExitDate = (() => {
    const outISO = String(booking.check_out || '').split('T')[0];
    if (!outISO) return new Date().toISOString().split('T')[0];
    const outDate = new Date(`${outISO}T00:00:00`);
    return outDate.toISOString().split('T')[0];
  })();

  useEffect(() => {
    if (!booking?.id) return;
    if ((booking as any)?.ejar_upload !== undefined) return;
    let cancelled = false;
    const run = async () => {
      setEjarExistingUpload(null);
      try {
        const { data, error } = await supabase
          .from('ejar_contract_uploads')
          .select('id, booking_id, invoice_id, status, supervisor_note, upload_notes, decision_notes, decided_by_email, decided_at, customer_birth_date_text, customer_birth_calendar, uploaded_at, created_at, updated_at')
          .eq('booking_id', booking.id)
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        if (error) throw error;
        setEjarExistingUpload(data || null);
      } catch (e: any) {
        if (cancelled) return;
        console.warn('Could not fetch ejar_contract_uploads for booking:', String(e?.message || e || 'unknown'));
        setEjarExistingUpload(null);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [booking?.id, (booking as any)?.ejar_upload]);

  const ejarUploadStatusMeta = useMemo(() => {
    if (!ejarExistingUpload) return null;
    const s = String(ejarExistingUpload?.status || 'pending_confirmation');
    const label = s === 'confirmed' ? 'تم التأكيد' : s === 'rejected' ? 'تم الرفض' : 'تم الرفع بانتظار التأكيد';
    const className =
      s === 'confirmed'
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
        : s === 'rejected'
          ? 'bg-red-50 text-red-800 border-red-200'
          : 'bg-amber-50 text-amber-900 border-amber-200';
    return { status: s, label, className };
  }, [ejarExistingUpload]);

  const deleteEjarUploadForBooking = async () => {
    if (!booking?.id) return false;
    if (ejarDeleteBusy) return false;
    if (!confirm('هل تريد حذف رفع العقد إلى منصة إيجار لهذا الحجز؟\n\nملاحظة: يُستخدم هذا الإجراء قبل إلغاء/حذف الحجز إذا كان الرفع مرتبطاً بالفواتير.')) return false;
    setEjarDeleteBusy(true);
    try {
      const { error } = await supabase.rpc('delete_ejar_contract_upload_for_booking', {
        p_booking_id: booking.id
      });
      if (error) throw error;
      setEjarExistingUpload(null);
      alert('تم حذف رفع إيجار بنجاح');
      return true;
    } catch (e: any) {
      alert('تعذر حذف رفع إيجار: ' + String(e?.message || e || 'خطأ غير معروف'));
      return false;
    } finally {
      setEjarDeleteBusy(false);
    }
  };

  const ejarApprovalCountdown = useMemo(() => {
    if (!ejarExistingUpload) return null;
    if (String(ejarExistingUpload?.status || '') !== 'confirmed') return null;
    const base =
      ejarExistingUpload?.decided_at ||
      ejarExistingUpload?.updated_at ||
      ejarExistingUpload?.uploaded_at ||
      ejarExistingUpload?.created_at ||
      null;
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
  }, [ejarExistingUpload]);

  const markEjarSupervisorNoteDocumented = async () => {
    if (!ejarExistingUpload?.id) return;
    if (ejarDocBusy) return;
    const current = String(ejarExistingUpload?.supervisor_note || '').trim();
    if (current === 'تم توثيق') return;
    if (!confirm('هل تريد تحديث ملاحظة المشرف إلى: (تم توثيق) ؟')) return;
    setEjarDocBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('ejar_contract_uploads')
        .update({ supervisor_note: 'تم توثيق', updated_at: nowIso })
        .eq('id', ejarExistingUpload.id)
        .select('id, booking_id, invoice_id, status, supervisor_note, upload_notes, decision_notes, decided_by_email, decided_at, customer_birth_date_text, customer_birth_calendar, uploaded_at, created_at, updated_at')
        .maybeSingle();
      if (error) throw error;
      if (data) setEjarExistingUpload(data);
    } catch (e: any) {
      alert('تعذر توثيق الملاحظة: ' + String(e?.message || e || 'خطأ غير معروف'));
    } finally {
      setEjarDocBusy(false);
    }
  };

  const ejarInvoicePreview = useMemo(() => {
    const nonVoidInvoices = (invoices || []).filter((inv: any) => String(inv?.status || '') !== 'void');
    const chosenId = ejarSelectedInvoiceId ? String(ejarSelectedInvoiceId) : null;
    const chosen =
      (chosenId ? nonVoidInvoices.find((inv: any) => String(inv?.id || '') === String(chosenId)) : null) ||
      nonVoidInvoices.find((inv: any) => !String(inv?.invoice_number || '').includes('-EXT-')) ||
      nonVoidInvoices[0] ||
      null;
    if (!chosen) return null;
    const monthsCount = (() => {
      const nights = Number(booking?.nights || 0);
      if (Number.isFinite(nights) && nights > 0) return Math.max(1, Math.round(nights / 30));
      const ci = String(booking?.check_in || '').split('T')[0];
      const co = String(booking?.check_out || '').split('T')[0];
      if (!ci || !co) return 1;
      const sd = new Date(`${ci}T00:00:00`);
      const ed = new Date(`${co}T00:00:00`);
      if (Number.isNaN(sd.getTime()) || Number.isNaN(ed.getTime())) return 1;
      const days = Math.max(1, Math.round((ed.getTime() - sd.getTime()) / (1000 * 60 * 60 * 24)));
      return Math.max(1, Math.round(days / 30));
    })();
    const subtotal = Number(chosen?.subtotal || 0);
    const discount = Number(chosen?.discount_amount || 0);
    const extras = Number(chosen?.additional_services_amount || 0);
    const tax = Number(chosen?.tax_amount || 0);
    const total = Number(chosen?.total_amount || 0);
    const invoiceDate = String(chosen?.invoice_date || chosen?.created_at || '').split('T')[0] || null;
    const platformFee = (() => {
      const list = Array.isArray(booking?.additional_services) ? booking.additional_services : [];
      return list.reduce((sum: number, ex: any) => {
        const name = String(ex?.name ?? ex?.title ?? ex?.label ?? '').trim();
        if (!name) return sum;
        if (name === 'رسوم منصة إيجار') return sum + (Number(ex?.amount) || 0);
        const lower = name.toLowerCase();
        const hasPlatform = name.includes('منصة') || lower.includes('platform');
        const hasEjar = name.includes('إيجار') || name.includes('ايجار') || name.includes('اجار') || lower.includes('ejar');
        const hasFee = name.includes('رسوم') || name.includes('عمولة') || lower.includes('fee') || lower.includes('commission');
        if (!(hasPlatform && (hasEjar || hasFee))) return sum;
        return sum + (Number(ex?.amount) || 0);
      }, 0);
    })();
    const perMonthWithoutPlatform = monthsCount > 0 ? Math.round((subtotal / monthsCount) * 100) / 100 : null;
    const extrasWithoutPlatform = Math.max(0, Math.round((extras - platformFee) * 100) / 100);
    return {
      id: chosen.id,
      invoice_number: chosen.invoice_number || null,
      invoice_date: invoiceDate,
      monthsCount,
      perMonthWithoutPlatform,
      platformFee,
      extrasWithoutPlatform,
      subtotal,
      discount,
      extras,
      tax,
      total,
    };
  }, [invoices, ejarSelectedInvoiceId, booking]);

  const ejarSelectableInvoices = useMemo(() => {
    const nonVoid = (invoices || []).filter((inv: any) => String(inv?.status || '') !== 'void');
    const sorted = [...nonVoid].sort((a: any, b: any) => {
      const ta = new Date(String(a?.created_at || a?.invoice_date || 0)).getTime();
      const tb = new Date(String(b?.created_at || b?.invoice_date || 0)).getTime();
      return tb - ta;
    });
    return sorted;
  }, [invoices]);

  const handleEarlyCheckout = async () => {
    setEarlyError('');
    setEarlyResult(null);
    setEarlyBusy(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const actorId = authData?.user?.id || null;
      const { data, error } = await supabase.rpc('early_checkout_booking_v1', {
        p_booking_id: booking.id,
        p_exit_date: earlyExitDate,
        p_pricing_mode: earlyPricingMode,
        p_rounding_days: 4,
        p_actor_id: actorId,
      });
      if (error) throw error;
      setEarlyResult(data);
      setShowEarlyCheckoutModal(false);
      router.refresh();
    } catch (e: any) {
      setEarlyError(String(e?.message || e || 'تعذر تنفيذ الخروج المبكر'));
    } finally {
      setEarlyBusy(false);
    }
  };

  const handleTerminateContract = async () => {
    if (!isAdmin) {
      setTerminateError('هذه العملية متاحة للأدمن فقط');
      return;
    }
    setTerminateError('');
    setTerminateBusy(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const actorId = authData?.user?.id || null;
      const numTotal = Number(terminateInvoiceTotal || 0);
      if (!Number.isFinite(numTotal) || numTotal <= 0) {
        throw new Error('أدخل مبلغ صحيح للفاتورة');
      }
      const { data, error } = await supabase.rpc('early_checkout_booking_v1', {
        p_booking_id: booking.id,
        p_exit_date: terminateExitDate,
        p_pricing_mode: 'full',
        p_rounding_days: 4,
        p_actor_id: actorId,
        p_override_invoice_total: numTotal,
        p_override_invoice_date: terminateDocDate,
        p_override_journal_date: terminateDocDate,
        p_event_type: 'contract_terminated',
      });
      if (error) throw error;
      setShowTerminateContractModal(false);
      router.refresh();
      alert('تم فسخ العقد وتحديث الحجز/الفاتورة بنجاح');
    } catch (e: any) {
      setTerminateError(String(e?.message || e || 'تعذر تنفيذ فسخ العقد'));
    } finally {
      setTerminateBusy(false);
    }
  };

  const handleUploadContractToEjar = async () => {
    if (!booking?.id || !booking?.customer_id) {
      alert('لا يمكن رفع العقد: بيانات الحجز/العميل غير مكتملة.');
      return;
    }
    router.push(`/bookings-list/${booking.id}/ejar`);
  };

  const handleConfirmEjarUpload = async () => {
    if (ejarUploadBusy) return;
    if (ejarEditMode && !ejarExistingUpload?.id) {
      alert('لا يمكن تعديل الرفع: لم يتم العثور على سجل الرفع السابق.');
      return;
    }
    if (!ejarSupervisorNote.trim()) {
      alert('اكتب ملاحظة للمشرف قبل رفع العقد.');
      return;
    }
    if (!ejarBirthDateText.trim()) {
      alert('تاريخ ميلاد العميل مطلوب (هجري أو ميلادي).');
      return;
    }
    if (ejarBirthCalendar === 'gregorian' && !/^\d{4}-\d{2}-\d{2}$/.test(ejarBirthDateText.trim())) {
      alert('تاريخ الميلاد (ميلادي) يجب أن يكون بصيغة YYYY-MM-DD.');
      return;
    }

    const nonVoidInvoices = (invoices || []).filter((inv: any) => String(inv?.status || '') !== 'void');
    const mustSelectInvoice = nonVoidInvoices.length > 1;
    const selectedInvoiceId = mustSelectInvoice ? (ejarSelectedInvoiceId ? String(ejarSelectedInvoiceId) : null) : null;
    const mainInvoice =
      nonVoidInvoices.find((inv: any) => !String(inv?.invoice_number || '').includes('-EXT-')) ||
      nonVoidInvoices[0] ||
      null;
    const invoiceId = selectedInvoiceId || mainInvoice?.id || null;
    const checkIn = String(booking?.check_in || '').split('T')[0] || null;
    const checkOut = String(booking?.check_out || '').split('T')[0] || null;

    if (!invoiceId) {
      alert('لا يمكن رفع العقد: لم يتم العثور على فاتورة للحجز.');
      return;
    }
    if (mustSelectInvoice && !selectedInvoiceId) {
      alert('اختر الفاتورة التي تريد اعتمادها لرفع عقد منصة إيجار.');
      return;
    }
    if (!booking?.id || !booking?.customer_id) {
      alert('لا يمكن رفع العقد: بيانات الحجز/العميل غير مكتملة.');
      return;
    }

    try {
      setEjarUploadBusy(true);
      const { data: authData } = await supabase.auth.getUser();
      const actorId = authData?.user?.id || null;
      const actorEmail = authData?.user?.email || null;
      if (!actorId) {
        alert('يجب تسجيل الدخول لتنفيذ العملية.');
        return;
      }

      const payload = {
        booking_id: booking.id,
        customer_id: booking.customer_id,
        invoice_id: invoiceId,
        check_in: checkIn,
        check_out: checkOut,
        customer_birth_date: ejarBirthCalendar === 'gregorian' ? ejarBirthDateText.trim() : null,
        customer_birth_date_text: ejarBirthDateText.trim(),
        customer_birth_calendar: ejarBirthCalendar,
        supervisor_note: ejarSupervisorNote.trim(),
        status: 'pending_confirmation',
        upload_notes: ejarUploadNotes || null,
        uploaded_by: actorId,
        uploaded_by_email: actorEmail,
        uploaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: inserted, error } = ejarEditMode
        ? await supabase
            .from('ejar_contract_uploads')
            .update({
              ...payload,
              decision_notes: null,
              decided_by: null,
              decided_by_email: null,
              decided_at: null,
            })
            .eq('id', ejarExistingUpload.id)
            .select('id, booking_id, invoice_id, status, supervisor_note, upload_notes, decision_notes, decided_by_email, decided_at, customer_birth_date_text, customer_birth_calendar, uploaded_at, created_at')
            .maybeSingle()
        : await supabase
            .from('ejar_contract_uploads')
            .insert(payload)
            .select('id, booking_id, invoice_id, status, supervisor_note, upload_notes, decision_notes, decided_by_email, decided_at, customer_birth_date_text, customer_birth_calendar, uploaded_at, created_at')
            .maybeSingle();
      if (error) throw error;

      try {
        await supabase.from('system_events').insert({
          event_type: ejarEditMode ? 'ejar_contract_upload_edited' : 'ejar_contract_uploaded',
          booking_id: booking.id,
          customer_id: booking.customer_id,
          unit_id: booking.unit_id,
          hotel_id: booking.hotel_id || null,
          message: ejarEditMode ? `تعديل رفع العقد إلى منصة إيجار` : `رفع العقد إلى منصة إيجار`,
          payload: {
            booking_id: booking.id,
            customer_id: booking.customer_id,
            invoice_id: invoiceId,
            check_in: checkIn,
            check_out: checkOut,
            actor_id: actorId,
            actor_email: actorEmail
          }
        });
      } catch {}

      setShowEjarUploadModal(false);
      setEjarEditMode(false);
      if (inserted) setEjarExistingUpload(inserted);
      alert(ejarEditMode ? 'تم تعديل رفع العقد إلى منصة إيجار وإعادة إرساله بانتظار التأكيد.' : 'تم حفظ بيانات رفع العقد إلى منصة إيجار بنجاح.');
      router.refresh();
    } catch (e: any) {
      const msg = String(e?.message || e || 'خطأ غير معروف');
      if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique') || msg.includes('uq_ejar_contract_uploads_booking_id')) {
        alert('تم رفع العقد مسبقاً لهذا الحجز ولا يمكن رفعه مرة أخرى.');
        try {
          const { data } = await supabase
            .from('ejar_contract_uploads')
            .select('id, booking_id, invoice_id, status, supervisor_note, upload_notes, decision_notes, decided_by_email, decided_at, customer_birth_date_text, customer_birth_calendar, uploaded_at, created_at')
            .eq('booking_id', booking.id)
            .limit(1)
            .maybeSingle();
          if (data) setEjarExistingUpload(data);
        } catch {}
        return;
      }
      alert('تعذر حفظ بيانات رفع العقد إلى منصة إيجار: ' + msg);
    } finally {
      setEjarUploadBusy(false);
    }
  };
  
  // Booking Keys (TTLock) State
  const [bookingKeys, setBookingKeys] = useState<any[]>([]);

  const loadBookingKeys = async () => {
    try {
      const { data, error } = await supabase
        .from('booking_keys')
        .select('*')
        .eq('booking_id', booking.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        // If the table doesn't exist yet, we just fail silently or log
        console.warn('Could not fetch booking keys, table might not exist:', error.message);
        return;
      }
      setBookingKeys(data || []);
    } catch (err) {
      console.error('Error loading booking keys:', err);
    }
  };

  useEffect(() => {
    loadBookingKeys();
  }, [booking.id]);

  // Payment Form State
  const [amount, setAmount] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id || '');
  const [description, setDescription] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [paymentRequireInvoice, setPaymentRequireInvoice] = useState(false);
  const [editPaymentMethodId, setEditPaymentMethodId] = useState<string>('');
  const [editTransactionType, setEditTransactionType] = useState<'payment' | 'advance_payment'>('payment');

  const [invoiceNumberEdit, setInvoiceNumberEdit] = useState('');
  const [invoiceDateEdit, setInvoiceDateEdit] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceDueDateEdit, setInvoiceDueDateEdit] = useState('');
  const [invoiceSubtotalEdit, setInvoiceSubtotalEdit] = useState('0');
  const [invoiceTaxEdit, setInvoiceTaxEdit] = useState('0');
  const [invoiceDiscountEdit, setInvoiceDiscountEdit] = useState('0');
  const [invoiceExtrasEdit, setInvoiceExtrasEdit] = useState('0');
  const [invoiceTotalEdit, setInvoiceTotalEdit] = useState('0');
  const [voucherType, setVoucherType] = useState<'deposit_receipt' | 'deposit_refund' | 'deposit_to_damage_income' | 'deposit_to_expense_offset'>('deposit_receipt');
  const [voucherAmount, setVoucherAmount] = useState<string>('');
  const [voucherMethodId, setVoucherMethodId] = useState<string>(paymentMethods[0]?.id || '');
  const [voucherDescription, setVoucherDescription] = useState<string>('');
  const [voucherDate, setVoucherDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [voucherPosting, setVoucherPosting] = useState<boolean>(true);
  const [insuranceEvents, setInsuranceEvents] = useState<any[]>([]);
  const [extensionInvoicePeriods, setExtensionInvoicePeriods] = useState<Record<string, { period_start: string; period_end: string }>>({});
  const [showEditExtensionModal, setShowEditExtensionModal] = useState(false);
  const [editingExtensionInvoice, setEditingExtensionInvoice] = useState<any>(null);
  const [extPeriodStart, setExtPeriodStart] = useState<string>('');
  const [extPeriodEnd, setExtPeriodEnd] = useState<string>('');
  const [extNewEndDate, setExtNewEndDate] = useState<string>('');
  const [extMonths, setExtMonths] = useState<string>('1');
  const [extBaseSubtotal, setExtBaseSubtotal] = useState<string>('0');
  const [extDiscount, setExtDiscount] = useState<string>('0');
  const [extExtras, setExtExtras] = useState<string>('0');
  const [extApplyTax, setExtApplyTax] = useState<boolean>(true);
  const [extTaxRate, setExtTaxRate] = useState<string>(String(hotelTaxRate));
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachStepIndex, setCoachStepIndex] = useState(0);
  const [coachRect, setCoachRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [coachAnchor, setCoachAnchor] = useState<{ top: number; left: number } | null>(null);
  const [showPendingDepositHint, setShowPendingDepositHint] = useState(false);
  const [printMenuOpen, setPrintMenuOpen] = useState(false);
  const [printMenuPos, setPrintMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printPreviewTitle, setPrintPreviewTitle] = useState('');
  const [printPreviewUrl, setPrintPreviewUrl] = useState<string | null>(null);
  const [printPreviewLoading, setPrintPreviewLoading] = useState(false);
  const [printPreviewScale, setPrintPreviewScale] = useState(1);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [quickGuideMinimized, setQuickGuideMinimized] = useState(true);
  const [quickGuideOpen, setQuickGuideOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [helpHintIndex, setHelpHintIndex] = useState(0);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);
  const printLoadTokenRef = useRef(0);
  const alertsRef = useRef<HTMLDivElement | null>(null);
  const PRINT_PREVIEW_KEY = `booking_print_preview_${booking.id}`;
  const loadInsuranceEvents = async () => {
    const { data } = await supabase
      .from('system_events')
      .select('id,created_at,message,payload')
      .eq('event_type', 'insurance_voucher')
      .eq('booking_id', booking.id)
      .order('created_at', { ascending: false });
    setInsuranceEvents(data || []);
  };
  useEffect(() => {
    loadInsuranceEvents();
  }, []);

  useEffect(() => {
    const loadExtensionEvents = async () => {
      const { data } = await supabase
        .from('system_events')
        .select('id,created_at,payload')
        .eq('event_type', 'booking_extension_invoice_period')
        .eq('booking_id', booking.id)
        .order('created_at', { ascending: false });
      const map: Record<string, { period_start: string; period_end: string }> = {};
      (data || []).forEach((ev: any) => {
        const invoiceId = ev?.payload?.invoice_id;
        const periodStart = ev?.payload?.period_start;
        const periodEnd = ev?.payload?.period_end;
        if (!invoiceId || !periodStart || !periodEnd) return;
        const key = String(invoiceId);
        if (map[key]) return;
        map[key] = { period_start: String(periodStart), period_end: String(periodEnd) };
      });
      setExtensionInvoicePeriods(map);
    };
    loadExtensionEvents();
  }, [booking.id]);

  const coachSteps = React.useMemo(() => {
    const steps = [
      {
        id: 'bd-btn-print-contract',
        title: 'الطباعة',
        body: 'قائمة طباعة صغيرة فيها: العقد، الفاتورة، ومحاضر الاستلام/التسليم.'
      },
      {
        id: 'bd-btn-record-payment',
        title: 'تسجيل دفعة',
        body: 'سجل دفعة (حتى لو مبلغ بسيط). الدفعة تُعتبر تأكيد للحجز وتفتح بقية الإجراءات.'
      },
      {
        id: 'bd-btn-insurance',
        title: 'سند التأمين',
        body: 'سند منفصل عن الفواتير. استخدمه لإثبات قبض/صرف التأمين دون التأثير على الفواتير.'
      }
    ];
    if (booking.status === 'checked_in') {
      steps.unshift({
        id: 'bd-btn-checkout',
        title: 'تسجيل خروج',
        body: 'يُستخدم عند مغادرة العميل لإغلاق الإقامة وتحديث الحالة.'
      });
    }
    if (booking.status === 'confirmed') {
      steps.unshift({
        id: 'bd-btn-checkin',
        title: 'تسجيل دخول',
        body: 'بعد توقيع الاستلام اضغط لتسجيل دخول العميل.'
      });
    }
    return steps;
  }, [booking.status]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const k = 'booking_details_coach_v1';
    const seen = window.localStorage.getItem(k);
    if (!seen) {
      setCoachOpen(true);
      setCoachStepIndex(0);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (booking.status !== 'pending_deposit') return;
    const k = `booking_details_pending_deposit_hint_${booking.id}`;
    const seen = window.localStorage.getItem(k);
    if (!seen) setShowPendingDepositHint(true);
  }, [booking.id, booking.status]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!printMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest?.('#bd-print-menu')) return;
      setPrintMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [printMenuOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!alertsOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      const root = alertsRef.current;
      if (!root || !target) return;
      if (root.contains(target)) return;
      setAlertsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAlertsOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [alertsOpen]);

  const openPrintPreview = (title: string, href: string) => {
    printLoadTokenRef.current += 1;
    setPrintMenuOpen(false);
    setPrintMenuPos(null);
    setPrintPreviewTitle(title);
    setPrintPreviewUrl(href);
    setPrintPreviewLoading(true);
    setPrintPreviewOpen(true);
    try {
      window.sessionStorage.setItem(PRINT_PREVIEW_KEY, JSON.stringify({ title, href, ts: Date.now() }));
    } catch {}
  };

  const closePrintPreview = () => {
    printLoadTokenRef.current += 1;
    setPrintPreviewOpen(false);
    setPrintPreviewUrl(null);
    setPrintPreviewTitle('');
    setPrintPreviewLoading(false);
    try {
      window.sessionStorage.removeItem(PRINT_PREVIEW_KEY);
    } catch {}
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as any).__freeze_role_updates = Boolean(printPreviewOpen);
    return () => {
      (window as any).__freeze_role_updates = false;
    };
  }, [printPreviewOpen]);

  useEffect(() => {
    if (!printPreviewOpen || !printPreviewUrl) return;
    const token = printLoadTokenRef.current;
    let rafId = 0;
    let timeoutId: any = null;
    let settled = false;

    const settle = () => {
      if (settled) return;
      settled = true;
      if (printLoadTokenRef.current !== token) return;
      setPrintPreviewLoading(false);
    };

    const attach = () => {
      const iframe = printFrameRef.current;
      if (!iframe) {
        rafId = window.requestAnimationFrame(attach);
        return;
      }

      const onLoad = () => settle();
      const onError = () => settle();
      iframe.addEventListener('load', onLoad);
      iframe.addEventListener('error', onError as any);

      const checkReady = () => {
        if (printLoadTokenRef.current !== token) return;
        try {
          const rs = iframe.contentDocument?.readyState;
          if (rs && rs !== 'loading') {
            settle();
            return;
          }
        } catch {}
        rafId = window.requestAnimationFrame(checkReady);
      };
      rafId = window.requestAnimationFrame(checkReady);

      timeoutId = window.setTimeout(() => settle(), 8000);

      return () => {
        iframe.removeEventListener('load', onLoad);
        iframe.removeEventListener('error', onError as any);
      };
    };

    const detach = attach();
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (timeoutId) window.clearTimeout(timeoutId);
      if (detach) detach();
    };
  }, [printPreviewOpen, printPreviewUrl]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!printPreviewOpen || !printPreviewUrl) {
      setPrintPreviewScale(1);
      return;
    }
    const isContract = printPreviewUrl.includes('/print/contract/');
    const update = () => {
      const w = window.innerWidth;
      if (!isContract || w >= 640) {
        setPrintPreviewScale(1);
        return;
      }
      if (w < 390) setPrintPreviewScale(0.72);
      else if (w < 430) setPrintPreviewScale(0.76);
      else if (w < 520) setPrintPreviewScale(0.82);
      else setPrintPreviewScale(0.88);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [printPreviewOpen, printPreviewUrl]);

  React.useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(PRINT_PREVIEW_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { title?: string; href?: string };
      if (!parsed?.href) return;
      if (printPreviewOpen && printPreviewUrl) return;
      setPrintPreviewTitle(String(parsed.title || 'الطباعة'));
      setPrintPreviewUrl(String(parsed.href));
      setPrintPreviewLoading(true);
      setPrintPreviewOpen(true);
    } catch {}
  }, [PRINT_PREVIEW_KEY, printPreviewOpen, printPreviewUrl]);

  React.useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    if (!coachOpen) {
      setCoachRect(null);
      setCoachAnchor(null);
      return;
    }
    const step = coachSteps[coachStepIndex];
    if (!step) return;

    const update = () => {
      const el = document.getElementById(step.id);
      if (!el) {
        setCoachRect(null);
        setCoachAnchor(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const pad = 6;
      setCoachRect({
        top: r.top - pad,
        left: r.left - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2
      });
      const preferredLeft = Math.min(r.left, window.innerWidth - 340);
      const preferredTop = Math.min(r.bottom + 10, window.innerHeight - 220);
      setCoachAnchor({ top: preferredTop, left: Math.max(12, preferredLeft) });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [coachOpen, coachStepIndex, coachSteps]);
  useEffect(() => {
    const loadExtensionEvents = async () => {
      const { data } = await supabase
        .from('system_events')
        .select('id,created_at,payload')
        .eq('event_type', 'booking_extension_invoice_period')
        .eq('booking_id', booking.id)
        .order('created_at', { ascending: false });
      const map: Record<string, { period_start: string; period_end: string }> = {};
      (data || []).forEach((ev: any) => {
        const invoiceId = ev?.payload?.invoice_id;
        const periodStart = ev?.payload?.period_start;
        const periodEnd = ev?.payload?.period_end;
        if (!invoiceId || !periodStart || !periodEnd) return;
        const key = String(invoiceId);
        if (map[key]) return;
        map[key] = { period_start: String(periodStart), period_end: String(periodEnd) };
      });
      setExtensionInvoicePeriods(map);
    };
    loadExtensionEvents();
  }, [booking.id]);
  const printVoucher = (ev: any) => {
    const vt = ev?.payload?.voucher_type;
    const amount = Number(ev?.payload?.amount) || 0;
    const vdate = ev?.payload?.voucher_date || (ev?.created_at ? String(ev.created_at).split('T')[0] : '');
    const pmId = ev?.payload?.payment_method_id || null;
    const pm = paymentMethods.find((p: any) => p.id === pmId);
    const methodName = pm?.name || pm?.method_name || 'الصندوق/البنوك';
    let debit = '';
    let credit = '';
    let title = '';
    if (vt === 'deposit_receipt') {
      debit = `1100 الصندوق/البنوك — ${methodName}`;
      credit = `2100 تأمينات مستلمة من العملاء`;
      title = 'سند قبض تأمين';
    } else if (vt === 'deposit_refund') {
      debit = `2100 تأمينات مستلمة من العملاء`;
      credit = `1100 الصندوق/البنوك — ${methodName}`;
      title = 'سند صرف تأمين';
    } else if (vt === 'deposit_to_damage_income') {
      debit = `2100 تأمينات مستلمة من العملاء`;
      credit = `5110 عوائد تلفيات عملاء`;
      title = 'سند استخدام التأمين كتلفيات';
    } else {
      debit = `2100 تأمينات مستلمة من العملاء`;
      credit = `6110 صيانة وإصلاحات`;
      title = 'سند استخدام التأمين لمقاصة مصروف';
    }
    const html = `
      <html dir="rtl" lang="ar">
      <head>
        <meta charSet="utf-8" />
        <title>${title}</title>
        <style>
          @page { size: A4; margin: 12mm; }
          body { font-family: system-ui, -apple-system, Segoe UI, Tahoma, Arial; color: #111827; }
          .card { max-width: 700px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
          .row { display: flex; justify-content: space-between; margin: 6px 0; font-size: 14px; }
          .title { font-size: 18px; font-weight: 700; color: #065f46; margin-bottom: 8px; }
          .sub { color: #6b7280; }
          .line { height: 1px; background: #e5e7eb; margin: 12px 0; }
          .amount { font-size: 20px; font-weight: 800; color: #111827; }
          .small { font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="title">${title}</div>
          <div class="row"><div class="sub">الحجز</div><div>#${booking.id}</div></div>
          <div class="row"><div class="sub">العميل</div><div>${booking.customer?.full_name || ''}</div></div>
          <div class="row"><div class="sub">التاريخ</div><div>${vdate}</div></div>
          <div class="line"></div>
          <div class="row"><div>المبلغ</div><div class="amount">${amount.toLocaleString()} ر.س</div></div>
          <div class="row"><div>من حساب</div><div>${debit}</div></div>
          <div class="row"><div>إلى حساب</div><div>${credit}</div></div>
          ${ev?.payload?.description ? `<div class="line"></div><div class="small">البيان: ${ev.payload.description}</div>` : ''}
        </div>
        <script>window.onload = () => { window.print(); }</script>
      </body>
      </html>
    `;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };
  const isExtensionInvoice = (inv: any) => {
    const n = String(inv?.invoice_number || '');
    if (n.includes('-EXT-')) return true;
    if (extensionInvoicePeriods[String(inv?.id || '')]) return true;
    const je = transactions.find(
      (t: any) =>
        t.reference_id === inv?.id &&
        (() => {
          const d = String(t.description || '');
          return d.includes('تمديد الحجز') || d.includes('تمديد') || d.includes('EXT');
        })()
    );
    return Boolean(je);
  };
  const hasPostedOrPaidInvoice = () => (invoices || []).some((inv: any) => ['posted', 'paid'].includes(inv.status));

  const getPostedJournalAmountForInvoice = (invoiceId: string) => {
    const je = transactions.find((t: any) => t.reference_type === 'invoice' && t.reference_id === invoiceId);
    if (!je) return null;
    const debits = je.journal_lines?.map((l: any) => Number(l.debit) || 0) || [];
    if (debits.length === 0) return 0;
    return Math.max(...debits);
  };

  // Derived Financials
  const activeInvoices = invoices.filter((inv) => inv.status !== 'void');
  const totalAmount = activeInvoices.reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0);

  // Helper to safely get transaction type
  const getTransactionType = (txn: any) => {
    if (txn.transaction_type && txn.transaction_type !== 'unknown') return txn.transaction_type;

    const desc = (txn.description || '').toLowerCase();
    const voucher = (txn.voucher_number || '').toUpperCase();

    // 1. Identify Invoice Issue (Increase in AR/Revenue)
    if (txn.reference_type === 'invoice' || desc.includes('فاتورة مبيعات') || desc.includes('invoice')) {
        return 'invoice_issue';
    }

    // 2. Identify Cancellation/Credit Note (Decrease in Revenue)
    if (txn.transaction_type === 'credit_note' || desc.includes('إلغاء') || desc.includes('credit note')) {
        return 'credit_note';
    }

    // 3. Identify Settlement
    if (txn.reference_type === 'platform_settlement' || desc.includes('تسوية') || voucher.startsWith('SET-')) {
        return 'platform_settlement';
    }

    // 4. Identify Invoice Adjustment
    if (txn.reference_type === 'invoice_adjustment' || desc.includes('تصحيح فرق قيد')) {
      return 'invoice_adjustment';
    }

    // 5. Identify Payment (Increase in Cash/Bank)
    // Check reference type or description
    if (txn.reference_type === 'payment' || txn.reference_type === 'booking') {
      if (desc.includes('استرداد') || desc.includes('refund')) return 'refund';
      if (desc.includes('عربون') || desc.includes('advance')) return 'advance_payment';
      if (paymentJournalMap[txn.id]) return 'payment';
      return 'payment';
    }

    // Fallback: If it's a posted journal entry that isn't an invoice, and it's linked to the booking, 
    // we should be careful. Let's look at the accounts.
    // (Omitted for brevity, but let's just return 'unknown' if not caught)
    return 'unknown';
  };

  const paidAmount = useMemo(() => {
    // Ensure unique transactions by ID to prevent doubling
    const uniqueTransactions = Array.from(new Map(transactions.map(t => [t.id, t])).values());
    
    return uniqueTransactions.reduce((sum, t) => {
      if (t.status !== 'posted') return sum;
      const type = getTransactionType(t);
      
      // Ignore Invoice Issues and Unknowns
      if (type === 'invoice_issue' || type === 'unknown') return sum;
      
      // Calculate amount from journal lines if available
      const debitValues = t.journal_lines?.map((l: any) => Number(l.debit) || 0) || [];
      const creditValues = t.journal_lines?.map((l: any) => Number(l.credit) || 0) || [];
      const debitAmount = debitValues.length > 0 ? Math.max(...debitValues) : 0;
      const creditAmount = creditValues.length > 0 ? Math.max(...creditValues) : 0;

      if (['payment', 'advance_payment'].includes(type)) {
        return sum + debitAmount;
      } else if (type === 'refund' || type === 'credit_note') {
         if (type === 'refund') return sum - creditAmount;
         // Credit notes for invoices don't reduce "Paid Amount"
         return sum;
      }
      return sum;
    }, 0);
  }, [transactions, paymentJournalMap]);
  
  const remainingAmount = totalAmount - paidAmount;

  const getInvoiceFinancials = (invoiceId: string) => {
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return { paid: 0, remaining: 0, status: 'draft' };
    
    const total = Number(inv.total_amount) || 0;
    if (inv.status === 'void') return { paid: 0, remaining: 0, status: 'void' };
    if (inv.status === 'draft') return { paid: 0, remaining: total, status: 'draft' };

    // 1. Explicitly linked payments (Direct or Allocated)
    let explicitlyPaid = 0;
    const processedPaymentIdsForThisInv = new Set<string>();

    // First, sum allocations for this invoice
    const invoiceAllocations = (allocations || []).filter(a => a.invoice_id === invoiceId);
    invoiceAllocations.forEach(a => {
      explicitlyPaid += (Number(a.amount) || 0);
      processedPaymentIdsForThisInv.add(a.payment_id);
    });

    // Then, add direct payments that don't have ANY allocations
    const directLinks = (directPayments || []).filter(p => p.invoice_id === invoiceId && !processedPaymentIdsForThisInv.has(p.id));
    directLinks.forEach(p => {
      const hasAnyAlloc = (allocations || []).some(a => a.payment_id === p.id);
      if (!hasAnyAlloc) {
        explicitlyPaid += (Number(p.amount) || 0);
      }
    });
    
    // 2. Unallocated Payments for this booking (FIFO)
    // Total Paid for booking (truth from journal entries)
    const bookingTotalPaid = paidAmount;
    
    // Sum of ALL explicit payments across ALL invoices
    const allInvoicesExplicitlyPaid = invoices.reduce((sum, currentInv) => {
        if (currentInv.status === 'void' || currentInv.status === 'draft') return sum;
        
        let invExplicit = 0;
        const invAllocs = (allocations || []).filter(a => a.invoice_id === currentInv.id);
        const invProcessedIds = new Set<string>();
        invAllocs.forEach(a => {
          invExplicit += (Number(a.amount) || 0);
          invProcessedIds.add(a.payment_id);
        });

        const invDirects = (directPayments || []).filter(p => p.invoice_id === currentInv.id && !invProcessedIds.has(p.id));
        invDirects.forEach(p => {
          const hasAnyAlloc = (allocations || []).some(a => a.payment_id === p.id);
          if (!hasAnyAlloc) invExplicit += (Number(p.amount) || 0);
        });

        return sum + invExplicit;
    }, 0);
    
    let unallocated = Math.max(0, bookingTotalPaid - allInvoicesExplicitlyPaid);
    
    // Distribute unallocated to invoices in order of creation (FIFO)
    let currentPaid = explicitlyPaid;
    const sortedActiveInvoices = [...invoices]
        .filter(i => i.status !== 'void' && i.status !== 'draft')
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    
    for (const i of sortedActiveInvoices) {
        const iTotal = Number(i.total_amount) || 0;
        
        let iExplicit = 0;
        const iAllocs = (allocations || []).filter(a => a.invoice_id === i.id);
        const iProcIds = new Set<string>();
        iAllocs.forEach(a => {
          iExplicit += (Number(a.amount) || 0);
          iProcIds.add(a.payment_id);
        });
        const iDirects = (directPayments || []).filter(p => p.invoice_id === i.id && !iProcIds.has(p.id));
        iDirects.forEach(p => {
          if (!(allocations || []).some(a => a.payment_id === p.id)) iExplicit += (Number(p.amount) || 0);
        });

        const iRemaining = Math.max(0, iTotal - iExplicit);
        
        const fromUnallocated = Math.min(iRemaining, unallocated);
        if (i.id === invoiceId) {
            currentPaid += fromUnallocated;
            break;
        }
        unallocated -= fromUnallocated;
    }

    const remaining = Math.max(0, total - currentPaid);
    const status = remaining <= 0.01 ? 'paid' : 'posted';
    
    return { paid: currentPaid, remaining, status };
  };

  const getInvoiceRemaining = (invoiceId: string) => getInvoiceFinancials(invoiceId).remaining;

  // Sync state with props
  React.useEffect(() => {
    setTransactions(initialTransactions);
    setInvoices(initialInvoices || []);
  }, [initialTransactions, initialInvoices]);

  useEffect(() => {
    const fetchAllocations = async () => {
      const invoiceIds = (invoices || []).map(i => i.id);
      
      const [allocRes, payRes] = await Promise.all([
        supabase.from('payment_allocations').select('*, payments(status)').in('invoice_id', invoiceIds.length > 0 ? invoiceIds : ['00000000-0000-0000-0000-000000000000']),
        supabase.from('payments').select('*').eq('customer_id', booking.customer_id).eq('status', 'posted')
      ]);

      if (allocRes.data) {
        const postedAllocations = allocRes.data.filter((a: any) => a.payments?.status === 'posted');
        setAllocations(postedAllocations);
      }
      if (payRes.data) {
        // Filter payments to only those relevant to this booking's invoices or unlinked ones for this customer
        // Actually, let's just take all payments for this booking if possible.
        // The payments table has a booking_id? Let's check.
        // db.sql says it has customer_id and invoice_id, but doesn't mention booking_id.
        // Wait, ConfirmStep.tsx inserts payment with booking_id? No, it's not in the schema.
        // But it is linked via journal_entry which is linked to booking.
        
        // Let's stick to payments linked to our invoices OR those that are in our transactions list.
        const txnJournalIds = transactions.map(t => t.id);
        const relevantPayments = payRes.data.filter(p => 
          (p.invoice_id && invoiceIds.includes(p.invoice_id)) || 
          (p.journal_entry_id && txnJournalIds.includes(p.journal_entry_id))
        );
        setDirectPayments(relevantPayments);
      }
    };
    fetchAllocations();
  }, [invoices]);

  useEffect(() => {
    setNewCheckIn(booking.check_in?.split('T')[0] || '');
    setNewCheckOut(booking.check_out?.split('T')[0] || '');
  }, [booking.check_in, booking.check_out]);

  const mapUpdateDatesError = (e: any) => {
    const msg = String(e?.message || e?.details || e?.hint || e || '');
    if (msg.includes('Access denied')) return 'هذه العملية متاحة للأدمن فقط';
    if (msg.includes('Booking not found')) return 'الحجز غير موجود';
    if (msg.includes('Both dates are required')) return 'يرجى تحديد تاريخي الوصول والمغادرة';
    if (msg.includes('Check-out must be after check-in')) return 'يجب أن يكون تاريخ المغادرة بعد تاريخ الوصول';
    if (msg.includes('For checked-in booking, dates must include today')) return 'للحجز الذي تم الدخول فيه: يجب أن يشمل المدى تاريخ اليوم';
    if (msg.includes('Dates conflict with another booking')) return 'التواريخ تتعارض مع حجز آخر للوحدة';
    return msg || 'خطأ غير معروف';
  };

  const updateBookingDatesAdmin = async (checkInISO: string, checkOutISO: string) => {
    if (!isAdmin) {
      alert('غير مصرح: تعديل تواريخ الحجز متاح للأدمن فقط');
      return false;
    }
    if (!['pending_deposit', 'confirmed', 'checked_in'].includes(booking.status)) {
      alert('لا يمكن تعديل تواريخ هذا الحجز في حالته الحالية');
      return false;
    }

    if (!checkInISO || !checkOutISO) {
      alert('يرجى تحديد تاريخي الوصول والمغادرة');
      return false;
    }

    const start = new Date(`${checkInISO}T00:00:00`);
    const end = new Date(`${checkOutISO}T00:00:00`);
    if (start >= end) {
      alert('يجب أن يكون تاريخ المغادرة بعد تاريخ الوصول');
      return false;
    }

    if (booking.status === 'checked_in') {
      const todayISO = new Date().toISOString().split('T')[0];
      const today = new Date(`${todayISO}T00:00:00`);
      if (!(today >= start && today < end)) {
        alert('للحجز الذي تم الدخول فيه: يجب أن يشمل المدى تاريخ اليوم');
        return false;
      }
    }

    if (hasPostedOrPaidInvoice()) {
      const ok = confirm('يوجد فواتير مرحلة/مدفوعة لهذا الحجز. تعديل التواريخ لن يعدّل الفواتير تلقائياً. متابعة؟');
      if (!ok) return false;
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc('update_booking_dates_admin', {
        p_booking_id: booking.id,
        p_new_check_in: checkInISO,
        p_new_check_out: checkOutISO,
      });
      if (error) throw error;
      router.refresh();
      return true;
    } catch (e: any) {
      alert('تعذر تعديل التواريخ: ' + mapUpdateDatesError(e));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleReschedule = async () => {
    if (!newCheckIn || !newCheckOut) {
      alert('يرجى تحديد تاريخي الوصول والمغادرة');
      return;
    }
    const ok = await updateBookingDatesAdmin(newCheckIn, newCheckOut);
    if (ok) {
      setShowReschedule(false);
    }
  };

  const handleDelayBooking = async () => {
    const days = Number(delayDays) || 0;
    if (days <= 0) {
      alert('أدخل عدد أيام صحيح للتأخير');
      return;
    }
    const currentCheckInISO = String(booking.check_in || '').split('T')[0];
    const currentCheckOutISO = String(booking.check_out || '').split('T')[0];
    const start = new Date(`${currentCheckInISO}T00:00:00`);
    const end = new Date(`${currentCheckOutISO}T00:00:00`);
    const newStartISO = format(addDays(start, days), 'yyyy-MM-dd');
    const newEndISO = format(addDays(end, days), 'yyyy-MM-dd');

    const ok = await updateBookingDatesAdmin(newStartISO, newEndISO);
    if (ok) {
      setShowDelay(false);
    }
  };

  const handleCancelExtension = async (inv: any) => {
    if (!isAdmin) {
      alert('هذه العملية متاحة للأدمن فقط');
      return;
    }
    if (!isExtensionInvoice(inv)) {
      alert('الفاتورة المحددة ليست فاتورة تمديد');
      return;
    }
    if (!confirm(`هل ترغب بإلغاء التمديد لهذه الفاتورة (${inv.invoice_number})؟\nسيتم حذف فاتورة التمديد وسدادها وقيودها فقط، وإرجاع تاريخ المغادرة ومبالغ الحجز كما كانت قبل هذا التمديد.\nملاحظة: يجب إلغاء آخر تمديد أولاً إن وُجد أكثر من تمديد.`)) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc('cancel_extension_invoice_hard', { p_invoice_id: inv.id });
      if (error) throw error;

      setInvoices(prev => prev.filter(i => i.id !== inv.id));
      alert('تم إلغاء التمديد بنجاح');
      router.refresh();
    } catch (err: any) {
      alert('تعذر إلغاء التمديد: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  const handleUnpostInvoice = async (inv: any) => {
    if (!isAdmin) {
      alert('هذه العملية متاحة للأدمن فقط');
      return;
    }
    if (inv.status !== 'posted') {
      alert('الفاتورة ليست في حالة ترحيل');
      return;
    }
    if (!confirm(`هل أنت متأكد من إلغاء ترحيل الفاتورة رقم (${inv.invoice_number})؟ سيتم حذف القيد المحاسبي وتحويل الفاتورة إلى مسودة.`)) return;
    
    setLoading(true);
    try {
      const { error } = await supabase.rpc('unpost_invoice', {
        p_invoice_id: inv.id
      });

      if (error) throw error;

      // Refresh transactions and invoices
      const referenceIds = [booking.id, ...invoices.map(i => i.id)];
      const { data: newTxns } = await supabase
        .from('journal_entries')
        .select(`
          *,
          journal_lines(
            *
          )
        `)
        .in('reference_id', referenceIds)
        .order('created_at', { ascending: false });
      
      if (newTxns) setTransactions(newTxns);
      
      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'draft' } : i));
      alert('تم إلغاء ترحيل الفاتورة بنجاح');
      router.refresh();
    } catch (err: any) {
      console.error('Unpost Error:', err);
      alert('حدث خطأ أثناء إلغاء الترحيل: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  const handleFixInvoiceJournal = async (inv: any) => {
    if (!isAdmin) {
      alert('هذه العملية متاحة للأدمن فقط');
      return;
    }
    if (!inv?.id) return;
    const postedAmount = getPostedJournalAmountForInvoice(inv.id);
    const currentAmount = Number(inv.total_amount || 0);
    const mismatch = postedAmount !== null && Math.abs(Number(postedAmount) - currentAmount) > 0.009;
    const label = postedAmount === null
      ? 'لا يوجد قيد مرتبط بهذه الفاتورة. سيتم إنشاء/تصحيح قيد محاسبي بناءً على قيم الفاتورة الحالية.'
      : mismatch
        ? `يوجد اختلاف بين مبلغ الفاتورة (${currentAmount.toLocaleString()} ر.س) ومبلغ القيد (${Number(postedAmount).toLocaleString()} ر.س).`
        : 'سيتم التحقق من القيد وقد يتم إنشاء قيد تصحيح إذا لزم.';
    const paidHint = inv.status === 'paid' ? '\nملاحظة: الفاتورة مدفوعة، سيتم إنشاء قيد تصحيح (بدون حذف القيد السابق).' : '\nملاحظة: الفاتورة غير مدفوعة، يمكن إعادة بناء القيد بالكامل.';
    if (!confirm(`${label}${paidHint}\n\nمتابعة؟`)) return;

    setLoading(true);
    try {
      const { error } = await supabase.rpc('fix_invoice_journal', {
        p_invoice_id: inv.id
      });
      if (error) throw error;
      router.refresh();
      alert('تم تصحيح قيد الفاتورة بنجاح');
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('Could not find the') && msg.includes('schema cache')) {
        alert('دالة تصحيح القيد غير ظاهرة في مخطط قاعدة البيانات (schema cache). نفّذ سكربت الدالة ثم قم بعمل Reload schema في Supabase.');
        return;
      }
      alert('تعذر تصحيح القيد: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInvoiceAdjustment = async (txn: any) => {
    if (!isAdmin) {
      alert('هذه العملية متاحة للأدمن فقط');
      return;
    }
    if (!txn?.id) return;
    if (!confirm('هل ترغب بحذف قيد التصحيح؟\nسيتم حذف القيد فقط (مع الأرشفة) بدون المساس بالفاتورة أو السداد.\nقد يعود الاختلاف حتى تعيد تصحيح القيد مرة أخرى.')) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc('unpost_invoice_adjustment', {
        p_journal_entry_id: txn.id
      });
      if (error) throw error;
      router.refresh();
      alert('تم حذف قيد التصحيح بنجاح');
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('Could not find the') && msg.includes('schema cache')) {
        alert('دالة حذف قيد التصحيح غير ظاهرة في مخطط قاعدة البيانات (schema cache). نفّذ سكربت الدالة ثم قم بعمل Reload schema في Supabase.');
        return;
      }
      alert('تعذر حذف قيد التصحيح: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePostInvoice = async (inv: any) => {
    if (!isAdmin) {
      alert('هذه العملية متاحة للأدمن فقط');
      return;
    }
    if (inv.status !== 'draft') {
      alert('الفاتورة ليست في حالة مسودة');
      return;
    }
    if (!confirm(`هل أنت متأكد من ترحيل الفاتورة رقم (${inv.invoice_number})؟ سيتم إنشاء قيد محاسبي.`)) return;

    setIsIssuing(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data: updatedInvoice, error: upError } = await supabase
        .from('invoices')
        .update({ status: 'posted', invoice_date: new Date().toISOString() })
        .eq('id', inv.id)
        .select()
        .single();
      if (upError) throw upError;

      const { error: txnError } = await supabase.rpc('post_transaction', {
        p_transaction_type: 'invoice_issue',
        p_source_type: 'invoice',
        p_source_id: updatedInvoice.id,
        p_amount: Number(updatedInvoice.total_amount || 0), // Gross amount
        p_customer_id: booking.customer_id,
        p_payment_method_id: null,
        p_transaction_date: today,
        p_description: `فاتورة مبيعات #${updatedInvoice.invoice_number}`,
        p_tax_amount: Number(updatedInvoice.tax_amount || 0)
      });
      if (txnError) throw txnError;

      const referenceIds = Array.from(new Set([booking.id, ...invoices.map((i: any) => i.id), updatedInvoice.id]));
      const { data: newTxns } = await supabase
        .from('journal_entries')
        .select(`
          *,
          journal_lines(
            *
          )
        `)
        .in('reference_id', referenceIds)
        .order('created_at', { ascending: false });
      if (newTxns) setTransactions(newTxns);

      setInvoices(prev => prev.map(i => i.id === updatedInvoice.id ? updatedInvoice : i));
      alert('تم ترحيل الفاتورة بنجاح');
      router.refresh();
    } catch (err: any) {
      console.error('Post Invoice Error:', err);
      alert('حدث خطأ أثناء ترحيل الفاتورة: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setIsIssuing(false);
    }
  };

  const handleUnpostPayment = async (txn: any) => {
    if (!isAdmin) {
      alert('هذه العملية متاحة للأدمن فقط');
      return;
    }
    // txn here is from journal_entries, we need to find the related payment id
    const paymentId = paymentJournalMap[txn.id];
    if (!paymentId) {
      alert('لا يمكن العثور على سجل السند المرتبط بهذا القيد.');
      return;
    }

    if (!confirm(`هل أنت متأكد من إلغاء ترحيل/حذف السند؟ سيتم حذف القيد المحاسبي وعكس الأثر المالي.`)) return;
    
    setLoading(true);
    try {
      const { error } = await supabase.rpc('unpost_payment', {
        p_payment_id: paymentId
      });

      if (error) throw error;

      // Refresh data
      router.refresh();
      alert('تم إلغاء ترحيل السند بنجاح');
    } catch (err: any) {
      console.error('Unpost Payment Error:', err);
      alert('حدث خطأ أثناء إلغاء ترحيل السند: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  const handleEditPayment = async (txn: any) => {
    if (!isAdmin) {
      alert('هذه العملية متاحة للأدمن فقط');
      return;
    }
    const paymentId = paymentJournalMap[txn.id];
    if (!paymentId) {
      alert('لا يمكن العثور على سجل السند المرتبط بهذا القيد.');
      return;
    }

    // Fetch the payment record to get current date and description
    const { data: payment, error } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (error || !payment) {
      alert('فشل في جلب بيانات السند للتعديل');
      return;
    }

    setEditingPayment(payment);
    setPaymentDate(payment.payment_date?.split('T')[0] || '');
    setDescription(payment.description || '');
    setSelectedInvoiceId(payment.invoice_id || null); // Set initial invoice link
    setEditPaymentMethodId(payment.payment_method_id || '');
    setEditTransactionType(getTransactionType(txn) === 'advance_payment' ? 'advance_payment' : 'payment');
    setShowEditPaymentModal(true);
  };

  const handleUpdatePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment) return;

    setLoading(true);
    try {
      const { error } = await supabase.rpc('update_payment_details', {
        p_payment_id: editingPayment.id,
        p_new_date: paymentDate,
        p_new_description: description,
        p_new_invoice_id: selectedInvoiceId, // Pass the new/updated invoice ID
        p_new_payment_method_id: editPaymentMethodId,
        p_new_transaction_type: editTransactionType
      });

      if (error) throw error;

      setShowEditPaymentModal(false);
      setEditingPayment(null);
      setDescription('');
      setSelectedInvoiceId(null);
      setPaymentDate(new Date().toISOString().split('T')[0]);
      
      alert('تم تحديث بيانات السند بنجاح');
      router.refresh();
    } catch (err: any) {
      console.error('Update Payment Error:', err);
      alert('حدث خطأ أثناء تحديث السند: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  const openInvoiceEdit = (inv: any) => {
    if (!isAdmin) {
      alert('هذه العملية متاحة للأدمن فقط');
      return;
    }
    if (inv.status !== 'draft') {
      alert('لا يمكن تعديل الفاتورة بعد الترحيل. قم بإلغاء الترحيل أولاً.');
      return;
    }
    setEditingInvoice(inv);
    setInvoiceNumberEdit(String(inv.invoice_number || ''));
    setInvoiceDateEdit(String(inv.invoice_date || inv.created_at || '').split('T')[0] || new Date().toISOString().split('T')[0]);
    setInvoiceDueDateEdit(String(inv.due_date || '').split('T')[0] || '');
    setInvoiceSubtotalEdit(String(Number(inv.subtotal || 0)));
    setInvoiceTaxEdit(String(Number(inv.tax_amount || 0)));
    setInvoiceDiscountEdit(String(Number(inv.discount_amount || 0)));
    setInvoiceExtrasEdit(String(Number(inv.additional_services_amount || 0)));
    setInvoiceTotalEdit(String(Number(inv.total_amount || 0)));
    setShowEditInvoiceModal(true);
  };

  const openExtensionEdit = (inv: any) => {
    if (!isAdmin) {
      alert('هذه العملية متاحة للأدمن فقط');
      return;
    }
    const p = extensionInvoicePeriods[String(inv?.id || '')];
    if (!p?.period_start || !p?.period_end) {
      alert('لا يمكن تعديل هذا التمديد لأنه لا توجد بيانات فترة التمديد (period_start/period_end).');
      return;
    }
    const baseSubtotal = Number(inv?.subtotal || 0);
    const discount = Number(inv?.discount_amount || 0);
    const extras = Number(inv?.additional_services_amount || 0);
    const net = Math.max(0, baseSubtotal - discount + extras);
    const tax = Number(inv?.tax_amount || 0);
    const inferredRate = net > 0 && tax > 0 ? Math.min(1, Math.max(0, tax / net)) : hotelTaxRate;
    setEditingExtensionInvoice(inv);
    setExtPeriodStart(String(p.period_start));
    setExtPeriodEnd(String(p.period_end));
    setExtNewEndDate(String(p.period_end));
    setExtMonths('1');
    setExtBaseSubtotal(String(baseSubtotal));
    setExtDiscount(String(discount));
    setExtExtras(String(extras));
    setExtApplyTax(tax > 0);
    setExtTaxRate(String(Math.round(inferredRate * 100000) / 100000));
    setShowEditExtensionModal(true);
  };

  const handleUpdateExtensionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert('هذه العملية متاحة للأدمن فقط');
      return;
    }
    if (!editingExtensionInvoice) return;
    if (!extNewEndDate || !extPeriodStart || !extPeriodEnd) {
      alert('بيانات التمديد غير مكتملة');
      return;
    }
    const baseSubtotal = Number(extBaseSubtotal || 0);
    const discount = Number(extDiscount || 0);
    const extras = Number(extExtras || 0);
    const taxRate = Number(extTaxRate || hotelTaxRate);
    if ([baseSubtotal, discount, extras, taxRate].some((n) => Number.isNaN(n) || n < 0)) {
      alert('تحقق من القيم المالية (يجب أن تكون أرقاماً غير سالبة)');
      return;
    }
    if (taxRate > 1) {
      alert('نسبة الضريبة يجب أن تكون رقم بين 0 و 1 (مثال: 0.15)');
      return;
    }
    {
      const net = Math.max(0, baseSubtotal - discount + extras);
      const tax = extApplyTax ? Math.round(net * taxRate * 100) / 100 : 0;
      const grand = net + tax;
      if (grand <= 0) {
        alert('لا يمكن تعديل التمديد لأن إجمالي فاتورة التمديد سيصبح 0 (وهذا يسبب خطأ ترحيل القيد). عدّل القيم ثم أعد المحاولة.');
        return;
      }
    }
    if (new Date(`${extNewEndDate}T00:00:00`) <= new Date(`${extPeriodStart}T00:00:00`)) {
      alert('تاريخ نهاية التمديد يجب أن يكون بعد بداية التمديد');
      return;
    }
    if (!confirm('سيتم تعديل فاتورة التمديد وتحديث تاريخ الحجز وإجمالي الحجز بناءً على فرق هذا التمديد فقط.\nمتابعة؟')) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc('update_extension_invoice_v2', {
        p_invoice_id: editingExtensionInvoice.id,
        p_new_end_date: extNewEndDate,
        p_additional_subtotal: baseSubtotal,
        p_discount_amount: discount,
        p_extras_amount: extras,
        p_apply_tax: extApplyTax,
        p_tax_rate: taxRate
      });
      if (error) throw error;
      setShowEditExtensionModal(false);
      setEditingExtensionInvoice(null);
      alert('تم تحديث التمديد بنجاح');
      router.refresh();
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('Could not find the') && msg.includes('schema cache')) {
        alert('دالة تعديل التمديد غير ظاهرة في مخطط قاعدة البيانات (schema cache). نفّذ سكربت الدالة ثم قم بعمل Reload schema في Supabase.');
        return;
      }
      alert('تعذر تعديل التمديد: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoice) return;
    const subtotal = Number(invoiceSubtotalEdit || 0);
    const taxAmount = Number(invoiceTaxEdit || 0);
    const discountAmount = Number(invoiceDiscountEdit || 0);
    const extrasAmount = Number(invoiceExtrasEdit || 0);
    const totalAmount = Number(invoiceTotalEdit || 0);
    if (!invoiceNumberEdit.trim()) {
      alert('رقم الفاتورة مطلوب');
      return;
    }
    if ([subtotal, taxAmount, discountAmount, extrasAmount, totalAmount].some((n) => Number.isNaN(n) || n < 0)) {
      alert('تحقق من القيم المالية (يجب أن تكون أرقاماً غير سالبة)');
      return;
    }
    setLoading(true);
    try {
      const updatePayload: any = {
        invoice_number: invoiceNumberEdit.trim(),
        invoice_date: invoiceDateEdit,
        due_date: invoiceDueDateEdit || null,
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        discount_amount: discountAmount,
        additional_services_amount: extrasAmount
      };

      const { data: updated, error } = await supabase
        .from('invoices')
        .update(updatePayload)
        .eq('id', editingInvoice.id)
        .select()
        .single();

      if (error) throw error;

      try {
        const { data: { user: actor } } = await supabase.auth.getUser();
        await supabase.from('system_events').insert({
          event_type: 'invoice_updated',
          booking_id: booking.id,
          customer_id: booking.customer_id,
          unit_id: booking.unit_id,
          hotel_id: booking.hotel_id || null,
          message: `تعديل فاتورة ${invoiceNumberEdit.trim()}`,
          payload: {
            invoice_id: editingInvoice.id,
            actor_id: actor?.id || null,
            actor_email: actor?.email || null,
            changes: updatePayload
          }
        });
      } catch {}

      setInvoices((prev) => prev.map((i) => (i.id === editingInvoice.id ? updated : i)));
      setShowEditInvoiceModal(false);
      setEditingInvoice(null);
      alert('تم تحديث الفاتورة بنجاح');
      router.refresh();
    } catch (err: any) {
      console.error('Update Invoice Error:', err);
      alert('تعذر تحديث الفاتورة: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateBookingPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert('هذه العملية متاحة للأدمن فقط');
      return;
    }
    const hasActiveExtension = (invoices || []).some((inv: any) => inv?.status !== 'void' && isExtensionInvoice(inv));
    if (hasActiveExtension) {
      alert('لا يمكن تعديل الحجز بالكامل طالما يوجد تمديد. يرجى إلغاء/حذف فواتير التمديد أولاً.');
      return;
    }
    if (!confirm('سيتم تعديل تواريخ الحجز والفاتورة الأساسية وإعادة ترحيلها (إن كانت مرحلة).\nمهم: يجب ألا تكون هناك سندات قبض مرتبطة بالفاتورة.\nمتابعة؟')) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_update_booking_full_v1', {
        p_booking_id: booking.id,
        p_new_check_in: newCheckIn,
        p_new_check_out: newCheckOut,
        p_invoice_subtotal: Number(newSubtotal),
        p_invoice_discount: Number(newDiscountAmount),
        p_invoice_extras: Number(newExtrasAmount),
        p_apply_tax: includeTax,
        p_tax_rate: hotelTaxRate
      });

      if (error) throw error;
      if (data && data.success === false) throw new Error(data.message);

      alert('تم تحديث مبلغ الحجز وكافة التبعيات بنجاح');
      setShowEditPrice(false);
      router.refresh();
    } catch (err: any) {
      console.error('Update Price Error:', err);
      const msg = String(err?.message || err || '');
      if (msg.includes('يجب إلغاء التمديد')) {
        alert('لا يمكن التعديل لأن الحجز عليه تمديد. قم بإلغاء التمديد أولاً.');
      } else if (msg.includes('يوجد') && msg.includes('سندات قبض')) {
        alert('لا يمكن التعديل لأن هناك سندات قبض مرتبطة بالفاتورة الأساسية. قم بإلغاء السندات أولاً.');
      } else if (msg.includes('لا يمكن تعديل فاتورة مدفوعة')) {
        alert('لا يمكن تعديل فاتورة مدفوعة. قم بإلغاء السداد/السندات أولاً.');
      } else if (msg.includes('Dates conflict with another booking')) {
        alert('تعذر تعديل التواريخ: التواريخ تتعارض مع حجز آخر للوحدة');
      } else if (msg.includes('For checked-in booking')) {
        alert('تعذر تعديل التواريخ: للحجز الذي تم الدخول فيه يجب أن يشمل المدى تاريخ اليوم');
      } else if (msg.includes('Check-out must be after check-in')) {
        alert('تعذر تعديل التواريخ: يجب أن يكون تاريخ المغادرة بعد تاريخ الوصول');
      } else if (msg.includes('Access denied')) {
        alert('غير مصرح: هذه العملية متاحة للأدمن فقط');
      } else {
        alert('حدث خطأ أثناء تعديل الحجز: ' + (msg || 'خطأ غير معروف'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFetchAvailableUnits = async () => {
    setLoading(true);
    try {
      const hotelId = booking.hotel_id || booking.unit?.hotel_id;
      if (!hotelId) {
          throw new Error('بيانات الفندق غير متوفرة في هذا الحجز');
      }

      // 1. Get ALL units in the same hotel
      const { data: units, error } = await supabase
        .from('units')
        .select(`
            id, 
            unit_number, 
            floor, 
            unit_type_id,
            unit_type:unit_types(name)
        `)
        .eq('hotel_id', hotelId)
        .neq('id', booking.unit_id);

      if (error) {
        console.error('Units fetch error:', error);
        throw error;
      }

      if (!units || units.length === 0) {
        setAvailableUnits([]);
        return;
      }

      // 2. Filter out busy units during the booking period
      const unitIds = units.map(u => u.id);
      const { data: busyUnits, error: busyError } = await supabase
        .from('bookings')
        .select('unit_id')
        .in('unit_id', unitIds)
        .in('status', ['confirmed', 'checked_in', 'pending_deposit'])
        .lt('check_in', booking.check_out)
        .gt('check_out', booking.check_in);

      if (busyError) {
        console.error('Bookings overlap error:', busyError);
        throw busyError;
      }

      const busyIds = new Set(busyUnits?.map(b => b.unit_id) || []);
      const finalAvailable = units.map((u: any) => {
          const uType = Array.isArray(u.unit_type) ? u.unit_type[0] : u.unit_type;
          return {
            ...u,
            is_same_type: u.unit_type_id === booking.unit?.unit_type_id,
            unit_type_name: uType?.name || 'غير محدد'
          };
      }).filter(u => !busyIds.has(u.id));
      
      setAvailableUnits(finalAvailable);
      if (finalAvailable.length === 0) {
          alert('لا توجد وحدات متاحة في هذه الفترة');
      }
    } catch (err: any) {
      console.error('Error fetching available units:', err);
      alert('حدث خطأ أثناء جلب الوحدات المتاحة: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  const handleChangeUnitSubmit = async () => {
    if (!isAdmin) {
      alert('هذه العملية متاحة للأدمن فقط');
      return;
    }
    if (!selectedNewUnitId) {
      alert('يرجى اختيار الوحدة الجديدة');
      return;
    }

    const newUnit = availableUnits.find(u => u.id === selectedNewUnitId);
    if (!confirm(`هل أنت متأكد من تغيير الوحدة من ${booking.unit?.unit_number} إلى ${newUnit?.unit_number}؟\nسيتم تحديث كافة السجلات المرتبطة بالوحدة.`)) {
      return;
    }

    setIsChangingUnit(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.rpc('change_booking_unit', {
        p_booking_id: booking.id,
        p_new_unit_id: selectedNewUnitId,
        p_actor_id: user?.id || null
      });

      if (error) throw error;

      if (data.success) {
        alert(data.message);
        setShowChangeUnit(false);
        router.refresh();
      } else {
        alert(data.message);
      }
    } catch (err: any) {
      console.error('Change Unit Error:', err);
      alert('حدث خطأ أثناء تغيير الوحدة: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setIsChangingUnit(false);
    }
  };

  const cancelInvoice = async (inv: any) => {
    if (!isAdmin) {
      alert('هذه العملية متاحة للأدمن فقط');
      return;
    }
    if (!inv?.id) return;
    if (inv.status === 'paid') {
      alert('لا يمكن إلغاء فاتورة مدفوعة');
      return;
    }
    if (!confirm(`هل ترغب بإلغاء الفاتورة (${inv.invoice_number})؟ سيتم عكس الأثر (إن كانت مرحلة) وتحويلها إلى ملغاة.`)) return;
    setLoading(true);
    try {
      const { data: relatedPayments } = await supabase
        .from('payments')
        .select('id')
        .eq('invoice_id', inv.id)
        .eq('status', 'posted');
      if (Array.isArray(relatedPayments) && relatedPayments.length > 0) {
        throw new Error('لا يمكن إلغاء الفاتورة لوجود سندات قبض مرحلة مرتبطة بها. قم بإلغاء السندات أولاً.');
      }

      if (inv.status === 'posted') {
        const today = new Date().toISOString().split('T')[0];
        const { error: creditNoteErr } = await supabase.rpc('post_transaction', {
          p_transaction_type: 'credit_note',
          p_source_type: 'invoice',
          p_source_id: inv.id,
          p_amount: Number(inv.total_amount || 0),
          p_customer_id: booking.customer_id,
          p_payment_method_id: null,
          p_transaction_date: today,
          p_description: `إلغاء فاتورة - #${inv.invoice_number}`,
          p_tax_amount: Number(inv.tax_amount || 0)
        });
        if (creditNoteErr) throw creditNoteErr;
      }

      const { error: voidErr } = await supabase
        .from('invoices')
        .update({ status: 'void' })
        .eq('id', inv.id);
      if (voidErr) throw voidErr;

      setInvoices((prev) => prev.map((i) => (i.id === inv.id ? { ...i, status: 'void' } : i)));
      router.refresh();
      alert('تم إلغاء الفاتورة بنجاح');
    } catch (err: any) {
      console.error('Cancel Invoice Error:', err);
      alert('تعذر إلغاء الفاتورة: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  const deleteInvoice = async (inv: any) => {
    if (!isAdmin) {
      alert('هذه العملية متاحة للأدمن فقط');
      return;
    }
    if (!inv?.id) return;
    if (inv.status !== 'draft') {
      alert('لا يمكن حذف الفاتورة إلا إذا كانت مسودة (غير مرحلة).');
      return;
    }
    if (!confirm(`هل ترغب بحذف الفاتورة نهائياً (${inv.invoice_number})؟`)) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc('delete_draft_invoice', { p_invoice_id: inv.id });
      if (error) throw error;

      setInvoices((prev) => prev.filter((i) => i.id !== inv.id));
      router.refresh();
      alert('تم حذف الفاتورة نهائياً');
    } catch (err: any) {
      console.error('Delete Invoice Error:', err);
      const msg = String(err?.message || '');
      if (msg.includes('Could not find the') && msg.includes('schema cache')) {
        alert('دالة حذف الفاتورة غير ظاهرة في مخطط قاعدة البيانات (schema cache). نفّذ سكربت الدالة ثم قم بعمل Reload schema في Supabase.');
        return;
      }
      alert('تعذر حذف الفاتورة: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const handleIssueInvoice = async () => {
    if (!isAdmin) {
      alert('هذه العملية متاحة للأدمن فقط');
      return;
    }
    if (!confirm('هل أنت متأكد من إصدار الفاتورة الأساسية؟ سيتم إنشاء قيد محاسبي وترحيل الدين على العميل.')) return;
    
    setIsIssuing(true);
    try {
      const { data: { user: actor } } = await supabase.auth.getUser();

      const { data: res2, error: err2 } = await supabase.rpc('issue_invoice_for_booking_v2', {
        p_booking_id: booking.id,
        p_invoice_date: new Date().toISOString().split('T')[0],
        p_paid_amount: 0,
        p_actor_id: actor?.id || null
      });

      if (!err2 && res2?.success && res2?.invoice_id) {
        const { data: inv, error: invErr } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', res2.invoice_id)
          .single();
        if (invErr) throw invErr;

        if (inv.status === 'draft') {
          await handlePostInvoice(inv);
          return;
        }

        alert(`الفاتورة موجودة مسبقاً بالحالة: ${inv.status}`);
        router.refresh();
        return;
      }

      const { data: res, error: rpcError } = await supabase.rpc('issue_invoice_for_booking', {
        p_booking_id: booking.id
      });

      if (rpcError) throw rpcError;
      if (!res?.success) throw new Error(res?.message || 'فشل إصدار الفاتورة');

      const { invoice_number } = res;
      alert(`تم إصدار الفاتورة رقم ${invoice_number} وترحيل القيد بنجاح`);
      router.refresh();
      
    } catch (err: any) {
      console.error('Invoice Error:', err);
      alert('حدث خطأ أثناء إصدار الفاتورة: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setIsIssuing(false);
    }
  };

  const handleCheckIn = async () => {
  if (!confirm('تأكيد تسجيل الدخول؟ سيتم التأكد من وجود الفاتورة، وإنشاؤها كمسودة عند الحاجة، ثم ترحيلها قبل تسجيل الدخول.')) return;
    setLoading(true);
    try {
        // 1. Robust Invoice Generation via RPC
      // 1) التأكد من وجود فاتورة غير ملغاة
let activeInvoice = (invoices || [])
  .filter((inv: any) => inv.status !== 'void')
  .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

// 2) إذا لا توجد فاتورة: أنشئ مسودة بالمنطق الجديد
if (!activeInvoice) {
  const { data: { user: actor } } = await supabase.auth.getUser();

  const { data: createRes, error: createErr } = await supabase.rpc('issue_invoice_for_booking_v2', {
    p_booking_id: booking.id,
    p_invoice_date: new Date().toISOString().split('T')[0],
    p_paid_amount: 0,
    p_actor_id: actor?.id || null
  });

  if (createErr) throw createErr;
  if (!createRes?.success) throw new Error(createRes?.message || 'تعذر إنشاء فاتورة للحجز');

  const { data: createdInvoice, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', createRes.invoice_id)
    .single();

  if (invErr) throw invErr;
  activeInvoice = createdInvoice;
}

// 3) إذا كانت الفاتورة مسودة: رحّلها
if (activeInvoice && activeInvoice.status === 'draft') {
  await handlePostInvoice(activeInvoice);
}
        // If invoice exists (success: false), it's fine to continue with check-in
        
        // --- 2. Booking Status Logic ---
        const { error } = await supabase
            .from('bookings')
            .update({ status: 'checked_in' })
            .eq('id', booking.id);
      
        if (error) throw error;
      
        // --- 3. Unit Status Logic ---
        if (booking.unit_id) {
             await supabase.from('units').update({ status: 'occupied' }).eq('id', booking.unit_id);
        }

        try {
          const { data: { user } } = await supabase.auth.getUser();
          const message = `تم تسجيل الدخول للحجز رقم ${booking.id.slice(0, 8).toUpperCase()} للعميل ${booking.customer?.full_name || ''} في الوحدة ${booking.unit?.unit_number || ''} من ${booking.check_in} إلى ${booking.check_out}`;
          await supabase.from('system_events').insert({
            event_type: 'check_in',
            booking_id: booking.id,
            unit_id: booking.unit_id,
            customer_id: booking.customer_id,
            hotel_id: booking.hotel_id || null,
            message,
            payload: {
              actor_id: user?.id || null,
              actor_email: user?.email || null,
              invoice_generated: true
            }
          });
        } catch (eventError) {
          console.error('Failed to log check_in event:', eventError);
        }

        router.refresh();
        alert('تم تسجيل الدخول بنجاح');
    } catch (err: any) {
        console.error('Check-in Error:', err);
        alert('حدث خطأ أثناء تسجيل الدخول: ' + (err.message || 'خطأ غير معروف'));
    } finally {
        setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const outStr = (booking.check_out ? String(booking.check_out).split('T')[0] : '');
      if (outStr) {
        if (outStr !== todayStr) {
          const target = new Date(outStr + 'T00:00:00');
          const today = new Date(todayStr + 'T00:00:00');
          const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const msg =
            diffDays > 0
              ? `هل تود تأكيد مغادرة اليوم؟ باقي على موعد المغادرة ${diffDays} يوم.`
              : `هل تود تأكيد مغادرة اليوم؟ تم تجاوز موعد المغادرة بـ ${Math.abs(diffDays)} يوم.`;
          const ok = confirm(msg);
          if (!ok) return;
        }
      }
    } catch {}

    let latestRemaining = remainingAmount;
    let latestTotal = totalAmount;
    let latestPaid = paidAmount;

    setLoading(true);
    try {
      const { data: latestInvoices, error: invErr } = await supabase
        .from('invoices')
        .select('id,total_amount,status,created_at,invoice_number')
        .eq('booking_id', booking.id)
        .order('created_at', { ascending: false });
      if (invErr) throw invErr;

      const invs = (latestInvoices || []) as any[];
      const activeInvs = invs.filter((inv) => inv?.status !== 'void');
      const computedTotal =
        activeInvs.length > 0
          ? activeInvs.reduce((sum, inv) => sum + (Number(inv?.total_amount) || 0), 0)
          : (Number(booking?.total_price) || 0);

      const referenceIds = Array.from(new Set([booking.id, ...activeInvs.map((i) => i.id).filter(Boolean)]));
      let latestTxns: any[] = [];
      if (referenceIds.length > 0) {
        const { data: txns, error: txnErr } = await supabase
          .from('journal_entries')
          .select(`
            id,
            status,
            reference_type,
            reference_id,
            description,
            voucher_number,
            created_at,
            journal_lines(debit, credit)
          `)
          .in('reference_id', referenceIds)
          .order('created_at', { ascending: false });
        if (txnErr) throw txnErr;
        latestTxns = (txns || []) as any[];
      }

      const uniqueTxns = Array.from(new Map(latestTxns.map((t) => [t.id, t])).values());
      const computedPaid = uniqueTxns.reduce((sum, t) => {
        if (t.status !== 'posted') return sum;
        const type = getTransactionType(t);
        if (type === 'invoice_issue' || type === 'unknown') return sum;
        const debitValues = t.journal_lines?.map((l: any) => Number(l.debit) || 0) || [];
        const creditValues = t.journal_lines?.map((l: any) => Number(l.credit) || 0) || [];
        const debitAmount = debitValues.length > 0 ? Math.max(...debitValues) : 0;
        const creditAmount = creditValues.length > 0 ? Math.max(...creditValues) : 0;
        if (['payment', 'advance_payment'].includes(type)) return sum + debitAmount;
        if (type === 'refund') return sum - creditAmount;
        if (type === 'credit_note') return sum;
        return sum;
      }, 0);

      latestTotal = computedTotal;
      latestPaid = computedPaid;
      latestRemaining = Math.round((latestTotal - latestPaid) * 100) / 100;

      setInvoices(invs);
      setTransactions(latestTxns);
    } catch {
      latestRemaining = remainingAmount;
      latestTotal = totalAmount;
      latestPaid = paidAmount;
    } finally {
      setLoading(false);
    }

    if (latestRemaining > 0.009) {
      if (!isAdmin) {
        alert(`لا يمكن تسجيل الخروج قبل السداد الكامل.\nإجمالي الفاتورة: ${latestTotal.toLocaleString()} ر.س\nالمدفوع: ${latestPaid.toLocaleString()} ر.س\nالمتبقي: ${latestRemaining.toLocaleString()} ر.س`);
        return;
      }
      if (!confirm(`المتبقي على العميل ${latestRemaining.toLocaleString()} ر.س.\n(إجمالي: ${latestTotal.toLocaleString()} — مدفوع: ${latestPaid.toLocaleString()})\nهل أنت متأكد من تسجيل الخروج قبل السداد الكامل؟`)) return;
    } else {
      if (!confirm('تأكيد تسجيل الخروج؟')) return;
    }

    setLoading(true);
    try {
        const { error } = await supabase
            .from('bookings')
            .update({ status: 'checked_out' })
            .eq('id', booking.id);
      
        if (error) throw error;

        // Update Unit Status
        if (booking.unit_id) {
             await supabase.from('units').update({ status: 'cleaning' }).eq('id', booking.unit_id);
        }

        try {
          const { data: { user } } = await supabase.auth.getUser();
          const message = `تم تسجيل الخروج للحجز رقم ${booking.id.slice(0, 8).toUpperCase()} للعميل ${booking.customer?.full_name || ''} من الوحدة ${booking.unit?.unit_number || ''}`;
          await supabase.from('system_events').insert({
            event_type: 'check_out',
            booking_id: booking.id,
            unit_id: booking.unit_id,
            customer_id: booking.customer_id,
            hotel_id: booking.hotel_id || null,
            message,
            payload: {
              actor_id: user?.id || null,
              actor_email: user?.email || null,
              check_in: booking.check_in,
              check_out: booking.check_out
            }
          });

          if (booking.unit_id) {
            const cleaningMsg = `الغرفة ${booking.unit?.unit_number || ''} تحتاج إلى تنظيف بعد خروج الحجز رقم ${booking.id.slice(0, 8).toUpperCase()}`;
            await supabase.from('system_events').insert({
              event_type: 'room_needs_cleaning',
              booking_id: booking.id,
              unit_id: booking.unit_id,
              customer_id: booking.customer_id,
              hotel_id: booking.hotel_id || null,
              message: cleaningMsg
            });
          }
        } catch (eventError) {
          console.error('Failed to log checkout/cleaning events:', eventError);
        }

        try {
          const today = new Date().toISOString().split('T')[0];
          if (remainingAmount <= 0) {
            const { data: depositJEs } = await supabase
              .from('journal_entries')
              .select('id, reference_type, reference_id, description, voucher_number')
              .eq('reference_id', booking.id);
            const depositJeIds = (depositJEs || [])
              .filter((j: any) => getTransactionType(j) === 'advance_payment')
              .map((j: any) => j.id);
            if (depositJeIds.length > 0) {
              const { data: depositPays } = await supabase
                .from('payments')
                .select('id, amount, payment_method_id')
                .in('journal_entry_id', depositJeIds)
                .eq('status', 'posted');
              for (const p of depositPays || []) {
                const { error: refundError } = await supabase.rpc('post_transaction', {
                  p_transaction_type: 'refund',
                  p_source_type: 'payment',
                  p_source_id: p.id,
                  p_amount: p.amount,
                  p_customer_id: booking.customer_id,
                  p_payment_method_id: p.payment_method_id,
                  p_transaction_date: today,
                  p_description: `استرداد تأمين الحجز #${booking.id.slice(0, 8).toUpperCase()}`
                });
                if (refundError) {
                  console.error('Failed to post deposit refund transaction:', refundError);
                } else {
                  await supabase.from('system_events').insert({
                    event_type: 'deposit_refunded',
                    booking_id: booking.id,
                    customer_id: booking.customer_id,
                    hotel_id: booking.hotel_id || null,
                    message: `تم استرداد التأمين للعميل ${booking.customer?.full_name || ''} للحجز رقم ${booking.id.slice(0, 8).toUpperCase()}`,
                    payload: {
                      amount: p.amount
                    }
                  });
                }
              }
            }
          }
        } catch (refundEventErr) {
          console.error('Deposit refund handling failed:', refundEventErr);
        }

        router.refresh();
        alert('تم تسجيل الخروج بنجاح');
    } catch (err: any) {
        alert(err.message);
    } finally {
        setLoading(false);
    }
  };

  const handleUndoCheckOut = async () => {
    if (!isAdmin) {
      alert('هذه العملية متاحة للأدمن فقط');
      return;
    }
    if (booking.status !== 'checked_out') return;
    if (!confirm('تأكيد التراجع عن تسجيل الخروج؟ سيتم إعادة الحجز إلى حالة (مقيم) وإعادة حالة الوحدة إلى (مشغولة).')) return;

    setLoading(true);
    try {
      const { error: bErr } = await supabase
        .from('bookings')
        .update({ status: 'checked_in' })
        .eq('id', booking.id);
      if (bErr) throw bErr;

      if (booking.unit_id) {
        const { error: uErr } = await supabase
          .from('units')
          .update({ status: 'occupied' })
          .eq('id', booking.unit_id);
        if (uErr) throw uErr;
      }

      const eventTypes = ['check_out', 'room_needs_cleaning', 'deposit_refunded'];
      for (const eventType of eventTypes) {
        try {
          const { data: lastEvent } = await supabase
            .from('system_events')
            .select('id')
            .eq('booking_id', booking.id)
            .eq('event_type', eventType)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (lastEvent?.id) {
            await supabase.from('system_events').delete().eq('id', lastEvent.id);
          }
        } catch {}
      }

      router.refresh();
      alert('تم التراجع عن تسجيل الخروج بنجاح');
    } catch (e: any) {
      alert('تعذر التراجع عن تسجيل الخروج: ' + String(e?.message || e || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!isAdmin) {
      alert('هذه العملية متاحة للأدمن فقط');
      return;
    }
    setShowCancelModal(false);
    setLoading(true);
    try {
        // Call the new cancellation function
        const { error } = await supabase.rpc('cancel_booking_fully', {
            p_booking_id: booking.id
        });

        if (error) throw error;

        router.refresh();
        alert('تم إلغاء الحجز وأرشفة القيود بنجاح');
    } catch (err: any) {
        console.error('Cancellation Error:', err);
        alert('حدث خطأ أثناء إلغاء الحجز: ' + (err.message || 'خطأ غير معروف'));
    } finally {
        setLoading(false);
    }
  };

  const handleDeleteCancelledBooking = async () => {
    if (!isAdmin) {
      alert('هذه العملية متاحة للأدمن فقط');
      return;
    }
    if (booking.status !== 'cancelled') {
      alert('لا يمكن الحذف النهائي إلا للحجوزات الملغاة');
      return;
    }
    if (!confirm('هل أنت متأكد من الحذف النهائي لهذا الحجز؟ سيتم حذف الحجز والفواتير والمدفوعات المرتبطة به نهائياً.')) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc('delete_cancelled_booking_fully', {
        p_booking_id: booking.id
      });
      if (error) throw error;
      alert('تم حذف الحجز نهائياً');
      router.push('/bookings-list');
      router.refresh();
    } catch (err: any) {
      console.error('Delete Cancelled Booking Error:', err);
      alert('تعذر حذف الحجز: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };


  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!amount) {
      alert('يرجى إدخال المبلغ');
      return;
    }
    
    if (!paymentMethodId) {
      alert('يرجى اختيار طريقة الدفع');
      return;
    }

    if (paymentRequireInvoice && !selectedInvoiceId) {
      alert('يرجى اختيار الفاتورة لربط الدفعة بها');
      return;
    }

    setLoading(true);
    try {
      const numAmount = parseFloat(amount);
      
      // Removed strict overpayment check as per user request
      // We still use remainingAmount for descriptions/logic but don't block

      if (selectedInvoiceId) {
        const invRemaining = getInvoiceRemaining(selectedInvoiceId);
        if (numAmount > invRemaining + 0.01) {
          // We allow paying more if not linked to a specific invoice, 
          // but if an invoice is selected, we should respect its limit or alert the user.
          // Actually, usually users want to pay the whole booking.
          // For now, let's just stick to the booking-level cap as primary, 
          // but show a warning if it exceeds invoice.
        }
      }

      // Check for Open Accounting Period
      const { data: period, error: periodError } = await supabase
        .from('accounting_periods')
        .select('id')
        .lte('start_date', paymentDate)
        .gte('end_date', paymentDate)
        .eq('status', 'open')
        .maybeSingle();

      if (periodError) throw periodError;
      if (!period) {
        throw new Error(`لا توجد فترة محاسبية مفتوحة للتاريخ المختار (${paymentDate}). يرجى فتح فترة محاسبية أولاً.`);
      }
      
      // Determine transaction type logic based on database constraints
      // If an 'invoice_issue' transaction exists, we are paying off AR -> use 'payment'
      // Otherwise, we are collecting advance -> use 'advance_payment'
      const hasInvoice = transactions.some(t => getTransactionType(t) === 'invoice_issue');
      
      const type = hasInvoice ? 'payment' : 'advance_payment';

      // Construct description with reference number
      const fullDescription = [
        description,
        referenceNumber ? `(Ref: ${referenceNumber})` : '',
        selectedInvoiceId ? `(سداد الفاتورة ${invoices.find(i => i.id === selectedInvoiceId)?.invoice_number})` : ''
      ].filter(Boolean).join(' ').trim() || (type === 'advance_payment' ? 'عربون / دفعة مقدمة' : 'سداد مستحقات');

      const { data: txnId, error } = await supabase.rpc('post_transaction', {
        p_transaction_type: type,
        p_source_type: 'booking',
        p_source_id: booking.id,
        p_amount: numAmount,
        p_customer_id: booking.customer_id,
        p_payment_method_id: paymentMethodId,
        p_transaction_date: paymentDate, // Use selected date
        p_description: fullDescription
      });

      if (error) throw error;

      if (txnId) {
        const paymentPayload: any = {
          customer_id: booking.customer_id,
          payment_method_id: paymentMethodId,
          amount: numAmount,
          payment_date: paymentDate,
          journal_entry_id: txnId,
          description: fullDescription,
          status: 'posted'
        };

        if (selectedInvoiceId) {
          paymentPayload.invoice_id = selectedInvoiceId;
        }

        const { data: paymentRow, error: paymentError } = await supabase
          .from('payments')
          .insert(paymentPayload)
          .select('id')
          .single();

        if (paymentError) {
          console.error('Failed to create payment record from BookingDetails:', paymentError);
        } else if (paymentRow?.id) {
          try {
            const allocatableInvoices = invoices
              .filter((inv: any) => inv && inv.id && inv.status !== 'void' && inv.status !== 'draft')
              .sort((a: any, b: any) => {
                const da = new Date(a.invoice_date || a.created_at || 0).getTime();
                const db = new Date(b.invoice_date || b.created_at || 0).getTime();
                return da - db;
              });

            const invoiceIds = allocatableInvoices.map((i: any) => i.id);

            if (selectedInvoiceId) {
              await supabase.from('payment_allocations').insert({
                payment_id: paymentRow.id,
                invoice_id: selectedInvoiceId,
                amount: numAmount
              });
            } else if (type === 'payment' && invoiceIds.length > 0) {
              const paidByInvoice: Record<string, number> = {};

              const { data: directPays } = await supabase
                .from('payments')
                .select('invoice_id, amount, status')
                .in('invoice_id', invoiceIds)
                .eq('status', 'posted');
              (directPays || []).forEach((p: any) => {
                if (!p?.invoice_id) return;
                paidByInvoice[p.invoice_id] = (paidByInvoice[p.invoice_id] || 0) + Number(p?.amount || 0);
              });

              const { data: allocs } = await supabase
                .from('payment_allocations')
                .select('invoice_id, amount, payment_id')
                .in('invoice_id', invoiceIds);

              const allocPaymentIds = Array.from(new Set((allocs || []).map((a: any) => a?.payment_id).filter(Boolean)));
              let statusByPaymentId: Record<string, string> = {};
              if (allocPaymentIds.length > 0) {
                const { data: allocPays } = await supabase
                  .from('payments')
                  .select('id, status')
                  .in('id', allocPaymentIds);
                (allocPays || []).forEach((p: any) => {
                  statusByPaymentId[p.id] = p.status;
                });
              }

              (allocs || []).forEach((a: any) => {
                if (!a?.invoice_id) return;
                if (a.payment_id && statusByPaymentId[a.payment_id] === 'void') return;
                paidByInvoice[a.invoice_id] = (paidByInvoice[a.invoice_id] || 0) + Number(a?.amount || 0);
              });

              let remainingToAllocate = numAmount;
              const allocationRows: any[] = [];

              for (const inv of allocatableInvoices) {
                if (remainingToAllocate <= 0) break;
                const total = Number(inv.total_amount || 0);
                const paid = Math.min(Number(paidByInvoice[inv.id] || 0), total);
                const remaining = Math.max(0, total - paid);
                if (remaining <= 0) continue;
                const allocAmt = Math.min(remaining, remainingToAllocate);
                if (allocAmt <= 0) continue;
                allocationRows.push({
                  payment_id: paymentRow.id,
                  invoice_id: inv.id,
                  amount: allocAmt
                });
                remainingToAllocate -= allocAmt;
              }

              if (allocationRows.length > 0) {
                await supabase.from('payment_allocations').insert(allocationRows);
              }
            }
          } catch (allocError) {
            console.error('Failed to allocate payment across invoices:', allocError);
          }
        }
      }

      // Update Booking Status if it was pending_deposit
      if (booking.status === 'pending_deposit' && numAmount > 0) {
        await supabase
          .from('bookings')
          .update({ status: 'confirmed' })
          .eq('id', booking.id);
          
        router.refresh();
      }

      // Refresh transactions
      const invoiceIds = invoices.map(i => i.id);
      const { data: invPayments } = await supabase
        .from('payments')
        .select('id')
        .in('invoice_id', invoiceIds.length > 0 ? invoiceIds : ['00000000-0000-0000-0000-000000000000']);
      const paymentIds = (invPayments || []).map(p => p.id);
      const referenceIds = [booking.id, ...invoiceIds, ...paymentIds];

      const { data: newTxns } = await supabase
        .from('journal_entries')
        .select(`
          *,
          journal_lines(
            *
          )
        `)
        .in('reference_id', referenceIds)
        .order('created_at', { ascending: false });

      if (newTxns) {
        setTransactions(newTxns);
      }

      // Refresh Allocations and Direct Payments
      const currentInvoiceIds = invoices.map(i => i.id);
      if (currentInvoiceIds.length > 0) {
        const [allocRes, payRes] = await Promise.all([
          supabase.from('payment_allocations').select('*, payments(status)').in('invoice_id', currentInvoiceIds),
          supabase.from('payments').select('*').in('invoice_id', currentInvoiceIds).eq('status', 'posted')
        ]);
        if (allocRes.data) {
          const postedAllocations = allocRes.data.filter((a: any) => a.payments?.status === 'posted');
          setAllocations(postedAllocations);
        }
        if (payRes.data) setDirectPayments(payRes.data);
      }

      try {
        const beforeRemaining = remainingAmount + numAmount;
        const afterRemaining = remainingAmount;
        if (beforeRemaining > 0 && afterRemaining <= 0) {
          const msg = `تم سداد المبلغ المتبقي للعميل ${booking.customer?.full_name || ''} للحجز رقم ${booking.id.slice(0, 8).toUpperCase()}`;
          await supabase.from('system_events').insert({
            event_type: 'payment_settled',
            booking_id: booking.id,
            customer_id: booking.customer_id,
            hotel_id: booking.hotel_id || null,
            message: msg,
            payload: {
              amount: numAmount,
              payment_date: paymentDate
            }
          });
        }
      } catch (eventError) {
        console.error('Failed to log payment_settled event:', eventError);
      }
      
      setShowPaymentModal(false);
      setAmount('');
      setDescription('');
      setReferenceNumber('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setSelectedInvoiceId(null);
      alert('تم تسجيل الدفعة بنجاح');
      router.refresh(); // Refresh server data

    } catch (err: any) {
      console.error('Payment Error:', err);
      alert('حدث خطأ أثناء تسجيل الدفعة: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  const normalizePhone = (phone?: string) => {
    if (!phone) return '';
    let value = phone.replace(/[^\d+]/g, '');
    if (value.startsWith('+')) value = value.slice(1);
    if (value.startsWith('00')) value = value.slice(2);
    if (value.startsWith('0')) value = `966${value.slice(1)}`;
    if (!value.startsWith('966')) value = `966${value}`;
    return value;
  };

  const waLink = `https://wa.me/${normalizePhone(booking.customer?.phone)}?text=${encodeURIComponent(
    `مرحباً ${booking.customer?.full_name}،\nتفاصيل حجزكم رقم ${booking.id.slice(0, 8)}:\nالوحدة: ${booking.unit?.unit_number}\nالمبلغ المتبقي: ${remainingAmount.toLocaleString('en-US')} ر.س\nشكراً لاختياركم لنا.`
  )}`;

  const mailLink = `mailto:${booking.customer?.email || ''}?subject=${encodeURIComponent(`تفاصيل الحجز #${booking.id.slice(0, 8)}`)}&body=${encodeURIComponent(
    `مرحباً ${booking.customer?.full_name}،\n\nتفاصيل حجزكم:\nرقم الحجز: ${booking.id}\nالوحدة: ${booking.unit?.unit_number}\nالمبلغ الإجمالي: ${totalAmount}\nالمبلغ المدفوع: ${paidAmount}\nالمتبقي: ${remainingAmount}\n\nشكراً لكم.`
  )}`;

  const quickGuide = (() => {
    if (booking.status === 'pending_deposit') {
      return {
        tone: 'amber',
        title: 'الحجز بانتظار العربون',
        body: 'هذا الحجز لا يُعد مؤكدًا بعد.\n\nالخطوة 1: افتح زر "تسجيل دفعة" أو زر "سداد" وسجّل عربون (حتى لو مبلغ بسيط).\nالخطوة 2: بعد تسجيل الدفعة سيتحول الحجز تلقائياً إلى "مؤكد".\n\nلماذا هذا مهم؟ لأن النظام يعتمد العربون كبداية السلسلة المحاسبية: من خلاله يبدأ ترتيب الفواتير والقيود والسداد بشكل صحيح. تجاهل هذه الخطوة قد يسبب ارتباك في الحسابات أو اختلافات في السجل المالي.'
      };
    }
    if (booking.status === 'confirmed') {
      return {
        tone: 'blue',
        title: 'الحجز مؤكد — قبل تسجيل الدخول',
        body: 'قبل الضغط على زر "دخول / تم توقيع الاستلام" اتبع هذا الترتيب:\n\n1) اطبع "محضر استلام" من زر "طباعة" واذهب للوحدة.\n2) وقّع المحضر ورقياً مع العميل (هذه الخطوة تثبت الاستلام).\n3) ارجع للنظام واضغط زر "دخول / تم توقيع الاستلام".\n\nماذا يحدث عند الضغط؟\n- يتم تسجيل دخول العميل للحجز داخل النظام.\n- يقوم النظام بإصدار الفاتورة وترحيل القيود تلقائياً لتنظيم الحسابات.\n\nتنبيه: تسجيل الدخول بدون توقيع الاستلام يسبب خلل في تسلسل الإجراءات وقد يربك الفواتير والحسابات لاحقاً.'
      };
    }
    if (booking.status === 'checked_in') {
      return {
        tone: 'emerald',
        title: 'العميل مسجل دخول (مقيم)',
        body: 'الحجز في مرحلة الإقامة.\n\nيمكنك الآن:\n- تسجيل دفعات (سداد) وربطها بالفواتير.\n- طباعة العقد/الفواتير/السندات من زر الطباعة أو من داخل الأقسام.\n- تمديد الحجز عند الحاجة.\n\nعند انتهاء الإقامة:\n- اضغط زر "خروج" لتسجيل الإخلاء في النظام.\n- بعد الخروج ستعتمد إجراءات التسليم وتظهر مستندات التسليم وتحديثات لازمة للتنظيف والحسابات.'
      };
    }
    if (booking.status === 'checked_out') {
      return {
        tone: 'gray',
        title: 'الحجز تم الخروج منه',
        body: 'يمكنك الرجوع لأي مستند وطباعته من زر الطباعة أو من الأقسام.\nإذا كان هناك مبلغ متبقٍ أو سندات تأمين، راجع:\n- قسم "الفواتير" و"سجل العمليات المالية"\n- قسم "سندات التأمين"'
      };
    }
    if (booking.status === 'cancelled') {
      return {
        tone: 'red',
        title: 'الحجز ملغي',
        body: 'هذا الحجز ملغي.\nيمكنك طباعة المستندات للرجوع إليها.\nإجراءات الإلغاء/الحذف النهائي (إن كانت متاحة) للأدمن فقط لحماية الحسابات.'
      };
    }
    return {
      tone: 'gray',
      title: 'إرشادات',
      body: 'استخدم الأزرار حسب حالة الحجز، وراجع قسم الفواتير والسجل المالي للطباعة والسداد.'
    };
  })();

  const todayISO = new Date().toISOString().split('T')[0];
  const todayDate = new Date(`${todayISO}T00:00:00`);
  const checkInISO = String(booking.check_in || '').split('T')[0];
  const checkOutISO = String(booking.check_out || '').split('T')[0];
  const expectedCheckInDate = checkInISO ? new Date(`${checkInISO}T00:00:00`) : null;
  const expectedCheckOutDate = (() => {
    if (!checkOutISO) return null;
    return new Date(`${checkOutISO}T00:00:00`);
  })();
  const lateCheckInDays =
    booking.status === 'confirmed' && expectedCheckInDate
      ? Math.max(0, differenceInDays(todayDate, expectedCheckInDate))
      : 0;
  const lateCheckOutDays =
    booking.status === 'checked_in' && expectedCheckOutDate
      ? Math.max(0, differenceInDays(todayDate, expectedCheckOutDate))
      : 0;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `booking_details_quick_guide_seen_v1_${booking.id}`;
    try {
      const seen = window.localStorage.getItem(key) === '1';
      if (seen) return;
      window.localStorage.setItem(key, '1');
    } catch {}
    const autoMinId = window.setTimeout(() => setQuickGuideMinimized(true), 6500);
    setQuickGuideMinimized(false);
    setQuickGuideOpen(true);
    return () => window.clearTimeout(autoMinId);
  }, [booking.id]);

  const helpHints = (() => {
    if (booking.status === 'pending_deposit') return ['سجل عربون', 'ثم تأكيد', 'بعدها دخول', 'اطبع المستندات'];
    if (booking.status === 'confirmed') return ['اطبع الاستلام', 'وقع المحضر', 'ثم دخول', 'طباعة العقد'];
    if (booking.status === 'checked_in') return ['سدد المتبقي', 'اطبع الفواتير', 'طباعة السندات', 'عند الخروج'];
    if (booking.status === 'checked_out') return ['اطبع المستندات', 'راجع المتبقي', 'راجع التأمين'];
    if (booking.status === 'cancelled') return ['حجز ملغي', 'طباعة فقط'];
    return ['راجع الخطوات', 'افتح الدليل'];
  })();

  const hasEjarRejection =
    Boolean(ejarExistingUpload) &&
    String(ejarExistingUpload?.status || '') === 'rejected' &&
    Boolean(ejarExistingUpload?.decision_notes);
  const hasEjarNeedsDocumentation =
    Boolean(ejarExistingUpload) && String(ejarExistingUpload?.supervisor_note || '').trim() !== 'تم توثيق';
  const hasEjarApproval = Boolean(ejarApprovalCountdown);
  const hasKeyBadge = bookingKeys.length > 0;
  const hasEjarBadge = Boolean(ejarUploadStatusMeta);
  const hasQuickGuide = Boolean(quickGuide?.title || quickGuide?.body);
  const alertsCount =
    (hasQuickGuide ? 1 : 0) +
    (hasEjarBadge ? 1 : 0) +
    (hasKeyBadge ? 1 : 0) +
    (hasEjarRejection ? 1 : 0) +
    (hasEjarApproval ? 1 : 0) +
    (hasEjarNeedsDocumentation ? 1 : 0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!helpHints || helpHints.length === 0) return;
    const id = window.setInterval(() => {
      setHelpHintIndex((i) => (i + 1) % helpHints.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, [booking.id, helpHints.length]);

  return (
    <div className="space-y-6 overflow-x-hidden">
      {showHelpModal && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowHelpModal(false)} />
          <div className="absolute inset-0 flex items-end sm:items-center justify-center p-2 sm:p-4">
            <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b bg-white flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <HelpCircle size={18} className="text-gray-700" />
                  <div className="font-black text-gray-900 text-sm truncate">دليل استخدام صفحة تفاصيل الحجز</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHelpModal(false)}
                  className="p-2 rounded-2xl hover:bg-gray-100 text-gray-700"
                  title="إغلاق"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="max-h-[78vh] overflow-y-auto p-4 space-y-4 text-sm text-gray-900">
                <div className="border border-gray-200 rounded-2xl p-4 bg-gray-50">
                  <div className="font-black mb-2">أولاً: اتبع الخطوات حسب حالة الحجز</div>
                  <div className="text-xs text-gray-700 whitespace-pre-line leading-6">{quickGuide.body}</div>
                </div>

                <div className="border border-gray-200 rounded-2xl p-4">
                  <div className="font-black mb-2">ثانياً: ماذا يفعل كل زر؟</div>
                  <div className="space-y-2 text-xs text-gray-700 leading-6">
                    <div>زر "دخول / تم توقيع الاستلام": يسجل دخول العميل ويصدر الفاتورة ويرحل القيود لضبط الحسابات.</div>
                    <div>زر "خروج": يسجل خروج العميل (إخلاء) ويطلق إجراءات ما بعد الخروج مثل أحداث التنظيف والحسابات.</div>
                    <div>زر "تمديد": ينشئ فاتورة تمديد ويحدّث تاريخ المغادرة للحجز.</div>
                    <div>زر "تسجيل دفعة / سداد": يسجل سند قبض ويربطه بالحجز/الفاتورة، وقد يحول الحجز من "بانتظار العربون" إلى "مؤكد".</div>
                    <div>زر "سند التأمين": سند منفصل عن الفواتير لتسجيل قبض/صرف التأمين بدون التأثير على الفواتير.</div>
                    <div>زر "طباعة": يفتح معاينة للطباعة داخل الصفحة (العقد/الفواتير/محاضر الاستلام والتسليم والسندات).</div>
                    <div>قسم "الفواتير": يعرض فواتير الحجز وحالاتها (مسودة/مرحلة/مدفوعة) ومبالغها وإمكانية السداد والطباعة.</div>
                    <div>قسم "سجل العمليات المالية": يعرض القيود والسندات، مع طباعة كل مستند من نفس المكان.</div>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-2xl p-4">
                  <div className="font-black mb-2">ثالثاً: تنبيه الصلاحيات</div>
                  <div className="text-xs text-gray-700 leading-6">
                    بعض الأزرار الحساسة مثل التصحيح/الترحيل اليدوي/التعديل/الإلغاء/الحذف محجوبة لغير الأدمن لحماية الحسابات ومنع أخطاء غير مقصودة.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {printPreviewOpen && printPreviewUrl && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/35" />
          <div className="absolute inset-0 flex items-end sm:items-center justify-center p-2 sm:p-4">
            <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b bg-white flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Printer size={18} className="text-gray-700" />
                  <div className="font-black text-gray-900 text-sm truncate">{printPreviewTitle}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const w = printFrameRef.current?.contentWindow;
                        if (!w) return;
                        w.focus();
                        w.print();
                      } catch {
                        alert('تعذر بدء الطباعة من المعاينة. استخدم خيار فتح في تبويب.');
                      }
                    }}
                    className="px-3 py-2 rounded-2xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700"
                  >
                    طباعة
                  </button>
                  <a
                    href={printPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded-2xl border bg-white hover:bg-gray-50 text-xs font-black text-gray-900"
                  >
                    فتح
                  </a>
                  <button
                    type="button"
                    onClick={closePrintPreview}
                    className="p-2 rounded-2xl hover:bg-gray-100 text-gray-700"
                    title="إغلاق"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="relative bg-gray-50 h-[78vh] sm:h-[72vh]">
                {printPreviewLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-gray-700 text-sm font-bold">
                      <Loader2 className="animate-spin" size={18} />
                      جارٍ التحميل...
                    </div>
                  </div>
                )}
                {printPreviewScale === 1 ? (
                  <iframe
                    ref={printFrameRef}
                    src={printPreviewUrl}
                    className="w-full h-full"
                  />
                ) : (
                  <div className="w-full h-full overflow-auto">
                    <div
                      style={{
                        transform: `scale(${printPreviewScale})`,
                        transformOrigin: 'top center',
                        width: `${100 / printPreviewScale}%`,
                        height: `${100 / printPreviewScale}%`
                      }}
                    >
                      <iframe
                        ref={printFrameRef}
                        src={printPreviewUrl}
                        className="w-full h-full"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showPendingDepositHint && booking.status === 'pending_deposit' && (
        <div className="fixed top-4 right-4 z-50 max-w-sm bg-white border border-amber-200 rounded-2xl shadow-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <AlertTriangle size={18} />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-black text-gray-900">الحجز بانتظار العربون</div>
                <div className="text-xs text-gray-700 leading-5">
                  بعض الأزرار مثل تسجيل الدخول والطباعة تظهر بعد تسجيل دفعة.
                  أي دفعة—even لو مبلغ بسيط—تُعتبر تأكيد للحجز.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                try {
                  window.localStorage.setItem(`booking_details_pending_deposit_hint_${booking.id}`, '1');
                } catch {}
                setShowPendingDepositHint(false);
              }}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
              title="إغلاق"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {coachOpen && coachAnchor && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/25"
            onClick={() => {
              try {
                window.localStorage.setItem('booking_details_coach_v1', '1');
              } catch {}
              setCoachOpen(false);
            }}
          />
          {coachRect && (
            <div
              className="absolute rounded-2xl ring-2 ring-blue-400 shadow-[0_0_0_6px_rgba(59,130,246,0.15)] bg-white/0 pointer-events-none"
              style={{ top: coachRect.top, left: coachRect.left, width: coachRect.width, height: coachRect.height }}
            />
          )}
          <div
            className="absolute w-[320px] max-w-[calc(100vw-24px)] bg-white rounded-2xl shadow-xl border border-gray-200 p-4"
            style={{ top: coachAnchor.top, left: coachAnchor.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-black text-gray-900">{coachSteps[coachStepIndex]?.title}</div>
                <div className="text-xs text-gray-600 leading-5">{coachSteps[coachStepIndex]?.body}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  try {
                    window.localStorage.setItem('booking_details_coach_v1', '1');
                  } catch {}
                  setCoachOpen(false);
                }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                title="إغلاق"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="text-[10px] font-bold text-gray-500">
                {coachStepIndex + 1}/{coachSteps.length}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      window.localStorage.setItem('booking_details_coach_v1', '1');
                    } catch {}
                    setCoachOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50"
                >
                  تخطي
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = coachStepIndex + 1;
                    if (next >= coachSteps.length) {
                      try {
                        window.localStorage.setItem('booking_details_coach_v1', '1');
                      } catch {}
                      setCoachOpen(false);
                      return;
                    }
                    setCoachStepIndex(next);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700"
                >
                  التالي
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl ring-1 ring-emerald-100/70 bg-gradient-to-br from-emerald-50 via-white to-white p-4 sm:p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/bookings-list"
            className="p-2 rounded-xl ring-1 ring-emerald-200/70 bg-white/70 hover:bg-emerald-50 transition-colors"
            title="العودة لسجل الحجوزات"
          >
            <ArrowLeft size={22} className="text-gray-900" />
          </Link>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
              <span>تفاصيل الحجز</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] sm:text-xs font-mono font-extrabold px-2 py-0.5 rounded-full bg-emerald-900 text-white">
                  #{booking.id?.slice(0, 8)}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowHelpModal(true)}
                    className="p-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 animate-pulse"
                    title="دليل استخدام الصفحة"
                  >
                    <HelpCircle size={16} />
                  </button>
                  <div ref={alertsRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setAlertsOpen((v) => !v)}
                      className={cn(
                        'flex items-center gap-2 px-2.5 py-1.5 rounded-xl ring-1 shadow-sm transition-all text-[11px] font-extrabold',
                        alertsOpen
                          ? 'bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white ring-emerald-900/20'
                          : 'bg-white/70 text-emerald-950 ring-emerald-200/70 hover:bg-emerald-50'
                      )}
                      aria-haspopup="dialog"
                      aria-expanded={alertsOpen}
                      title="التنبيهات"
                    >
                      <Bell size={16} />
                      <span className="hidden sm:inline">التنبيهات</span>
                      {alertsCount > 0 && (
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded-full text-[10px] font-black',
                            alertsOpen ? 'bg-white/15 text-white' : 'bg-emerald-100 text-emerald-900'
                          )}
                        >
                          {alertsCount}
                        </span>
                      )}
                    </button>

                    {alertsOpen && (
                      <>
                        <div className="md:hidden fixed inset-0 z-[80]">
                          <div className="absolute inset-0 bg-black/40" onClick={() => setAlertsOpen(false)} />
                          <div className="absolute inset-0 flex items-end justify-center p-3">
                            <div className="w-full max-w-md rounded-3xl border border-emerald-200 bg-white shadow-2xl overflow-hidden">
                              <div className="px-4 py-3 border-b bg-gradient-to-br from-emerald-50 via-white to-white flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Bell size={18} className="text-emerald-700" />
                                  <div className="font-black text-emerald-950 text-sm truncate">التنبيهات</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setAlertsOpen(false)}
                                  className="p-2 rounded-2xl hover:bg-emerald-50 text-emerald-900"
                                  title="إغلاق"
                                >
                                  <X size={18} />
                                </button>
                              </div>
                              <div className="p-4 space-y-3 max-h-[72vh] overflow-y-auto">
                                <div className="rounded-2xl ring-1 ring-emerald-200/70 bg-emerald-50/60 p-3 text-[11px] font-extrabold text-emerald-900">
                                  {helpHints[helpHintIndex] || 'دليل سريع'}
                                </div>
                                {hasQuickGuide && (
                                  <div
                                    className={cn(
                                      'rounded-2xl border p-3',
                                      quickGuide.tone === 'amber'
                                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                                        : quickGuide.tone === 'blue'
                                          ? 'bg-blue-50 border-blue-200 text-blue-900'
                                          : quickGuide.tone === 'emerald'
                                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                            : quickGuide.tone === 'red'
                                              ? 'bg-red-50 border-red-200 text-red-900'
                                              : 'bg-gray-50 border-gray-200 text-gray-900'
                                    )}
                                  >
                                    <div className="font-black text-sm">{quickGuide.title}</div>
                                    <div className="mt-1 text-[11px] whitespace-pre-line leading-6">{quickGuide.body}</div>
                                    <div className="mt-3 flex items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAlertsOpen(false);
                                          setShowHelpModal(true);
                                        }}
                                        className="px-3 py-2 rounded-2xl bg-white/80 hover:bg-white border text-[11px] font-black"
                                      >
                                        تفاصيل أكثر
                                      </button>
                                    </div>
                                  </div>
                                )}
                                {hasEjarBadge && (
                                  <div className="rounded-2xl ring-1 ring-emerald-200/70 bg-white/70 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-[11px] font-black text-emerald-950">إيجار</div>
                                      <span className={cn('px-2 py-1 rounded-full border text-[10px] font-black', ejarUploadStatusMeta?.className)}>
                                        {ejarUploadStatusMeta?.label}
                                      </span>
                                    </div>
                                  </div>
                                )}
                                {hasEjarNeedsDocumentation && (
                                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <div className="text-xs font-black text-amber-900">تنبيه مهم</div>
                                        <div className="mt-1 text-[11px] font-bold text-amber-900 leading-6">
                                          العقد يحتاج إلى توثيق (المرفوع إلى منصة إيجار).
                                        </div>
                                      </div>
                                      {isAdmin ? (
                                        <button
                                          type="button"
                                          onClick={markEjarSupervisorNoteDocumented}
                                          disabled={ejarDocBusy}
                                          className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-[11px] font-black text-gray-800 disabled:opacity-60 shrink-0"
                                        >
                                          تم توثيق
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                )}
                                {hasEjarRejection && (
                                  <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
                                    <div className="text-xs font-black text-red-800 mb-1">ملاحظة الرفض (إيجار)</div>
                                    <div className="text-[11px] font-bold text-red-900 whitespace-pre-wrap">
                                      {String(ejarExistingUpload?.decision_notes || '')}
                                    </div>
                                  </div>
                                )}
                                {hasEjarApproval && (
                                  <div
                                    className={cn(
                                      'rounded-2xl border p-3',
                                      (ejarApprovalCountdown?.remaining || 0) > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
                                    )}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className={cn('text-xs font-black', (ejarApprovalCountdown?.remaining || 0) > 0 ? 'text-emerald-900' : 'text-red-900')}>
                                        تم تأكيد العقد وبانتظار الموافقة
                                      </div>
                                      {String(ejarExistingUpload?.supervisor_note || '').trim() !== 'تم توثيق' ? (
                                        <button
                                          type="button"
                                          onClick={markEjarSupervisorNoteDocumented}
                                          disabled={ejarDocBusy}
                                          className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-[11px] font-black text-gray-800 disabled:opacity-60"
                                        >
                                          تم توثيق
                                        </button>
                                      ) : (
                                        <span className="px-3 py-1.5 rounded-lg border bg-white text-[11px] font-black text-emerald-800 border-emerald-200">
                                          موثق
                                        </span>
                                      )}
                                    </div>
                                    {(ejarApprovalCountdown?.remaining || 0) > 0 ? (
                                      <div className="font-bold text-emerald-900 mt-1">
                                        متبقي {ejarApprovalCountdown?.remaining} يوم من مدة 7 أيام للموافقة.
                                      </div>
                                    ) : (
                                      <div className="font-bold text-red-900 mt-1">انتهت مدة 7 أيام للموافقة.</div>
                                    )}
                                    <div
                                      className={cn(
                                        'mt-2 text-[11px] font-bold dir-ltr',
                                        (ejarApprovalCountdown?.remaining || 0) > 0 ? 'text-emerald-800' : 'text-red-800'
                                      )}
                                    >
                                      confirmed: {ejarApprovalCountdown?.decidedDate} • deadline: {ejarApprovalCountdown?.deadlineDate}
                                    </div>
                                  </div>
                                )}
                                {hasKeyBadge && (
                                  <div className="rounded-2xl ring-1 ring-emerald-200/70 bg-white/70 p-3">
                                    <div className="flex items-center gap-2 text-emerald-950">
                                      <Key size={16} className="text-emerald-800" />
                                      <div className="text-[11px] font-extrabold">يوجد مفاتيح ذكية مصدرة لهذا الحجز</div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="hidden md:block absolute z-[80] top-10 right-0 w-[380px] max-w-[calc(100vw-24px)] rounded-3xl border border-emerald-200 bg-white shadow-2xl overflow-hidden">
                          <div className="px-4 py-3 border-b bg-gradient-to-br from-emerald-50 via-white to-white flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Bell size={18} className="text-emerald-700" />
                              <div className="font-black text-emerald-950 text-sm truncate">التنبيهات</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAlertsOpen(false)}
                              className="p-2 rounded-2xl hover:bg-emerald-50 text-emerald-900"
                              title="إغلاق"
                            >
                              <X size={18} />
                            </button>
                          </div>
                          <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                            <div className="rounded-2xl ring-1 ring-emerald-200/70 bg-emerald-50/60 p-3 text-[11px] font-extrabold text-emerald-900">
                              {helpHints[helpHintIndex] || 'دليل سريع'}
                            </div>
                            {hasQuickGuide && (
                              <div
                                className={cn(
                                  'rounded-2xl border p-3',
                                  quickGuide.tone === 'amber'
                                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                                    : quickGuide.tone === 'blue'
                                      ? 'bg-blue-50 border-blue-200 text-blue-900'
                                      : quickGuide.tone === 'emerald'
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                        : quickGuide.tone === 'red'
                                          ? 'bg-red-50 border-red-200 text-red-900'
                                          : 'bg-gray-50 border-gray-200 text-gray-900'
                                )}
                              >
                                <div className="font-black text-sm">{quickGuide.title}</div>
                                <div className="mt-1 text-[11px] whitespace-pre-line leading-6">{quickGuide.body}</div>
                                <div className="mt-3 flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAlertsOpen(false);
                                      setShowHelpModal(true);
                                    }}
                                    className="px-3 py-2 rounded-2xl bg-white/80 hover:bg-white border text-[11px] font-black"
                                  >
                                    تفاصيل أكثر
                                  </button>
                                </div>
                              </div>
                            )}
                            {hasEjarBadge && (
                              <div className="rounded-2xl ring-1 ring-emerald-200/70 bg-white/70 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-[11px] font-black text-emerald-950">إيجار</div>
                                  <span className={cn('px-2 py-1 rounded-full border text-[10px] font-black', ejarUploadStatusMeta?.className)}>
                                    {ejarUploadStatusMeta?.label}
                                  </span>
                                </div>
                              </div>
                            )}
                            {hasEjarNeedsDocumentation && (
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="text-xs font-black text-amber-900">تنبيه مهم</div>
                                    <div className="mt-1 text-[11px] font-bold text-amber-900 leading-6">
                                      العقد يحتاج إلى توثيق (المرفوع إلى منصة إيجار).
                                    </div>
                                  </div>
                                  {isAdmin ? (
                                    <button
                                      type="button"
                                      onClick={markEjarSupervisorNoteDocumented}
                                      disabled={ejarDocBusy}
                                      className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-[11px] font-black text-gray-800 disabled:opacity-60 shrink-0"
                                    >
                                      تم توثيق
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            )}
                            {hasEjarRejection && (
                              <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
                                <div className="text-xs font-black text-red-800 mb-1">ملاحظة الرفض (إيجار)</div>
                                <div className="text-[11px] font-bold text-red-900 whitespace-pre-wrap">
                                  {String(ejarExistingUpload?.decision_notes || '')}
                                </div>
                              </div>
                            )}
                            {hasEjarApproval && (
                              <div
                                className={cn(
                                  'rounded-2xl border p-3',
                                  (ejarApprovalCountdown?.remaining || 0) > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
                                )}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className={cn('text-xs font-black', (ejarApprovalCountdown?.remaining || 0) > 0 ? 'text-emerald-900' : 'text-red-900')}>
                                    تم تأكيد العقد وبانتظار الموافقة
                                  </div>
                                  {String(ejarExistingUpload?.supervisor_note || '').trim() !== 'تم توثيق' ? (
                                    <button
                                      type="button"
                                      onClick={markEjarSupervisorNoteDocumented}
                                      disabled={ejarDocBusy}
                                      className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-[11px] font-black text-gray-800 disabled:opacity-60"
                                    >
                                      تم توثيق
                                    </button>
                                  ) : (
                                    <span className="px-3 py-1.5 rounded-lg border bg-white text-[11px] font-black text-emerald-800 border-emerald-200">
                                      موثق
                                    </span>
                                  )}
                                </div>
                                {(ejarApprovalCountdown?.remaining || 0) > 0 ? (
                                  <div className="font-bold text-emerald-900 mt-1">
                                    متبقي {ejarApprovalCountdown?.remaining} يوم من مدة 7 أيام للموافقة.
                                  </div>
                                ) : (
                                  <div className="font-bold text-red-900 mt-1">انتهت مدة 7 أيام للموافقة.</div>
                                )}
                                <div
                                  className={cn(
                                    'mt-2 text-[11px] font-bold dir-ltr',
                                    (ejarApprovalCountdown?.remaining || 0) > 0 ? 'text-emerald-800' : 'text-red-800'
                                  )}
                                >
                                  confirmed: {ejarApprovalCountdown?.decidedDate} • deadline: {ejarApprovalCountdown?.deadlineDate}
                                </div>
                              </div>
                            )}
                            {hasKeyBadge && (
                              <div className="rounded-2xl ring-1 ring-emerald-200/70 bg-white/70 p-3">
                                <div className="flex items-center gap-2 text-emerald-950">
                                  <Key size={16} className="text-emerald-800" />
                                  <div className="text-[11px] font-extrabold">يوجد مفاتيح ذكية مصدرة لهذا الحجز</div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-gray-500">
              عرض حالة الحجز، بيانات النزيل، السجل المالي والعمليات المرتبطة بالحجز.
            </p>
          </div>
        </div>
        <div className="w-full md:w-auto max-w-full overflow-x-auto md:overflow-visible">
          <div className="flex flex-wrap justify-start md:justify-end gap-2">
          {['confirmed', 'checked_in'].includes(booking.status) && (
            <button
              onClick={() => router.push(`/bookings-list/${booking.id}/extend`)}
              id="bd-btn-extend"
              title="تمديد الحجز: ينشئ فاتورة تمديد ويحدّث تاريخ المغادرة"
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white rounded-2xl md:rounded-xl hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800 transition-all text-[11px] md:text-sm font-extrabold shadow-sm"
            >
              <Clock size={18} />
              <span className="hidden md:inline">تمديد الحجز</span>
              <span className="md:hidden">تمديد</span>
            </button>
          )}

          {['confirmed', 'checked_in'].includes(booking.status) && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUploadContractToEjar}
                title="رفع العقد إلى منصة إيجار: يحفظ بيانات الرفع في قاعدة البيانات"
                disabled={ejarUploadBusy || (Boolean(ejarExistingUpload) && String(ejarExistingUpload?.status || '') === 'confirmed')}
                className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white rounded-2xl md:rounded-xl hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800 transition-all text-[11px] md:text-sm font-extrabold shadow-sm disabled:opacity-60"
              >
                {ejarUploadBusy ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                <span className="hidden md:inline">
                  {Boolean(ejarExistingUpload) && String(ejarExistingUpload?.status || '') !== 'confirmed' ? 'تعديل رفع إيجار' : 'رفع العقد إلى إيجار'}
                </span>
                <span className="md:hidden">إيجار</span>
              </button>
            </div>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={deleteEjarUploadForBooking}
              disabled={ejarDeleteBusy || !ejarExistingUpload?.id}
              title={ejarExistingUpload?.id ? 'حذف رفع إيجار لهذا الحجز' : 'لا يوجد رفع إيجار لهذا الحجز'}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-700 text-white rounded-2xl md:rounded-xl hover:bg-amber-800 transition-colors text-[11px] md:text-sm font-extrabold shadow-sm disabled:opacity-60"
            >
              {ejarDeleteBusy ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
              <span className="hidden md:inline">حذف رفع إيجار</span>
              <span className="md:hidden">حذف</span>
            </button>
          )}

    {isAdmin && showChangeUnit && (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/40" onClick={() => setShowChangeUnit(false)} />
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-blue-100 overflow-hidden">
            <div className="px-4 py-3 border-b bg-blue-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Home className="text-blue-600" size={18} />
                <span className="font-bold text-blue-700 text-sm">تغيير الوحدة السكنية</span>
              </div>
              <button
                type="button"
                onClick={() => setShowChangeUnit(false)}
                className="px-2 py-1 text-xs rounded-lg border bg-white hover:bg-gray-50"
              >
                إغلاق
              </button>
            </div>
            <div className="p-4 space-y-4 text-right">
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs text-amber-800">
                <p className="font-bold mb-1">تنبيه:</p>
                <p>يجب أن تكون الوحدة الجديدة من نفس النموذج (نوع الوحدة) لتجنب اختلاف الأسعار.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">الوحدة الحالية</label>
                <div className="px-3 py-2 bg-gray-50 border rounded-lg text-sm text-gray-600">
                  {booking.unit?.unit_number} ({booking.unit?.unit_type?.name})
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">اختر الوحدة الجديدة المتاحة</label>
                {loading ? (
                  <div className="flex items-center justify-center py-4 text-blue-600">
                    <Loader2 className="animate-spin" size={24} />
                  </div>
                ) : availableUnits.length > 0 ? (
                  <div className="space-y-3">
                    <select
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                        value={selectedNewUnitId}
                        onChange={(e) => setSelectedNewUnitId(e.target.value)}
                    >
                        <option value="">-- اختر الوحدة --</option>
                        {availableUnits.map((u) => (
                        <option key={u.id} value={u.id}>
                            رقم {u.unit_number} {u.floor ? `- الدور ${u.floor}` : ''} ({u.unit_type_name}) {u.is_same_type ? '★' : ''}
                        </option>
                        ))}
                    </select>
                    
                    {selectedNewUnitId && !availableUnits.find(u => u.id === selectedNewUnitId)?.is_same_type && (
                        <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-xs text-red-800 animate-in fade-in slide-in-from-top-1">
                            <p className="font-bold mb-1 flex items-center gap-1">
                                <AlertCircle size={14} />
                                تنبيه هام:
                            </p>
                            <p>الوحدة المختارة من نموذج مختلف. هذا قد يؤدي إلى اختلاف في أسعار الإيرادات والفواتير. يرجى مراجعة الأسعار يدوياً بعد التغيير.</p>
                        </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-xs text-red-600 bg-red-50 rounded-lg border border-red-100">
                    لا توجد وحدات متاحة حالياً
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChangeUnit(false)}
                  className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-xs sm:text-sm"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  onClick={handleChangeUnitSubmit}
                  disabled={isChangingUnit || !selectedNewUnitId}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-xs sm:text-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {isChangingUnit ? <Loader2 className="animate-spin" size={16} /> : null}
                  تأكيد التغيير
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

          {isAdmin && ['confirmed', 'pending_deposit', 'checked_in'].includes(booking.status) && (
            <button 
              onClick={() => setShowCancelModal(true)}
              disabled={loading}
              id="bd-btn-cancel-booking"
              title="إلغاء الحجز: يقوم بأرشفة/عكس الآثار المحاسبية حسب الحالة (للأدمن فقط)"
              className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white rounded-2xl md:rounded-xl hover:bg-red-700 transition-colors text-[11px] md:text-sm font-extrabold shadow-sm disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Ban size={18} />}
              <span className="hidden md:inline">إلغاء الحجز</span>
              <span className="md:hidden">إلغاء</span>
            </button>
          )}

          {isAdmin && booking.status === 'cancelled' && (
            <button
              onClick={handleDeleteCancelledBooking}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-800 text-white rounded-2xl md:rounded-lg hover:bg-red-900 transition-colors text-[11px] md:text-sm font-bold shadow-sm disabled:opacity-50"
              title="حذف نهائي للحجز الملغي"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
              <span>حذف نهائي</span>
            </button>
          )}

          {booking.status === 'confirmed' && (
            <>
              <button 
                onClick={handleCheckIn}
                disabled={loading}
                id="bd-btn-checkin"
                className="relative flex items-center gap-1.5 px-3 py-2 bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white rounded-2xl md:rounded-xl hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800 transition-all text-[11px] md:text-sm font-extrabold shadow-sm disabled:opacity-50"
                title="بعد توقيع محضر الاستلام: اضغط هنا لتسجيل الدخول. هذا يصدر الفاتورة ويرحل القيود لضبط الحسابات"
              >
<LogIn size={18} />
                <span className="hidden md:inline">تم توقيع الاستلام</span>
                <span className="md:hidden">دخول</span>
                {lateCheckInDays > 0 && (
                  <div className="pointer-events-none absolute -top-10 right-0 flex flex-col items-end animate-pulse">
                    <div className="bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded-xl shadow-lg whitespace-nowrap">
                      تأخر تسجيل الدخول {lateCheckInDays} يوم
                    </div>
                    <div className="mr-3 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-red-600" />
                  </div>
                )}
              </button>
            </>
          )}

          {booking.status === 'checked_in' && (
            <>
              <button 
                onClick={handleCheckOut}
                disabled={loading}
                id="bd-btn-checkout"
                className="relative flex items-center gap-1.5 px-3 py-2 bg-amber-600 text-white rounded-2xl md:rounded-xl hover:bg-amber-700 transition-colors text-[11px] md:text-sm font-extrabold shadow-sm disabled:opacity-50"
                title="تسجيل خروج: يعتمد لإخلاء الوحدة ويطلق إجراءات ما بعد الخروج مثل أحداث التنظيف والحسابات"
              >
                <LogOut size={18} />
                <span className="hidden md:inline">تسجيل خروج</span>
                <span className="md:hidden">خروج</span>
                {lateCheckOutDays > 0 && (
                  <div className="pointer-events-none absolute -top-10 right-0 flex flex-col items-end animate-pulse">
                    <div className="bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded-xl shadow-lg whitespace-nowrap">
                      تأخر تسجيل الخروج {lateCheckOutDays} يوم
                    </div>
                    <div className="mr-3 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-red-600" />
                  </div>
                )}
              </button>
            </>
          )}

          {isAdmin && booking.status === 'checked_out' && (
            <button
              onClick={handleUndoCheckOut}
              disabled={loading}
              id="bd-btn-undo-checkout"
              title="تراجع عن تسجيل الخروج: يعيد الحجز إلى حالة مقيم ويعيد حالة الوحدة إلى مشغولة"
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 text-white rounded-2xl md:rounded-xl hover:bg-slate-800 transition-colors text-[11px] md:text-sm font-extrabold shadow-sm disabled:opacity-50"
            >
              <RefreshCw size={18} />
              <span className="hidden md:inline">تراجع عن تسجيل الخروج</span>
              <span className="md:hidden">تراجع</span>
            </button>
          )}

          {invoices.length > 0 ? (
             <>
               {canAccounting && invoices.some(inv => inv.status === 'draft') && (
                 <button 
                   onClick={() => handlePostInvoice(invoices.find(inv => inv.status === 'draft'))}
                   disabled={isIssuing}
                 className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white rounded-2xl md:rounded-xl hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800 transition-all text-[11px] md:text-sm font-extrabold shadow-sm disabled:opacity-50"
                   title={booking.status === 'checked_in' ? 'ترحيل الفاتورة كمديونية على العميل' : 'ترحيل الفاتورة'}
                 >
                   {isIssuing ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
                  <span className="hidden md:inline">{booking.status === 'checked_in' ? 'ترحيل الفاتورة (مديونية)' : 'ترحيل الفاتورة'}</span>
                  <span className="md:hidden">ترحيل</span>
                 </button>
               )}
               {invoices.some(inv => inv.status === 'posted') && (
                 <button 
                   onClick={() => {
                     const firstPosted = invoices.find(inv => inv.status === 'posted');
                     if (firstPosted) {
                       setSelectedInvoiceId(firstPosted.id);
                       setAmount(getInvoiceRemaining(firstPosted.id).toString());
                       setShowPaymentModal(true);
                     }
                   }}
                   disabled={loading}
                 className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white rounded-2xl md:rounded-xl hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800 transition-all text-[11px] md:text-sm font-extrabold shadow-sm disabled:opacity-50"
                 >
                   <CreditCard size={18} />
                  <span className="hidden md:inline">سداد الفاتورة</span>
                  <span className="md:hidden">سداد</span>
                 </button>
               )}
               {canAccounting && invoices.some(inv => ['posted', 'paid'].includes(inv.status)) && (
                 <button 
                   onClick={handleIssueInvoice}
                   disabled={isIssuing}
                 className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 text-white rounded-2xl md:rounded-xl hover:bg-amber-700 transition-colors text-[11px] md:text-sm font-extrabold shadow-sm disabled:opacity-50"
                   title="استخدام هذا الزر فقط في حال عدم ظهور المديونية في سجل الحركات المالية بالأسفل"
                 >
                   {isIssuing ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                  <span className="hidden md:inline">إصلاح المديونية (Force Post)</span>
                  <span className="md:hidden">تصحيح</span>
                 </button>
               )}
             </>
          ) : (
            <>
              {canAccounting && (
                <button 
                  onClick={handleIssueInvoice}
                  disabled={isIssuing}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white rounded-2xl md:rounded-xl hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800 transition-all text-[11px] md:text-sm font-extrabold shadow-sm disabled:opacity-50"
                  title={booking.status === 'checked_in' ? 'إصدار وترحيل الفاتورة كمديونية' : 'إصدار الفاتورة'}
                >
                  {isIssuing ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
                  <span className="hidden md:inline">{booking.status === 'checked_in' ? 'ترحيل مديونية (إصدار فاتورة)' : 'إصدار فاتورة'}</span>
                  <span className="md:hidden">{booking.status === 'checked_in' ? 'ترحيل' : 'فاتورة'}</span>
                </button>
              )}
            </>
          )}

          <button 
            onClick={() => {
                setSelectedInvoiceId(null);
                setAmount(remainingAmount.toString());
                setShowPaymentModal(true);
            }}
            id="bd-btn-record-payment"
            title="تسجيل دفعة: يسجل سند قبض ويربطه بالحجز/الفاتورة. قد يحول الحجز من بانتظار العربون إلى مؤكد"
            className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-emerald-50 via-white to-white ring-1 ring-emerald-200/70 rounded-2xl md:rounded-xl hover:from-emerald-100 transition-all text-emerald-950 font-extrabold text-[11px] md:text-sm shadow-sm"
          >
            <CreditCard size={18} />
            <span className="hidden md:inline">تسجيل دفعة</span>
            <span className="md:hidden">سداد</span>
          </button>
          <button 
            onClick={() => setShowInsuranceVoucher(true)}
            id="bd-btn-insurance"
            className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-emerald-50 via-white to-white ring-1 ring-emerald-200/70 rounded-2xl md:rounded-xl hover:from-emerald-100 transition-all text-emerald-950 font-extrabold text-[11px] md:text-sm shadow-sm"
            title="سند التأمين (منفصل عن الفواتير)"
          >
            <Banknote size={18} />
            <span className="hidden md:inline">سند التأمين</span>
            <span className="md:hidden">تأمين</span>
          </button>

          <div id="bd-print-menu" className="relative">
            <button
              type="button"
              id="bd-btn-print-contract"
              onClick={(e) => {
                const nextOpen = !printMenuOpen;
                if (nextOpen && typeof window !== 'undefined') {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const menuW = 260;
                  const pad = 12;
                  const left = Math.min(Math.max(pad, r.left), window.innerWidth - menuW - pad);
                  const top = Math.min(r.bottom + 8, window.innerHeight - 260 - pad);
                  setPrintMenuPos({ top: Math.max(pad, top), left });
                }
                if (!nextOpen) setPrintMenuPos(null);
                setPrintMenuOpen(nextOpen);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-emerald-50 via-white to-white ring-1 ring-emerald-200/70 rounded-2xl md:rounded-xl hover:from-emerald-100 transition-all text-emerald-950 font-extrabold text-[11px] md:text-sm shadow-sm"
            >
              <Printer size={18} />
              <span>طباعة</span>
              <ChevronDown size={16} className={`transition-transform ${printMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {printMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-50 md:hidden"
                  onClick={() => {
                    setPrintMenuOpen(false);
                    setPrintMenuPos(null);
                  }}
                />
                <div
                  className="fixed z-50 md:hidden w-[260px] max-w-[calc(100vw-24px)] rounded-3xl border border-gray-200 bg-white/95 backdrop-blur-sm shadow-2xl overflow-hidden"
                  style={{ top: printMenuPos?.top ?? 80, left: printMenuPos?.left ?? 12 }}
                >
                  <button
                    type="button"
                    className="w-full text-right px-4 py-3 text-sm font-black text-gray-900 hover:bg-gray-50 active:bg-gray-100"
                    onClick={() => openPrintPreview('طباعة العقد', `/print/contract/${booking.id}?embed=1`)}
                  >
                    طباعة العقد
                  </button>
                  <button
                    type="button"
                    className="w-full text-right px-4 py-3 text-sm font-black text-gray-900 hover:bg-gray-50 active:bg-gray-100 border-t"
                    onClick={() => openPrintPreview(invoices.length > 0 ? 'طباعة الفاتورة الأساسية' : 'معاينة الفاتورة', `${invoices.length > 0 ? `/print/invoice/${invoices[0].id}` : `/print/invoice/${booking.id}`}?embed=1`)}
                  >
                    {invoices.length > 0 ? 'طباعة الفاتورة الأساسية' : 'معاينة الفاتورة'}
                  </button>
                  <button
                    type="button"
                    className="w-full text-right px-4 py-3 text-sm font-black text-gray-900 hover:bg-gray-50 active:bg-gray-100 border-t"
                    onClick={() => openPrintPreview('محضر استلام', `/print/handover/${booking.id}?embed=1`)}
                  >
                    محضر استلام
                  </button>
                  <button
                    type="button"
                    className="w-full text-right px-4 py-3 text-sm font-black text-gray-900 hover:bg-gray-50 active:bg-gray-100 border-t"
                    onClick={() => openPrintPreview('محضر تسليم', `/print/return/${booking.id}?embed=1`)}
                  >
                    محضر تسليم
                  </button>
                </div>
                <div className="absolute z-50 mt-2 w-56 right-0 rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden hidden md:block">
                  <button
                    type="button"
                    className="w-full text-right px-4 py-3 text-sm font-bold text-gray-900 hover:bg-gray-50"
                    onClick={() => openPrintPreview('طباعة العقد', `/print/contract/${booking.id}?embed=1`)}
                  >
                    طباعة العقد
                  </button>
                  <button
                    type="button"
                    className="w-full text-right px-4 py-3 text-sm font-bold text-gray-900 hover:bg-gray-50 border-t"
                    onClick={() => openPrintPreview(invoices.length > 0 ? 'طباعة الفاتورة الأساسية' : 'معاينة الفاتورة', `${invoices.length > 0 ? `/print/invoice/${invoices[0].id}` : `/print/invoice/${booking.id}`}?embed=1`)}
                  >
                    {invoices.length > 0 ? 'طباعة الفاتورة الأساسية' : 'معاينة الفاتورة'}
                  </button>
                  <button
                    type="button"
                    className="w-full text-right px-4 py-3 text-sm font-bold text-gray-900 hover:bg-gray-50 border-t"
                    onClick={() => openPrintPreview('محضر استلام', `/print/handover/${booking.id}?embed=1`)}
                  >
                    محضر استلام
                  </button>
                  <button
                    type="button"
                    className="w-full text-right px-4 py-3 text-sm font-bold text-gray-900 hover:bg-gray-50 border-t"
                    onClick={() => openPrintPreview('محضر تسليم', `/print/return/${booking.id}?embed=1`)}
                  >
                    محضر تسليم
                  </button>
                </div>
              </>
            )}
          </div>
          </div>
        </div>

        {/* Urgent Alerts Section */}
        {(() => {
          const today = new Date();
          const checkOut = new Date(booking.check_out);
          const daysToCheckout = differenceInDays(checkOut, today);
          const isLongTerm = ['monthly', 'yearly'].includes(booking.booking_type) || booking.nights >= 28;
          
          // Calculate Installment Alerts
          const checkIn = new Date(booking.check_in);
          const monthsCount = Math.max(1, Math.round(booking.nights / 30));
          const platformFee = (() => {
            const extras = Array.isArray(booking.additional_services) ? booking.additional_services : [];
            const fromExtras = extras.reduce((sum: number, ex: any) => {
              const name = String(ex?.name ?? ex?.title ?? ex?.label ?? '').trim();
              const lower = name.toLowerCase();
              const hasPlatform = name.includes('منصة') || lower.includes('platform');
              const hasEjar = name.includes('إيجار') || name.includes('ايجار') || name.includes('اجار') || lower.includes('ejar');
              const hasFee = name.includes('رسوم') || name.includes('عمولة') || lower.includes('fee') || lower.includes('commission');
              if (!(hasPlatform && (hasEjar || hasFee))) return sum;
              return sum + (Number(ex?.amount) || 0);
            }, 0);
            if (fromExtras > 0) return fromExtras;
            const invExtrasMax = (invoices || []).reduce((m: number, inv: any) => Math.max(m, Number(inv?.additional_services_amount) || 0), 0);
            if (String(booking.booking_source || '') === 'platform' && invExtrasMax >= 250) return 250;
            return 0;
          })();
          const netTotalForInstallments = Math.max(0, totalAmount - platformFee);
          const paidForInstallments = Math.max(0, paidAmount - platformFee);
          const instAmount = netTotalForInstallments / monthsCount;
          let currentPaidForAlerts = paidForInstallments;
          let nextDueAlert = null;

          for (let i = 0; i < monthsCount; i++) {
            const dueDate = addMonths(checkIn, i);
            const amountPaidForThis = Math.min(instAmount, Math.max(0, currentPaidForAlerts));
            currentPaidForAlerts -= instAmount;
            
            if (amountPaidForThis < instAmount) {
              const daysToDue = differenceInDays(dueDate, today);
              if (isSameDay(dueDate, today)) {
                nextDueAlert = { type: 'today', date: dueDate, amount: instAmount - amountPaidForThis, num: i + 1 };
                break;
              } else if (daysToDue > 0 && daysToDue <= 5) {
                nextDueAlert = { type: 'soon', date: dueDate, amount: instAmount - amountPaidForThis, num: i + 1, days: daysToDue };
                break;
              } else if (daysToDue < 0) {
                nextDueAlert = { type: 'overdue', date: dueDate, amount: instAmount - amountPaidForThis, num: i + 1 };
                break;
              }
            }
          }

          const showCheckoutAlert = isLongTerm && daysToCheckout >= 0 && daysToCheckout <= 5;

          if (!showCheckoutAlert && !nextDueAlert) return null;

          return (
            <div className="mt-4 space-y-2">
              {showCheckoutAlert && (
                <div className={`flex items-center gap-3 p-3 rounded-xl border animate-pulse ${daysToCheckout === 0 ? 'bg-red-600 text-white border-red-700' : 'bg-amber-50 text-amber-900 border-amber-200'}`}>
                  {daysToCheckout === 0 ? <AlertOctagon size={20} /> : <Timer size={20} />}
                  <div className="text-sm font-bold">
                    {daysToCheckout === 0 
                      ? 'تنبيه: اليوم هو موعد تسجيل الخروج للعميل!' 
                      : `تنبيه: متبقي ${daysToCheckout} أيام على موعد خروج العميل.`}
                  </div>
                </div>
              )}
              {nextDueAlert && (
                <div className={`flex items-center gap-3 p-3 rounded-xl border ${nextDueAlert.type === 'today' || nextDueAlert.type === 'overdue' ? 'bg-red-600 text-white border-red-700 shadow-lg scale-[1.02] transition-transform' : 'bg-blue-50 text-blue-900 border-blue-200'}`}>
                  {nextDueAlert.type === 'today' || nextDueAlert.type === 'overdue' ? <AlertCircle size={20} /> : <Bell size={20} />}
                  <div className="text-sm font-bold">
                    {nextDueAlert.type === 'today' 
                      ? `تنبيه عاجل: اليوم هو موعد استحقاق الدفعة رقم ${nextDueAlert.num} بمبلغ ${nextDueAlert.amount.toLocaleString()} ر.س`
                      : nextDueAlert.type === 'overdue'
                      ? `تنبيه: الدفعة رقم ${nextDueAlert.num} متأخرة! المبلغ المطلوب: ${nextDueAlert.amount.toLocaleString()} ر.س`
                      : `تذكير: متبقي ${nextDueAlert.days} أيام على استحقاق الدفعة رقم ${nextDueAlert.num} (${nextDueAlert.amount.toLocaleString()} ر.س)`}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

    {showInsuranceVoucher && (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/40" onClick={() => setShowInsuranceVoucher(false)} />
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Banknote className="text-emerald-600" size={18} />
                <span className="font-bold text-gray-900 text-sm">سند التأمين (منفصل)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowInsuranceVoucher(false)}
                className="px-2 py-1 text-xs rounded-lg border bg-white hover:bg-gray-50"
                title="إغلاق"
              >
                إغلاق
              </button>
            </div>
            <div className="p-4 space-y-3 text-right">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">نوع العملية</label>
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    value={voucherType}
                    onChange={(e) => setVoucherType(e.target.value as any)}
                  >
                    <option value="deposit_receipt">قبض تأمين</option>
                    <option value="deposit_refund">صرف تأمين</option>
                    <option value="deposit_to_damage_income">استخدام التأمين كتلفيات (عوائد 5110)</option>
                    <option value="deposit_to_expense_offset">استخدام التأمين لمقاصة مصروف صيانة (6110)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">التاريخ</label>
                  <input
                    type="date"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={voucherDate}
                    onChange={(e) => setVoucherDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">المبلغ</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={voucherAmount}
                    onChange={(e) => setVoucherAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                {(voucherType === 'deposit_receipt' || voucherType === 'deposit_refund') && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">طريقة الدفع (1100)</label>
                    <select
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                      value={voucherMethodId}
                      onChange={(e) => setVoucherMethodId(e.target.value)}
                    >
                      {paymentMethods.map((pm: any) => (
                        <option key={pm.id} value={pm.id}>{pm.name || pm.method_name || pm.id}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {(() => {
                const method = paymentMethods.find((pm: any) => pm.id === voucherMethodId);
                const methodName = method?.name || method?.method_name || 'الصندوق/البنوك';
                let debit = '';
                let credit = '';
                if (voucherType === 'deposit_receipt') {
                  debit = `1100 الصندوق/البنوك — ${methodName}`;
                  credit = `2100 تأمينات مستلمة من العملاء`;
                } else if (voucherType === 'deposit_refund') {
                  debit = `2100 تأمينات مستلمة من العملاء`;
                  credit = `1100 الصندوق/البنوك — ${methodName}`;
                } else if (voucherType === 'deposit_to_damage_income') {
                  debit = `2100 تأمينات مستلمة من العملاء`;
                  credit = `5110 عوائد تلفيات عملاء`;
                } else {
                  debit = `2100 تأمينات مستلمة من العملاء`;
                  credit = `6110 صيانة وإصلاحات`;
                }
                return (
                  <div className="text-[11px] text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-2 leading-5">
                    <div className="font-semibold">شرح الترحيل</div>
                    <div>من حساب: {debit}</div>
                    <div>إلى حساب: {credit}</div>
                    <div className="text-gray-500">{voucherPosting ? 'سيتم إنشاء قيد يومية منفصل' : 'توثيق فقط بدون ترحيل محاسبي'}</div>
                  </div>
                );
              })()}
              <div className="flex items-center gap-2">
                <input
                  id="voucherPosting"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={voucherPosting}
                  onChange={(e) => setVoucherPosting(e.target.checked)}
                />
                <label htmlFor="voucherPosting" className="text-xs text-gray-700">ترحيل محاسبي (إنشاء قيد منفصل)</label>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">البيان</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  rows={3}
                  value={voucherDescription}
                  onChange={(e) => setVoucherDescription(e.target.value)}
                  placeholder="مثال: تأمين مستلم/مردود، أو استخدام التأمين لتغطية تلفيات"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInsuranceVoucher(false)}
                  className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-xs sm:text-sm"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!voucherAmount || Number(voucherAmount) <= 0) {
                      alert('يرجى إدخال مبلغ صحيح');
                      return;
                    }
                    // determine accounts
                    let debit_account_code = '';
                    let credit_account_code = '';
                    if (voucherType === 'deposit_receipt') {
                      debit_account_code = '1100';
                      credit_account_code = '2100'; // تأمينات مستلمة من العملاء
                    } else if (voucherType === 'deposit_refund') {
                      debit_account_code = '2100';
                      credit_account_code = '1100';
                    } else if (voucherType === 'deposit_to_damage_income') {
                      debit_account_code = '2100';
                      credit_account_code = '5110';
                    } else { // deposit_to_expense_offset
                      debit_account_code = '2100';
                      credit_account_code = '6110';
                    }
                    try {
                      // optional storage table for audit
                      await supabase.from('insurance_vouchers').insert({
                        booking_id: booking.id,
                        customer_id: booking.customer_id,
                        unit_id: booking.unit_id,
                        hotel_id: booking.hotel_id || null,
                        voucher_type: voucherType,
                        amount: Number(voucherAmount),
                        voucher_date: voucherDate,
                        payment_method_id: (voucherType === 'deposit_receipt' || voucherType === 'deposit_refund') ? voucherMethodId : null,
                        description: voucherDescription || null,
                        debit_account_code,
                        credit_account_code,
                        is_posting: voucherPosting
                      });
                    } catch (e) {
                      // ignore if table not found, continue with event log
                    }
                    try {
                      const readable = {
                        deposit_receipt: 'قبض تأمين',
                        deposit_refund: 'صرف تأمين',
                        deposit_to_damage_income: 'استخدام التأمين كتلفيات (5110)',
                        deposit_to_expense_offset: 'استخدام التأمين لمقاصة صيانة (6110)'
                      } as any;
                      await supabase.from('system_events').insert({
                        event_type: 'insurance_voucher',
                        booking_id: booking.id,
                        customer_id: booking.customer_id,
                        unit_id: booking.unit_id,
                        hotel_id: booking.hotel_id || null,
                        message: `${readable[voucherType]} بمبلغ ${Number(voucherAmount).toLocaleString()} ر.س`,
                        payload: {
                          amount: Number(voucherAmount),
                          voucher_type: voucherType,
                          payment_method_id: (voucherType === 'deposit_receipt' || voucherType === 'deposit_refund') ? voucherMethodId : null,
                          description: voucherDescription,
                          voucher_date: voucherDate,
                          debit_account_code,
                          credit_account_code,
                          is_posting: voucherPosting
                        }
                      });
                      await loadInsuranceEvents();
                      setShowInsuranceVoucher(false);
                      setVoucherType('deposit_receipt');
                      setVoucherAmount('');
                      setVoucherMethodId(paymentMethods[0]?.id || '');
                      setVoucherDescription('');
                      setVoucherDate(new Date().toISOString().split('T')[0]);
                      setVoucherPosting(true);
                      alert('تم حفظ سند التأمين (منفصل) بنجاح');
                    } catch (e: any) {
                      alert('تعذر حفظ السند: ' + (e.message || 'خطأ غير معروف'));
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs sm:text-sm"
                >
                  حفظ السند
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

    

    {showCancelModal && (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/40" onClick={() => setShowCancelModal(false)} />
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-red-200 overflow-hidden">
            <div className="px-4 py-3 border-b bg-red-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="text-red-600" size={18} />
                <span className="font-bold text-red-700 text-sm">تنبيه خطير</span>
              </div>
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-2 py-1 text-xs rounded-lg border bg-white hover:bg-gray-50"
                title="إغلاق"
              >
                إغلاق
              </button>
            </div>
            <div className="p-4 space-y-3 text-right">
              <p className="text-sm text-gray-800 font-semibold">هل أنت متأكد من إلغاء الحجز؟</p>
              <div className="text-xs text-gray-700 space-y-1">
                <p>سيؤثر الإلغاء على العناصر التالية:</p>
                <ul className="list-disc pr-5 space-y-1">
                  <li>تغيير حالة الحجز إلى “ملغي”.</li>
                  <li>أرشفة القيود المحاسبية المرتبطة بالحجز.</li>
                  <li>أرشفة/إلغاء الفواتير المرتبطة بالحجز إن وُجدت.</li>
                  <li>تحديث حالة الوحدة وإتاحتها للحجز الجديد حسب السياسة.</li>
                </ul>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-xs sm:text-sm"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  onClick={handleCancelBooking}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-xs sm:text-sm disabled:opacity-50"
                >
                  {loading ? 'جارٍ الإلغاء…' : 'تأكيد الإلغاء'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
    {showEarlyCheckoutModal && (
      <div className="fixed inset-0 z-[85] flex items-center justify-center p-3" dir="rtl">
        <div className="absolute inset-0 bg-black/40" onClick={() => (!earlyBusy ? setShowEarlyCheckoutModal(false) : null)} />
        <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b bg-white flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-black text-gray-900 text-sm truncate">خروج مبكر</div>
              <div className="text-[11px] text-gray-600 truncate">
                {booking.unit?.unit_number ? `الوحدة: ${booking.unit.unit_number}` : ''} {booking.customer?.full_name ? `• ${booking.customer.full_name}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowEarlyCheckoutModal(false)}
              disabled={earlyBusy}
              className="p-2 rounded-2xl hover:bg-gray-100 text-gray-700 disabled:opacity-50"
              title="إغلاق"
            >
              <X size={18} />
            </button>
          </div>
          <div className="p-4 bg-gray-50 space-y-3">
            <div className="bg-white border border-gray-200 rounded-2xl p-3 text-[11px] text-gray-800">
              <div className="font-black text-gray-900 mb-1">تعليمات صارمة</div>
              <div className="space-y-1 leading-6">
                <div>1) يتم منع التنفيذ إذا كان المدفوع أعلى من المبلغ الجديد (يجب تعديل السندات أولاً).</div>
                <div>2) إذا كان الخروج داخل فترة تمديد (فاتورة تمديد) يلزم تعديل/إلغاء فاتورة التمديد أولاً.</div>
                <div>3) يتم تسجيل حدث بالنظام لتوثيق العملية.</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white border border-gray-200 rounded-2xl p-3">
                <div className="text-[11px] font-black text-gray-700 mb-1">تاريخ المغادرة (خروج)</div>
                <input
                  type="date"
                  value={earlyExitDate}
                  min={String(booking.check_in || '').split('T')[0]}
                  max={maxEarlyExitDate}
                  onChange={(e) => setEarlyExitDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-900 font-bold text-sm"
                  disabled={earlyBusy}
                />
                <div className="mt-1 text-[10px] text-gray-500">أقصى تاريخ: {maxEarlyExitDate}</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl p-3">
                <div className="text-[11px] font-black text-gray-700 mb-1">طريقة الاحتساب</div>
                <select
                  value={earlyPricingMode}
                  onChange={(e) => setEarlyPricingMode(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-900 font-bold text-sm"
                  disabled={earlyBusy}
                >
                  <option value="monthly">اقتطاع شهري (قاعدة 4 أيام = شهر)</option>
                  <option value="daily">اقتطاع يومي</option>
                  <option value="full">اعتماد الحجز كاملاً</option>
                </select>
                <div className="mt-1 text-[10px] text-gray-500">اختر ما يناسب السياسة قبل التنفيذ.</div>
              </div>
            </div>

            {earlyError && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-[11px] text-red-800 font-bold whitespace-pre-line">
                {earlyError}
              </div>
            )}

            {earlyResult && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-[11px] text-emerald-900 font-bold">
                تمت العملية بنجاح
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowEarlyCheckoutModal(false)}
                disabled={earlyBusy}
                className="px-4 py-2 rounded-2xl bg-white border border-gray-200 text-gray-800 font-black text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleEarlyCheckout}
                disabled={earlyBusy}
                className="px-4 py-2 rounded-2xl bg-gray-900 text-white font-black text-sm hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
              >
                {earlyBusy ? <Loader2 className="animate-spin" size={16} /> : null}
                تنفيذ
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {showTerminateContractModal && (
      <div className="fixed inset-0 z-[86] flex items-center justify-center p-3" dir="rtl">
        <div className="absolute inset-0 bg-black/40" onClick={() => (!terminateBusy ? setShowTerminateContractModal(false) : null)} />
        <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b bg-white flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-black text-gray-900 text-sm truncate">فسخ العقد</div>
              <div className="text-[11px] text-gray-600 truncate">
                {booking.unit?.unit_number ? `الوحدة: ${booking.unit.unit_number}` : ''} {booking.customer?.full_name ? `• ${booking.customer.full_name}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowTerminateContractModal(false)}
              disabled={terminateBusy}
              className="p-2 rounded-2xl hover:bg-gray-100 text-gray-700 disabled:opacity-50"
              title="إغلاق"
            >
              <X size={18} />
            </button>
          </div>
          <div className="p-4 bg-gray-50 space-y-3">
            <div className="bg-white border border-gray-200 rounded-2xl p-3 text-[11px] text-gray-800">
              <div className="font-black text-gray-900 mb-1">سياسة العملية</div>
              <div className="space-y-1 leading-6">
                <div>1) لا يتم تعديل أي مبالغ مدفوعة (السندات تبقى كما هي).</div>
                <div>2) يتم تحديث تاريخ المغادرة + الفاتورة الأساسية + تاريخ الفاتورة وقيودها.</div>
                <div>3) يتم تسجيل حدث "فسخ العقد" ليظهر في الطباعة.</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white border border-gray-200 rounded-2xl p-3">
                <div className="text-[11px] font-black text-gray-700 mb-1">تاريخ المغادرة الجديد</div>
                <input
                  type="date"
                  value={terminateExitDate}
                  min={String(booking.check_in || '').split('T')[0]}
                  max={maxEarlyExitDate}
                  onChange={(e) => setTerminateExitDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-900 font-bold text-sm"
                  disabled={terminateBusy}
                />
                <div className="mt-1 text-[10px] text-gray-500">أقصى تاريخ: {maxEarlyExitDate}</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl p-3">
                <div className="text-[11px] font-black text-gray-700 mb-1">تاريخ الفاتورة والقيود</div>
                <input
                  type="date"
                  value={terminateDocDate}
                  onChange={(e) => setTerminateDocDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-900 font-bold text-sm"
                  disabled={terminateBusy}
                />
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-3">
              <div className="text-[11px] font-black text-gray-700 mb-1">إجمالي الفاتورة الأساسية (بعد الفسخ)</div>
              <input
                type="number"
                inputMode="decimal"
                value={terminateInvoiceTotal}
                onChange={(e) => setTerminateInvoiceTotal(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-900 font-bold text-sm"
                disabled={terminateBusy}
                min={0}
              />
            </div>

            {terminateError && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-[11px] text-red-800 font-bold whitespace-pre-line">
                {terminateError}
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowTerminateContractModal(false)}
                disabled={terminateBusy}
                className="px-4 py-2 rounded-2xl bg-white border border-gray-200 text-gray-800 font-black text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleTerminateContract}
                disabled={terminateBusy}
                className="px-4 py-2 rounded-2xl bg-red-600 text-white font-black text-sm hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {terminateBusy ? <Loader2 className="animate-spin" size={16} /> : null}
                تنفيذ الفسخ
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="lg:col-span-2 space-y-4 lg:space-y-6">
          <div className="sm:hidden grid grid-cols-2 gap-2 px-[5px]">
            <div className="rounded-2xl ring-1 ring-emerald-100/70 bg-gradient-to-br from-emerald-50 via-white to-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-black text-emerald-950">بيانات الحجز</div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  booking.status === 'confirmed' ? 'bg-green-100 text-green-900' :
                  booking.status === 'pending_deposit' ? 'bg-yellow-100 text-yellow-900' :
                  booking.status === 'checked_in' ? 'bg-blue-100 text-blue-900' :
                  booking.status === 'cancelled' ? 'bg-red-100 text-red-900' :
                  'bg-gray-100 text-gray-900'
                }`}>
                  {booking.status === 'pending_deposit' ? 'بانتظار العربون' :
                   booking.status === 'confirmed' ? 'مؤكد' :
                   booking.status === 'checked_in' ? 'تم الدخول' :
                   booking.status === 'checked_out' ? 'تم الخروج' : 
                   booking.status === 'cancelled' ? 'ملغي' : booking.status}
                </span>
              </div>
              <div className="mt-2 space-y-2 text-[10px]">
                <div>
                  <div className="text-gray-500 font-bold">العميل</div>
                  <div className="text-gray-900 font-black truncate">{booking.customer?.full_name || '-'}</div>
                  <div className="text-gray-600 font-mono truncate" dir="ltr">{booking.customer?.phone || '-'}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/70 ring-1 ring-emerald-100/70 rounded-xl p-2">
                    <div className="text-gray-500 font-bold">الوحدة</div>
                    <div className="text-gray-900 font-black truncate">{booking.unit?.unit_number || '-'}</div>
                  </div>
                  <div className="bg-white/70 ring-1 ring-emerald-100/70 rounded-xl p-2">
                    <div className="text-gray-500 font-bold">النوع</div>
                    <div className="text-gray-900 font-black truncate">{booking.unit?.unit_type?.name || '-'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/70 ring-1 ring-emerald-100/70 rounded-xl p-2">
                    <div className="text-gray-500 font-bold">الوصول</div>
                    <div className="text-gray-900 font-black font-mono">{format(new Date(booking.check_in), 'dd/MM/yy')}</div>
                  </div>
                  <div className="bg-white/70 ring-1 ring-emerald-100/70 rounded-xl p-2">
                    <div className="text-gray-500 font-bold">المغادرة</div>
                    <div className="text-gray-900 font-black font-mono">
                      {(() => {
                        const outISO = String(booking.check_out || '').split('T')[0];
                        if (!outISO) return '-';
                        const outDate = new Date(`${outISO}T00:00:00`);
                        return format(outDate, 'dd/MM/yy');
                      })()}
                    </div>
                  </div>
                </div>
                {booking.status === 'checked_in' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const today = new Date().toISOString().split('T')[0];
                        setEarlyExitDate(today > maxEarlyExitDate ? maxEarlyExitDate : today);
                        setEarlyPricingMode('monthly');
                        setEarlyError('');
                        setShowEarlyCheckoutModal(true);
                      }}
                      className="w-full mt-2 px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-50 via-white to-white ring-1 ring-emerald-200/70 text-emerald-950 font-extrabold text-[11px] hover:from-emerald-100 transition-all"
                    >
                      خروج مبكر
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          const today = new Date().toISOString().split('T')[0];
                          const initialExit = today > maxEarlyExitDate ? maxEarlyExitDate : today;
                          setTerminateExitDate(initialExit);
                          setTerminateDocDate(today);
                          setTerminateInvoiceTotal(String(booking.total_price || 0));
                          setTerminateError('');
                          setShowTerminateContractModal(true);
                        }}
                        className="w-full mt-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-800 font-extrabold text-[11px] hover:bg-red-100"
                      >
                        فسخ العقد
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="rounded-2xl bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 shadow-sm ring-1 ring-emerald-900/20 p-3 text-white">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-extrabold">الملخص المالي</div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      const hasActiveExtension = (invoices || []).some((inv: any) => inv?.status !== 'void' && isExtensionInvoice(inv));
                      if (hasActiveExtension) {
                        alert('لا يمكن تعديل الحجز بالكامل طالما يوجد تمديد. يرجى إلغاء/حذف فواتير التمديد أولاً.');
                        return;
                      }
                      const baseInv = (invoices || []).find((inv: any) => inv?.status !== 'void' && !isExtensionInvoice(inv));
                      const ci = String(booking.check_in || '').split('T')[0] || '';
                      const co = String(booking.check_out || '').split('T')[0] || '';
                      setNewCheckIn(ci);
                      setNewCheckOut(co);
                      const start = ci ? new Date(`${ci}T00:00:00`) : null;
                      const end = co ? new Date(`${co}T00:00:00`) : null;
                      const days = start && end ? differenceInDays(end, start) : 0;
                      const months = Math.max(1, Math.round(days / 30));
                      const invSub = Number(baseInv?.subtotal || booking.total_price || 0);
                      setMonthlyRateEdit(months > 0 ? (invSub / months).toFixed(2) : String(invSub));
                      setNewSubtotal(String(Number(baseInv?.subtotal || 0)));
                      setNewDiscountAmount(String(Number(baseInv?.discount_amount || 0)));
                      setNewExtrasAmount(String(Number(baseInv?.additional_services_amount || 0)));
                      const net = Math.max(0, Number(baseInv?.subtotal || 0) - Number(baseInv?.discount_amount || 0) + Number(baseInv?.additional_services_amount || 0));
                      const initialInclude = Number(baseInv?.tax_amount || 0) > 0;
                      const tax = initialInclude ? Math.round(net * hotelTaxRate * 100) / 100 : 0;
                      setIncludeTax(initialInclude);
                      setNewTaxAmount(String(tax.toFixed(2)));
                      setNewTotalPrice(String((net + tax).toFixed(2)));
                      setShowEditPrice(true);
                    }}
                    className="p-1.5 rounded-xl ring-1 ring-white/20 bg-white/10 hover:bg-white/15 text-white transition-colors"
                    title="تعديل المبالغ"
                  >
                    <Edit size={14} />
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {canAdminEditDates && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setNewCheckIn(booking.check_in?.split('T')[0]); setNewCheckOut(booking.check_out?.split('T')[0]); setShowReschedule(true); }}
                      className="px-2 py-1 rounded-xl ring-1 ring-white/20 bg-white/10 hover:bg-white/15 text-[10px] font-extrabold text-white transition-colors"
                    >
                      تعديل
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDelay(true)}
                      className="px-2 py-1 rounded-xl ring-1 ring-white/20 bg-white/10 hover:bg-white/15 text-[10px] font-extrabold text-white transition-colors"
                    >
                      تأخير
                    </button>
                  </>
                )}
                {isAdmin && ['confirmed', 'checked_in', 'pending_deposit'].includes(booking.status) && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowChangeUnit(true);
                      handleFetchAvailableUnits();
                    }}
                    className="px-2 py-1 rounded-xl ring-1 ring-white/20 bg-white/10 hover:bg-white/15 text-[10px] font-extrabold text-white transition-colors"
                    title="تغيير الوحدة"
                  >
                    تغيير وحدة
                  </button>
                )}
              </div>
              <div className="mt-2 space-y-2 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-white/85 font-bold">الإجمالي</span>
                  <span className="text-white font-extrabold font-mono">{totalAmount.toLocaleString('en-US')} <span className="text-[9px]">ر.س</span></span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-emerald-50 font-bold">المدفوع</span>
                  <span className="text-emerald-50 font-extrabold font-mono">{paidAmount.toLocaleString('en-US')} <span className="text-[9px]">ر.س</span></span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-white/15">
                  <span className="text-rose-100 font-extrabold">المتبقي</span>
                  <span className="text-rose-100 font-extrabold font-mono">{remainingAmount.toLocaleString('en-US')} <span className="text-[9px]">ر.س</span></span>
                </div>
              </div>
              {remainingAmount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const selectableInvoices = (invoices || []).filter((inv: any) => inv && inv.id && inv.status !== 'void');
                    if (selectableInvoices.length === 0) {
                      alert('لا توجد فواتير لهذا الحجز لربط الدفعة بها');
                      return;
                    }
                    setPaymentRequireInvoice(true);
                    setSelectedInvoiceId(selectableInvoices.length === 1 ? selectableInvoices[0].id : null);
                    setAmount(remainingAmount.toString());
                    setShowPaymentModal(true);
                  }}
                  className="w-full mt-3 bg-white/10 hover:bg-white/15 text-white py-2 rounded-2xl font-extrabold shadow-sm transition-colors flex items-center justify-center gap-2 text-[11px] ring-1 ring-white/20"
                >
                  <CreditCard size={16} />
                  سداد
                </button>
              )}
            </div>
          </div>

          <div className="hidden sm:block rounded-2xl ring-1 ring-emerald-100/70 bg-gradient-to-br from-emerald-50 via-white to-white p-4 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4 sm:mb-6">
              <h2 className="text-base sm:text-lg font-extrabold text-emerald-950 flex items-center gap-2">
                <Calendar className="text-emerald-700" size={20} />
                بيانات الحجز
              </h2>
              <div className="flex items-center gap-2">
              <span className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold ${
                booking.status === 'confirmed' ? 'bg-green-100 text-green-900' :
                booking.status === 'pending_deposit' ? 'bg-yellow-100 text-yellow-900' :
                booking.status === 'checked_in' ? 'bg-blue-100 text-blue-900' :
                booking.status === 'cancelled' ? 'bg-red-100 text-red-900' :
                'bg-gray-100 text-gray-900'
              }`}>
                {booking.status === 'pending_deposit' ? 'بانتظار العربون' :
                 booking.status === 'confirmed' ? 'مؤكد' :
                 booking.status === 'checked_in' ? 'تم الدخول' :
                 booking.status === 'checked_out' ? 'تم الخروج' : 
                 booking.status === 'cancelled' ? 'ملغي' : booking.status}
              </span>
              {canAdminEditDates && (
                <>
                  <button
                    onClick={() => { setNewCheckIn(booking.check_in?.split('T')[0]); setNewCheckOut(booking.check_out?.split('T')[0]); setShowReschedule(true); }}
                    className="px-3 py-1.5 bg-white/70 ring-1 ring-emerald-200/70 rounded-xl hover:bg-emerald-50 text-emerald-950 font-extrabold text-xs transition-colors"
                  >
                    تعديل التواريخ (أدمن)
                  </button>
                  <button
                    onClick={() => setShowDelay(true)}
                    className="px-3 py-1.5 bg-white/70 ring-1 ring-emerald-200/70 rounded-xl hover:bg-emerald-50 text-emerald-950 font-extrabold text-xs transition-colors"
                  >
                    تأخير الحجز (أدمن)
                  </button>
                </>
              )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="text-xs sm:text-sm text-emerald-950 font-extrabold block mb-1">العميل</label>
                <div className="font-extrabold text-base sm:text-lg text-emerald-950">{booking.customer?.full_name}</div>
                <div className="text-xs sm:text-sm text-emerald-950 font-mono font-bold">{booking.customer?.phone}</div>
              </div>
              <div>
                <label className="text-xs sm:text-sm text-emerald-950 font-extrabold block mb-1">الوحدة</label>
                <div className="font-extrabold text-base sm:text-lg text-emerald-950 flex items-center gap-2">
                  <Home size={16} className="text-emerald-800" />
                  {booking.unit?.unit_number}
                  {isAdmin && ['confirmed', 'checked_in', 'pending_deposit'].includes(booking.status) && (
                    <button
                      onClick={() => {
                        setShowChangeUnit(true);
                        handleFetchAvailableUnits();
                      }}
                      className="p-1.5 hover:bg-emerald-50 rounded-xl text-emerald-800 transition-colors ring-1 ring-emerald-200/70 bg-white/70"
                      title="تغيير الوحدة"
                    >
                      <Edit size={14} />
                    </button>
                  )}
                </div>
                <div className="text-xs sm:text-sm text-emerald-950 font-bold">{booking.unit?.unit_type?.name}</div>
              </div>
              <div>
                <label className="text-xs sm:text-sm text-emerald-950 font-extrabold block mb-1">تاريخ الوصول</label>
                <div className="font-extrabold text-base sm:text-lg text-emerald-950">{format(new Date(booking.check_in), 'dd/MM/yyyy')}</div>
              </div>
              <div>
                <label className="text-xs sm:text-sm text-emerald-950 font-extrabold block mb-1">تاريخ المغادرة</label>
                <div className="font-extrabold text-base sm:text-lg text-emerald-950">
                  {(() => {
                    const outISO = String(booking.check_out || '').split('T')[0];
                    if (!outISO) return '-';
                    const outDate = new Date(`${outISO}T00:00:00`);
                    return format(outDate, 'dd/MM/yyyy');
                  })()}
                </div>
              </div>
            </div>

            {booking.status === 'checked_in' && (
              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      setEarlyExitDate(today > maxEarlyExitDate ? maxEarlyExitDate : today);
                      setEarlyPricingMode('monthly');
                      setEarlyError('');
                      setShowEarlyCheckoutModal(true);
                    }}
                    className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-900 font-black text-xs hover:bg-gray-50"
                  >
                    خروج مبكر
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        const today = new Date().toISOString().split('T')[0];
                        const initialExit = today > maxEarlyExitDate ? maxEarlyExitDate : today;
                        setTerminateExitDate(initialExit);
                        setTerminateDocDate(today);
                        setTerminateInvoiceTotal(String(booking.total_price || 0));
                        setTerminateError('');
                        setShowTerminateContractModal(true);
                      }}
                      className="px-3 py-2 rounded-xl bg-red-600 text-white font-black text-xs hover:bg-red-700"
                    >
                      فسخ العقد
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* TTLock Keys Section */}
            {bookingKeys.length > 0 && (
              <div className="mt-6 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                    <Key size={18} className="text-blue-600" />
                    مفاتيح الدخول الذكية (TTLock)
                  </h3>
                  <button 
                    onClick={loadBookingKeys}
                    className="p-1 hover:bg-blue-100 rounded-full transition-colors text-blue-600"
                    title="تحديث المفاتيح"
                  >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {bookingKeys.map((key) => (
                    <div key={key.id} className="bg-white p-3 rounded-lg border border-blue-200 shadow-sm flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-mono font-black text-blue-700 tracking-widest bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                            {key.passcode}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            key.status === 'active' ? 'bg-green-100 text-green-700' : 
                            key.status === 'frozen' ? 'bg-yellow-100 text-yellow-700' : 
                            'bg-red-100 text-red-700'
                          }`}>
                            {key.status === 'active' ? 'نشط' : key.status === 'frozen' ? 'مجمد' : 'ملغي'}
                          </span>
                        </div>
                        {key.sync_status === 'failed' && (
                          <div className="flex items-center gap-1 text-red-600" title={key.error_message}>
                            <AlertTriangle size={14} />
                            <span className="text-[10px] font-bold">خطأ مزامنة</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1 text-[10px] text-gray-500">
                          <Clock size={12} />
                          <span>من: {format(new Date(key.start_date), 'yyyy-MM-dd HH:mm')}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-gray-500">
                          <Clock size={12} />
                          <span>إلى: {format(new Date(key.end_date), 'yyyy-MM-dd HH:mm')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-100 flex flex-col sm:flex-row gap-2 sm:gap-3">
               <a 
                 href={waLink}
                 target="_blank"
                 rel="noopener noreferrer"
                 className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-50 text-green-800 font-bold text-xs sm:text-sm rounded-lg hover:bg-green-100 transition-colors"
               >
                 <MessageCircle size={18} />
                 <span>واتساب</span>
               </a>
               <a 
                 href={mailLink}
                 className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-50 text-blue-800 font-bold text-xs sm:text-sm rounded-lg hover:bg-blue-100 transition-colors"
               >
                 <Mail size={18} />
                 <span>إيميل</span>
               </a>
            </div>
          </div>

          <div className="rounded-2xl ring-1 ring-emerald-100/70 bg-gradient-to-br from-emerald-50 via-white to-white p-4 sm:p-6 shadow-sm">
            <h2 className="text-base sm:text-lg font-extrabold text-emerald-950 mb-4 sm:mb-6 flex items-center gap-2">
                <FileText className="text-emerald-700" size={20} />
                الفواتير
            </h2>
            <div className="space-y-3">
                {invoices.length > 0 ? (
                    invoices.map((inv) => {
                        const fin = getInvoiceFinancials(inv.id);
                        const displayStatus = fin.status;

                        return (
                        <div
                          key={inv.id}
                          className="ring-1 ring-emerald-100/70 bg-white/70 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-emerald-50/60 transition-colors"
                        >
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-bold text-gray-900 font-mono">{inv.invoice_number}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                                        displayStatus === 'paid' ? 'bg-green-100 text-green-800' : 
                                        displayStatus === 'posted' ? 'bg-blue-100 text-blue-800' : 
                                        'bg-gray-100 text-gray-800'
                                    }`}>
                                        {displayStatus === 'paid' ? 'مدفوعة' : displayStatus === 'posted' ? 'مرحلة' : 'مسودة'}
                                    </span>
                                </div>
                                <div className="text-sm text-gray-500">
                                   {format(new Date(inv.invoice_date || inv.created_at), 'dd/MM/yyyy')}
                                </div>
                            </div>
                            <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                                <div className="text-right">
                                     <div className="font-bold text-lg text-gray-900 leading-none">
                                        {inv.total_amount?.toLocaleString()} <span className="text-xs">ر.س</span>
                                     </div>
                                     {displayStatus !== 'paid' && displayStatus !== 'draft' && (
                                       <div className="text-[10px] font-black text-emerald-800 mt-1 bg-emerald-50 px-1.5 py-0.5 rounded-md inline-block border border-emerald-200">
                                         المتبقي: {fin.remaining.toLocaleString()} ر.س
                                       </div>
                                     )}
                                </div>
                                <div className="flex gap-2">
                                     <button
                                       type="button"
                                       onClick={() => openPrintPreview(`طباعة فاتورة ${inv.invoice_number}`, `/print/invoice/${inv.id}?embed=1`)}
                                       className="p-2 text-emerald-900 hover:text-emerald-950 hover:bg-emerald-100 rounded-xl transition-colors ring-1 ring-emerald-200/70 bg-white/60"
                                       title="طباعة"
                                     >
                                       <Printer size={20} />
                                     </button>
                                     {canAccounting && inv.status === 'draft' && (
                                       <button
                                         onClick={() => openInvoiceEdit(inv)}
                                         className="px-3 py-1.5 bg-white/70 ring-1 ring-emerald-200/70 text-emerald-950 text-sm font-extrabold rounded-xl hover:bg-emerald-50 transition-colors flex items-center gap-1"
                                         title="تعديل الفاتورة"
                                       >
                                         <Edit size={14} />
                                         تعديل
                                       </button>
                                     )}
                                    {canAccounting && inv.status === 'draft' && (
                                      <button
                                        onClick={() => deleteInvoice(inv)}
                                        disabled={loading}
                                        className="px-3 py-1.5 bg-white border border-red-200 text-red-700 text-sm font-bold rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1"
                                        title="حذف الفاتورة نهائياً (مسودة فقط)"
                                      >
                                        <Trash2 size={14} />
                                        حذف
                                      </button>
                                    )}
                                     {canAccounting && inv.status === 'draft' && (
                                       <button 
                                        onClick={() => handlePostInvoice(inv)}
                                         disabled={isIssuing}
                                         className="px-3 py-1.5 bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white text-sm font-extrabold rounded-xl hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800 transition-all flex items-center gap-1"
                                       >
                                         {isIssuing ? <Loader2 className="animate-spin" size={14} /> : <FileText size={14} />}
                                         ترحيل الفاتورة
                                       </button>
                                     )}
                                     {inv.status !== 'paid' && inv.status !== 'draft' && (
                                       <button 
                                         onClick={() => {
                                           setSelectedInvoiceId(inv.id);
                                           setAmount(getInvoiceRemaining(inv.id).toString());
                                           setShowPaymentModal(true);
                                         }}
                                         className="px-3 py-1.5 bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white text-sm font-extrabold rounded-xl hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800 transition-all"
                                       >
                                         سداد
                                       </button>
                                     )}
                                     {canAccounting && inv.status === 'posted' && (
                                       <button
                                         onClick={() => handleUnpostInvoice(inv)}
                                         disabled={loading}
                                         className="px-3 py-1.5 bg-amber-600 text-white text-sm font-extrabold rounded-xl hover:bg-amber-700 transition-colors flex items-center gap-1"
                                         title="إلغاء الترحيل"
                                       >
                                         {loading ? <Loader2 className="animate-spin" size={14} /> : <X size={14} />}
                                         إلغاء الترحيل
                                       </button>
                                     )}
                                     {isAdmin && isExtensionInvoice(inv) && inv.status !== 'void' && (
                                       <button
                                         onClick={() => handleCancelExtension(inv)}
                                         className="px-3 py-1.5 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 transition-colors"
                                         title="إلغاء التمديد"
                                       >
                                         إلغاء التمديد
                                       </button>
                                     )}
                                    {isAdmin && isExtensionInvoice(inv) && inv.status !== 'void' && (
                                      <button
                                        onClick={() => openExtensionEdit(inv)}
                                        disabled={loading}
                                        className="px-3 py-1.5 bg-white/70 ring-1 ring-emerald-200/70 text-emerald-950 text-sm font-extrabold rounded-xl hover:bg-emerald-50 transition-colors flex items-center gap-1"
                                        title="تعديل التمديد (تاريخ + مبالغ) مع انعكاسه على الحجز"
                                      >
                                        <Edit size={14} />
                                        تعديل التمديد
                                      </button>
                                    )}
                                    {(() => {
                                      const canFix = canAccounting;
                                      const postedAmount = getPostedJournalAmountForInvoice(inv.id);
                                      const invAmount = Number(inv.total_amount || 0);
                                      const mismatch = postedAmount === null || Math.abs(Number(postedAmount) - invAmount) > 0.009;
                                      if (!canFix) return null;
                                      if (!['posted', 'paid'].includes(inv.status)) return null;
                                      if (!mismatch) return null;
                                      return (
                                      <button
                                        onClick={() => handleFixInvoiceJournal(inv)}
                                        disabled={loading}
                                        className="px-3 py-1.5 bg-white border border-gray-300 text-gray-900 text-sm font-bold rounded-lg hover:bg-gray-50 transition-colors"
                                        title="تصحيح قيد الفاتورة (إعادة ترحيل القيد حسب مبالغ الفاتورة)"
                                      >
                                        تصحيح القيد
                                      </button>
                                      );
                                    })()}
                                </div>
                            </div>
                        </div>
                        );
                    })
                ) : (
                     <div className="text-center py-8 text-emerald-800 bg-emerald-50/60 rounded-2xl border border-dashed border-emerald-200">
                        لا توجد فواتير مصدرة لهذا الحجز
                     </div>
                )}
            </div>
          </div>

          <div className="rounded-2xl ring-1 ring-emerald-100/70 bg-gradient-to-br from-emerald-50 via-white to-white p-4 sm:p-6 shadow-sm">
            <h2 className="text-base sm:text-lg font-extrabold text-emerald-950 mb-3 sm:mb-4 flex items-center gap-2">
              <Banknote className="text-emerald-700" size={20} />
              سجل العمليات المالية
            </h2>
            
            <div className="overflow-x-auto rounded-2xl ring-1 ring-emerald-100/70 bg-white/70">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-emerald-50 text-emerald-950 font-extrabold">
                  <tr>
                    <th className="px-2 sm:px-4 py-2 text-right">التاريخ</th>
                    <th className="px-2 sm:px-4 py-2 text-right">النوع</th>
                    <th className="px-2 sm:px-4 py-2 text-right">الوصف</th>
                    <th className="px-2 sm:px-4 py-2 text-right">المبلغ</th>
                    <th className="px-2 sm:px-4 py-2 text-center">الطباعة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-100">
                  {transactions.map((txn: any) => {
                     const amounts = txn.journal_lines?.map((l: any) => l.debit || 0) || [];
                     const amount = amounts.length > 0 ? Math.max(...amounts) : 0;
                     const type = getTransactionType(txn);

                     return (
                      <tr key={txn.id} className="hover:bg-emerald-50/60 transition-colors">
                        <td className="px-2 sm:px-4 py-2.5 sm:py-3 text-gray-900 font-medium">{format(new Date(txn.entry_date), 'dd/MM/yyyy')}</td>
                        <td className="px-2 sm:px-4 py-2.5 sm:py-3 text-gray-900 font-medium">
                          {type === 'advance_payment' ? 'عربون' :
                           type === 'payment' ? 'سداد' :
                           type === 'refund' ? 'استرجاع' : 
                           type === 'invoice_issue' ? 'إصدار فاتورة' :
                           type === 'invoice_adjustment' ? 'تصحيح قيد' : type}
                        </td>
                        <td className="px-2 sm:px-4 py-2.5 sm:py-3 text-gray-900 font-medium">{txn.description}</td>
                        <td className="px-2 sm:px-4 py-2.5 sm:py-3 font-bold text-gray-900">
                          {amount.toLocaleString('en-US')} ر.س
                        </td>
                        <td className="px-2 sm:px-4 py-2.5 sm:py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {type === 'invoice_issue' && txn.reference_id ? (
                              (() => {
                                const inv = invoices.find((i: any) => i.id === txn.reference_id);
                                if (!inv) return <span className="text-gray-400 text-xs">—</span>;
                                return (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openPrintPreview(`طباعة فاتورة ${inv.invoice_number}`, `/print/invoice/${inv.id}?embed=1`)}
                                      className="inline-flex items-center p-1.5 text-emerald-900 hover:text-emerald-950 hover:bg-emerald-100 rounded-xl transition-colors ring-1 ring-emerald-200/70 bg-white/60"
                                      title="طباعة الفاتورة"
                                    >
                                      <Printer size={18} />
                                    </button>
                                    <>
                                        {canAccounting && inv.status === 'draft' && (
                                          <button
                                            onClick={() => openInvoiceEdit(inv)}
                                            disabled={loading}
                                            className="inline-flex items-center p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                            title="تعديل الفاتورة"
                                          >
                                            <Edit size={16} />
                                          </button>
                                        )}
                                        {canAccounting && inv.status === 'posted' && (
                                          <button
                                            onClick={() => handleUnpostInvoice(inv)}
                                            disabled={loading}
                                            className="inline-flex items-center p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                            title="إلغاء ترحيل الفاتورة"
                                          >
                                            {loading ? <Loader2 className="animate-spin" size={16} /> : <X size={16} />}
                                          </button>
                                        )}
                                        {canAccounting && inv.status !== 'paid' && (
                                          <button
                                            onClick={() => cancelInvoice(inv)}
                                            disabled={loading}
                                            className="inline-flex items-center p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="إلغاء الفاتورة"
                                          >
                                            <Ban size={16} />
                                          </button>
                                        )}
                                        {canAccounting && inv.status === 'draft' && (
                                          <button
                                            onClick={() => deleteInvoice(inv)}
                                            disabled={loading}
                                            className="inline-flex items-center p-1.5 text-gray-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                            title="حذف الفاتورة نهائياً"
                                          >
                                            <Trash2 size={16} />
                                          </button>
                                        )}
                                      </>
                                  </>
                                );
                              })()
                            ) : (['payment', 'advance_payment'].includes(type) || paymentJournalMap[txn.id]) ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openPrintPreview('طباعة سند القبض', `/print/receipt/${paymentJournalMap[txn.id]}?embed=1`)}
                                  className="inline-flex items-center p-1.5 text-emerald-900 hover:text-emerald-950 hover:bg-emerald-100 rounded-xl transition-colors ring-1 ring-emerald-200/70 bg-white/60"
                                  title="طباعة سند القبض"
                                >
                                  <Printer size={18} />
                                </button>
                                  <>
                                    {canAccounting && (
                                      <>
                                        <button
                                          onClick={() => handleEditPayment(txn)}
                                          disabled={loading}
                                          className="inline-flex items-center p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                          title="تعديل السند (التاريخ والبيان)"
                                        >
                                          <Edit size={16} />
                                        </button>
                                        <button
                                          onClick={() => handleUnpostPayment(txn)}
                                          disabled={loading}
                                          className="inline-flex items-center p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                          title="إلغاء ترحيل / حذف السند"
                                        >
                                          {loading ? <Loader2 className="animate-spin" size={16} /> : <X size={16} />}
                                        </button>
                                      </>
                                    )}
                                  </>
                              </>
                            ) : type === 'invoice_adjustment' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openPrintPreview('طباعة القيد', `/print/journal-entry/${txn.id}?embed=1`)}
                                  className="inline-flex items-center p-1.5 text-emerald-900 hover:text-emerald-950 hover:bg-emerald-100 rounded-xl transition-colors ring-1 ring-emerald-200/70 bg-white/60"
                                  title="طباعة القيد"
                                >
                                  <Printer size={18} />
                                </button>
                                {canAccounting ? (
                                  <button
                                    onClick={() => handleDeleteInvoiceAdjustment(txn)}
                                    disabled={loading}
                                    className="inline-flex items-center p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="حذف قيد التصحيح"
                                  >
                                    {loading ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                                  </button>
                                ) : (
                                  <span className="text-gray-400 text-xs">—</span>
                                )}
                              </>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-emerald-900 font-bold">
                        لا توجد حركات مالية مسجلة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-4 lg:space-y-6">
          <div className="rounded-2xl ring-1 ring-emerald-100/70 bg-gradient-to-br from-emerald-50 via-white to-white p-4 sm:p-6 shadow-sm">
            <h2 className="text-base sm:text-lg font-extrabold text-emerald-950 mb-4 sm:mb-6 flex items-center gap-2">
              <Banknote className="text-emerald-700" size={20} />
              سندات التأمين (منفصلة)
            </h2>
            {insuranceEvents.length > 0 ? (
              <div className="space-y-3">
                {insuranceEvents.map((ev: any) => {
                  const vt = ev?.payload?.voucher_type;
                  const amt = Number(ev?.payload?.amount) || 0;
                  const d = ev?.payload?.voucher_date || (ev?.created_at ? String(ev.created_at).split('T')[0] : '');
                  const label =
                    vt === 'deposit_receipt' ? 'قبض' :
                    vt === 'deposit_refund' ? 'صرف' :
                    vt === 'deposit_to_damage_income' ? 'كتلفيات' : 'مقاصة صيانة';
                  return (
                    <div
                      key={ev.id}
                      className="ring-1 ring-emerald-100/70 bg-white/70 rounded-2xl p-3 sm:p-4 flex items-center justify-between hover:bg-emerald-50/60 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">{label}</span>
                          <span className="text-gray-500 text-xs">{d}</span>
                        </div>
                        <div className="font-bold text-gray-900">{amt.toLocaleString()} <span className="text-xs">ر.س</span></div>
                        {ev?.payload?.description && <div className="text-xs text-gray-600">{ev.payload.description}</div>}
                      </div>
                      <button
                        type="button"
                        onClick={() => openPrintPreview('طباعة سند التأمين', `/print/insurance-voucher/${ev.id}?embed=1`)}
                        className="p-2 text-emerald-900 hover:text-emerald-950 hover:bg-emerald-100 rounded-xl transition-colors ring-1 ring-emerald-200/70 bg-white/60"
                        title="طباعة السند"
                      >
                        <Printer size={20} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-emerald-800 bg-emerald-50/60 rounded-2xl border border-dashed border-emerald-200">
                لا توجد سندات تأمين منفصلة لهذا الحجز
              </div>
            )}
          </div>
          <div className="hidden sm:block rounded-2xl bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 shadow-sm ring-1 ring-emerald-900/20 p-4 sm:p-6 text-white">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h2 className="text-base sm:text-lg font-extrabold">الملخص المالي</h2>
              {isAdmin && (
                <button 
                  onClick={() => setShowEditPrice(true)}
                  className="p-1.5 text-white hover:bg-white/10 rounded-xl transition-colors ring-1 ring-white/20"
                  title="تعديل المبالغ"
                >
                  <Edit size={16} />
                </button>
              )}
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2 pb-4 border-b border-white/15 text-xs sm:text-sm">
                <div className="flex justify-between items-center text-white/85">
                  <span>المجموع الفرعي</span>
                  <span className="font-bold">{booking.subtotal?.toLocaleString('en-US')} <span className="text-xs">ر.س</span></span>
                </div>

                {booking.additional_services && Array.isArray(booking.additional_services) && booking.additional_services.length > 0 && (
                  <div className="flex justify-between items-center text-emerald-50">
                    <span>خدمات إضافية</span>
                    <span className="font-extrabold text-emerald-100">
                        +{(booking.additional_services.reduce((acc: number, curr: any) => acc + (curr.amount || 0), 0)).toLocaleString('en-US')} <span className="text-xs">ر.س</span>
                    </span>
                  </div>
                )}

                {booking.discount_amount > 0 && (
                  <div className="flex justify-between items-center text-white/85">
                    <span>الخصم</span>
                    <span className="font-extrabold text-rose-100">-{booking.discount_amount?.toLocaleString('en-US')} <span className="text-xs">ر.س</span></span>
                  </div>
                )}

                <div className="flex justify-between items-center text-white/85">
                  <span>الضريبة (15%)</span>
                  <span className="font-bold">{booking.tax_amount?.toLocaleString('en-US')} <span className="text-xs">ر.س</span></span>
                </div>
              </div>

              <div className="flex justify-between items-center pb-4 border-b border-white/15">
                <span className="font-extrabold">إجمالي الحجز</span>
                <span className="font-extrabold text-lg sm:text-xl">{totalAmount.toLocaleString('en-US')} <span className="text-xs sm:text-sm font-extrabold">ر.س</span></span>
              </div>
              
              <div className="flex justify-between items-center text-emerald-50">
                <span className="flex items-center gap-2 font-extrabold">
                  <CheckCircle size={16} />
                  المدفوع
                </span>
                <span className="font-extrabold text-base sm:text-lg">{paidAmount.toLocaleString('en-US')} <span className="text-xs sm:text-sm font-extrabold">ر.س</span></span>
              </div>

              <div className="flex justify-between items-center text-rose-100 pt-4 border-t border-white/15">
                <span className="font-extrabold">المتبقي</span>
                <span className="font-extrabold text-xl sm:text-2xl">{remainingAmount.toLocaleString('en-US')} <span className="text-xs sm:text-sm font-extrabold">ر.س</span></span>
              </div>

              {remainingAmount > 0 && (
                <button
                  onClick={() => {
                    const selectableInvoices = (invoices || []).filter((inv: any) => inv && inv.id && inv.status !== 'void');
                    if (selectableInvoices.length === 0) {
                      alert('لا توجد فواتير لهذا الحجز لربط الدفعة بها');
                      return;
                    }
                    setPaymentRequireInvoice(true);
                    setSelectedInvoiceId(selectableInvoices.length === 1 ? selectableInvoices[0].id : null);
                    setAmount(remainingAmount.toString());
                    setShowPaymentModal(true);
                  }}
                  className="w-full mt-4 sm:mt-6 bg-white/10 hover:bg-white/15 text-white py-2.5 sm:py-3 rounded-2xl font-extrabold shadow-sm transition-colors flex items-center justify-center gap-2 text-sm ring-1 ring-white/20"
                >
                  <CreditCard size={20} />
                  سداد دفعة / عربون
                </button>
              )}
              
              {remainingAmount <= 0 && (
                <div className="mt-6 bg-white/10 text-emerald-50 py-3 rounded-2xl text-center font-extrabold ring-1 ring-white/20">
                  تم السداد بالكامل
                </div>
              )}
            </div>
          </div>

          {/* Installment Schedule for Long-term Bookings */}
          {remainingAmount > 0 && booking.nights >= 28 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
              <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="text-purple-600" size={20} />
                جدول دفعات الأقساط
              </h2>
              <div className="space-y-3">
                {(() => {
                  const checkIn = new Date(booking.check_in);
                  const checkOut = new Date(booking.check_out);
                  
                  // Calculate months by counting 30-day cycles or actual month diff
                  const monthsCount = Math.max(1, Math.round(booking.nights / 30));
                  const platformFee = (() => {
                    const extras = Array.isArray(booking.additional_services) ? booking.additional_services : [];
                    const fromExtras = extras.reduce((sum: number, ex: any) => {
                      const name = String(ex?.name ?? ex?.title ?? ex?.label ?? '').trim();
                      const lower = name.toLowerCase();
                      const hasPlatform = name.includes('منصة') || lower.includes('platform');
                      const hasEjar = name.includes('إيجار') || name.includes('ايجار') || name.includes('اجار') || lower.includes('ejar');
                      const hasFee = name.includes('رسوم') || name.includes('عمولة') || lower.includes('fee') || lower.includes('commission');
                      if (!(hasPlatform && (hasEjar || hasFee))) return sum;
                      return sum + (Number(ex?.amount) || 0);
                    }, 0);
                    if (fromExtras > 0) return fromExtras;
                    const invExtrasMax = (invoices || []).reduce((m: number, inv: any) => Math.max(m, Number(inv?.additional_services_amount) || 0), 0);
                    if (String(booking.booking_source || '') === 'platform' && invExtrasMax >= 250) return 250;
                    return 0;
                  })();
                  const netTotalForInstallments = Math.max(0, totalAmount - platformFee);
                  const paidForInstallments = Math.max(0, paidAmount - platformFee);
                  const installmentAmount = netTotalForInstallments / monthsCount;
                  let currentPaid = paidForInstallments;

                  return Array.from({ length: monthsCount }).map((_, i) => {
                    const num = i + 1;
                    const dueDate = addMonths(checkIn, i);
                    
                    // Logic to check if this installment is covered by total paid
                    const amountForThisInstallment = installmentAmount;
                    const amountPaidForThis = Math.min(amountForThisInstallment, Math.max(0, currentPaid));
                    currentPaid -= amountForThisInstallment;
                    
                    const isFullyPaid = amountPaidForThis >= amountForThisInstallment;
                    const isOverdue = !isFullyPaid && dueDate < new Date();
                    const remainingForThis = amountForThisInstallment - amountPaidForThis;
                    const isToday = isSameDay(dueDate, new Date());

                    return (
                      <div key={num} className={`p-3 rounded-lg border relative overflow-hidden ${
                        isFullyPaid ? 'bg-green-50 border-green-100' : 
                        isToday ? 'bg-red-600 border-red-700 text-white' :
                        isOverdue ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'
                      }`}>
                        {isToday && !isFullyPaid && (
                          <div className="absolute top-0 right-0 px-2 py-0.5 bg-white text-red-600 text-[8px] font-black uppercase tracking-tighter rounded-bl-lg shadow-sm">
                            موعد الاستحقاق اليوم
                          </div>
                        )}
                        <div className="flex justify-between items-center mb-1">
                          <span className={`text-sm font-bold ${isToday && !isFullyPaid ? 'text-white' : 'text-gray-700'}`}>الدفعة {num}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isFullyPaid ? 'bg-green-100 text-green-700' :
                            isToday ? 'bg-white text-red-600 animate-bounce' :
                            isOverdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {isFullyPaid ? 'مسددة' : isToday ? 'تستحق اليوم!' : isOverdue ? 'مستحقة' : 'قادمة'}
                          </span>
                        </div>
                        <div className="flex justify-between items-end">
                          <div className={`text-[10px] ${isToday && !isFullyPaid ? 'text-white/80' : 'text-gray-500'}`}>
                            تاريخ الاستحقاق: <span className="font-mono">{format(dueDate, 'dd/MM/yyyy')}</span>
                          </div>
                          <div className="text-right">
                            <div className={`text-sm font-bold ${isToday && !isFullyPaid ? 'text-white' : 'text-gray-900'}`}>
                              {amountForThisInstallment.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span className="text-[10px]">ر.س</span>
                            </div>
                            {!isFullyPaid && amountPaidForThis > 0 && (
                              <div className={`text-[10px] font-bold ${isToday ? 'text-green-200' : 'text-green-600'}`}>
                                مدفوع: {amountPaidForThis.toLocaleString()} ر.س
                              </div>
                            )}
                            {remainingForThis > 0 && remainingForThis < amountForThisInstallment && (
                              <div className={`text-[10px] font-bold ${isToday ? 'text-white underline' : 'text-red-600'}`}>
                                متبقي: {remainingForThis.toLocaleString()} ر.س
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
                <p className="text-[10px] text-gray-400 mt-2 italic text-center">
                  * تم احتساب الأقساط بناءً على تاريخ الدخول ومدى تغطية المبالغ المسددة لكل شهر.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

    {/* removed manual entry modal */}
    

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-100">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-4 sm:p-6 text-white relative">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
                    <CreditCard size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-black leading-none mb-1">تسجيل سداد جديد</h3>
                    <p className="text-blue-100 text-[10px] sm:text-xs font-medium">سند قبض مالي جديد</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowPaymentModal(false);
                    setPaymentRequireInvoice(false);
                    setSelectedInvoiceId(null);
                  }}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-5 max-h-[85vh] overflow-y-auto">
              {/* Financial Summary Card */}
              {(() => {
                const fin = selectedInvoiceId ? getInvoiceFinancials(selectedInvoiceId) : null;
                return (
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500 mb-1">{selectedInvoiceId ? 'إجمالي الفاتورة' : 'إجمالي الحجز'}</p>
                    <p className="text-xs sm:text-sm font-black text-slate-900">
                      {(selectedInvoiceId ? (invoices.find(i => i.id === selectedInvoiceId)?.total_amount || 0) : totalAmount).toLocaleString('en-US')} <span className="text-[9px]">ر.س</span>
                    </p>
                  </div>
                  <div className="text-center border-x border-slate-200">
                    <p className="text-[10px] text-slate-500 mb-1">المسدد</p>
                    <p className="text-xs sm:text-sm font-black text-emerald-600">
                      {(fin ? fin.paid : paidAmount).toLocaleString('en-US')} <span className="text-[9px]">ر.س</span>
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500 mb-1">المتبقي</p>
                    <p className="text-xs sm:text-sm font-black text-blue-600">
                      {(fin ? fin.remaining : remainingAmount).toLocaleString('en-US')} <span className="text-[9px]">ر.س</span>
                    </p>
                  </div>
                </div>
                );
              })()}

              <form onSubmit={handlePaymentSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Amount Field */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-black text-slate-700 mb-1.5 mr-1">المبلغ المطلوب سداده</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-600 transition-colors">
                        <DollarSign size={18} />
                      </div>
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className={`w-full pr-11 pl-4 py-3 sm:py-4 bg-slate-50 border-2 rounded-2xl focus:ring-0 outline-none font-black text-xl sm:text-2xl transition-all ${
                          Number(amount) > (selectedInvoiceId ? getInvoiceRemaining(selectedInvoiceId) : remainingAmount) + 0.01
                            ? 'border-amber-400 focus:border-amber-500 bg-amber-50/30'
                            : 'border-slate-100 focus:border-blue-600 focus:bg-white'
                        }`}
                        placeholder="0.00"
                        required
                        min="1"
                      />
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <span className="text-xs font-black text-slate-400">ر.س</span>
                      </div>
                    </div>
                    {Number(amount) > (selectedInvoiceId ? getInvoiceRemaining(selectedInvoiceId) : remainingAmount) + 0.01 && (
                      <div className="mt-2 p-2 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-2 text-amber-700 animate-in fade-in slide-in-from-top-1">
                        <AlertTriangle size={14} className="shrink-0" />
                        <p className="text-[10px] font-bold">
                          تحذير: المبلغ المدخل يتجاوز {selectedInvoiceId ? 'المتبقي من الفاتورة' : 'المتبقي من الحجز'}
                        </p>
                      </div>
                    )}
                    {(selectedInvoiceId ? getInvoiceRemaining(selectedInvoiceId) : remainingAmount) > 0 && (
                      <div className="mt-2 flex justify-end">
                        <button 
                          type="button"
                          onClick={() => setAmount((selectedInvoiceId ? getInvoiceRemaining(selectedInvoiceId) : remainingAmount).toFixed(2))}
                          className="text-[10px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-1 rounded-lg"
                        >
                          سداد كامل المتبقي
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Invoice Selection (if required) */}
                  {paymentRequireInvoice && (
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-black text-slate-700 mb-1.5 mr-1">اربط بالفاتورة</label>
                      <select
                        value={selectedInvoiceId || ''}
                        onChange={(e) => setSelectedInvoiceId(e.target.value || null)}
                        className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 focus:bg-white outline-none font-bold text-sm transition-all appearance-none"
                        required
                      >
                        <option value="" disabled>اختر الفاتورة المراد سدادها</option>
                        {(activeInvoices || []).map((inv: any) => (
                          <option key={inv.id} value={inv.id}>
                            فاتورة رقم {inv.invoice_number} ({inv.total_amount} ر.س)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Payment Date */}
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5 mr-1">تاريخ العملية</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 focus:bg-white outline-none font-bold text-sm transition-all"
                        required
                      />
                    </div>
                  </div>

                  {/* Reference Number */}
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5 mr-1">رقم المرجع (اختياري)</label>
                    <input
                      type="text"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 focus:bg-white outline-none font-bold text-sm transition-all placeholder:text-slate-300"
                      placeholder="رقم العملية البنكية..."
                    />
                  </div>
                </div>

                {/* Payment Methods */}
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-2 mr-1">طريقة الدفع</label>
                  {paymentMethods.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {paymentMethods.map((method) => {
                        const isSelected = paymentMethodId === method.id;
                        return (
                          <button
                            key={method.id}
                            type="button"
                            onClick={() => setPaymentMethodId(method.id)}
                            className={`px-3 py-2.5 rounded-xl text-[11px] sm:text-xs font-black border-2 transition-all flex items-center justify-center gap-2 ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200 scale-[1.02]'
                                : 'bg-white border-slate-100 text-slate-600 hover:border-slate-200'
                            }`}
                          >
                            {isSelected && <Check size={14} />}
                            {method.name}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-3 bg-red-50 border-2 border-red-50 rounded-2xl text-red-600 text-[11px] font-bold flex items-center gap-2">
                      <AlertCircle size={16} />
                      لا توجد طرق دفع متاحة. يرجى مراجعة الإعدادات.
                    </div>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 mr-1">ملاحظات إضافية</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 focus:bg-white outline-none font-medium text-sm transition-all h-20 resize-none placeholder:text-slate-300"
                    placeholder="أي تفاصيل أخرى عن السداد..."
                  />
                </div>

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading || !paymentMethodId}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white py-4 rounded-[1.25rem] font-black shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale disabled:shadow-none active:scale-[0.98]"
                  >
                    {loading ? (
                      <Loader2 className="animate-spin" size={20} />
                    ) : (
                      <>
                        <CheckCircle size={20} />
                        <span className="text-base">تأكيد عملية السداد</span>
                      </>
                    )}
                  </button>
                  <p className="text-center text-[10px] text-slate-400 mt-3">بمجرد التأكيد سيتم ترحيل السند وتحديث الرصيد فوراً</p>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    {showReschedule && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-gray-900">تعديل تواريخ الحجز (أدمن)</h3>
            <button onClick={() => setShowReschedule(false)} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ الوصول</label>
              <input
                type="date"
                value={newCheckIn}
                onChange={(e) => setNewCheckIn(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ المغادرة</label>
              <input
                type="date"
                value={newCheckOut}
                onChange={(e) => setNewCheckOut(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>
          {booking.status === 'checked_in' && (
            <div className="mt-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              هذا الحجز في حالة "تم الدخول". يجب أن يشمل المدى تاريخ اليوم.
            </div>
          )}
          <div className="mt-6 flex gap-2 justify-end">
            <button onClick={() => setShowReschedule(false)} className="px-4 py-2 rounded-lg border">إلغاء</button>
            <button onClick={handleReschedule} disabled={loading} className="px-4 py-2 rounded-lg bg-blue-600 text-white">
              {loading ? 'جاري الحفظ...' : 'حفظ التعديل'}
            </button>
          </div>
        </div>
      </div>
    )}
    {showDelay && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-gray-900">تأخير الحجز (أدمن)</h3>
            <button onClick={() => setShowDelay(false)} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">عدد الأيام</label>
              <input
                type="number"
                min={1}
                value={delayDays}
                onChange={(e) => setDelayDays(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div className="flex gap-2">
              {[1,2,3].map(d => (
                <button key={d} onClick={() => setDelayDays(d)} className="px-3 py-1.5 border rounded-lg">{d} يوم</button>
              ))}
            </div>
          </div>
          {booking.status === 'checked_in' && (
            <div className="mt-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              هذا الحجز في حالة "تم الدخول". يجب أن يشمل التأخير تاريخ اليوم ضمن المدى الجديد.
            </div>
          )}
          <div className="mt-6 flex gap-2 justify-end">
            <button onClick={() => setShowDelay(false)} className="px-4 py-2 rounded-lg border">إلغاء</button>
            <button onClick={handleDelayBooking} disabled={loading} className="px-4 py-2 rounded-lg bg-blue-600 text-white">
              {loading ? 'جاري الحفظ...' : 'تنفيذ التأخير'}
            </button>
          </div>
        </div>
      </div>
    )}
    {showEjarUploadModal && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
          <div className="p-6 flex justify-between items-center border-b">
            <h3 className="text-xl font-bold text-gray-900">{ejarEditMode ? 'تعديل رفع العقد إلى منصة إيجار' : 'رفع العقد إلى منصة إيجار'}</h3>
            <button onClick={() => setShowEjarUploadModal(false)} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          </div>
          <div className="p-6 overflow-y-auto space-y-4">
            {ejarEditMode ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 font-bold">
                سيتم إعادة الحالة إلى: <span className="font-black">تم الرفع بانتظار التأكيد</span>
              </div>
            ) : null}
            {ejarSelectableInvoices.length > 1 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <div className="text-xs font-black text-amber-900 mb-2">اختيار الفاتورة (الحجز فيه أكثر من فاتورة)</div>
                <select
                  value={ejarSelectedInvoiceId}
                  onChange={(e) => setEjarSelectedInvoiceId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-sm font-bold bg-white"
                >
                  <option value="">-- اختر الفاتورة --</option>
                  {ejarSelectableInvoices.map((inv: any) => {
                    const n = String(inv?.invoice_number || '');
                    const isExt = n.includes('-EXT-');
                    const dt = String(inv?.invoice_date || inv?.created_at || '').split('T')[0] || '';
                    const t = Number(inv?.total_amount || 0);
                    return (
                      <option key={String(inv.id)} value={String(inv.id)}>
                        {isExt ? 'تمديد' : 'أساسية'} • {n || String(inv.id).slice(0, 8)} • {dt || '-'} • {t.toLocaleString()} ر.س
                      </option>
                    );
                  })}
                </select>
                <div className="mt-2 text-[11px] text-amber-900 font-bold">
                  ملاحظة: عند وجود تمديد اختر الفاتورة الأحدث (فاتورة التمديد) ثم احفظ الرفع.
                </div>
              </div>
            ) : null}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <div className="text-xs font-black text-gray-800 mb-2">تفاصيل الفاتورة</div>
              {ejarInvoicePreview ? (
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">رقم الفاتورة</span>
                    <span className="font-black text-gray-900 dir-ltr">{String(ejarInvoicePreview.invoice_number || '-')}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">تاريخ الفاتورة</span>
                    <span className="font-bold text-gray-900 dir-ltr">{String(ejarInvoicePreview.invoice_date || '-')}</span>
                  </div>
                  <div className="h-px bg-gray-200 my-2" />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">عدد الأشهر</span>
                    <span className="font-bold text-gray-900 dir-ltr">{String(ejarInvoicePreview.monthsCount)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">قيمة الشهر (بدون رسوم المنصة)</span>
                    <span className="font-bold text-gray-900 dir-ltr">
                      {ejarInvoicePreview.perMonthWithoutPlatform != null ? `${ejarInvoicePreview.perMonthWithoutPlatform.toLocaleString()} ر.س` : '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">رسوم منصة إيجار</span>
                    <span className="font-bold text-gray-900 dir-ltr">{(Math.round(ejarInvoicePreview.platformFee * 100) / 100).toLocaleString()} ر.س</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">إضافات أخرى (بدون رسوم المنصة)</span>
                    <span className="font-bold text-gray-900 dir-ltr">{(Math.round(ejarInvoicePreview.extrasWithoutPlatform * 100) / 100).toLocaleString()} ر.س</span>
                  </div>
                  <div className="h-px bg-gray-200 my-2" />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">المبلغ الأساسي</span>
                    <span className="font-bold text-gray-900 dir-ltr">{(Math.round(ejarInvoicePreview.subtotal * 100) / 100).toLocaleString()} ر.س</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">الخصم</span>
                    <span className="font-bold text-gray-900 dir-ltr">{(Math.round(ejarInvoicePreview.discount * 100) / 100).toLocaleString()} ر.س</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">الإضافة</span>
                    <span className="font-bold text-gray-900 dir-ltr">{(Math.round(ejarInvoicePreview.extras * 100) / 100).toLocaleString()} ر.س</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">الضريبة</span>
                    <span className="font-bold text-gray-900 dir-ltr">{(Math.round(ejarInvoicePreview.tax * 100) / 100).toLocaleString()} ر.س</span>
                  </div>
                  <div className="h-px bg-gray-200 my-2" />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-700 font-black">الإجمالي</span>
                    <span className="font-black text-gray-900 dir-ltr">{(Math.round(ejarInvoicePreview.total * 100) / 100).toLocaleString()} ر.س</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-red-700 font-bold">لا توجد فاتورة صالحة للحجز.</div>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">تاريخ ميلاد العميل (إجباري)</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={ejarBirthCalendar}
                  onChange={(e) => setEjarBirthCalendar(e.target.value as any)}
                  className="w-full px-3 py-2 border rounded-xl text-sm font-bold bg-white"
                >
                  <option value="gregorian">ميلادي</option>
                  <option value="hijri">هجري</option>
                </select>
                {ejarBirthCalendar === 'gregorian' ? (
                  <input
                    type="date"
                    value={ejarBirthDateText}
                    onChange={(e) => setEjarBirthDateText(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl"
                  />
                ) : (
                  <input
                    type="text"
                    value={ejarBirthDateText}
                    onChange={(e) => setEjarBirthDateText(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl"
                    placeholder="مثال: 1447-01-01"
                    dir="ltr"
                  />
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">ملاحظة للمشرف (إجباري)</label>
              <textarea
                value={ejarSupervisorNote}
                onChange={(e) => setEjarSupervisorNote(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl text-sm"
                rows={3}
                placeholder="اكتب ملاحظة للمشرف"
              />
              <div className="mt-1 text-[11px] text-red-700 font-bold">
                هذه الملاحظة ستظهر للمشرف في صفحة عقود منصة إيجار.
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">ملاحظات</label>
              <textarea
                value={ejarUploadNotes}
                onChange={(e) => setEjarUploadNotes(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl text-sm"
                rows={3}
                placeholder="اكتب ملاحظات الرفع (اختياري)"
              />
            </div>
            <div className="text-xs text-gray-500">
              سيتم حفظ الحالة: <span className="font-bold text-gray-700">تم الرفع بانتظار التأكيد</span>
            </div>
          </div>
          <div className="p-6 border-t flex gap-2 justify-end">
            <button onClick={() => setShowEjarUploadModal(false)} className="px-4 py-2 rounded-lg border">إلغاء</button>
            <button
              onClick={handleConfirmEjarUpload}
              disabled={ejarUploadBusy}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-2"
            >
              {ejarUploadBusy ? <Loader2 className="animate-spin" size={16} /> : null}
              {ejarEditMode ? 'حفظ التعديل' : 'حفظ الرفع'}
            </button>
          </div>
        </div>
      </div>
    )}
      {showExtendModal && (
        <ExtendBookingModal
          isOpen={showExtendModal}
          onClose={() => setShowExtendModal(false)}
          booking={booking}
          onSuccess={() => {
            setShowExtendModal(false);
            router.refresh();
          }}
        />
      )}

      {showEditExtensionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <Edit className="text-blue-600" size={20} />
                <h3 className="text-xl font-bold text-gray-900">تعديل التمديد</h3>
              </div>
              <button
                onClick={() => {
                  setShowEditExtensionModal(false);
                  setEditingExtensionInvoice(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleUpdateExtensionSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">بداية التمديد</label>
                  <input
                    value={extPeriodStart}
                    readOnly
                    className="w-full px-3 py-2 border rounded-xl bg-gray-50 text-gray-700 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">نهاية التمديد الحالية</label>
                  <input
                    value={extPeriodEnd}
                    readOnly
                    className="w-full px-3 py-2 border rounded-xl bg-gray-50 text-gray-700 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">نهاية التمديد الجديدة</label>
                <input
                  type="date"
                  value={extNewEndDate}
                  onChange={(e) => setExtNewEndDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  required
                />
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    value={extMonths}
                    onChange={(e) => setExtMonths(e.target.value)}
                    className="w-24 px-3 py-2 border rounded-xl text-sm font-bold"
                    title="عدد الأشهر (يسمح 0.25 / 0.5)"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const m = Number(extMonths || 0);
                      if (!m || Number.isNaN(m) || m <= 0) return;
                      const base = new Date(`${extPeriodStart}T00:00:00`);
                      const d = Number.isInteger(m) ? addMonths(base, m) : addDays(base, Math.max(1, Math.round(m * 30)));
                      setExtNewEndDate(format(d, 'yyyy-MM-dd'));
                    }}
                    className="px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 text-sm font-bold"
                  >
                    تطبيق
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">المبلغ الأساسي</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={extBaseSubtotal}
                    onChange={(e) => setExtBaseSubtotal(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">الخصم</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={extDiscount}
                    onChange={(e) => setExtDiscount(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-sm font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">إضافات</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={extExtras}
                    onChange={(e) => setExtExtras(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">نسبة الضريبة</label>
                  <input
                    type="number"
                    min={0}
                    step="0.00001"
                    value={extTaxRate}
                    onChange={(e) => setExtTaxRate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-sm font-bold"
                    disabled={!extApplyTax}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-bold text-gray-800">
                <input type="checkbox" checked={extApplyTax} onChange={(e) => setExtApplyTax(e.target.checked)} />
                مع ضريبة
              </label>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-700 space-y-1">
                {(() => {
                  const baseSubtotal = Number(extBaseSubtotal || 0);
                  const discount = Number(extDiscount || 0);
                  const extras = Number(extExtras || 0);
                  const net = Math.max(0, baseSubtotal - discount + extras);
                  const rate = extApplyTax ? Number(extTaxRate || hotelTaxRate) : 0;
                  const tax = extApplyTax ? Math.round(net * rate * 100) / 100 : 0;
                  const total = Math.round((net + tax) * 100) / 100;
                  return (
                    <>
                      <div className="flex justify-between"><span>الصافي</span><span className="font-mono font-bold">{net.toLocaleString('en-US')} ر.س</span></div>
                      <div className="flex justify-between"><span>الضريبة</span><span className="font-mono font-bold">{tax.toLocaleString('en-US')} ر.س</span></div>
                      <div className="flex justify-between"><span>الإجمالي</span><span className="font-mono font-black">{total.toLocaleString('en-US')} ر.س</span></div>
                    </>
                  );
                })()}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditExtensionModal(false);
                    setEditingExtensionInvoice(null);
                  }}
                  className="px-4 py-2 rounded-xl border bg-white hover:bg-gray-50 text-sm font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-sm font-black disabled:opacity-50"
                >
                  {loading ? 'جارٍ الحفظ...' : 'حفظ التعديل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditInvoiceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <Edit className="text-blue-600" size={20} />
                <h3 className="text-xl font-bold text-gray-900">تعديل الفاتورة</h3>
              </div>
              <button
                onClick={() => {
                  setShowEditInvoiceModal(false);
                  setEditingInvoice(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleUpdateInvoiceSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">رقم الفاتورة</label>
                <input
                  value={invoiceNumberEdit}
                  onChange={(e) => setInvoiceNumberEdit(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ الفاتورة</label>
                  <input
                    type="date"
                    value={invoiceDateEdit}
                    onChange={(e) => setInvoiceDateEdit(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ الاستحقاق</label>
                  <input
                    type="date"
                    value={invoiceDueDateEdit}
                    onChange={(e) => setInvoiceDueDateEdit(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الإجمالي قبل الضريبة</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={invoiceSubtotalEdit}
                    onChange={(e) => setInvoiceSubtotalEdit(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الضريبة</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={invoiceTaxEdit}
                    onChange={(e) => setInvoiceTaxEdit(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الخصم</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={invoiceDiscountEdit}
                    onChange={(e) => setInvoiceDiscountEdit(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الإضافات</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={invoiceExtrasEdit}
                    onChange={(e) => setInvoiceExtrasEdit(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">إجمالي الفاتورة</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={invoiceTotalEdit}
                  onChange={(e) => setInvoiceTotalEdit(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                />
              </div>

              <div className="mt-6 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditInvoiceModal(false);
                    setEditingInvoice(null);
                  }}
                  className="px-4 py-2 rounded-lg border hover:bg-gray-50 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Price Modal */}
      {showEditPrice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <DollarSign className="text-blue-600" size={20} />
                <h3 className="text-xl font-bold text-gray-900">تعديل شامل للحجز</h3>
              </div>
              <button onClick={() => setShowEditPrice(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleUpdateBookingPrice} className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-700">
                <div className="font-black text-gray-900">مهم</div>
                <div className="mt-1">لا يمكن التعديل إذا كان هناك تمديد أو سندات قبض مرتبطة بالفاتورة الأساسية.</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ الدخول</label>
                  <input
                    type="date"
                    value={newCheckIn}
                    onChange={(e) => {
                      const next = e.target.value;
                      setNewCheckIn(next);
                      const start = next ? new Date(`${next}T00:00:00`) : null;
                      const end = newCheckOut ? new Date(`${newCheckOut}T00:00:00`) : null;
                      const days = start && end ? differenceInDays(end, start) : 0;
                      const months = Math.max(1, Math.round(days / 30));
                      const sub = (Number(monthlyRateEdit || 0) * months) || 0;
                      setNewSubtotal(sub.toFixed(2));
                      const disc = Number(newDiscountAmount || 0);
                      const extras = Number(newExtrasAmount || 0);
                      const net = Math.max(0, sub - disc + extras);
                      const tax = includeTax ? Math.round(net * hotelTaxRate * 100) / 100 : 0;
                      setNewTaxAmount(tax.toFixed(2));
                      setNewTotalPrice((net + tax).toFixed(2));
                    }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ الخروج</label>
                  <input
                    type="date"
                    value={newCheckOut}
                    onChange={(e) => {
                      const next = e.target.value;
                      setNewCheckOut(next);
                      const start = newCheckIn ? new Date(`${newCheckIn}T00:00:00`) : null;
                      const end = next ? new Date(`${next}T00:00:00`) : null;
                      const days = start && end ? differenceInDays(end, start) : 0;
                      const months = Math.max(1, Math.round(days / 30));
                      const sub = (Number(monthlyRateEdit || 0) * months) || 0;
                      setNewSubtotal(sub.toFixed(2));
                      const disc = Number(newDiscountAmount || 0);
                      const extras = Number(newExtrasAmount || 0);
                      const net = Math.max(0, sub - disc + extras);
                      const tax = includeTax ? Math.round(net * hotelTaxRate * 100) / 100 : 0;
                      setNewTaxAmount(tax.toFixed(2));
                      setNewTotalPrice((net + tax).toFixed(2));
                    }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border bg-white">
                  <div className="text-[11px] font-black text-gray-900">المدة (بالأشهر)</div>
                  <div className="mt-1 text-lg font-black text-gray-900">
                    {(() => {
                      const start = newCheckIn ? new Date(`${newCheckIn}T00:00:00`) : null;
                      const end = newCheckOut ? new Date(`${newCheckOut}T00:00:00`) : null;
                      const days = start && end ? differenceInDays(end, start) : 0;
                      const months = Math.max(1, Math.round(days / 30));
                      return months;
                    })()}
                  </div>
                  <div className="mt-1 text-[10px] text-gray-500 font-bold">
                    يتم تقريب المدة على أساس 30 يوم للشهر
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">سعر الشهر</label>
                  <input
                    type="number"
                    value={monthlyRateEdit}
                    onChange={(e) => {
                      const rate = e.target.value;
                      setMonthlyRateEdit(rate);
                      const start = newCheckIn ? new Date(`${newCheckIn}T00:00:00`) : null;
                      const end = newCheckOut ? new Date(`${newCheckOut}T00:00:00`) : null;
                      const days = start && end ? differenceInDays(end, start) : 0;
                      const months = Math.max(1, Math.round(days / 30));
                      const sub = (Number(rate || 0) * months) || 0;
                      setNewSubtotal(sub.toFixed(2));
                      const disc = Number(newDiscountAmount || 0);
                      const extras = Number(newExtrasAmount || 0);
                      const net = Math.max(0, sub - disc + extras);
                      const tax = includeTax ? Math.round(net * hotelTaxRate * 100) / 100 : 0;
                      setNewTaxAmount(tax.toFixed(2));
                      setNewTotalPrice((net + tax).toFixed(2));
                    }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <PieChart size={18} className="text-blue-600" />
                  احتساب الضريبة ({hotelTaxRate * 100}%)
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextInclude = !includeTax;
                    const sub = Number(newSubtotal);
                    const disc = Number(newDiscountAmount);
                    const extras = Number(newExtrasAmount);
                    const net = Math.max(0, sub - disc + extras);
                    const tax = nextInclude ? Math.round(net * hotelTaxRate * 100) / 100 : 0;
                    setIncludeTax(nextInclude);
                    setNewTaxAmount(tax.toFixed(2));
                    setNewTotalPrice((net + tax).toFixed(2));
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    includeTax ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      includeTax ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ الأساسي (قبل الخصم/الإضافة)</label>
                  <input
                    type="number"
                    value={newSubtotal}
                    readOnly
                    className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الضريبة</label>
                  <input
                    type="number"
                    value={newTaxAmount}
                    readOnly
                    className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الخصم</label>
                  <input
                    type="number"
                    value={newDiscountAmount}
                    onChange={(e) => {
                      const disc = Number(e.target.value || 0);
                      const sub = Number(newSubtotal || 0);
                      const extras = Number(newExtrasAmount || 0);
                      const net = Math.max(0, sub - disc + extras);
                      const tax = includeTax ? Math.round(net * hotelTaxRate * 100) / 100 : 0;
                      setNewDiscountAmount(e.target.value);
                      setNewTaxAmount(tax.toFixed(2));
                      setNewTotalPrice((net + tax).toFixed(2));
                    }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الإضافة</label>
                  <input
                    type="number"
                    value={newExtrasAmount}
                    onChange={(e) => {
                      const extras = Number(e.target.value || 0);
                      const sub = Number(newSubtotal || 0);
                      const disc = Number(newDiscountAmount || 0);
                      const net = Math.max(0, sub - disc + extras);
                      const tax = includeTax ? Math.round(net * hotelTaxRate * 100) / 100 : 0;
                      setNewExtrasAmount(e.target.value);
                      setNewTaxAmount(tax.toFixed(2));
                      setNewTotalPrice((net + tax).toFixed(2));
                    }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>
              </div>

              <div className="pt-2 border-t">
                <label className="block text-sm font-bold text-gray-900 mb-1">الإجمالي النهائي</label>
                <input
                  type="number"
                  value={newTotalPrice}
                  readOnly
                  className="w-full px-4 py-3 border-2 border-blue-100 rounded-xl bg-blue-50 text-blue-700 font-bold text-xl outline-none"
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-800">
                <p className="font-bold mb-1">تنبيه محاسبي هام:</p>
                <p>تعديل السعر سيؤدي لتحديث سجل الحجز، الفاتورة المرتبطة، والقيود المحاسبية لضمان توازن الحسابات.</p>
              </div>

              <div className="mt-6 flex gap-2 justify-end">
                <button 
                  type="button"
                  onClick={() => setShowEditPrice(false)} 
                  className="px-4 py-2 rounded-lg border hover:bg-gray-50 transition-colors"
                >
                  إلغاء
                </button>
                <button 
                  type="submit" 
                  disabled={loading} 
                  className="px-6 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                  حفظ وتحديث الفاتورة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <Edit className="text-amber-600" size={20} />
                <h3 className="text-xl font-bold text-gray-900">تعديل بيانات السند</h3>
              </div>
              <button onClick={() => setShowEditPaymentModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleUpdatePaymentSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ السند</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">البيان / الوصف</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                  placeholder="أدخل الوصف الجديد للسند..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">طريقة الدفع والحساب</label>
                <select
                  value={editPaymentMethodId}
                  onChange={(e) => setEditPaymentMethodId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none bg-white"
                  required
                >
                  <option value="">-- اختر طريقة الدفع --</option>
                  {paymentMethods.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-gray-500">
                  تغيير طريقة الدفع سيؤدي لتحديث القيد المحاسبي في حساب (الصندوق/البنك) المرتبط.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">نوع العملية (محاسبياً)</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditTransactionType('payment')}
                    className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${
                      editTransactionType === 'payment'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    دفعة سداد (AR)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTransactionType('advance_payment')}
                    className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${
                      editTransactionType === 'advance_payment'
                        ? 'bg-amber-50 border-amber-500 text-amber-700'
                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    عربون (L-ADV)
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-gray-500">
                  {editTransactionType === 'payment' 
                    ? 'يتم خصم المبلغ من مديونية العميل مباشرة.' 
                    : 'يتم تسجيل المبلغ كإيراد غير محقق (دفعة مقدمة).'}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ربط بالفاتورة</label>
                <select
                  value={selectedInvoiceId || ''}
                  onChange={(e) => setSelectedInvoiceId(e.target.value || null)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none bg-white"
                >
                  <option value="">-- غير مرتبط بفاتورة --</option>
                  {(activeInvoices || []).map((inv: any) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number} ({Number(inv.total_amount).toLocaleString()} ر.س) - {inv.status}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-gray-500">
                  يمكنك تغيير الفاتورة المرتبطة بهذا السند أو ربطه بفاتورة جديدة.
                </p>
              </div>

              <div className="mt-6 flex gap-2 justify-end">
                <button 
                  type="button"
                  onClick={() => setShowEditPaymentModal(false)} 
                  className="px-4 py-2 rounded-lg border hover:bg-gray-50 transition-colors"
                >
                  إلغاء
                </button>
                <button 
                  type="submit" 
                  disabled={loading} 
                  className="px-6 py-2 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700 transition-colors flex items-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
