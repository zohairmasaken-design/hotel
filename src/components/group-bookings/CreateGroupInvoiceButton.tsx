'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FileText } from 'lucide-react';

interface Item {
  unit_id: string;
  description: string;
  amount: number;
}

export default function CreateGroupInvoiceButton({ groupBookingId, items, subtotal, taxAmount, total }: { groupBookingId: string; items: Item[]; subtotal: number; taxAmount: number; total: number }) {
  const [loading, setLoading] = useState(false);
  const pad4 = (n: number) => String(n).padStart(4, '0');

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { count } = await supabase.from('group_invoices').select('*', { count: 'exact', head: true });
      const invoiceNumber = pad4((count || 0) + 1);
      const today = new Date().toISOString().split('T')[0];
      const { data: invoice, error } = await supabase
        .from('group_invoices')
        .insert({
          group_booking_id: groupBookingId,
          invoice_number: invoiceNumber,
          invoice_date: today,
          due_date: today,
          subtotal,
          tax_amount: taxAmount,
          total_amount: total,
          paid_amount: 0,
          status: 'draft'
        })
        .select()
        .single();
      if (error) throw error;
      if (items.length > 0) {
        const rows = items.map(i => ({
          group_invoice_id: invoice.id,
          unit_id: i.unit_id,
          description: i.description,
          amount: i.amount
        }));
        const { error: e2 } = await supabase.from('group_invoice_items').insert(rows);
        if (e2) throw e2;
      }
      alert(`تم إنشاء فاتورة جماعية مسودة رقم ${invoiceNumber}`);
      location.reload();
    } catch (e: any) {
      alert('تعذر إنشاء الفاتورة: ' + (e?.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center justify-center gap-2"
    >
      <FileText size={18} />
      <span>{loading ? 'جار الإنشاء...' : 'إنشاء فاتورة جماعية (مسودة)'}</span>
    </button>
  );
}
