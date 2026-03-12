 'use client';
 
import React, { useEffect, useMemo, useState } from 'react';
 import RoleGate from '@/components/auth/RoleGate';
 import { supabase } from '@/lib/supabase';
 import { format } from 'date-fns';
 import { Search, ArrowLeftRight, CheckCircle2, Plus, Trash2, Copy as CopyIcon } from 'lucide-react';
 
 type Account = { id: string; code: string; name: string };
 
 export default function ManualEntryPage() {
   const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [activeTab, setActiveTab] = useState<'create' | 'vouchers'>('create');
 
   // Form State
   const [entryDate, setEntryDate] = useState<string>(new Date().toISOString().split('T')[0]);
   const [voucherType, setVoucherType] = useState<'general' | 'receipt' | 'payment'>('general');
   const [description, setDescription] = useState('');
  const [lines, setLines] = useState<Array<{ id: string; account_id: string; label: string; line_desc: string; debit: string; credit: string; search: string }>>([
    { id: crypto.randomUUID(), account_id: '', label: '', line_desc: '', debit: '', credit: '', search: '' },
    { id: crypto.randomUUID(), account_id: '', label: '', line_desc: '', debit: '', credit: '', search: '' }
  ]);
 
  const [listStart, setListStart] = useState<string>(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [listEnd, setListEnd] = useState<string>(new Date().toISOString().split('T')[0]);
  const [listQuery, setListQuery] = useState('');
  const [entries, setEntries] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(false);

   useEffect(() => {
     const fetchAccounts = async () => {
       const { data } = await supabase
         .from('accounts')
         .select('id, code, name')
         .order('code', { ascending: true });
       setAccounts(data || []);
     };
     fetchAccounts();
   }, []);
 
  const filterAccounts = (q: string) => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return accounts.filter(a => `${a.code} ${a.name}`.toLowerCase().includes(term)).slice(0, 50);
  };
 
   const getLabel = (id: string) => {
     const acc = accounts.find(a => a.id === id);
     return acc ? `${acc.code} - ${acc.name}` : '';
   };
 
  const loadEntries = async () => {
    setListLoading(true);
    try {
      let query = supabase
        .from('journal_entries')
        .select(`
          *,
          journal_lines(
            id, account_id, debit, credit, description,
            account:accounts(code, name)
          )
        `)
        .like('voucher_number', 'MJ-%')
        .gte('entry_date', listStart)
        .lte('entry_date', listEnd)
        .order('entry_date', { ascending: false });
      const { data } = await query;
      const rows = (data || []).filter((je: any) => {
        if (!listQuery.trim()) return true;
        const q = listQuery.toLowerCase();
        const hitHeader =
          (je.voucher_number || '').toLowerCase().includes(q) ||
          (je.description || '').toLowerCase().includes(q);
        const hitLines = (je.journal_lines || []).some((ln: any) =>
          (ln.description || '').toLowerCase().includes(q) ||
          (ln.account?.code || '').toLowerCase().includes(q) ||
          (ln.account?.name || '').toLowerCase().includes(q)
        );
        return hitHeader || hitLines;
      });
      setEntries(rows);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'vouchers') {
      loadEntries();
    }
  }, [activeTab]);

  const totalDebit = useMemo(() => lines.reduce((s, l) => s + (parseFloat(l.debit || '0') || 0), 0), [lines]);
  const totalCredit = useMemo(() => lines.reduce((s, l) => s + (parseFloat(l.credit || '0') || 0), 0), [lines]);

  const handleSubmit = async () => {
    if (!entryDate) return alert('الرجاء تحديد التاريخ');
    if (lines.length < 2) return alert('أضف على الأقل سطرين (مدين ودائن)');
    for (const l of lines) {
      if (!l.account_id) return alert('اختر الحساب لكل سطر');
      const d = parseFloat(l.debit || '0') || 0;
      const c = parseFloat(l.credit || '0') || 0;
      if (d > 0 && c > 0) return alert('لا يمكن أن يحتوي السطر على مدين ودائن معًا');
    }
    if (totalDebit <= 0 || totalCredit <= 0) return alert('الرجاء إدخال مبالغ صحيحة للمدين والدائن');
    if (Math.abs(totalDebit - totalCredit) > 0.0001) return alert('يجب أن يتساوى إجمالي المدين مع إجمالي الدائن');
 
     setPosting(true);
     try {
       // Ensure period is open
       const { data: period, error: periodError } = await supabase
         .from('accounting_periods')
         .select('id')
         .lte('start_date', entryDate)
         .gte('end_date', entryDate)
         .eq('status', 'open')
         .maybeSingle();
       if (periodError) throw periodError;
       if (!period) throw new Error(`لا توجد فترة محاسبية مفتوحة للتاريخ (${entryDate})`);
 
      // Create Journal Entry
       const voucherNumber = `MJ-${entryDate.replaceAll('-', '')}-${Math.random().toString(36).slice(-4).toUpperCase()}`;
       const { data: je, error: jeError } = await supabase
         .from('journal_entries')
         .insert({
           entry_date: entryDate,
           voucher_number: voucherNumber,
           description: description || (voucherType === 'receipt' ? 'سند قبض (يدوي)' : voucherType === 'payment' ? 'سند صرف (يدوي)' : 'قيد يومية (يدوي)'),
          status: 'posted'
         })
         .select()
         .single();
       if (jeError) throw jeError;
 
      // Insert lines
      const payload = lines.map(l => ({
        journal_entry_id: je.id,
        account_id: l.account_id,
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
        description: l.line_desc || null
      }));
      const { error: linesErr } = await supabase.from('journal_lines').insert(payload);
       if (linesErr) throw linesErr;
 
       // Log system event
       try {
         await supabase.from('system_events').insert({
           event_type: 'manual_journal',
          message: `قيد يدوي ${voucherNumber} بمبلغ ${totalDebit.toLocaleString()} ر.س`,
           payload: {
             entry_date: entryDate,
             voucher_type: voucherType,
            amount: totalDebit,
            description,
            lines: payload
           }
         });
       } catch {}
 
       alert('تم ترحيل القيد اليدوي بنجاح');
       setDescription('');
      setLines([
        { id: crypto.randomUUID(), account_id: '', label: '', line_desc: '', debit: '', credit: '', search: '' },
        { id: crypto.randomUUID(), account_id: '', label: '', line_desc: '', debit: '', credit: '', search: '' }
      ]);
       setVoucherType('general');
     } catch (e: any) {
       alert(e.message || 'تعذر ترحيل القيد');
     } finally {
       setPosting(false);
     }
   };

  const setFromEntry = (je: any) => {
    const ls = (je.journal_lines || []).map((ln: any) => ({
      id: crypto.randomUUID(),
      account_id: ln.account_id,
      label: `${ln.account?.code || ''} - ${ln.account?.name || ''}`,
      line_desc: ln.description || '',
      debit: String(ln.debit || 0),
      credit: String(ln.credit || 0),
      search: ''
    }));
    setEntryDate(je.entry_date ? String(je.entry_date).split('T')[0] : new Date().toISOString().split('T')[0]);
    setDescription(je.description || '');
    setVoucherType('general');
    setLines(ls.length > 0 ? ls : [
      { id: crypto.randomUUID(), account_id: '', label: '', line_desc: '', debit: '', credit: '', search: '' },
      { id: crypto.randomUUID(), account_id: '', label: '', line_desc: '', debit: '', credit: '', search: '' }
    ]);
    setActiveTab('create');
  };
 
   return (
     <RoleGate allow={['admin']}>
       <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">قيود يدوية</h1>
            <p className="text-gray-500 mt-1">تسجيل قيد قبض/صرف أو قيد عام باختيار الحسابات</p>
          </div>
        </div>

        <div className="flex bg-gray-100 p-1 rounded-lg w-full md:w-auto">
          <button
            onClick={() => setActiveTab('create')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'create' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            إنشاء قيد
          </button>
          <button
            onClick={() => setActiveTab('vouchers')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'vouchers' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            السندات
          </button>
        </div>
 
        {activeTab === 'create' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
           <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
             <div>
               <label className="block text-xs font-semibold text-gray-700 mb-1">تاريخ القيد</label>
               <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
             </div>
             <div>
               <label className="block text-xs font-semibold text-gray-700 mb-1">نوع القيد</label>
               <select value={voucherType} onChange={e => setVoucherType(e.target.value as any)} className="w-full border rounded-lg px-3 py-2 text-sm">
                 <option value="general">قيد عام</option>
                 <option value="receipt">سند قبض</option>
                 <option value="payment">سند صرف</option>
               </select>
             </div>
            <div className="flex items-end md:col-span-2">
               <button onClick={handleSubmit} disabled={posting || loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                 <CheckCircle2 size={18} />
                 {posting ? 'جاري الترحيل...' : 'ترحيل القيد'}
               </button>
             </div>
           </div>
 
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-gray-700">تفاصيل القيد</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setLines([...lines, { id: crypto.randomUUID(), account_id: '', label: '', line_desc: '', debit: '', credit: '', search: '' }])}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs flex items-center gap-1"
                >
                  <Plus size={14} /> إضافة سطر
                </button>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-right text-gray-600 border-b">
                    <th className="py-2 px-3">الحساب</th>
                    <th className="py-2 px-3">البيان</th>
                    <th className="py-2 px-3">مدين</th>
                    <th className="py-2 px-3">دائن</th>
                    <th className="py-2 px-3">حذف</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((ln, idx) => {
                    const suggestions = filterAccounts(ln.search);
                    return (
                      <tr key={ln.id} className="border-b align-top">
                        <td className="py-2 px-3 w-[320px]">
                          <div className="relative">
                            <div className="flex items-center gap-2 border rounded-lg px-3 py-2">
                              <Search size={16} className="text-gray-400" />
                              <input
                                value={ln.search}
                                onChange={e => {
                                  const v = e.target.value;
                                  setLines(prev => prev.map(x => x.id === ln.id ? { ...x, search: v, label: v, account_id: v === ln.label ? ln.account_id : '' } : x));
                                }}
                                className="flex-1 outline-none text-sm"
                                placeholder="ابحث بالرمز أو الاسم"
                              />
                            </div>
                            {ln.search.trim() && (
                              <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow max-h-64 overflow-auto">
                                {suggestions.length > 0 ? suggestions.map(a => (
                                  <button
                                    key={a.id}
                                    onClick={() => {
                                      setLines(prev => prev.map(x => x.id === ln.id ? { ...x, account_id: a.id, label: `${a.code} - ${a.name}`, search: `${a.code} - ${a.name}` } : x));
                                    }}
                                    className="block w-full text-right px-3 py-2 text-sm hover:bg-gray-50"
                                  >
                                    {a.code} - {a.name}
                                  </button>
                                )) : <div className="px-3 py-2 text-sm text-gray-500">لا نتائج</div>}
                              </div>
                            )}
                            {ln.account_id && <div className="text-xs text-gray-600 mt-1">{ln.label}</div>}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            className="w-full border rounded-lg px-3 py-2 text-sm"
                            value={ln.line_desc}
                            onChange={e => setLines(prev => prev.map(x => x.id === ln.id ? { ...x, line_desc: e.target.value } : x))}
                            placeholder="بيان السطر (اختياري)"
                          />
                        </td>
                        <td className="py-2 px-3 w-40">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-full border rounded-lg px-3 py-2 text-sm"
                            value={ln.debit}
                            onChange={e => setLines(prev => prev.map(x => x.id === ln.id ? { ...x, debit: e.target.value, credit: e.target.value ? '' : x.credit } : x))}
                            placeholder="0.00"
                          />
                        </td>
                        <td className="py-2 px-3 w-40">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-full border rounded-lg px-3 py-2 text-sm"
                            value={ln.credit}
                            onChange={e => setLines(prev => prev.map(x => x.id === ln.id ? { ...x, credit: e.target.value, debit: e.target.value ? '' : x.debit } : x))}
                            placeholder="0.00"
                          />
                        </td>
                        <td className="py-2 px-3 w-20">
                          <button
                            onClick={() => setLines(prev => prev.filter(x => x.id !== ln.id))}
                            className="p-2 rounded-lg border hover:bg-red-50 text-red-600"
                            title="حذف السطر"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="py-2 px-3 font-bold text-gray-700" colSpan={2}>الإجمالي</td>
                    <td className="py-2 px-3 font-bold text-emerald-700">{totalDebit.toLocaleString()}</td>
                    <td className="py-2 px-3 font-bold text-red-700">{totalCredit.toLocaleString()}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
 
           <div className="mt-6">
             <label className="block text-xs font-semibold text-gray-700 mb-1">البيان</label>
             <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="وصف مختصر للقيد" />
            <div className="text-xs text-gray-500 mt-1">تلميح: أضف عدة أسطر مدين/دائن بشرط توازن الإجمالي</div>
           </div>
         </div>
        )}
 
        {activeTab === 'create' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
           <div className="text-sm text-gray-700 font-semibold mb-2">ملاحظات</div>
           <ul className="list-disc pr-5 text-sm text-gray-600 space-y-1">
             <li>يتحقق النظام من وجود فترة محاسبية مفتوحة قبل الترحيل.</li>
             <li>يتم إنشاء قيد يومية بالحالة "posted" مع سطرين (مدين/دائن) متوازنين.</li>
             <li>للقبض/الصرف اختر نفسياً نوع القيد، لكن الحسابات قابلة للاختيار بحرية.</li>
           </ul>
         </div>
        )}

        {activeTab === 'vouchers' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div className="md:col-span-1">
                <label className="block text-xs font-semibold text-gray-700 mb-1">من تاريخ</label>
                <input type="date" value={listStart} onChange={e => setListStart(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-1">
                <label className="block text-xs font-semibold text-gray-700 mb-1">إلى تاريخ</label>
                <input type="date" value={listEnd} onChange={e => setListEnd(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">بحث</label>
                <input type="text" value={listQuery} onChange={e => setListQuery(e.target.value)} placeholder="رقم السند، البيان، أو اسم الحساب" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-1">
                <button onClick={loadEntries} disabled={listLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50">
                  بحث
                </button>
              </div>
            </div>
            <div className="mt-4 overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-right text-gray-600 border-b">
                    <th className="py-2 px-3">التاريخ</th>
                    <th className="py-2 px-3">رقم السند</th>
                    <th className="py-2 px-3">البيان</th>
                    <th className="py-2 px-3">مدين</th>
                    <th className="py-2 px-3">دائن</th>
                    <th className="py-2 px-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((je: any) => {
                    const totalDebit = (je.journal_lines || []).reduce((acc: number, ln: any) => acc + Number(ln.debit || 0), 0);
                    const totalCredit = (je.journal_lines || []).reduce((acc: number, ln: any) => acc + Number(ln.credit || 0), 0);
                    return (
                      <tr key={je.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3 whitespace-nowrap">{je.entry_date ? format(new Date(je.entry_date), 'yyyy-MM-dd') : '-'}</td>
                        <td className="py-2 px-3 font-mono">{je.voucher_number || '-'}</td>
                        <td className="py-2 px-3">{je.description || '-'}</td>
                        <td className="py-2 px-3 text-emerald-700 font-bold">{totalDebit.toLocaleString()}</td>
                        <td className="py-2 px-3 text-red-700 font-bold">{totalCredit.toLocaleString()}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-3">
                            <a href={`/print/journal-entry/${je.id}`} target="_blank" className="text-blue-600 hover:underline">طباعة</a>
                            <button onClick={() => setFromEntry(je)} className="text-gray-700 hover:text-gray-900 flex items-center gap-1">
                              <CopyIcon size={14} /> نسخ
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-gray-500">لا توجد سندات ضمن المدى</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
       </div>
     </RoleGate>
   );
 }
 
