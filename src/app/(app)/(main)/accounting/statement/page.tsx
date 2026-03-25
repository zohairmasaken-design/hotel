'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { Search, Calendar, Download, Printer, ArrowLeftRight, User, FileText, ChevronDown as ChevronDownIcon, Loader2 } from 'lucide-react';
import RoleGate from '@/components/auth/RoleGate';

interface Account {
  id: string;
  code: string;
  name: string;
}

interface Customer {
  id: string;
  full_name: string;
  phone: string;
}

interface JournalLine {
  id: string;
  entry_date: string;
  voucher_number: string;
  description: string;
  debit: number;
  credit: number;
  balance?: number;
  reference_type?: string;
  reference_id?: string;
}

type PostingEntry = {
  id: string;
  entry_date: string;
  voucher_number: string;
  description: string | null;
  reference_type: string | null;
  reference_id: string | null;
  status: string | null;
  created_at: string | null;
  journal_lines?: Array<{
    id: string;
    debit: number | null;
    credit: number | null;
    description: string | null;
    accounts?: { code: string; name: string } | null;
    cost_centers?: { name: string } | null;
  }>;
};

export default function AccountStatementPage() {
  const [mode, setMode] = useState<'account' | 'customer'>('account');
  const [reportType, setReportType] = useState<'internal' | 'customer'>('internal');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  
  // Data Lists
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  
  // Filters
  const [selectedId, setSelectedId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  // Results
  const [statement, setStatement] = useState<JournalLine[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [totals, setTotals] = useState({ debit: 0, credit: 0 });
  const [expandedVoucher, setExpandedVoucher] = useState<string | null>(null);
  const [postingDetails, setPostingDetails] = useState<Record<string, PostingEntry | { error: string }>>({});
  const [postingLoading, setPostingLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchLists();
  }, []);

  const fetchLists = async () => {
    // Fetch Accounts
    const { data: accs } = await supabase
      .from('accounts')
      .select('id, code, name')
      .order('code');
    if (accs) setAccounts(accs);

    // Fetch Customers
    const { data: custs } = await supabase
      .from('customers')
      .select('id, full_name, phone')
      .order('full_name');
    if (custs) setCustomers(custs);
  };

  const getCurrentOptions = () => {
    if (mode === 'account') {
      return accounts.map(acc => ({
        id: acc.id,
        label: `${acc.code} - ${acc.name}`,
      }));
    }
    return customers.map(cust => ({
      id: cust.id,
      label: cust.phone ? `${cust.full_name} - ${cust.phone}` : cust.full_name,
    }));
  };

  const filteredOptions = getCurrentOptions().filter(option =>
    option.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectOption = (id: string, label: string) => {
    setSelectedId(id);
    setSearchQuery(label);
    setShowOptions(false);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      if (!searchQuery.trim()) return;
      const first = filteredOptions[0];
      if (first) {
        handleSelectOption(first.id, first.label);
      }
    }
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchQuery(value);
    setShowOptions(Boolean(value.trim()));
  };

  const handleGenerate = async () => {
    if (!selectedId) {
      alert('الرجاء اختيار الحساب أو العميل');
      return;
    }

    setGenerating(true);
    setStatement([]);
    setOpeningBalance(0);
    setExpandedVoucher(null);
    setPostingDetails({});
    setPostingLoading({});

    try {
      let targetAccountId = selectedId;
      const useSubledger = mode === 'customer';

      if (useSubledger) {
        // Use the new RPC for Customer Statement (Sub-Account based)
        const { data: rpcData, error: rpcError } = await supabase
          .rpc('get_customer_statement', {
            p_customer_id: selectedId,
            p_start_date: startDate,
            p_end_date: endDate
          });

        if (rpcError) throw rpcError;

        let totalDebit = 0;
        let totalCredit = 0;

        // The RPC returns running balance, but we might want to capture the first row's balance - (debit-credit) to find opening?
        // Actually, RPC handles opening balance internally and returns it in the first row's cumulative balance?
        // Let's look at RPC again: "SUM(...) OVER (...) + v_opening_balance". Yes.
        // But to display "Opening Balance" separately in the UI, we might need to extract it.
        // The UI displays `openingBalance` state variable separately.
        
        // Let's recalculate opening balance manually or extract from first row?
        // Better: The RPC is a "View". It returns rows.
        // We can just take the first row's balance - (debit - credit) = Previous Balance.
        // Or we can just calculate totals.
        
        // Wait, the UI has a specific `openingBalance` display.
        // Let's just fetch opening balance separately if we want to be precise, or deduce it.
        // RPC lines 45-53 calculate v_opening_balance.
        // Maybe I should modify RPC to return opening balance? 
        // Or just trust the RPC result for the table, and set `openingBalance` state to 0 (and let the first row show the cumulative).
        // But the UI likely shows "Opening Balance: X" at the top.
        
        // Let's fetch opening balance separately for the UI header
        // We need the account_id first.
        const { data: accData } = await supabase
          .from('customer_accounts')
          .select('account_id')
          .eq('customer_id', selectedId)
          .single();
        
        let openBal = 0;
        if (accData?.account_id) {
           // Calculate opening balance for this account
           const { data: opData } = await supabase
             .from('journal_lines')
             .select('debit, credit, journal_entries!inner(entry_date)')
             .eq('account_id', accData.account_id)
             .lt('journal_entries.entry_date', startDate)
             .eq('journal_entries.status', 'posted');
             
           if (opData) {
             openBal = opData.reduce((acc, line) => acc + (Number(line.debit) - Number(line.credit)), 0);
           }
        }
        setOpeningBalance(openBal);

        const processedLines = (rpcData || []).map((row: any, index: number) => {
           const debit = Number(row.debit);
           const credit = Number(row.credit);
           totalDebit += debit;
           totalCredit += credit;
           
           return {
             id: `row-${index}`,
             entry_date: row.transaction_date,
             voucher_number: row.voucher_number,
             description: row.description,
             debit,
             credit,
             balance: Number(row.balance), // Use RPC calculated balance
             reference_type: 'transaction', // Generic
             reference_id: null
           };
        });

        setStatement(processedLines);
        setTotals({ debit: totalDebit, credit: totalCredit });

        // Include Insurance Deposits (Posted Only) for visibility in Customer Statement
        try {
          const { data: vouchers } = await supabase
            .from('insurance_vouchers')
            .select('id, voucher_type, amount, voucher_date, description, is_posting')
            .eq('customer_id', selectedId)
            .eq('is_posting', true)
            .gte('voucher_date', startDate)
            .lte('voucher_date', endDate)
            .order('voucher_date', { ascending: true });

          const depositLines: JournalLine[] = (vouchers || []).map((v: any, idx: number) => {
            const amt = Number(v.amount) || 0;
            let debit = 0, credit = 0;
            if (v.voucher_type === 'deposit_receipt') {
              credit = amt;
            } else {
              // refund or utilization moves out of liability
              debit = amt;
            }
            const label =
              v.voucher_type === 'deposit_receipt' ? 'سند قبض تأمين' :
              v.voucher_type === 'deposit_refund' ? 'سند صرف تأمين' :
              v.voucher_type === 'deposit_to_damage_income' ? 'استخدام التأمين كتلفيات' :
              'استخدام التأمين لمقاصة مصروف';
            return {
              id: `deposit-${v.id}`,
              entry_date: v.voucher_date,
              voucher_number: `INS-${String(v.id).slice(0,8).toUpperCase()}`,
              description: v.description ? `${label} — ${v.description}` : label,
              debit,
              credit,
              // Do not affect running balance column to keep AR balance consistent
              balance: undefined,
              reference_type: 'insurance_voucher',
              reference_id: v.id
            };
          });

          if (depositLines.length > 0) {
            const combined = [...processedLines, ...depositLines].sort((a, b) => {
              const da = new Date(a.entry_date).getTime();
              const db = new Date(b.entry_date).getTime();
              if (da === db) return String(a.id).localeCompare(String(b.id));
              return da - db;
            });
            setStatement(combined);
            // Keep totals as AR-only to avoid mixing liabilities with receivables
          }
        } catch (e) {
          // If vouchers table not present or error, ignore silently
        }

      } else {
        // HIERARCHICAL LOGIC (Recursive for Parent + Sub-Accounts)
        
        // 1. Fetch Opening Balance (Recursive)
        const { data: openBalData, error: openBalError } = await supabase
          .rpc('get_account_balance_recursive', {
            p_account_id: targetAccountId,
            p_date: startDate
          });

        if (openBalError) throw openBalError;
        const openBal = Number(openBalData) || 0;
        setOpeningBalance(openBal);

        // 2. Fetch Statement Lines (Recursive)
        const { data: rpcLines, error: linesError } = await supabase
          .rpc('get_account_statement', {
            p_account_id: targetAccountId,
            p_start_date: startDate,
            p_end_date: endDate
          });

        if (linesError) throw linesError;

        // Process Lines
        let totalDebit = 0;
        let totalCredit = 0;

        const processedLines = (rpcLines || []).map((row: any) => {
          const debit = Number(row.debit);
          const credit = Number(row.credit);
          
          totalDebit += debit;
          totalCredit += credit;

          // Prepend Account Name if it's a sub-account transaction
          // (The RPC returns 'account_name' for each row)
          let displayDesc = row.description;
          if (row.account_name) {
             // We could check if it differs from the selected account name, 
             // but simply showing it is clearer for hierarchical views.
             displayDesc = `[${row.account_name}] ${displayDesc}`;
          }

          return {
            id: row.id,
            entry_date: row.transaction_date,
            voucher_number: row.voucher_number,
            description: displayDesc, 
            debit,
            credit,
            balance: Number(row.balance), // RPC returns calculated running balance
            reference_type: row.reference_type,
            reference_id: row.reference_id
          };
        });

        setStatement(processedLines);
        setTotals({ debit: totalDebit, credit: totalCredit });
      }

    } catch (err: any) {
      console.error(err);
      alert('حدث خطأ أثناء جلب البيانات: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const fetchPostingDetails = async (voucherNumber: string) => {
    if (postingDetails[voucherNumber] || postingLoading[voucherNumber]) return;
    setPostingLoading(prev => ({ ...prev, [voucherNumber]: true }));
    try {
      const { data: je, error } = await supabase
        .from('journal_entries')
        .select(
          `
          id,
          entry_date,
          voucher_number,
          description,
          reference_type,
          reference_id,
          status,
          created_at,
          journal_lines (
            id,
            debit,
            credit,
            description,
            accounts ( code, name ),
            cost_centers ( name )
          )
        `
        )
        .eq('voucher_number', voucherNumber)
        .maybeSingle();

      if (error) throw error;
      if (!je) {
        setPostingDetails(prev => ({ ...prev, [voucherNumber]: { error: 'لا توجد تفاصيل ترحيل لهذا القيد' } }));
        return;
      }

      setPostingDetails(prev => ({ ...prev, [voucherNumber]: je as PostingEntry }));
    } catch (err: any) {
      setPostingDetails(prev => ({ ...prev, [voucherNumber]: { error: err?.message || 'تعذر جلب تفاصيل الترحيل' } }));
    } finally {
      setPostingLoading(prev => ({ ...prev, [voucherNumber]: false }));
    }
  };

  const handleOpenPrint = () => {
    if (!selectedId) {
      alert('الرجاء اختيار الحساب أو العميل أولاً');
      return;
    }

    const params = new URLSearchParams({
      mode,
      id: selectedId,
      start: startDate,
      end: endDate,
      reportType,
    });

    window.open(`/print/statement?${params.toString()}`, '_blank');
  };

  return (
    <RoleGate allow={['admin', 'accountant']}>
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-white">
      <div className="max-w-7xl mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
        <div className="bg-white/70 backdrop-blur border border-slate-200 rounded-2xl shadow-sm">
          <div className="p-4 sm:p-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                <FileText size={16} />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-extrabold text-slate-900">كشف حساب</h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  عرض حركة الحساب أو العميل ضمن فترة محددة مع تفاصيل الترحيل
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                onClick={handleOpenPrint}
                className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 shadow-sm text-xs sm:text-sm"
              >
                <Printer size={14} />
                طباعة
              </button>
              <button
                onClick={handleOpenPrint}
                className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white shadow-sm text-xs sm:text-sm"
              >
                <Download size={14} />
                تصدير PDF
              </button>
            </div>
          </div>
        </div>

      {/* Search Filter Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-900">خيارات الكشف</div>
            <div className="text-xs text-slate-500">Filters</div>
          </div>
        </div>
        <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 sm:gap-6 items-end">
          
          {/* Mode Selection */}
          <div className="space-y-2">
            <label className="block text-xs sm:text-sm font-semibold text-slate-800">نوع الكشف</label>
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => { setMode('account'); setSelectedId(''); }}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 sm:py-2 rounded-lg text-[12px] sm:text-sm font-semibold transition-all ${
                  mode === 'account' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <ArrowLeftRight size={16} />
                حساب مالي
              </button>
              <button
                onClick={() => { setMode('customer'); setSelectedId(''); }}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 sm:py-2 rounded-lg text-[12px] sm:text-sm font-semibold transition-all ${
                  mode === 'customer' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <User size={16} />
                عميل
              </button>
            </div>
          </div>

          {/* Report View Type (Internal vs Customer) */}
          <div className="space-y-2">
            <label className="block text-xs sm:text-sm font-semibold text-slate-800">طريقة العرض</label>
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setReportType('internal')}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 sm:py-2 rounded-lg text-[12px] sm:text-sm font-semibold transition-all ${
                  reportType === 'internal' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                تقرير داخلي
              </button>
              <button
                onClick={() => setReportType('customer')}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 sm:py-2 rounded-lg text-[12px] sm:text-sm font-semibold transition-all ${
                  reportType === 'customer' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                كشف للعميل
              </button>
            </div>
          </div>

          {/* Target Selection */}
          <div className="space-y-2 md:col-span-1">
            <label className="block text-xs sm:text-sm font-semibold text-slate-800">
              {mode === 'account' ? 'اختر الحساب' : 'اختر العميل'}
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                placeholder={mode === 'account' ? 'ابحث بالرقم أو الاسم...' : 'ابحث بالاسم أو الجوال...'}
                className="w-full pl-3 sm:pl-4 pr-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-slate-900 placeholder:text-slate-400 shadow-sm text-[13px] sm:text-sm"
              />
              {showOptions && searchQuery.trim() && (
                <div className="absolute inset-x-0 mt-2 max-h-56 bg-white border border-slate-200 rounded-xl shadow-xl overflow-y-auto z-10">
                  {filteredOptions.length === 0 ? (
                    <div className="px-3 py-2 text-[12px] sm:text-sm text-slate-500 text-right">
                      لا توجد نتائج مطابقة
                    </div>
                  ) : (
                    filteredOptions.map(option => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleSelectOption(option.id, option.label)}
                        className={`w-full text-right px-3 py-2 text-[12px] sm:text-sm transition-colors ${
                          option.id === selectedId
                            ? 'bg-blue-50 text-blue-800'
                            : 'text-slate-900 hover:bg-slate-50'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Date Range */}
          <div className="space-y-2">
            <label className="block text-xs sm:text-sm font-semibold text-slate-800">من تاريخ</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 sm:px-4 py-2 bg-white border border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-slate-900 shadow-sm text-[13px] sm:text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs sm:text-sm font-semibold text-slate-800">إلى تاريخ</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 sm:px-4 py-2 bg-white border border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-slate-900 shadow-sm text-[13px] sm:text-sm"
            />
          </div>

          {/* Action Button */}
          <div className="md:col-span-4 flex justify-end">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 sm:px-6 py-2 bg-blue-600 text-white font-extrabold rounded-xl hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-xs sm:text-sm"
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  جاري العرض...
                </>
              ) : (
                <>
                  <Search size={16} />
                  عرض الكشف
                </>
              )}
            </button>
          </div>
        </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Summary Header */}
        <div className="p-3 sm:p-6 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-500 mb-1">الرصيد الافتتاحي</div>
            <div className="text-base sm:text-lg font-extrabold text-slate-900 font-mono">
              {reportType === 'customer' 
                ? (openingBalance * -1).toLocaleString('en-US', { minimumFractionDigits: 2 })
                : openingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-500 mb-1">
              إجمالي المدين
            </div>
            <div className={`text-base sm:text-lg font-extrabold font-mono ${reportType === 'customer' ? 'text-blue-700' : 'text-emerald-700'}`}>
              {reportType === 'customer'
                ? totals.credit.toLocaleString('en-US', { minimumFractionDigits: 2 })
                : totals.debit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-500 mb-1">
              إجمالي الدائن
            </div>
            <div className="text-base sm:text-lg font-extrabold text-rose-700 font-mono">
              {reportType === 'customer'
                ? totals.debit.toLocaleString('en-US', { minimumFractionDigits: 2 })
                : totals.credit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-blue-50 p-3 sm:p-4 rounded-2xl border border-blue-100 shadow-sm">
            <div className="text-xs text-blue-700 mb-1">
              {reportType === 'customer' ? 'الرصيد المتبقي' : 'الرصيد الختامي'}
            </div>
            <div className="text-base sm:text-lg font-extrabold text-blue-950 font-mono">
              {reportType === 'customer'
                ? ((openingBalance + totals.debit - totals.credit) * -1).toLocaleString('en-US', { minimumFractionDigits: 2 })
                : (openingBalance + totals.debit - totals.credit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[9px] sm:text-sm">
            <thead className="bg-slate-100 text-slate-900 font-extrabold text-[9px] sm:text-sm sticky top-0 z-10">
              <tr>
                <th className="px-2 sm:px-6 py-2 sm:py-4 whitespace-nowrap">التاريخ</th>
                <th className="px-2 sm:px-6 py-2 sm:py-4 whitespace-nowrap">رقم القيد</th>
                <th className="px-2 sm:px-6 py-2 sm:py-4 w-[220px] sm:w-1/3">البيان</th>
                <th className="px-2 sm:px-6 py-2 sm:py-4 whitespace-nowrap">
                  مدين
                </th>
                <th className="px-2 sm:px-6 py-2 sm:py-4 whitespace-nowrap">
                  دائن
                </th>
                <th className="px-2 sm:px-6 py-2 sm:py-4 whitespace-nowrap">الرصيد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Opening Balance Row */}
              <tr className="bg-slate-50/70">
                <td className="px-2 sm:px-6 py-2 sm:py-4 text-slate-900 font-semibold whitespace-nowrap">
                  <span className="sm:hidden">{format(new Date(startDate), 'dd/MM')}</span>
                  <span className="hidden sm:inline">{format(new Date(startDate), 'dd/MM/yy')}</span>
                </td>
                <td className="px-2 sm:px-6 py-2 sm:py-4 text-slate-500">—</td>
                <td className="px-2 sm:px-6 py-2 sm:py-4 font-extrabold text-slate-900 whitespace-nowrap">رصيد افتتاحي</td>
                <td className="px-2 sm:px-6 py-2 sm:py-4 font-mono text-slate-500">—</td>
                <td className="px-2 sm:px-6 py-2 sm:py-4 font-mono text-slate-500">—</td>
                <td className="px-2 sm:px-6 py-2 sm:py-4 font-mono font-extrabold text-slate-900 dir-ltr text-right whitespace-nowrap">
                  {reportType === 'customer'
                    ? (openingBalance * -1).toLocaleString('en-US', { minimumFractionDigits: 2 })
                    : openingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
              </tr>

              {statement.length > 0 ? (
                statement.map((line) => {
                  const isExpanded = expandedVoucher === line.voucher_number;
                  const hasVoucher = Boolean(line.voucher_number && line.voucher_number.trim().length > 0);
                  const isLoading = Boolean(postingLoading[line.voucher_number]);
                  const details = postingDetails[line.voucher_number];

                  return (
                    <React.Fragment key={line.id}>
                      <tr
                        className={`transition-colors ${hasVoucher ? 'hover:bg-blue-50/30 cursor-pointer' : ''}`}
                        onClick={() => {
                          if (!hasVoucher) return;
                          const next = isExpanded ? null : line.voucher_number;
                          setExpandedVoucher(next);
                          if (next) fetchPostingDetails(next);
                        }}
                      >
                        <td className="px-2 sm:px-6 py-2 sm:py-4 text-slate-900 whitespace-nowrap">
                          <span className="sm:hidden">{format(new Date(line.entry_date), 'dd/MM')}</span>
                          <span className="hidden sm:inline">{format(new Date(line.entry_date), 'dd/MM/yy')}</span>
                        </td>
                        <td className="px-2 sm:px-6 py-2 sm:py-4 text-blue-600 font-mono whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {hasVoucher ? (
                              <>
                                {isLoading ? (
                                  <Loader2 className="animate-spin text-blue-600" size={14} />
                                ) : (
                                  <ChevronDownIcon
                                    size={14}
                                    className={`text-blue-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                  />
                                )}
                              </>
                            ) : null}
                            <span className="hover:underline">
                              <span className="sm:hidden">
                                {String(line.voucher_number || '').slice(0, 3)}
                              </span>
                              <span className="hidden sm:inline">
                                {line.voucher_number}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="px-1 sm:px-6 py-1 sm:py-4 text-slate-900">
                          <div className="text-[5px] leading-[6px] sm:text-sm sm:leading-6">
                            {line.description}
                          </div>
                        </td>
                        <td className="px-2 sm:px-6 py-2 sm:py-4 font-mono text-emerald-700 whitespace-nowrap">
                          {reportType === 'customer'
                            ? (line.credit > 0 ? line.credit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-')
                            : (line.debit > 0 ? line.debit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-')}
                        </td>
                        <td className="px-2 sm:px-6 py-2 sm:py-4 font-mono text-rose-700 whitespace-nowrap">
                          {reportType === 'customer'
                            ? (line.debit > 0 ? line.debit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-')
                            : (line.credit > 0 ? line.credit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-')}
                        </td>
                        <td className="px-2 sm:px-6 py-2 sm:py-4 font-mono font-extrabold text-slate-900 dir-ltr text-right whitespace-nowrap">
                          {line.balance !== undefined
                            ? (reportType === 'customer' ? (line.balance * -1) : line.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })
                            : '-'}
                        </td>
                      </tr>

                      {isExpanded ? (
                        <tr className="bg-slate-50/60">
                          <td colSpan={6} className="px-2 sm:px-6 py-3 sm:py-4">
                            {'error' in (details || {}) ? (
                              <div className="text-xs sm:text-sm text-red-600">{(details as any).error}</div>
                            ) : details ? (
                              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                <div className="px-3 sm:px-4 py-2 sm:py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200 flex items-center justify-between">
                                  <div className="text-xs sm:text-sm font-extrabold text-slate-900">
                                    تفاصيل الترحيل
                                  </div>
                                  <div className="text-[11px] sm:text-xs text-slate-600 font-mono">
                                    {details.voucher_number}
                                  </div>
                                </div>
                                <div className="p-3 sm:p-4 space-y-3">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs sm:text-sm">
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                                      <div className="text-xs text-slate-600 mb-1">التاريخ</div>
                                      <div className="font-mono text-slate-900">{format(new Date(details.entry_date), 'dd/MM/yyyy')}</div>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                                      <div className="text-xs text-slate-600 mb-1">المرجع</div>
                                      <div className="text-slate-900">
                                        {details.reference_type ? `${details.reference_type}` : '-'}
                                      </div>
                                      <div className="text-xs text-slate-500 font-mono break-all">
                                        {details.reference_id || ''}
                                      </div>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                                      <div className="text-xs text-slate-600 mb-1">الحالة</div>
                                      <div className="text-slate-900">{details.status || '-'}</div>
                                    </div>
                                  </div>

                                  <div className="text-xs sm:text-sm font-extrabold text-slate-900">بنود القيد</div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-right text-[11px] sm:text-sm">
                                      <thead className="bg-slate-100 text-slate-700">
                                        <tr>
                                          <th className="px-2 sm:px-3 py-2">الحساب</th>
                                          <th className="px-2 sm:px-3 py-2">البيان</th>
                                          <th className="px-2 sm:px-3 py-2">مدين</th>
                                          <th className="px-2 sm:px-3 py-2">دائن</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {(details.journal_lines || []).map((jl) => (
                                          <tr key={jl.id}>
                                            <td className="px-2 sm:px-3 py-2 text-slate-900 whitespace-nowrap">
                                              {jl.accounts ? `${jl.accounts.code} - ${jl.accounts.name}` : '-'}
                                            </td>
                                            <td className="px-2 sm:px-3 py-2 text-slate-700">
                                              {jl.description || '-'}
                                            </td>
                                            <td className="px-2 sm:px-3 py-2 font-mono text-green-700">
                                              {Number(jl.debit || 0) > 0 ? Number(jl.debit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                                            </td>
                                            <td className="px-2 sm:px-3 py-2 font-mono text-red-700">
                                              {Number(jl.credit || 0) > 0 ? Number(jl.credit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs sm:text-sm text-slate-500">جاري التحميل...</div>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-2 sm:px-6 py-10 sm:py-12 text-center text-black text-xs sm:text-sm">
                    لا توجد حركات خلال هذه الفترة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </div>
    </RoleGate>
  );
}
