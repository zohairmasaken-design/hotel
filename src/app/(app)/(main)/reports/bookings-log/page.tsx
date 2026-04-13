'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { List, Calendar, Download, ArrowRight, Trash2, Loader2, FileText } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import RoleGate from '@/components/auth/RoleGate';

const formatSar = (n: number) =>
  `${(Number.isFinite(n) ? n : 0).toLocaleString('ar-SA', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })} ر.س`;

const formatSarEn = (n: number) =>
  `${(Number.isFinite(n) ? n : 0).toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })} SR`;

/** تقصير التاريخ إلى YY-MM-DD */
const formatShortDate = (ymd: string) => {
  if (!ymd) return '-';
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  const year = parts[0].slice(-2);
  return `${year}-${parts[1]}-${parts[2]}`;
};

/** تقصير اسم العميل */
const formatShortName = (name: string) => {
  if (!name) return '-';
  if (name.length > 25) return name.substring(0, 22) + '...';
  return name;
};

/** ترجمة الحالة إلى العربية */
const formatStatusAr = (status: string) => {
  const s = String(status || '').toLowerCase();
  const map: Record<string, string> = {
    confirmed: 'مؤكد',
    deposit_paid: 'عربون مدفوع',
    checked_in: 'تم الدخول',
    checked_out: 'تم الخروج',
    completed: 'مكتمل',
    canceled: 'ملغي',
    cancelled: 'ملغي',
    no_show: 'عدم حضور',
  };
  return map[s] || s;
};

/** حساب تاريخ استحقاق الدفعة القادمة */
const calculateNextPaymentDue = (
  checkIn: string,
  checkOut: string,
  totalNights: number,
  bookingType: string,
  invoiceTotal: number,
  paidTotal: number
) => {
  const balance = invoiceTotal - paidTotal;
  if (balance <= 0.01) return 'مدفوع';

  const start = new Date(checkIn);
  const end = new Date(checkOut);

  // إذا كان الحجز طويل الأمد (شهري أو أكثر من 28 ليلة)
  if (bookingType === 'monthly' || totalNights >= 28) {
    // حساب عدد الأشهر الإجمالي للحجز
    let totalMonths = 0;
    let tempDate = new Date(start);
    while (tempDate < end) {
      totalMonths++;
      tempDate.setMonth(tempDate.getMonth() + 1);
    }
    if (totalMonths === 0) totalMonths = 1;

    const monthlyRate = invoiceTotal / totalMonths;

    // كم شهر تم تغطيته بالكامل بالدفع؟
    const monthsPaid = Math.floor(paidTotal / monthlyRate);

    // تاريخ استحقاق أول شهر لم يدفع بالكامل
    let nextDueDate = new Date(start);
    nextDueDate.setMonth(nextDueDate.getMonth() + monthsPaid);

    if (nextDueDate >= end) return 'مستحق (آخر دفعة)';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (nextDueDate <= today) return 'مستحق حالاً';

    return nextDueDate.toISOString().split('T')[0];
  }

  // للحجوزات القصيرة
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start > today) return checkIn;
  return 'مستحق';
};

/** حساب تفاصيل الاستحقاقات (دفعات شهرية) */
const calculateInstallments = (
  checkIn: string,
  checkOut: string,
  totalNights: number,
  invoiceTotal: number,
  paidTotal: number
) => {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  
  // حساب عدد الأشهر
  let totalMonths = 0;
  let tempDate = new Date(start);
  while (tempDate < end) {
    totalMonths++;
    tempDate.setMonth(tempDate.getMonth() + 1);
  }
  if (totalMonths === 0) totalMonths = 1;

  const monthlyRate = invoiceTotal / totalMonths;
  let remainingPaid = paidTotal;
  const installments = [];

  for (let i = 0; i < totalMonths; i++) {
    const dueDate = new Date(start);
    dueDate.setMonth(dueDate.getMonth() + i);
    
    const installmentAmount = (i === totalMonths - 1) 
      ? invoiceTotal - (monthlyRate * (totalMonths - 1)) // الدفعة الأخيرة تضمن تغطية الفروقات
      : monthlyRate;

    const amountPaidForThis = Math.min(remainingPaid, installmentAmount);
    remainingPaid -= amountPaidForThis;

    installments.push({
      number: i + 1,
      dueDate: dueDate.toISOString().split('T')[0],
      amount: installmentAmount,
      paid: amountPaidForThis,
      isFullyPaid: amountPaidForThis >= installmentAmount - 0.01,
      isPartiallyPaid: amountPaidForThis > 0 && amountPaidForThis < installmentAmount - 0.01
    });
  }

  return installments;
};

