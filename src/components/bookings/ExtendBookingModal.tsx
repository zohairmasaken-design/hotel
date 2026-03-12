import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { format, addDays, addMonths, differenceInCalendarDays, parseISO } from 'date-fns';
import { Calendar, AlertCircle, CheckCircle, Loader2, X } from 'lucide-react';
import { UnitType, PricingRule, calculateStayPrice } from '@/lib/pricing';

interface ExtendBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: {
    id: string;
    check_out: string;
    unit_id: string;
    booking_type?: 'daily' | 'yearly';
    unit: {
      unit_type: UnitType;
      unit_number: string;
    };
  };
  onSuccess: () => void;
}

export default function ExtendBookingModal({ isOpen, onClose, booking, onSuccess }: ExtendBookingModalProps) {
  const [newEndDate, setNewEndDate] = useState('');
  const [extendType, setExtendType] = useState<'daily' | 'yearly'>(booking.booking_type === 'yearly' ? 'yearly' : 'daily');
  const [durationMonths, setDurationMonths] = useState<number>(12);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [priceDetails, setPriceDetails] = useState<{ total: number; tax: number; grandTotal: number; nights: number } | null>(null);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [includeTax, setIncludeTax] = useState<boolean>(true);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [extraAmount, setExtraAmount] = useState<number>(0);

  // Initialize date
  useEffect(() => {
    if (isOpen && booking.check_out) {
      const currentEnd = parseISO(booking.check_out);
      const nextDate = extendType === 'yearly' ? addMonths(currentEnd, durationMonths) : addDays(currentEnd, 1);
      setNewEndDate(format(nextDate, 'yyyy-MM-dd'));
      setAvailable(null);
      setPriceDetails(null);
      setError(null);
      fetchPricingRules();
    }
  }, [isOpen, booking.check_out, extendType, durationMonths]);

  const fetchPricingRules = async () => {
    if (!booking.unit?.unit_type?.id) return;
    const { data } = await supabase
      .from('pricing_rules')
      .select('*')
      .eq('active', true)
      .eq('unit_type_id', booking.unit.unit_type.id);
    
    if (data) setPricingRules(data);
  };

  // Check Availability and Calculate Price when date changes
  useEffect(() => {
    const check = async () => {
      if (!newEndDate || !isOpen) return;

      const currentEnd = parseISO(booking.check_out);
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
        // 1. Check Availability
        const { data: isAvailable, error: rpcError } = await supabase.rpc('check_unit_availability', {
          p_unit_id: booking.unit_id,
          p_start_date: booking.check_out, // Check from current checkout
          p_end_date: newEndDate,          // To new checkout
          p_exclude_booking_id: booking.id
        });

        if (rpcError) throw rpcError;
        setAvailable(isAvailable);

        if (isAvailable) {
          if (!booking.unit?.unit_type) {
             setError('بيانات نوع الوحدة غير متوفرة لحساب السعر');
             return;
          }
          // 2. Calculate Price
          if (extendType === 'yearly') {
            const annualPrice = booking.unit.unit_type.annual_price || 0;
            if (annualPrice <= 0) {
              setError('هذا النوع لا يحتوي على سعر سنوي محدد');
              setPriceDetails(null);
            } else {
              const monthlyRate = annualPrice / 12;
              const baseTotal = monthlyRate * durationMonths;
              const taxRate = includeTax ? 0.15 : 0;
              const tax = Math.round(baseTotal * taxRate * 100) / 100;
              const grandTotal = baseTotal + tax;
              setPriceDetails({
                total: baseTotal,
                tax,
                grandTotal,
                nights: differenceInCalendarDays(newEnd, currentEnd)
              });
            }
          } else {
            const calculation = calculateStayPrice(
              booking.unit.unit_type,
              pricingRules,
              currentEnd, // Start calculation from current checkout
              newEnd      // To new checkout
            );
            const baseTotal = calculation.totalPrice;
            const taxRate = includeTax ? 0.15 : 0;
            const tax = Math.round(baseTotal * taxRate * 100) / 100;
            const grandTotal = baseTotal + tax;
            setPriceDetails({
              total: baseTotal,
              tax,
              grandTotal,
              nights: calculation.nights
            });
          }
        }
      } catch (err: any) {
        console.error('Check Error:', err);
        setError('حدث خطأ أثناء التحقق من التوفر');
      } finally {
        setChecking(false);
      }
    };

    const timeout = setTimeout(check, 500); // Debounce
    return () => clearTimeout(timeout);
  }, [newEndDate, booking.check_out, booking.unit_id, booking.id, pricingRules, isOpen, booking.unit?.unit_type, extendType, durationMonths, includeTax]);

  const handleExtend = async () => {
    if (!available || !priceDetails) return;
    
    const extendText = extendType === 'yearly' 
      ? `مدة ${durationMonths} شهر` 
      : `مدة ${priceDetails.nights} ليلة`;
    const effTotal = Math.max(0, (priceDetails.total || 0) - (discountAmount || 0) + (extraAmount || 0));
    const effTaxRate = includeTax ? 0.15 : 0;
    const effTax = Math.round(effTotal * effTaxRate * 100) / 100;
    const effGrand = effTotal + effTax;
    if (!confirm(`هل أنت متأكد من تمديد الحجز ${extendText}؟\nالمبلغ الأساسي: ${priceDetails.total.toLocaleString()} ر.س\nالخصم: ${Number(discountAmount || 0).toLocaleString()} ر.س\nالإضافة: ${Number(extraAmount || 0).toLocaleString()} ر.س\nالمبلغ المعدل: ${effTotal.toLocaleString()} ر.س\nالضريبة (${includeTax ? '15%' : '0%'}): ${effTax.toLocaleString()} ر.س\nالإجمالي: ${effGrand.toLocaleString()} ر.س\n\nسيتم تحديث الحجز وإصدار فاتورة بالمبلغ الإضافي.`)) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('extend_booking', {
        p_booking_id: booking.id,
        p_new_end_date: newEndDate,
        p_additional_amount: effTotal
      });

      if (error) throw error;

      // Fetch the latest created extension invoice and normalize its fields
      const { data: latest } = await supabase
        .from('invoices')
        .select('id, invoice_number')
        .eq('booking_id', booking.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (latest) {
        // Update amounts to reflect discount/additions and tax choice
        await supabase
          .from('invoices')
          .update({
            discount_amount: Number(discountAmount || 0),
            additional_services_amount: Number(extraAmount || 0),
            subtotal: priceDetails.total,
            tax_amount: effTax,
            total_amount: effGrand
          })
          .eq('id', latest.id);

        // Ensure invoice_number is human-friendly sequential if needed
        if (!latest.invoice_number || latest.invoice_number.includes('-EXT-')) {
          const { count: invCount } = await supabase.from('invoices').select('*', { count: 'exact', head: true });
          const nextInv = String(((invCount || 0) + 1)).padStart(4, '0');
          await supabase.from('invoices').update({ invoice_number: nextInv }).eq('id', latest.id);
        }
      }

      onSuccess();
      onClose();
      alert('تم تمديد الحجز بنجاح!');
    } catch (err: any) {
      console.error('Extension Error:', err);
      alert('حدث خطأ أثناء تمديد الحجز: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
          <h3 className="text-lg font-bold text-gray-900">تمديد الحجز</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          <div className="space-y-4">
            <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
              <button
                onClick={() => setExtendType('daily')}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                  extendType === 'daily' 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                تمديد يومي
              </button>
              <button
                onClick={() => setExtendType('yearly')}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                  extendType === 'yearly' 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                تمديد سنوي
              </button>
            </div>
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 text-sm text-blue-800">
              <div className="flex justify-between mb-1">
                <span className="text-blue-600">المغادرة الحالية:</span>
                <span className="font-bold dir-ltr">{format(parseISO(booking.check_out), 'yyyy-MM-dd')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-600">الوحدة:</span>
                <span className="font-bold">{booking.unit.unit_number}</span>
              </div>
            </div>

            <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
              <button
                onClick={() => setIncludeTax(true)}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                  includeTax 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                احتساب الضريبة
              </button>
              <button
                onClick={() => setIncludeTax(false)}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                  !includeTax 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                بدون ضريبة
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">تاريخ المغادرة الجديد</label>
              <div className="relative">
                <input
                  type="date"
                  value={newEndDate}
                  min={format(addDays(parseISO(booking.check_out), 1), 'yyyy-MM-dd')}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  className="w-full p-3 pl-10 border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  disabled={extendType === 'yearly'}
                />
                <Calendar className="absolute left-3 top-3.5 text-gray-400" size={18} />
              </div>
              {extendType === 'yearly' && (
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-xs font-bold text-gray-700 whitespace-nowrap">مدة التمديد (أشهر):</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={durationMonths}
                    onChange={(e) => setDurationMonths(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 p-2 text-center border border-gray-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <span className="text-xs text-blue-600">
                    * يتم تحديث تاريخ المغادرة والسعر تلقائياً
                  </span>
                </div>
              )}
            </div>

            {/* Status & Price Display */}
            <div className="min-h-[100px]">
              {checking ? (
                <div className="flex items-center justify-center py-8 text-gray-500 gap-2">
                  <Loader2 className="animate-spin" size={20} />
                  <span>جاري التحقق من التوفر والسعر...</span>
                </div>
              ) : error ? (
                <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 flex items-center gap-2">
                  <AlertCircle size={18} />
                  <span>{error}</span>
                </div>
              ) : available === false ? (
                <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 flex items-center gap-2">
                  <AlertCircle size={18} />
                  <span>عذراً، الوحدة غير متاحة في هذه التواريخ.</span>
                </div>
              ) : available === true && priceDetails ? (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 p-3 rounded-lg border border-emerald-100 text-sm font-medium">
                    <CheckCircle size={16} />
                    <span>الوحدة متاحة للتمديد</span>
                  </div>
                  
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">{extendType === 'yearly' ? 'مدة التمديد:' : 'عدد الليالي الإضافية:'}</span>
                      <span className="font-bold">
                        {extendType === 'yearly' ? `${durationMonths} أشهر` : `${priceDetails.nights} ليلة`}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">المبلغ الأساسي:</span>
                      <span className="font-bold">{priceDetails.total.toLocaleString()} ر.س</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowDiscount(v => !v)}
                        className="px-3 py-1.5 rounded-lg border text-xs font-bold hover:bg-gray-100"
                      >
                        إضافة خصم
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowExtra(v => !v)}
                        className="px-3 py-1.5 rounded-lg border text-xs font-bold hover:bg-gray-100"
                      >
                        إضافة مبلغ
                      </button>
                    </div>
                    {showDiscount && (
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-sm text-gray-600">قيمة الخصم:</label>
                        <input
                          type="number"
                          min="0"
                          value={discountAmount}
                          onChange={e => setDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
                          className="w-40 px-3 py-2 border rounded-lg text-right"
                          placeholder="0"
                        />
                      </div>
                    )}
                    {showExtra && (
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-sm text-gray-600">قيمة الإضافة:</label>
                        <input
                          type="number"
                          min="0"
                          value={extraAmount}
                          onChange={e => setExtraAmount(Math.max(0, Number(e.target.value) || 0))}
                          className="w-40 px-3 py-2 border rounded-lg text-right"
                          placeholder="0"
                        />
                      </div>
                    )}
                    {(() => {
                      const base = priceDetails.total || 0;
                      const effBase = Math.max(0, base - (discountAmount || 0) + (extraAmount || 0));
                      const rate = includeTax ? 0.15 : 0;
                      const effTax = Math.round(effBase * rate * 100) / 100;
                      const effGrand = effBase + effTax;
                      return (
                        <>
                          {(discountAmount > 0 || extraAmount > 0) && (
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">المبلغ المعدل:</span>
                              <span className="font-bold">{effBase.toLocaleString()} ر.س</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">الضريبة ({includeTax ? '15%' : '0%'}):</span>
                            <span className="font-bold text-orange-600">{effTax.toLocaleString()} ر.س</span>
                          </div>
                          <div className="border-t border-gray-200 pt-2 flex justify-between items-center mt-2">
                            <span className="font-bold text-gray-900">الإجمالي شامل الضريبة:</span>
                            <span className="text-xl font-bold text-blue-600">{effGrand.toLocaleString()} ر.س</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
              disabled={loading}
            >
              إلغاء
            </button>
            <button
              onClick={handleExtend}
              disabled={!available || loading || !priceDetails}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : 'تأكيد التمديد'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
