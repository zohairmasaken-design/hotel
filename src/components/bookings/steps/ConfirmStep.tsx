'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BookingData } from '../BookingWizard';
import { calculateDetailedDuration, formatArabicDuration } from '@/lib/pricing';
import { format } from 'date-fns';
import { CheckCircle, Loader2, AlertCircle, FileText, Home, Printer, ArrowRight, Mail, MessageCircle, Share2, Eye, User, Calendar, MapPin, CreditCard, ShieldCheck, Zap, Info, Wallet, Receipt, Calculator } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAppLanguage } from '@/hooks/useAppLanguage';

interface ConfirmStepProps {
  data: BookingData;
  onSuccess: () => void;
  onBack: () => void;
  language?: 'ar' | 'en';
}

export const ConfirmStep: React.FC<ConfirmStepProps> = ({ data, onSuccess, onBack, language: languageProp }) => {
  const { language: storedLanguage } = useAppLanguage();
  const language = languageProp ?? storedLanguage;
  const t = (arText: string, enText: string) => (language === 'en' ? enText : arText);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState(0); // 0: init, 1: 50% + log, 2: 100%, 3: action
  const router = useRouter();

  const validationNotes = React.useMemo(() => {
    const notes: Array<{ type: 'warning' | 'info' | 'error'; text: string }> = [];
    if (!data.startDate || !data.endDate || !data.pricingResult) return notes;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(data.startDate);
    start.setHours(0, 0, 0, 0);

    // 1. Past Date Check
    if (start < today) {
      notes.push({ type: 'warning', text: 'تاريخ بداية الحجز في الماضي.' });
    }

    // 2. Excessive Deposit Check
    if (data.depositResult && data.depositResult.depositAmount > data.pricingResult.finalTotal) {
      notes.push({ type: 'error', text: 'مبلغ العربون أكبر من إجمالي الحجز!' });
    }

    // 3. Unreasonable Discount Check
    const discountPercent = (data.pricingResult.discountAmount / (data.pricingResult.subtotal || 1)) * 100;
    if (discountPercent > 50) {
      notes.push({ type: 'warning', text: `قيمة الخصم مرتفعة جداً (${Math.round(discountPercent)}%).` });
    }

    // 4. No Deposit Check
    if (!data.depositResult || data.depositResult.depositAmount === 0) {
      notes.push({ type: 'info', text: 'لم يتم تسجيل أي عربون لهذا الحجز.' });
    }

    // 5. Short duration for monthly/yearly
    if (data.bookingType === 'monthly' && data.priceCalculation?.nights && data.priceCalculation.nights < 25) {
      notes.push({ type: 'warning', text: 'نوع الحجز شهري ولكن المدة أقل من 25 ليلة.' });
    }

    return notes;
  }, [data]);

  const logPreConfirmEvent = async () => {
    try {
      const { data: { user: actor } } = await supabase.auth.getUser();
      const hasIssues = validationNotes.length > 0;
      
      await supabase.from('system_events').insert({
        event_type: 'booking_pre_confirm_attempt',
        message: `محاولة تأكيد حجز (المرحلة الأولى): العميل ${data.customer?.full_name}، الوحدة ${data.unit?.unit_number}، الإجمالي ${data.pricingResult?.finalTotal} ر.س. ${hasIssues ? '(يوجد ملاحظات/تحذيرات)' : ''}`,
        payload: {
          customer_id: data.customer?.id,
          customer_name: data.customer?.full_name,
          unit_id: data.unit?.id,
          unit_number: data.unit?.unit_number,
          start_date: format(data.startDate!, 'yyyy-MM-dd'),
          end_date: format(data.endDate!, 'yyyy-MM-dd'),
          total_price: data.pricingResult?.finalTotal,
          deposit_amount: data.depositResult?.depositAmount,
          discount_amount: data.pricingResult?.discountAmount,
          actor_id: actor?.id,
          actor_email: actor?.email,
          validation_notes: validationNotes // Recording the "illogical" things
        }
      });
    } catch (e) {
      console.error('Failed to log pre-confirm event:', e);
    }
  };

  const handleConfirmStep = async () => {
    if (confirmStep === 0) {
      setConfirmStep(1);
      await logPreConfirmEvent();
    } else if (confirmStep === 1) {
      setConfirmStep(2);
    } else if (confirmStep === 2) {
      handleConfirm();
    }
  };

  const handleConfirm = async () => {
    if (!data.customer || !data.unitType || !data.startDate || !data.endDate || !data.pricingResult || !data.depositResult) {
      setError(t('بيانات الحجز غير مكتملة', 'Booking data is incomplete'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let bookingHotelId: string | null = (data.unit as any)?.hotel_id ? String((data.unit as any).hotel_id) : null;
      if (!bookingHotelId && data.unit?.id) {
        const { data: uRow } = await supabase
          .from('units')
          .select('hotel_id')
          .eq('id', data.unit.id)
          .maybeSingle();
        bookingHotelId = (uRow as any)?.hotel_id ? String((uRow as any).hotel_id) : null;
      }
      if (!bookingHotelId) {
        throw new Error('تعذر تحديد الفندق لهذا الحجز. اختر وحدة مرتبطة بفندق صالح.');
      }

      // Pre-check overlap to avoid DB exclusion error
      const startStr = format(data.startDate, 'yyyy-MM-dd');
      const endStr = format(data.endDate, 'yyyy-MM-dd');
      const { data: conflicts } = await supabase
        .from('bookings')
        .select('id')
        .eq('unit_id', data.unit?.id)
        .in('status', ['pending_deposit', 'confirmed', 'checked_in'])
        .lt('check_in', endStr)
        .gt('check_out', startStr);
      if ((conflicts || []).length > 0) {
        setError(t('التواريخ تتعارض مع حجز آخر للوحدة. يرجى اختيار تواريخ مختلفة.', 'Dates conflict with another booking for this unit. Please choose different dates.'));
        setLoading(false);
        return;
      }
      const pad4 = (n: number) => String(n).padStart(4, '0');
      // 1. Create Booking
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          hotel_id: bookingHotelId,
          customer_id: data.customer.id,
          unit_id: data.unit?.id,
          check_in: startStr,
          check_out: endStr,
          nights: data.priceCalculation?.nights,
          total_price: data.pricingResult.finalTotal,
          tax_amount: data.pricingResult.taxAmount,
          subtotal: data.pricingResult.subtotal,
          discount_amount: data.pricingResult.discountAmount,
          additional_services: data.pricingResult.extras,
          status: data.depositResult.depositAmount > 0 ? 'confirmed' : 'pending_deposit',
          booking_type: data.bookingType || 'nightly'
        })
        .select()
        .single();

      if (bookingError) {
        const msg = bookingError.message || '';
        if (msg.includes('prevent_double_booking') || msg.toLowerCase().includes('conflicting key value')) {
          throw new Error('لا يمكن إنشاء الحجز بسبب تعارض في التواريخ مع حجز آخر للوحدة. تأكد أن تاريخ المغادرة لحجز وآخر لا يساوي تاريخ الوصول للحجز الجديد (النهاية غير شمولية).');
        }
        throw new Error(msg);
      }
      if (!booking) throw new Error('فشل إنشاء الحجز');
      
      setBookingId(booking.id);

      try {
        if (data.bookingSource) {
          await supabase.from('system_events').insert({
            event_type: 'booking_source',
            booking_id: booking.id,
            unit_id: data.unit?.id || null,
            customer_id: data.customer.id,
            hotel_id: bookingHotelId,
            message: `مصدر الحجز: ${data.bookingSource === 'reception' ? 'استقبال' : data.bookingSource === 'platform' ? (data.platformName || 'منصة') : 'وسيط'}`,
            payload: {
              booking_source: data.bookingSource,
              platform_name: data.platformName || null,
              broker_name: data.brokerName || null,
              broker_id: data.brokerId || null
            }
          });
        }
        const { data: { user: actor } } = await supabase.auth.getUser();
        const message = `تم حجز جديد للعميل ${data.customer.full_name} في الوحدة ${data.unit?.unit_number || '-'} من ${format(data.startDate, 'yyyy-MM-dd')} إلى ${format(data.endDate, 'yyyy-MM-dd')}`;
        await supabase.from('system_events').insert({
          event_type: 'booking_created',
          booking_id: booking.id,
          unit_id: data.unit?.id || null,
          customer_id: data.customer.id,
          hotel_id: bookingHotelId,
          message,
          payload: {
            check_in: format(data.startDate, 'yyyy-MM-dd'),
            check_out: format(data.endDate, 'yyyy-MM-dd'),
            total_price: data.pricingResult.finalTotal,
            actor_id: actor?.id || null,
            actor_email: actor?.email || null
          }
        });
      } catch (eventError) {
        console.error('Failed to log booking_created event:', eventError);
      }

      // 2. Create Invoice (Draft)
      const today = new Date().toISOString().split('T')[0];
      
      const extrasTotal = data.pricingResult.extras.reduce((acc: number, curr: any) => acc + (curr.amount || 0), 0);

      let invoice: any = null;
      let invoiceError: any = null;
      const { data: { user: actor } } = await supabase.auth.getUser();
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('issue_invoice_for_booking_v2', {
        p_booking_id: booking.id,
        p_invoice_date: today,
        p_paid_amount: data.depositResult.depositAmount,
        p_actor_id: actor?.id || null
      });

      if (!rpcErr && rpcRes?.success && rpcRes?.invoice_id) {
        const { data: createdInvoice, error: invFetchErr } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', rpcRes.invoice_id)
          .single();
        if (!invFetchErr) invoice = createdInvoice;
      } else {
        invoiceError = rpcErr || (rpcRes?.success === false ? new Error(rpcRes?.message || 'فشل إنشاء الفاتورة') : null);
      }

      if (!invoice) {
        const pickNextInvoiceNumber = async () => {
          try {
            const { data: nextNum, error: nextNumErr } = await supabase.rpc('get_next_invoice_number');
            if (!nextNumErr && nextNum) return nextNum;
          } catch (e) {
            console.warn('RPC get_next_invoice_number failed, falling back to manual logic');
          }

          const { data: lastNumeric } = await supabase
            .from('invoices')
            .select('invoice_number')
            .not('invoice_number', 'is', null)
            .order('invoice_number', { ascending: false })
            .limit(200);

          const nums = (lastNumeric || [])
            .map((r: any) => String(r.invoice_number || '').trim())
            .filter((s: string) => /^\d{4}$/.test(s))
            .map((s: string) => Number(s));

          if (nums.length > 0) {
            return pad4(Math.max(...nums) + 1);
          }

          const { count: invoicesCount } = await supabase
            .from('invoices')
            .select('*', { count: 'exact', head: true });
          return pad4((invoicesCount || 0) + 1);
        };

        let invoiceNumber = await pickNextInvoiceNumber();
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const res = await supabase
            .from('invoices')
            .insert({
              booking_id: booking.id,
              customer_id: data.customer.id,
              invoice_number: invoiceNumber,
              invoice_date: today,
              due_date: today,
              subtotal: data.pricingResult.subtotal,
              tax_amount: data.pricingResult.taxAmount,
              discount_amount: data.pricingResult.discountAmount,
              additional_services_amount: extrasTotal,
              total_amount: data.pricingResult.finalTotal,
              paid_amount: data.depositResult.depositAmount,
              status: 'draft',
              created_by: actor?.id || null
            })
            .select()
            .single();

          invoice = res.data;
          invoiceError = res.error;

          if (!invoiceError) break;

          const code = (invoiceError as any)?.code;
          if (code === '23505') {
            const current = Number(invoiceNumber);
            const next = Number.isFinite(current) ? current + 1 : Number.NaN;
            invoiceNumber = Number.isFinite(next) ? pad4(next) : pad4(Math.floor(Math.random() * 9000) + 1000);
            continue;
          }
          break;
        }
      }

      if (invoiceError) {
          console.error('Invoice creation failed:', {
            message: (invoiceError as any)?.message,
            details: (invoiceError as any)?.details,
            hint: (invoiceError as any)?.hint,
            code: (invoiceError as any)?.code
          });
          // Don't block booking creation, but log it
      }
      if (invoice && !(rpcRes?.success && rpcRes?.created)) {
        try {
          const { data: { user: actor } } = await supabase.auth.getUser();
          await supabase.from('system_events').insert({
            event_type: 'invoice_draft_created',
            message: `إنشاء فاتورة مسودة للحجز ${booking.id}`,
            booking_id: booking.id,
            customer_id: data.customer.id,
            payload: {
              invoice_id: invoice.id,
              invoice_number: invoice.invoice_number,
              total_amount: invoice.total_amount,
              actor_id: actor?.id || null,
              actor_email: actor?.email || null
            }
          });
        } catch (e) {
          console.error('Failed to log invoice_draft_created event:', e);
        }
      }

      // 3. Create Payment/Journal Entry if deposit > 0
      if (data.depositResult.depositAmount > 0 && data.depositResult.isPaid) {
          const txnDate = today;
          const { data: period, error: periodError } = await supabase
              .from('accounting_periods')
              .select('id')
              .lte('start_date', txnDate)
              .gte('end_date', txnDate)
              .eq('status', 'open')
              .maybeSingle();

          if (periodError) {
              alert(`تم إنشاء الحجز بنجاح، ولكن حدث خطأ في التحقق من الفترة المحاسبية: ${periodError.message || 'خطأ غير معروف'}`);
          } else if (!period) {
              alert(`تم إنشاء الحجز بنجاح، ولكن لا توجد فترة محاسبية مفتوحة لتاريخ ${txnDate}. يرجى فتح فترة محاسبية أولاً ثم إعادة محاولة تسجيل العربون.`);
          } else {
          // A. Post Transaction (Journal Entry)
          const { data: journalId, error: transactionError } = await supabase.rpc('post_transaction', {
              p_transaction_type: data.depositResult.accountType || 'advance_payment',
              p_source_type: 'booking',
              p_source_id: booking.id,
              p_amount: data.depositResult.depositAmount,
              p_customer_id: data.customer.id,
              p_payment_method_id: data.depositResult.paymentMethodId,
              p_transaction_date: txnDate,
              p_description: data.depositResult.statement || `عربون حجز - ${data.customer.full_name}`
          });

          if (transactionError) {
              console.error('Failed to post transaction:', JSON.stringify(transactionError, null, 2));
              // Show actual error to help debugging
              alert(`تم إنشاء الحجز بنجاح، ولكن حدث خطأ في تسجيل المعاملة المالية: ${transactionError.message || transactionError.details || JSON.stringify(transactionError)}`);
          } else {
              // B. Create Payment Record (for Payments Page)
              const { error: paymentError } = await supabase
                  .from('payments')
                  .insert({
                      customer_id: data.customer.id,
                      invoice_id: invoice?.id, // Link to invoice if created
                      payment_method_id: data.depositResult.paymentMethodId,
                      amount: data.depositResult.depositAmount,
                      payment_date: new Date().toISOString(),
                      journal_entry_id: journalId, // Link to Journal Entry
                      description: data.depositResult.statement || `عربون حجز - ${data.customer.full_name}`,
                      status: 'posted'
                  });
              
              if (paymentError) {
                   console.error('Failed to create payment record:', paymentError);
              }
              try {
                const { data: { user: actor } } = await supabase.auth.getUser();
                await supabase.from('system_events').insert({
                  event_type: 'advance_payment_posted',
                  message: `تسجيل عربون للحجز ${booking.id}`,
                  booking_id: booking.id,
                  customer_id: data.customer.id,
                  payload: {
                    amount: data.depositResult.depositAmount,
                    journal_entry_id: journalId,
                    actor_id: actor?.id || null,
                    actor_email: actor?.email || null
                  }
                });
              } catch {}
          }
          }
      }

      setSuccess(true);
      onSuccess();

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    const waLink = `https://wa.me/${data.customer?.phone}?text=${encodeURIComponent(
        `مرحباً ${data.customer?.full_name}،\nتم تأكيد حجزك لدينا بنجاح.\nرقم الحجز: ${bookingId?.slice(0, 8)}\nالوحدة: ${data.unit?.unit_number}\nمن: ${format(data.startDate!, 'yyyy-MM-dd')}\nإلى: ${format(data.endDate!, 'yyyy-MM-dd')}\nشكراً لاختياركم لنا.`
    )}`;
    
    const mailLink = `mailto:${data.customer?.email || ''}?subject=${encodeURIComponent(`تأكيد الحجز #${bookingId?.slice(0, 8)}`)}&body=${encodeURIComponent(
        `مرحباً ${data.customer?.full_name}،\n\nتم تأكيد حجزك بنجاح.\n\nتفاصيل الحجز:\nرقم الحجز: ${bookingId}\nالوحدة: ${data.unit?.unit_number}\nتاريخ الوصول: ${format(data.startDate!, 'yyyy-MM-dd')}\nتاريخ المغادرة: ${format(data.endDate!, 'yyyy-MM-dd')}\n\nشكراً لكم.`
    )}`;

    return (
      <div className="text-center py-12 space-y-8 animate-in zoom-in duration-500">
        <div className="space-y-4">
            <div className="flex justify-center">
                <div className="bg-green-100 p-6 rounded-full shadow-sm ring-8 ring-green-50">
                    <CheckCircle className="text-green-600 w-16 h-16" />
                </div>
            </div>
            <h2 className="text-3xl font-bold text-gray-900">تم الحجز بنجاح!</h2>
            <p className="text-gray-500 max-w-md mx-auto">
                تم إنشاء الحجز رقم <span className="font-mono font-bold text-gray-700">#{bookingId?.slice(0, 8)}</span> للعميل {data.customer?.full_name}.
            </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto px-4">
            {/* Contract Card */}
            <div className="bg-white border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow text-right">
                <div className="flex items-center gap-4 mb-6">
                    <div className="bg-blue-100 p-3 rounded-xl">
                        <FileText className="text-blue-600 w-8 h-8" />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg text-gray-900">عقد الإيجار</h3>
                        <p className="text-sm text-gray-500">العقد الموحد للإيجار السكني</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <button 
                        onClick={() => window.open(`/print/contract/${bookingId}`, '_blank')}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                    >
                        <Eye size={16} />
                        عرض
                    </button>
                    <button 
                        onClick={() => window.open(`/print/contract/${bookingId}`, '_blank')}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                    >
                        <Printer size={16} />
                        طباعة
                    </button>
                    <a 
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-sm font-medium transition-colors"
                    >
                        <MessageCircle size={16} />
                        واتساب
                    </a>
                    <a 
                        href={mailLink}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors"
                    >
                        <Mail size={16} />
                        بريد
                    </a>
                </div>
            </div>

            {/* Invoice Card */}
            <div className="bg-white border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow text-right">
                <div className="flex items-center gap-4 mb-6">
                    <div className="bg-purple-100 p-3 rounded-xl">
                        <FileText className="text-purple-600 w-8 h-8" />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg text-gray-900">الفاتورة الضريبية</h3>
                        <p className="text-sm text-gray-500">فاتورة رقم #{bookingId?.slice(0, 8)}</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <button 
                        onClick={() => window.open(`/print/invoice/${bookingId}`, '_blank')}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                    >
                        <Eye size={16} />
                        عرض
                    </button>
                    <button 
                        onClick={() => window.open(`/print/invoice/${bookingId}`, '_blank')}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                    >
                        <Printer size={16} />
                        طباعة
                    </button>
                    <a 
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-sm font-medium transition-colors"
                    >
                        <MessageCircle size={16} />
                        {t('واتساب', 'WhatsApp')}
                    </a>
                    <a 
                        href={mailLink}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors"
                    >
                        <Mail size={16} />
                        {t('بريد', 'Email')}
                    </a>
                </div>
            </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row justify-center gap-4">
            <button 
                onClick={() => router.push(`/bookings-list?id=${bookingId}`)}
                className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-200"
            >
                <Eye size={20} />
                {t('عرض تفاصيل الحجز', 'View booking details')}
            </button>
            <button 
                onClick={() => router.push('/')}
                className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-bold transition-colors shadow-lg shadow-gray-200"
            >
                <Home size={20} />
                {t('العودة للرئيسية', 'Back to home')}
            </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-blue-600 w-12 h-12" />
      </div>
    );
  }

  const getDurationText = () => {
    const { bookingType, startDate, endDate, priceCalculation } = data;
    const nights = priceCalculation?.nights || 0;
    
    if (bookingType === 'daily') return `${nights} ليلة`;
    if (!startDate || !endDate) return `${nights} ليلة`;
    
    // Monthly/Yearly Logic
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const { months, days } = calculateDetailedDuration(start, end);
    return formatArabicDuration(months, days);
  };

  const unitRateSummary = React.useMemo(() => {
    const unitType = data.unitType;
    const bookingType = data.bookingType;
    if (!unitType || !bookingType) return { label: 'سعر الوحدة', value: '-' };

    if (bookingType === 'daily') {
      const nights = data.priceCalculation?.nights || 0;
      const total = data.priceCalculation?.totalPrice || 0;
      const avg = nights > 0 ? Math.round(total / nights) : unitType.daily_price;
      const suffix = nights > 0 ? ` (${nights} ليلة)` : '';
      return { label: 'سعر الوحدة', value: `${avg.toLocaleString()} ر.س / ليلة${suffix}` };
    }

    const { months } = data.startDate && data.endDate ? calculateDetailedDuration(data.startDate, data.endDate) : { months: 0 };
    const monthlyRate = unitType.annual_price ? Math.round(unitType.annual_price / 12) : unitType.daily_price * 30;

    if (bookingType === 'monthly') {
      const suffix = months > 0 ? ` (${months} شهر)` : '';
      return { label: 'سعر الوحدة', value: `${monthlyRate.toLocaleString()} ر.س / شهر${suffix}` };
    }

    const annualRate = unitType.annual_price ? Math.round(unitType.annual_price) : monthlyRate * 12;
    const suffix = months > 0 ? ` (${months} شهر)` : '';
    return { label: 'سعر الوحدة', value: `${annualRate.toLocaleString()} ر.س / عقد${suffix}` };
  }, [data.bookingType, data.endDate, data.priceCalculation?.nights, data.priceCalculation?.totalPrice, data.startDate, data.unitType]);

  // Calculate totals
  const extrasTotal = data.pricingResult?.extras.reduce((acc, curr) => acc + (curr.amount || 0), 0) || 0;
  const hasDiscount = (data.pricingResult?.discountAmount || 0) > 0;
  const hasExtras = extrasTotal > 0;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700 pb-20">
      
      {error && (
        <div className="bg-red-50 border-2 border-red-100 text-red-700 p-5 rounded-[2rem] flex items-center gap-4 shadow-sm animate-pulse">
          <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white">
            <AlertCircle size={24} />
          </div>
          <span className="font-black text-sm">{error}</span>
        </div>
      )}

      {/* 0. Header Overview Card */}
      <div className="bg-gradient-to-br from-emerald-50 via-white to-white ring-1 ring-emerald-100/70 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white flex items-center justify-center shadow-sm ring-1 ring-emerald-900/20 shrink-0">
              <Zap size={22} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-black text-emerald-950 leading-tight">مراجعة وتأكيد الحجز</h2>
              <div className="mt-1 text-[11px] sm:text-xs font-bold text-emerald-900/70">
                راجع التفاصيل قبل إنشاء الحجز النهائي
              </div>
              {data.startDate && data.endDate && (
                <div className="mt-2 text-[11px] font-bold text-emerald-900/75">
                  {format(data.startDate, 'dd MMM yyyy')} ← {format(data.endDate, 'dd MMM yyyy')}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <div className="rounded-2xl bg-white/70 ring-1 ring-emerald-200/70 px-3 py-2">
              <div className="text-[10px] font-black text-emerald-900/60">مدة الإقامة</div>
              <div className="text-sm font-black text-emerald-900">{getDurationText()}</div>
            </div>
            <div className="rounded-2xl bg-white/70 ring-1 ring-emerald-200/70 px-3 py-2">
              <div className="text-[10px] font-black text-emerald-900/60">نوع الحجز</div>
              <div className="text-sm font-black text-emerald-900">
                {data.bookingType === 'daily' ? 'يومي' : data.bookingType === 'monthly' ? 'شهري' : 'سنوي'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left/Main Column: Detailed Cards */}
        <div className="lg:col-span-8 space-y-8">
            
            {/* 1. Customer Card */}
            <div className="bg-white border border-gray-100 rounded-[2.5rem] p-8 shadow-lg shadow-gray-50/50 group hover:border-blue-100 transition-colors">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <User size={24} />
                    </div>
                    <div>
                      <h3 className="font-black text-lg text-gray-900">بيانات العميل</h3>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Guest Information</p>
                    </div>
                  </div>
                  <div className="px-4 py-1.5 bg-gray-50 rounded-full border border-gray-100">
                    <span className="text-[10px] font-black text-gray-500">
                      ID: {data.customer?.id?.slice(0, 8).toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 md:gap-8">
                    <div className="space-y-1">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">الاسم الكامل</span>
                        <p className="text-sm md:text-base font-black text-gray-900 line-clamp-1">{data.customer?.full_name}</p>
                    </div>
                    <div className="space-y-1">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">رقم الجوال</span>
                        <p className="text-sm md:text-base font-black text-gray-900 dir-ltr">{data.customer?.phone}</p>
                    </div>
                    <div className="space-y-1">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">نوع العميل</span>
                        <div className="flex">
                          <span className="inline-flex items-center px-3 py-1 rounded-xl text-[10px] md:text-xs font-black bg-blue-50 text-blue-700 border border-blue-100">
                              {data.customer?.customer_type === 'individual' ? 'أفراد' : 
                               data.customer?.customer_type === 'company' ? 'شركات' : 'منصة حجز'}
                          </span>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">رقم الهوية / السجل</span>
                        <p className="text-sm md:text-base font-black text-gray-900">{data.customer?.national_id || data.customer?.commercial_register || '-'}</p>
                    </div>
                </div>
            </div>

            {/* 2. Unit & Stay Card */}
            <div className="bg-white border border-gray-100 rounded-[2.5rem] p-8 shadow-lg shadow-gray-50/50 group hover:border-emerald-100 transition-colors">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Home size={24} />
                    </div>
                    <div>
                      <h3 className="font-black text-lg text-gray-900">تفاصيل الوحدة والإقامة</h3>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Unit & Stay Details</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:gap-8">
                    <div className="p-4 md:p-5 bg-gray-50 rounded-[2rem] border border-gray-100 flex flex-col md:flex-row items-center md:items-start gap-3 md:gap-4 text-center md:text-right">
                      <div className="w-10 h-10 md:w-12 md:h-12 bg-white rounded-xl flex items-center justify-center text-gray-400 shadow-sm shrink-0">
                        <MapPin size={20} className="md:w-6 md:h-6" />
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-gray-400 uppercase block mb-0.5">الوحدة</span>
                        <p className="text-xs md:text-base font-black text-gray-900 line-clamp-2">{data.unitType?.name} - {data.unit?.unit_number}</p>
                      </div>
                    </div>

                    <div className="p-4 md:p-5 bg-emerald-50/50 rounded-[2rem] border border-emerald-100 flex flex-col md:flex-row items-center md:items-start gap-3 md:gap-4 text-center md:text-right">
                      <div className="w-10 h-10 md:w-12 md:h-12 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm shrink-0">
                        <Calendar size={20} className="md:w-6 md:h-6" />
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-emerald-600 uppercase block mb-0.5">التواريخ</span>
                        <p className="text-[10px] md:text-sm font-black text-emerald-900 leading-tight">
                          {data.startDate && format(data.startDate, 'dd MMM')} → {data.endDate && format(data.endDate, 'dd MMM yyyy')}
                        </p>
                      </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Right Column: Financial Summary & Actions */}
        <div className="lg:col-span-4 space-y-8">
            <div className="bg-gradient-to-l from-emerald-800 via-emerald-900 to-emerald-950 text-white rounded-3xl p-5 shadow-sm relative overflow-hidden sticky top-8 ring-1 ring-emerald-900/20">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-[110px] -mr-32 -mt-32 pointer-events-none"></div>
                
                <h3 className="font-black text-base text-white mb-4 flex items-center gap-2.5">
                    <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10 backdrop-blur-md shadow-sm">
                      <Calculator size={22} className="text-emerald-100" />
                    </div>
                    <span className="tracking-tight">الملخص المالي</span>
                </h3>
                
                <div className="space-y-3 text-[13px]">
                    <div className="flex justify-between items-center text-white/75 font-bold gap-3">
                        <span className="shrink-0">{unitRateSummary.label}</span>
                        <span className="text-white font-black text-right">{unitRateSummary.value}</span>
                    </div>
                    <div className="flex justify-between items-center text-white/75 font-bold">
                        <span>المجموع الفرعي</span>
                        <span className="text-white font-black">{data.pricingResult?.subtotal?.toLocaleString()} <span className="text-[10px] font-normal">ر.س</span></span>
                    </div>
                    
                    {hasExtras && (
                      <div className="pt-3 border-t border-white/10 space-y-2.5">
                        <span className="text-[10px] font-black text-white/55">الخدمات الإضافية</span>
                        {data.pricingResult?.extras.map((extra, idx) => (
                          <div key={idx} className="flex justify-between items-center text-[11px] font-black text-emerald-100/90">
                              <span>+ {extra.name}</span>
                              <span>{extra.amount} ر.س</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {hasDiscount && (
                        <div className="flex justify-between items-center bg-rose-500/20 p-4 rounded-2xl border border-rose-500/30 text-rose-400 font-black text-sm shadow-inner">
                            <span>الخصم الممنوح</span>
                            <span className="text-lg">- {data.pricingResult?.discountAmount?.toLocaleString()} <span className="text-[10px]">ر.س</span></span>
                        </div>
                    )}

                    <div className="flex justify-between items-center text-white/60 font-black pt-0.5 text-[10px] tracking-wide">
                        <span>الضريبة المضافة (15%)</span>
                        <span className="text-white/85 text-[12px]">{data.pricingResult?.taxAmount?.toLocaleString()} ر.س</span>
                    </div>

                    <div className="pt-4 border-t border-white/10 flex justify-between items-end">
                      <div className="space-y-2">
                        <span className="text-[10px] font-black text-white/55 tracking-wide">الإجمالي النهائي</span>
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.5)]"></div>
                          <span className="text-[10px] text-emerald-100 font-black tracking-tight">شامل الضريبة</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-black text-white tracking-tighter leading-none mb-1">
                          {data.pricingResult?.finalTotal?.toLocaleString()}
                        </div>
                        <span className="text-[10px] text-white/55 font-black tracking-wide">ريال سعودي</span>
                      </div>
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-3xl p-4 space-y-3 mt-5 shadow-inner">
                        <div className="flex justify-between items-center text-[12px] font-black">
                            <span className="text-white/75">العربون المدفوع</span>
                            <span className="text-emerald-100 text-[13px]">-{data.depositResult?.depositAmount?.toLocaleString()} ر.س</span>
                        </div>
                        <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                            <span className="text-[10px] font-black text-white/55 tracking-wide">المتبقي للتحصيل</span>
                            <span className="text-xl font-black text-white tracking-tight">
                                {( (data.pricingResult?.finalTotal || 0) - (data.depositResult?.depositAmount || 0) ).toLocaleString()}
                                <span className="text-[10px] text-white/55 font-normal mr-2">ر.س</span>
                            </span>
                        </div>
                    </div>
                </div>

                {/* Inline Validation Alerts Above Button */}
                {validationNotes.length > 0 && (
                    <div className="mt-6 space-y-3">
                        {validationNotes.map((note, idx) => (
                            <div 
                                key={idx} 
                                className={`flex items-start gap-3 p-3 rounded-2xl border-2 ${
                                    note.type === 'error' 
                                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' 
                                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                }`}
                            >
                                <div className="mt-0.5 shrink-0">
                                    <AlertCircle size={18} />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[12px] font-black leading-tight">{note.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="relative mt-6">
                    {/* Multi-click Confirm Button */}
                    <button
                        onClick={handleConfirmStep}
                        disabled={loading || validationNotes.some(n => n.type === 'error')}
                        className={`
                            w-full relative overflow-hidden text-white font-black py-4 px-5 rounded-2xl shadow-sm transition-all duration-300 flex justify-center items-center gap-3 group
                            bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800
                            ${(loading || validationNotes.some(n => n.type === 'error')) ? 'opacity-30 cursor-not-allowed grayscale' : ''}
                        `}
                    >
                        {/* Progress Fill Background */}
                        <div 
                            className="absolute top-0 right-0 h-full bg-white/20 transition-all duration-700 ease-out"
                            style={{ width: `${confirmStep === 1 ? '50%' : confirmStep === 2 ? '100%' : '0%'}` }}
                        />

                        {loading ? (
                            <>
                                <Loader2 className="animate-spin" size={24} />
                                <span className="relative z-10 text-sm">{t('جاري الحجز...', 'Booking...')}</span>
                            </>
                        ) : (
                            <>
                                <span className="relative z-10 text-sm">
                                    {confirmStep === 0 ? 'مراجعة وتأكيد نهائي' : 
                                     confirmStep === 1 ? 'تأكيد البيانات صحيحة؟' : 
                                     'حفظ الحجز الآن'}
                                </span>
                                <div className="relative z-10 w-9 h-9 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                                    {confirmStep === 2 ? <CheckCircle size={20} /> : <ArrowRight size={20} />}
                                </div>
                            </>
                        )}
                    </button>

                    {/* Step Indicators */}
                    <div className="flex justify-center gap-2 mt-4">
                        {[0, 1, 2].map((i) => (
                            <div 
                                key={i}
                                className={`h-1.5 rounded-full transition-all duration-500 ${
                                    confirmStep >= i ? 'w-8 bg-emerald-300/90 shadow-[0_0_8px_rgba(16,185,129,0.35)]' : 'w-3 bg-white/10'
                                }`}
                            />
                        ))}
                    </div>
                </div>
                
                <button
                    onClick={() => {
                        if (confirmStep > 0) setConfirmStep(0);
                        else onBack();
                    }}
                    disabled={loading}
                    className="w-full mt-3 bg-white/5 border border-white/10 text-white/70 font-black py-3.5 px-5 rounded-2xl hover:bg-white/10 hover:text-white transition-all text-xs"
                >
                    {confirmStep > 0 ? 'إلغاء وإعادة البدء' : t('رجوع للتعديل', 'Back to edit')}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
