'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Users, ArrowRight, Calendar, Download, ChevronDown as ChevronDownIcon, FileText } from 'lucide-react';
import RoleGate from '@/components/auth/RoleGate';

interface Row {
  customer_id: string;
  customer_name: string;
  invoices_count: number;
  total_invoiced: number;
  total_paid: number;
  total_remaining: number;
}

export default function ReceivablesReportPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [detailsByCustomer, setDetailsByCustomer] = useState<Record<string, any[]>>({});
  const [contactByCustomer, setContactByCustomer] = useState<Record<string, { phone?: string; email?: string; name: string }>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [contactExpanded, setContactExpanded] = useState<Set<string>>(new Set());
  const [companyName, setCompanyName] = useState('شموخ الرفاهية ');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    fetchReport();
    try {
      const n = typeof window !== 'undefined' ? localStorage.getItem('companyName') : null;
      const l = typeof window !== 'undefined' ? localStorage.getItem('companyLogo') : null;
      if (n) setCompanyName(n);
      if (l) setCompanyLogo(l);
    } catch {}
  }, []);

  const fetchReport = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { data: reportData, error: reportError } = await supabase
        .rpc('get_receivables_report_v2', {
          p_start_date: startDate,
          p_end_date: endDate
        });

      if (reportError) throw reportError;

      const list: Row[] = (reportData || []).map((r: any) => ({
        customer_id: r.customer_id,
        customer_name: r.customer_name,
        invoices_count: Number(r.invoices_count || 0),
        total_invoiced: Number(r.total_invoiced || 0),
        total_paid: Number(r.total_paid || 0),
        total_remaining: Number(r.total_remaining || 0)
      }));

      const contactMap: Record<string, { phone?: string; email?: string; name: string }> = {};

      if (list.length > 0) {
        const customerIds = list.map(r => r.customer_id);
        const { data: customers } = await supabase
          .from('customers')
          .select('id, full_name, phone, email')
          .in('id', customerIds);
        
        (customers || []).forEach(c => {
          contactMap[c.id] = {
            name: c.full_name,
            phone: c.phone || undefined,
            email: c.email || undefined
          };
        });
      }

      setRows(list);
      setContactByCustomer(contactMap);
      setSearchText('');
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Error building receivables report:', err);
      alert('حدث خطأ أثناء تحميل تقرير المديونية: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerDetails = async (customerId: string) => {
    if (detailsByCustomer[customerId]) return; // Already fetched

    try {
      const { data, error } = await supabase.rpc('get_customer_statement', {
        p_customer_id: customerId,
        p_start_date: startDate,
        p_end_date: endDate
      });

      if (error) throw error;

      setDetailsByCustomer(prev => ({
        ...prev,
        [customerId]: data || []
      }));
    } catch (err) {
      console.error('Error fetching customer details:', err);
    }
  };

  const toggleExpand = (customerId: string) => {
    const next = new Set(expanded);
    if (next.has(customerId)) {
      next.delete(customerId);
    } else {
      next.add(customerId);
      fetchCustomerDetails(customerId);
    }
    setExpanded(next);
  };

  const filteredRows = useMemo(() => {
    const t = searchText.trim();
    if (!t) return rows;
    return rows.filter((r) => (r.customer_name || '').includes(t));
  }, [rows, searchText]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        acc.customers += 1;
        acc.invoices += Number(r.invoices_count || 0);
        acc.invoiced += Number(r.total_invoiced || 0);
        acc.paid += Number(r.total_paid || 0);
        acc.remaining += Number(r.total_remaining || 0);
        return acc;
      },
      { customers: 0, invoices: 0, invoiced: 0, paid: 0, remaining: 0 }
    );
  }, [filteredRows]);

  const formatDate = (d?: string | null) => {
    if (!d) return '-';
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return '-';
      return dt.toLocaleDateString('ar-SA');
    } catch {
      return '-';
    }
  };
  const sanitizePhone = (p?: string) => (p || '').replace(/\D/g, '');
  const composeMessage = (name: string, r: Row) => {
    return `عميلنا ${name}، المديونية الحالية: ${r.total_remaining.toLocaleString()} ر.س عن ${r.invoices_count} فاتورة خلال الفترة ${startDate} إلى ${endDate}. شاكرين تعاونكم.`;
  };

  return (
    <RoleGate allow={['admin','manager','accountant','marketing']}>
    <>
      <style>{`
        .screen-only { display: block; }
        .print-only { display: none; }
        @media print {
          .screen-only { display: none !important; }
          .print-only { display: block !important; }
          header, aside, nav, .sticky, .fixed { display: none !important; }
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
              <Users className="text-rose-600" />
              تقرير المديونية
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              كشف بالمديونية حسب العملاء بناءً على الفواتير والمدفوعات المرتبطة بها.
            </p>
          </div>
        </div>
+
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download size={18} />
          <span>طباعة / تصدير</span>
        </button>
      </div>
+
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchReport();
          }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 items-end"
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
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs sm:text-sm font-medium text-gray-700">بحث بالعميل</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="اسم العميل"
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
+
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-sm text-gray-500 mb-1">عدد العملاء</div>
          <div className="text-2xl font-bold text-gray-900">{totals.customers.toLocaleString()}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-sm text-gray-500 mb-1">إجمالي المدين (الفواتير)</div>
          <div className="text-2xl font-bold text-green-600 font-mono">
            {totals.invoiced.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-sm text-gray-500 mb-1">إجمالي الدائن (المقبوضات)</div>
          <div className="text-2xl font-bold text-red-600 font-mono">
            {totals.paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 shadow-sm">
          <div className="text-sm text-blue-600 mb-1">إجمالي المديونية</div>
          <div className="text-2xl font-bold text-blue-900 font-mono">
            {totals.remaining.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right min-w-[1000px]">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 font-bold text-gray-900">العميل</th>
                <th className="px-6 py-4 font-bold text-gray-900 text-center">عدد العمليات</th>
                <th className="px-6 py-4 font-bold text-gray-900">إجمالي مدين</th>
                <th className="px-6 py-4 font-bold text-gray-900">إجمالي دائن</th>
                <th className="px-6 py-4 font-bold text-gray-900">المتبقي (الرصيد)</th>
                <th className="px-6 py-4 font-bold text-gray-900 text-center">كشف تفصيلي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.length > 0 ? (
                filteredRows.map((r) => {
                  const isOpen = expanded.has(r.customer_id);
                  const details = detailsByCustomer[r.customer_id] || [];
                  
                  return (
                    <React.Fragment key={r.customer_id}>
                      <tr className="hover:bg-gray-50 transition-colors odd:bg-white even:bg-gray-50">
                        <td className="px-6 py-4 font-medium text-gray-900">
                          {r.customer_name}
                        </td>
                        <td className="px-6 py-4 text-gray-700 text-center">
                          {r.invoices_count.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 font-bold text-green-700 font-mono">
                          {r.total_invoiced.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 font-bold text-red-700 font-mono">
                          {r.total_paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 font-extrabold text-blue-900 font-mono">
                          {r.total_remaining.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => toggleExpand(r.customer_id)}
                            className={`p-2 rounded-full transition-colors ${
                              isOpen ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            <ChevronDownIcon size={20} className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-gray-50">
                          <td colSpan={6} className="px-8 py-6">
                            <div className="bg-white rounded-xl shadow-inner border border-gray-200 overflow-hidden">
                              <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                                <h4 className="font-bold text-blue-900 flex items-center gap-2">
                                  <FileText size={16} />
                                  كشف حساب تفصيلي: {r.customer_name}
                                </h4>
                                <Link 
                                  href={`/accounting/statement?mode=customer&id=${r.customer_id}`}
                                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                >
                                  فتح في صفحة كشف الحساب
                                </Link>
                              </div>
                              <table className="w-full text-right text-sm">
                                <thead className="bg-gray-100 text-gray-700 font-bold">
                                  <tr>
                                    <th className="px-4 py-3">التاريخ</th>
                                    <th className="px-4 py-3">رقم القيد/المرجع</th>
                                    <th className="px-4 py-3 w-1/3">البيان</th>
                                    <th className="px-4 py-3">مدين (+)</th>
                                    <th className="px-4 py-3">دائن (-)</th>
                                    <th className="px-4 py-3">الرصيد</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {details.length > 0 ? (
                                    details.map((d: any, idx: number) => (
                                      <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                                        <td className="px-4 py-3 text-gray-600">
                                          {formatDate(d.transaction_date)}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-blue-600">
                                          {d.voucher_number || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-gray-800">
                                          {d.description}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-green-700">
                                          {Number(d.debit) > 0 ? Number(d.debit).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-red-700">
                                          {Number(d.credit) > 0 ? Number(d.credit).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                                        </td>
                                        <td className="px-4 py-3 font-mono font-bold text-gray-900 dir-ltr text-right">
                                          {Number(d.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </td>
                                      </tr>
                                    ))
                                  ) : (
                                    <tr>
                                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500 italic">
                                        جاري تحميل البيانات أو لا توجد حركات...
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    لا توجد بيانات ضمن الفترة المحددة
                  </td>
                </tr>
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
            <div className="print-sub">تقرير المديونية</div>
          </div>
        </div>
        <div>
          <div className="print-sub">الفترة: {startDate} إلى {endDate}</div>
        </div>
      </div>
      <table className="p-table print-summary">
        <thead>
          <tr>
            <th>إجمالي الفواتير</th>
            <th>إجمالي المدفوع</th>
            <th>إجمالي المديونية</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{totals.invoiced.toLocaleString()} ر.س</td>
            <td>{totals.paid.toLocaleString()} ر.س</td>
            <td>{totals.remaining.toLocaleString()} ر.س</td>
          </tr>
        </tbody>
      </table>
      <table className="p-table">
        <thead>
          <tr>
            <th>العميل</th>
            <th>عدد الفواتير</th>
            <th>إجمالي الفواتير</th>
            <th>إجمالي المدفوع</th>
            <th>المتبقي</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((r) => (
            <tr key={r.customer_id}>
              <td>{r.customer_name}</td>
              <td>{r.invoices_count.toLocaleString()}</td>
              <td>{r.total_invoiced.toLocaleString()} ر.س</td>
              <td>{r.total_paid.toLocaleString()} ر.س</td>
              <td>{r.total_remaining.toLocaleString()} ر.س</td>
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
    </RoleGate>
  );
}
