'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Building2, 
  Wallet, 
  ArrowRightLeft, 
  TrendingUp, 
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Calendar,
  CreditCard,
  ChevronLeft,
  ListFilter,
  ExternalLink,
  History,
  User,
  Home,
  Trash2,
  Loader2
} from 'lucide-react';
import Link from 'next/link';
import RoleGate from '@/components/auth/RoleGate';
import { format } from 'date-fns';

interface PlatformBalance {
  account_id: string;
  account_name: string;
  payment_method_name: string;
  balance: number;
  last_transaction_date: string;
}

interface SettlementReportRow {
  transaction_date: string;
  platform_name: string;
  voucher_number: string;
  booking_id: string;
  booking_id_full: string;
  unit_number: string;
  customer_name: string;
  debit: number;
  credit: number;
  commission_amount: number;
  net_amount: number;
  description: string;
  reference_type: string;
}

interface BankAccount {
  id: string;
  name: string;
}

export default function PlatformAccountingPage() {
  const [platforms, setPlatforms] = useState<PlatformBalance[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [settlements, setSettlements] = useState<SettlementReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  
  // Settlement Modal State
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformBalance | null>(null);
  const [settleAmount, setSettleAmount] = useState<string>('');
  const [commissionAmount, setCommissionAmount] = useState<string>('0');
  const [targetBankId, setTargetBankId] = useState<string>('');
  const [settleDate, setSettleDate] = useState(new Date().toISOString().split('T')[0]);
  const [settleReference, setSettleReference] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState<string>('');
  const [settlementRows, setSettlementRows] = useState<{ bookingId: string, amount: string, commission: string, bankId: string }[]>([]);
  const [processing, setProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [bookings, setBookings] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
    fetchBookings();
  }, []);

  const addSettlementRow = (initialData: any = {}) => {
    setSettlementRows([...settlementRows, { 
      bookingId: initialData.bookingId || '', 
      amount: initialData.amount || '0', 
      commission: '0', 
      bankId: targetBankId 
    }]);
  };

  const removeSettlementRow = (index: number) => {
    setSettlementRows(settlementRows.filter((_, i) => i !== index));
  };

  const updateSettlementRow = (index: number, field: string, value: string) => {
    const newRows = [...settlementRows];
    (newRows[index] as any)[field] = value;
    setSettlementRows(newRows);
  };

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchPlatforms(), fetchBankAccounts(), fetchSettlementsReport()]);
    setLoading(false);
  };

  const fetchBookings = async () => {
    // We fetch a larger set of bookings to ensure we find what the user is looking for.
    // We remove the strict platform_name filter because some bookings might have it missing
    // but still belong to a platform in the accounting records.
    const { data } = await supabase
      .from('bookings')
      .select('id, platform_name, total_price, customer:customers(full_name), unit:units(unit_number)')
      .order('created_at', { ascending: false })
      .limit(1000); 
    setBookings(data || []);
  };

  const filteredBookings = useMemo(() => {
    if (!selectedPlatform) return [];
    
    // 1. Get bookings from the ledger (actual financial records)
    const platformIncomes = settlements.filter(s => 
      s.platform_name === selectedPlatform.account_name && 
      s.debit > 0 && 
      s.booking_id !== 'N/A'
    );

    const bookingsFromLedger = platformIncomes.map(s => ({
      id: s.booking_id_full,
      customer: { full_name: s.customer_name },
      unit: { unit_number: s.unit_number },
      total_price: s.debit,
      platform_name: s.platform_name,
      isFromLedger: true
    })).filter(b => b.id);

    const uniqueLedgerBookings = Array.from(new Map(bookingsFromLedger.map(b => [b.id, b])).values());

    // 2. Get bookings from the general list that match the platform name
    const pName = (selectedPlatform.account_name || '').toLowerCase();
    const searchTermLower = searchTerm.toLowerCase();

    const matchedFromGeneral = bookings.filter(b => {
      const bPlatform = (b.platform_name || '').toLowerCase();
      const bCustomer = (b.customer?.full_name || '').toLowerCase();
      const bUnit = (b.unit?.unit_number || '').toLowerCase();
      const bId = (b.id || '').toLowerCase();

      // If there's a search term, use it across all fields
      if (searchTerm) {
        return bId.includes(searchTermLower) || 
               bCustomer.includes(searchTermLower) || 
               bUnit.includes(searchTermLower) ||
               bPlatform.includes(searchTermLower);
      }

      // Default platform matching
      if (bPlatform === pName) return true;
      if ((pName.includes('ايجار') || pName.includes('ajar')) && 
          (bPlatform.includes('ajar') || bPlatform.includes('ايجار') || bPlatform.includes('ejar'))) {
        return true;
      }
      if (pName.includes('booking') && bPlatform.includes('booking')) return true;
      if (pName.includes('gathern') && (bPlatform.includes('gathern') || bPlatform.includes('جاذر'))) return true;
      if (pName.includes('airbnb') && bPlatform.includes('airbnb')) return true;
      if (pName.includes('agoda') && bPlatform.includes('agoda')) match = true;
      
      return false;
    });

    // Merge and deduplicate
    const combined = [...uniqueLedgerBookings];
    matchedFromGeneral.forEach(b => {
      if (!combined.find(m => m.id === b.id)) {
        combined.push(b);
      }
    });

    return combined;
  }, [settlements, selectedPlatform, bookings, searchTerm]);

  const fetchPlatforms = async () => {
    const { data, error } = await supabase.rpc('get_platform_balances');
    if (error) console.error('Error fetching platforms:', error);
    else setPlatforms(data || []);
  };

  const fetchSettlementsReport = async () => {
    setLoadingReport(true);
    try {
      // Pass an empty object as params to ensure Supabase matches the function signature
      const { data, error } = await supabase.rpc('get_platform_settlements_report', {});
      if (error) {
        console.error('Full Error Details:', error);
        alert('حدث خطأ أثناء جلب السجل: ' + (error.message || 'خطأ غير معروف'));
      } else {
        setSettlements(data || []);
      }
    } catch (err: any) {
      console.error('Unexpected error:', err);
    } finally {
      setLoadingReport(false);
    }
  };

  const handleUnpostSettlement = async (voucherNumber: string) => {
    if (!confirm('هل أنت متأكد من إلغاء هذه التسوية؟ سيتم حذف القيد المحاسبي بالكامل وعودة الرصيد للمنصة.')) return;
    
    setLoadingReport(true);
    try {
      const { error } = await supabase.rpc('unpost_platform_settlement', {
        p_voucher_number: voucherNumber
      });
      
      if (error) {
        alert('فشل إلغاء التسوية: ' + error.message);
      } else {
        await fetchData(); // Refresh all data
      }
    } catch (err: any) {
      alert('حدث خطأ غير متوقع: ' + err.message);
    } finally {
      setLoadingReport(false);
    }
  };

  const handleQuickSettle = (row: SettlementReportRow) => {
    if (row.debit <= 0 || row.booking_id === 'N/A') return;
    
    // Find the platform object
    const platform = platforms.find(p => p.account_name === row.platform_name);
    if (!platform) return;

    setSelectedPlatform(platform);
    setSettleAmount(row.debit.toString());
    setSettleDate(new Date().toISOString().split('T')[0]);
    setSettleReference('');
    setCommissionAmount('0');
    setSelectedBookingId(row.booking_id_full);
    setSettlementRows([]); 
    setIsSettleModalOpen(true);
  };

  const fetchBankAccounts = async () => {
    // Fetch accounts under Fund (1100) -> Cash(1101) & Bank(1102) are children.
    // We can just fetch all Asset accounts that are NOT the platforms.
    // Better: Fetch payment methods accounts (which are usually cash/bank).
    const { data } = await supabase
      .from('accounts')
      .select('id, name')
      .in('code', ['1101', '1102']); // Cash and Bank specifically
    
    setBankAccounts(data || []);
    if (data && data.length > 0) setTargetBankId(data[0].id);
  };

  const handleOpenSettle = (platform: PlatformBalance) => {
    setSelectedPlatform(platform);
    setSettleAmount(platform.balance.toString());
    setSettleDate(new Date().toISOString().split('T')[0]);
    setSettleReference('');
    setCommissionAmount('0');
    setSelectedBookingId('');
    setSettlementRows([]);
    setIsSettleModalOpen(true);
  };

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlatform) {
      alert('يرجى اختيار المنصة');
      return;
    }

    setProcessing(true);
    try {
      // 1. If we have multiple rows, process each one
      if (settlementRows.length > 0) {
        let hasError = false;
        let lastError = '';
        
        for (const row of settlementRows) {
          // Validate UUID (very important to avoid database errors)
          if (!row.bookingId || row.bookingId.length < 32 || Number(row.amount) <= 0 || !row.bankId) continue;
          
          const { error } = await supabase.rpc('settle_platform_payment', {
            p_platform_account_id: selectedPlatform.account_id,
            p_target_bank_id: row.bankId,
            p_amount: Number(row.amount),
            p_commission: Number(row.commission),
            p_settlement_date: settleDate,
            p_reference_number: settleReference,
            p_booking_id: row.bookingId
          });
          if (error) {
            console.error('Error settling row:', error);
            hasError = true;
            lastError = error.message || JSON.stringify(error);
          }
        }
        if (hasError) {
          alert('تمت معالجة بعض التسويات وحدث خطأ في البعض الآخر: ' + lastError);
          // Still refresh data to show what was settled
          await fetchData();
        } else {
          setIsSettleModalOpen(false);
          await fetchData();
          alert('تمت التسوية بنجاح');
        }
      } else {
        // 2. Single general settlement (Legacy/Simple mode)
        // Ensure selectedBookingId is a valid UUID or null
        const bookingIdToPass = (selectedBookingId && selectedBookingId.length >= 32) ? selectedBookingId : null;
        
        const { error } = await supabase.rpc('settle_platform_payment', {
          p_platform_account_id: selectedPlatform.account_id,
          p_target_bank_id: targetBankId,
          p_amount: Number(settleAmount),
          p_commission: Number(commissionAmount),
          p_settlement_date: settleDate,
          p_reference_number: settleReference,
          p_booking_id: bookingIdToPass
        });
        if (error) throw error;

        setIsSettleModalOpen(false);
        await fetchData();
        alert('تمت التسوية بنجاح');
      }
    } catch (err: any) {
      alert('فشل إجراء التسوية: ' + (err.message || JSON.stringify(err)));
    } finally {
      setProcessing(false);
    }
  };

  const totalReceivables = platforms.reduce((sum, p) => sum + (p.balance || 0), 0);

  return (
    <RoleGate allow={['admin', 'accountant']}>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="text-blue-600" />
            إدارة منصات الحجز
          </h1>
          <p className="text-gray-500 mt-1">متابعة مديونيات المنصات (Booking, Agoda, etc.) وتسوية الدفعات</p>
        </div>
        
        <div className="flex gap-3">
            <Link 
                href="/settings/payment-methods"
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
                <CreditCard size={18} />
                إعداد طرق الدفع
            </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">إجمالي مستحقات المنصات</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-2">
                {totalReceivables.toLocaleString('en-US')} <span className="text-sm font-normal text-gray-500">SAR</span>
              </h3>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
              <Wallet size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">عدد المنصات النشطة</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-2">
                {platforms.filter(p => p.balance > 0).length}
              </h3>
            </div>
            <div className="p-3 bg-green-50 rounded-xl text-green-600">
              <TrendingUp size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Platforms Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900">أرصدة المنصات الحالية</h2>
        </div>
        
        {loading ? (
          <div className="p-12 text-center text-gray-500">جاري التحميل...</div>
        ) : platforms.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-lg font-medium text-gray-900">لا توجد أرصدة للمنصات</h3>
            <p className="text-gray-500 mt-2 max-w-md mx-auto">
              تأكد من إعداد طرق الدفع وربطها بحسابات تحت بند "أرصدة منصات الحجز" (1120).
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-6 py-4 text-right text-sm font-medium text-gray-500">المنصة / الحساب</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-gray-500">طريقة الدفع المرتبطة</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-gray-500">الرصيد الحالي</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-gray-500">آخر حركة</th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-gray-500">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {platforms.map((platform) => (
                  <tr key={platform.account_id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{platform.account_name}</div>
                    </td>
                    <td className="px-6 py-4">
                      {platform.payment_method_name ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {platform.payment_method_name}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className={`font-bold ${platform.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {platform.balance.toLocaleString('en-US')} SAR
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {platform.balance > 0 ? 'لنا (مدين)' : 'علينا (دائن)'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-sm">
                      {platform.last_transaction_date || '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {platform.balance > 0 && (
                        <button
                          onClick={() => handleOpenSettle(platform)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-sm font-medium"
                        >
                          <DollarSign size={16} />
                          تسوية / استلام
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Settlements Report Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                <History size={20} />
            </div>
            <div>
                <h2 className="text-lg font-bold text-gray-900">سجل تسويات المنصات</h2>
                <p className="text-xs text-gray-500 mt-0.5">تفاصيل المبالغ المحصلة ومصدرها من الحجوزات</p>
            </div>
          </div>
          <button 
            onClick={fetchSettlementsReport}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            تحديث السجل
          </button>
        </div>

        {loadingReport ? (
          <div className="p-12 text-center text-gray-500">جاري تحميل السجل...</div>
        ) : settlements.length === 0 ? (
          <div className="p-12 text-center text-gray-500">لا توجد عمليات تسوية مسجلة حالياً</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-6 py-4 text-right text-gray-500 font-medium">التاريخ / السند</th>
                  <th className="px-6 py-4 text-right text-gray-500 font-medium">النوع</th>
                  <th className="px-6 py-4 text-right text-gray-500 font-medium">المنصة</th>
                  <th className="px-6 py-4 text-right text-gray-500 font-medium">الحجز / الوحدة</th>
                  <th className="px-6 py-4 text-right text-gray-500 font-medium">العميل</th>
                  <th className="px-6 py-4 text-right text-gray-500 font-medium">المبالغ</th>
                  <th className="px-6 py-4 text-right text-gray-500 font-medium">البيان</th>
                  <th className="px-6 py-4 text-center text-gray-500 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {settlements.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{format(new Date(row.transaction_date), 'dd/MM/yyyy')}</div>
                      <div className="text-[10px] font-mono text-gray-400 mt-1 uppercase">{row.voucher_number}</div>
                    </td>
                    <td className="px-6 py-4">
                      {row.debit > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-100">
                          إيراد حجز
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                          تسوية بنكية
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-900">{row.platform_name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        {row.booking_id !== 'N/A' ? (
                          <Link 
                            href={`/bookings-list/${row.booking_id}`}
                            className="inline-flex items-center gap-1 text-blue-600 hover:underline font-mono font-bold"
                          >
                            #{row.booking_id}
                            <ExternalLink size={12} />
                          </Link>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                        {row.unit_number !== 'N/A' && (
                            <div className="flex items-center gap-1 text-xs text-gray-600">
                                <Home size={12} />
                                {row.unit_number}
                            </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {row.customer_name !== 'N/A' ? (
                        <div className="flex items-center gap-1 text-gray-700">
                            <User size={14} className="text-gray-400" />
                            {row.customer_name}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {row.debit > 0 ? (
                          <div className="flex justify-between gap-4">
                              <span className="text-gray-500 text-xs">الوارد:</span>
                              <span className="font-bold text-green-600">+{row.debit.toLocaleString()} SAR</span>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex justify-between gap-4">
                                <span className="text-gray-500 text-xs">المسوى:</span>
                                <span className="font-bold text-red-600">-{row.credit.toLocaleString()} SAR</span>
                            </div>
                            {row.commission_amount > 0 && (
                                <div className="flex justify-between gap-4 text-amber-600 text-[11px]">
                                    <span>العمولة:</span>
                                    <span>-{row.commission_amount.toLocaleString()} SAR</span>
                                </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-xs max-w-xs leading-relaxed">
                      {row.description}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {row.credit > 0 && (
                        <button
                          onClick={() => handleUnpostSettlement(row.voucher_number)}
                          disabled={loadingReport}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="إلغاء التسوية"
                        >
                          {loadingReport ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        </button>
                      )}
                      {row.debit > 0 && (
                        <button
                          onClick={() => handleQuickSettle(row)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-xs font-bold"
                          title="تسوية هذا الحجز فقط"
                        >
                          <DollarSign size={14} />
                          تسوية
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Settle Modal */}
      {isSettleModalOpen && selectedPlatform && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 sm:p-4 backdrop-blur-sm transition-all duration-300">
          <div className="bg-white sm:rounded-2xl shadow-2xl w-full max-w-3xl max-h-[100dvh] sm:max-h-[90dvh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/80 sticky top-0 z-10 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 text-white rounded-lg shadow-sm shadow-blue-200">
                  <DollarSign size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 leading-tight">تسوية رصيد {selectedPlatform.account_name}</h3>
                  <p className="text-xs text-gray-500 font-medium">معالجة التحويلات البنكية وتوزيعها</p>
                </div>
              </div>
              <button 
                onClick={() => setIsSettleModalOpen(false)}
                className="text-gray-400 hover:text-gray-900 p-2 rounded-xl hover:bg-gray-100 transition-all duration-200"
              >
                <ChevronLeft className="rotate-180" size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSettle} className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="p-4 sm:p-8 space-y-8">
                {/* Summary Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-2xl text-white shadow-lg shadow-blue-100">
                    <p className="text-blue-100 text-xs font-medium mb-1 opacity-90">الرصيد المستحق (مدين)</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black tracking-tight">{selectedPlatform.balance.toLocaleString()}</span>
                      <span className="text-sm font-bold opacity-80 uppercase">SAR</span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2 text-[11px] text-blue-50 font-medium">
                      <AlertCircle size={14} className="opacity-80" />
                      <span>سيتم إقفال هذا المبلغ أو جزء منه في الحساب البنكي</span>
                    </div>
                  </div>

                  <div className="bg-amber-50 p-5 rounded-2xl border border-amber-100 flex flex-col justify-center">
                    <div className="flex items-center gap-2 text-amber-800 font-bold text-sm mb-2">
                      <TrendingUp size={16} />
                      صافي المبلغ للإيداع
                    </div>
                    <div className="flex items-baseline gap-2 text-amber-600">
                      <span className="text-3xl font-black tracking-tight">
                        {(parseFloat(settleAmount || '0') - parseFloat(commissionAmount || '0')).toLocaleString()}
                      </span>
                      <span className="text-sm font-bold opacity-80 uppercase">SAR</span>
                    </div>
                    <p className="text-[10px] text-amber-700/70 font-bold mt-2 leading-relaxed">
                      * المبلغ الصافي بعد استقطاع العمولات
                    </p>
                  </div>
                </div>

                {/* Main Inputs Grid */}
                <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                        <Building2 size={16} className="text-blue-500" />
                        إيداع في حساب (البنك)
                      </label>
                      <select
                        className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none bg-white shadow-sm transition-all text-sm font-bold"
                        value={targetBankId}
                        onChange={(e) => setTargetBankId(e.target.value)}
                        required
                      >
                        <option value="">اختر الحساب البنكي المستلم...</option>
                        {bankAccounts.map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                        <Calendar size={16} className="text-blue-500" />
                        تاريخ التسوية
                      </label>
                      <input
                        type="date"
                        required
                        className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none bg-white shadow-sm transition-all text-sm font-bold"
                        value={settleDate}
                        onChange={(e) => setSettleDate(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                        <ArrowRightLeft size={16} className="text-blue-500" />
                        رقم مرجعي / حوالة
                      </label>
                      <input
                        type="text"
                        placeholder="مثلاً: TRF-102938"
                        className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none bg-white shadow-sm transition-all text-sm font-bold placeholder:text-gray-400"
                        value={settleReference}
                        onChange={(e) => setSettleReference(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Distribution Section */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-1">
                    <div>
                      <h4 className="text-sm font-black text-gray-900 flex items-center gap-2">
                        <ListFilter size={18} className="text-blue-600" />
                        توزيع التسوية على الحجوزات
                      </h4>
                      <p className="text-[11px] text-gray-500 mt-0.5 font-medium">يمكنك توزيع الحوالة على أكثر من حجز أو تركها عامة</p>
                    </div>
                    <button 
                      type="button"
                      onClick={() => addSettlementRow()}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 text-xs bg-blue-600 text-white px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-sm shadow-blue-100 font-bold"
                    >
                      <Home size={14} />
                      + إضافة حجز للتوزيع
                    </button>
                  </div>
                  
                  {settlementRows.length > 0 ? (
                    <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                      {settlementRows.map((row, index) => (
                        <div key={index} className="group bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-sm hover:border-blue-200 hover:shadow-md transition-all relative">
                          <button 
                            type="button"
                            onClick={() => removeSettlementRow(index)}
                            className="absolute -left-2 -top-2 bg-red-100 text-red-600 p-2 rounded-xl opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:bg-red-200"
                          >
                            <Trash2 size={14} />
                          </button>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                          <div className="sm:col-span-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5 block">البحث عن حجز (رقم، عميل، وحدة)</label>
                            <input 
                              type="text"
                              placeholder="ابحث هنا لتصفية القائمة..."
                              className="w-full p-2 mb-2 border border-blue-100 rounded-lg text-xs bg-blue-50/30 outline-none focus:border-blue-300"
                              onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5 block">اختيار الحجز والعميل</label>
                            <select
                              value={row.bookingId}
                              onChange={(e) => updateSettlementRow(index, 'bookingId', e.target.value)}
                              className="w-full p-3 border border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500 bg-gray-50/50 transition-all"
                            >
                              <option value="">-- اختر من الحجوزات المستحقة ({filteredBookings.length}) --</option>
                              {filteredBookings.map((b) => (
                                <option key={b.id} value={b.id}>
                                  #{b.id.slice(0, 8).toUpperCase()} - {b.customer?.full_name} ({b.unit?.unit_number}) - {b.total_price} SAR
                                </option>
                              ))}
                            </select>
                          </div>

                            <div>
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5 block">البنك / الحساب</label>
                              <select
                                value={row.bankId}
                                onChange={(e) => updateSettlementRow(index, 'bankId', e.target.value)}
                                className="w-full p-3 border border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500 bg-gray-50/50 transition-all"
                              >
                                {bankAccounts.map((bank) => (
                                  <option key={bank.id} value={bank.id}>{bank.name}</option>
                                ))}
                              </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5 block">المبلغ (شامل)</label>
                                <input
                                  type="number"
                                  value={row.amount}
                                  onChange={(e) => updateSettlementRow(index, 'amount', e.target.value)}
                                  className="w-full p-3 border border-gray-100 rounded-xl text-sm font-black text-green-600 outline-none focus:border-blue-500 bg-gray-50/50 transition-all"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5 block">العمولة</label>
                                <input
                                  type="number"
                                  value={row.commission}
                                  onChange={(e) => updateSettlementRow(index, 'commission', e.target.value)}
                                  className="w-full p-3 border border-gray-100 rounded-xl text-sm font-black text-red-500 outline-none focus:border-blue-500 bg-gray-50/50 transition-all"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      <div className="flex justify-between items-center p-4 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-100 animate-pulse-slow">
                        <div className="flex items-center gap-2">
                          <DollarSign size={20} className="text-blue-200" />
                          <span className="text-sm font-bold">إجمالي مبالغ التوزيع:</span>
                        </div>
                        <span className="text-xl font-black tracking-tight">
                          {settlementRows.reduce((sum, r) => sum + Number(r.amount), 0).toLocaleString()} <span className="text-xs font-bold opacity-80">SAR</span>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-100 space-y-6 shadow-sm">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="md:col-span-2">
                        <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                          <Home size={16} className="text-blue-500" />
                          ربط بحجز معين (اختياري)
                        </label>
                        <input 
                          type="text"
                          placeholder="ابحث برقم الحجز أو اسم العميل..."
                          className="w-full p-2 mb-2 border border-blue-100 rounded-lg text-xs bg-blue-50/30 outline-none focus:border-blue-300"
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <select
                          value={selectedBookingId}
                          onChange={(e) => setSelectedBookingId(e.target.value)}
                          className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none bg-white shadow-sm transition-all text-sm font-bold"
                        >
                          <option value="">لا يوجد (تسوية عامة للمنصة) - ({filteredBookings.length}) متاح</option>
                          {filteredBookings.map((b) => (
                            <option key={b.id} value={b.id}>
                              #{b.id.slice(0, 8).toUpperCase()} - {b.customer?.full_name} ({b.unit?.unit_number}) - {b.total_price} SAR
                            </option>
                          ))}
                        </select>
                      </div>

                        <div>
                          <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2 text-green-700">
                            <DollarSign size={16} />
                            المبلغ الإجمالي المستلم
                          </label>
                          <input
                            type="number"
                            value={settleAmount}
                            onChange={(e) => setSettleAmount(e.target.value)}
                            className="w-full p-3.5 border border-green-200 rounded-xl focus:ring-4 focus:ring-green-500/10 focus:border-green-500 outline-none bg-green-50/10 shadow-sm transition-all text-sm font-black text-green-600"
                            placeholder="0.00"
                            required
                          />
                        </div>

                        <div>
                          <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2 text-red-700">
                            <AlertCircle size={16} />
                            عمولة المنصة المستقطعة
                          </label>
                          <input
                            type="number"
                            value={commissionAmount}
                            onChange={(e) => setCommissionAmount(e.target.value)}
                            className="w-full p-3.5 border border-red-200 rounded-xl focus:ring-4 focus:ring-red-500/10 focus:border-red-500 outline-none bg-red-50/10 shadow-sm transition-all text-sm font-black text-red-600"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </form>

            {/* Modal Footer */}
            <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50/50 sticky bottom-0 backdrop-blur-md">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setIsSettleModalOpen(false)}
                  className="order-2 sm:order-1 flex-1 px-6 py-4 bg-white border border-gray-200 text-gray-700 rounded-2xl hover:bg-gray-50 transition-all font-bold text-sm shadow-sm"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={(e) => handleSettle(e as any)}
                  disabled={processing}
                  className="order-1 sm:order-2 flex-[2] px-6 py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 active:scale-[0.98] transition-all font-black text-sm flex justify-center items-center gap-3 shadow-xl shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? (
                    <div className="flex items-center gap-3">
                      <Loader2 className="animate-spin" size={20} />
                      <span>جاري معالجة القيود...</span>
                    </div>
                  ) : (
                    <>
                      <CheckCircle2 size={20} />
                      تأكيد عملية التسوية والترحيل
                    </>
                  )}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 text-center mt-3 font-medium">
                بمجرد التأكيد سيتم إنشاء قيود محاسبية تلقائية في سجل اليومية العامة
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
    </RoleGate>
  );
}
