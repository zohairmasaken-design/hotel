import React from 'react';
import { createClient } from '@/lib/supabase-server';
import BookingDetails from '@/components/bookings/BookingDetails';
import { notFound } from 'next/navigation';

export const runtime = 'edge';

export const metadata = {
  title: 'تفاصيل الحجز',
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { id } = await params;

  // Fetch Booking
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select(`
      *,
      customer:customers(*),
      unit:units(*, unit_type:unit_types(*))
    `)
    .eq('id', id)
    .single();

  if (bookingError || !booking) {
    return <div>الحجز غير موجود</div>;
  }

  // Fetch Invoices (All invoices for this booking)
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*')
    .eq('booking_id', id)
    .order('created_at', { ascending: true });

  // Fetch Transactions (Journal Entries linked to this booking OR its invoices)
  const referenceIds = [id];
  if (invoices && invoices.length > 0) {
    invoices.forEach(inv => referenceIds.push(inv.id));
  }
  // Include payments linked to invoices to capture refund transactions referencing payment.id
  let paymentsForInvoices: any[] = [];
  if (invoices && invoices.length > 0) {
    const invoiceIds = invoices.map((inv: any) => inv.id);
    const { data: invPayments } = await supabase
      .from('payments')
      .select('id, journal_entry_id, invoice_id')
      .in('invoice_id', invoiceIds);
    paymentsForInvoices = invPayments || [];
    paymentsForInvoices.forEach(p => referenceIds.push(p.id));
  }

  const { data: transactions, error: txError } = await supabase
    .from('journal_entries')
    .select(`
      *,
      journal_lines(
        *,
        account:accounts(code, name)
      )
    `)
    .in('reference_id', referenceIds)
    .order('created_at', { ascending: false });

  // Build Payment map by journal_entry_id for quick receipt printing
  const txnIds = (transactions || []).map((t: any) => t.id);
  let paymentJournalMap: Record<string, string> = {};
  if (txnIds.length > 0) {
    const { data: payments } = await supabase
      .from('payments')
      .select('id,journal_entry_id')
      .in('journal_entry_id', txnIds);
    if (payments && payments.length > 0) {
      paymentJournalMap = Object.fromEntries(
        payments
          .filter((p: any) => p.journal_entry_id)
          .map((p: any) => [p.journal_entry_id, p.id])
      );
    }
  }

  // Fetch Payment Methods
  const { data: paymentMethods } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('is_active', true);

  return (
    <BookingDetails 
      booking={booking} 
      transactions={transactions || []} 
      paymentMethods={paymentMethods || []}
      invoices={invoices || []}
      paymentJournalMap={paymentJournalMap}
    />
  );
}
