'use client';

import React, { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface DeletePaymentButtonProps {
  paymentId: string;
  voucherNumber: string;
}

export default function DeletePaymentButton({ paymentId, voucherNumber }: DeletePaymentButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm(`هل أنت متأكد من حذف السند رقم (${voucherNumber}) نهائياً؟ سيتم حذف القيد المحاسبي المرتبط وعكس الأثر المالي.`)) {
      return;
    }

    setLoading(true);
    try {
      // Use the same unpost_payment RPC which now performs permanent deletion
      const { error } = await supabase.rpc('unpost_payment', {
        p_payment_id: paymentId
      });

      if (error) throw error;

      alert('تم حذف السند بنجاح');
      router.refresh();
    } catch (err: any) {
      console.error('Delete Payment Error:', err);
      alert('حدث خطأ أثناء حذف السند: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
      title="حذف السند نهائياً"
    >
      {loading ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
    </button>
  );
}
