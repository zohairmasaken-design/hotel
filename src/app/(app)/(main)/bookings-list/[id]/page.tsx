import React from 'react';
import { createClient } from '@/lib/supabase-server';
import BookingDetails from '@/components/bookings/BookingDetails';
import { notFound } from 'next/navigation';
import RoleGate from '@/components/auth/RoleGate';

export const runtime = 'edge';

export const metadata = {
  title: 'تفاصيل الحجز',
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { id } = await params;

  const { data: packed, error: packedError } = await supabase.rpc('get_booking_page_data', {
    p_booking_id: id
  });

  if (packedError) {
    throw packedError;
  }

  if (!packed || (packed as any)?.ok === false) {
    return <div>الحجز غير موجود</div>;
  }

  const booking = (packed as any)?.booking;
  const invoices = ((packed as any)?.invoices || []) as any[];
  const transactions = ((packed as any)?.transactions || []) as any[];
  const paymentMethods = ((packed as any)?.payment_methods || []) as any[];
  const paymentJournalMap = ((packed as any)?.payment_journal_map || {}) as Record<string, string>;
  const ejarUpload = (packed as any)?.ejar_upload ?? null;
  const bookingWithExtras = { ...(booking || {}), ejar_upload: ejarUpload };

  return (
    <RoleGate allow={['admin', 'manager', 'receptionist', 'accountant']}>
      <BookingDetails 
        booking={bookingWithExtras} 
        transactions={transactions || []} 
        paymentMethods={paymentMethods || []}
        invoices={invoices || []}
        paymentJournalMap={paymentJournalMap}
      />
    </RoleGate>
  );
}
