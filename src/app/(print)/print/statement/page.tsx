import React from 'react';
import { createClient } from '@/lib/supabase-server';
import { format } from 'date-fns';
import PrintActions from '../PrintActions';
import Logo from '@/components/Logo';
import RoleGate from '@/components/auth/RoleGate';

export const runtime = 'edge';

interface SearchParams {
  mode?: string;
  id?: string;
  start?: string;
  end?: string;
  reportType?: 'internal' | 'customer';
  costCenterId?: string;
}

export default async function StatementPrintPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { mode = 'account', id, start, end, reportType = 'internal', costCenterId } = await searchParams;
  const supabase = await createClient();

  if (!id || !start || !end) {
    return (
      <RoleGate allow={['admin', 'manager', 'receptionist', 'accountant']}>
        <div className="max-w-3xl mx-auto p-6 text-center text-red-700">
          <p className="font-bold text-lg">بيانات ناقصة لطباعة كشف الحساب</p>
          <p className="text-sm mt-2">يرجى العودة للصفحة الرئيسية لكشف الحساب وإعادة المحاولة.</p>
        </div>
      </RoleGate>
    );
  }

  let openingBalance = 0;
  let lines: any[] = [];
  let title = '';
  let subtitle = '';

  if (mode === 'customer') {
    const { data: customer } = await supabase
      .from('customers')
      .select('full_name, phone')
      .eq('id', id)
      .single();

    title = customer?.full_name || 'كشف حساب عميل';
    subtitle = customer?.phone ? `جوال: ${customer.phone}` : '';

    const { data: rpcData } = await supabase.rpc('get_customer_statement', {
      p_customer_id: id,
      p_start_date: start,
      p_end_date: end,
      p_cost_center_id: costCenterId || null,
    });

    lines = rpcData || [];

    const { data: accData } = await supabase
      .from('customer_accounts')
      .select('account_id')
      .eq('customer_id', id)
      .single();

    if (accData?.account_id) {
      let opQuery = supabase
        .from('journal_lines')
        .select('debit, credit, journal_entries!inner(entry_date)')
        .eq('account_id', accData.account_id)
        .lt('journal_entries.entry_date', start)
        .eq('journal_entries.status', 'posted');
      
      if (costCenterId) {
        opQuery = opQuery.eq('cost_center_id', costCenterId);
      }

      const { data: opData } = await opQuery;

      if (opData) {
        openingBalance = opData.reduce(
          (acc: number, line: any) =>
            acc + (Number(line.debit) - Number(line.credit)),
          0
        );
      }
    }
  } else if (mode === 'cost_center') {
    // Logic for Cost Center Statement
    const { data: unit } = await supabase
      .from('units')
      .select('unit_number')
      .eq('cost_center_id', id)
      .single();

    title = unit ? `مركز تكلفة - وحدة ${unit.unit_number}` : 'كشف مركز تكلفة';
    subtitle = 'يعرض جميع الحركات المالية المرتبطة بهذه الوحدة عبر جميع الحسابات';

    // 1. Calculate Opening Balance for CC
    const { data: opData } = await supabase
      .from('journal_lines')
      .select('debit, credit, journal_entries!inner(entry_date)')
      .eq('cost_center_id', id)
      .lt('journal_entries.entry_date', start)
      .eq('journal_entries.status', 'posted');
    
    openingBalance = (opData || []).reduce((acc: number, l: any) => acc + (Number(l.debit) - Number(l.credit)), 0);

    // 2. Fetch Statement Lines for CC
    const { data: linesData, error } = await supabase
      .from('journal_lines')
      .select(`
        id,
        debit,
        credit,
        description,
        account:accounts(code, name),
        journal_entry:journal_entries!inner(
          entry_date,
          voucher_number,
          created_at,
          reference_type,
          reference_id
        )
      `)
      .eq('cost_center_id', id)
      .eq('journal_entries.status', 'posted')
      .gte('journal_entries.entry_date', start)
      .lte('journal_entries.entry_date', end)
      .order('journal_entries(entry_date)', { ascending: true })
      .order('journal_entries(created_at)', { ascending: true });

    if (!error && linesData) {
      let currentBal = openingBalance;
      lines = linesData.map((l: any) => {
        const d = Number(l.debit || 0);
        const c = Number(l.credit || 0);
        currentBal += (d - c);
        return {
          id: l.id,
          transaction_date: l.journal_entry.entry_date,
          voucher_number: l.journal_entry.voucher_number,
          account_code: l.account?.code,
          description: `[${l.account?.name}] ${l.description || ''}`,
          debit: d,
          credit: c,
          balance: currentBal
        };
      });
    }

  } else {
    const { data: account } = await supabase
      .from('accounts')
      .select('code, name')
      .eq('id', id)
      .single();

    title = account ? `${account.code} - ${account.name}` : 'كشف حساب مالي';
    subtitle = 'يشمل الحساب والحسابات الفرعية المرتبطة به (إن وجدت)';

    const { data: openBalData } = await supabase.rpc(
      'get_account_balance_recursive',
      {
        p_account_id: id,
        p_date: start,
        p_cost_center_id: costCenterId || null,
      }
    );
    openingBalance = Number(openBalData) || 0;

    const { data: rpcLines } = await supabase.rpc('get_account_statement', {
      p_account_id: id,
      p_start_date: start,
      p_end_date: end,
      p_cost_center_id: costCenterId || null,
    });

    lines = rpcLines || [];
  }

  const totalDebit = lines.reduce((sum, l) => sum + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + Number(l.credit || 0), 0);
  const closingBalance = Math.round((openingBalance + totalDebit - totalCredit) * 100) / 100;

  const startDate = new Date(start);
  const endDate = new Date(end);

  return (
    <RoleGate allow={['admin', 'manager', 'receptionist', 'accountant']}>
    <div className="max-w-4xl mx-auto p-6 bg-white min-h-screen print:p-4 print:m-0 print:min-h-0" dir="rtl">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            margin: 0; /* Important: This removes browser header/footer (URLs, titles) */
            size: auto;
          }
          body {
            margin: 0;
            padding: 10mm; /* Add margin manually to the content instead of the page */
          }
          /* Hide everything except our content */
          .no-print { display: none !important; }
        }
      `}} />
      <PrintActions />

      <div className="mb-6 border-b-4 border-gray-900 pb-6 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="flex items-start gap-4">
            <div className="w-20 h-20 bg-gray-900 print-dark-bg flex items-center justify-center rounded-lg shadow-sm overflow-hidden">
              <Logo onDark className="w-16 h-16 object-contain" alt="Logo" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-extrabold text-gray-900">
                مساكن الصفا
              </h2>
              <p className="text-sm text-gray-800">
                المملكة العربية السعودية -  جدة - حي الصفا 
              </p>
              <p className="text-sm text-gray-800">
                السجل التجاري:{' '}
                <span className="font-mono font-bold text-gray-900">
                  7073421299
                </span>
              </p>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-1">
              كشف حساب
            </h1>
            <p className="text-xs text-gray-700 tracking-widest">
              ACCOUNT STATEMENT
            </p>
            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-800 space-y-1">
              <p>
                الفترة من{' '}
                <span className="font-mono">
                  {format(startDate, 'dd/MM/yyyy')}
                </span>{' '}
                إلى{' '}
                <span className="font-mono">
                  {format(endDate, 'dd/MM/yyyy')}
                </span>
              </p>
              <p>
                تاريخ ووقت الطباعة:{' '}
                <span className="font-mono">
                  {format(new Date(), 'dd/MM/yyyy HH:mm')}
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-gray-700">
                {mode === 'customer' ? 'العميل' : 'الحساب'}
              </span>
              <span className="text-xs text-gray-500">Account / Customer</span>
            </div>
            <p className="font-bold text-gray-900">{title}</p>
            {subtitle && (
              <p className="text-xs text-gray-600 mt-1">{subtitle}</p>
            )}
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-gray-700">ملاحظات</span>
              <span className="text-xs text-gray-500">Notes</span>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              هذا الكشف تم توليده آلياً من نظام مساكن الرفاهية للوحدات
              الفندقية، ويعرض حركة الحساب خلال الفترة المحددة أعلاه مع رصيد
              افتتاحي وختامي.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 text-sm">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-gray-600 mb-1">الرصيد الافتتاحي</div>
          <div className="font-bold font-mono text-gray-900">
            {reportType === 'customer'
              ? (openingBalance * -1).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })
              : openingBalance.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-gray-600 mb-1">إجمالي المدين</div>
          <div className={`font-bold font-mono ${reportType === 'customer' ? 'text-blue-700' : 'text-green-700'}`}>
            {reportType === 'customer'
              ? totalCredit.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })
              : totalDebit.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-gray-600 mb-1">إجمالي الدائن</div>
          <div className="font-bold font-mono text-red-700">
            {reportType === 'customer'
              ? totalDebit.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })
              : totalCredit.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}
          </div>
        </div>
      </div>

      <div className="mb-4 bg-gray-900 text-white rounded-lg px-4 py-3 flex items-center justify-between text-sm">
        <div className="opacity-90">{reportType === 'customer' ? 'الرصيد المتبقي' : 'الرصيد الختامي'}</div>
        <div className="font-mono font-extrabold">
          {reportType === 'customer'
            ? (closingBalance * -1).toLocaleString('en-US', { minimumFractionDigits: 2 })
            : closingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </div>
      </div>

      <div className="border border-gray-300 rounded-lg overflow-hidden text-sm shadow-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-900 text-white">
              <th className="py-2 px-2 text-right w-[80px]">التاريخ</th>
              <th className="py-2 px-2 text-right w-[80px]">رقم القيد</th>
              <th className="py-2 px-2 text-right w-[60px]">الوحدة</th>
              <th className="py-2 px-2 text-right w-[80px]">رمز الحساب</th>
              <th className="py-2 px-2 text-right">البيان</th>
              <th className="py-2 px-2 text-center w-[100px]">
                مدين
              </th>
              <th className="py-2 px-2 text-center w-[100px]">
                دائن
              </th>
              <th className="py-2 px-2 text-center w-[100px]">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-gray-50 border-b border-gray-200">
              <td className="py-2 px-2 text-right font-mono">
                {format(startDate, 'dd/MM/yyyy')}
              </td>
              <td className="py-2 px-2 text-right text-gray-500">-</td>
              <td className="py-2 px-2 text-right text-gray-500">-</td>
              <td className="py-2 px-2 text-right text-gray-500">-</td>
              <td className="py-2 px-2 font-bold text-gray-900">
                رصيد افتتاحي
              </td>
              <td className="py-2 px-2 text-center text-gray-700">-</td>
              <td className="py-2 px-2 text-center text-gray-700">-</td>
              <td className="py-2 px-2 text-center font-mono font-bold">
                {reportType === 'customer'
                  ? (openingBalance * -1).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                    })
                  : openingBalance.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                    })}
              </td>
            </tr>
            {lines.length > 0 ? (
              lines.map((line, index) => (
                <tr
                  key={line.id || index}
                  className={`border-b border-gray-100 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                >
                  <td className="py-1.5 px-2 text-right font-mono text-[10px]">
                    {line.transaction_date
                      ? format(new Date(line.transaction_date), 'dd/MM/yyyy')
                      : '-'}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-[10px]">
                    {String(line.voucher_number || '').length > 7 
                      ? String(line.voucher_number || '').slice(-7) 
                      : (line.voucher_number || '-')}
                  </td>
                  <td className="py-1.5 px-2 text-right font-bold text-indigo-700 text-[10px]">
                    {line.unit_number || '-'}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-gray-500 text-[10px]">
                    {line.account_code || '-'}
                  </td>
                  <td className="py-1.5 px-2 text-right text-[10px]">
                    {line.description}
                  </td>
                  <td className={`py-1.5 px-2 text-center font-mono text-[10px] font-bold ${reportType === 'customer' ? 'text-blue-700' : 'text-green-700'}`}>
                    {reportType === 'customer'
                      ? (Number(line.credit || 0) > 0 ? Number(line.credit).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-')
                      : (Number(line.debit || 0) > 0 ? Number(line.debit).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-')}
                  </td>
                  <td className="py-1.5 px-2 text-center font-mono text-[10px] text-red-700 font-bold">
                    {reportType === 'customer'
                      ? (Number(line.debit || 0) > 0 ? Number(line.debit).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-')
                      : (Number(line.credit || 0) > 0 ? Number(line.credit).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-')}
                  </td>
                  <td className="py-1.5 px-2 text-center font-mono text-[10px] font-bold">
                    {line.balance !== undefined && line.balance !== null
                      ? (reportType === 'customer' ? (Number(line.balance) * -1) : Number(line.balance)).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                        })
                      : ''}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={8}
                  className="py-6 px-4 text-center text-gray-500 text-sm"
                >
                  لا توجد حركات خلال هذه الفترة
                </td>
              </tr>
            )}
            {/* Closing Balance Row */}
            <tr className="bg-gray-50 border-t border-gray-200">
              <td className="py-2 px-2 text-right font-mono">
                {format(endDate, 'dd/MM/yyyy')}
              </td>
              <td className="py-2 px-2 text-right text-gray-500">-</td>
              <td className="py-2 px-2 text-right text-gray-500">-</td>
              <td className="py-2 px-2 text-right text-gray-500">-</td>
              <td className="py-2 px-2 font-bold text-gray-900">
                {reportType === 'customer' ? 'الرصيد المتبقي' : 'رصيد ختامي'}
              </td>
              <td className="py-2 px-2 text-center text-gray-700">-</td>
              <td className="py-2 px-2 text-center text-gray-700">-</td>
              <td className="py-2 px-2 text-center font-mono font-extrabold text-blue-800">
                {reportType === 'customer'
                  ? (closingBalance * -1).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                    })
                  : closingBalance.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                    })}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-8 pt-4 border-t border-gray-100 text-[10px] text-gray-400 flex justify-between items-center italic">
        <div className="flex gap-4">
          <span>نظام مساكن فندقية - كشف حساب آلي</span>
          <span>بصمة الجهاز: {typeof window !== 'undefined' ? window.navigator.userAgent.slice(0, 50) : 'Server-Side Print'}</span>
        </div>
        <div>
          تاريخ الطباعة: {format(new Date(), 'dd/MM/yyyy HH:mm')}
        </div>
      </div>
    </div>
    </RoleGate>
  );
}
