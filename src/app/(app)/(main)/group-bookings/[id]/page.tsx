'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { Layers, Calendar, User, Home, FileText, ArrowRight, XCircle } from 'lucide-react';
import CreateGroupInvoiceButton from '@/components/group-bookings/CreateGroupInvoiceButton';

export default function GroupBookingDetailsPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const id = params?.id as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupBooking, setGroupBooking] = useState<any>(null);
  const [units, setUnits] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: gb, error: e1 } = await supabase
          .from('group_bookings')
          .select('*, customer:customers(full_name, phone)')
          .eq('id', id)
          .maybeSingle();
        if (e1) throw e1;
        setGroupBooking(gb);

        const { data: gbu, error: e2 } = await supabase
          .from('group_booking_units')
          .select('id, unit_id, check_in, check_out, status, unit_price, subtotal, unit:units(unit_number, floor, hotel:hotels(name, tax_rate), unit_type:unit_types(name))')
          .eq('group_booking_id', id);
        if (e2) throw e2;
        setUnits(gbu || []);

        const { data: gis } = await supabase
          .from('group_invoices')
          .select('id, invoice_number, invoice_date, total_amount, status')
          .eq('group_booking_id', id)
          .order('created_at', { ascending: false });
        setInvoices(gis || []);
      } catch (e: any) {
        setError(e?.message || 'تعذر جلب البيانات');
      } finally {
        setLoading(false);
      }
    };
    if (id) load();
  }, [id]);

  const pricing = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    const items: Array<{ unit_id: string; description: string; amount: number }> = [];
    units.forEach(u => {
      const line = Number(u.subtotal || 0);
      subtotal += line;
      const rate = Number(u.unit?.hotel?.tax_rate || 0) || 0;
      tax += line * rate;
      items.push({
        unit_id: u.unit_id,
        description: `الوحدة ${u.unit?.unit_number || ''} (${u.unit?.unit_type?.name || ''})`,
        amount: line
      });
    });
    const total = subtotal + tax;
    return { subtotal, tax, total, items };
  }, [units]);

  const handleCancelGroupBooking = async () => {
    if (!confirm('هل أنت متأكد من إلغاء الحجز الجماعي؟ سيتم عكس القيود وإلغاء الفواتير.')) return;
    setCancelling(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      // Check open accounting period
      const { data: period, error: pe } = await supabase
        .from('accounting_periods')
        .select('id')
        .lte('start_date', today)
        .gte('end_date', today)
        .eq('status', 'open')
        .maybeSingle();
      if (pe) throw pe;
      if (!period) throw new Error(`لا توجد فترة محاسبية مفتوحة للتاريخ (${today}).`);

      // Reload invoices to be safe
      const { data: gis } = await supabase
        .from('group_invoices')
        .select('id, invoice_number, total_amount, tax_amount, status')
        .eq('group_booking_id', id);

      const invs = gis || [];

      // Refund payments linked to GROUP invoices, then credit note and void invoices
      for (const inv of invs) {
        // Refund any payments linked to this invoice
        const { data: pays } = await supabase
          .from('payments')
          .select('id, amount, payment_method_id')
          .eq('invoice_id', inv.id)
          .eq('status', 'posted');
        for (const p of (pays || [])) {
          const { error: refErr } = await supabase.rpc('post_transaction', {
            p_transaction_type: 'refund',
            p_source_type: 'payment',
            p_source_id: p.id,
            p_amount: p.amount,
            p_customer_id: groupBooking.customer_id,
            p_payment_method_id: p.payment_method_id,
            p_transaction_date: today,
            p_description: `استرجاع دفعة فاتورة جماعية #${inv.invoice_number}`
          });
          if (refErr) throw refErr;
          const { error: voidPayErr } = await supabase.from('payments').update({ status: 'void' }).eq('id', p.id);
          if (voidPayErr) throw voidPayErr;
        }

        if (['posted', 'paid'].includes(inv.status)) {
          const { error: cnErr } = await supabase.rpc('post_transaction', {
            p_transaction_type: 'credit_note',
            p_source_type: 'invoice',
            p_source_id: inv.id,
            p_amount: inv.total_amount,
            p_customer_id: groupBooking.customer_id,
            p_payment_method_id: null,
            p_transaction_date: today,
            p_description: `إلغاء فاتورة جماعية #${inv.invoice_number}`,
            p_tax_amount: inv.tax_amount || 0
          });
          if (cnErr) throw cnErr;
        }
        await supabase.from('group_invoices').update({ status: 'void' }).eq('id', inv.id);
      }

      // Also handle any standard invoices (invoices) that were created standalone for this group booking's customer
      // Heuristic: customer match, booking_id is null, created within booking window or same day of creation
      const createdWindowStart = groupBooking.created_at || groupBooking.check_in;
      const { data: stdInvs } = await supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, tax_amount, status, created_at')
        .eq('customer_id', groupBooking.customer_id)
        .is('booking_id', null)
        .gte('created_at', createdWindowStart);
      for (const inv of (stdInvs || [])) {
        // Refund payments linked to this invoice
        const { data: pays } = await supabase
          .from('payments')
          .select('id, amount, payment_method_id')
          .eq('invoice_id', inv.id)
          .eq('status', 'posted');
        for (const p of (pays || [])) {
          const { error: refErr } = await supabase.rpc('post_transaction', {
            p_transaction_type: 'refund',
            p_source_type: 'payment',
            p_source_id: p.id,
            p_amount: p.amount,
            p_customer_id: groupBooking.customer_id,
            p_payment_method_id: p.payment_method_id,
            p_transaction_date: today,
            p_description: `استرجاع دفعة فاتورة #${inv.invoice_number}`
          });
          if (refErr) throw refErr;
          const { error: voidPayErr } = await supabase.from('payments').update({ status: 'void' }).eq('id', p.id);
          if (voidPayErr) throw voidPayErr;
        }
        if (['posted', 'paid'].includes(inv.status)) {
          const { error: cnErr } = await supabase.rpc('post_transaction', {
            p_transaction_type: 'credit_note',
            p_source_type: 'invoice',
            p_source_id: inv.id,
            p_amount: inv.total_amount,
            p_customer_id: groupBooking.customer_id,
            p_payment_method_id: null,
            p_transaction_date: today,
          p_description: `إلغاء فاتورة - مرتبط بحجز متعدد`,
            p_tax_amount: inv.tax_amount || 0
          });
          if (cnErr) throw cnErr;
        }
        await supabase.from('invoices').update({ status: 'void' }).eq('id', inv.id);
      }

      // Refund standalone payments (advance/payment) linked to group booking via journal entries
      const { data: jes } = await supabase
        .from('journal_entries')
        .select('id, transaction_type')
        .eq('reference_id', id);
      const txnIds = (jes || [])
        .filter((t: any) => ['advance_payment', 'payment'].includes(t.transaction_type))
        .map((t: any) => t.id);
      if (txnIds.length > 0) {
        const { data: p2s } = await supabase
          .from('payments')
          .select('id, amount, payment_method_id')
          .in('journal_entry_id', txnIds)
          .eq('status', 'posted');
        for (const p of (p2s || [])) {
          const { error: refErr2 } = await supabase.rpc('post_transaction', {
            p_transaction_type: 'refund',
            p_source_type: 'payment',
            p_source_id: p.id,
            p_amount: p.amount,
            p_customer_id: groupBooking.customer_id,
            p_payment_method_id: p.payment_method_id,
            p_transaction_date: today,
          p_description: `استرجاع دفعة حجز متعدد`
          });
          if (refErr2) throw refErr2;
          const { error: voidPayErr2 } = await supabase.from('payments').update({ status: 'void' }).eq('id', p.id);
          if (voidPayErr2) throw voidPayErr2;
        }
      }

      // Update statuses to cancelled
      await supabase.from('group_booking_units').update({ status: 'cancelled' }).eq('group_booking_id', id);
      await supabase.from('group_bookings').update({ status: 'cancelled' }).eq('id', id);

      alert('تم إلغاء الحجز الجماعي وعكس القيود بنجاح');
      router.refresh();
    } catch (e: any) {
      alert('تعذر إلغاء الحجز الجماعي: ' + (e?.message || 'خطأ غير معروف'));
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <div className="p-6 text-gray-600">جار التحميل...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!groupBooking) return <div className="p-6 text-gray-600">لا يوجد حجز متعدد</div>;

  const statusMap: Record<string, string> = {
    pending: 'مبدئي',
    pending_deposit: 'بانتظار العربون',
    confirmed: 'مؤكد',
    checked_in: 'تم الدخول',
    checked_out: 'تم الخروج',
    cancelled: 'ملغي'
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">تفاصيل الحجز المتعدد</h1>
          <p className="text-sm text-gray-500">#{String(groupBooking.id).slice(0, 8).toUpperCase()}</p>
        </div>
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowRight size={16} className="rotate-180" />
          عودة
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Layers size={16} className="text-violet-600" />
              <div className="font-bold text-gray-900 text-sm">ملخص الحجز</div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <User size={14} className="text-gray-500" />
                <div>
                  <div className="text-gray-500 text-xs">العميل</div>
                  <div className="font-bold text-gray-900">{groupBooking.customer?.full_name || 'غير معروف'}</div>
                  <div className="text-xs text-gray-500" dir="ltr">{groupBooking.customer?.phone}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-gray-500" />
                <div>
                  <div className="text-gray-500 text-xs">الفترة</div>
                  <div className="font-bold text-gray-900">{format(new Date(groupBooking.check_in), 'yyyy-MM-dd')} → {format(new Date(groupBooking.check_out), 'yyyy-MM-dd')}</div>
                </div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">الحالة</div>
                <div className="font-bold text-gray-900">{statusMap[groupBooking.status] || groupBooking.status}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">الإجمالي</div>
                <div className="font-extrabold text-gray-900">{Number(groupBooking.total_amount || 0).toLocaleString()} ر.س</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200">
            <div className="p-4 border-b">
              <div className="font-bold text-gray-900 text-sm">الوحدات</div>
            </div>
            <div className="divide-y">
              {units.map(u => (
                <div key={u.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Home size={16} className="text-gray-400" />
                    <div>
                      <div className="font-bold text-gray-900 text-sm">الوحدة {u.unit?.unit_number}</div>
                      <div className="text-xs text-gray-500">{u.unit?.unit_type?.name} • {u.unit?.hotel?.name}</div>
                      <div className="text-xs text-gray-500">{u.check_in} → {u.check_out}</div>
                    </div>
                  </div>
                  <div className="text-sm font-bold text-gray-800">{Number(u.subtotal || 0).toLocaleString()} ر.س</div>
                </div>
              ))}
              {units.length === 0 && <div className="px-4 py-10 text-center text-gray-500">لا توجد وحدات</div>}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="font-bold text-gray-900 text-sm mb-2">إجراءات</div>
            <button
              onClick={handleCancelGroupBooking}
              disabled={cancelling || groupBooking.status === 'cancelled'}
              className={`w-full px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 ${groupBooking.status === 'cancelled' ? 'bg-gray-100 text-gray-400' : 'bg-rose-600 hover:bg-rose-700 text-white'}`}
            >
              <XCircle size={18} />
              <span>{cancelling ? 'جار الإلغاء...' : (groupBooking.status === 'cancelled' ? 'الحجز ملغي' : 'إلغاء الحجز المتعدد')}</span>
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="font-bold text-gray-900 text-sm mb-2">التسعير</div>
            <div className="text-xs text-gray-600 flex justify-between mb-1"><span>المجموع الفرعي</span><span className="font-bold text-gray-900">{pricing.subtotal.toLocaleString()}</span></div>
            <div className="text-xs text-gray-600 flex justify-between mb-1"><span>الضريبة</span><span className="font-bold text-gray-900">{pricing.tax.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
            <div className="h-px bg-gray-200 my-2" />
            <div className="text-sm text-gray-700 flex justify-between"><span className="font-bold">الإجمالي</span><span className="font-extrabold text-gray-900">{pricing.total.toLocaleString(undefined, { maximumFractionDigits: 2 })} ر.س</span></div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-gray-900 text-sm">الفواتير</div>
            </div>
            {invoices.length > 0 ? (
              <div className="space-y-2">
                {invoices.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                    <div>
                      <div className="text-sm font-bold text-gray-900">فاتورة #{inv.invoice_number}</div>
                      <div className="text-xs text-gray-500">{inv.invoice_date} • {inv.status}</div>
                    </div>
                    <a href={`/print/group-invoice/${inv.id}`} target="_blank" className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded-lg flex items-center gap-1">
                      <FileText size={14} />
                      طباعة
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-600">لا توجد فواتير لهذا الحجز</div>
            )}
            <div className="pt-3">
              <CreateGroupInvoiceButton groupBookingId={id} items={pricing.items} subtotal={pricing.subtotal} taxAmount={pricing.tax} total={pricing.total} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
