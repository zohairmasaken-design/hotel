'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, RefreshCw, Search, ExternalLink, X, Loader2 } from 'lucide-react';
import RoleGate from '@/components/auth/RoleGate';
import { supabase } from '@/lib/supabase';

type Row = {
  id: string;
  created_at: string;
  booking_id: string | null;
  customer_id: string | null;
  invoice_id: string | null;
  status: 'pending_confirmation' | 'confirmed' | 'rejected';
  customer_birth_date: string | null;
  upload_notes: string | null;
  decision_notes: string | null;
  uploaded_by_email: string | null;
  uploaded_at: string | null;
  decided_by_email: string | null;
  decided_at: string | null;
  is_payment_verified: boolean;
  is_platform_verified: boolean;
  unit_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  invoice_number: string | null;
};

const ymd = (value: string | null) => {
  if (!value) return '-';
  const s = String(value);
  if (s.includes('T')) return s.split('T')[0];
  if (s.includes(' ')) return s.split(' ')[0];
  return s;
};

const statusLabel = (s: Row['status']) => {
  if (s === 'confirmed') return 'تم التأكيد';
  if (s === 'rejected') return 'تم الرفض';
  return 'تم الرفع بانتظار التأكيد';
};

const statusBadgeClass = (s: Row['status']) => {
  if (s === 'confirmed') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (s === 'rejected') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-amber-100 text-amber-900 border-amber-200';
};

