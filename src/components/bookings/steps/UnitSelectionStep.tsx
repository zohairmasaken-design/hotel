import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { UnitType, PricingRule, calculateStayPrice, PriceCalculation } from '@/lib/pricing';
import { Calendar, Users, Info, Check, ArrowRight, Loader2, BedDouble, Ruler, Star, Building2, AlertCircle, Plus, X, Minus, Pencil, User } from 'lucide-react';
import { format, addDays, addMonths, differenceInCalendarDays, parseISO, isBefore, startOfToday } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { useAppLanguage } from '@/hooks/useAppLanguage';

import { Unit } from '../BookingWizard';
import type { Customer } from './CustomerStep';

interface Hotel {
  id: string;
  name: string;
}

type UnitWithHotel = Unit & { hotel?: { name: string } };

interface UnitSelectionStepProps {
  onNext: (data: { unitType: UnitType; unit: Unit; startDate: Date; endDate: Date; calculation: PriceCalculation; bookingType: 'daily' | 'monthly' | 'yearly'; customerPreferences?: string; companions?: Array<{ name: string; national_id?: string }> }) => void;
  onBack: () => void;
  initialData?: {
    unitType?: UnitType;
    startDate?: Date;
    endDate?: Date;
    bookingType?: 'daily' | 'monthly' | 'yearly';
    durationMonths?: number;
    durationDays?: number;
  };
  selectedCustomer?: Customer;
  initialUnitId?: string;
  language?: 'ar' | 'en';
}