interface Row {
  id: string;
  customer_id: string | null;
  customer_name: string;
  phone?: string;
  email?: string;
  /** يوجد صف في customer_accounts (نفس مسار كشف الحساب قبل جلب الأرصدة) */
  has_customer_account: boolean;
  hotel_id?: string;
  hotel_name?: string;
  unit_number?: string;
  unit_type_name?: string;
  check_in: string;
  check_out: string;
  /** ليالي الإقامة الكاملة للحجز (من قاعدة البيانات أو الفرق بين الدخول والخروج) */
  total_booking_nights: number;
  /** ليالي تقع ضمن فترة التقرير المحددة (تُستخدم في مجموع الليالي) */
  nights_in_period: number;
  /** تاريخ استحقاق الدفعة القادمة */
  next_payment_due: string | null;
  /** إجمالي الفاتورة: دائماً من الفواتير (أو إجمالي الحجز عند الاحتياط) */
  invoice_total: number;
  /** المدفوع: من كشف الحساب (دائن AR + عربون L-ADV للحجز) أو احتياطياً من المدفوعات */
  paid_total: number;
  /** المتبقي: إجمالي الفاتورة − المدفوع (بحد أدنى صفر) */
  balance: number;
  /** المدفوع والمتبقي مأخوذان من القيود عند وجود حساب ذمم */
  amounts_from_ledger: boolean;
  /** عدد الفواتير المرتبطة بالحجز (يشمل فواتير التمديد) */
  invoice_count: number;
  status: string;
}

