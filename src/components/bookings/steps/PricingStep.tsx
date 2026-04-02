import React, { useState, useEffect, useMemo } from 'react';
import { UnitType, PriceCalculation } from '@/lib/pricing';
import { Receipt, Percent, Plus, Trash2, ArrowRight, Calculator, Coins, Edit3, AlertTriangle, Info, Zap, Sparkles, Building, Brush, HandCoins, X, ChevronDown, ChevronUp, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { differenceInCalendarMonths, format, parseISO } from 'date-fns';

interface PricingStepProps {
  onNext: (data: PricingResult) => void;
  onBack: () => void;
  unitType: UnitType;
  calculation: PriceCalculation;
  bookingType: 'daily' | 'monthly' | 'yearly';
  initialData?: PricingResult;
  language?: 'ar' | 'en';
}

export interface ExtraFee {
  id: string;
  name: string;
  amount: number;
}

export interface PricingResult {
  discountType: 'amount' | 'percent';
  discountValue: number;
  discountAmount: number;
  extras: ExtraFee[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  finalTotal: number; // After tax
  pricingMode?: 'default' | 'custom_total' | 'custom_nightly';
  customNightlyRate?: number | null;
  customTotal?: number | null;
}

export const PricingStep: React.FC<PricingStepProps> = ({ onNext, onBack, unitType, calculation, bookingType, initialData, language: languageProp }) => {
  const { language: storedLanguage } = useAppLanguage();
  const language = languageProp ?? storedLanguage;
  const t = (arText: string, enText: string) => (language === 'en' ? enText : arText);
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>(initialData?.discountType || 'amount');
  const [discountValue, setDiscountValue] = useState<number>(initialData?.discountValue || 0);
  const [extras, setExtras] = useState<ExtraFee[]>(initialData?.extras || []);
  const [taxRate, setTaxRate] = useState<number>(0.15);
  const [commissionValue, setCommissionValue] = useState<string>('');
  const [showCommissionInput, setShowCommissionInput] = useState(false);
  
  const quickAddons = [
    { name: t('رسوم منصة إيجار', 'Ejar Platform Fees'), amount: 250, icon: <Building size={14} /> },
    { name: t('رسوم النظافة', 'Cleaning Fees'), amount: 50, icon: <Brush size={14} /> },
  ];

  const handleAddQuick = (name: string, amount: number) => {
    // Check if already added
    if (extras.some(e => e.name === name)) return;
    setExtras([...extras, {
      id: Math.random().toString(36).substr(2, 9),
      name,
      amount
    }]);
  };

  const handleAddCommission = () => {
    const amount = parseFloat(commissionValue);
    if (isNaN(amount) || amount <= 0) return;
    setExtras([...extras, {
      id: Math.random().toString(36).substr(2, 9),
      name: t('عمولة حجز', 'Booking Commission'),
      amount
    }]);
    setCommissionValue('');
    setShowCommissionInput(false);
  };
  
  // Custom Price State
  const [useCustomPrice, setUseCustomPrice] = useState(() => (initialData?.pricingMode ?? 'default') !== 'default');
  const [showCustomPriceTooltip, setShowCustomPriceTooltip] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowCustomPriceTooltip(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  const [pricingMode, setPricingMode] = useState<'default' | 'custom_total' | 'custom_nightly'>(() => {
    const mode = initialData?.pricingMode;
    if (mode === 'custom_total' || mode === 'custom_nightly' || mode === 'default') return mode;
    return bookingType === 'daily' ? 'custom_nightly' : 'custom_total';
  });
  const [customPriceInput, setCustomPriceInput] = useState(() => {
    const v = initialData?.customTotal;
    return typeof v === 'number' && v > 0 ? String(v) : '';
  });
  const [nightlyRateInput, setNightlyRateInput] = useState(() => {
    const v = initialData?.customNightlyRate;
    return typeof v === 'number' && v > 0 ? String(v) : '';
  });

  // New Extra Input State
  const [newExtraName, setNewExtraName] = useState('');
  const [newExtraAmount, setNewExtraAmount] = useState('');

  // 3-Click Critical Pricing Logic
  const [confirmStep, setConfirmStep] = useState(0);
  const [isLogging, setIsLogging] = useState(false);

  // Info banner state
  const [showCustomPriceInfo, setShowCustomPriceInfo] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchTax = async () => {
      const { data } = await supabase
        .from('unit_types')
        .select('hotel:hotels(tax_rate)')
        .eq('id', unitType.id)
        .single();
      const rate = Number((data as any)?.hotel?.tax_rate ?? 0.15);
      if (mounted) setTaxRate(rate);
    };
    fetchTax();
    return () => {
      mounted = false;
    };
  }, [unitType.id]);

  // Calculations
  const originalSubtotal = calculation.totalPrice;
  const customTotal = useCustomPrice && pricingMode === 'custom_total' && customPriceInput ? (parseFloat(customPriceInput) || 0) : null;
  const customRate = useCustomPrice && pricingMode === 'custom_nightly' && nightlyRateInput ? (parseFloat(nightlyRateInput) || 0) : null;

  // Calculate duration in months for calculator display
  const monthlyDetails = useMemo(() => {
    if (bookingType === 'daily') return null;
    
    const annualPrice = unitType.annual_price || 0;
    const baseMonthlyRate = annualPrice > 0 ? annualPrice / 12 : 0;
    const monthsCount = baseMonthlyRate > 0 ? Math.round(originalSubtotal / baseMonthlyRate) : 0;
    
    // If custom price is active and we are in "rate" mode (custom_nightly), use custom rate
    const activeMonthlyRate = (useCustomPrice && pricingMode === 'custom_nightly' && customRate != null)
        ? customRate
        : baseMonthlyRate;

    return {
        rate: activeMonthlyRate,
        months: monthsCount,
        total: (useCustomPrice && pricingMode === 'custom_nightly' && customRate != null)
            ? customRate * monthsCount
            : originalSubtotal
    };
  }, [originalSubtotal, unitType.annual_price, useCustomPrice, pricingMode, customRate]);

  const computedSubtotal =
    customTotal != null ? customTotal :
    (bookingType === 'daily' && customRate != null) ? customRate * (calculation.nights || 0) :
    (customRate != null) ? customRate * (monthlyDetails?.months || 0) :
    originalSubtotal;
  const subtotal = computedSubtotal;
  
  // Price Validation
  let priceWarning: string | null = null;
  if (useCustomPrice && subtotal > 0 && originalSubtotal > 0) {
      const ratio = subtotal / originalSubtotal;
      if (ratio < 0.7) priceWarning = t('السعر مره منخفض', 'Price is too low');
      else if (ratio > 1.3) priceWarning = t('السعر مره عالي', 'Price is too high');
  }
  
  const discountAmount = discountType === 'amount' 
    ? discountValue 
    : (subtotal * discountValue) / 100;

  const extrasTotal = extras.reduce((sum, extra) => sum + extra.amount, 0);
  
  const taxableAmount = Math.max(0, subtotal - discountAmount + extrasTotal);
  const taxAmount = taxableAmount * taxRate;
  const finalTotal = taxableAmount + taxAmount;

  // Critical Pricing Detection Logic
  const isPriceCritical = useMemo(() => {
    if (originalSubtotal <= 0) return false;
    
    // Rule 1: Final total is less than 60% of expected original subtotal
    if (finalTotal < (originalSubtotal * 0.6)) return true;
    
    // Rule 2: Monthly booking with very low total (e.g. 6 months but total is less than 1.5 months worth)
    if (bookingType !== 'daily' && monthlyDetails && monthlyDetails.months > 1) {
        const expectedMin = monthlyDetails.rate * 1.5;
        if (finalTotal < expectedMin) return true;
    }

    // Rule 3: Extreme discount (> 40%)
    if (discountType === 'percent' && discountValue > 40) return true;
    if (discountType === 'amount' && discountValue > (subtotal * 0.4)) return true;

    return false;
  }, [finalTotal, originalSubtotal, bookingType, monthlyDetails, discountType, discountValue, subtotal]);

  // Reset steps if price changes and is no longer critical or if it becomes critical again
  useEffect(() => {
    setConfirmStep(0);
  }, [finalTotal]);

  const handleAddExtra = () => {
    if (!newExtraName || !newExtraAmount) return;
    const amount = parseFloat(newExtraAmount);
    if (isNaN(amount) || amount <= 0) return;

    setExtras([...extras, {
      id: Math.random().toString(36).substr(2, 9),
      name: newExtraName,
      amount
    }]);
    setNewExtraName('');
    setNewExtraAmount('');
  };

  const removeExtra = (id: string) => {
    setExtras(extras.filter(e => e.id !== id));
  };

  const handleNext = async () => {
    // If price is critical and we haven't finished the 3 clicks
    if (isPriceCritical && confirmStep < 2) {
        if (confirmStep === 0) {
            // Click 1: Log event
            setIsLogging(true);
            try {
                const { data: { user } } = await supabase.auth.getUser();
                await supabase.from('system_events').insert({
                    event_type: 'risky_pricing_detected',
                    message: `تم اكتشاف سعر حرج: مبلغ ${finalTotal.toLocaleString()} ر.س لحجز مدته ${bookingType === 'daily' ? calculation.nights + ' ليلة' : (monthlyDetails?.months || '?') + ' أشهر'}`,
                    payload: {
                        final_total: finalTotal,
                        original_subtotal: originalSubtotal,
                        duration: bookingType === 'daily' ? calculation.nights : monthlyDetails?.months,
                        duration_type: bookingType,
                        discount_value: discountValue,
                        discount_type: discountType,
                        actor_id: user?.id || null,
                        actor_email: user?.email || null
                    }
                });
                setConfirmStep(1);
            } catch (err) {
                console.error('Failed to log risky pricing:', err);
                // Even if logging fails, allow user to proceed to next step to avoid blocking
                setConfirmStep(1);
            } finally {
                setIsLogging(false);
            }
            return;
        }

        if (confirmStep === 1) {
            // Click 2: Sound/Vibrate + Message
            if (typeof window !== 'undefined') {
                // Vibration (if supported)
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                
                // Sound (Beep)
                const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const oscillator = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                oscillator.connect(gain);
                gain.connect(audioCtx.destination);
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
                gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
                oscillator.start();
                oscillator.stop(audioCtx.currentTime + 0.2);
            }
            setConfirmStep(2);
            return;
        }
    }

    // Click 3 or Normal Price
    onNext({
      discountType,
      discountValue,
      discountAmount,
      extras,
      subtotal,
      taxAmount,
      totalAmount: taxableAmount,
      finalTotal,
      pricingMode: useCustomPrice ? pricingMode : 'default',
      customNightlyRate: useCustomPrice && pricingMode === 'custom_nightly' ? customRate : null,
      customTotal: useCustomPrice && pricingMode === 'custom_total' ? customTotal : null
    });
  };

  const displayedBreakdown =
    useCustomPrice && pricingMode === 'custom_nightly' && customRate != null
      ? calculation.breakdown.map((item) => ({ ...item, price: customRate, isSeason: false }))
      : calculation.breakdown;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {showCustomPriceInfo && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl p-5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-blue-100 rounded-xl">
              <Edit3 size={20} className="text-blue-600" />
            </div>
            <span className="text-sm font-bold leading-relaxed">
              {t('يمكنك تفعيل أو تعديل السعر المخصص لهذا الحجز من خلال قسم تفاصيل الإقامة.','You can enable or edit a custom price for this booking inside stay details.')}
            </span>
          </div>
          <button onClick={() => setShowCustomPriceInfo(false)} className="text-blue-400 hover:text-blue-600 transition-colors p-1.5">
            <X size={20} />
          </button>
        </div>
      )}

      {/* Main Container: Consolidated Stay Details */}
      <div className="bg-white border border-gray-100 rounded-[2.5rem] overflow-hidden shadow-xl shadow-gray-100/50">
        {/* Header */}
        <div className="bg-gray-50/50 px-8 py-7 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Receipt size={28} />
            </div>
            <div>
              <h3 className="font-black text-xl text-gray-900">تفاصيل الإقامة والتسعير</h3>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Stay & Pricing Details</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {bookingType === 'daily' ? (
              <span className="text-sm font-black text-blue-700 bg-blue-50 px-5 py-2 rounded-full border border-blue-100">
                {calculation.nights} ليلة
              </span>
            ) : (
              <span className="text-sm font-black text-indigo-700 bg-indigo-50 px-5 py-2 rounded-full border border-indigo-100">
                حجز {bookingType === 'yearly' ? 'سنوي' : 'شهري'}
              </span>
            )}
          </div>
        </div>

        <div className="p-8 space-y-8">
          {/* 1. Calculator or Breakdown */}
          {bookingType !== 'daily' && monthlyDetails ? (
            <div className="bg-gradient-to-br from-gray-50/50 to-white p-8 rounded-[2rem] border border-gray-100">
              <div className="max-w-md mx-auto">
                <div className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-8 text-center italic">Rental Calculator • حاسبة الإيجار</div>
                
                <div className="flex items-center justify-between gap-6 p-10 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/30 rounded-full blur-3xl -mr-16 -mt-16"></div>
                  
                  <div className="flex-1 text-center">
                    <div className="text-xs font-black text-gray-400 mb-3 uppercase tracking-tighter">قيمة الشهر</div>
                    <div className="text-3xl font-black text-gray-900 tracking-tight">
                      {monthlyDetails.rate.toLocaleString()}
                      <span className="text-xs text-gray-400 font-normal mr-1">ر.س</span>
                    </div>
                  </div>

                  <div className="text-gray-200">
                    <X size={20} strokeWidth={4} />
                  </div>

                  <div className="flex-1 text-center">
                    <div className="text-xs font-black text-gray-400 mb-3 uppercase tracking-tighter">عدد الأشهر</div>
                    <div className="text-3xl font-black text-blue-600 tracking-tight">
                      {monthlyDetails.months}
                      <span className="text-xs text-gray-400 font-normal mr-1">أشهر</span>
                    </div>
                  </div>

                  <div className="text-gray-200">
                    <span className="text-3xl font-black">=</span>
                  </div>

                  <div className="flex-1 text-center">
                    <div className="text-xs font-black text-gray-400 mb-3 uppercase tracking-tighter">الإجمالي</div>
                    <div className="text-3xl font-black text-emerald-600 tracking-tight">
                      {monthlyDetails.total.toLocaleString()}
                      <span className="text-xs text-gray-400 font-normal mr-1">ر.س</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/50 text-gray-400 font-bold sticky top-0">
                  <tr>
                    <th className="px-6 py-5 text-right uppercase tracking-widest text-xs">التاريخ</th>
                    <th className="px-6 py-5 text-right uppercase tracking-widest text-xs">نوع السعر</th>
                    <th className="px-6 py-5 text-left uppercase tracking-widest text-xs">المبلغ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {displayedBreakdown.map((item, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/20 transition-colors">
                      <td className="px-6 py-5 text-gray-700 font-bold" dir="ltr">{item.date}</td>
                      <td className="px-6 py-5">
                        {item.isSeason ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 text-orange-600 text-xs font-black border border-orange-100">
                            <Coins size={12} />
                            موسمي
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs font-bold uppercase tracking-tighter opacity-60">Default</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-left font-black text-gray-900 text-base">
                        {item.price.toLocaleString()} <span className="text-xs text-gray-400 font-normal">ر.س</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 2. Compact Grid: Custom Price & Discounts Side-by-Side (Force 2 columns even on small screens) */}
          <div className="grid grid-cols-2 gap-4">
            {/* Custom Price Card */}
            <div className={`p-6 rounded-[1.5rem] border-2 transition-all duration-300 flex flex-col ${useCustomPrice ? 'bg-orange-50/50 border-orange-200 shadow-sm' : 'bg-white border-gray-100'}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${useCustomPrice ? 'bg-orange-600 text-white shadow-sm' : 'bg-orange-50 text-orange-600'}`}>
                    <Edit3 size={18} />
                  </div>
                  <h4 className="font-black text-sm text-gray-900 tracking-tighter leading-none">سعر مخصص</h4>
                </div>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <div className={`w-10 h-5 rounded-full p-0.5 transition-all duration-300 ${useCustomPrice ? 'bg-orange-600' : 'bg-gray-200'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full transition-all duration-300 transform ${useCustomPrice ? 'mr-5' : 'mr-0'}`}></div>
                  </div>
                  <input 
                    type="checkbox" 
                    className="hidden" 
                    checked={useCustomPrice}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUseCustomPrice(checked);
                      if (checked) setPricingMode(bookingType === 'daily' ? 'custom_nightly' : 'custom_total');
                    }}
                  />
                </label>
              </div>

              {useCustomPrice ? (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 flex-1 flex flex-col justify-end">
                  <div className="flex bg-white/80 backdrop-blur-md p-1 rounded-lg border border-orange-100 shadow-sm">
                    <button
                      onClick={() => setPricingMode('custom_nightly')}
                      className={`flex-1 py-1.5 text-xs font-black rounded-md transition-all uppercase tracking-tighter ${pricingMode === 'custom_nightly' ? 'bg-orange-600 text-white shadow-md' : 'text-gray-400'}`}
                    >
                      {bookingType === 'daily' ? 'ليلة' : 'شهر'}
                    </button>
                    <button
                      onClick={() => setPricingMode('custom_total')}
                      className={`flex-1 py-1.5 text-xs font-black rounded-md transition-all uppercase tracking-tighter ${pricingMode === 'custom_total' ? 'bg-orange-600 text-white shadow-md' : 'text-gray-400'}`}
                    >
                      إجمالي
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={pricingMode === 'custom_nightly' ? nightlyRateInput : customPriceInput}
                      onChange={(e) => pricingMode === 'custom_nightly' ? setNightlyRateInput(e.target.value) : setCustomPriceInput(e.target.value)}
                      placeholder="0"
                      className="w-full px-4 py-3 bg-white border-2 border-orange-100 rounded-xl text-base font-black text-gray-900 focus:ring-2 focus:ring-orange-500/5 focus:border-orange-500 outline-none transition-all pr-12"
                    />
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">ر.س</span>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-100 rounded-xl min-h-[90px]">
                  <span className="text-xs text-gray-300 font-bold uppercase tracking-widest text-center">Default</span>
                </div>
              )}
            </div>

            {/* Discount Card */}
            <div className={`p-6 rounded-[1.5rem] border-2 transition-all duration-300 flex flex-col ${discountValue > 0 ? 'bg-purple-50/50 border-purple-200 shadow-sm' : 'bg-white border-gray-100'}`}>
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${discountValue > 0 ? 'bg-purple-600 text-white shadow-sm' : 'bg-purple-50 text-purple-600'}`}>
                  <Percent size={18} />
                </div>
                <h4 className="font-black text-sm text-gray-900 tracking-tighter leading-none">الخصومات</h4>
              </div>

              <div className="space-y-3 flex-1 flex flex-col justify-end">
                <div className="flex bg-white/80 backdrop-blur-md p-1 rounded-lg border border-purple-100 shadow-sm">
                  <button
                    onClick={() => setDiscountType('amount')}
                    className={`flex-1 py-1.5 text-xs font-black rounded-md transition-all uppercase tracking-tighter ${discountType === 'amount' ? 'bg-purple-600 text-white shadow-md' : 'text-gray-400'}`}
                  >
                    مبلغ
                  </button>
                  <button
                    onClick={() => setDiscountType('percent')}
                    className={`flex-1 py-1.5 text-xs font-black rounded-md transition-all uppercase tracking-tighter ${discountType === 'percent' ? 'bg-purple-600 text-white shadow-md' : 'text-gray-400'}`}
                  >
                    نسبة
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={discountValue}
                    onChange={e => setDiscountValue(Math.max(0, Number(e.target.value)))}
                    className="w-full px-4 py-3 bg-white border-2 border-purple-100 rounded-xl text-base font-black text-gray-900 focus:ring-2 focus:ring-purple-500/5 focus:border-purple-500 outline-none transition-all pr-12"
                    placeholder="0"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-black">
                    {discountType === 'amount' ? 'ر.س' : '%'}
                  </span>
                </div>
                {discountAmount > 0 && (
                  <div className="text-xs font-black text-purple-700 bg-white/50 px-3 py-1.5 rounded-lg border border-purple-100 flex justify-between items-center">
                    <span>الخصم:</span>
                    <span>-{discountAmount.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 3. Extras & Final Summary Side-by-Side (Force 2 columns even on small screens) */}
          <div className="grid grid-cols-2 gap-4">
            {/* Extras & Services Section */}
            <div className="bg-gray-50/50 rounded-[1.5rem] p-5 border border-gray-100 flex flex-col min-h-[220px]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-sm">
                    <Plus size={18} />
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-gray-900 leading-none">إضافات</h4>
                  </div>
                </div>
              </div>

              <div className="space-y-4 flex-1 flex flex-col">
                {/* Quick Addons Icons */}
                <div className="flex flex-wrap gap-2">
                  {quickAddons.map((addon, idx) => {
                    const isAdded = extras.some(e => e.name === addon.name);
                    return (
                      <button
                        key={idx}
                        onClick={() => handleAddQuick(addon.name, addon.amount)}
                        disabled={isAdded}
                        title={`${addon.name} (${addon.amount} ر.س)`}
                        className={`
                          p-2.5 rounded-xl border-2 transition-all
                          ${isAdded 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-600' 
                            : 'bg-white border-gray-100 text-gray-400 hover:border-emerald-200'
                          }
                        `}
                      >
                        {React.cloneElement(addon.icon as React.ReactElement<any>, { size: 18 })}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setShowCommissionInput(!showCommissionInput)}
                    className={`p-2.5 rounded-xl border-2 transition-all ${showCommissionInput ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-gray-100 text-gray-400 hover:border-orange-200'}`}
                  >
                    <HandCoins size={18} />
                  </button>
                </div>

                {showCommissionInput && (
                  <div className="flex gap-2 animate-in fade-in slide-in-from-top-2">
                    <input
                      type="number"
                      placeholder="عمولة..."
                      className="flex-1 px-3 py-2 bg-white border border-orange-100 rounded-xl text-xs font-black outline-none"
                      value={commissionValue}
                      onChange={e => setCommissionValue(e.target.value)}
                    />
                    <button onClick={handleAddCommission} className="bg-orange-600 text-white px-3 py-2 rounded-xl text-xs font-black">إضافة</button>
                  </div>
                )}

                {/* List of Added Extras (Mini) */}
                <div className="space-y-1.5 max-h-[80px] overflow-y-auto pr-1 flex-1">
                  {extras.map((extra) => (
                    <div key={extra.id} className="flex justify-between items-center px-3 py-2 bg-white rounded-xl border border-gray-100 group">
                      <span className="font-bold text-xs text-gray-600 truncate max-w-[80px]">{extra.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-xs text-gray-900">{extra.amount}</span>
                        <button onClick={() => removeExtra(extra.id)} className="text-gray-300 hover:text-rose-500"><X size={14} /></button>
                      </div>
                    </div>
                  ))}
                  {extras.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center py-4 opacity-10">
                      <Zap size={24} />
                    </div>
                  )}
                </div>

                {/* Manual Mini Input */}
                <div className="flex gap-2 pt-2 mt-auto">
                  <input
                    type="text"
                    placeholder="وصف..."
                    className="flex-1 px-3 py-2 bg-white border border-gray-100 rounded-xl text-xs font-bold outline-none"
                    value={newExtraName}
                    onChange={e => setNewExtraName(e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="0"
                    className="w-14 px-3 py-2 bg-white border border-gray-100 rounded-xl text-xs font-bold outline-none"
                    value={newExtraAmount}
                    onChange={e => setNewExtraAmount(e.target.value)}
                  />
                  <button onClick={handleAddExtra} className="bg-gray-900 text-white p-2 rounded-xl"><Plus size={16} /></button>
                </div>
              </div>
            </div>

            {/* 4. Final Summary Card */}
            <div className="bg-gray-950 text-white rounded-[1.5rem] p-6 shadow-2xl relative overflow-hidden border border-white/10 flex flex-col justify-between min-h-[220px]">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-[50px] -mr-16 -mt-16 pointer-events-none"></div>
              
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center border border-white/10 backdrop-blur-md">
                      <Calculator size={18} className="text-blue-400" />
                    </div>
                    <h3 className="font-black text-sm text-gray-100 leading-none">الحساب النهائي</h3>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-gray-500 italic">الإقامة</span>
                    <span className="text-gray-200">{subtotal.toLocaleString()}</span>
                  </div>
                  
                  {extrasTotal > 0 && (
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="text-gray-500 italic">إضافات</span>
                      <span className="text-emerald-400">+{extrasTotal.toLocaleString()}</span>
                    </div>
                  )}

                  {discountAmount > 0 && (
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="text-gray-500 italic">خصم</span>
                      <span className="text-rose-400">-{discountAmount.toLocaleString()}</span>
                    </div>
                  )}

                  <div className="h-px bg-white/5 my-2"></div>

                  <div className="flex justify-between items-center text-[10px] font-black text-gray-500 uppercase tracking-tighter">
                    <span>الضريبة</span>
                    <span className="text-gray-300">{taxAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <span className="text-gray-500 text-[10px] font-black uppercase">الإجمالي</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="text-[10px] text-emerald-500 font-black uppercase tracking-tighter">صافي</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-black text-white tracking-tighter leading-none mb-1">
                      {finalTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                    <span className="text-xs text-gray-500 font-black uppercase">ر.س</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Actions */}
      <div className="flex flex-col gap-4 pt-4 pb-10">
        {/* Critical Price Warning Message */}
        {isPriceCritical && confirmStep > 0 && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 flex items-start gap-5 animate-in fade-in slide-in-from-bottom-2 duration-500 shadow-sm">
            <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md shadow-amber-200 animate-pulse">
              <AlertTriangle size={24} />
            </div>
            <div className="space-y-1.5">
              <h5 className="font-black text-sm text-amber-900">تنبيه: السعر المدخل غير منطقي!</h5>
              <p className="text-xs text-amber-700 leading-relaxed font-bold">
                {confirmStep === 1 
                  ? "تم تسجيل هذه العملية كحدث حرج في النظام. يرجى المراجعة بدقة قبل التأكيد."
                  : "السعر المدخل منخفض جداً مقارنة بمدة الإقامة والسعر الأصلي. تأكد من أن الحسابات صحيحة لتجنب الأخطاء المالية."}
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={onBack}
            className="flex-1 bg-white border-2 border-gray-100 text-gray-600 py-5 rounded-[1.5rem] font-black text-base hover:bg-gray-50 hover:border-gray-200 transition-all flex items-center justify-center gap-3 group shadow-sm"
          >
            <ArrowRight size={24} className="group-hover:-translate-x-1 transition-transform" />
            <span>رجوع</span>
          </button>
          <button
            onClick={handleNext}
            disabled={isLogging}
            className={`
              flex-[2] relative py-5 rounded-[1.5rem] font-black text-base transition-all overflow-hidden flex items-center justify-center gap-3 group shadow-xl
              ${isPriceCritical 
                ? (confirmStep === 0 ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-amber-200' : 
                   confirmStep === 1 ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-orange-200' : 
                   'bg-rose-600 text-white hover:bg-rose-700 shadow-rose-200')
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
              }
            `}
          >
            {/* Progress Fill Background */}
            {isPriceCritical && confirmStep > 0 && (
              <div 
                className="absolute inset-0 bg-white/20 transition-all duration-700 ease-out pointer-events-none"
                style={{ width: confirmStep === 1 ? '20%' : confirmStep === 2 ? '50%' : '0%' }}
              />
            )}

            <span className="relative z-10">
              {isLogging ? (
                <div className="flex items-center gap-2">
                  <Sparkles size={20} className="animate-spin" />
                  <span>جاري التسجيل...</span>
                </div>
              ) : isPriceCritical ? (
                confirmStep === 0 ? 'تأكيد السعر الحرج' : 
                confirmStep === 1 ? 'هل أنت متأكد؟ (نقرة ثانية)' : 
                'نقرة أخيرة للمتابعة'
              ) : (
                'تأكيد ومتابعة للدفع'
              )}
            </span>
            {!isLogging && <ArrowRight size={24} className="rotate-180 group-hover:translate-x-1 transition-transform relative z-10" />}
          </button>
        </div>
      </div>
    </div>
  );
};
