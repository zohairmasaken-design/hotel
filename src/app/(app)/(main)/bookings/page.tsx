import React from 'react';
import { BookingWizard } from '@/components/bookings/BookingWizard';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'edge';

export default async function BookingsPage({ searchParams }: { searchParams?: Promise<{ q?: string; unit_id?: string; search?: string }> }) {
  const supabase = await createClient();
  const params = searchParams ? await searchParams : {};
  const q = params?.q || '';
  const unitId = params?.unit_id || '';
  const searchMode = params?.search || '';
  let initialCustomer = null as any;
  let initialQuery = '';
  if (q && q.trim()) {
    if (searchMode === '1') {
      initialQuery = q.trim();
    } else {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .ilike('full_name', `%${q}%`)
        .limit(1)
        .maybeSingle();
      if (data) initialCustomer = data;
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500 px-1">
        <span>الحجوزات</span>
        <span>/</span>
        <span className="font-medium text-gray-900">حجز جديد</span>
      </div>
      <BookingWizard 
        initialCustomer={initialCustomer || undefined} 
        initialUnitId={(unitId && unitId.trim()) ? unitId.trim() : undefined}
        initialQuery={initialQuery || undefined}
      />
    </div>
  );
}
