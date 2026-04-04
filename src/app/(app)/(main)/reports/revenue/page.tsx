'use client';

import React, { useState, useEffect } from 'react';
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

export default function RevenueReportPage() {
  const { role, loading: roleLoading } = useUserRole();
  const [loading, setLoading] = useState(true);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [companyName, setCompanyName] = useState('شموخ الرفاهية');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);

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
  }, [startDate, endDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Get Payment Method Accounts (Cash/Banks)
      // We exclude platform receivable accounts because they are not "cash revenue" yet
      // Revenue from platforms will be realized when the settlement hits the bank account.
      const { data: paymentMethods, error: pmError } = await supabase
        .from('payment_methods')
        .select(`
          id, 
          name, 
          account_id, 
          accounts!inner(name, code, parent_id)
        `);

      if (pmError) throw pmError;

      // Filter out accounts that are children of Platforms (code 1120) or have code starting with 112
      // We also need the ID of the platform parent account
      const { data: platformParent } = await supabase
        .from('accounts')
        .select('id')
        .eq('code', '1120')
        .single();

      const platformParentId = platformParent?.id;

      const filteredMethods = paymentMethods?.filter(pm => {
        const acc = pm.accounts as any;
        const pmName = (pm.name || '').toLowerCase();
        
        // 1. Check if the payment method name itself suggests a platform
        if (pmName.includes('ايجار') || pmName.includes('ajar') || pmName.includes('ejar') || 
            pmName.includes('booking') || pmName.includes('بوكينج') || 
            pmName.includes('gathern') || pmName.includes('جاذر') ||
            pmName.includes('منصة') || pmName.includes('platform')) {
          return false;
        }

        if (!acc) return false;

        // 2. Check by account hierarchy (code 1120 is for Platform Receivables)
        if (platformParentId && acc.parent_id === platformParentId) return false;
        if (acc.code === '1120' || acc.code?.startsWith('112')) return false;
        
        return true;
      }) || [];

      const accountIds = filteredMethods.map(pm => pm.account_id).filter(id => id) || [];
      
      // Also map account_id to payment method name for display
      const accountMap = new Map();
      filteredMethods.forEach(pm => {
        if (pm.account_id) {
          accountMap.set(pm.account_id, pm.name);
        }
      });

      if (accountIds.length === 0) {
        setRevenueData([]);
        setTotalRevenue(0);
        setLoading(false);
        return;
      }

      // 2. Get Journal Lines (Cash Inflows only - Debit > 0)
      const { data: lines, error: linesError } = await supabase
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
        .gt('debit', 0) // Only Inflows (Money entering the account)
        .gte('journal_entries.entry_date', startDate)
        .lte('journal_entries.entry_date', endDate);

      if (linesError) throw linesError;

      // 3. For each inflow line, try to find the associated customer
      // Get all entry IDs from the inflows
      const entryIds = lines?.map(l => l.journal_entry_id) || [];
      
      let customerMap = new Map();
      if (entryIds.length > 0) {
        // A. Try to get from payments table (most common for revenue)
        const paymentIds = lines
          .map(l => {
            const je = Array.isArray(l.journal_entries) ? l.journal_entries[0] : (l.journal_entries as any);
            return je?.reference_type === 'payment' ? je.reference_id : null;
          })
          .filter(id => id !== null);
        
        if (paymentIds.length > 0) {
          const { data: payments } = await supabase
            .from('payments')
            .select('id, customer:customers(full_name)')
            .in('id', paymentIds);
          payments?.forEach(p => {
            if (p.customer) {
              // Find all entry IDs for this payment
              lines.forEach(line => {
                const je = Array.isArray(line.journal_entries) ? line.journal_entries[0] : (line.journal_entries as any);
                if (je?.reference_type === 'payment' && je?.reference_id === p.id) {
                  customerMap.set(line.journal_entry_id, (p.customer as any).full_name);
                }
              });
            }
          });
        }

        // B. Try to get from bookings table
        const bookingIds = lines
          .map(l => {
            const je = Array.isArray(l.journal_entries) ? l.journal_entries[0] : (l.journal_entries as any);
            return je?.reference_type === 'booking' ? je.reference_id : null;
          })
          .filter(id => id !== null);
        
        if (bookingIds.length > 0) {
          const { data: bookings } = await supabase
            .from('bookings')
            .select('id, customer:customers(full_name)')
            .in('id', bookingIds);
          bookings?.forEach(b => {
            if (b.customer) {
              lines.forEach(line => {
                const je = Array.isArray(line.journal_entries) ? line.journal_entries[0] : (line.journal_entries as any);
                if (je?.reference_type === 'booking' && je?.reference_id === b.id) {
                  customerMap.set(line.journal_entry_id, (b.customer as any).full_name);
                }
              });
            }
          });
        }

        // C. Fallback: Check journal_lines for customer accounts
        const remainingEntryIds = entryIds.filter(id => !customerMap.has(id));
        if (remainingEntryIds.length > 0) {
          const { data: customerLines } = await supabase
            .from('journal_lines')
            .select(`
              journal_entry_id,
              account_id
            `)
            .in('journal_entry_id', remainingEntryIds);
          
          if (customerLines && customerLines.length > 0) {
            const accountIds = Array.from(new Set(customerLines.map(cl => cl.account_id)));
            const { data: customerAccounts } = await supabase
              .from('customer_accounts')
              .select('account_id, customer:customers(full_name)')
              .in('account_id', accountIds);
            
            if (customerAccounts) {
              const accountToName = new Map();
              customerAccounts.forEach(ca => {
                if (ca.customer) accountToName.set(ca.account_id, (ca.customer as any).full_name);
              });

              customerLines.forEach(cl => {
                const name = accountToName.get(cl.account_id);
                if (name) customerMap.set(cl.journal_entry_id, name);
              });
            }
          }
        }
      }

      // Process Data
      let total = 0;
      const processedLines = lines?.map((line: any) => {
        const amount = Number(line.debit) || 0; // Inflow Amount
        total += amount;
        const je = Array.isArray(line.journal_entries) ? line.journal_entries[0] : (line.journal_entries as any);
        return {
          ...line,
          amount,
          date: je?.entry_date,
          account_name: accountMap.get(line.account_id) || 'غير معروف',
          customer_name: customerMap.get(line.journal_entry_id) || '-'
        };
      }) || [];

      // Sort by date desc
      processedLines.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setRevenueData(processedLines);
      setTotalRevenue(total);

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
      const rows = (revenueData || []).map((item: any) => ({
        التاريخ: item?.date ? new Date(item.date).toISOString().split('T')[0] : '',
        'رقم القيد': item?.journal_entries?.voucher_number || '',
        العميل: item?.customer_name || '',
        البيان: item?.description || item?.journal_entries?.description || '',
        'طريقة الدفع (الحساب)': item?.account_name || '',
        'المبلغ المستلم': Number(item?.amount || 0),
      }));

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
  const chartData = React.useMemo(() => {
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
            <span className="font-bold text-gray-900">تقرير الإيرادات (المقبوضات)</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">تقرير الإيرادات (الأساس النقدي)</h1>
          <p className="text-gray-500 mt-1">تفاصيل المبالغ المستلمة في الصندوق والبنك (التدفقات النقدية الداخلة)</p>
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
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <KPICard 
          title="إجمالي المقبوضات" 
          value={new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(totalRevenue)}
          change="-" 
          trend="neutral"
          icon={DollarSign}
          color="green"
          description="مجموع النقد المستلم في الحسابات"
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
                <th className="px-6 py-4 font-bold text-gray-900 text-sm">العميل</th>
                <th className="px-6 py-4 font-bold text-gray-900 text-sm">البيان</th>
                <th className="px-6 py-4 font-bold text-gray-900 text-sm">طريقة الدفع (الحساب)</th>
                <th className="px-6 py-4 font-bold text-gray-900 text-sm">المبلغ المستلم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    جاري تحميل البيانات...
                  </td>
                </tr>
              ) : revenueData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    لا توجد بيانات للفترة المحددة
                  </td>
                </tr>
              ) : (
                revenueData.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                      {new Date(item.date).toLocaleDateString('ar-SA')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                      {item.journal_entries.voucher_number || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-800 font-bold">
                      {item.customer_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-md truncate">
                      {item.description || item.journal_entries.description || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-800">
                        {item.account_name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-green-600">
                      {new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(item.amount)}
                    </td>
                  </tr>
                ))
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
            <th>العميل</th>
            <th>البيان</th>
            <th>طريقة الدفع</th>
            <th>المبلغ</th>
          </tr>
        </thead>
        <tbody>
          {revenueData.map((item) => (
            <tr key={item.id}>
              <td>{new Date(item.date).toLocaleDateString('ar-SA')}</td>
              <td>{item.journal_entries.voucher_number || '-'}</td>
              <td>{item.customer_name}</td>
              <td>{item.description || item.journal_entries.description || '-'}</td>
              <td>{item.account_name}</td>
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
