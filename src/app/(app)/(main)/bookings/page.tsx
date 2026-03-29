import React from 'react';
import { BookingWizard } from '@/components/bookings/BookingWizard';
import { createClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';
import RoleGate from '@/components/auth/RoleGate';

export const runtime = 'edge';

export default async function BookingsPage({ searchParams }: { searchParams?: Promise<{ q?: string; unit_id?: string; check_in?: string; check_out?: string; search?: string; embed?: string; scale?: string }> }) {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const language = cookieStore.get('app_language')?.value === 'en' ? 'en' : 'ar';
  const t = (arText: string, enText: string) => (language === 'en' ? enText : arText);
  const params = searchParams ? await searchParams : {};
  const q = params?.q || '';
  const unitId = params?.unit_id || '';
  const checkIn = params?.check_in || '';
  const checkOut = params?.check_out || '';
  const searchMode = params?.search || '';
  const isEmbed = params?.embed === '1';
  let initialCustomer = null as any;
  let initialQuery = '';
  if (isEmbed) {
    return (
      <div className="space-y-2">
        <BookingWizard
          initialUnitId={(unitId && unitId.trim()) ? unitId.trim() : undefined}
          initialCheckIn={(checkIn && checkIn.trim()) ? checkIn.trim() : undefined}
          initialCheckOut={(checkOut && checkOut.trim()) ? checkOut.trim() : undefined}
          language={language}
        />
      </div>
    );
  }
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
    <RoleGate allow={['admin', 'manager', 'receptionist', 'accountant']}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-gray-500 px-1">
          <span>{t('الحجوزات', 'Bookings')}</span>
          <span>/</span>
          <span className="font-medium text-gray-900">{t('حجز جديد', 'New booking')}</span>
        </div>
        <BookingWizard 
          initialCustomer={initialCustomer || undefined} 
          initialUnitId={(unitId && unitId.trim()) ? unitId.trim() : undefined}
          initialQuery={initialQuery || undefined}
          initialCheckIn={(checkIn && checkIn.trim()) ? checkIn.trim() : undefined}
          initialCheckOut={(checkOut && checkOut.trim()) ? checkOut.trim() : undefined}
          language={language}
        />
      </div>
    </RoleGate>
  );
}
