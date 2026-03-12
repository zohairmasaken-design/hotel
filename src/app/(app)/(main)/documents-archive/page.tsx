'use client';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/lib/supabase';

export default function DocumentsArchivePage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [docType, setDocType] = useState<string>('');
  const [unitNumber, setUnitNumber] = useState<string>('');
  const [customerId, setCustomerId] = useState<string>('');
  const [customers, setCustomers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [manualMode, setManualMode] = useState<boolean>(false);
  const [manualQuery, setManualQuery] = useState<string>('');
  const [manualResults, setManualResults] = useState<Array<{ id: string; full_name: string; phone?: string | null }>>([]);
  const [saving, setSaving] = useState(false);
  const today = useMemo(() => format(new Date(), 'dd/MM/yyyy', { locale: ar }), []);
  const [list, setList] = useState<any[]>([]);
  const [filterType, setFilterType] = useState<string>('');
  const [filterUnit, setFilterUnit] = useState<string>('');
  const [filterCustomer, setFilterCustomer] = useState<string>('');
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');
  const { role } = useUserRole();
  const listSeqRef = useRef(0);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const fetchCustomers = async () => {
      setCustomers([]);
      setCustomerId('');
      if (!unitNumber) return;
      const res = await fetch('/api/document-helpers/customers-by-unit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit_number: unitNumber })
      });
      if (!res.ok) return;
      const data = await res.json();
      setCustomers((data?.customers || []).map((c: any) => ({ id: c.id, full_name: c.full_name })));
    };
    fetchCustomers();
  }, [unitNumber]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!manualMode) {
        setManualResults([]);
        return;
      }
      const q = manualQuery.trim();
      if (!q) {
        setManualResults([]);
        return;
      }
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, phone, national_id')
        .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,national_id.ilike.%${q}%`)
        .limit(8);
      if (!cancelled) {
        if (!error && data) {
          setManualResults(
            data.map((c: any) => ({ id: c.id, full_name: c.full_name, phone: c.phone || null }))
          );
        } else {
          setManualResults([]);
        }
      }
    };
    const t = setTimeout(run, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [manualMode, manualQuery]);

  const handleFilePick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf';
    input.capture = 'environment';
    input.onchange = () => {
      const f = input.files?.[0] || null;
      setFile(f);
    };
    input.click();
  };

  const handleSave = async () => {
    if (!file || !docType || !unitNumber || !customerId) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('doc_type', docType);
      fd.append('unit_number', unitNumber);
      fd.append('customer_id', customerId);
      fd.append('doc_date', new Date().toISOString());
      const res = await fetch('/api/documents/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data?.ok) {
        setFile(null);
        setPreview(null);
        setDocType('');
        setUnitNumber('');
        setCustomerId('');
        setCustomers([]);
        alert('تم حفظ الوثيقة في الأرشيف');
        await refreshList();
      } else {
        const reason = [data?.error, data?.message].filter(Boolean).join(' — ');
        alert(`فشل رفع الوثيقة: ${reason || 'سبب غير معروف'}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const refreshList = async () => {
    const mySeq = ++listSeqRef.current;
    const body = {
      doc_type: filterType || null,
      unit_number: filterUnit || null,
      customer_id: filterCustomer || null,
      date_from: filterFrom || null,
      date_to: filterTo || null,
      query: filterQuery || null
    };
    const res = await fetch('/api/documents/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) return;
    const data = await res.json();
    if (mySeq === listSeqRef.current) {
      setList(data?.documents || []);
    }
  };

  const handleDelete = async (id: string) => {
    if (!id) return;
    if (!['admin', 'manager'].includes(role || '')) return;
    const confirmDel = confirm('هل أنت متأكد من حذف هذه الوثيقة؟ لا يمكن التراجع.');
    if (!confirmDel) return;
    try {
      const res = await fetch('/api/documents/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        const msg = data?.deletedAll
          ? 'تم حذف الوثيقة وكل النسخ المرتبطة بها'
          : (data?.storageOk ? 'تم حذف الوثيقة بنجاح' : 'تم حذف السجل، تعذر حذف الملف من التخزين');
        alert(msg);
        setList((prev) => prev.filter((x) => x.id !== id));
        await refreshList();
      } else {
        alert(`فشل الحذف: ${data?.error || 'سبب غير معروف'}`);
      }
    } catch (e: any) {
      alert(`فشل الحذف: خطأ شبكة`);
    }
  };

  useEffect(() => {
    if (role !== 'receptionist') {
      refreshList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  useEffect(() => {
    if (role !== 'receptionist') {
      const t = setTimeout(() => {
        refreshList();
      }, 300);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, filterType, filterUnit, filterCustomer, filterQuery, filterFrom, filterTo]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">أرشيف الوثائق</h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-500">التاريخ: {today}</p>
        </div>
        <Link href="/templates" className="text-blue-600 hover:underline text-sm">التمبلت</Link>
      </div>

      <div className="bg-white border rounded-2xl p-6 shadow-sm text-right space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleFilePick}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            إضافة وثيقة
          </button>
          {file && <span className="text-xs text-gray-600">تم اختيار: {file.name}</span>}
        </div>

        {preview && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border rounded-lg p-3">
              {file?.type === 'application/pdf' ? (
                <div className="h-64 flex items-center justify-center text-sm text-gray-500">معاينة PDF</div>
              ) : (
                <img src={preview} alt="preview" className="max-h-64 w-auto mx-auto rounded" />
              )}
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs mb-1 text-gray-600">نوع الوثيقة</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">— اختر النوع —</option>
                  <option value="voucher">سند</option>
                  <option value="invoice">فاتورة</option>
                  <option value="statement">كشف حساب</option>
                  <option value="contract">عقد</option>
                  <option value="handover">استلام</option>
                  <option value="return">تسليم</option>
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600">رقم الغرفة</label>
                <input
                  value={unitNumber}
                  onChange={(e) => setUnitNumber(e.target.value)}
                  placeholder="مثال: 204"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600">اسم العميل</label>
                {!manualMode ? (
                  <>
                    <select
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">— اختر العميل —</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.full_name}</option>
                      ))}
                    </select>
                    <div className="mt-1 flex items-center justify-between">
                      {unitNumber && customers.length === 0 ? (
                        <p className="text-xs text-gray-500">لا يوجد عملاء نشطون لهذه الغرفة حالياً</p>
                      ) : <span />}
                      <button
                        type="button"
                        onClick={() => { setManualMode(true); setManualQuery(''); setManualResults([]); }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        أو اختر يدوياً
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={manualQuery}
                        onChange={(e) => setManualQuery(e.target.value)}
                        placeholder="ابحث بالاسم / الجوال / الهوية"
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => { setManualMode(false); setManualQuery(''); setManualResults([]); }}
                        className="px-2 py-1.5 text-xs rounded border bg-white hover:bg-gray-50"
                      >
                        رجوع
                      </button>
                    </div>
                    <div className="border rounded-lg divide-y max-h-44 overflow-auto">
                      {manualResults.length === 0 ? (
                        <div className="p-2 text-xs text-gray-500 text-center">ابدأ بالبحث لاختيار عميل</div>
                      ) : (
                        manualResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => { setCustomerId(c.id); setManualMode(false); }}
                            className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50"
                          >
                            <div className="font-semibold text-gray-800">{c.full_name}</div>
                            {c.phone && <div className="text-xs text-gray-500" dir="ltr">{c.phone}</div>}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !file || !docType || !unitNumber || !customerId}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            حفظ
          </button>
        </div>
      </div>

      {role !== 'receptionist' && (
      <div className="bg-white border rounded-2xl p-6 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 text-right">
          <div>
            <label className="block text-xs mb-1 text-gray-600">النوع</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">الكل</option>
              <option value="voucher">سند</option>
              <option value="invoice">فاتورة</option>
              <option value="statement">كشف حساب</option>
              <option value="contract">عقد</option>
              <option value="handover">استلام</option>
              <option value="return">تسليم</option>
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1 text-gray-600">رقم الغرفة</label>
            <input value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} placeholder="مثال: 204" className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs mb-1 text-gray-600">العميل</label>
            <input value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)} placeholder="Customer ID" className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs mb-1 text-gray-600">من تاريخ</label>
            <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs mb-1 text-gray-600">إلى تاريخ</label>
            <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs mb-1 text-gray-600">بحث</label>
            <input value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)} placeholder="بحث" className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((d) => (
            <div key={d.id} className="border rounded-2xl p-4 bg-white text-right shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">{typeLabel(d.doc_type)}</span>
                <span className="text-xs text-gray-500">{format(new Date(d.doc_date), 'dd/MM/yyyy', { locale: ar })}</span>
              </div>
              <div className="space-y-1 text-sm">
                <p>الغرفة: <span className="font-mono">{d.unit_number || '—'}</span></p>
                <p>العميل: <span>{d.customer?.full_name || d.customer_id || '—'}</span></p>
                <p className="truncate">المسار: <span className="font-mono">{d.storage_path}</span></p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                {d.public_url ? (
                  <>
                    <a href={d.public_url} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs">فتح</a>
                    <button onClick={() => navigator.clipboard.writeText(d.public_url)} className="px-3 py-1.5 rounded bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs">نسخ الرابط</button>
                  </>
                ) : (
                  <span className="text-xs text-gray-400">لا يوجد رابط عام</span>
                )}
                {['admin', 'manager'].includes(role || '') && (
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="px-3 py-1.5 rounded bg-red-50 hover:bg-red-100 text-red-700 text-xs ml-auto"
                  >
                    حذف
                  </button>
                )}
              </div>
            </div>
          ))}
          {list.length === 0 && (
            <div className="text-center text-sm text-gray-500 py-8">لا توجد وثائق مطابقة للبحث</div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function typeLabel(t: string) {
  switch (t) {
    case 'voucher': return 'سند';
    case 'invoice': return 'فاتورة';
    case 'statement': return 'كشف حساب';
    case 'contract': return 'عقد';
    case 'handover': return 'استلام';
    case 'return': return 'تسليم';
    default: return t || '—';
  }
}
