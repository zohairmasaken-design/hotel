'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { FileText, ArrowRight, Calendar, Download, Search, Filter, User, Hash, CreditCard, Globe, Building, ChevronDown, ChevronUp, Trash2, AlertTriangle } from 'lucide-react';
import RoleGate from '@/components/auth/RoleGate';

interface Operation {
  op_date: string;
  voucher_number: string;
  op_type: string;
  customer_name: string;
  description: string;
  amount: number;
  amount_type: string;
  payment_method: string;
  account_name: string;
  platform_name: string;
  journal_entry_id: string;
  reference_id: string;
  reference_type: string;
}

export default function ComprehensiveReportPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Operation[]>([]);
  const [companyName, setCompanyName] = useState('شموخ الرفاهية ');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [entryDetails, setEntryDetails] = useState<Record<string, any[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('الكل');
  const [platformFilter, setPlatformFilter] = useState('الكل');
  const [customerFilter, setCustomerFilter] = useState('الكل');
  const [accountFilter, setAccountFilter] = useState('الكل');
  const [paymentMethods, setPaymentMethods] = useState<string[]>(['الكل']);
  const [systemIssues, setSystemIssues] = useState<any[]>([]);

  useEffect(() => {
    fetchReport();
    const fetchFilterData = async () => {
      const { data: methods } = await supabase.from('payment_methods').select('name').eq('is_active', true);
      if (methods) {
        setPaymentMethods(['الكل', ...methods.map(m => m.name)]);
      }
    };
    const checkSystemIntegrity = async () => {
      const { data: issues, error } = await supabase.rpc('find_dat-integrity_issues');
      if (!error && issues) {
        setSystemIssues(issues);
      }
    };

    fetchFilterData();
    checkSystemIntegrity();

    try {
      const n = typeof window !== 'undefined' ? localStorage.getItem('companyName') : null;
      const l = typeof window !== 'undefined' ? localStorage.getItem('companyLogo') : null;
      if (n) setCompanyName(n);
      if (l) setCompanyLogo(l);
    } catch {}
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const { data: reportData, error } = await supabase.rpc('get_comprehensive_report', {
        p_start_date: startDate,
        p_end_date: endDate
      });

      if (error) throw error;
      setData(reportData || []);
    } catch (err: any) {
      console.error('Error fetching comprehensive report:', err);
      alert('حدث خطأ أثناء تحميل التقرير الشامل: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesSearch = 
        (item.customer_name || '').includes(searchText) || 
        (item.description || '').includes(searchText) ||
        (item.voucher_number || '').includes(searchText);
      
      const matchesType = typeFilter === 'الكل' || item.op_type === typeFilter;
      const matchesPlatform = platformFilter === 'الكل' || item.platform_name === platformFilter;
      const matchesCustomer = customerFilter === 'الكل' || item.customer_name === customerFilter;
      const matchesAccount = accountFilter === 'الكل' || item.payment_method === accountFilter;
      
      return matchesSearch && matchesType && matchesPlatform && matchesCustomer && matchesAccount;
    });
  }, [data, searchText, typeFilter, platformFilter, customerFilter, accountFilter]);

  const stats = useMemo(() => {
    return filteredData.reduce((acc, item) => {
      if (item.amount_type.includes('+')) acc.totalDebit += Number(item.amount);
      else acc.totalCredit += Number(item.amount);
      return acc;
    }, { totalDebit: 0, totalCredit: 0 });
  }, [filteredData]);

  const uniqueTypes = ['الكل', ...Array.from(new Set(data.map(i => i.op_type)))];
  const uniquePlatforms = ['الكل', ...Array.from(new Set(data.map(i => i.platform_name)))];
  const uniqueCustomers = ['الكل', ...Array.from(new Set(data.map(i => i.customer_name)))];
  const uniqueAccounts = ['الكل', ...Array.from(new Set(data.map(i => i.account_name)))];

  const toggleRow = async (item: Operation, index: number) => {
    const rowKey = `${item.journal_entry_id}-${index}`;
    const newExpanded = new Set(expandedRows);
    
    if (newExpanded.has(rowKey)) {
      newExpanded.delete(rowKey);
    } else {
      newExpanded.add(rowKey);
      
      // Fetch details if not already fetched
      if (!entryDetails[item.journal_entry_id]) {
        setLoadingDetails(prev => ({ ...prev, [item.journal_entry_id]: true }));
        try {
          const { data: details, error } = await supabase
            .from('journal_lines')
            .select(`
              debit,
              credit,
              description,
              account:accounts (name, code)
            `)
            .eq('journal_entry_id', item.journal_entry_id);
          
          if (error) throw error;
          setEntryDetails(prev => ({ ...prev, [item.journal_entry_id]: details || [] }));
        } catch (err) {
          console.error('Error fetching JE details:', err);
        } finally {
          setLoadingDetails(prev => ({ ...prev, [item.journal_entry_id]: false }));
        }
      }
    }
    setExpandedRows(newExpanded);
  };

  const handleUnpost = async (journalEntryId: string) => {
    if (!confirm('هل أنت متأكد من رغبتك في إلغاء ترحيل هذا القيد؟ سيتم حذف القيد وإعادة الفاتورة أو السند المرتبط به إلى حالة \"مسودة\".')) {
      return;
    }

    try {
      const { data, error } = await supabase.rpc('unpost_journal_entry_safely', {
        p_journal_entry_id: journalEntryId
      });

      if (error) throw error;

      alert('تم إلغاء ترحيل القيد بنجاح! يرجى تحديث التقرير.');
      // Refresh data
      fetchReport();
    } catch (err: any) {
      console.error('Error unposting entry:', err);
      alert('حدث خطأ أثناء إلغاء ترحيل القيد: ' + err.message);
    }
  };

  return (
    <RoleGate allow={['admin', 'accountant']}>
      <>
        <style>{`
          @media print {
            header, aside, nav, .screen-only { display: none !important; }
            .print-only { display: block !important; }
            .p-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            .p-table th, .p-table td { border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 10px; }
            .p-table th { background-color: #f2f2f2; }
            .print-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
          }
          .print-only { display: none; }
        `}</style>

        <div className="space-y-6 screen-only p-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
              <Link href="/reports" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <ArrowRight size={24} className="text-gray-500" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="text-amber-600" />
                  التقرير المالي الشامل
                </h1>
                <p className="text-gray-500 text-sm mt-1">عرض كافة العمليات المالية (فواتير، سندات، حجوزات، قيود) في جدول واحد.</p>
              </div>
            </div>
            
            <button 
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors shadow-sm font-medium"
            >
              <Download size={18} />
              طباعة التقرير
            </button>
          </div>

          {/* System Integrity Issues */}
          {systemIssues.length > 0 && (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-800 p-4 rounded-r-lg shadow-md">
              <div className="flex items-center gap-3">
                <AlertTriangle size={24} />
                <div>
                  <h3 className="font-bold">ملاحظات سلامة البيانات ({systemIssues.length})</h3>
                  <p className="text-sm">تم العثور على المشاكل التالية التي قد تؤثر على دقة التقارير:</p>
                </div>
              </div>
              <ul className="mt-3 list-disc list-inside space-y-1 text-sm font-mono bg-white p-3 rounded-md">
                {systemIssues.map((issue, idx) => (
                  <li key={idx}>
                    <strong className="font-bold">[{issue.issue_type}]</strong> {issue.reference_info} - <span className="text-red-600">{issue.details}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Filters */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 flex items-center gap-1">
                  <Calendar size={14} /> من تاريخ
                </label>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 flex items-center gap-1">
                  <Calendar size={14} /> إلى تاريخ
                </label>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
              <div className="md:col-span-2 flex items-end">
                <button 
                  onClick={fetchReport}
                  className="w-full bg-gray-900 text-white py-2 rounded-lg font-bold hover:bg-gray-800 transition-colors"
                >
                  تحديث البيانات
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 pt-4 border-t border-gray-100">
              <div className="relative md:col-span-2">
                <Search size={18} className="absolute right-3 top-2.5 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="بحث حر (رقم قيد، بيان)..." 
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full pr-10 pl-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
              
              <div className="relative">
                <Filter size={18} className="absolute right-3 top-2.5 text-gray-400" />
                <select 
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full pr-10 pl-3 py-2 border border-gray-200 rounded-lg text-sm appearance-none focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  <option value="الكل">كل أنواع العمليات</option>
                  {uniqueTypes.filter(t => t !== 'الكل').map((t, i) => <option key={`type-${i}`} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="relative">
                <Globe size={18} className="absolute right-3 top-2.5 text-gray-400" />
                <select 
                  value={platformFilter}
                  onChange={(e) => setPlatformFilter(e.target.value)}
                  className="w-full pr-10 pl-3 py-2 border border-gray-200 rounded-lg text-sm appearance-none focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  <option value="الكل">كل المنصات</option>
                  {uniquePlatforms.filter(t => t !== 'الكل').map((t, i) => <option key={`platform-${i}`} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="relative">
                <User size={18} className="absolute right-3 top-2.5 text-gray-400" />
                <select 
                  value={customerFilter}
                  onChange={(e) => setCustomerFilter(e.target.value)}
                  className="w-full pr-10 pl-3 py-2 border border-gray-200 rounded-lg text-sm appearance-none focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  <option value="الكل">كل العملاء</option>
                  {uniqueCustomers.filter(t => t !== 'الكل' && t !== '-').map((t, i) => <option key={`customer-${i}`} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="relative md:col-span-2">
                <CreditCard size={18} className="absolute right-3 top-2.5 text-gray-400" />
                <select 
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  className="w-full pr-10 pl-3 py-2 border border-gray-200 rounded-lg text-sm appearance-none focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  <option value="الكل">كل طرق الدفع</option>
                  {paymentMethods.filter(t => t !== 'الكل').map((t, i) => <option key={`account-${i}`} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="md:col-span-3 flex gap-4 items-center justify-end px-2 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-sm py-2">
                  <span className="text-gray-500">إجمالي مدين:</span>
                  <span className="font-bold text-green-600 mr-2">{stats.totalDebit.toLocaleString()} ر.س</span>
                </div>
                <div className="text-sm py-2">
                  <span className="text-gray-500">إجمالي دائن:</span>
                  <span className="font-bold text-red-600 mr-2">{stats.totalCredit.toLocaleString()} ر.س</span>
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-sm font-bold text-gray-900">التاريخ</th>
                    <th className="px-6 py-4 text-sm font-bold text-gray-900">النوع</th>
                    <th className="px-6 py-4 text-sm font-bold text-gray-900">المنصة</th>
                    <th className="px-6 py-4 text-sm font-bold text-gray-900">العميل</th>
                    <th className="px-6 py-4 text-sm font-bold text-gray-900 w-1/4">البيان (رقم الحجز/الغرفة)</th>
                    <th className="px-6 py-4 text-sm font-bold text-gray-900">المبلغ</th>
                    <th className="px-6 py-4 text-sm font-bold text-gray-900">بيان المبلغ</th>
                    <th className="px-6 py-4 text-sm font-bold text-gray-900">الحساب (طريقة الدفع)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={9} className="px-6 py-10 text-center text-gray-500 italic">جاري تحميل البيانات...</td></tr>
                  ) : filteredData.length === 0 ? (
                    <tr><td colSpan={9} className="px-6 py-10 text-center text-gray-500">لا توجد عمليات تطابق البحث</td></tr>
                  ) : (
                    filteredData.map((item, idx) => {
                      const isExpanded = expandedRows.has(`${item.journal_entry_id}-${idx}`);
                      const details = entryDetails[item.journal_entry_id] || [];

                      return (
                        <React.Fragment key={`${item.journal_entry_id}-${idx}`}>
                          <tr 
                            className={`hover:bg-gray-50 transition-colors cursor-pointer ${isExpanded ? 'bg-amber-50/30' : ''}`}
                            onClick={() => toggleRow(item, idx)}
                          >
                            <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                              {new Date(item.op_date).toLocaleDateString('ar-SA')}
                            </td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-700">
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                item.op_type === 'فاتورة' ? 'bg-blue-50 text-blue-700' :
                                item.op_type === 'سند قبض/صرف' ? 'bg-green-50 text-green-700' :
                                item.op_type === 'حجز سكن' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-700'
                              }`}>
                                {item.op_type}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                {item.platform_name}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-gray-900">
                              {item.customer_name}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600 leading-relaxed">
                              {item.description}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold font-mono">
                              {Number(item.amount).toLocaleString()} ر.س
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <span className={item.amount_type.includes('+') ? 'text-green-600' : 'text-red-600'}>
                                {item.amount_type}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {item.payment_method}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-400">
                              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </td>
                          </tr>
                          
                          {isExpanded && (
                            <tr className="bg-gray-50/50">
                              <td colSpan={9} className="px-12 py-4">
                                <div className="bg-white border border-amber-100 rounded-xl shadow-inner overflow-hidden">
                                  <div className="bg-amber-50 px-4 py-2 border-b border-amber-100 flex justify-between items-center">
                                    <h4 className="text-xs font-bold text-amber-800 flex items-center gap-2">
                                      <Hash size={14} />
                                      تفاصيل الترحيل المحاسبي (قيد رقم: {item.voucher_number})
                                    </h4>
                                    <button
                                      onClick={() => handleUnpost(item.journal_entry_id)}
                                      className="flex items-center gap-1 px-3 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-md text-xs font-bold transition-colors border border-red-200"
                                      title="حذف القيد وإعادة الفاتورة/السند إلى مسودة"
                                    >
                                      <Trash2 size={14} />
                                      إلغاء الترحيل
                                    </button>
                                  </div>
                                  <table className="w-full text-right text-xs">
                                    <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100">
                                      <tr>
                                        <th className="px-4 py-2">الحساب</th>
                                        <th className="px-4 py-2">البيان</th>
                                        <th className="px-4 py-2">مدين (+)</th>
                                        <th className="px-4 py-2">دائن (-)</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                      {loadingDetails[item.journal_entry_id] ? (
                                        <tr>
                                          <td colSpan={4} className="px-4 py-4 text-center text-gray-400 italic">
                                            جاري تحميل تفاصيل القيد...
                                          </td>
                                        </tr>
                                      ) : details.length > 0 ? (
                                        details.map((line, lIdx) => (
                                          <tr key={lIdx} className="hover:bg-gray-50/50">
                                            <td className="px-4 py-2 font-medium text-gray-900">
                                              {line.account?.name} ({line.account?.code})
                                            </td>
                                            <td className="px-4 py-2 text-gray-500">
                                              {line.description || item.description}
                                            </td>
                                            <td className="px-4 py-2 font-mono text-green-600 font-bold">
                                              {Number(line.debit) > 0 ? Number(line.debit).toLocaleString() : '-'}
                                            </td>
                                            <td className="px-4 py-2 font-mono text-red-600 font-bold">
                                              {Number(line.credit) > 0 ? Number(line.credit).toLocaleString() : '-'}
                                            </td>
                                          </tr>
                                        ))
                                      ) : (
                                        <tr>
                                          <td colSpan={4} className="px-4 py-4 text-center text-gray-400 italic">
                                            لا توجد تفاصيل متاحة لهذا القيد
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
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Print Layout */}
        <div className="print-only p-8">
          <div className="print-header">
            <div>
              <h1 className="text-xl font-bold">{companyName}</h1>
              <p className="text-sm">التقرير المالي الشامل</p>
            </div>
            <div className="text-left text-xs">
              <p>من تاريخ: {startDate}</p>
              <p>إلى تاريخ: {endDate}</p>
              <p>تاريخ الطباعة: {new Date().toLocaleDateString('ar-SA')}</p>
            </div>
          </div>

          <div className="flex justify-between my-4 text-sm border p-4 rounded bg-gray-50">
             <div>إجمالي مدين: <strong>{stats.totalDebit.toLocaleString()} ر.س</strong></div>
             <div>إجمالي دائن: <strong>{stats.totalCredit.toLocaleString()} ر.س</strong></div>
             <div>الصافي: <strong>{(stats.totalDebit - stats.totalCredit).toLocaleString()} ر.س</strong></div>
          </div>

          <table className="p-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>المنصة</th>
                <th>العميل</th>
                <th>البيان</th>
                <th>المبلغ</th>
                <th>البيان</th>
                <th>الحساب</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item, idx) => (
                <tr key={idx}>
                  <td>{new Date(item.op_date).toLocaleDateString('ar-SA')}</td>
                  <td>{item.op_type}</td>
                  <td>{item.platform_name}</td>
                  <td>{item.customer_name}</td>
                  <td>{item.description}</td>
                  <td>{Number(item.amount).toLocaleString()}</td>
                  <td>{item.amount_type}</td>
                  <td>{item.account_name}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-12 flex justify-between px-10">
            <div className="text-center">
              <div className="font-bold mb-8 italic">توقيع المحاسب</div>
              <div className="border-t border-black w-32"></div>
            </div>
            <div className="text-center">
              <div className="font-bold mb-8 italic">توقيع المدير</div>
              <div className="border-t border-black w-32"></div>
            </div>
          </div>
        </div>
      </>
    </RoleGate>
  );
}