export default function BookingsLogReportPage() {
  const { role } = useUserRole();
  const isAdmin = role === 'admin';

  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedHotelId, setSelectedHotelId] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [printMode, setPrintMode] = useState<'standard' | 'installments'>('standard');

  useEffect(() => {
    fetchReport();
  }, []);

  const handlePrint = (mode: 'standard' | 'installments') => {
    setPrintMode(mode);
    // ننتظر قليلاً للتأكد من تحديث الحالة وتطبيق الفئات قبل الطباعة
    setTimeout(() => {
      window.print();
    }, 200);
  };

  /** تحليل YYYY-MM-DD كتاريخ تقويم محلي لتفادي إزاحة اليوم بسبب UTC في `new Date('...')`. */
  const parseLocalYmd = (raw: string) => {
    const part = String(raw || '').split('T')[0];
    const [y, m, d] = part.split('-').map((x) => parseInt(x, 10));
    if (!y || !m || !d) return new Date(NaN);
    return new Date(y, m - 1, d);
  };

  const diffCalendarNights = (start: string, end: string) => {
    const a = parseLocalYmd(start);
    const b = parseLocalYmd(end);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
    const days = Math.round((b.getTime() - a.getTime()) / 86400000);
    return Math.max(0, days);
  };

  const overlapNights = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
    const s = aStart > bStart ? aStart : bStart;
    const e = aEnd < bEnd ? aEnd : bEnd;
    return diffCalendarNights(s, e);
  };

  const fetchIdChunks = (ids: string[], size: number) => {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
    return chunks;
  };

  const fetchReport = async () => {
    setLoading(true);
    try {
      const { data: bookings, error } = await supabase
        .from('bookings')
        .select(`
          id,
          customer_id,
          check_in,
          check_out,
          nights,
          status,
          total_price,
          booking_type,
          unit:units(unit_number, unit_types(name), hotel:hotels(id, name)),
          invoices(id, total_amount, status)
        `)
        .lte('check_in', endDate)
        .gt('check_out', startDate);

      if (error) throw error;

      const customerIdSet = new Set<string>();
      (bookings || []).forEach((b: any) => {
        if (b?.customer_id) customerIdSet.add(String(b.customer_id));
      });
      const customerIds = [...customerIdSet];

      const contactById: Record<string, { full_name: string; phone?: string; email?: string }> = {};
      const hasAccountByCustomerId: Record<string, boolean> = {};

      const idChunkSize = 120;
      await Promise.all([
        (async () => {
          for (const chunk of fetchIdChunks(customerIds, idChunkSize)) {
            const { data: custs, error: cErr } = await supabase
              .from('customers')
              .select('id, full_name, phone, email')
              .in('id', chunk);
            if (cErr) throw cErr;
            (custs || []).forEach((c: any) => {
              contactById[String(c.id)] = {
                full_name: c.full_name || 'بدون اسم',
                phone: c.phone || undefined,
                email: c.email || undefined,
              };
            });
          }
        })(),
        (async () => {
          for (const chunk of fetchIdChunks(customerIds, idChunkSize)) {
            const { data: accRows, error: aErr } = await supabase
              .from('customer_accounts')
              .select('customer_id')
              .in('customer_id', chunk);
            if (aErr) throw aErr;
            (accRows || []).forEach((row: any) => {
              if (row?.customer_id) hasAccountByCustomerId[String(row.customer_id)] = true;
            });
          }
        })(),
      ]);

      const bookingList = bookings || [];

      const needsInvoiceFallback = (b: any) => {
        const cid = b?.customer_id ? String(b.customer_id) : null;
        return !cid || !hasAccountByCustomerId[cid];
      };

      const ledgerByBooking: Record<string, { debit: number; credit: number }> = {};
      const bookingIds = bookingList.map((b: any) => String(b.id));
      try {
        for (const chunk of fetchIdChunks(bookingIds, 80)) {
          const { data: ledgerRows, error: ledgerErr } = await supabase.rpc(
            'get_booking_ledger_ar_totals_for_bookings_log',
            { p_booking_ids: chunk }
          );
          if (ledgerErr) throw ledgerErr;
          (ledgerRows || []).forEach((row: any) => {
            const bid = String(row.booking_id || '');
            if (!bid) return;
            ledgerByBooking[bid] = {
              debit: Number(row.total_debit || 0),
              credit: Number(row.total_credit || 0),
            };
          });
        }
      } catch (ledgerRpcErr) {
        console.warn(
          'تقرير سجل الحجوزات: تعذر جلب أرصدة الدفتر (تأكد من تنفيذ get_booking_ledger_ar_totals_for_bookings_log في قاعدة البيانات). سيتم استخدام الفواتير.',
          ledgerRpcErr
        );
      }

      const invoiceIdSet = new Set<string>();
      bookingList.forEach((b: any) => {
        if (!needsInvoiceFallback(b)) return;
        (b.invoices || []).forEach((inv: any) => {
          if (inv?.id && inv.status !== 'void') invoiceIdSet.add(String(inv.id));
        });
      });

      const paidByInvoice: Record<string, number> = {};
      const invoiceIds = [...invoiceIdSet];
      const payChunkSize = 150;
      for (let i = 0; i < invoiceIds.length; i += payChunkSize) {
        const chunk = invoiceIds.slice(i, i + payChunkSize);
        const { data: pays, error: payErr } = await supabase
          .from('payments')
          .select('invoice_id, amount')
          .in('invoice_id', chunk)
          .eq('status', 'posted');
        if (payErr) throw payErr;
        (pays || []).forEach((p: any) => {
          const k = String(p.invoice_id || '');
          if (!k) return;
          paidByInvoice[k] = (paidByInvoice[k] || 0) + Number(p.amount || 0);
        });
      }

      const mapped: Row[] = bookingList.map((b: any) => {
        const checkInISO = String(b.check_in || '').split('T')[0];
        const checkOutISO = String(b.check_out || '').split('T')[0];
        const nightsInPeriod = overlapNights(startDate, endDate, checkInISO, checkOutISO);
        const fromDb = b.nights;
        const totalBookingNights =
          typeof fromDb === 'number' && fromDb >= 0
            ? fromDb
            : diffCalendarNights(checkInISO, checkOutISO);

        const cid = b.customer_id ? String(b.customer_id) : null;
        const hasAr = cid ? !!hasAccountByCustomerId[cid] : false;
        const ledger = ledgerByBooking[String(b.id)];

        const activeInvoices = (b.invoices || []).filter((inv: any) => inv?.status !== 'void');
        let invoiceTotal = activeInvoices.reduce(
          (s: number, inv: any) => s + Number(inv.total_amount || 0),
          0
        );
        if (activeInvoices.length === 0) {
          invoiceTotal = Number(b.total_price || 0);
        }

        let paidSum: number;
        let balance: number;
        let amountsFromLedger = false;

        if (hasAr && ledger) {
          amountsFromLedger = true;
          paidSum = ledger.credit;
          balance = Math.max(0, invoiceTotal - paidSum);
        } else {
          paidSum = 0;
          activeInvoices.forEach((inv: any) => {
            const invTotal = Number(inv.total_amount || 0);
            const rawPaid = paidByInvoice[String(inv.id)] || 0;
            paidSum += Math.min(rawPaid, invTotal);
          });
          if (activeInvoices.length === 0) {
            paidSum = 0;
          }
          balance = Math.max(0, invoiceTotal - paidSum);
        }

        const contact = cid ? contactById[cid] : undefined;

        return {
          id: b.id,
          customer_id: cid,
          customer_name: contact?.full_name || 'بدون عميل',
          phone: contact?.phone || '',
          email: contact?.email,
          has_customer_account: cid ? !!hasAccountByCustomerId[cid] : false,
          hotel_id: b.unit?.hotel?.id || '',
          hotel_name: b.unit?.hotel?.name || '',
          unit_number: b.unit?.unit_number || '',
          unit_type_name: b.unit?.unit_types?.name || '',
          check_in: checkInISO,
          check_out: checkOutISO,
          total_booking_nights: totalBookingNights,
          nights_in_period: nightsInPeriod,
          next_payment_due: calculateNextPaymentDue(
            checkInISO,
            checkOutISO,
            totalBookingNights,
            b.booking_type || '',
            invoiceTotal,
            paidSum
          ),
          invoice_total: invoiceTotal,
          paid_total: paidSum,
          balance,
          amounts_from_ledger: amountsFromLedger,
          invoice_count: activeInvoices.length,
          status: b.status || '',
        };
      });

      setRows(mapped);
    } catch (err: any) {
      console.error('Error loading bookings log:', err);
      alert('حدث خطأ أثناء تحميل تقرير سجل الحجوزات');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCancelled = async (bookingId: string) => {
    if (!isAdmin) {
      alert('ليس لديك صلاحية الحذف النهائي');
      return;
    }

    if (!confirm('هل أنت متأكد من حذف الحجز الملغي نهائياً؟ سيتم حذف الحجز والفواتير والمدفوعات والقيود المرتبطة.')) return;

    setDeletingId(bookingId);
    try {
      const { error } = await supabase.rpc('delete_cancelled_booking_fully', {
        p_booking_id: bookingId,
      });

      if (error) throw error;

      setRows((prev) => prev.filter((r) => r.id !== bookingId));
      alert('تم حذف الحجز نهائياً');
      fetchReport();
    } catch (err: any) {
      console.error('Delete cancelled booking error:', err);
      alert('تعذر حذف الحجز: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setDeletingId(null);
    }
  };

  const hotelOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      if (r.hotel_id) map.set(r.hotel_id, r.hotel_name || 'غير معروف');
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'ar'));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const t = searchText.trim();
    return rows.filter((r) => {
      if (selectedHotelId !== 'all' && r.hotel_id !== selectedHotelId) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;

      if (t) {
        const inName = (r.customer_name || '').includes(t);
        const inPhone = (r.phone || '').includes(t);
        const inEmail = (r.email || '').includes(t);
        const inUnit = (r.unit_number || '').includes(t);
        if (!inName && !inPhone && !inEmail && !inUnit) return false;
      }

      return true;
    });
  }, [rows, selectedHotelId, statusFilter, searchText]);

  const totals = useMemo(() => {
    const count = filteredRows.length;
    const nights = filteredRows.reduce((s, r) => s + Number(r.nights_in_period || 0), 0);
    const invoiceSum = filteredRows.reduce((s, r) => s + Number(r.invoice_total || 0), 0);
    const paidSum = filteredRows.reduce((s, r) => s + Number(r.paid_total || 0), 0);
    const balanceSum = filteredRows.reduce((s, r) => s + Number(r.balance || 0), 0);
    return { count, nights, invoiceSum, paidSum, balanceSum };
  }, [filteredRows]);

  const bookingStats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];

    let checkedOut = 0;
    let current = 0;
    let upcoming = 0;

    filteredRows.forEach((r) => {
      const checkIn = String(r.check_in || '').split('T')[0];
      const checkOut = String(r.check_out || '').split('T')[0];

      if (!checkIn || !checkOut) return;

      if (checkOut <= today) {
        checkedOut++;
      } else if (checkIn <= today && checkOut > today) {
        current++;
      } else if (checkIn > today) {
        upcoming++;
      }
    });

    const total = filteredRows.length;
    const occupancyRate = total > 0 ? (current / total) * 100 : 0;

    return {
      total,
      checkedOut,
      current,
      upcoming,
      occupancyRate,
    };
  }, [filteredRows]);

  return (
    <RoleGate allow={['admin', 'manager', 'accountant', 'marketing', 'receptionist']}>
      <div className={printMode === 'standard' ? 'print-mode-standard' : 'print-mode-installments'}>
        <style>{`
  .screen-only { display: block; }
  .print-only { display: none; }
  .print-standard-only { display: none; }
  .print-installments-only { display: none; }

  @media print {
    @page {
      size: A4 portrait;
      margin: 12mm;
    }

    .screen-only { display: none !important; }
    
    /* التحكم في أي تخطيط يظهر بناءً على الكلاس الأب */
    .print-mode-standard .print-standard-only { display: block !important; }
    .print-mode-standard .print-installments-only { display: none !important; }
    
    .print-mode-installments .print-installments-only { display: block !important; }
    .print-mode-installments .print-standard-only { display: none !important; }

    header, aside, nav, .sticky, .fixed {
      display: none !important;
    }

    html, body {
      background: #ffffff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-family: Arial, "Tahoma", sans-serif;
      color: #111827;
    }

    .print-shell {
      width: 100%;
    }

    .print-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      border-bottom: 2px solid #dbe3f0;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }

    .print-title {
      font-size: 24px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 4px 0;
      line-height: 1.2;
    }

    .print-sub {
      color: #475569;
      font-size: 12px;
      margin: 0;
      line-height: 1.7;
    }

    .print-badge {
      border: 1px solid #dbe3f0;
      background: #f8fafc;
      border-radius: 10px;
      padding: 8px 10px;
      min-width: 150px;
    }

    .print-badge-label {
      font-size: 10px;
      color: #64748b;
      margin-bottom: 3px;
    }

    .print-badge-value {
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
    }

    .print-filters {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }

    .print-filter-card {
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      border-radius: 10px;
      padding: 8px 10px;
    }

    .print-filter-label {
      font-size: 10px;
      color: #64748b;
      margin-bottom: 3px;
    }

    .print-filter-value {
      font-size: 12px;
      font-weight: 700;
      color: #0f172a;
      word-break: break-word;
    }

    .print-cards {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }

    .print-card {
      border: 1px solid #dbe3f0;
      border-radius: 12px;
      padding: 10px;
      background: #ffffff;
    }

    .print-card.total { background: #f8fafc; }
    .print-card.out { background: #fff7ed; border-color: #fed7aa; }
    .print-card.current { background: #ecfeff; border-color: #a5f3fc; }
    .print-card.upcoming { background: #eff6ff; border-color: #bfdbfe; }
    .print-card.rate { background: #f0fdf4; border-color: #bbf7d0; }

    .print-card-label {
      font-size: 10px;
      color: #64748b;
      margin-bottom: 4px;
    }

    .print-card-value {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.2;
    }

    .print-section-title {
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
      margin: 14px 0 8px;
      padding-right: 8px;
      border-right: 4px solid #2563eb;
    }

    .p-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-bottom: 12px;
    }

    .p-table th,
    .p-table td {
      border: 1px solid #dbe3f0;
      padding: 3px 4px;
      text-align: right;
      font-size: 8px;
      vertical-align: middle;
      word-wrap: break-word;
    }

    .p-table th {
      background: #eaf1fb;
      color: #0f172a;
      font-weight: 800;
      font-size: 8.5px;
    }

    .p-table tbody tr:nth-child(even) {
      background: #f8fafc;
    }

    .p-table.compact th,
    .p-table.compact td {
      text-align: center;
      font-size: 11px;
    }

    .status-chip {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      border: 1px solid #dbe3f0;
      background: #f8fafc;
      color: #0f172a;
    }

    .status-confirmed,
    .status-deposit_paid {
      background: #eff6ff;
      color: #1d4ed8;
      border-color: #bfdbfe;
    }

    .status-checked_in {
      background: #ecfeff;
      color: #0f766e;
      border-color: #99f6e4;
    }

    .status-checked_out,
    .status-completed {
      background: #f1f5f9;
      color: #475569;
      border-color: #cbd5e1;
    }

    .status-canceled,
    .status-cancelled,
    .status-no_show {
      background: #fef2f2;
      color: #b91c1c;
      border-color: #fecaca;
    }

    .print-footer {
      margin-top: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #64748b;
      font-size: 10px;
      border-top: 1px solid #e5e7eb;
      padding-top: 8px;
    }

    .avoid-break {
      break-inside: avoid;
      page-break-inside: avoid;
    }
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
                  <List className="text-purple-600" />
                  تقرير سجل الحجوزات
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">
                  عرض الحجوزات ضمن فترة محددة مع بحث وفلاتر بسيطة. بيانات العميل تُجلب كما في كشف الحساب (العملاء
                  + ربط حساب الذمم). <strong>إجمالي الفاتورة</strong> من الفواتير (أو إجمالي الحجز). عند وجود حساب
                  ذمم: <strong>المدفوع</strong> و<strong>المتبقي</strong> من كشف الحساب — دائن حساب العميل + عربون
                  مسجّل على L-ADV بمرجع الحجز؛ وإلا المدفوع من سندات الدفع والمتبقي فرق الفاتورة. الليالي كما سبق.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handlePrint('standard')}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Download size={18} />
                <span>طباعة</span>
              </button>
              
              <button
                onClick={() => handlePrint('installments')}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
              >
                <Calendar size={18} />
                <span>طباعة الدفعات</span>
              </button>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchReport();
              }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 sm:gap-4 items-end"
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
                <label className="text-xs sm:text-sm font-medium text-gray-700">الحالة</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                >
                  <option value="all">كل الحالات</option>
                  <option value="confirmed">confirmed</option>
                  <option value="deposit_paid">deposit_paid</option>
                  <option value="checked_in">checked_in</option>
                  <option value="checked_out">checked_out</option>
                  <option value="completed">completed</option>
                  <option value="canceled">canceled</option>
                  <option value="cancelled">cancelled</option>
                  <option value="no_show">no_show</option>
                </select>
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
                <label className="text-xs sm:text-sm font-medium text-gray-700">
                  بحث (اسم، هاتف، بريد، رقم وحدة)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="أدخل نص البحث"
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <p className="text-xs text-gray-500">عدد الحجوزات</p>
              <p className="mt-1 text-2xl font-extrabold text-gray-900">
                {totals.count.toLocaleString()}
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <p className="text-xs text-gray-500">مجموع الليالي (ضمن الفترة)</p>
              <p className="mt-1 text-2xl font-extrabold text-gray-900">
                {totals.nights.toLocaleString()}
              </p>
            </div>

            <div className="border border-blue-200 rounded-2xl p-4 bg-blue-50">
              <p className="text-xs text-blue-700">نسبة الإشغال</p>
              <p className="mt-1 text-2xl font-extrabold text-blue-900">
                {bookingStats.occupancyRate.toFixed(1)}%
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <p className="text-xs text-gray-500">إجمالي الفاتورة (من الفواتير المعروضة)</p>
              <p className="mt-1 text-xl sm:text-2xl font-extrabold text-gray-900 tabular-nums">
                {formatSar(totals.invoiceSum)}
              </p>
            </div>
            <div className="border border-emerald-200 rounded-2xl p-4 bg-emerald-50/60">
              <p className="text-xs text-emerald-800">المدفوع (كشف حساب: دائن ذمم + عربون L-ADV للحجز، أو مدفوعات)</p>
              <p className="mt-1 text-xl sm:text-2xl font-extrabold text-emerald-900 tabular-nums">
                {formatSar(totals.paidSum)}
              </p>
            </div>
            <div className="border border-amber-200 rounded-2xl p-4 bg-amber-50/60">
              <p className="text-xs text-amber-900">المتبقي (إجمالي الفاتورة − المدفوع، دون سالب)</p>
              <p className="mt-1 text-xl sm:text-2xl font-extrabold text-amber-950 tabular-nums">
                {formatSar(totals.balanceSum)}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
            <table className="w-full text-right min-w-[1300px]">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">
                    العميل
                  </th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">
                    الهاتف
                  </th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">
                    الفندق
                  </th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">
                    الوحدة (النوع)
                  </th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">
                   دخول
                  </th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">
                   خروج
                  </th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">
                    الليالي
                  </th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">
                    الاستحقاق القادم
                  </th>
                  <th
                    className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap"
                    title="مجموع مبالغ الفواتير غير الملغاة (أو إجمالي الحجز إن لم توجد فاتورة)"
                  >
                    الفاتورة
                  </th>
                  <th
                    className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap"
                    title="من كشف الحساب: دائن ذمم العميل + عربون L-ADV بمرجع الحجز؛ أو مدفوعات الفواتير عند الاحتياط"
                  >
                    المدفوع
                  </th>
                  <th
                    className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap"
                    title="إجمالي الفاتورة − المدفوع (لا يظهر سالب)"
                  >
                    المتبقي
                  </th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">
                    الحالة
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan={12}
                      className="px-6 py-12 text-center text-gray-500"
                    >
                      جاري تحميل البيانات...
                    </td>
                  </tr>
                ) : filteredRows.length > 0 ? (
                  filteredRows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors odd:bg-white even:bg-gray-50">
                      <td className="px-4 py-3 sm:px-6 sm:py-4 font-medium text-gray-900 whitespace-nowrap">
                        {formatShortName(r.customer_name)}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                        {r.phone || '-'}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                        {r.hotel_name || '-'}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 font-mono whitespace-nowrap">
                        {r.unit_number || '-'}
                        {r.unit_type_name && (
                          <span className="text-[10px] text-gray-500 ml-1">({r.unit_type_name})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap font-mono">
                        {formatShortDate(r.check_in)}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap font-mono">
                        {formatShortDate(r.check_out)}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                        {r.total_booking_nights.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap text-xs font-bold text-red-600">
                        {r.next_payment_due && r.next_payment_due.includes('-') 
                          ? formatShortDate(r.next_payment_due) 
                          : (r.next_payment_due || '-')}
                      </td>
                      <td
                        className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap tabular-nums font-mono"
                        title={
                          r.invoice_count > 1 
                          ? `هذا الحجز يمتلك ${r.invoice_count} فواتير (شامل فواتير التمديد)` 
                          : "من الفواتير غير الملغاة، أو إجمالي الحجز إن لم توجد فاتورة"
                        }
                      >
                        <div className="flex items-center gap-1">
                          {formatSarEn(r.invoice_total)}
                          {r.invoice_count > 1 && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded" title="يوجد فواتير تمديد">
                              +{r.invoice_count - 1}
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap tabular-nums font-mono text-emerald-800"
                        title={
                          r.amounts_from_ledger
                            ? 'كشف الحساب: دائن ذمم العميل + عربون (L-ADV) بمرجع هذا الحجز'
                            : 'من المدفوعات المرحّلة على الفواتير (احتياط)'
                        }
                      >
                        {formatSarEn(r.paid_total)}
                      </td>
                      <td
                        className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap tabular-nums font-mono text-amber-900"
                        title={
                          r.amounts_from_ledger
                            ? 'إجمالي الفاتورة − المدفوع (من كشف الحساب)'
                            : 'إجمالي الفاتورة − المدفوع (احتياط)'
                        }
                      >
                        {formatSarEn(r.balance)}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                        {formatStatusAr(r.status)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={12}
                      className="px-6 py-12 text-center text-gray-500"
                    >
                      لا توجد بيانات ضمن الفترة المحددة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>

        <div className="print-only print-standard-only p-6">
          <div
            style={{
              marginBottom: '16px',
              borderBottom: '2px solid #e5e7eb',
              paddingBottom: '10px',
            }}
          >
            <div className="print-title" style={{ marginBottom: '4px' }}>
              تقرير سجل الحجوزات
            </div>
            <div className="print-sub" style={{ marginBottom: '6px' }}>
              الفترة: {startDate} إلى {endDate}
            </div>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>
              تقرير تفصيلي للحجوزات بحسب الفلاتر المحددة. إجمالي الفاتورة من الفواتير؛ المدفوع والمتبقي من كشف الحساب
              (دائن ذمم + عربون L-ADV للحجز) عند ربط الذمم، وإلا من المدفوعات.
            </div>
          </div>

          <table className="p-table" style={{ marginBottom: '14px' }}>
            <thead>
              <tr>
                <th>إجمالي الحجوزات</th>
                <th>غادروا</th>
                <th>الحاليون</th>
                <th>القادمون</th>
                <th>نسبة الإشغال</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{bookingStats.total.toLocaleString()}</td>
                <td>{bookingStats.checkedOut.toLocaleString()}</td>
                <td>{bookingStats.current.toLocaleString()}</td>
                <td>{bookingStats.upcoming.toLocaleString()}</td>
                <td>{bookingStats.occupancyRate.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>

          <table className="p-table" style={{ marginBottom: '14px' }}>
            <thead>
              <tr>
                <th>عدد الحجوزات</th>
                <th>مجموع الليالي (ضمن الفترة)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{totals.count.toLocaleString()}</td>
                <td>{totals.nights.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          <table className="p-table" style={{ marginBottom: '14px' }}>
            <thead>
              <tr>
                <th>إجمالي الفواتير</th>
                <th>المدفوع</th>
                <th>المتبقي</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{formatSar(totals.invoiceSum)}</td>
                <td>{formatSar(totals.paidSum)}</td>
                <td>{formatSar(totals.balanceSum)}</td>
              </tr>
            </tbody>
          </table>

          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: '#111827',
              marginBottom: '8px',
            }}
          >
            تفاصيل الحجوزات
          </div>

          <table className="p-table">
            <thead>
              <tr>
                <th>العميل</th>
                <th>الهاتف</th>
                <th>الفندق</th>
                <th>الوحدة (النوع)</th>
                <th>دخول</th>
                <th>خروج</th>
                <th>الليالي</th>
                <th>الاستحقاق</th>
                <th>الفاتورة</th>
                <th>المدفوع</th>
                <th>المتبقي</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length > 0 ? (
                filteredRows.map((r) => (
                  <tr key={r.id}>
                    <td>{formatShortName(r.customer_name)}</td>
                    <td>{r.phone || '-'}</td>
                    <td>{r.hotel_name || '-'}</td>
                    <td>
                      {r.unit_number || '-'}
                      {r.unit_type_name && (
                        <span style={{ fontSize: '8px', color: '#6b7280', marginRight: '4px' }}>({r.unit_type_name})</span>
                      )}
                    </td>
                    <td className="font-mono">{formatShortDate(r.check_in)}</td>
                    <td className="font-mono">{formatShortDate(r.check_out)}</td>
                    <td>{r.total_booking_nights.toLocaleString()}</td>
                    <td style={{ fontWeight: 'bold', color: '#dc2626' }}>
                      {r.next_payment_due && r.next_payment_due.includes('-') 
                        ? formatShortDate(r.next_payment_due) 
                        : (r.next_payment_due || '-')}
                    </td>
                    <td className="font-mono">{formatSarEn(r.invoice_total)}</td>
                    <td className="font-mono">{formatSarEn(r.paid_total)}</td>
                    <td className="font-mono">{formatSarEn(r.balance)}</td>
                    <td>{formatStatusAr(r.status)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', padding: '12px' }}>
                    لا توجد بيانات ضمن الفترة المحددة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* تخطيط طباعة الدفعات والاستحقاقات الجديد */}
        <div className="print-only print-installments-only p-6">
          <div
            style={{
              marginBottom: '16px',
              borderBottom: '2px solid #7c3aed',
              paddingBottom: '10px',
            }}
          >
            <div className="print-title" style={{ marginBottom: '4px', color: '#6d28d9' }}>
              تقرير استحقاقات ودفعات الحجوزات
            </div>
            <div className="print-sub" style={{ marginBottom: '6px' }}>
              الفترة: {startDate} إلى {endDate}
            </div>
            <div style={{ fontSize: '10px', color: '#6b7280' }}>
              تقرير يوضح تقسيم مبالغ الحجوزات على أشهر الإقامة وحالة دفع كل شهر بناءً على إجمالي المبالغ المسددة.
            </div>
          </div>

          <table className="p-table">
            <thead>
              <tr>
                <th style={{ width: '15%' }}>العميل</th>
                <th style={{ width: '10%' }}>دخول</th>
                <th style={{ width: '10%' }}>خروج</th>
                <th style={{ width: '35%' }}>تفاصيل الدفعات والاستحقاقات الشهرية</th>
                <th style={{ width: '15%' }}>إجمالي الفاتورة</th>
                <th style={{ width: '15%' }}>المتبقي</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length > 0 ? (
                filteredRows.map((r) => {
                  const installments = calculateInstallments(
                    r.check_in,
                    r.check_out,
                    r.total_booking_nights,
                    r.invoice_total,
                    r.paid_total
                  );
                  return (
                    <tr key={r.id}>
                      <td>{formatShortName(r.customer_name)}</td>
                      <td className="font-mono">{formatShortDate(r.check_in)}</td>
                      <td className="font-mono">{formatShortDate(r.check_out)}</td>
                      <td style={{ padding: '0' }}>
                        <div className="flex flex-col">
                          {installments.map((inst) => (
                            <div 
                              key={inst.number} 
                              className="flex justify-between items-center border-b border-gray-100 last:border-0 px-2 py-1 text-[7.5px]"
                            >
                              <div className="flex items-center gap-1">
                                <span className="font-bold">دفعة {inst.number}</span>
                                <span className="font-mono text-gray-700">[{formatSarEn(inst.amount)}]:</span>
                                <span className={inst.isFullyPaid ? 'text-emerald-600' : inst.isPartiallyPaid ? 'text-amber-600' : 'text-red-600'}>
                                  {inst.isFullyPaid ? 'تم الدفع' : inst.isPartiallyPaid ? 'دفع جزئي' : 'لم يتم الدفع'}
                                </span>
                                <span className="font-mono text-gray-500">({formatSarEn(inst.paid)})</span>
                              </div>
                              <div className="font-mono text-gray-500">
                                استحقاق: {formatShortDate(inst.dueDate)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="font-mono font-bold">{formatSarEn(r.invoice_total)}</td>
                      <td className="font-mono font-bold text-red-600">{formatSarEn(r.balance)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '12px' }}>
                    لا توجد بيانات ضمن الفترة المحددة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </RoleGate>
  );
}