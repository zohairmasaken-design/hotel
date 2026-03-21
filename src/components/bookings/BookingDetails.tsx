'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, addDays } from 'date-fns';
import { 
  ArrowLeft, Printer, Mail, MessageCircle, CreditCard, 
  CheckCircle, Check as CheckIcon, Banknote, Calendar, User, Home, FileText,
  AlertCircle, Plus, X, Loader2, LogIn, LogOut, Ban, Clock, Edit, Trash2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
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
  const isManager = role === 'manager';
  const [transactions, setTransactions] = useState(initialTransactions);
  const [invoices, setInvoices] = useState<any[]>(initialInvoices || []);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEditPaymentModal, setShowEditPaymentModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [showEditInvoiceModal, setShowEditInvoiceModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showInsuranceVoucher, setShowInsuranceVoucher] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showDelay, setShowDelay] = useState(false);
  const [newCheckIn, setNewCheckIn] = useState<string>(booking.check_in?.split('T')[0] || '');
  const [newCheckOut, setNewCheckOut] = useState<string>(booking.check_out?.split('T')[0] || '');
  const [delayDays, setDelayDays] = useState<number>(1);
  const canAdminEditDates = isAdmin && ['pending_deposit', 'confirmed', 'checked_in'].includes(booking.status);
  
  // Payment Form State
  const [amount, setAmount] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id || '');
  const [description, setDescription] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [paymentRequireInvoice, setPaymentRequireInvoice] = useState(false);

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
  const isExtensionInvoice = (inv: any) => typeof inv.invoice_number === 'string' && inv.invoice_number.includes('-EXT-');
  const hasPostedOrPaidInvoice = () => (invoices || []).some((inv: any) => ['posted', 'paid'].includes(inv.status));

  // Derived Financials
  const activeInvoices = invoices.filter((inv) => inv.status !== 'void');
  const totalAmount = activeInvoices.reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0);

  // Helper to safely get transaction type
  const getTransactionType = (txn: any) => {
    if (txn.transaction_type) return txn.transaction_type;
    
    // Identify Invoice Issue based on reference or description
    if (txn.reference_type === 'invoice' || txn.description?.includes('فاتورة مبيعات') || txn.description?.includes('Invoice')) {
        return 'invoice_issue';
    }

    // Identify Cancellation/Credit Note
    if (txn.transaction_type === 'credit_note' || txn.description?.includes('إلغاء') || txn.description?.includes('Credit Note')) {
        return 'credit_note';
    }

    return (txn.journal_lines?.[0]?.description?.includes('Advance') ? 'advance_payment' : 'payment');
  };

  const paidAmount = transactions
    .reduce((sum, t) => {
      const type = getTransactionType(t);
      
      // Ignore Invoice Issues (they create debt, they are not payments)
      if (type === 'invoice_issue') return sum;
      
      // Calculate amount from journal lines if available
      const debitValues = t.journal_lines?.map((l: any) => Number(l.debit) || 0) || [];
      const creditValues = t.journal_lines?.map((l: any) => Number(l.credit) || 0) || [];
      const debitAmount = debitValues.length > 0 ? Math.max(...debitValues) : 0;
      const creditAmount = creditValues.length > 0 ? Math.max(...creditValues) : 0;

      if (['payment', 'advance_payment'].includes(type)) {
        return sum + debitAmount;
      } else if (type === 'refund' || type === 'credit_note') {
         // Refunds and Credit Notes shouldn't necessarily reduce "Paid Amount" unless they are refunds of cash.
         // A Credit Note just reverses the Invoice (reduces debt).
         // A Refund (Debit AR/Cash?, Credit Cash) reduces cash.
         // If type is 'credit_note', it reverses revenue, not payment.
         if (type === 'refund') return sum - creditAmount;
         return sum;
      }
      return sum;
    }, 0);
  
  const remainingAmount = totalAmount - paidAmount;

  // Sync state with props
  React.useEffect(() => {
    setTransactions(initialTransactions);
    setInvoices(initialInvoices || []);
  }, [initialTransactions, initialInvoices]);

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
    if (!isExtensionInvoice(inv)) {
      alert('الفاتورة المحددة ليست فاتورة تمديد');
      return;
    }
    if (!confirm(`هل ترغب بإلغاء التمديد لهذه الفاتورة (${inv.invoice_number})؟\nسيتم عكس أثر التمديد (الفاتورة + القيد) وإرجاع تاريخ المغادرة لما قبل التمديد.`)) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc('cancel_extension_invoice', { p_invoice_id: inv.id });
      if (error) throw error;

      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'void' } : i));
      alert('تم إلغاء التمديد بنجاح');
      router.refresh();
    } catch (err: any) {
      alert('تعذر إلغاء التمديد: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  const handleUnpostInvoice = async (inv: any) => {
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
            *,
            account:accounts(code, name)
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

  const handlePostInvoice = async (inv: any) => {
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
        p_amount: Math.max(0, Math.round((Number(updatedInvoice.total_amount || 0) - Number(updatedInvoice.tax_amount || 0)) * 100) / 100),
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
            *,
            account:accounts(code, name)
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
        p_new_description: description
      });

      if (error) throw error;

      setShowEditPaymentModal(false);
      setEditingPayment(null);
      setDescription('');
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

  const cancelInvoice = async (inv: any) => {
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
    if (!inv?.id) return;
    if (!['draft', 'void'].includes(inv.status)) {
      alert('لا يمكن حذف الفاتورة إلا إذا كانت مسودة أو ملغاة. قم بإلغاء الترحيل/الإلغاء أولاً.');
      return;
    }
    if (!confirm(`هل ترغب بحذف الفاتورة نهائياً (${inv.invoice_number})؟`)) return;
    setLoading(true);
    try {
      const { data: relatedPayments } = await supabase
        .from('payments')
        .select('id')
        .eq('invoice_id', inv.id)
        .eq('status', 'posted');
      if (Array.isArray(relatedPayments) && relatedPayments.length > 0) {
        throw new Error('لا يمكن حذف الفاتورة لوجود سندات قبض مرحلة مرتبطة بها.');
      }

      const { data: linkedJEs } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('reference_type', 'invoice')
        .eq('reference_id', inv.id)
        .eq('status', 'posted')
        .limit(1);
      if (Array.isArray(linkedJEs) && linkedJEs.length > 0) {
        throw new Error('لا يمكن حذف الفاتورة لوجود قيد مرحل مرتبط بها. قم بإلغاء الترحيل أولاً.');
      }

      const { error: delErr } = await supabase.from('invoices').delete().eq('id', inv.id);
      if (delErr) throw delErr;

      setInvoices((prev) => prev.filter((i) => i.id !== inv.id));
      router.refresh();
      alert('تم حذف الفاتورة نهائياً');
    } catch (err: any) {
      console.error('Delete Invoice Error:', err);
      alert('تعذر حذف الفاتورة: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  const handleIssueInvoice = async () => {
    if (!confirm('هل أنت متأكد من إصدار الفاتورة الأساسية؟ سيتم إنشاء قيد محاسبي وترحيل الدين على العميل.')) return;
    
    setIsIssuing(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. Check/Create Invoice Record (Main Invoice)
      // Find existing main invoice or create one
      let targetInvoice = invoices.find(inv => !inv.invoice_number.includes('-EXT-')) || invoices[0];
      
      if (!targetInvoice) {
          const { data: newInvoice, error: invError } = await supabase
            .from('invoices')
            .insert({
              booking_id: booking.id,
              customer_id: booking.customer_id,
              invoice_number: String(((await supabase.from('invoices').select('*', { count: 'exact', head: true })).count || 0) + 1).padStart(4, '0'),
              subtotal: booking.subtotal,
              tax_amount: booking.tax_amount,
              discount_amount: booking.discount_amount, // Ensure these fields exist in booking or default to 0
              additional_services_amount: booking.additional_services?.reduce((acc: number, curr: any) => acc + (curr.amount || 0), 0) || 0,
              total_amount: booking.total_price, // Note: This might need adjustment if booking total includes extensions but we are issuing base invoice. 
              // However, typically the base booking structure holds the current state. 
              // If extensions happened, they have their own invoices. 
              // For safety, this function is primarily for the *initial* invoice.
              status: 'posted',
              invoice_date: new Date().toISOString()
            })
            .select()
            .single();

          if (invError) throw invError;
          targetInvoice = newInvoice;
          setInvoices(prev => [...prev, newInvoice]);
      } else if (targetInvoice.status === 'draft') {
          const { data: updatedInvoice, error: upError } = await supabase
            .from('invoices')
            .update({ status: 'posted', invoice_date: new Date().toISOString() })
            .eq('id', targetInvoice.id)
            .select()
            .single();
          
          if (upError) throw upError;
          targetInvoice = updatedInvoice;
          setInvoices(prev => prev.map(inv => inv.id === updatedInvoice.id ? updatedInvoice : inv));
      }

      // 2. Post Transaction (GL)
      const { error: txnError } = await supabase.rpc('post_transaction', {
        p_transaction_type: 'invoice_issue',
        p_source_type: 'invoice',
        p_source_id: targetInvoice.id,
        p_amount: targetInvoice.total_amount,
        p_customer_id: booking.customer_id,
        p_payment_method_id: null,
        p_transaction_date: today,
        p_description: `فاتورة مبيعات #${targetInvoice.invoice_number}`,
        p_tax_amount: targetInvoice.tax_amount || 0
      });

      if (txnError) throw txnError;

      // Fetch latest transactions
      const referenceIds = [booking.id, ...invoices.map(i => i.id), targetInvoice.id];

      const { data: newTxns } = await supabase
        .from('journal_entries')
        .select(`
          *,
          journal_lines(
            *,
            account:accounts(code, name)
          )
        `)
        .in('reference_id', referenceIds)
        .order('created_at', { ascending: false });

      if (newTxns) {
        setTransactions(newTxns);
      }

      alert('تم إصدار الفاتورة وترحيل القيد بنجاح');
      router.refresh();
      
    } catch (err: any) {
      console.error('Invoice Error:', err);
      alert('حدث خطأ أثناء إصدار الفاتورة: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setIsIssuing(false);
    }
  };

  const handleCheckIn = async () => {
    if (!confirm('تأكيد تسجيل الدخول؟ سيتم أيضاً إصدار الفاتورة وترحيل القيد على حساب العميل.')) return;
    setLoading(true);
    try {
        const today = new Date().toISOString().split('T')[0];

        // --- 1. Invoice & Accounting Logic ---
        let targetInvoice = invoices.find(inv => !inv.invoice_number.includes('-EXT-')) || invoices[0];

        // A. Create or Update Invoice
        if (!targetInvoice) {
            const { data: newInvoice, error: invError } = await supabase
              .from('invoices')
              .insert({
                booking_id: booking.id,
                customer_id: booking.customer_id,
                invoice_number: `INV-${booking.booking_number || booking.id.slice(0, 8).toUpperCase()}`,
                subtotal: booking.subtotal,
                tax_amount: booking.tax_amount,
                discount_amount: booking.discount_amount,
                additional_services_amount: booking.additional_services?.reduce((acc: number, curr: any) => acc + (curr.amount || 0), 0) || 0,
                total_amount: booking.total_price, // See note in handleIssueInvoice about extensions
                status: 'posted', // Set directly to posted
                invoice_date: new Date().toISOString()
              })
              .select()
              .single();

            if (invError) throw invError;
            targetInvoice = newInvoice;
            setInvoices(prev => [...prev, newInvoice]);
        } else if (targetInvoice.status === 'draft') {
            const { data: updatedInvoice, error: upError } = await supabase
              .from('invoices')
              .update({ status: 'posted', invoice_date: new Date().toISOString() })
              .eq('id', targetInvoice.id)
              .select()
              .single();
            
            if (upError) throw upError;
            targetInvoice = updatedInvoice;
            setInvoices(prev => prev.map(inv => inv.id === updatedInvoice.id ? updatedInvoice : inv));
        }

        // B. Post Transaction (if not already posted)
        // Check if we already have an 'invoice_issue' transaction for this invoice
        const hasInvoiceTxn = transactions.some(t => 
          t.reference_id === targetInvoice.id && 
          getTransactionType(t) === 'invoice_issue'
        );

        if (!hasInvoiceTxn) {
            const { error: txnError } = await supabase.rpc('post_transaction', {
              p_transaction_type: 'invoice_issue',
              p_source_type: 'invoice',
              p_source_id: targetInvoice.id,
              p_amount: Math.max(0, Math.round((Number(targetInvoice.total_amount || 0) - Number(targetInvoice.tax_amount || 0)) * 100) / 100),
              p_customer_id: booking.customer_id,
              p_payment_method_id: null,
              p_transaction_date: today,
              p_description: `فاتورة مبيعات #${targetInvoice.invoice_number}`,
              p_tax_amount: Number(targetInvoice.tax_amount || 0)
            });

            if (txnError) throw txnError;
        }

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
              invoice_id: targetInvoice.id
            }
          });
        } catch (eventError) {
          console.error('Failed to log check_in event:', eventError);
        }

        router.refresh();
        alert('تم تسجيل الدخول وإصدار الفاتورة بنجاح');
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
        const minusOne = new Date(outStr + 'T00:00:00');
        minusOne.setDate(minusOne.getDate() - 1);
        const minusOneStr = minusOne.toISOString().split('T')[0];
        if (minusOneStr !== todayStr) {
          const target = new Date(minusOneStr + 'T00:00:00');
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
    if (remainingAmount > 0) {
      if (!confirm(`المتبقي على العميل ${remainingAmount.toLocaleString()} ر.س. هل أنت متأكد من تسجيل الخروج قبل السداد الكامل؟`)) return;
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
              .select('id')
              .eq('transaction_type', 'advance_payment')
              .eq('reference_id', booking.id);
            const depositJeIds = (depositJEs || []).map((j: any) => j.id);
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

  const handleCancelBooking = async () => {
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
      const referenceIds = [booking.id, ...invoices.map(i => i.id)];

      const { data: newTxns } = await supabase
        .from('journal_entries')
        .select(`
          *,
          journal_lines(
            *,
            account:accounts(code, name)
          )
        `)
        .in('reference_id', referenceIds)
        .order('created_at', { ascending: false });

      if (newTxns) {
        setTransactions(newTxns);
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

  const waLink = `https://wa.me/${booking.customer?.phone}?text=${encodeURIComponent(
    `مرحباً ${booking.customer?.full_name}،\nتفاصيل حجزكم رقم ${booking.id.slice(0, 8)}:\nالوحدة: ${booking.unit?.unit_number}\nالمبلغ المتبقي: ${remainingAmount.toLocaleString('en-US')} ر.س\nشكراً لاختياركم لنا.`
  )}`;

  const mailLink = `mailto:${booking.customer?.email || ''}?subject=${encodeURIComponent(`تفاصيل الحجز #${booking.id.slice(0, 8)}`)}&body=${encodeURIComponent(
    `مرحباً ${booking.customer?.full_name}،\n\nتفاصيل حجزكم:\nرقم الحجز: ${booking.id}\nالوحدة: ${booking.unit?.unit_number}\nالمبلغ الإجمالي: ${totalAmount}\nالمبلغ المدفوع: ${paidAmount}\nالمتبقي: ${remainingAmount}\n\nشكراً لكم.`
  )}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/bookings-list" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft size={22} className="text-gray-900" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span>تفاصيل الحجز</span>
              <span className="hidden sm:inline-block text-xs sm:text-sm font-mono font-semibold px-2 py-0.5 rounded-full bg-gray-900 text-white">
                #{booking.id?.slice(0, 8)}
              </span>
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-gray-500">
              عرض حالة الحجز، بيانات النزيل، السجل المالي والعمليات المرتبطة بالحجز.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {['confirmed', 'checked_in'].includes(booking.status) && (
            <button
              onClick={() => setShowExtendModal(true)}
              className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs sm:text-sm"
            >
              <Clock size={18} />
              <span>تمديد الحجز</span>
            </button>
          )}

          {['confirmed', 'pending_deposit', 'checked_in'].includes(booking.status) && (
            <button 
              onClick={() => setShowCancelModal(true)}
              disabled={loading}
              className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs sm:text-sm disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Ban size={18} />}
              <span>إلغاء الحجز</span>
            </button>
          )}

          {booking.status === 'cancelled' && !isManager && (
            <button
              onClick={handleDeleteCancelledBooking}
              disabled={loading}
              className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-red-800 text-white rounded-lg hover:bg-red-900 transition-colors text-xs sm:text-sm disabled:opacity-50"
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
                className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-xs sm:text-sm disabled:opacity-50"
                title="انقر بعد توقيع محضر الاستلام"
              >
<LogIn size={18} />
                <span>تم توقيع الاستلام</span>
              </button>
              <Link 
                href={`/print/handover/${booking.id}`}
                target="_blank"
                className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-900 font-medium text-xs sm:text-sm transition-colors"
              >
                <Printer size={18} />
                <span>توقيع استلام</span>
              </Link>
            </>
          )}

          {booking.status === 'checked_in' && (
            <>
              <button 
                onClick={handleCheckOut}
                disabled={loading}
                className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-xs sm:text-sm disabled:opacity-50"
              >
                <LogOut size={18} />
                <span>تسجيل خروج</span>
              </button>
              <Link 
                href={`/print/return/${booking.id}`}
                target="_blank"
                className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-900 font-medium text-xs sm:text-sm transition-colors"
              >
                <Printer size={18} />
                <span>توقيع تسليم</span>
              </Link>
              <Link 
                href={`/print/handover/${booking.id}`}
                target="_blank"
                className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-900 font-medium text-xs sm:text-sm transition-colors"
              >
                <Printer size={18} />
                <span>توقيع استلام</span>
              </Link>
            </>
          )}

          {invoices.length > 0 ? (
             <Link 
               href={`/print/invoice/${invoices[0].id}`} // Link to main invoice by default in header, or maybe remove? Kept for convenience
               target="_blank"
               className="hidden sm:flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 text-xs sm:text-sm transition-colors"
             >
               <FileText size={18} />
               <span>طباعة الفاتورة الأساسية</span>
             </Link>
          ) : (
            <>
              <button 
                onClick={handleIssueInvoice}
                disabled={isIssuing}
                className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-xs sm:text-sm disabled:opacity-50"
              >
                {isIssuing ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
                <span>إصدار فاتورة</span>
              </button>
              
              {/* Preview Only */}
              <Link 
                href={`/print/invoice/${booking.id}`}
                target="_blank"
                className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 text-xs sm:text-sm transition-colors"
              >
                <Printer size={18} />
                <span>معاينة الفاتورة</span>
              </Link>
            </>
          )}

          <button 
            onClick={() => {
                setSelectedInvoiceId(null);
                setShowPaymentModal(true);
            }}
            className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-900 font-medium text-xs sm:text-sm transition-colors"
          >
            <CreditCard size={18} />
            <span>تسجيل دفعة</span>
          </button>
          <button 
            onClick={() => setShowInsuranceVoucher(true)}
            className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-900 font-medium text-xs sm:text-sm transition-colors"
            title="سند التأمين (منفصل عن الفواتير)"
          >
            <Banknote size={18} />
            <span>سند التأمين</span>
          </button>

          <Link 
            href={`/print/contract/${booking.id}`}
            target="_blank"
            className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-900 font-medium text-xs sm:text-sm transition-colors"
          >
            <Printer size={18} />
            <span>طباعة العقد</span>
          </Link>
        </div>
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="lg:col-span-2 space-y-4 lg:space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4 sm:mb-6">
              <h2 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
                <Calendar className="text-blue-600" size={20} />
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
                    className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-900 font-medium text-xs"
                  >
                    تعديل التواريخ (أدمن)
                  </button>
                  <button
                    onClick={() => setShowDelay(true)}
                    className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-900 font-medium text-xs"
                  >
                    تأخير الحجز (أدمن)
                  </button>
                </>
              )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="text-xs sm:text-sm text-gray-900 font-semibold block mb-1">العميل</label>
                <div className="font-bold text-base sm:text-lg text-gray-900">{booking.customer?.full_name}</div>
                <div className="text-xs sm:text-sm text-gray-900 font-mono font-medium">{booking.customer?.phone}</div>
              </div>
              <div>
                <label className="text-xs sm:text-sm text-gray-900 font-semibold block mb-1">الوحدة</label>
                <div className="font-bold text-base sm:text-lg text-gray-900 flex items-center gap-2">
                  <Home size={16} className="text-gray-700" />
                  {booking.unit?.unit_number}
                </div>
                <div className="text-xs sm:text-sm text-gray-900 font-medium">{booking.unit?.unit_type?.name}</div>
              </div>
              <div>
                <label className="text-xs sm:text-sm text-gray-900 font-semibold block mb-1">تاريخ الوصول</label>
                <div className="font-bold text-base sm:text-lg text-gray-900">{format(new Date(booking.check_in), 'dd/MM/yyyy')}</div>
              </div>
              <div>
                <label className="text-xs sm:text-sm text-gray-900 font-semibold block mb-1">تاريخ المغادرة</label>
                <div className="font-bold text-base sm:text-lg text-gray-900">
                  {(() => {
                    const outISO = String(booking.check_out || '').split('T')[0];
                    if (!outISO) return '-';
                    const outDate = new Date(`${outISO}T00:00:00`);
                    if (booking.booking_type !== 'daily') {
                      outDate.setDate(outDate.getDate() - 1);
                    }
                    return format(outDate, 'dd/MM/yyyy');
                  })()}
                </div>
              </div>
            </div>

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

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2">
                <FileText className="text-blue-600" size={20} />
                الفواتير
            </h2>
            <div className="space-y-3">
                {invoices.length > 0 ? (
                    invoices.map((inv) => (
                        <div key={inv.id} className="border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-gray-50 transition-colors">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-bold text-gray-900 font-mono">{inv.invoice_number}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                                        inv.status === 'paid' ? 'bg-green-100 text-green-800' : 
                                        inv.status === 'posted' ? 'bg-blue-100 text-blue-800' : 
                                        'bg-gray-100 text-gray-800'
                                    }`}>
                                        {inv.status === 'paid' ? 'مدفوعة' : inv.status === 'posted' ? 'مرحلة' : 'مسودة'}
                                    </span>
                                </div>
                                <div className="text-sm text-gray-500">
                                   {format(new Date(inv.invoice_date || inv.created_at), 'dd/MM/yyyy')}
                                </div>
                            </div>
                            <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                                <div className="text-right">
                                     <div className="font-bold text-lg text-gray-900">
                                        {inv.total_amount?.toLocaleString()} <span className="text-xs">ر.س</span>
                                     </div>
                                </div>
                                <div className="flex gap-2">
                                     <Link 
                                       href={`/print/invoice/${inv.id}`}
                                       target="_blank"
                                       className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                       title="طباعة"
                                     >
                                       <Printer size={20} />
                                     </Link>
                                     {inv.status === 'draft' && !isManager && (
                                       <button
                                         onClick={() => openInvoiceEdit(inv)}
                                         className="px-3 py-1.5 bg-white border border-gray-300 text-gray-900 text-sm font-bold rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1"
                                         title="تعديل الفاتورة"
                                       >
                                         <Edit size={14} />
                                         تعديل
                                       </button>
                                     )}
                                     {inv.status === 'draft' && (
                                       <button 
                                        onClick={() => handlePostInvoice(inv)}
                                         disabled={isIssuing}
                                         className="px-3 py-1.5 bg-gray-900 text-white text-sm font-bold rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-1"
                                       >
                                         {isIssuing ? <Loader2 className="animate-spin" size={14} /> : <FileText size={14} />}
                                         ترحيل الفاتورة
                                       </button>
                                     )}
                                     {inv.status !== 'paid' && inv.status !== 'draft' && (
                                       <button 
                                         onClick={() => {
                                           setSelectedInvoiceId(inv.id);
                                           setAmount(inv.total_amount.toString());
                                           setShowPaymentModal(true);
                                         }}
                                         className="px-3 py-1.5 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 transition-colors"
                                       >
                                         سداد
                                       </button>
                                     )}
                                     {inv.status === 'posted' && !isManager && (
                                       <button
                                         onClick={() => handleUnpostInvoice(inv)}
                                         disabled={loading}
                                         className="px-3 py-1.5 bg-amber-500 text-white text-sm font-bold rounded-lg hover:bg-amber-600 transition-colors flex items-center gap-1"
                                         title="إلغاء الترحيل"
                                       >
                                         {loading ? <Loader2 className="animate-spin" size={14} /> : <X size={14} />}
                                         إلغاء الترحيل
                                       </button>
                                     )}
                                     {isExtensionInvoice(inv) && inv.status !== 'void' && !isManager && (
                                       <button
                                         onClick={() => handleCancelExtension(inv)}
                                         className="px-3 py-1.5 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 transition-colors"
                                         title="إلغاء التمديد"
                                       >
                                         إلغاء التمديد
                                       </button>
                                     )}
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                     <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                        لا توجد فواتير مصدرة لهذا الحجز
                     </div>
                )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
              <Banknote className="text-blue-600" size={20} />
              سجل العمليات المالية
            </h2>
            
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-gray-100 text-gray-900 font-bold">
                  <tr>
                    <th className="px-2 sm:px-4 py-2 text-right">التاريخ</th>
                    <th className="px-2 sm:px-4 py-2 text-right">النوع</th>
                    <th className="px-2 sm:px-4 py-2 text-right">الوصف</th>
                    <th className="px-2 sm:px-4 py-2 text-right">المبلغ</th>
                    <th className="px-2 sm:px-4 py-2 text-center">الطباعة</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transactions.map((txn: any) => {
                     const amounts = txn.journal_lines?.map((l: any) => l.debit || 0) || [];
                     const amount = amounts.length > 0 ? Math.max(...amounts) : 0;
                     const type = getTransactionType(txn);

                     return (
                      <tr key={txn.id}>
                        <td className="px-2 sm:px-4 py-2.5 sm:py-3 text-gray-900 font-medium">{format(new Date(txn.entry_date), 'dd/MM/yyyy')}</td>
                        <td className="px-2 sm:px-4 py-2.5 sm:py-3 text-gray-900 font-medium">
                          {type === 'advance_payment' ? 'عربون' :
                           type === 'payment' ? 'سداد' :
                           type === 'refund' ? 'استرجاع' : 
                           type === 'invoice_issue' ? 'إصدار فاتورة' : type}
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
                                    <Link 
                                      href={`/print/invoice/${inv.id}`}
                                      target="_blank"
                                      className="inline-flex items-center p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                      title="طباعة الفاتورة"
                                    >
                                      <Printer size={18} />
                                    </Link>
                                    {!isManager && (
                                      <>
                                        {inv.status === 'draft' && (
                                          <button
                                            onClick={() => openInvoiceEdit(inv)}
                                            disabled={loading}
                                            className="inline-flex items-center p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                            title="تعديل الفاتورة"
                                          >
                                            <Edit size={16} />
                                          </button>
                                        )}
                                        {inv.status === 'posted' && (
                                          <button
                                            onClick={() => handleUnpostInvoice(inv)}
                                            disabled={loading}
                                            className="inline-flex items-center p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                            title="إلغاء ترحيل الفاتورة"
                                          >
                                            {loading ? <Loader2 className="animate-spin" size={16} /> : <X size={16} />}
                                          </button>
                                        )}
                                        {inv.status !== 'paid' && (
                                          <button
                                            onClick={() => cancelInvoice(inv)}
                                            disabled={loading}
                                            className="inline-flex items-center p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="إلغاء الفاتورة"
                                          >
                                            <Ban size={16} />
                                          </button>
                                        )}
                                        {['draft', 'void'].includes(inv.status) && (
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
                                    )}
                                  </>
                                );
                              })()
                            ) : ['payment', 'advance_payment'].includes(type) && paymentJournalMap[txn.id] ? (
                              <>
                                <Link 
                                  href={`/print/receipt/${paymentJournalMap[txn.id]}`}
                                  target="_blank"
                                  className="inline-flex items-center p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="طباعة سند القبض"
                                >
                                  <Printer size={18} />
                                </Link>
                                {!isManager && (
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
                      <td colSpan={5} className="px-4 py-6 text-center text-gray-900 font-medium">
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
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2">
              <Banknote className="text-emerald-600" size={20} />
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
                    <div key={ev.id} className="border border-gray-200 rounded-lg p-3 sm:p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">{label}</span>
                          <span className="text-gray-500 text-xs">{d}</span>
                        </div>
                        <div className="font-bold text-gray-900">{amt.toLocaleString()} <span className="text-xs">ر.س</span></div>
                        {ev?.payload?.description && <div className="text-xs text-gray-600">{ev.payload.description}</div>}
                      </div>
                      <Link
                        href={`/print/insurance-voucher/${ev.id}`}
                        target="_blank"
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="طباعة السند"
                      >
                        <Printer size={20} />
                      </Link>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                لا توجد سندات تأمين منفصلة لهذا الحجز
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-4 sm:mb-6">الملخص المالي</h2>
            
            <div className="space-y-4">
              <div className="space-y-2 pb-4 border-b border-gray-100 text-xs sm:text-sm">
                <div className="flex justify-between items-center text-gray-600">
                  <span>المجموع الفرعي</span>
                  <span className="font-medium">{booking.subtotal?.toLocaleString('en-US')} <span className="text-xs">ر.س</span></span>
                </div>

                {booking.additional_services && Array.isArray(booking.additional_services) && booking.additional_services.length > 0 && (
                  <div className="flex justify-between items-center text-gray-600">
                    <span>خدمات إضافية</span>
                    <span className="font-medium text-green-600">
                        +{(booking.additional_services.reduce((acc: number, curr: any) => acc + (curr.amount || 0), 0)).toLocaleString('en-US')} <span className="text-xs">ر.س</span>
                    </span>
                  </div>
                )}

                {booking.discount_amount > 0 && (
                  <div className="flex justify-between items-center text-gray-600">
                    <span>الخصم</span>
                    <span className="font-medium text-red-600">-{booking.discount_amount?.toLocaleString('en-US')} <span className="text-xs">ر.س</span></span>
                  </div>
                )}

                <div className="flex justify-between items-center text-gray-600">
                  <span>الضريبة (15%)</span>
                  <span className="font-medium">{booking.tax_amount?.toLocaleString('en-US')} <span className="text-xs">ر.س</span></span>
                </div>
              </div>

              <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                <span className="text-gray-900 font-bold">إجمالي الحجز</span>
                <span className="font-bold text-lg sm:text-xl text-gray-900">{totalAmount.toLocaleString('en-US')} <span className="text-xs sm:text-sm font-bold text-gray-900">ر.س</span></span>
              </div>
              
              <div className="flex justify-between items-center text-green-800">
                <span className="flex items-center gap-2 font-bold">
                  <CheckCircle size={16} />
                  المدفوع
                </span>
                <span className="font-bold text-base sm:text-lg">{paidAmount.toLocaleString('en-US')} <span className="text-xs sm:text-sm font-bold">ر.س</span></span>
              </div>

              <div className="flex justify-between items-center text-red-800 pt-4 border-t border-gray-100">
                <span className="font-bold">المتبقي</span>
                <span className="font-bold text-xl sm:text-2xl">{remainingAmount.toLocaleString('en-US')} <span className="text-xs sm:text-sm font-bold">ر.س</span></span>
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
                  className="w-full mt-4 sm:mt-6 bg-blue-600 hover:bg-blue-700 text-white py-2.5 sm:py-3 rounded-xl font-bold shadow-sm transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  <CreditCard size={20} />
                  سداد دفعة / عربون
                </button>
              )}
              
              {remainingAmount <= 0 && (
                <div className="mt-6 bg-green-50 text-green-800 py-3 rounded-xl text-center font-bold border border-green-200">
                  تم السداد بالكامل
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    {/* removed manual entry modal */}
    

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">تسجيل دفعة جديدة</h3>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setPaymentRequireInvoice(false);
                  setSelectedInvoiceId(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              {paymentRequireInvoice && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الفاتورة (إلزامي)</label>
                  <select
                    value={selectedInvoiceId || ''}
                    onChange={(e) => setSelectedInvoiceId(e.target.value || null)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    required
                  >
                    <option value="" disabled>اختر الفاتورة</option>
                    {(activeInvoices || []).map((inv: any) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_number} — {inv.status}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ (ر.س)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-lg"
                  placeholder="0.00"
                  required
                  min="1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ الدفع</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">رقم مرجعي (اختياري)</label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                    placeholder="Ref-123"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">طريقة الدفع</label>
                {paymentMethods.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {paymentMethods.map((method) => (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setPaymentMethodId(method.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                          paymentMethodId === method.id
                            ? 'bg-blue-50 border-blue-500 text-blue-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {method.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-red-500 text-sm p-2 bg-red-50 rounded-lg border border-red-100">
                    لا توجد طرق دفع متاحة. يرجى إضافة طرق دفع في الإعدادات.
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
                  placeholder="وصف العملية..."
                />
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="animate-spin" /> : <CheckCircle />}
                  تأكيد الدفع
                </button>
              </div>
            </form>
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
