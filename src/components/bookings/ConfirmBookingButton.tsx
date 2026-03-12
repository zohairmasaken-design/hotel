'use client';

import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/lib/supabase';

export default function ConfirmBookingButton({ id, disabled }: { id: string; disabled?: boolean }) {
  const { role, loading } = useUserRole();
  const isAdmin = role === 'admin';
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const onClick = async () => {
    if (!isAdmin || loading || saving) return;
    try {
      setSaving(true);
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', id);
      if (error) throw error;
      setDone(true);
      setTimeout(() => {
        // Refresh the page to reflect server-rendered status
        if (typeof window !== 'undefined') window.location.reload();
      }, 500);
    } catch (e: any) {
      alert('تعذر تأكيد الحجز: ' + (e.message || 'خطأ غير معروف'));
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || saving || disabled || done}
      className={`p-1.5 rounded-lg transition-colors ${
        done
          ? 'text-green-700 bg-green-50'
          : 'text-green-700 hover:bg-green-50'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
      title={done ? 'تم التأكيد' : 'تأكيد الحجز (مدير فقط)'}
    >
      <Check size={18} />
    </button>
  );
}

