'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { KPICard } from '@/components/dashboard/KPICard';
import { RevenueChart } from '@/components/dashboard/RevenueChart';
import { 
  DollarSign, 
  Calendar, 
  TrendingUp, 
  ArrowRight, 
  Filter,
  Download,
  FileText,
  FileDown,
  Loader2
} from 'lucide-react';
import Link from 'next/link';
import RoleGate from '@/components/auth/RoleGate';
import { useUserRole } from '@/hooks/useUserRole';
import { useActiveHotel } from '@/hooks/useActiveHotel';

export default function RevenueReportPage() {
  const { role, loading: roleLoading } = useUserRole();
  const { activeHotelId } = useActiveHotel();
  const [loading, setLoading] = useState(true);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [companyName, setCompanyName] = useState('شموخ الرفاهية');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [showAccountingDetails, setShowAccountingDetails] = useState(false);
  const [hotelTotals, setHotelTotals] = useState<Array<{ hotel_id: string; hotel_name: string; total: number }>>([]);
  const selectedHotelId = activeHotelId || 'all';

  useEffect(() => {
    try {
      const n = typeof window !== 'undefined' ? localStorage.getItem('companyName') : null;
      const l = typeof window !== 'undefined' ? localStorage.getItem('companyLogo') : null;
      if (n) setCompanyName(n);
      if (l) setCompanyLogo(l);
    } catch {}
  }, []);

  // Date Range State
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(1); // Start of current month
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  useEffect(() => {
    fetchData();
  }, [startDate, endDate, showAccountingDetails, selectedHotelId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: hotelsData } = await supabase
        .from('hotels')
        .select('id, name')
        .order('name', { ascending: true });
      const hotelNameById = new Map<string, string>();
      (hotelsData || []).forEach((h: any) => {
        if (!h?.id) return;
        hotelNameById.set(String(h.id), String(h.name || ''));
      });

      // 1. Get Fund Accounts (1100 - الصندوق and 1112 - صندوق عايض)
      const { data: mainAccounts, error: accError } = await supabase
        .from('accounts')
        .select('id, name, code')
        .or('code.eq.1100,code.eq.1112');

      if (accError) throw accError;

      const mainIds = mainAccounts?.map(a => a.id) || [];
      
      // Also fetch children of these accounts (especially for 1100 which is a group)
      const { data: children } = await supabase
        .from('accounts')
        .select('id, name, code')
        .in('parent_id', mainIds);

      const allAccounts = [...(mainAccounts || []), ...(children || [])];
      const accountIds = allAccounts.map(a => a.id);
      const accountMap = new Map();
      allAccounts.forEach(a => {
        accountMap.set(a.id, a.name);
      });

      if (accountIds.length === 0) {
        setRevenueData([]);
        setTotalRevenue(0);
        setLoading(false);
        return;
      }

      // 2. Get Journal Lines for these Fund accounts
      let query = supabase
        .from('journal_lines')
        .select(`
          id,
          credit,
          debit,
          description,
          account_id,
          journal_entry_id,
          journal_entries!inner (
            id,
            entry_date,
            voucher_number,
            status,
            reference_type,
            reference_id
          )
        `)
        .in('account_id', accountIds)
        .eq('journal_entries.status', 'posted')
        .gte('journal_entries.entry_date', startDate)
        .lte('journal_entries.entry_date', endDate);

      // If not showing details, we might want to only show inflows (Debits)
      // but based on user request "show debit and credit", we fetch all.
      // We will handle the filtering in the UI/processing.

      const { data: lines, error: linesError } = await query;
      if (linesError) throw linesError;

      // 3. Customer & Unit Mapping
      const jeList = (lines || []).map((l: any) => (Array.isArray(l.journal_entries) ? l.journal_entries[0] : l.journal_entries)).filter(Boolean);
      const bookingIds = Array.from(
        new Set(
          jeList
            .filter((je: any) => je?.reference_type === 'booking' && je?.reference_id)
            .map((je: any) => String(je.reference_id))
        )
      );
      const invoiceIds = Array.from(
        new Set(
          jeList
            .filter((je: any) => je?.reference_type === 'invoice' && je?.reference_id)
            .map((je: any) => String(je.reference_id))
        )
      );
      const paymentIds = Array.from(
        new Set(
          jeList
            .filter((je: any) => je?.reference_type === 'payment' && je?.reference_id)
            .map((je: any) => String(je.reference_id))
        )
      );

      const bookingInfoById = new Map<string, { hotel_id: string | null; customer_name: string | null; unit_number: string | null; unit_account_code: string | null }>();
      const invoiceBookingById = new Map<string, string | null>();
      const paymentInvoiceById = new Map<string, string | null>();
      const paymentCustomerById = new Map<string, string | null>();

      if (invoiceIds.length > 0) {
        const { data: invRows } = await supabase
          .from('invoices')
          .select('id, booking_id')
          .in('id', invoiceIds);
        (invRows || []).forEach((r: any) => invoiceBookingById.set(String(r.id), r.booking_id ? String(r.booking_id) : null));
      }

      if (paymentIds.length > 0) {
        const { data: payRows } = await supabase
          .from('payments')
          .select('id, invoice_id, customer:customers(full_name)')
          .in('id', paymentIds);
        (payRows || []).forEach((p: any) => {
          paymentInvoiceById.set(String(p.id), p.invoice_id ? String(p.invoice_id) : null);
          paymentCustomerById.set(String(p.id), (p.customer as any)?.full_name ? String((p.customer as any).full_name) : null);
        });
        const invFromPays = Array.from(new Set((payRows || []).map((p: any) => p.invoice_id).filter(Boolean).map((x: any) => String(x))));
        const missingInv = invFromPays.filter((id) => !invoiceBookingById.has(id));
        if (missingInv.length > 0) {
          const { data: invRows2 } = await supabase
            .from('invoices')
            .select('id, booking_id')
            .in('id', missingInv);
          (invRows2 || []).forEach((r: any) => invoiceBookingById.set(String(r.id), r.booking_id ? String(r.booking_id) : null));
        }
      }

      const bookingIdsFromInvoices = Array.from(new Set(Array.from(invoiceBookingById.values()).filter(Boolean) as string[]));
      const allBookingIds = Array.from(new Set([...bookingIds, ...bookingIdsFromInvoices]));
      if (allBookingIds.length > 0) {
        const { data: bRows } = await supabase
          .from('bookings')
          .select('id, hotel_id, customer:customers(full_name), units(unit_number, revenue_account:accounts!revenue_account_id(code))')
          .in('id', allBookingIds);
        (bRows || []).forEach((b: any) => {
          const id = String(b.id);
          const hotel_id = b.hotel_id ? String(b.hotel_id) : null;
          const customer_name = (b.customer as any)?.full_name ? String((b.customer as any).full_name) : null;
          const unit_number = (b.units as any)?.unit_number ? String((b.units as any).unit_number) : null;
          const unit_account_code = (b.units as any)?.revenue_account?.code ? String((b.units as any).revenue_account.code) : null;
          bookingInfoById.set(id, { hotel_id, customer_name, unit_number, unit_account_code });
        });
      }

      // Process Data - Fund Accounts (Assets)
      // Debit = Inflow (+)
      // Credit = Outflow (-)
      let total = 0;
      const filteredLines = lines?.filter(line => {
        if (!showAccountingDetails) {
          return Number(line.debit) > 0; // Only Inflows in simple view
        }
        return true; // All movements in detailed view
      }) || [];

      const processedLines = filteredLines.map((line: any) => {
        const amount = Number(line.debit) - Number(line.credit);
        total += amount;
        const je = Array.isArray(line.journal_entries) ? line.journal_entries[0] : (line.journal_entries as any);
        const refType = String(je?.reference_type || '');
        const refId = je?.reference_id ? String(je.reference_id) : null;

        let bookingId: string | null = null;
        if (refType === 'booking') bookingId = refId;
        if (refType === 'invoice' && refId) bookingId = invoiceBookingById.get(refId) || null;
        if (refType === 'payment' && refId) {
          const invId = paymentInvoiceById.get(refId) || null;
          if (invId) bookingId = invoiceBookingById.get(invId) || null;
        }

        const bInfo = bookingId ? bookingInfoById.get(bookingId) : null;
        const hotel_id = bInfo?.hotel_id || null;
        const hotel_name = hotel_id ? (hotelNameById.get(hotel_id) || '-') : '-';

        const unitData = { num: bInfo?.unit_number || '-', code: bInfo?.unit_account_code || '-' };
        const customer_name =
          refType === 'payment' && refId
            ? (paymentCustomerById.get(refId) || bInfo?.customer_name || '-')
            : (bInfo?.customer_name || '-');

        return {
          ...line,
          amount,
          date: je?.entry_date,
          account_name: accountMap.get(line.account_id) || 'غير معروف',
          customer_name,
          unit_number: unitData.num,
          unit_account_code: unitData.code,
          hotel_id,
          hotel_name
        };
      });

      processedLines.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const scopedLines =
        selectedHotelId && selectedHotelId !== 'all'
          ? processedLines.filter((x: any) => String(x.hotel_id || '') === String(selectedHotelId))
          : processedLines;
      let scopedTotal = 0;
      scopedLines.forEach((x: any) => {
        scopedTotal += Number(x.amount || 0);
      });

      const byHotel = new Map<string, { hotel_name: string; total: number }>();
      for (const x of scopedLines) {
        const hid = String(x.hotel_id || '');
        if (!hid) continue;
        const prev = byHotel.get(hid) || { hotel_name: String(x.hotel_name || '-'), total: 0 };
        prev.total += Number(x.amount || 0);
        byHotel.set(hid, prev);
      }
      const totalsArr = Array.from(byHotel.entries())
        .map(([hotel_id, v]) => ({ hotel_id, hotel_name: v.hotel_name, total: v.total }))
        .sort((a, b) => b.total - a.total);

      setHotelTotals(totalsArr);
      setRevenueData(scopedLines);
      setTotalRevenue(scopedTotal);

    } catch (error) {
      console.error('Error fetching revenue report:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = async () => {
    if (exportingExcel) return;
    setExportingExcel(true);
    try {
      const XLSX = await import('xlsx');
      const rows = (revenueData || []).map((item: any) => {
        const fullVoucher = item?.journal_entries?.voucher_number || '';
        const shortVoucher = fullVoucher.length > 7 ? fullVoucher.slice(-7) : fullVoucher;
        
        return {
          التاريخ: item?.date ? new Date(item.date).toISOString().split('T')[0] : '',
          'رقم القيد': shortVoucher,
          الفندق: item?.hotel_name || '',
          الوحدة: item?.unit_number || '',
          'رمز الحساب': item?.unit_account_code || '',
          البيان: `${item?.customer_name || '-'} : ${item?.description || item?.journal_entries?.description || '-'}`,
          'الصندوق / الحساب': item?.account_name || '',
          'مدين (قبض)': Number(item?.debit || 0),
          'دائن (صرف)': Number(item?.credit || 0),
          'الصافي': Number(item?.amount || 0),
        };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'الإيرادات');

      const summary = [
        ['الشركة', companyName],
        ['الفترة', `${startDate} إلى ${endDate}`],
        ['عدد العمليات', revenueData.length],
        ['إجمالي المقبوضات', totalRevenue],
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(summary);
      XLSX.utils.book_append_sheet(wb, ws2, 'ملخص');

      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `revenue_${startDate}_${endDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Excel export error:', e);
      alert('تعذر تصدير ملف الإكسل');
    } finally {
      setExportingExcel(false);
    }
  };

  // Prepare Chart Data (Group by Day)
  const chartData = useMemo(() => {
    const grouped = new Map();
    revenueData.forEach(item => {
      const date = item.date;
      const current = grouped.get(date) || 0;
      grouped.set(date, current + item.amount);
    });

    return Array.from(grouped.entries())
      .map(([date, amount]) => ({
        date: new Date(date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }),
        rawDate: date,
        amount: Number(amount)
      }))
      .sort((a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime());
  }, [revenueData]);

  return (
    <RoleGate allow={['admin', 'manager', 'accountant', 'marketing']}>
    {roleLoading ? (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 flex items-center gap-2 text-gray-700 font-bold">
          <Loader2 className="animate-spin" size={18} />
          جار التحميل…
        </div>
      </div>
    ) : (
    <>
      <style>{`
        .screen-only { display: block; }
        .print-only { display: none; }
        @media print {
          .screen-only { display: none !important; }
          .print-only { display: block !important; }
          header, aside, nav, .sticky, .fixed, .print-hidden { display: none !important; }
          .print-title { font-size: 18px; font-weight: 800; color: #111827; margin-bottom: 6px; }
          .print-sub { color: #6b7280; font-size: 12px; margin-bottom: 10px; }
          .p-table { width: 100%; border-collapse: collapse; }
          .p-table th, .p-table td { border: 1px solid #e5e7eb; padding: 6px; text-align: right; font-size: 12px; }
          .p-table th { background: #f9fafb; font-weight: 700; }
          .print-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
          .print-brand { display: flex; align-items: center; gap: 10px; }
          .print-brand img { height: 48px; width: auto; object-fit: contain; }
          .print-summary { margin: 8px 0 12px 0; }
          .sig-row { display: flex; gap: 40px; margin-top: 24px; }
          .sig-box { flex: 1 1 0; }
          .sig-label { font-size: 12px; color: #374151; margin-bottom: 28px; }
          .sig-line { border-top: 1px solid #e5e7eb; height: 1px; }
        }
      `}</style>
    <div className="space-y-6 screen-only">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/reports" className="text-gray-500 hover:text-gray-700 transition-colors">
              التقارير
            </Link>
            <span className="text-gray-400">/</span>
            <span className="font-bold text-gray-900">تقرير الإيرادات ({showAccountingDetails ? 'كشف حركة الصناديق' : 'مقبوضات الصناديق'})</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {showAccountingDetails ? 'تقرير حركة الصناديق (عايض + الرئيسي)' : 'تقرير إيرادات الصناديق (الأساس النقدي)'}
          </h1>
          <p className="text-gray-500 mt-1">
            {showAccountingDetails 
              ? 'كشف حساب تفصيلي يوضح جميع حركات المقبوضات والمدفوعات في "الصندوق" و "صندوق عايض"' 
              : 'تفاصيل المبالغ المقبوضة في "الصندوق" و "صندوق عايض" (التدفقات النقدية الداخلة)'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
            <Calendar size={18} className="text-gray-400 ml-2" />
            <div className="flex items-center gap-2">
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-sm border-none focus:ring-0 p-0 text-gray-700"
              />
              <span className="text-gray-400">-</span>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-sm border-none focus:ring-0 p-0 text-gray-700"
              />
            </div>
          </div>
          
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium shadow-sm print:hidden"
          >
            <Download size={18} />
            طباعة
          </button>

          <button
            onClick={exportToExcel}
            disabled={exportingExcel}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium shadow-sm disabled:opacity-60 print:hidden"
            title="تصدير إلى Excel"
          >
            {exportingExcel ? <Loader2 className="animate-spin" size={18} /> : <FileDown size={18} />}
            اكسل
          </button>

          <button
            onClick={() => setShowAccountingDetails(!showAccountingDetails)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all font-bold shadow-sm print:hidden ${
              showAccountingDetails 
                ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700' 
                : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50'
            }`}
            title={showAccountingDetails ? "العودة للأساس النقدي" : "عرض التفاصيل المحاسبية"}
          >
            <Filter size={18} />
            {showAccountingDetails ? 'الأساس النقدي' : 'الأساس الاستحقاقي'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <KPICard 
          title={showAccountingDetails ? "إجمالي الإيرادات (الصافي)" : "إجمالي المقبوضات"} 
          value={new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(totalRevenue)}
          change="-" 
          trend="neutral"
          icon={DollarSign}
          color="green"
          description={showAccountingDetails ? "صافي حركات الإيرادات (دائن - مدين)" : "مجموع النقد المستلم في الحسابات"}
        />
        <KPICard 
          title="عدد العمليات" 
          value={revenueData.length.toString()}
          change="-" 
          trend="neutral"
          icon={FileText}
          color="blue"
          description="عدد عمليات القبض المسجلة"
        />
        <KPICard 
          title="متوسط العملية" 
          value={new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(revenueData.length ? totalRevenue / revenueData.length : 0)}
          change="-" 
          trend="neutral"
          icon={TrendingUp}
          color="purple"
          description="متوسط قيمة القبض للعملية الواحدة"
        />
      </div>

      {selectedHotelId === 'all' && !loading && hotelTotals.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center">
            <h3 className="font-bold text-lg text-gray-900">ملخص الإيرادات حسب الفندق</h3>
            <span className="text-sm text-gray-500">{hotelTotals.length} فندق</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 font-bold text-gray-900 text-sm">الفندق</th>
                  <th className="px-6 py-4 font-bold text-gray-900 text-sm text-left">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {hotelTotals.map((h) => (
                  <tr key={h.hotel_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-800 font-bold">{h.hotel_name}</td>
                    <td className="px-6 py-4 text-sm font-bold text-left text-green-700">
                      {new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(h.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3">
          <RevenueChart 
            data={chartData} 
            title="تحليل التدفقات النقدية الداخلة"
            description="توزيع المقبوضات حسب التاريخ"
          />
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h3 className="font-bold text-lg text-gray-900">سجل عمليات القبض</h3>
          <span className="text-sm text-gray-500">{revenueData.length} عملية</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 font-bold text-gray-900 text-sm">التاريخ</th>
                <th className="px-6 py-4 font-bold text-gray-900 text-sm">رقم القيد</th>
                <th className="px-6 py-4 font-bold text-gray-900 text-sm">الفندق</th>
                <th className="px-6 py-4 font-bold text-gray-900 text-sm">الوحدة</th>
                <th className="px-6 py-4 font-bold text-gray-900 text-sm">رمز الحساب</th>
                <th className="px-6 py-4 font-bold text-gray-900 text-sm">البيان</th>
                <th className="px-6 py-4 font-bold text-gray-900 text-sm">
                  {showAccountingDetails ? 'الصندوق / الحساب' : 'طريقة الدفع (الصندوق)'}
                </th>
                {showAccountingDetails && <th className="px-6 py-4 font-bold text-green-600 text-sm text-left">مدين (قبض)</th>}
                {showAccountingDetails && <th className="px-6 py-4 font-bold text-red-600 text-sm text-left">دائن (صرف)</th>}
                <th className="px-6 py-4 font-bold text-gray-900 text-sm text-left">
                  {showAccountingDetails ? 'الصافي' : 'المبلغ المستلم'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={showAccountingDetails ? 10 : 8} className="px-6 py-8 text-center text-gray-500">
                    جاري تحميل البيانات...
                  </td>
                </tr>
              ) : revenueData.length === 0 ? (
                <tr>
                  <td colSpan={showAccountingDetails ? 10 : 8} className="px-6 py-8 text-center text-gray-500">
                    لا توجد بيانات للفترة المحددة
                  </td>
                </tr>
              ) : (
                revenueData.map((item) => {
                  const fullVoucher = item.journal_entries.voucher_number || '-';
                  const shortVoucher = fullVoucher.length > 7 ? fullVoucher.slice(-7) : fullVoucher;

                  return (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                        {new Date(item.date).toLocaleDateString('ar-SA')}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 font-mono" title={fullVoucher}>
                        {shortVoucher}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 font-bold">
                        {item.hotel_name || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-indigo-600 font-bold">
                        {item.unit_number}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 font-mono">
                        {item.unit_account_code}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-800">
                        <div className="font-bold text-gray-900">{item.customer_name}</div>
                        <div className="text-xs text-gray-500 truncate max-w-xs" title={item.description || item.journal_entries.description}>
                          {item.description || item.journal_entries.description || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${showAccountingDetails ? 'bg-indigo-50 text-indigo-800' : 'bg-blue-50 text-blue-800'}`}>
                          {item.account_name}
                        </span>
                      </td>
                      {showAccountingDetails && (
                        <td className="px-6 py-4 text-sm text-green-600 font-mono text-left">
                          {item.debit > 0 ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(item.debit) : '-'}
                        </td>
                      )}
                      {showAccountingDetails && (
                        <td className="px-6 py-4 text-sm text-red-600 font-mono text-left">
                          {item.credit > 0 ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(item.credit) : '-'}
                        </td>
                      )}
                      <td className={`px-6 py-4 text-sm font-bold text-left ${item.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(item.amount)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <div className="print-only">
      <div className="print-header">
        <div className="print-brand">
          {companyLogo ? <img src={companyLogo} alt="Logo" /> : null}
          <div>
            <div className="print-title">{companyName}</div>
            <div className="print-sub">تقرير الإيرادات (المقبوضات)</div>
          </div>
        </div>
        <div>
          <div className="print-sub">الفترة: {startDate} إلى {endDate}</div>
        </div>
      </div>
      <table className="p-table print-summary">
        <thead>
          <tr>
            <th>عدد العمليات</th>
            <th>إجمالي المقبوضات</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{revenueData.length}</td>
            <td>{new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(totalRevenue)}</td>
          </tr>
        </tbody>
      </table>
      <table className="p-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>رقم القيد</th>
                <th>الفندق</th>
                <th>العميل</th>
                <th>البيان</th>
                <th>الصندوق/الحساب</th>
                <th>مدين (قبض)</th>
                <th>دائن (صرف)</th>
                <th>الصافي</th>
              </tr>
            </thead>
            <tbody>
              {revenueData.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.date).toLocaleDateString('ar-SA')}</td>
                  <td>{item.journal_entries.voucher_number || '-'}</td>
                  <td>{item.hotel_name || '-'}</td>
                  <td>{item.customer_name}</td>
                  <td>{item.description || item.journal_entries.description || '-'}</td>
                  <td>{item.account_name}</td>
                  <td>{new Intl.NumberFormat('ar-SA').format(item.debit)}</td>
                  <td>{new Intl.NumberFormat('ar-SA').format(item.credit)}</td>
                  <td>{new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(item.amount)}</td>
                </tr>
              ))}
            </tbody>
      </table>
      <div className="sig-row">
        <div className="sig-box">
          <div className="sig-label">توقيع المدير</div>
          <div className="sig-line"></div>
        </div>
        <div className="sig-box">
          <div className="sig-label">توقيع المحاسب</div>
          <div className="sig-line"></div>
        </div>
      </div>
    </div>
    </>
    )}
    </RoleGate>
  );
}