export default function EjarContractsReportPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [searchText, setSearchText] = useState('');
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionType, setDecisionType] = useState<'confirm' | 'reject'>('confirm');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [decisionRowId, setDecisionRowId] = useState<string | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);

  const fetchRows = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ejar_contract_uploads')
        .select(
          `
          id,
          created_at,
          booking_id,
          customer_id,
          invoice_id,
          customer_birth_date,
          status,
          upload_notes,
          decision_notes,
          uploaded_by_email,
          uploaded_at,
          decided_by_email,
          decided_at,
          is_payment_verified,
          is_platform_verified,
          booking:bookings(
            unit:units(unit_number)
          ),
          customer:customers(full_name, phone),
          invoice:invoices(invoice_number)
        `
        )
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      const mapped: Row[] = (data || []).map((e: any) => {
        const inv = e?.invoice as any;
        const cust = e?.customer as any;
        const b = e?.booking as any;
        return {
          id: String(e?.id),
          created_at: String(e?.created_at || ''),
          booking_id: e?.booking_id ? String(e.booking_id) : null,
          customer_id: e?.customer_id ? String(e.customer_id) : null,
          invoice_id: e?.invoice_id ? String(e.invoice_id) : null,
          status: (String(e?.status || 'pending_confirmation') as any),
          customer_birth_date: e?.customer_birth_date ? String(e.customer_birth_date) : null,
          upload_notes: e?.upload_notes ? String(e.upload_notes) : null,
          decision_notes: e?.decision_notes ? String(e.decision_notes) : null,
          uploaded_by_email: e?.uploaded_by_email ? String(e.uploaded_by_email) : null,
          uploaded_at: e?.uploaded_at ? String(e.uploaded_at) : null,
          decided_by_email: e?.decided_by_email ? String(e.decided_by_email) : null,
          decided_at: e?.decided_at ? String(e.decided_at) : null,
          is_payment_verified: Boolean(e?.is_payment_verified),
          is_platform_verified: Boolean(e?.is_platform_verified),
          unit_number: b?.unit?.unit_number ? String(b.unit.unit_number) : null,
          customer_name: cust?.full_name ? String(cust.full_name) : null,
          customer_phone: cust?.phone ? String(cust.phone) : null,
          invoice_number: inv?.invoice_number ? String(inv.invoice_number) : null,
        };
      });

      setRows(mapped);
    } catch (err: any) {
      alert('حدث خطأ أثناء تحميل عقود منصة إيجار: ' + String(err?.message || err || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const bookingShort = r.booking_id ? String(r.booking_id).slice(0, 8).toLowerCase() : '';
      const invoiceShort = r.invoice_id ? String(r.invoice_id).slice(0, 8).toLowerCase() : '';
      const customerShort = r.customer_id ? String(r.customer_id).slice(0, 8).toLowerCase() : '';
      const unit = (r.unit_number || '').toLowerCase();
      const name = (r.customer_name || '').toLowerCase();
      const phone = (r.customer_phone || '').toLowerCase();
      const invNo = (r.invoice_number || '').toLowerCase();
      return (
        unit.includes(q) ||
        name.includes(q) ||
        phone.includes(q) ||
        invNo.includes(q) ||
        bookingShort.includes(q) ||
        invoiceShort.includes(q) ||
        customerShort.includes(q)
      );
    });
  }, [rows, searchText]);

  const openDecision = (rowId: string, type: 'confirm' | 'reject') => {
    setDecisionRowId(rowId);
    setDecisionType(type);
    setDecisionNotes('');
    setDecisionOpen(true);
  };

  const submitDecision = async () => {
    if (!decisionRowId) return;
    if (!decisionNotes.trim()) {
      alert('اكتب ملاحظات قبل الإجراء');
      return;
    }
    if (decisionBusy) return;

    try {
      setDecisionBusy(true);
      const { data: authData } = await supabase.auth.getUser();
      const actorId = authData?.user?.id || null;
      const actorEmail = authData?.user?.email || null;
      const status = decisionType === 'confirm' ? 'confirmed' : 'rejected';

      const { error } = await supabase
        .from('ejar_contract_uploads')
        .update({
          status,
          decision_notes: decisionNotes.trim(),
          decided_by: actorId,
          decided_by_email: actorEmail,
          decided_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', decisionRowId);
      if (error) throw error;

      setDecisionOpen(false);
      setDecisionRowId(null);
      await fetchRows();
    } catch (err: any) {
      alert('تعذر حفظ القرار: ' + String(err?.message || err || 'خطأ غير معروف'));
    } finally {
      setDecisionBusy(false);
    }
  };

  return (
    <RoleGate allow={['admin']}>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <Link href="/reports" className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
              <ArrowRight size={22} />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900">عقود منصة إيجار</h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">عرض العقود التي تم تسجيل رفعها إلى منصة إيجار.</p>
            </div>
          </div>

          <button
            onClick={fetchRows}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
            disabled={loading}
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'جارٍ التحديث...' : 'تحديث'}</span>
          </button>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <div className="relative w-full">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="بحث بالوحدة / اسم العميل / الجوال / رقم الحجز / رقم الفاتورة..."
              className="w-full pr-10 pl-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
          <div className="mt-3 text-xs text-gray-500">
            الإجمالي: <span className="font-black text-gray-800">{filteredRows.length}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">تاريخ الرفع</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">الحالة</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">الوحدة</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">العميل</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">الفاتورة</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.length > 0 ? (
                  filteredRows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors odd:bg-white even:bg-gray-50">
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap font-bold text-gray-900">
                        {new Date(r.created_at).toLocaleString('ar-SA')}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-black ${statusBadgeClass(r.status)}`}>
                          {statusLabel(r.status)}
                        </span>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {r.is_payment_verified ? (
                            <span className="px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] font-black">
                              تم الدفع
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full border bg-gray-50 text-gray-700 border-gray-200 text-[10px] font-black">
                              الدفع غير مؤكد
                            </span>
                          )}
                          {r.is_platform_verified ? (
                            <span className="px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] font-black">
                              رسوم المنصة مؤكدة
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full border bg-gray-50 text-gray-700 border-gray-200 text-[10px] font-black">
                              رسوم غير مؤكدة
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap font-black text-gray-900">
                        {r.unit_number || '-'}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4">
                        <div className="flex flex-col">
                          <div className="font-bold text-gray-900">{r.customer_name || '-'}</div>
                          <div className="text-xs text-gray-500 dir-ltr">{r.customer_phone || '-'}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap font-bold text-gray-900 dir-ltr">
                        {r.invoice_number || (r.invoice_id ? String(r.invoice_id).slice(0, 8).toUpperCase() : '-')}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/reports/ejar-contracts/${r.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-xs font-bold text-gray-700"
                            title="عرض تفاصيل عقد إيجار"
                          >
                            <ExternalLink size={14} />
                            عرض
                          </Link>
                          {r.status === 'pending_confirmation' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openDecision(r.id, 'confirm')}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-black"
                              >
                                تأكيد
                              </button>
                              <button
                                type="button"
                                onClick={() => openDecision(r.id, 'reject')}
                                className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 text-xs font-black"
                              >
                                رفض
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      لا توجد بيانات
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {decisionOpen && (
          <div className="fixed inset-0 z-[80]">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDecisionOpen(false)} />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                  <div className="font-black text-gray-900 text-sm">
                    {decisionType === 'confirm' ? 'تأكيد عقد إيجار' : 'رفض عقد إيجار'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDecisionOpen(false)}
                    className="px-2 py-1 text-xs rounded-lg border bg-white hover:bg-gray-50"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-black text-gray-700 mb-1">اكتب ملاحظات</label>
                    <textarea
                      value={decisionNotes}
                      onChange={(e) => setDecisionNotes(e.target.value)}
                      className="w-full px-3 py-2 border rounded-xl text-sm"
                      rows={4}
                      placeholder="اكتب ملاحظاتك هنا"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setDecisionOpen(false)}
                      className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm font-black"
                      disabled={decisionBusy}
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={submitDecision}
                      className={`px-4 py-2 rounded-lg text-white text-sm font-black flex items-center gap-2 ${
                        decisionType === 'confirm' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                      } disabled:opacity-60`}
                      disabled={decisionBusy}
                    >
                      {decisionBusy ? <Loader2 className="animate-spin" size={16} /> : null}
                      حفظ
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGate>
  );
}
