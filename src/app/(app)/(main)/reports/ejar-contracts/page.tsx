'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, RefreshCw, Search, ExternalLink, X, Loader2 } from 'lucide-react';
import RoleGate from '@/components/auth/RoleGate';
import { supabase } from '@/lib/supabase';
import { useUserRole } from '@/hooks/useUserRole';
import { useActiveHotel } from '@/hooks/useActiveHotel';

type Row = {
  id: string;
  created_at: string;
  booking_id: string | null;
  customer_id: string | null;
  invoice_id: string | null;
  status: 'pending_confirmation' | 'confirmed' | 'rejected';
  customer_birth_date: string | null;
  supervisor_note: string | null;
  upload_notes: string | null;
  decision_notes: string | null;
  uploaded_by_email: string | null;
  uploaded_at: string | null;
  decided_by_email: string | null;
  decided_at: string | null;
  is_payment_verified: boolean;
  is_platform_verified: boolean;
  unit_number: string | null;
  hotel_id: string | null;
  hotel_name: string | null;
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
  const { role } = useUserRole();
  const isAdmin = role === 'admin';
  const { activeHotelId } = useActiveHotel();
  const selectedHotelId = activeHotelId || 'all';
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Row['status']>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionType, setDecisionType] = useState<'confirm' | 'reject'>('confirm');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [decisionRowId, setDecisionRowId] = useState<string | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);

  const fetchRows = async () => {
    setLoading(true);
    try {
      let q: any = supabase
        .from('ejar_contract_uploads')
        .select(
          `
          id,
          created_at,
          booking_id,
          customer_id,
          invoice_id,
          customer_birth_date,
          supervisor_note,
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
            hotel_id,
            hotel:hotels(id, name),
            unit:units(unit_number)
          ),
          customer:customers(full_name, phone),
          invoice:invoices(invoice_number)
        `
        )
        .order('created_at', { ascending: false })
        .limit(500);

      if (statusFilter !== 'all') {
        q = q.eq('status', statusFilter);
      }
      if (dateFrom) {
        q = q.gte('created_at', `${dateFrom}T00:00:00.000Z`);
      }
      if (dateTo) {
        q = q.lte('created_at', `${dateTo}T23:59:59.999Z`);
      }

      const { data, error } = await q;

      if (error) throw error;

      const mapped: Row[] = (data || []).map((e: any) => {
        const inv = e?.invoice as any;
        const cust = e?.customer as any;
        const b = e?.booking as any;
        const h = b?.hotel as any;
        return {
          id: String(e?.id),
          created_at: String(e?.created_at || ''),
          booking_id: e?.booking_id ? String(e.booking_id) : null,
          customer_id: e?.customer_id ? String(e.customer_id) : null,
          invoice_id: e?.invoice_id ? String(e.invoice_id) : null,
          status: (String(e?.status || 'pending_confirmation') as any),
          customer_birth_date: e?.customer_birth_date ? String(e.customer_birth_date) : null,
          supervisor_note: e?.supervisor_note ? String(e.supervisor_note) : null,
          upload_notes: e?.upload_notes ? String(e.upload_notes) : null,
          decision_notes: e?.decision_notes ? String(e.decision_notes) : null,
          uploaded_by_email: e?.uploaded_by_email ? String(e.uploaded_by_email) : null,
          uploaded_at: e?.uploaded_at ? String(e.uploaded_at) : null,
          decided_by_email: e?.decided_by_email ? String(e.decided_by_email) : null,
          decided_at: e?.decided_at ? String(e.decided_at) : null,
          is_payment_verified: Boolean(e?.is_payment_verified),
          is_platform_verified: Boolean(e?.is_platform_verified),
          unit_number: b?.unit?.unit_number ? String(b.unit.unit_number) : null,
          hotel_id: b?.hotel_id ? String(b.hotel_id) : (h?.id ? String(h.id) : null),
          hotel_name: h?.name ? String(h.name) : null,
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
  }, [selectedHotelId, statusFilter, dateFrom, dateTo]);

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const byHotel = rows.filter((r) => {
      if (selectedHotelId === 'all') return true;
      return String(r.hotel_id || '') === String(selectedHotelId);
    });
    if (!q) return byHotel;
    return byHotel.filter((r) => {
      const bookingShort = r.booking_id ? String(r.booking_id).slice(0, 8).toLowerCase() : '';
      const invoiceShort = r.invoice_id ? String(r.invoice_id).slice(0, 8).toLowerCase() : '';
      const customerShort = r.customer_id ? String(r.customer_id).slice(0, 8).toLowerCase() : '';
      const unit = (r.unit_number || '').toLowerCase();
      const hotel = (r.hotel_name || '').toLowerCase();
      const name = (r.customer_name || '').toLowerCase();
      const phone = (r.customer_phone || '').toLowerCase();
      const invNo = (r.invoice_number || '').toLowerCase();
      return (
        unit.includes(q) ||
        hotel.includes(q) ||
        name.includes(q) ||
        phone.includes(q) ||
        invNo.includes(q) ||
        bookingShort.includes(q) ||
        invoiceShort.includes(q) ||
        customerShort.includes(q)
      );
    });
  }, [rows, searchText, selectedHotelId]);

  const updateRow = async (rowId: string, patch: Record<string, any>) => {
    if (!isAdmin) return;
    if (!rowId) return;
    if (decisionBusy) return;
    try {
      setDecisionBusy(true);
      const { data: authData } = await supabase.auth.getUser();
      const actorId = authData?.user?.id || null;
      const actorEmail = authData?.user?.email || null;
      const { error } = await supabase
        .from('ejar_contract_uploads')
        .update({
          ...patch,
          decided_by: patch?.status ? actorId : undefined,
          decided_by_email: patch?.status ? actorEmail : undefined,
          decided_at: patch?.status ? new Date().toISOString() : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rowId);
      if (error) throw error;
      await fetchRows();
    } catch (err: any) {
      alert('تعذر تحديث السجل: ' + String(err?.message || err || 'خطأ غير معروف'));
    } finally {
      setDecisionBusy(false);
    }
  };

  const markRejected = async (rowId: string) => {
    if (!confirm('هل تريد تحويل حالة العقد إلى: لم يوافق عليه ؟')) return;
    await updateRow(rowId, { status: 'rejected', decision_notes: 'لم يوافق عليه' });
  };

  const markDocumented = async (rowId: string) => {
    if (!confirm('هل تريد تحويل حالة التوثيق إلى: تم التوثيق ؟')) return;
    await updateRow(rowId, { supervisor_note: 'تم توثيق' });
  };

  const openDecision = (rowId: string, type: 'confirm' | 'reject') => {
    if (!isAdmin) return;
    setDecisionRowId(rowId);
    setDecisionType(type);
    setDecisionNotes('');
    setDecisionOpen(true);
  };

  const submitDecision = async () => {
    if (!isAdmin) return;
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
    <RoleGate allow={['admin', 'manager', 'receptionist', 'housekeeping', 'accountant', 'marketing']}>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <Link href="/reports" className="p-2 hover:bg-emerald-50 rounded-full transition-colors text-emerald-900/60">
              <ArrowRight size={22} />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-emerald-950">عقود منصة إيجار</h1>
              <p className="text-xs sm:text-sm text-emerald-900/60 mt-1 font-bold">عرض العقود التي تم تسجيل رفعها إلى منصة إيجار.</p>
            </div>
          </div>

          <button
            onClick={fetchRows}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white rounded-xl hover:from-emerald-800 hover:via-emerald-900 hover:to-emerald-950 transition-colors disabled:opacity-60 ring-1 ring-emerald-900/20 shadow-sm"
            disabled={loading}
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'جارٍ التحديث...' : 'تحديث'}</span>
          </button>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-sm ring-1 ring-emerald-200/70">
          <div className="relative w-full">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="بحث بالفندق / الوحدة / اسم العميل / الجوال / رقم الحجز / رقم الفاتورة..."
              className="w-full pr-10 pl-4 py-2 bg-emerald-50/40 border border-emerald-200/70 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-white border border-emerald-200/70 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="all">كل الحالات</option>
              <option value="pending_confirmation">بانتظار التأكيد</option>
              <option value="confirmed">تم التأكيد</option>
              <option value="rejected">لم يوافق عليه</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-emerald-200/70 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-emerald-200/70 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
          <div className="mt-3 text-xs text-emerald-900/60 font-bold">
            الإجمالي: <span className="font-black text-emerald-950">{filteredRows.length}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-emerald-200/70 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 border-b border-emerald-900/20">
                <tr>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">تاريخ الرفع</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">الحالة</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">الفندق</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">الوحدة</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">العميل</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">الفاتورة</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 font-extrabold text-emerald-50 whitespace-nowrap">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-100/60">
                {filteredRows.length > 0 ? (
                  filteredRows.map((r) => (
                    <tr key={r.id} className="hover:bg-emerald-50/50 transition-colors odd:bg-white even:bg-emerald-50/20">
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap font-extrabold text-emerald-950">
                        {new Date(r.created_at).toLocaleString('ar-SA')}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-black ${statusBadgeClass(r.status)}`}>
                          {statusLabel(r.status)}
                        </span>
                        {String(r.supervisor_note || '').trim() === 'تم توثيق' ? (
                          <span className="mr-2 inline-flex items-center px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] font-black">
                            موثق
                          </span>
                        ) : null}
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
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap font-extrabold text-emerald-950">
                        {r.hotel_name || '-'}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap font-black text-emerald-950">
                        {r.unit_number || '-'}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4">
                        <div className="flex flex-col">
                          <div className="font-extrabold text-emerald-950">{r.customer_name || '-'}</div>
                          <div className="text-xs text-emerald-900/60 font-bold dir-ltr">{r.customer_phone || '-'}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap font-extrabold text-emerald-950 dir-ltr">
                        {r.invoice_number || (r.invoice_id ? String(r.invoice_id).slice(0, 8).toUpperCase() : '-')}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/reports/ejar-contracts/${r.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white hover:bg-emerald-50 text-xs font-extrabold text-emerald-950 border-emerald-200/70"
                            title="عرض تفاصيل عقد إيجار"
                          >
                            <ExternalLink size={14} />
                            عرض
                          </Link>
                          {isAdmin ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openDecision(r.id, 'confirm')}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-black disabled:opacity-60"
                                disabled={decisionBusy}
                              >
                                تم التأكيد
                              </button>
                              <button
                                type="button"
                                onClick={() => markRejected(r.id)}
                                className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 text-xs font-black disabled:opacity-60"
                                disabled={decisionBusy}
                              >
                                لم يوافق عليه
                              </button>
                              <button
                                type="button"
                                onClick={() => markDocumented(r.id)}
                                className="px-3 py-1.5 rounded-lg bg-amber-700 text-white hover:bg-amber-800 text-xs font-black disabled:opacity-60"
                                disabled={decisionBusy}
                              >
                                تم التوثيق
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-emerald-900/60 font-bold">
                      لا توجد بيانات
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {isAdmin && decisionOpen && (
          <div className="fixed inset-0 z-[80]">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDecisionOpen(false)} />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl ring-1 ring-emerald-200/70 overflow-hidden">
                <div className="px-4 py-3 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-50 via-white to-white flex items-center justify-between">
                  <div className="font-black text-emerald-950 text-sm">
                    {decisionType === 'confirm' ? 'تأكيد عقد إيجار' : 'رفض عقد إيجار'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDecisionOpen(false)}
                    className="px-2 py-1 text-xs rounded-lg border bg-white hover:bg-emerald-50 border-emerald-200/70"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-black text-emerald-900/70 mb-1">اكتب ملاحظات</label>
                    <textarea
                      value={decisionNotes}
                      onChange={(e) => setDecisionNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-emerald-200/70 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      rows={4}
                      placeholder="اكتب ملاحظاتك هنا"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setDecisionOpen(false)}
                      className="px-4 py-2 rounded-xl border bg-white hover:bg-emerald-50 text-sm font-black border-emerald-200/70"
                      disabled={decisionBusy}
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={submitDecision}
                      className={`px-4 py-2 rounded-xl text-white text-sm font-black flex items-center gap-2 ${
                        decisionType === 'confirm'
                          ? 'bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 hover:from-emerald-800 hover:via-emerald-900 hover:to-emerald-950'
                          : 'bg-red-600 hover:bg-red-700'
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
