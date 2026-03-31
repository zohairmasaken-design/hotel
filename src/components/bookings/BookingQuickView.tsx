'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Eye, X, Pencil, Key } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type BookingQuick = {
  id: string;
  check_in: string;
  check_out: string;
  booking_type?: string | null;
  status?: string | null;
  total_price?: number | null;
  notes?: string | null;
  customer?: {
    full_name?: string | null;
    phone?: string | null;
    national_id?: string | null;
  } | null;
  unit?: {
    unit_number?: string | null;
    unit_type?: { name?: string | null } | null;
    floor?: string | null;
  } | null;
  booking_keys?: { passcode: string; status: string }[] | null;
};

type LedgerRow = {
  id: string;
  at: string;
  kind: 'invoice' | 'payment';
  method: string;
  description: string;
  debit: number;
  credit: number;
};

export default function BookingQuickView({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BookingQuick | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: booking, error: err } = await supabase
          .from('bookings')
          .select(`
            *,
            customer:customers(full_name, phone, national_id),
            unit:units(unit_number, floor, unit_type:unit_types(name)),
            booking_keys(passcode, status)
          `)
          .eq('id', id)
          .single();
        if (err) throw err;
        if (!cancelled) setData(booking as any);

        const { data: invs, error: invErr } = await supabase
          .from('invoices')
          .select('id, invoice_number, invoice_date, created_at, total_amount, status')
          .eq('booking_id', id)
          .neq('status', 'void')
          .order('created_at', { ascending: true });
        if (invErr) throw invErr;

        const invoiceIds = (invs || []).map((i: any) => i.id);
        let pays: any[] = [];
        if (invoiceIds.length > 0) {
          const { data: p, error: pErr } = await supabase
            .from('payments')
            .select('id, invoice_id, amount, status, payment_date, created_at, description, payment_method:payment_methods(name)')
            .in('invoice_id', invoiceIds)
            .eq('status', 'posted')
            .order('created_at', { ascending: true });
          if (pErr) throw pErr;
          pays = p || [];
        }

        const rows: LedgerRow[] = [
          ...(invs || []).map((i: any): LedgerRow => ({
            id: `inv_${i.id}`,
            at: String(i.invoice_date || i.created_at || ''),
            kind: 'invoice',
            method: '—',
            description: `فاتورة ${i.invoice_number || ''}`.trim(),
            debit: Number(i.total_amount || 0) || 0,
            credit: 0,
          })),
          ...(pays || []).map((p: any): LedgerRow => ({
            id: `pay_${p.id}`,
            at: String(p.payment_date || p.created_at || ''),
            kind: 'payment',
            method: (p.payment_method as any)?.name || '—',
            description: String(p.description || 'سند قبض'),
            debit: 0,
            credit: Number(p.amount || 0) || 0,
          })),
        ]
          .filter((r) => r.at)
          .sort((a, b) => String(a.at).localeCompare(String(b.at)));

        if (!cancelled) setLedger(rows);
      } catch (e: any) {
        if (!cancelled) setError('تعذر جلب بيانات الحجز');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, id]);

  const fmt = (d?: string | null) => {
    if (!d) return '—';
    try {
      const dd = new Date(d);
      if (Number.isNaN(dd.getTime())) return d;
      return dd.toLocaleDateString('ar-SA');
    } catch {
      return d;
    }
  };

  const ledgerWithBalance = useMemo(() => {
    let bal = 0;
    return ledger.map((r) => {
      bal = bal + (Number(r.debit) || 0) - (Number(r.credit) || 0);
      return { ...r, balance: bal };
    });
  }, [ledger]);

  const ledgerTotals = useMemo(() => {
    const debit = ledger.reduce((s, r) => s + (Number(r.debit) || 0), 0);
    const credit = ledger.reduce((s, r) => s + (Number(r.credit) || 0), 0);
    return { debit, credit, remaining: Math.max(0, debit - credit) };
  }, [ledger]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        title="عرض سريع"
      >
        <Eye size={18} />
      </button>
      <Link
        href={`/bookings-list/${id}`}
        className="p-1.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
        title="تعديل / فتح التفاصيل"
      >
        <Pencil size={18} />
      </Link>

      {open && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-0 z-50 flex items-start justify-center p-4 sm:p-6">
            <div className="w-full max-w-2xl max-h-[calc(100vh-48px)] bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900">تفاصيل الحجز</span>
                  <span className="text-xs font-mono text-gray-600 bg-gray-100 rounded px-2 py-0.5">
                    #{id.slice(0, 8).toUpperCase()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="إغلاق"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 overflow-y-auto">
                {loading ? (
                  <div className="py-8 text-center text-gray-500">جارِ التحميل...</div>
                ) : error ? (
                  <div className="py-8 text-center text-red-600">{error}</div>
                ) : !data ? (
                  <div className="py-8 text-center text-gray-500">لا توجد بيانات</div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                        <div className="text-xs text-gray-600 mb-1">العميل</div>
                        <div className="font-bold text-gray-900">{data.customer?.full_name || '—'}</div>
                        <div className="text-xs font-mono text-gray-700" dir="ltr">{data.customer?.phone || '—'}</div>
                      </div>
                      <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                        <div className="text-xs text-gray-600 mb-1">الوحدة</div>
                        <div className="font-bold text-gray-900">
                          {data.unit?.unit_number || '—'}
                          <span className="text-xs text-gray-600 ms-2">
                            {data.unit?.unit_type?.name || ''}
                          </span>
                        </div>
                        <div className="text-xs text-gray-700">الدور: {data.unit?.floor || '—'}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-white rounded-xl border border-gray-200 p-3">
                        <div className="text-[11px] text-gray-600">الوصول</div>
                        <div className="font-bold text-gray-900">{fmt(data.check_in)}</div>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-200 p-3">
                        <div className="text-[11px] text-gray-600">المغادرة</div>
                        <div className="font-bold text-gray-900">{fmt(data.check_out)}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white rounded-xl border border-gray-200 p-3">
                        <div className="text-[11px] text-gray-600">النوع</div>
                        <div className="font-bold text-gray-900">
                          {data.booking_type === 'yearly' ? 'سنوي' : data.booking_type === 'daily' ? 'يومي' : data.booking_type || '—'}
                        </div>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-200 p-3">
                        <div className="text-[11px] text-gray-600">الحالة</div>
                        <div className="font-bold text-gray-900">{data.status || '—'}</div>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-200 p-3">
                        <div className="text-[11px] text-gray-600">الإجمالي</div>
                        <div className="font-bold text-gray-900">
                          {typeof data.total_price === 'number' ? data.total_price.toLocaleString() + ' ر.س' : '—'}
                        </div>
                      </div>
                    </div>
                    {data.notes && data.notes.trim().length > 0 ? (
                      <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                        <div className="text-xs text-gray-600 mb-1">ملاحظات</div>
                        <div className="text-sm text-gray-800">{data.notes}</div>
                      </div>
                    ) : null}

                    {data.booking_keys && data.booking_keys.length > 0 && (
                      <div className="bg-blue-50 rounded-xl border border-blue-100 p-3">
                        <div className="text-[11px] text-blue-600 mb-2 flex items-center gap-1 font-bold">
                          <Key size={14} />
                          مفاتيح TTLock
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {data.booking_keys.map((k, i) => (
                            <div key={i} className="flex items-center gap-2 bg-white px-2 py-1 rounded border border-blue-200">
                              <span className="font-mono font-bold text-blue-700">{k.passcode}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                                k.status === 'active' ? 'bg-green-100 text-green-700' : 
                                k.status === 'frozen' ? 'bg-yellow-100 text-yellow-700' : 
                                'bg-red-100 text-red-700'
                              }`}>
                                {k.status === 'active' ? 'نشط' : k.status === 'frozen' ? 'مجمد' : 'ملغي'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between gap-2">
                        <div className="text-[11px] font-black text-gray-900">كشف حساب مبسط</div>
                        <div className="flex items-center gap-2 text-[10px] font-bold">
                          <span className="text-gray-600">المدين: {ledgerTotals.debit.toLocaleString()} ر.س</span>
                          <span className="text-gray-600">الدائن: {ledgerTotals.credit.toLocaleString()} ر.س</span>
                          <span className="text-red-700">المتبقي: {ledgerTotals.remaining.toLocaleString()} ر.س</span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-right min-w-[720px]">
                          <thead className="bg-white border-b">
                            <tr className="text-[10px] text-gray-600 font-black">
                              <th className="px-3 py-2 whitespace-nowrap">التاريخ</th>
                              <th className="px-3 py-2 whitespace-nowrap">البيان</th>
                              <th className="px-3 py-2 whitespace-nowrap">طريقة الدفع</th>
                              <th className="px-3 py-2 whitespace-nowrap">مدين</th>
                              <th className="px-3 py-2 whitespace-nowrap">دائن</th>
                              <th className="px-3 py-2 whitespace-nowrap">الرصيد</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {ledgerWithBalance.length > 0 ? (
                              ledgerWithBalance.slice(0, 40).map((r: any) => (
                                <tr key={r.id} className="text-[11px]">
                                  <td className="px-3 py-2 font-mono whitespace-nowrap">{fmt(r.at)}</td>
                                  <td className="px-3 py-2 whitespace-nowrap font-bold text-gray-900">
                                    {r.kind === 'invoice' ? 'إصدار فاتورة' : 'سداد'}
                                    <span className="text-gray-500 font-medium ms-2">{r.description}</span>
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap">{r.method || '—'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap font-bold text-gray-900">{r.debit ? r.debit.toLocaleString() : '—'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap font-bold text-emerald-700">{r.credit ? r.credit.toLocaleString() : '—'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap font-bold text-gray-900">{Number(r.balance || 0).toLocaleString()}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={6} className="px-3 py-6 text-center text-gray-500 text-sm font-bold">
                                  لا توجد عمليات مالية مرتبطة بهذا الحجز
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-3 py-2 bg-gray-50 border-t text-[10px] text-gray-600 font-bold">
                        يعرض الفواتير غير الملغاة + سندات القبض المرحلة (posted) المرتبطة بالحجز.
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Link
                        href={`/bookings-list/${id}`}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 shadow-sm"
                        title="فتح صفحة التفاصيل والتعديل"
                      >
                        <Pencil size={16} />
                        تعديل
                      </Link>
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-bold hover:bg-gray-50"
                      >
                        إغلاق
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