export const UnitSelectionStep: React.FC<UnitSelectionStepProps> = ({ onNext, onBack, initialData, selectedCustomer, initialUnitId, language: languageProp }) => {
  const { language: storedLanguage } = useAppLanguage();
  const language = languageProp ?? storedLanguage;
  const t = (arText: string, enText: string) => (language === 'en' ? enText : arText);
  const lockedPrefill = Boolean(initialUnitId && initialUnitId.trim() && initialData?.startDate && initialData?.endDate);
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<string>('all');
  
  const [startDate, setStartDate] = useState<string>(
    initialData?.startDate ? format(initialData.startDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState<string>(
    initialData?.endDate ? format(initialData.endDate, 'yyyy-MM-dd') : format(addDays(new Date(), 1), 'yyyy-MM-dd')
  );
  
  const [selectedType, setSelectedType] = useState<UnitType | null>(initialData?.unitType || null);
  const [availableUnits, setAvailableUnits] = useState<UnitWithHotel[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<UnitWithHotel | null>(null);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [tempResMap, setTempResMap] = useState<Map<string, { name: string; date: string }>>(new Map());
  const [checkoutTodayMap, setCheckoutTodayMap] = useState<Set<string>>(new Set());

  const [bookingType, setBookingType] = useState<'daily' | 'monthly' | 'yearly'>(initialData?.bookingType || 'monthly');
  const [durationMonths, setDurationMonths] = useState<number>(initialData?.durationMonths ?? (bookingType === 'yearly' ? 12 : 1));
  const [durationDays, setDurationDays] = useState<number>(() => {
    if (initialData?.durationDays != null) return Math.max(1, initialData.durationDays);
    if (bookingType !== 'daily') return 1;
    const diff = differenceInCalendarDays(parseISO(endDate), parseISO(startDate));
    return diff > 0 ? diff : 1;
  });
  const lastDailyChangeRef = useRef<'init' | 'days' | 'startDate' | 'endDate'>('init');
  
  // Review Mode Logic
  const [isReviewMode, setIsReviewMode] = useState<boolean>(lockedPrefill);
  const [showCustomerDetails, setShowCustomerDetails] = useState<boolean>(false);
  const [showDates, setShowDates] = useState<boolean>(false);
  const [showUnitTypes, setShowUnitTypes] = useState<boolean>(false);
  const lockAutoDates = lockedPrefill && !showDates && !isReviewMode;
  const [customerInfo, setCustomerInfo] = useState<{ full_name?: string; phone?: string; details?: string } | null>(null);
  const [customerPreferences, setCustomerPreferences] = useState<string>('');
  const [enableCompanions, setEnableCompanions] = useState<boolean>(false);
  const [companions, setCompanions] = useState<Array<{ name: string; national_id?: string }>>([]);
  
  useEffect(() => {
    if (lockAutoDates) return;
    if (startDate && (bookingType === 'yearly' || bookingType === 'monthly')) {
      setEndDate(format(addMonths(parseISO(startDate), durationMonths), 'yyyy-MM-dd'));
    }
  }, [bookingType, startDate, durationMonths, lockAutoDates]);

  useEffect(() => {
    if (lockAutoDates) return;
    if (bookingType !== 'daily') return;
    if (!startDate) return;
    const start = parseISO(startDate);
    const safeDays = Math.max(1, durationDays || 1);

    if (lastDailyChangeRef.current === 'endDate') {
      if (!endDate) return;
      const diff = differenceInCalendarDays(parseISO(endDate), start);
      if (diff < 1) {
        const nextEnd = format(addDays(start, 1), 'yyyy-MM-dd');
        if (endDate !== nextEnd) setEndDate(nextEnd);
        if (durationDays !== 1) setDurationDays(1);
        lastDailyChangeRef.current = 'days';
        return;
      }
      if (durationDays !== diff) setDurationDays(diff);
      return;
    }

    const nextEnd = format(addDays(start, safeDays), 'yyyy-MM-dd');
    if (endDate !== nextEnd) setEndDate(nextEnd);
  }, [bookingType, startDate, endDate, durationDays, lockAutoDates]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // Fetch Unit Types
      const { data: types, error: typesError } = await supabase
        .from('unit_types')
        .select('*, hotel:hotels(name)');
        
      if (typesError) console.error('Error fetching unit types:', typesError);

      // Fetch Pricing Rules
      const { data: rules, error: rulesError } = await supabase
        .from('pricing_rules')
        .select('*')
        .eq('active', true);

      if (rulesError) console.error('Error fetching pricing rules:', rulesError);

      // Fetch Hotels
      const { data: hotelsData, error: hotelsError } = await supabase
        .from('hotels')
        .select('id, name')
        .order('name');
      if (hotelsError) console.error('Error fetching hotels:', hotelsError);

      if (types) setUnitTypes(types);
      if (rules) setPricingRules(rules);
      if (hotelsData) setHotels(hotelsData);
      
      // Preselect unit type and hotel based on initialUnitId
      if (initialUnitId && initialUnitId.trim()) {
        const { data: initialUnit } = await supabase
          .from('units')
          .select('id, unit_type_id, hotel_id, unit_number, floor, status, hotel:hotels(name)')
          .eq('id', initialUnitId.trim())
          .maybeSingle();
        if (initialUnit) {
          if (initialUnit.hotel_id) setSelectedHotelId(initialUnit.hotel_id);
          const t = (types || []).find((tt: any) => tt.id === (initialUnit as any).unit_type_id) || null;
          if (t) setSelectedType(t);
        }
      }
      
      setLoading(false);
    };

    fetchData();
  }, []);

  useEffect(() => {
    const loadCustomer = async () => {
      if (!selectedCustomer?.id) {
        setCustomerInfo(null);
        setCustomerPreferences('');
        return;
      }
      if (selectedCustomer.details || selectedCustomer.full_name || selectedCustomer.phone) {
        setCustomerInfo({
          full_name: selectedCustomer.full_name,
          phone: selectedCustomer.phone,
          details: selectedCustomer.details || ''
        });
        const prefLine = (selectedCustomer.details || '').split('\n').find(l => /^(?:تفضيل|يفضل|Preference)/i.test(l.trim()));
        setCustomerPreferences(prefLine ? prefLine.replace(/^(?:تفضيل|يفضل|Preference)\s*[:\-]?\s*/i, '').trim() : '');
        return;
      }
      const { data } = await supabase
        .from('customers')
        .select('full_name, phone, details')
        .eq('id', selectedCustomer.id)
        .single();
      if (data) {
        setCustomerInfo({
          full_name: data.full_name,
          phone: data.phone,
          details: (data as any).details || ''
        });
        const prefLine = ((data as any).details || '').split('\n').find((l: string) => /^(?:تفضيل|يفضل|Preference)/i.test(l.trim()));
        setCustomerPreferences(prefLine ? prefLine.replace(/^(?:تفضيل|يفضل|Preference)\s*[:\-]?\s*/i, '').trim() : '');
      } else {
        setCustomerInfo(null);
        setCustomerPreferences('');
      }
    };
    loadCustomer();
  }, [selectedCustomer?.id]);

  // Fetch available units when selectedType or dates change
  useEffect(() => {
    const fetchUnits = async () => {
      if (!selectedType || !startDate || !endDate) {
        setAvailableUnits([]);
      setSelectedUnit(prev => prev);
        return;
      }

      setLoadingUnits(true);
      setSelectedUnit(prev => prev); // keep previous until list refreshes

      try {
        let unitsQuery = supabase
          .from('units')
          .select('id, unit_number, floor, status, hotel_id, hotel:hotels(name)')
          .eq('unit_type_id', selectedType.id);
        if (selectedHotelId !== 'all') {
          unitsQuery = unitsQuery.eq('hotel_id', selectedHotelId);
        }
        const { data: units, error: unitsError } = await unitsQuery;

        if (unitsError) throw unitsError;

        if (!units || units.length === 0) {
          setAvailableUnits([]);
          setLoadingUnits(false);
          return;
        }

        // 2. Fetch bookings that overlap with requested dates
        // Overlap: (booking.check_in < req_end) AND (booking.check_out >= req_start)
        // Note: we use >= startDate for check_out to capture "Checkout Today" scenarios
        let bookingsQuery = supabase
          .from('bookings')
          .select('unit_id, check_out, units!inner(unit_type_id, hotel_id)')
          .eq('units.unit_type_id', selectedType.id)
          .in('status', ['confirmed', 'checked_in', 'pending_deposit'])
          .lt('check_in', endDate)
          .gte('check_out', startDate);
        if (selectedHotelId !== 'all') {
          bookingsQuery = bookingsQuery.eq('units.hotel_id', selectedHotelId);
        }
        const { data: bookings, error: bookingsError } = await bookingsQuery;

        if (bookingsError) throw bookingsError;

        // 3. Filter units
        const bookedUnitIds = new Set<string>();
        const checkoutTodayIds = new Set<string>();
        
        bookings?.forEach((b: any) => {
            if (b.check_out === startDate) {
                checkoutTodayIds.add(b.unit_id);
            } else if (b.check_out > startDate) {
                bookedUnitIds.add(b.unit_id);
            }
        });

        setCheckoutTodayMap(checkoutTodayIds);

        const available = (units as unknown as UnitWithHotel[])
          .filter(u => !bookedUnitIds.has(u.id));

        const unitIds = (units as any[]).map(u => u.id);
        const { data: tempRes } = await supabase
          .from('temporary_reservations')
          .select('unit_id, customer_name, reserve_date')
          .in('unit_id', unitIds)
          .gte('reserve_date', startDate)
          .lt('reserve_date', endDate);
        const tempMap = new Map<string, { name: string; date: string }>();
        (tempRes || []).forEach((t: any) => {
          const prev = tempMap.get(t.unit_id);
          if (!prev || (t.reserve_date < prev.date)) {
            tempMap.set(t.unit_id, { name: t.customer_name, date: t.reserve_date });
          }
        });
        setTempResMap(tempMap);

        setAvailableUnits(available);
        
        // Preselect initial unit if present
        if (initialUnitId && initialUnitId.trim()) {
          const pre = (available as UnitWithHotel[]).find(u => u.id === initialUnitId.trim());
          if (pre) setSelectedUnit(pre);
        }
      } catch (err) {
        console.error('Error fetching units:', err);
      } finally {
        setLoadingUnits(false);
      }
    };

    fetchUnits();
  }, [selectedType, startDate, endDate, selectedHotelId]);

  useEffect(() => {
    if (!initialUnitId || !initialUnitId.trim()) return;
    if (selectedUnit) return;
    const found = (availableUnits || []).find(u => u.id === initialUnitId.trim()) || null;
    if (found) setSelectedUnit(found);
  }, [availableUnits, initialUnitId, selectedUnit]);

  const handleNext = () => {
    if (!selectedType || !selectedUnit || !startDate || !endDate) return;
    
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    
    // Validate dates
    if (isBefore(end, start) || differenceInCalendarDays(end, start) < 1) {
      alert(t('تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول', 'Check-out must be after check-in'));
      return;
    }

    let calculation: PriceCalculation;
    
    if (bookingType === 'yearly' || bookingType === 'monthly') {
        const annualPrice = selectedType.annual_price || 0;
        if (annualPrice === 0) {
            alert('عذراً، هذا النموذج لا يحتوي على سعر سنوي محدد');
            return;
        }
        
        // Calculate price based on number of months (Annual Price / 12 * Months)
        const monthlyRate = annualPrice / 12;
        const months = Math.max(1, durationMonths);
        const totalPrice = monthlyRate * months;
        
        calculation = {
            totalPrice: totalPrice,
            basePrice: annualPrice, // Keep original annual price as base
            nights: differenceInCalendarDays(end, start),
            breakdown: [{
                date: startDate,
                price: totalPrice,
                isSeason: false
            }]
        };
    } else {
        calculation = calculateStayPrice(selectedType, pricingRules, start, end);
    }
    
    onNext({
      unitType: selectedType,
      unit: selectedUnit,
      startDate: start,
      endDate: end,
      calculation,
      bookingType,
      customerPreferences: customerPreferences?.trim() ? customerPreferences.trim() : undefined,
      companions: enableCompanions && companions.length > 0 ? companions.filter(c => c.name && c.name.trim().length > 0) : undefined
    });
  };

  const getPriceDisplay = (type: UnitType) => {
    if (bookingType === 'yearly' || bookingType === 'monthly') {
        const annualPrice = type.annual_price || 0;
        const monthlyRate = annualPrice / 12;
        const months = durationMonths;
        const totalPrice = monthlyRate * months;

        return (
            <div className="text-left">
                <div className="text-2xl font-bold text-blue-600">
                    {totalPrice > 0 ? totalPrice.toLocaleString() : '-'} <span className="text-sm font-normal text-gray-500">ريال</span>
                </div>
                <div className="text-xs text-gray-500">
                    {months} أشهر ({Math.round(monthlyRate).toLocaleString()} ريال/شهر)
                </div>
            </div>
        );
    }

    if (startDate && endDate) {
      const start = parseISO(startDate);
      const end = parseISO(endDate);
      
      if (!isBefore(end, start) && differenceInCalendarDays(end, start) > 0) {
        const calc = calculateStayPrice(type, pricingRules, start, end);
        return (
          <div className="text-left">
            <div className="text-2xl font-bold text-blue-600">
              {calc.totalPrice.toLocaleString()} <span className="text-sm font-normal text-gray-500">ريال</span>
            </div>
            <div className="text-xs text-gray-500">
              {calc.nights} ليلة • {(calc.totalPrice / calc.nights).toFixed(0)} /ليلة
            </div>
          </div>
        );
      }
    }
    
    // Default display
    return (
      <div className="text-left">
        <div className="text-2xl font-bold text-gray-900">
          {type.daily_price?.toLocaleString() || '-'} <span className="text-sm font-normal text-gray-500">ريال</span>
        </div>
        <div className="text-xs text-gray-500">
          {t('سعر الليلة الافتراضي', 'Default nightly rate')}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={32} />
        <p className="text-gray-500">جاري تحميل الوحدات...</p>
      </div>
    );
  }

  const isLockedPrefill = Boolean(
    initialUnitId &&
      initialUnitId.trim() &&
      initialData?.startDate &&
      initialData?.endDate
  );
  const displayedUnits = availableUnits;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Review Mode Summary Card */}
      {isReviewMode && (
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 md:p-8 text-white shadow-xl shadow-blue-200/50 border border-blue-500/20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-md">
                  <User size={24} className="text-white" />
                </div>
                <div>
                  <div className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-0.5">العميل المحدد</div>
                  <h3 className="text-xl md:text-2xl font-black">{customerInfo?.full_name || '...'}</h3>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-blue-100/80 text-xs font-bold">
                    <Building2 size={14} />
                    وحدة رقم
                  </div>
                  <div className="text-lg font-black">{selectedUnit?.unit_number || '...'}</div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-blue-100/80 text-xs font-bold">
                    <Calendar size={14} />
                    فترة الإقامة
                  </div>
                  <div className="text-lg font-black">
                    {durationMonths > 0 ? `${durationMonths} شهر` : `${durationDays} ليلة`}
                  </div>
                </div>
                <div className="hidden md:block space-y-1">
                  <div className="flex items-center gap-2 text-blue-100/80 text-xs font-bold">
                    <Info size={14} />
                    التواريخ
                  </div>
                  <div className="text-sm font-bold opacity-90">
                    {startDate} ← {endDate}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex md:flex-col gap-3 md:border-r md:border-white/10 md:pr-6">
              <button
                type="button"
                onClick={() => {
                    setIsReviewMode(false);
                    setShowDates(true);
                    setShowUnitTypes(true);
                    setShowCustomerDetails(true);
                }}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 transition-all font-bold text-sm"
              >
                <Pencil size={14} />
                تعديل البيانات
              </button>
              <button
                type="button"
                onClick={() => setShowCustomerDetails(v => !v)}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl transition-all font-bold text-sm ${showCustomerDetails ? 'bg-white text-blue-700 shadow-lg' : 'bg-white/10 text-white border border-white/20 hover:bg-white/20'}`}
              >
                {showCustomerDetails ? 'إخفاء الملاحظات' : 'ملاحظات العميل'}
              </button>
            </div>
          </div>
          
          {/* Collapsible Customer Notes inside Summary */}
          {showCustomerDetails && customerInfo && (
            <div className="mt-6 pt-6 border-t border-white/10 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <div className="flex items-center gap-2 mb-3">
                        <AlertCircle size={16} className="text-blue-200" />
                        <span className="text-sm font-bold">تنبيهات وملاحظات العميل</span>
                    </div>
                    {customerInfo.details ? (
                        <p className="text-sm text-blue-50/90 leading-relaxed whitespace-pre-line">
                            {customerInfo.details}
                        </p>
                    ) : (
                        <p className="text-sm text-blue-50/60 italic">لا توجد ملاحظات مسجلة لهذا العميل.</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/5">
                        <div className="space-y-1">
                            <label className="text-[10px] text-blue-200/70 font-bold uppercase">رقم الجوال</label>
                            <div className="text-sm font-mono">{customerInfo.phone || '-'}</div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] text-blue-200/70 font-bold uppercase">تفضيلات الإقامة</label>
                            <input
                                type="text"
                                value={customerPreferences}
                                onChange={(e) => setCustomerPreferences(e.target.value)}
                                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:bg-white/20 outline-none transition-all"
                                placeholder="أدخل تفضيلات العميل هنا..."
                            />
                        </div>
                    </div>
                </div>
            </div>
          )}
        </div>
      )}

      {/* Standard Step Components (Hidden if Review Mode is active unless specifically toggled) */}
      {!isReviewMode && customerInfo && (
        <div className="border rounded-2xl p-4 shadow-sm bg-white">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-extrabold text-gray-900">تفاصيل العميل</div>
            {lockedPrefill && (
              <button
                type="button"
                onClick={() => setShowCustomerDetails((v) => !v)}
                className="text-xs px-3 py-1.5 rounded-lg border bg-gray-50 text-gray-700 hover:bg-gray-100"
              >
                {showCustomerDetails ? 'إخفاء' : 'إظهار'}
              </button>
            )}
          </div>
          {showCustomerDetails && (() => {
            const details = customerInfo.details || '';
            const negativeHints = ['سلب', 'تحذير', 'شكوى', 'تخريب', 'إزعاج', 'black', 'negative', 'متأخر', 'سرقة', 'تجاوز'];
            const hasNegative = negativeHints.some(k => details.toLowerCase().includes(k.toLowerCase()));
            const toneBox =
              hasNegative
                ? 'border-red-200 bg-red-50'
                : details.trim().length > 0
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-blue-100 bg-white';
            const toneTitle =
              hasNegative ? 'ملاحظات سلبية' : details.trim().length > 0 ? 'ملاحظات إيجابية/عامة' : 'لا توجد ملاحظات';
            const noteLines = details
              .split('\n')
              .map(l => l.trim())
              .filter(l => l.length > 0 && !/^(?:تفضيل|يفضل|Preference)/i.test(l));
            return (
              <div className={`border rounded-2xl p-4 shadow-sm ${toneBox}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className={hasNegative ? 'text-red-600' : 'text-emerald-600'} size={18} />
                    <h3 className={`font-bold ${hasNegative ? 'text-red-800' : 'text-emerald-800'}`}>{toneTitle}</h3>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-900 text-white">{customerInfo.full_name || 'عميل'}</span>
                </div>
                {noteLines.length > 0 ? (
                  <ul className="text-xs text-gray-800 list-disc pr-5 space-y-1">
                    {noteLines.slice(0, 5).map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-600">لا توجد ملاحظات مسجلة.</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">الجوال</div>
                    <div className="font-mono text-gray-800">{customerInfo.phone || '-'}</div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[11px] text-gray-600 mb-1 block">تفضيلات العميل</label>
                    <input
                      type="text"
                      value={customerPreferences}
                      onChange={(e) => setCustomerPreferences(e.target.value)}
                      placeholder="مثال: يفضل الأدوار العليا، سرير كبير، غرفة هادئة..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={enableCompanions}
                      onChange={(e) => setEnableCompanions(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="font-bold text-gray-800">إضافة مرافقين (اختياري)</span>
                  </label>
                  {enableCompanions && (
                    <div className="mt-3 space-y-2">
                      {companions.map((c, idx) => (
                        <div key={idx} className="grid grid-cols-1 md:grid-cols-7 gap-2 items-center">
                          <div className="md:col-span-3">
                            <input
                              type="text"
                              value={c.name}
                              onChange={(e) => {
                                const copy = [...companions];
                                copy[idx] = { ...copy[idx], name: e.target.value };
                                setCompanions(copy);
                              }}
                              placeholder="اسم المرافق"
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            />
                          </div>
                          <div className="md:col-span-3">
                            <input
                              type="text"
                              value={c.national_id || ''}
                              onChange={(e) => {
                                const copy = [...companions];
                                copy[idx] = { ...copy[idx], national_id: e.target.value };
                                setCompanions(copy);
                              }}
                              placeholder={t('هوية/إقامة المرافق', 'Companion ID')}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            />
                          </div>
                          <div className="md:col-span-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() => setCompanions(companions.filter((_, i) => i !== idx))}
                              className="px-3 py-2 rounded-lg border text-red-600 hover:bg-red-50"
                              title={t('حذف', 'Delete')}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setCompanions([...companions, { name: '', national_id: '' }])}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 hover:bg-gray-50"
                      >
                        <Plus size={16} />
                        {t('إضافة مرافق', 'Add companion')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}
      
      {/* Date Selection (collapsible when prefilled) */}
      {!isReviewMode && (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-extrabold text-gray-900">التواريخ</div>
          {lockedPrefill && (
            <div className="flex items-center gap-2">
              <div className="text-[11px] text-gray-600">
                {t('من', 'From')} {startDate} {t('إلى', 'to')} {endDate}
              </div>
              <button
                type="button"
                onClick={() => setShowDates((v) => !v)}
                className="text-xs px-3 py-1.5 rounded-lg border bg-gray-50 text-gray-700 hover:bg-gray-100"
              >
                {showDates ? 'إخفاء' : 'إظهار'}
              </button>
            </div>
          )}
        </div>
        {showDates && (
        <>
        <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
            <button
                onClick={() => {
                    lastDailyChangeRef.current = 'days';
                    const diff = differenceInCalendarDays(parseISO(endDate), parseISO(startDate));
                    setDurationDays(diff > 0 ? diff : 1);
                    setBookingType('daily');
                }}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                    bookingType === 'daily' 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
            >
                {t('حجز يومي', 'Daily')}
            </button>
            <button
                onClick={() => {
                    setBookingType('monthly');
                    setDurationMonths(1);
                }}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                    bookingType === 'monthly' 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
            >
                {t('حجز شهري', 'Monthly')}
            </button>
            <button
                onClick={() => {
                    setBookingType('yearly');
                    setDurationMonths(12);
                }}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                    bookingType === 'yearly' 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
            >
                {t('حجز سنوي', 'Yearly')}
            </button>
        </div>

        {bookingType === 'monthly' && (
            <div className="flex items-center gap-3 mt-4 bg-gray-50 p-2 rounded-lg border border-gray-200 w-fit animate-in fade-in slide-in-from-top-2">
                <span className="text-sm text-gray-600 font-medium px-2">{t('عدد الأشهر:', 'Months:')}</span>
                <button
                    onClick={() => setDurationMonths(Math.max(1, durationMonths - 1))}
                    className="p-1.5 rounded-full hover:bg-white hover:shadow-sm text-gray-600 transition-all disabled:opacity-50"
                    disabled={durationMonths <= 1}
                >
                    <Minus size={16} />
                </button>
                <span className="font-bold text-lg w-8 text-center text-blue-600">{durationMonths}</span>
                <button
                    onClick={() => setDurationMonths(durationMonths + 1)}
                    className="p-1.5 rounded-full hover:bg-white hover:shadow-sm text-gray-600 transition-all"
                >
                    <Plus size={16} />
                </button>
            </div>
        )}
        {bookingType === 'daily' && (
            <div className="flex items-center gap-3 mt-4 bg-gray-50 p-2 rounded-lg border border-gray-200 w-fit animate-in fade-in slide-in-from-top-2">
                <span className="text-sm text-gray-600 font-medium px-2">{t('عدد الأيام:', 'Days:')}</span>
                <button
                    onClick={() => {
                        lastDailyChangeRef.current = 'days';
                        setDurationDays(Math.max(1, durationDays - 1));
                    }}
                    className="p-1.5 rounded-full hover:bg-white hover:shadow-sm text-gray-600 transition-all disabled:opacity-50"
                    disabled={durationDays <= 1}
                >
                    <Minus size={16} />
                </button>
                <span className="font-bold text-lg w-10 text-center text-blue-600">{durationDays}</span>
                <button
                    onClick={() => {
                        lastDailyChangeRef.current = 'days';
                        setDurationDays(durationDays + 1);
                    }}
                    className="p-1.5 rounded-full hover:bg-white hover:shadow-sm text-gray-600 transition-all"
                >
                    <Plus size={16} />
                </button>
            </div>
        )}
        <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <Calendar size={16} className="text-blue-600" />
              {t('تاريخ الوصول', 'Check-in')}
            </label>
            <input 
              type="date" 
              className="w-full p-3 border border-gray-200 rounded-xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              value={startDate}
              onChange={(e) => {
                if (bookingType === 'daily') lastDailyChangeRef.current = 'startDate';
                setStartDate(e.target.value);
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <Calendar size={16} className="text-blue-600" />
              {t('تاريخ المغادرة', 'Check-out')}
            </label>
            <input 
              type="date" 
              className="w-full p-3 border border-gray-200 rounded-xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              value={endDate}
              min={startDate ? format(addDays(parseISO(startDate), 1), 'yyyy-MM-dd') : format(addDays(new Date(), 1), 'yyyy-MM-dd')}
              onChange={(e) => {
                if (bookingType === 'daily') lastDailyChangeRef.current = 'endDate';
                setEndDate(e.target.value);
              }}
              disabled={bookingType === 'yearly'}
            />
            {bookingType === 'yearly' && (
                <div className="mt-2 flex items-center gap-2">
                    <label className="text-xs font-bold text-gray-700 whitespace-nowrap">مدة العقد (أشهر):</label>
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
        </div>
        </>
        )}
      </div>
      )}

      

      {/* Unit Types (collapsible when prefilled) */}
      {!isReviewMode && (
      <>
      <div className="flex items-center justify-between mt-2">
        <div className="text-sm font-extrabold text-gray-900">النماذج</div>
        {lockedPrefill && (
          <button
            type="button"
            onClick={() => setShowUnitTypes((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-lg border bg-gray-50 text-gray-700 hover:bg-gray-100"
          >
            {showUnitTypes ? 'إخفاء' : 'إظهار'}
          </button>
        )}
      </div>
      {showUnitTypes && (
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
            <Building2 size={18} />
          </div>
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-gray-700 mb-1 block">اختر الفندق</label>
              <select
                value={selectedHotelId}
                onChange={(e) => setSelectedHotelId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="all">كل الفنادق</option>
                {hotels.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">الفندق المحدد</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-600">
                {selectedHotelId === 'all' ? 'كل الفنادق' : (hotels.find(h => h.id === selectedHotelId)?.name || '-')}
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Unit Types Grid */}
      {showUnitTypes && !isReviewMode && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {unitTypes.map((type) => {
          const isSelected = selectedType?.id === type.id;
          const hotelName = (type as any)?.hotel?.name as string | undefined;
          return (
            <div 
              key={type.id}
              onClick={() => setSelectedType(type)}
              className={`
                relative p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 group
                ${isSelected 
                  ? 'border-blue-600 bg-blue-50/30 shadow-lg shadow-blue-100 scale-[1.02]' 
                  : 'border-gray-100 bg-white hover:border-blue-300 hover:shadow-md'
                }
              `}
            >
              {isSelected && (
                <div className="absolute -top-3 -right-3 bg-blue-600 text-white p-1.5 rounded-full shadow-lg">
                  <Check size={16} strokeWidth={3} />
                </div>
              )}

              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{type.name}</h3>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <BedDouble size={14} />
                      {type.features?.length || 0} مرافق
                    </span>
                    <span className="flex items-center gap-1">
                      <Ruler size={14} />
                      {type.area || '-'} م²
                    </span>
                    {hotelName && (
                      <span className="flex items-center gap-1">
                        <Building2 size={14} />
                        {hotelName}
                      </span>
                    )}
                  </div>
                </div>
                {getPriceDisplay(type)}
              </div>

              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-lg text-xs font-medium text-gray-600">
                  <Users size={12} />
                  <span>{type.max_adults} كبار</span>
                </div>
                <div className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-lg text-xs font-medium text-gray-600">
                  <Users size={12} />
                  <span>{type.max_children} أطفال</span>
                </div>
              </div>

              {type.features && type.features.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
                  {type.features.slice(0, 3).map((feat, idx) => (
                    <span key={idx} className="text-[10px] bg-white border border-gray-200 px-2 py-1 rounded-full text-gray-500">
                      {feat}
                    </span>
                  ))}
                  {type.features.length > 3 && (
                    <span className="text-[10px] text-gray-400 px-1 py-1">
                      +{type.features.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
      </>
      )}

      {/* Available Units Selection */}
      {selectedType && !isReviewMode && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 pt-4 border-t">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-gray-900">الوحدات المتاحة</h3>
            <span className="text-sm text-gray-500 font-normal">
              ({displayedUnits.length} وحدة متاحة من نوع {selectedType.name})
            </span>
          </div>

          {loadingUnits ? (
            <div className="flex justify-center py-8">
               <Loader2 className="animate-spin text-blue-600" size={24} />
            </div>
          ) : displayedUnits.length === 0 ? (
            <div className="bg-red-50 text-red-600 p-6 rounded-xl text-center border border-red-100">
              لا توجد وحدات متاحة من هذا النوع في التواريخ المحددة.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {displayedUnits.map((unit) => {
                 const isUnitSelected = selectedUnit?.id === unit.id;
                 const hName = unit.hotel?.name;
                 return (
                   <div
                     key={unit.id}
                    onClick={() => {
                      if (selectedUnit && selectedUnit.id !== unit.id) {
                        const confirmed = window.confirm('هل أنت متأكد من تغيير الوحدة؟');
                        if (!confirmed) return;
                      }
                      const temp = tempResMap.get(unit.id);
                      if (temp) {
                        alert(`هنالك حجز مؤقت باسم ${temp.name} بتاريخ ${temp.date}`);
                      }
                      setSelectedUnit(unit);
                    }}
                     className={`
                       cursor-pointer p-5 rounded-2xl border-2 transition-all text-center relative overflow-hidden group
                       ${isUnitSelected 
                         ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-lg transform scale-105' 
                         : 'border-gray-100 bg-white text-gray-700 hover:border-blue-300 hover:shadow-md'
                       }
                       ${unit.status === 'maintenance' ? 'opacity-75 bg-red-50/30' : ''}
                       ${unit.status === 'cleaning' ? 'bg-amber-50/30' : ''}
                     `}
                   >
                     {/* Status Indicator */}
                     <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
                        {checkoutTodayMap.has(unit.id) && (
                            <div className="flex items-center gap-1.5 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]" />
                                <span className="text-[10px] font-bold text-blue-600">يخرج اليوم</span>
                            </div>
                        )}
                        {unit.status === 'cleaning' && (
                            <div className="flex items-center gap-1.5 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
                                <span className="text-[10px] font-bold text-amber-600">تحت التنظيف</span>
                            </div>
                        )}
                        {unit.status === 'maintenance' && (
                            <div className="flex items-center gap-1.5 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                                <span className="text-[10px] font-bold text-red-600">تحت الصيانة</span>
                            </div>
                        )}
                        {!checkoutTodayMap.has(unit.id) && unit.status === 'available' && (
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                                <span className="text-[10px] font-bold text-emerald-600">متاح</span>
                            </div>
                        )}
                     </div>

                     <div className="mt-2 font-bold text-3xl mb-2 tracking-tight">{unit.unit_number}</div>
                     <div className="text-xs text-gray-500 font-medium bg-gray-100/80 rounded-full px-3 py-1 inline-block">
                        الدور {unit.floor}
                     </div>
                     {(() => {
                       const temp = tempResMap.get(unit.id);
                       if (!temp) return null;
                       return (
                         <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1 inline-flex items-center gap-1">
                           <AlertCircle size={12} className="text-amber-600" />
                           <span>حجز مؤقت: {temp.name} • {temp.date}</span>
                         </div>
                       );
                     })()}
                     {hName && (
                       <div className="mt-2 text-[11px] text-gray-600 flex items-center justify-center gap-1">
                         <Building2 size={12} className="text-gray-400" />
                         <span>{hName}</span>
                       </div>
                     )}
                   </div>
                 );
              })}
            </div>
          )}
        </div>
      )}

      {unitTypes.length === 0 && (
        <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-2xl border border-dashed">
          {t('لا توجد نماذج وحدات مضافة حالياً.', 'No unit types have been added yet.')}
        </div>
      )}

      {/* Action Bar */}
      <div className="flex justify-between pt-6 border-t">
        <button
          onClick={onBack}
          className="text-gray-600 px-6 py-3 rounded-xl font-bold hover:bg-gray-100 transition-all flex items-center gap-2"
        >
          <ArrowRight size={20} />
          <span>{t('رجوع', 'Back')}</span>
        </button>

        <button
          onClick={handleNext}
          disabled={!selectedType || !selectedUnit || !startDate || !endDate}
          className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>{t('التالي: تفاصيل السعر', 'Next: Pricing details')}</span>
          <ArrowRight size={20} className="rotate-180" />
        </button>
      </div>
    </div>
  );
};
