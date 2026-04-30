'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import RoleGate from '@/components/auth/RoleGate';
import { format, addDays, addMonths, differenceInCalendarDays, parseISO } from 'date-fns';
import { AlertCircle, ArrowRight, Calendar, CheckCircle, Loader2, Save, X } from 'lucide-react';
import { PricingRule, UnitType, calculateStayPrice } from '@/lib/pricing';

const ymd = (value: string | null) => {
  if (!value) return '-';
  const s = String(value);
  if (s.includes('T')) return s.split('T')[0];
  if (s.includes(' ')) return s.split(' ')[0];
  return s;
};

export default function ExtendBookingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const bookingId = String((params as any)?.id || '');

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [booking, setBooking] = useState<any | null>(null);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);

  const [extendType, setExtendType] = useState<'daily' | 'yearly'>('daily');
  const [durationMonths, setDurationMonths] = useState<number>(1);
  const [newEndDate, setNewEndDate] = useState<string>('');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [includeTax, setIncludeTax] = useState<boolean>(true);
  const [priceDetails, setPriceDetails] = useState<{ total: number; tax: number; grandTotal: number; nights: number } | null>(null);

  const [showDiscount, setShowDiscount] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [extraAmount, setExtraAmount] = useState<number>(0);

  const resolvedTaxRate = useMemo(() => {
    const ut: any = booking?.unit?.unit_type;
    const hotelRate = Number(ut?.hotel?.tax_rate);
    const unitTypeRate = Number(ut?.tax_rate);
    const rate = Number.isFinite(hotelRate) ? hotelRate : Number.isFinite(unitTypeRate) ? unitTypeRate : 0.15;
    if (!Number.isFinite(rate)) return 0.15;
    if (rate < 0) return 0;
    return rate;
  }, [booking?.unit?.unit_type]);

  const addExtensionByMonths = (currentEnd: Date, months: number) => {
    const normalizedMonths = Math.max(0.25, Number(months) || 0.25);
    const isInteger = Number.isInteger(normalizedMonths);
    if (isInteger) return addMonths(currentEnd, normalizedMonths);
    const days = Math.max(1, Math.round(normalizedMonths * 30));
    return addDays(currentEnd, days);
  };

  const formatMonthsText = (months: number) => {
    if (months === 0.25) return 'ربع شهر';
    if (months === 0.5) return 'نصف شهر';
    if (months === 1) return 'شهر';
    if (months === 2) return 'شهرين';
    return `مدة ${months} شهر`;
  };

  const fetchPricingRules = async (unitTypeId: string) => {
    const { data } = await supabase.from('pricing_rules').select('*').eq('active', true).eq('unit_type_id', unitTypeId);
    setPricingRules(data || []);
  };

  const load = async () => {
    if (!bookingId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: b, error: bErr } = await supabase
        .from('bookings')
        .select(
          `
          id,
          status,
          booking_type,
          check_in,
          check_out,
          unit_id,
          unit:units(
            id,
            unit_number,
            unit_type:unit_types(id, name, daily_price, annual_price, tax_rate, hotel:hotels(id, name, tax_rate))
          )
        `
        )
        .eq('id', bookingId)
        .maybeSingle();
      if (bErr) throw bErr;
      if (!b) {
        setBooking(null);
        return;
      }
      const bAny = b as any;
      setBooking(bAny);

      const initialType = String(bAny?.booking_type || '') === 'yearly' ? 'yearly' : 'daily';
      setExtendType(initialType);
      setDurationMonths(1);
      setIncludeTax(true);
      setDiscountAmount(0);
      setExtraAmount(0);
      setShowDiscount(true);
      setShowExtra(true);

      const currentEnd = parseISO(String(bAny.check_out));
      const nextDate = initialType === 'yearly' ? addExtensionByMonths(currentEnd, 1) : addDays(currentEnd, 1);
      setNewEndDate(format(nextDate, 'yyyy-MM-dd'));
      setAvailable(null);
      setPriceDetails(null);

      const utId = String(bAny?.unit?.unit_type?.id || '');
      if (utId) await fetchPricingRules(utId);
    } catch (e: any) {
      setError(String(e?.message || e || 'تعذر تحميل بيانات التمديد'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [bookingId]);

  useEffect(() => {
    if (!booking?.check_out) return;
    const currentEnd = parseISO(String(booking.check_out));
    const nextDate = extendType === 'yearly' ? addExtensionByMonths(currentEnd, durationMonths) : addDays(currentEnd, 1);
    setNewEndDate(format(nextDate, 'yyyy-MM-dd'));
    setAvailable(null);
    setPriceDetails(null);
    setError(null);
  }, [extendType, durationMonths, booking?.check_out]);

  useEffect(() => {
    const check = async () => {
      if (!newEndDate || !booking?.check_out || !booking?.unit_id) return;
      const currentEnd = parseISO(String(booking.check_out));
      const newEnd = parseISO(newEndDate);
      if (differenceInCalendarDays(newEnd, currentEnd) <= 0) {
        setAvailable(null);
        setPriceDetails(null);
        return;
      }
      setChecking(true);
      setError(null);
      setAvailable(null);
      try {
        const { data: isAvailable, error: rpcError } = await supabase.rpc('check_unit_availability', {
          p_unit_id: booking.unit_id,
          p_start_date: booking.check_out,
          p_end_date: newEndDate,
          p_exclude_booking_id: booking.id,
        });
        if (rpcError) throw rpcError;
        setAvailable(Boolean(isAvailable));
        if (!isAvailable) {
          setPriceDetails(null);
          return;
        }
        const ut: UnitType | null = booking?.unit?.unit_type || null;
        if (!ut) {
          setError('بيانات نوع الوحدة غير متوفرة لحساب السعر');
          setPriceDetails(null);
          return;
        }
        if (extendType === 'yearly') {
          const annualPrice = Number(ut.annual_price || 0);
          const dailyPrice = Number(ut.daily_price || 0);
          const monthlyRent = annualPrice > 0 ? annualPrice / 12 : dailyPrice > 0 ? dailyPrice * 30 : 0;
          if (monthlyRent <= 0) {
            setError('لا يمكن حساب قيمة التمديد لهذا النوع');
            setPriceDetails(null);
            return;
          }
          const months = Math.max(0.25, Number(durationMonths) || 0.25);
          const baseTotal = monthlyRent * months;
          const taxRate = includeTax ? resolvedTaxRate : 0;
          const tax = Math.round(baseTotal * taxRate * 100) / 100;
          const grandTotal = baseTotal + tax;
          setPriceDetails({
            total: baseTotal,
            tax,
            grandTotal,
            nights: differenceInCalendarDays(newEnd, currentEnd),
          });
        } else {
          const calculation = calculateStayPrice(ut, pricingRules, currentEnd, newEnd);
          const baseTotal = calculation.totalPrice;
          const taxRate = includeTax ? resolvedTaxRate : 0;
          const tax = Math.round(baseTotal * taxRate * 100) / 100;
          const grandTotal = baseTotal + tax;
          setPriceDetails({
            total: baseTotal,
            tax,
            grandTotal,
            nights: calculation.nights,
          });
        }
      } catch (e: any) {
        setError(String(e?.message || e || 'حدث خطأ أثناء التحقق من التوفر'));
      } finally {
        setChecking(false);
      }
    };
    const t = setTimeout(check, 400);
    return () => clearTimeout(t);
  }, [newEndDate, booking?.check_out, booking?.unit_id, booking?.id, pricingRules, booking?.unit?.unit_type, extendType, durationMonths, includeTax, resolvedTaxRate]);

  const handleExtend = async () => {
    if (!booking?.id || !booking?.unit_id || !booking?.check_out) return;
    if (!available || !priceDetails) return;

    const extendText = extendType === 'yearly' ? formatMonthsText(durationMonths) : `مدة ${priceDetails.nights} ليلة`;
    const previousEndDate = String(booking.check_out);
    const baseSubtotal = Math.max(0, priceDetails.total || 0);
    const effTotal = Math.max(0, baseSubtotal - (discountAmount || 0) + (extraAmount || 0));
    const effTaxRate = includeTax ? resolvedTaxRate : 0;
    const effTax = Math.round(effTotal * effTaxRate * 100) / 100;
    const effGrand = effTotal + effTax;
    const taxPercentText = includeTax ? `${Math.round(resolvedTaxRate * 10000) / 100}%` : '0%';
    if (effGrand <= 0) {
      alert('لا يمكن تنفيذ التمديد لأن إجمالي فاتورة التمديد يساوي 0. عدّل المبلغ/الخصم/الإضافات ثم أعد المحاولة.');
      return;
    }
    if (
      !confirm(
        `هل أنت متأكد من تمديد الحجز ${extendText}؟\n` +
          `المبلغ الأساسي: ${priceDetails.total.toLocaleString()} ر.س\n` +
          `الخصم: ${Number(discountAmount || 0).toLocaleString()} ر.س\n` +
          `الإضافة: ${Number(extraAmount || 0).toLocaleString()} ر.س\n` +
          `المبلغ المعدل: ${effTotal.toLocaleString()} ر.س\n` +
          `الضريبة (${taxPercentText}): ${effTax.toLocaleString()} ر.س\n` +
          `الإجمالي: ${effGrand.toLocaleString()} ر.س\n\n` +
          `سيتم تحديث الحجز وإصدار فاتورة بالمبلغ الإضافي وترحيل القيد تلقائياً.`
      )
    )
      return;

    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('extend_booking_v2', {
        p_booking_id: booking.id,
        p_new_end_date: newEndDate,
        p_additional_subtotal: baseSubtotal,
        p_discount_amount: Number(discountAmount || 0),
        p_extras_amount: Number(extraAmount || 0),
        p_apply_tax: includeTax,
        p_tax_rate: resolvedTaxRate,
      });
      if (rpcErr) throw rpcErr;

      const invoiceId = (data as any)?.invoice_id || (data as any)?.invoice?.id || null;
      try {
        await supabase.from('system_events').insert({
          event_type: 'booking_extension_invoice_period',
          booking_id: booking.id,
          unit_id: booking.unit_id,
          message: `فترة توريد فاتورة تمديد للحجز ${booking.id}`,
          payload: {
            invoice_id: invoiceId,
            period_start: previousEndDate,
            period_end: newEndDate,
            extend_type: extendType,
            duration_months: extendType === 'yearly' ? Number(durationMonths) : null,
            nights: extendType === 'daily' ? Number(priceDetails.nights) : null,
            apply_tax: includeTax,
            tax_rate: resolvedTaxRate,
            discount_amount: Number(discountAmount || 0),
            extras_amount: Number(extraAmount || 0),
          },
        });
      } catch {}

      alert('تم تمديد الحجز بنجاح!');
      router.push(`/bookings-list/${booking.id}`);
      router.refresh();
    } catch (e: any) {
      const msg = String(e?.message || e || 'خطأ غير معروف');
      if (msg.includes('Could not find the') && msg.includes('schema cache')) {
        alert('تعذر تنفيذ التمديد لأن دالة التمديد غير ظاهرة في مخطط قاعدة البيانات (schema cache). يلزم إعادة تحميل مخطط Supabase ثم إعادة المحاولة.');
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const minDate = useMemo(() => {
    if (!booking?.check_out) return undefined;
    try {
      return format(addDays(parseISO(String(booking.check_out)), 1), 'yyyy-MM-dd');
    } catch {
      return undefined;
    }
  }, [booking?.check_out]);

  return (
    <RoleGate allow={['admin', 'manager', 'receptionist', 'accountant']}>
      <div className="p-6 max-w-4xl mx-auto space-y-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div className="flex items-center gap-3">
            <Link href={`/bookings-list/${bookingId}`} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
              <ArrowRight size={22} />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900">تمديد الحجز</h1>
              <div className="text-xs text-gray-500 mt-1">
                {booking?.unit?.unit_number ? `الوحدة: ${booking.unit.unit_number}` : ''}{' '}
                {booking?.check_out ? `• المغادرة الحالية: ${ymd(String(booking.check_out))}` : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(`/bookings-list/${bookingId}`)}
              className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm font-black text-gray-700 inline-flex items-center gap-2"
            >
              <X size={18} />
              إغلاق
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <div className="text-xs text-gray-500">الوحدة</div>
              <div className="mt-1 text-lg font-black text-gray-900">{booking?.unit?.unit_number || '-'}</div>
              <div className="mt-1 text-xs text-gray-500">{booking?.unit?.unit_type?.name ? String(booking.unit.unit_type.name) : ''}</div>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <div className="text-xs text-gray-500">تاريخ المغادرة الحالي</div>
              <div className="mt-1 text-lg font-black text-gray-900 dir-ltr">{ymd(booking?.check_out ? String(booking.check_out) : null)}</div>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="text-xs text-blue-700 font-black">الخطوة 1</div>
              <div className="mt-1 text-sm font-black text-blue-900">اختر طريقة التمديد</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExtendType('daily')}
                  className={`px-3 py-2 rounded-xl border text-xs font-black transition-colors ${
                    extendType === 'daily' ? 'bg-white border-blue-300 text-blue-800 shadow-sm' : 'bg-white/60 border-blue-100 text-blue-700 hover:bg-white'
                  }`}
                  title="تحديد تاريخ مغادرة جديد مباشرة"
                >
                  حسب التاريخ
                </button>
                <button
                  type="button"
                  onClick={() => setExtendType('yearly')}
                  className={`px-3 py-2 rounded-xl border text-xs font-black transition-colors ${
                    extendType === 'yearly' ? 'bg-white border-blue-300 text-blue-800 shadow-sm' : 'bg-white/60 border-blue-100 text-blue-700 hover:bg-white'
                  }`}
                  title="تمديد بعدد أشهر (ربع/نصف/شهر...)"
                >
                  حسب الأشهر
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="text-xs font-black text-gray-900 mb-3">الخطوة 2: تحديد مدة التمديد</div>

              {extendType === 'daily' ? (
                <>
                  <label className="block text-xs font-black text-gray-700 mb-2">تاريخ المغادرة الجديد</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={newEndDate}
                      min={minDate}
                      onChange={(e) => setNewEndDate(e.target.value)}
                      className="w-full p-3 pl-10 border border-gray-200 rounded-xl font-black text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                    <Calendar className="absolute left-3 top-3.5 text-gray-400" size={18} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {[1, 3, 7, 14, 30].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          if (!booking?.check_out) return;
                          const base = parseISO(String(booking.check_out));
                          const next = addDays(base, d);
                          setNewEndDate(format(next, 'yyyy-MM-dd'));
                        }}
                        className="px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 text-xs font-black"
                      >
                        +{d} يوم
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] text-gray-500 font-bold">يتم التحقق من التوفر وحساب السعر تلقائياً بعد اختيار التاريخ.</div>
                </>
              ) : (
                <>
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                    <div className="text-xs text-gray-500">تاريخ المغادرة الجديد (يُحسب تلقائياً)</div>
                    <div className="mt-1 text-lg font-black text-gray-900 dir-ltr">{newEndDate || '-'}</div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-xs font-black text-gray-700">مدة التمديد بالأشهر</div>
                      <input
                        type="number"
                        min="0.25"
                        step="0.25"
                        max="60"
                        value={durationMonths}
                        onChange={(e) => setDurationMonths(Math.max(0.25, parseFloat(e.target.value) || 0.25))}
                        className="w-28 px-3 py-2 text-center border border-gray-200 rounded-xl text-sm font-black focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[0.25, 0.5, 1, 2, 3, 6, 12].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setDurationMonths(m)}
                          className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-black transition-colors ${
                            durationMonths === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {m === 0.25 ? 'ربع' : m === 0.5 ? 'نصف' : `${m}`}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 text-[11px] text-gray-500 font-bold">سيتم تحديث تاريخ المغادرة والسعر تلقائياً.</div>
                  </div>
                </>
              )}

              <div className="mt-5 bg-gray-50 border border-gray-200 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-black text-gray-900">الخصم والإضافات</div>
                    <div className="mt-1 text-[11px] text-gray-600 font-bold">هذه القيم تُطبق على فاتورة التمديد فقط.</div>
                  </div>
                  <button type="button" onClick={() => { setDiscountAmount(0); setExtraAmount(0); }} className="px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 text-xs font-black">
                    تصفير
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-white border border-gray-200 rounded-xl p-3">
                    <div className="text-xs font-black text-gray-700 mb-2">الخصم</div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={discountAmount}
                        onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full px-3 py-2 border rounded-xl text-right font-black"
                        placeholder="0"
                      />
                      <div className="text-xs font-black text-gray-600 whitespace-nowrap">ر.س</div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-xl p-3">
                    <div className="text-xs font-black text-gray-700 mb-2">الإضافة</div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={extraAmount}
                        onChange={(e) => setExtraAmount(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full px-3 py-2 border rounded-xl text-right font-black"
                        placeholder="0"
                      />
                      <div className="text-xs font-black text-gray-600 whitespace-nowrap">ر.س</div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setExtraAmount(250)} className="px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 text-[11px] font-black">
                        منصة إيجار 250
                      </button>
                      <button type="button" onClick={() => setExtraAmount(150)} className="px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 text-[11px] font-black">
                        منصة إيجار 150
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-xs font-black text-gray-900">الخطوة 3: التوفر والسعر</div>
                <label className="inline-flex items-center gap-2 text-xs font-black text-gray-700">
                  <input type="checkbox" checked={includeTax} onChange={(e) => setIncludeTax(e.target.checked)} />
                  احتساب الضريبة
                </label>
              </div>

              {checking ? (
                <div className="flex items-center justify-center py-10 text-gray-500 gap-2">
                  <Loader2 className="animate-spin" size={20} />
                  <span className="font-bold">جاري التحقق...</span>
                </div>
              ) : error ? (
                <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 flex items-center gap-2">
                  <AlertCircle size={18} />
                  <span className="font-bold">{error}</span>
                </div>
              ) : available === false ? (
                <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 flex items-center gap-2">
                  <AlertCircle size={18} />
                  <span className="font-bold">الوحدة غير متاحة في هذه الفترة.</span>
                </div>
              ) : available === true && priceDetails ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 p-3 rounded-lg border border-emerald-100 text-sm font-black">
                    <CheckCircle size={16} />
                    <span>الوحدة متاحة</span>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">{extendType === 'yearly' ? 'مدة التمديد:' : 'عدد الليالي الإضافية:'}</span>
                      <span className="font-black">{extendType === 'yearly' ? `${durationMonths} أشهر` : `${priceDetails.nights} ليلة`}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">المبلغ الأساسي:</span>
                      <span className="font-black">{priceDetails.total.toLocaleString()} ر.س</span>
                    </div>
                    {(() => {
                      const base = priceDetails.total || 0;
                      const effBase = Math.max(0, base - (discountAmount || 0) + (extraAmount || 0));
                      const rate = includeTax ? resolvedTaxRate : 0;
                      const effTax = Math.round(effBase * rate * 100) / 100;
                      const effGrand = effBase + effTax;
                      return (
                        <>
                          {discountAmount > 0 || extraAmount > 0 ? (
                            <div className="flex justify-between">
                              <span className="text-gray-600">المبلغ المعدل:</span>
                              <span className="font-black">{effBase.toLocaleString()} ر.س</span>
                            </div>
                          ) : null}
                          <div className="flex justify-between">
                            <span className="text-gray-600">الضريبة ({includeTax ? `${Math.round(resolvedTaxRate * 10000) / 100}%` : '0%'}):</span>
                            <span className="font-black text-orange-700">{effTax.toLocaleString()} ر.س</span>
                          </div>
                          <div className="border-t border-gray-200 pt-2 flex justify-between items-center mt-2">
                            <span className="font-black text-gray-900">الإجمالي:</span>
                            <span className="text-xl font-black text-blue-700">{effGrand.toLocaleString()} ر.س</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-sm text-gray-600 font-bold">
                  اختر مدة التمديد ليتم عرض التوفر والسعر.
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <Link
              href={`/bookings-list/${bookingId}`}
              className={`flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-black hover:bg-gray-200 transition-colors text-center ${loading ? 'pointer-events-none opacity-60' : ''}`}
            >
              رجوع
            </Link>
            <button
              type="button"
              onClick={handleExtend}
              disabled={!available || loading || !priceDetails}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              تأكيد التمديد
            </button>
          </div>
        </div>
      </div>
    </RoleGate>
  );
}
