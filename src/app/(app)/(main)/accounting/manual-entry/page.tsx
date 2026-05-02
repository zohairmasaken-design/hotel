 'use client';
 
import React, { useEffect, useMemo, useState } from 'react';
 import RoleGate from '@/components/auth/RoleGate';
 import { supabase } from '@/lib/supabase';
 import { format } from 'date-fns';
import { Search, ArrowLeftRight, CheckCircle2, Plus, Trash2, Copy as CopyIcon, Link2, X, Loader2 } from 'lucide-react';
import { useActiveHotel } from '@/hooks/useActiveHotel';
 
 type Account = { id: string; code: string; name: string };
type InvoiceSearchRow = {
  id: string;
  invoice_number: string;
  invoice_date: string | null;
  status: string;
  total_amount: number;
  customer_id: string;
  customer_name: string;
  booking_id: string | null;
  unit_number: string | null;
};
type PurchaseItemLine = {
  id: string;
  account_id: string;
  label: string;
  search: string;
  item_desc: string;
  qty: string;
  unit_price: string;
};
 
 export default function ManualEntryPage() {
  const { activeHotelId } = useActiveHotel();
   const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [activeTab, setActiveTab] = useState<'create' | 'vouchers' | 'purchase_invoice'>('create');
 
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
  const [linkedByJournalId, setLinkedByJournalId] = useState<Record<string, { payment_id: string; invoice_id: string }>>({});

  const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [purchaseVendorName, setPurchaseVendorName] = useState('');
  const [purchaseInvoiceNumber, setPurchaseInvoiceNumber] = useState('');
  const [purchaseNote, setPurchaseNote] = useState('');
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemLine[]>([
    { id: crypto.randomUUID(), account_id: '', label: '', search: '', item_desc: '', qty: '1', unit_price: '' },
  ]);
  const [purchaseTaxAmount, setPurchaseTaxAmount] = useState<string>('');
  const [purchaseTaxAccountId, setPurchaseTaxAccountId] = useState<string>('');
  const [purchaseTaxAccountLabel, setPurchaseTaxAccountLabel] = useState<string>('');
  const [purchaseTaxAccountSearch, setPurchaseTaxAccountSearch] = useState<string>('');
  const [purchaseCreditAccountId, setPurchaseCreditAccountId] = useState<string>('');
  const [purchaseCreditAccountLabel, setPurchaseCreditAccountLabel] = useState<string>('');
  const [purchaseCreditAccountSearch, setPurchaseCreditAccountSearch] = useState<string>('');
  const [purchasePosting, setPurchasePosting] = useState(false);

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkVoucher, setLinkVoucher] = useState<any | null>(null);
  const [invoiceSearchText, setInvoiceSearchText] = useState('');
  const [invoiceSearchDate, setInvoiceSearchDate] = useState<string>('');
  const [invoiceSearching, setInvoiceSearching] = useState(false);
  const [invoiceResults, setInvoiceResults] = useState<InvoiceSearchRow[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceSearchRow | null>(null);

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

      const ids = (rows || []).map((r: any) => String(r.id)).filter(Boolean);
      if (ids.length > 0) {
        const { data: payRows } = await supabase
          .from('payments')
          .select('id, journal_entry_id, invoice_id')
          .in('journal_entry_id', ids)
          .not('invoice_id', 'is', null);
        const map: Record<string, { payment_id: string; invoice_id: string }> = {};
        (payRows || []).forEach((p: any) => {
          if (!p?.journal_entry_id || !p?.invoice_id) return;
          map[String(p.journal_entry_id)] = { payment_id: String(p.id), invoice_id: String(p.invoice_id) };
        });
        setLinkedByJournalId(map);
      } else {
        setLinkedByJournalId({});
      }
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
  const purchaseItemsTotal = useMemo(
    () =>
      purchaseItems.reduce((s, l) => {
        const q = parseFloat(l.qty || '0') || 0;
        const p = parseFloat(l.unit_price || '0') || 0;
        const lineTotal = Math.max(0, q * p);
        return s + lineTotal;
      }, 0),
    [purchaseItems]
  );
  const purchaseTaxTotal = useMemo(() => (parseFloat(purchaseTaxAmount || '0') || 0), [purchaseTaxAmount]);
  const purchaseTotal = useMemo(() => Math.max(0, purchaseItemsTotal + purchaseTaxTotal), [purchaseItemsTotal, purchaseTaxTotal]);

  const openLinkModal = (je: any) => {
    setLinkVoucher(je);
    setInvoiceResults([]);
    setSelectedInvoice(null);
    setInvoiceSearchText('');
    setInvoiceSearchDate('');
    setShowLinkModal(true);
  };

  const closeLinkModal = () => {
    if (linking) return;
    setShowLinkModal(false);
    setLinkVoucher(null);
    setInvoiceResults([]);
    setSelectedInvoice(null);
  };

  const searchInvoices = async () => {
    const term = invoiceSearchText.trim();
    if (!term) {
      alert('أدخل رقم الفاتورة أو اسم العميل أو رقم الغرفة');
      return;
    }
    setInvoiceSearching(true);
    try {
      const dateStr = invoiceSearchDate || '';
      const dateFrom = dateStr ? dateStr : null;
      const dateTo = dateStr
        ? new Date(new Date(`${dateStr}T00:00:00`).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : null;

      const baseInvoiceSelect = `
        id,
        invoice_number,
        invoice_date,
        status,
        total_amount,
        customer_id,
        booking_id,
        customer:customers(full_name)
      `;

      const baseFilter = (q: any) => {
        let qq = q;
        if (dateFrom && dateTo) {
          qq = qq.gte('invoice_date', dateFrom).lt('invoice_date', dateTo);
        }
        return qq;
      };

      const byNumberPromise = baseFilter(
        supabase
          .from('invoices')
          .select(baseInvoiceSelect)
          .ilike('invoice_number', `%${term}%`)
          .order('invoice_date', { ascending: false })
          .limit(50)
      );

      const customersPromise = supabase
        .from('customers')
        .select('id, full_name')
        .ilike('full_name', `%${term}%`)
        .limit(25);

      const unitsPromise = supabase
        .from('units')
        .select('id, unit_number')
        .ilike('unit_number', `%${term}%`)
        .limit(25);

      const [{ data: invByNumber }, { data: customers }, { data: units }] = await Promise.all([
        byNumberPromise,
        customersPromise,
        unitsPromise,
      ]);

      const customerIds = (customers || []).map((c: any) => String(c.id));
      const unitIds = (units || []).map((u: any) => String(u.id));

      const byCustomerPromise =
        customerIds.length > 0
          ? baseFilter(
              supabase
                .from('invoices')
                .select(baseInvoiceSelect)
                .in('customer_id', customerIds)
                .order('invoice_date', { ascending: false })
                .limit(50)
            )
          : Promise.resolve({ data: [] as any[] });

      const bookingsPromise =
        unitIds.length > 0
          ? supabase.from('bookings').select('id, unit_id').in('unit_id', unitIds).limit(200)
          : Promise.resolve({ data: [] as any[] });

      const [{ data: invByCustomer }, { data: bookingsByUnit }] = await Promise.all([byCustomerPromise as any, bookingsPromise as any]);

      const bookingIds = (bookingsByUnit || []).map((b: any) => String(b.id));

      const byBookingPromise =
        bookingIds.length > 0
          ? baseFilter(
              supabase
                .from('invoices')
                .select(baseInvoiceSelect)
                .in('booking_id', bookingIds)
                .order('invoice_date', { ascending: false })
                .limit(50)
            )
          : Promise.resolve({ data: [] as any[] });

      const [{ data: invByBooking }] = await Promise.all([byBookingPromise as any]);

      const merged = new Map<string, any>();
      [...(invByNumber || []), ...(invByCustomer || []), ...(invByBooking || [])].forEach((r: any) => {
        if (!r?.id) return;
        merged.set(String(r.id), r);
      });

      const list = Array.from(merged.values());

      const bookingIdsForUnits = Array.from(
        new Set(list.map((r: any) => (r?.booking_id ? String(r.booking_id) : '')).filter(Boolean))
      );

      let unitNumberByBookingId: Record<string, string> = {};
      if (bookingIdsForUnits.length > 0) {
        const { data: bRows } = await supabase
          .from('bookings')
          .select('id, unit:units(unit_number)')
          .in('id', bookingIdsForUnits);
        (bRows || []).forEach((b: any) => {
          if (!b?.id) return;
          unitNumberByBookingId[String(b.id)] = b?.unit?.unit_number ? String(b.unit.unit_number) : '';
        });
      }

      const normalized: InvoiceSearchRow[] = list.map((r: any) => ({
        id: String(r.id),
        invoice_number: String(r.invoice_number || ''),
        invoice_date: r.invoice_date ? String(r.invoice_date) : null,
        status: String(r.status || ''),
        total_amount: Number(r.total_amount || 0),
        customer_id: String(r.customer_id || ''),
        customer_name: String(r.customer?.full_name || 'غير معروف'),
        booking_id: r.booking_id ? String(r.booking_id) : null,
        unit_number: r.booking_id ? (unitNumberByBookingId[String(r.booking_id)] || null) : null,
      }));

      setInvoiceResults(normalized);
    } catch (e: any) {
      alert('تعذر البحث عن الفواتير: ' + (e?.message || 'خطأ غير معروف'));
    } finally {
      setInvoiceSearching(false);
    }
  };

  const linkVoucherToInvoice = async () => {
    if (!linkVoucher?.id) return;
    if (!selectedInvoice?.id) {
      alert('اختر الفاتورة أولاً');
      return;
    }

    const totalVoucherDebit = (linkVoucher.journal_lines || []).reduce((acc: number, ln: any) => acc + Number(ln.debit || 0), 0);
    if (!Number.isFinite(totalVoucherDebit) || totalVoucherDebit <= 0) {
      alert('مبلغ السند غير صحيح');
      return;
    }

    if (linkedByJournalId[String(linkVoucher.id)]) {
      alert('هذا السند مرتبط مسبقاً بفاتورة');
      return;
    }

    const ok = confirm(
      `سيتم ربط السند (${linkVoucher.voucher_number || String(linkVoucher.id).slice(0, 8)}) بمبلغ ${Number(totalVoucherDebit).toLocaleString()} ر.س كـ سداد على الفاتورة (${selectedInvoice.invoice_number}). هل تريد المتابعة؟`
    );
    if (!ok) return;

    setLinking(true);
    try {
      const { data, error } = await supabase.rpc('apply_manual_voucher_to_invoice', {
        p_journal_entry_id: linkVoucher.id,
        p_invoice_id: selectedInvoice.id,
      });
      if (error) throw error;
      if (!data) {
        alert('تم التنفيذ لكن لم يرجع معرف العملية');
      } else {
        alert('تم ربط السند بالفاتورة كسداد بنجاح');
      }
      closeLinkModal();
      loadEntries();
    } catch (e: any) {
      const msg = String(e?.message || e?.details || e || '');
      if (msg.toLowerCase().includes('could not find the function')) {
        alert('الوظيفة غير موجودة في قاعدة البيانات بعد. شغّل سكربت apply_manual_voucher_to_invoice_rpc.sql على Supabase ثم أعد المحاولة.');
      } else if (msg.includes('Invoice remaining is less than voucher amount')) {
        alert('المتبقي في الفاتورة أقل من مبلغ السند. اختر فاتورة أخرى أو سددها جزئياً من صفحة تفاصيل الحجز.');
      } else if (msg.includes('Voucher already linked')) {
        alert('هذا السند تم ربطه مسبقاً ولا يمكن ربطه مرة أخرى.');
      } else if (msg.includes('Invoice is not payable')) {
        alert('لا يمكن سداد هذه الفاتورة لأنها مسودة/ملغاة.');
      } else {
        alert('تعذر ربط السند: ' + (msg || 'خطأ غير معروف'));
      }
    } finally {
      setLinking(false);
    }
  };

  const handlePostPurchaseInvoice = async () => {
    if (!purchaseDate) return alert('الرجاء تحديد تاريخ الفاتورة');
    if (!purchaseCreditAccountId) return alert('اختر حساب الدائن (الصندوق/البنوك أو الدائنون)');
    const cleanItems = purchaseItems
      .map((l) => ({
        ...l,
        qtyNum: parseFloat(l.qty || '0') || 0,
        unitPriceNum: parseFloat(l.unit_price || '0') || 0,
      }))
      .map((l: any) => ({ ...l, lineTotalNum: Math.max(0, Number(l.qtyNum) * Number(l.unitPriceNum)) }))
      .filter((l: any) => l.lineTotalNum > 0);
    if (cleanItems.length === 0) return alert('أضف بند واحد على الأقل (كمية وسعر)');
    for (const l of cleanItems) {
      if (!l.account_id) return alert('اختر الحساب لكل بند');
      if (!Number.isFinite(l.qtyNum) || l.qtyNum <= 0) return alert('الكمية يجب أن تكون أكبر من صفر');
      if (!Number.isFinite(l.unitPriceNum) || l.unitPriceNum < 0) return alert('سعر الوحدة غير صحيح');
    }
    if (purchaseTaxTotal > 0 && !purchaseTaxAccountId) return alert('اختر حساب ضريبة المدخلات');
    if (purchaseTotal <= 0) return alert('إجمالي الفاتورة غير صحيح');

    setPurchasePosting(true);
    try {
      const { data: period, error: periodError } = await supabase
        .from('accounting_periods')
        .select('id')
        .lte('start_date', purchaseDate)
        .gte('end_date', purchaseDate)
        .eq('status', 'open')
        .maybeSingle();
      if (periodError) throw periodError;
      if (!period) throw new Error(`لا توجد فترة محاسبية مفتوحة للتاريخ (${purchaseDate})`);

      const voucherNumber = `PI-${purchaseDate.replaceAll('-', '')}-${Math.random().toString(36).slice(-4).toUpperCase()}`;
      const headerDescParts = [
        'فاتورة مشتريات',
        purchaseInvoiceNumber.trim() ? `#${purchaseInvoiceNumber.trim()}` : '',
        purchaseVendorName.trim() ? `- ${purchaseVendorName.trim()}` : '',
      ].filter(Boolean);
      const headerDesc = headerDescParts.join(' ');

      const { data: je, error: jeError } = await supabase
        .from('journal_entries')
        .insert({
          entry_date: purchaseDate,
          voucher_number: voucherNumber,
          description: headerDesc,
          status: 'posted',
        })
        .select()
        .single();
      if (jeError) throw jeError;

      const linesPayload: any[] = [];
      for (const l of cleanItems) {
        const descParts = [
          (l.item_desc || '').trim(),
          `${Number(l.qtyNum).toLocaleString('en-US')} × ${Number(l.unitPriceNum).toLocaleString('en-US')}`
        ].filter(Boolean);
        linesPayload.push({
          journal_entry_id: je.id,
          account_id: l.account_id,
          debit: Number(l.lineTotalNum),
          credit: 0,
          description: descParts.join(' - ') || null,
        });
      }

      if (purchaseTaxTotal > 0) {
        linesPayload.push({
          journal_entry_id: je.id,
          account_id: purchaseTaxAccountId,
          debit: Number(purchaseTaxTotal),
          credit: 0,
          description: 'ضريبة قيمة مضافة (مدخلات)',
        });
      }

      const creditDescParts = [
        purchaseVendorName.trim() ? purchaseVendorName.trim() : '',
        purchaseInvoiceNumber.trim() ? `فاتورة ${purchaseInvoiceNumber.trim()}` : '',
        purchaseNote.trim() ? purchaseNote.trim() : '',
      ].filter(Boolean);

      linesPayload.push({
        journal_entry_id: je.id,
        account_id: purchaseCreditAccountId,
        debit: 0,
        credit: Number(purchaseTotal),
        description: creditDescParts.join(' - ') || null,
      });

      const { error: linesErr } = await supabase.from('journal_lines').insert(linesPayload);
      if (linesErr) throw linesErr;

      try {
        await supabase.from('system_events').insert({
          event_type: 'purchase_invoice',
          message: `${headerDesc} بمبلغ ${Number(purchaseTotal).toLocaleString()} ر.س`,
          payload: {
            entry_date: purchaseDate,
            voucher_number: voucherNumber,
            vendor_name: purchaseVendorName.trim() || null,
            vendor_invoice_number: purchaseInvoiceNumber.trim() || null,
            items_total: purchaseItemsTotal,
            tax_amount: purchaseTaxTotal,
            total_amount: purchaseTotal,
            credit_account_id: purchaseCreditAccountId,
            tax_account_id: purchaseTaxTotal > 0 ? purchaseTaxAccountId : null,
            items: cleanItems.map((x: any) => ({
              account_id: x.account_id,
              qty: x.qtyNum,
              unit_price: x.unitPriceNum,
              total: x.lineTotalNum,
              description: (x.item_desc || '').trim() || null,
            })),
          },
        });
      } catch {}

      alert('تم تسجيل فاتورة المشتريات وترحيل القيد بنجاح');
      setPurchaseVendorName('');
      setPurchaseInvoiceNumber('');
      setPurchaseNote('');
      setPurchaseItems([{ id: crypto.randomUUID(), account_id: '', label: '', search: '', item_desc: '', qty: '1', unit_price: '' }]);
      setPurchaseTaxAmount('');
      setPurchaseTaxAccountId('');
      setPurchaseTaxAccountLabel('');
      setPurchaseTaxAccountSearch('');
      setPurchaseCreditAccountId('');
      setPurchaseCreditAccountLabel('');
      setPurchaseCreditAccountSearch('');
      setActiveTab('vouchers');
      loadEntries();
    } catch (e: any) {
      alert(e?.message || 'تعذر تسجيل فاتورة المشتريات');
    } finally {
      setPurchasePosting(false);
    }
  };

  const handleSubmit = async () => {
    if (!entryDate) return alert('الرجاء تحديد التاريخ');
    if (lines.length < 2) return alert('أضف على الأقل سطرين (مدين ودائن)');
    if (!activeHotelId || activeHotelId === 'all') return alert('اختر الفرع (الفندق) من أعلى النظام قبل ترحيل القيد');
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
           hotel_id: activeHotelId,
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
           hotel_id: activeHotelId,
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

  const handleReverseEntry = (je: any) => {
    const ls = (je.journal_lines || []).map((ln: any) => ({
      id: crypto.randomUUID(),
      account_id: ln.account_id,
      label: `${ln.account?.code || ''} - ${ln.account?.name || ''}`,
      line_desc: `عكس القيد رقم ${je.voucher_number || ''}: ${ln.description || ''}`,
      debit: String(ln.credit || 0),
      credit: String(ln.debit || 0),
      search: ''
    }));
    
    setEntryDate(new Date().toISOString().split('T')[0]);
    setDescription(`عكس القيد رقم ${je.voucher_number || ''} - ${je.description || ''}`);
    setVoucherType('general');
    setLines(ls);
    setActiveTab('create');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا القيد نهائياً؟ سيتم حذف جميع الأسطر المرتبطة به وفك أي ارتباط مع دفعات أو فواتير. لا يمكن التراجع عن هذه العملية.')) return;
    
    setLoading(true);
    try {
      // 1. فك الارتباط في جدول المدفوعات إذا وجد
      const { error: payError } = await supabase
        .from('payments')
        .update({ journal_entry_id: null })
        .eq('journal_entry_id', id);
      
      if (payError) throw payError;

      // 2. حذف أسطر القيد يدوياً لضمان عدم وجود قيود معلقة
      const { error: linesError } = await supabase
        .from('journal_lines')
        .delete()
        .eq('journal_entry_id', id);
      
      if (linesError) throw linesError;

      // 3. حذف القيد الرئيسي
      const { error: jeError } = await supabase
        .from('journal_entries')
        .delete()
        .eq('id', id);

      if (jeError) throw jeError;
      
      alert('تم حذف القيد والبيانات المرتبطة به نهائياً وبنجاح');
      loadEntries();
    } catch (e: any) {
      alert(e.message || 'تعذر حذف القيد بالكامل');
    } finally {
      setLoading(false);
    }
  };
 
   return (
     <RoleGate allow={['admin', 'accountant']}>
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
            onClick={() => setActiveTab('purchase_invoice')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'purchase_invoice' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            فاتورة مشتريات
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
 
        {activeTab === 'purchase_invoice' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">تاريخ الفاتورة</label>
                <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">رقم فاتورة المورد (اختياري)</label>
                <input value={purchaseInvoiceNumber} onChange={(e) => setPurchaseInvoiceNumber(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="مثال: 12345" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">اسم المورد/المحل (اختياري)</label>
                <input value={purchaseVendorName} onChange={(e) => setPurchaseVendorName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="مثال: مؤسسة ..." />
              </div>
            </div>

            <div className="mt-5">
              <div className="text-sm font-semibold text-gray-700 mb-2">بنود الفاتورة</div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-right text-gray-600 border-b">
                      <th className="py-2 px-3">الحساب (مصروف/أصل)</th>
                      <th className="py-2 px-3">الوصف</th>
                      <th className="py-2 px-3 whitespace-nowrap">الكمية</th>
                      <th className="py-2 px-3 whitespace-nowrap">سعر الوحدة</th>
                      <th className="py-2 px-3 whitespace-nowrap">الإجمالي</th>
                      <th className="py-2 px-3">حذف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseItems.map((ln) => {
                      const suggestions = filterAccounts(ln.search);
                      const qtyNum = parseFloat(ln.qty || '0') || 0;
                      const unitPriceNum = parseFloat(ln.unit_price || '0') || 0;
                      const lineTotalNum = Math.max(0, qtyNum * unitPriceNum);
                      return (
                        <tr key={ln.id} className="border-b align-top">
                          <td className="py-2 px-3 w-[360px]">
                            <div className="relative">
                              <div className="flex items-center gap-2 border rounded-lg px-3 py-2">
                                <Search size={16} className="text-gray-400" />
                                <input
                                  value={ln.search}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setPurchaseItems((prev) =>
                                      prev.map((x) => (x.id === ln.id ? { ...x, search: v, label: v, account_id: v === ln.label ? ln.account_id : '' } : x))
                                    );
                                  }}
                                  className="flex-1 outline-none text-sm"
                                  placeholder="ابحث بالرمز أو الاسم"
                                />
                              </div>
                              {ln.search.trim() && (
                                <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow max-h-64 overflow-auto">
                                  {suggestions.length > 0 ? (
                                    suggestions.map((a) => (
                                      <button
                                        key={a.id}
                                        onClick={() => {
                                          setPurchaseItems((prev) =>
                                            prev.map((x) => (x.id === ln.id ? { ...x, account_id: a.id, label: `${a.code} - ${a.name}`, search: `${a.code} - ${a.name}` } : x))
                                          );
                                        }}
                                        className="block w-full text-right px-3 py-2 text-sm hover:bg-gray-50"
                                      >
                                        {a.code} - {a.name}
                                      </button>
                                    ))
                                  ) : (
                                    <div className="px-3 py-2 text-sm text-gray-500">لا نتائج</div>
                                  )}
                                </div>
                              )}
                              {ln.account_id && <div className="text-xs text-gray-600 mt-1">{ln.label}</div>}
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <input
                              className="w-full border rounded-lg px-3 py-2 text-sm"
                              value={ln.item_desc}
                              onChange={(e) => setPurchaseItems((prev) => prev.map((x) => (x.id === ln.id ? { ...x, item_desc: e.target.value } : x)))}
                              placeholder="مثال: أدوات تنظيف"
                            />
                          </td>
                          <td className="py-2 px-3 w-28">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                              value={ln.qty}
                              onChange={(e) => setPurchaseItems((prev) => prev.map((x) => (x.id === ln.id ? { ...x, qty: e.target.value } : x)))}
                              placeholder="1"
                            />
                          </td>
                          <td className="py-2 px-3 w-40">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                              value={ln.unit_price}
                              onChange={(e) => setPurchaseItems((prev) => prev.map((x) => (x.id === ln.id ? { ...x, unit_price: e.target.value } : x)))}
                              placeholder="0.00"
                            />
                          </td>
                          <td className="py-2 px-3 w-44 font-bold text-gray-900 whitespace-nowrap">
                            {Number(lineTotalNum).toLocaleString('en-US')} ر.س
                          </td>
                          <td className="py-2 px-3 w-20">
                            <button
                              onClick={() => setPurchaseItems((prev) => prev.filter((x) => x.id !== ln.id))}
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
                      <td colSpan={6} className="py-2 px-3">
                        <button
                          onClick={() =>
                            setPurchaseItems((prev) => [
                              ...prev,
                              { id: crypto.randomUUID(), account_id: '', label: '', search: '', item_desc: '', qty: '1', unit_price: '' },
                            ])
                          }
                          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs flex items-center gap-1"
                        >
                          <Plus size={14} /> إضافة بند
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">ضريبة (اختياري)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchaseTaxAmount}
                  onChange={(e) => setPurchaseTaxAmount(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                  placeholder="0.00"
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-xs font-semibold text-gray-700 mb-1">حساب ضريبة المدخلات</label>
                <div className="relative">
                  <div className="flex items-center gap-2 border rounded-lg px-3 py-2">
                    <Search size={16} className="text-gray-400" />
                    <input
                      value={purchaseTaxAccountSearch}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPurchaseTaxAccountSearch(v);
                        setPurchaseTaxAccountLabel(v);
                        if (v !== purchaseTaxAccountLabel) setPurchaseTaxAccountId('');
                      }}
                      className="flex-1 outline-none text-sm"
                      placeholder="اختياري إذا الضريبة 0"
                    />
                  </div>
                  {purchaseTaxAccountSearch.trim() && (
                    <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow max-h-64 overflow-auto">
                      {filterAccounts(purchaseTaxAccountSearch).length > 0 ? (
                        filterAccounts(purchaseTaxAccountSearch).map((a) => (
                          <button
                            key={a.id}
                            onClick={() => {
                              setPurchaseTaxAccountId(a.id);
                              setPurchaseTaxAccountLabel(`${a.code} - ${a.name}`);
                              setPurchaseTaxAccountSearch(`${a.code} - ${a.name}`);
                            }}
                            className="block w-full text-right px-3 py-2 text-sm hover:bg-gray-50"
                          >
                            {a.code} - {a.name}
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-gray-500">لا نتائج</div>
                      )}
                    </div>
                  )}
                  {purchaseTaxAccountId && <div className="text-xs text-gray-600 mt-1">{purchaseTaxAccountLabel}</div>}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">حساب الدائن (الصندوق/البنوك أو الدائنون)</label>
                <div className="relative">
                  <div className="flex items-center gap-2 border rounded-lg px-3 py-2">
                    <Search size={16} className="text-gray-400" />
                    <input
                      value={purchaseCreditAccountSearch}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPurchaseCreditAccountSearch(v);
                        setPurchaseCreditAccountLabel(v);
                        if (v !== purchaseCreditAccountLabel) setPurchaseCreditAccountId('');
                      }}
                      className="flex-1 outline-none text-sm"
                      placeholder="ابحث بالرمز أو الاسم"
                    />
                  </div>
                  {purchaseCreditAccountSearch.trim() && (
                    <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow max-h-64 overflow-auto">
                      {filterAccounts(purchaseCreditAccountSearch).length > 0 ? (
                        filterAccounts(purchaseCreditAccountSearch).map((a) => (
                          <button
                            key={a.id}
                            onClick={() => {
                              setPurchaseCreditAccountId(a.id);
                              setPurchaseCreditAccountLabel(`${a.code} - ${a.name}`);
                              setPurchaseCreditAccountSearch(`${a.code} - ${a.name}`);
                            }}
                            className="block w-full text-right px-3 py-2 text-sm hover:bg-gray-50"
                          >
                            {a.code} - {a.name}
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-gray-500">لا نتائج</div>
                      )}
                    </div>
                  )}
                  {purchaseCreditAccountId && <div className="text-xs text-gray-600 mt-1">{purchaseCreditAccountLabel}</div>}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <label className="block text-xs font-semibold text-gray-700 mb-1">ملاحظات (اختياري)</label>
              <textarea
                value={purchaseNote}
                onChange={(e) => setPurchaseNote(e.target.value)}
                rows={3}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="أي تفاصيل إضافية"
              />
            </div>

            <div className="mt-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-sm font-bold text-gray-900">
                الإجمالي: {Number(purchaseTotal).toLocaleString()} ر.س
              </div>
              <button
                onClick={handlePostPurchaseInvoice}
                disabled={purchasePosting || loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <CheckCircle2 size={18} />
                {purchasePosting ? 'جاري الترحيل...' : 'ترحيل فاتورة المشتريات'}
              </button>
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
                    const linked = linkedByJournalId[String(je.id)];
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
                            <button onClick={() => setFromEntry(je)} className="text-gray-700 hover:text-gray-900 flex items-center gap-1" title="نسخ البيانات لقيد جديد">
                              <CopyIcon size={14} /> نسخ
                            </button>
                            <button onClick={() => handleReverseEntry(je)} className="text-orange-600 hover:text-orange-800 flex items-center gap-1" title="إنشاء قيد عكسي">
                              <ArrowLeftRight size={14} /> عكس
                            </button>
                            <button onClick={() => handleDeleteEntry(je.id)} className="text-red-600 hover:text-red-800 flex items-center gap-1" title="حذف القيد نهائياً">
                              <Trash2 size={14} /> حذف
                            </button>
                            {linked ? (
                              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
                                مرتبط بفاتورة
                              </span>
                            ) : (
                              <button
                                onClick={() => openLinkModal(je)}
                                className="text-gray-700 hover:text-gray-900 flex items-center gap-1"
                                title="ربط السند بفاتورة كسداد"
                              >
                                <Link2 size={14} /> ربط
                              </button>
                            )}
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

        {showLinkModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="space-y-1">
                  <div className="text-lg font-extrabold text-gray-900">ربط سند بفاتورة</div>
                  <div className="text-xs text-gray-500">
                    السند: <span className="font-mono font-bold text-gray-900">{linkVoucher?.voucher_number || '-'}</span>
                  </div>
                </div>
                <button onClick={closeLinkModal} className="text-gray-400 hover:text-gray-600" disabled={linking}>
                  <X size={22} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">بحث (رقم الفاتورة / اسم العميل / رقم الغرفة)</label>
                  <input
                    value={invoiceSearchText}
                    onChange={(e) => setInvoiceSearchText(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="مثال: 000123 أو أحمد أو 101"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">تاريخ الفاتورة (اختياري)</label>
                  <input
                    type="date"
                    value={invoiceSearchDate}
                    onChange={(e) => setInvoiceSearchDate(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={searchInvoices}
                  disabled={invoiceSearching}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {invoiceSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  بحث
                </button>
                <div className="text-xs text-gray-500">اختر الفاتورة من النتائج ثم اضغط "ترحيل كسداد".</div>
              </div>

              <div className="mt-4 border rounded-xl overflow-auto max-h-[320px]">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr className="text-right text-gray-600">
                      <th className="py-2 px-3">الفاتورة</th>
                      <th className="py-2 px-3">العميل</th>
                      <th className="py-2 px-3">الغرفة</th>
                      <th className="py-2 px-3">التاريخ</th>
                      <th className="py-2 px-3">الإجمالي</th>
                      <th className="py-2 px-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceResults.map((inv) => {
                      const isSelected = selectedInvoice?.id === inv.id;
                      return (
                        <tr
                          key={inv.id}
                          className={`border-b cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                          onClick={() => setSelectedInvoice(inv)}
                        >
                          <td className="py-2 px-3 font-mono font-bold text-gray-900">{inv.invoice_number}</td>
                          <td className="py-2 px-3 text-gray-900">{inv.customer_name}</td>
                          <td className="py-2 px-3 text-gray-700 font-mono">{inv.unit_number || '-'}</td>
                          <td className="py-2 px-3 text-gray-600 whitespace-nowrap">
                            {inv.invoice_date ? String(inv.invoice_date).split('T')[0] : '-'}
                          </td>
                          <td className="py-2 px-3 font-bold text-gray-900 whitespace-nowrap">{Number(inv.total_amount || 0).toLocaleString()} ر.س</td>
                          <td className="py-2 px-3 text-gray-700">{inv.status}</td>
                        </tr>
                      );
                    })}
                    {invoiceResults.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-gray-500">
                          لا توجد نتائج
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-xs text-gray-600">
                  مبلغ السند: <span className="font-bold text-gray-900">{Number((linkVoucher?.journal_lines || []).reduce((a: number, ln: any) => a + Number(ln.debit || 0), 0)).toLocaleString()} ر.س</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={closeLinkModal} disabled={linking} className="px-4 py-2 rounded-lg border text-sm font-bold">
                    إلغاء
                  </button>
                  <button
                    onClick={linkVoucherToInvoice}
                    disabled={linking || !selectedInvoice}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {linking ? <Loader2 size={16} className="animate-spin" /> : <ArrowLeftRight size={16} />}
                    ترحيل كسداد
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
       </div>
     </RoleGate>
   );
 }
 
