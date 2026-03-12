'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function PrintGroupInvoicePage() {
  const params = useParams() as { id: string };
  const id = params?.id as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [booking, setBooking] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: inv, error: e1 } = await supabase
          .from('group_invoices')
          .select('*, group_booking:group_bookings(id, customer:customers(full_name, phone))')
          .eq('id', id)
          .maybeSingle();
        if (e1) throw e1;
        setInvoice(inv);
        setBooking(inv?.group_booking || null);

        const { data: its, error: e2 } = await supabase
          .from('group_invoice_items')
          .select('*, unit:units(unit_number, unit_type:unit_types(name))')
          .eq('group_invoice_id', id);
        if (e2) throw e2;
        setItems(its || []);
      } catch (e: any) {
        setError(e?.message || 'تعذر جلب البيانات');
      } finally {
        setLoading(false);
      }
    };
    if (id) load();
  }, [id]);

  if (loading) return <div className="p-6 text-gray-600">جار التحميل...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!invoice) return <div className="p-6 text-gray-600">لا توجد فاتورة</div>;

  return (
    <div className="px-4 py-8 md:px-8 max-w-3xl mx-auto text-right">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-2xl font-extrabold text-gray-900">فاتورة</div>
          <div className="text-sm text-gray-600">رقم: #{invoice.invoice_number}</div>
          <div className="text-sm text-gray-600">التاريخ: {invoice.invoice_date?.slice(0, 10)}</div>
        </div>
        <div className="text-left">
          <div className="text-xs text-gray-500">إلى</div>
          <div className="text-sm font-bold text-gray-900">{booking?.customer?.full_name || 'غير معروف'}</div>
          <div className="text-xs text-gray-600" dir="ltr">{booking?.customer?.phone}</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 border">الوصف</th>
              <th className="p-2 border">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id}>
                <td className="p-2 border">{i.description || `الوحدة ${i.unit?.unit_number} (${i.unit?.unit_type?.name})`}</td>
                <td className="p-2 border">{Number(i.amount || 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 text-sm">
        <div className="flex justify-between"><span>المجموع الفرعي</span><span className="font-bold">{Number(invoice.subtotal || 0).toLocaleString()}</span></div>
        <div className="flex justify-between"><span>الضريبة</span><span className="font-bold">{Number(invoice.tax_amount || 0).toLocaleString()}</span></div>
        <div className="h-px bg-gray-200 my-2" />
        <div className="flex justify-between text-base"><span className="font-extrabold">الإجمالي</span><span className="font-extrabold">{Number(invoice.total_amount || 0).toLocaleString()} ر.س</span></div>
      </div>
      <div className="mt-6 text-center">
        <button onClick={() => window.print()} className="px-4 py-2 bg-gray-900 text-white rounded-lg">طباعة</button>
      </div>
    </div>
  );
}
