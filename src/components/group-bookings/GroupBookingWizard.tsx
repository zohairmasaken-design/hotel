'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CustomerStep, Customer } from '../bookings/steps/CustomerStep';
import { calculateStayPrice, UnitType, PricingRule } from '@/lib/pricing';
import { Calendar, CheckCircle, Home, User, Loader2, Building2, Layers, Plus, X, CreditCard, Banknote, Wallet, Globe, FileText } from 'lucide-react';
import { format, addDays, addMonths, differenceInCalendarDays, isBefore, parseISO } from 'date-fns';
import { useActiveHotel } from '@/hooks/useActiveHotel';

type Step = 'customer' | 'dates' | 'units' | 'summary';

type UnitRow = {
  id: string;
  unit_number: string;
  floor?: string | null;
  hotel_id?: string | null;
  unit_type_id: string;
  hotel?: { name: string; tax_rate?: number | null };
};

type SelectedUnit = UnitRow & { unitType?: UnitType };

export const GroupBookingWizard: React.FC = () => {
  const { activeHotelId } = useActiveHotel();
  const [step, setStep] = useState<Step>('customer');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [startDate, setStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [bookingType, setBookingType] = useState<'daily' | 'yearly'>('daily');
  const [durationMonths, setDurationMonths] = useState<number>(12);
  const [hotels, setHotels] = useState<Array<{ id: string; name: string }>>([]);
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<string>('all');
  const [selectedTypeId, setSelectedTypeId] = useState<string>('all');
  const [floorFilter, setFloorFilter] = useState<string>('');
  const [availableUnits, setAvailableUnits] = useState<UnitRow[]>([]);
  const [selectedUnits, setSelectedUnits] = useState<SelectedUnit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [busyMap, setBusyMap] = useState<Map<string, string>>(new Map());
  const [groupDiscountType, setGroupDiscountType] = useState<'amount' | 'percent'>('amount');
  const [groupDiscountValue, setGroupDiscountValue] = useState<number>(0);
  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [paymentMethods, setPaymentMethods] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedMethodId, setSelectedMethodId] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [isPaid, setIsPaid] = useState<boolean>(true);
  const [invoiceCreating, setInvoiceCreating] = useState(false);
  const [extras, setExtras] = useState<Array<{ id: string; name: string; amount: number }>>([]);
  const [newExtraName, setNewExtraName] = useState('');
  const [newExtraAmount, setNewExtraAmount] = useState('');

  useEffect(() => {
    if (!activeHotelId) return;
    setSelectedHotelId(activeHotelId === 'all' ? 'all' : activeHotelId);
  }, [activeHotelId]);

  useEffect(() => {
    if (bookingType === 'yearly' && startDate) {
      setEndDate(format(addMonths(parseISO(startDate), durationMonths), 'yyyy-MM-dd'));
    }
  }, [bookingType, startDate, durationMonths]);

  const nights = useMemo(() => Math.max(0, differenceInCalendarDays(parseISO(endDate), parseISO(startDate))), [startDate, endDate]);

  useEffect(() => {
    const init = async () => {
      const { data: hotelsData } = await supabase.from('hotels').select('id, name').order('name');
      const { data: typesData } = await supabase.from('unit_types').select('id, name, daily_price, annual_price, max_adults, max_children, description, area, features, hotel:hotels(name)');
      const { data: rulesData } = await supabase.from('pricing_rules').select('*').eq('active', true);
      if (hotelsData) setHotels(hotelsData);
      if (typesData) setUnitTypes(typesData as any);
      if (rulesData) setPricingRules(rulesData as any);
    };
    init();
  }, []);

  useEffect(() => {
    const loadMethods = async () => {
      if (step !== 'summary') return;
      const { data } = await supabase.from('payment_methods').select('id, name').eq('is_active', true);
      if (data) {
        setPaymentMethods(data);
        if (!selectedMethodId && data.length > 0) setSelectedMethodId(data[0].id);
      }
    };
    loadMethods();
  }, [step, selectedMethodId]);

  useEffect(() => {
    const fetchUnits = async () => {
      if (!startDate || !endDate || isBefore(parseISO(endDate), parseISO(startDate)) || nights < 1) {
        setAvailableUnits([]);
        setBusyMap(new Map());
        return;
      }
      setLoadingUnits(true);
      try {
        let q = supabase.from('units').select('id, unit_number, floor, hotel_id, unit_type_id, hotel:hotels(name, tax_rate)');
        if (selectedHotelId !== 'all') q = q.eq('hotel_id', selectedHotelId);
        if (selectedTypeId !== 'all') q = q.eq('unit_type_id', selectedTypeId);
        const { data: units, error: ue } = await q;
        if (ue) throw ue;
        const ids = (units || []).map(u => u.id);
        if (!ids.length) {
          setAvailableUnits([]);
          setBusyMap(new Map());
          return;
        }
        const { data: booked1 } = await supabase
          .from('bookings')
          .select('unit_id')
          .in('unit_id', ids)
          .in('status', ['pending_deposit', 'confirmed', 'checked_in'])
          .lt('check_in', endDate)
          .gt('check_out', startDate);
        const { data: booked2 } = await supabase
          .from('group_booking_units')
          .select('unit_id')
          .in('unit_id', ids)
          .in('status', ['pending', 'pending_deposit', 'confirmed', 'checked_in'])
          .lt('check_in', endDate)
          .gt('check_out', startDate);
        const busy = new Set<string>([
          ...((booked1 || []).map(b => b.unit_id) as string[]),
          ...((booked2 || []).map(b => b.unit_id) as string[]),
        ]);
        const m = new Map<string, string>();
        busy.forEach(id => m.set(id, 'busy'));
        setBusyMap(m);
        const free = (units || []).filter(u => !busy.has(u.id));
        setAvailableUnits(free as any);
      } catch (e) {
        setAvailableUnits([]);
        setBusyMap(new Map());
      } finally {
        setLoadingUnits(false);
      }
    };
    fetchUnits();
  }, [startDate, endDate, selectedHotelId, selectedTypeId, nights]);

  const toggleUnit = (u: UnitRow) => {
    const exists = selectedUnits.find(s => s.id === u.id);
    if (exists) {
      setSelectedUnits(selectedUnits.filter(s => s.id !== u.id));
    } else {
      const ut = unitTypes.find(t => t.id === u.unit_type_id);
      setSelectedUnits([...selectedUnits, { ...u, unitType: ut }]);
    }
  };

  const pricingSummary = useMemo(() => {
    if (!nights || nights < 1) return { subtotal: 0, discount: 0, taxable: 0, tax: 0, total: 0, lines: [] as Array<{ id: string; unit_number: string; total: number }> };
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    let subtotal = 0;
    const lines: Array<{ id: string; unit_number: string; total: number }> = [];
    const perUnitTotals: Array<{ id: string; total: number; tax_rate: number }> = [];
    selectedUnits.forEach(su => {
      const ut = su.unitType;
      if (!ut) return;
      if (bookingType === 'yearly') {
        const annual = ut.annual_price || 0;
        const monthlyRate = annual / 12;
        const total = monthlyRate * durationMonths;
        subtotal += total;
        lines.push({ id: su.id, unit_number: su.unit_number, total });
        const rate = Number(su.hotel?.tax_rate ?? 0) || 0;
        perUnitTotals.push({ id: su.id, total, tax_rate: rate });
      } else {
        const calc = calculateStayPrice(ut, pricingRules, start, end);
        subtotal += calc.totalPrice;
        lines.push({ id: su.id, unit_number: su.unit_number, total: calc.totalPrice });
        const rate = Number(su.hotel?.tax_rate ?? 0) || 0;
        perUnitTotals.push({ id: su.id, total: calc.totalPrice, tax_rate: rate });
      }
    });
    const discount = groupDiscountType === 'amount' ? Math.min(groupDiscountValue, subtotal) : (subtotal * groupDiscountValue) / 100;
    const extrasTotal = extras.reduce((s, e) => s + (e.amount || 0), 0);
    const taxableBase = Math.max(0, subtotal - discount + extrasTotal);
    let tax = 0;
    if (subtotal > 0) {
      perUnitTotals.forEach(u => {
        const weight = u.total / subtotal;
        const allocated = Math.max(0, u.total - discount * weight + extrasTotal * weight);
        tax += allocated * (u.tax_rate || 0);
      });
    }
    const total = taxableBase + tax;
    return { subtotal, discount, taxable: taxableBase, tax, total, lines };
  }, [selectedUnits, unitTypes, pricingRules, startDate, endDate, groupDiscountType, groupDiscountValue, nights, bookingType, durationMonths, extras]);

  const canProceedUnits = useMemo(() => {
    return customer && startDate && endDate && nights >= 1 && selectedUnits.length > 0;
  }, [customer, startDate, endDate, nights, selectedUnits.length]);

  const handleCreate = async () => {
    if (!customer || !canProceedUnits) return;
    const startStr = startDate;
    const endStr = endDate;
    try {
      if (depositAmount > 0 && isPaid && !selectedMethodId) {
        alert('يرجى اختيار طريقة الدفع عند تحديد عربون مدفوع الآن');
        return;
      }
      const status = depositAmount > 0 ? 'confirmed' : 'pending_deposit';
      let gb: any = null;
      // Try insert with booking_type; if column missing, retry without it
      const basePayload: any = {
        customer_id: customer.id,
        check_in: startStr,
        check_out: endStr,
        status,
        total_amount: pricingSummary.total,
        total_deposit: depositAmount
      };
      const withType = {
        ...basePayload,
        booking_type: bookingType === 'yearly' ? 'yearly' : 'daily'
      };
      const { data: gbTry, error: e1 } = await supabase
        .from('group_bookings')
        .insert(withType)
        .select()
        .single();
      if (e1 && String(e1?.message || '').toLowerCase().includes('booking_type')) {
        const { data: gbTry2, error: e2 } = await supabase
          .from('group_bookings')
          .insert(basePayload)
          .select()
          .single();
        if (e2) throw e2;
        gb = gbTry2;
      } else if (e1) {
        throw e1;
      } else {
        gb = gbTry;
      }
      if (!gb) throw new Error('failed');
      const rows = selectedUnits.map(su => {
        const ut = su.unitType;
        if (!ut) return null as any;
        if (bookingType === 'yearly') {
          const annual = ut.annual_price || 0;
          if (!annual) throw new Error('لا يوجد سعر سنوي محدد لنوع وحدة محددة');
          const monthlyRate = annual / 12;
          const total = monthlyRate * durationMonths;
          return {
            group_booking_id: gb.id,
            unit_id: su.id,
            check_in: startStr,
            check_out: endStr,
            status,
            unit_price: Math.round(monthlyRate),
            subtotal: Math.round(total)
          };
        } else {
          const calc = calculateStayPrice(ut, pricingRules, parseISO(startStr), parseISO(endStr));
          return {
            group_booking_id: gb.id,
            unit_id: su.id,
            check_in: startStr,
            check_out: endStr,
            status,
            unit_price: Math.round(calc.totalPrice / nights),
            subtotal: calc.totalPrice
          };
        }
      }).filter(Boolean);
      const { error: e2 } = await supabase.from('group_booking_units').insert(rows);
      if (e2) throw e2;
      if (depositAmount > 0 && isPaid) {
        const txnDate = new Date().toISOString().split('T')[0];
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
          const { data: journalId, error: txnError } = await supabase.rpc('post_transaction', {
            p_transaction_type: 'advance_payment',
            p_source_type: 'group_booking',
            p_source_id: gb.id,
            p_amount: depositAmount,
            p_customer_id: customer.id,
            p_payment_method_id: selectedMethodId,
            p_transaction_date: new Date().toISOString(),
            p_description: `عربون حجز متعدد - ${customer.full_name}`
          });
          if (txnError) {
            alert(`تم إنشاء الحجز بنجاح، ولكن حدث خطأ في تسجيل المعاملة المالية: ${txnError.message || txnError.details || JSON.stringify(txnError)}`);
          } else {
            const desc = `عربون حجز متعدد - ${customer.full_name}` + (referenceNumber ? ` - مرجع: ${referenceNumber}` : '');
            await supabase.from('payments').insert({
              customer_id: customer.id,
              invoice_id: null,
              payment_method_id: selectedMethodId,
              amount: depositAmount,
              payment_date: new Date().toISOString(),
              journal_entry_id: journalId,
              description: desc,
              status: 'posted'
            });
          }
        }
      }
      alert('تم إنشاء الحجز المتعدد بنجاح');
      setStep('customer');
      setCustomer(null);
      setSelectedUnits([]);
      setGroupDiscountType('amount');
      setGroupDiscountValue(0);
      setDepositAmount(0);
      setReferenceNumber('');
      setIsPaid(true);
    } catch (e: any) {
      alert('تعذر إنشاء الحجز المتعدد: ' + (e?.message || 'خطأ غير معروف'));
    }
  };

  const currentIndex = step === 'customer' ? 0 : step === 'dates' ? 1 : step === 'units' ? 2 : 3;
  const steps = [
    { id: 'customer', label: 'العميل', icon: User },
    { id: 'dates', label: 'المدة والنوع', icon: Calendar },
    { id: 'units', label: 'الوحدات', icon: Home },
    { id: 'summary', label: 'التسعير', icon: CheckCircle },
  ];

  const pad4 = (n: number) => String(n).padStart(4, '0');

  const handleCreateStandaloneInvoice = async () => {
    if (!customer) {
      alert('العميل غير محدد');
      return;
    }
    setInvoiceCreating(true);
    try {
      const { count } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true });
      const invoiceNumber = pad4((count || 0) + 1);
      const extrasTotal = extras.reduce((s, e) => s + (e.amount || 0), 0);
      const { error } = await supabase
        .from('invoices')
        .insert({
          booking_id: null,
          customer_id: customer.id,
          invoice_number: invoiceNumber,
          invoice_date: new Date().toISOString(),
          due_date: new Date().toISOString(),
          subtotal: pricingSummary.subtotal,
          tax_amount: pricingSummary.tax,
          discount_amount: pricingSummary.discount,
          additional_services_amount: extrasTotal,
          total_amount: pricingSummary.total,
          paid_amount: 0,
          status: 'draft'
        });
      if (error) throw error;
      alert(`تم إنشاء فاتورة مسودة مستقلة رقم ${invoiceNumber}`);
    } catch (e: any) {
      alert('تعذر إنشاء الفاتورة: ' + (e?.message || 'خطأ غير معروف'));
    } finally {
      setInvoiceCreating(false);
    }
  };

  if (step === 'customer') {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            {steps.map((s, idx) => {
              const Icon = s.icon;
              const active = idx === currentIndex;
              return (
                <div key={s.id} className={`flex items-center gap-2 ${idx > 0 ? 'ml-4' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${active ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-400'}`}>
                    <Icon size={14} />
                  </div>
                  <span className={`text-xs font-bold ${active ? 'text-blue-700' : 'text-gray-400'}`}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <CustomerStep onNext={(c) => { setCustomer(c); setStep('dates'); }} />
        </div>
      </div>
    );
  }

  if (step === 'dates') {
    const nightsDisplay = nights;
    return (
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            {steps.map((s, idx) => {
              const Icon = s.icon as any;
              const active = idx === currentIndex;
              return (
                <div key={s.id} className={`flex items-center gap-2 ${idx > 0 ? 'ml-4' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${active ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-400'}`}>
                    <Icon size={14} />
                  </div>
                  <span className={`text-xs font-bold ${active ? 'text-blue-700' : 'text-gray-400'}`}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
          <div>
            <div className="text-xs text-gray-600 font-bold mb-2">نوع الحجز</div>
            <div className="flex bg-gray-50 p-1 rounded-lg border border-gray-100 w-full max-w-sm">
              <button onClick={() => setBookingType('daily')} className={`flex-1 py-1.5 text-xs font-bold rounded-md ${bookingType === 'daily' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>يومي</button>
              <button onClick={() => setBookingType('yearly')} className={`flex-1 py-1.5 text-xs font-bold rounded-md ${bookingType === 'yearly' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>شهري/سنوي</button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-600 font-bold mb-1">تاريخ الوصول</div>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
            </div>
            {bookingType === 'daily' ? (
              <div>
                <div className="text-xs text-gray-600 font-bold mb-1">تاريخ المغادرة</div>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
              </div>
            ) : (
              <div>
                <div className="text-xs text-gray-600 font-bold mb-1">المدة (أشهر)</div>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={durationMonths}
                  onChange={e => setDurationMonths(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <div className="text-[11px] text-gray-500 mt-1">سيتم ضبط تاريخ المغادرة تلقائياً</div>
              </div>
            )}
          </div>
          <div className="text-xs text-gray-600">المدة: <span className="font-bold text-gray-900">{bookingType === 'daily' ? `${nightsDisplay} ليلة` : `${durationMonths} شهر`}</span></div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setStep('customer')} className="flex-1 bg-white border border-gray-200 text-gray-700 py-3 rounded-xl font-bold text-sm hover:bg-gray-50">رجوع</button>
            <button
              onClick={() => setStep('units')}
              disabled={!startDate || !endDate || isBefore(parseISO(endDate), parseISO(startDate))}
              className={`flex-[2] py-3 rounded-xl font-bold text-sm ${startDate && endDate && !isBefore(parseISO(endDate), parseISO(startDate)) ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400'}`}
            >
              متابعة اختيار الوحدات
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'units') {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            {steps.map((s, idx) => {
              const Icon = s.icon;
              const active = idx === currentIndex;
              return (
                <div key={s.id} className={`flex items-center gap-2 ${idx > 0 ? 'ml-4' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${active ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-400'}`}>
                    <Icon size={14} />
                  </div>
                  <span className={`text-xs font-bold ${active ? 'text-blue-700' : 'text-gray-400'}`}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-4">
            <div className="bg-white border rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-blue-600" />
                  <h3 className="font-bold text-gray-900 text-sm">المدة والنوع</h3>
                </div>
                <button onClick={() => setStep('dates')} className="text-xs text-blue-600 hover:underline">تعديل</button>
              </div>
              <div className="space-y-1 text-sm text-gray-700">
                <div>الوصول: <span className="font-bold text-gray-900">{startDate}</span></div>
                <div>المغادرة: <span className="font-bold text-gray-900">{endDate}</span></div>
                <div>النوع: <span className="font-bold text-gray-900">{bookingType === 'yearly' ? `شهري/سنوي (${durationMonths} أشهر)` : 'يومي'}</span></div>
              </div>
            </div>
            <div className="bg-white border rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 size={16} className="text-blue-600" />
                <h3 className="font-bold text-gray-900 text-sm">الفلاتر</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <div className="text-xs text-gray-500 mb-1">الفندق</div>
                  <select value={selectedHotelId} onChange={e => setSelectedHotelId(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                    <option value="all">الكل</option>
                    {hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">نوع الوحدة</div>
                  <select value={selectedTypeId} onChange={e => setSelectedTypeId(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                    <option value="all">الكل</option>
                    {unitTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">الدور</div>
                  <input value={floorFilter} onChange={e => setFloorFilter(e.target.value)} placeholder="مثال: 1 أو 2 أو A" className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
            </div>
          </div>
          <div className="md:col-span-2 space-y-4">
            <div className="bg-white border rounded-2xl">
              <div className="p-4 border-b flex items-center justify-between">
                <div className="font-bold text-gray-900 text-sm">الوحدات المتاحة</div>
                <div className="text-xs text-gray-500">المحدد: {selectedUnits.length}</div>
              </div>
              {loadingUnits ? (
                <div className="py-16 flex items-center justify-center text-gray-500">
                  <Loader2 className="animate-spin mr-2" /> جار التحميل...
                </div>
              ) : (
                <div className="divide-y">
                  {availableUnits
                    .filter(u => (floorFilter ? String(u.floor || '').toLowerCase().includes(floorFilter.toLowerCase()) : true))
                    .map(u => {
                      const checked = !!selectedUnits.find(s => s.id === u.id);
                      const disabled = busyMap.has(u.id);
                      return (
                        <label key={u.id} className={`flex items-center justify-between px-4 py-3 ${disabled ? 'opacity-50' : 'hover:bg-gray-50'}`}>
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleUnit(u)}
                              className="rounded"
                            />
                            <div>
                              <div className="font-bold text-gray-900 text-sm">{u.unit_number}</div>
                              <div className="text-xs text-gray-500">{u.hotel?.name || '-'} • دور {u.floor || '-'}</div>
                            </div>
                          </div>
                          <div className="text-xs text-gray-500">رقم: {u.id.slice(0, 6)}</div>
                        </label>
                      );
                    })}
                  {availableUnits.length === 0 && (
                    <div className="py-12 text-center text-gray-500">لا توجد وحدات متاحة</div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep('customer')} className="flex-1 bg-white border border-gray-200 text-gray-700 py-3 rounded-xl font-bold text-sm hover:bg-gray-50">رجوع</button>
              <button
                onClick={() => setStep('summary')}
                disabled={!canProceedUnits}
                className={`flex-[2] py-3 rounded-xl font-bold text-sm ${canProceedUnits ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400'}`}
              >
                متابعة
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center gap-3">
          {steps.map((s, idx) => {
            const Icon = s.icon;
            const active = idx === currentIndex;
            return (
              <div key={s.id} className={`flex items-center gap-2 ${idx > 0 ? 'ml-4' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${active ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-400'}`}>
                  <Icon size={14} />
                </div>
                <span className={`text-xs font-bold ${active ? 'text-blue-700' : 'text-gray-400'}`}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border rounded-2xl">
          <div className="p-4 border-b flex items-center gap-2">
            <Layers size={16} className="text-blue-600" />
            <div className="font-bold text-gray-900 text-sm">تفاصيل الوحدات المختارة</div>
          </div>
          <div className="divide-y">
            {pricingSummary.lines.map(line => (
              <div key={line.id} className="px-4 py-3 flex items-center justify-between">
                <div className="text-sm font-bold text-gray-800">الوحدة {line.unit_number}</div>
                <div className="text-sm text-gray-700">{line.total.toLocaleString()} ر.س</div>
              </div>
            ))}
            {pricingSummary.lines.length === 0 && (
              <div className="py-12 text-center text-gray-500">لا توجد وحدات</div>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-white border rounded-2xl p-4">
            <div className="font-bold text-gray-900 text-sm mb-3">الخصم الجماعي</div>
            <div className="flex bg-gray-50 p-1 rounded-lg border border-gray-100 mb-2">
              <button onClick={() => setGroupDiscountType('amount')} className={`flex-1 py-1.5 text-xs font-bold rounded-md ${groupDiscountType === 'amount' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>مبلغ</button>
              <button onClick={() => setGroupDiscountType('percent')} className={`flex-1 py-1.5 text-xs font-bold rounded-md ${groupDiscountType === 'percent' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>نسبة</button>
            </div>
            <input
              type="number"
              value={groupDiscountValue}
              onChange={e => setGroupDiscountValue(Math.max(0, Number(e.target.value)))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              placeholder="0"
            />
            <div className="mt-4">
              <div className="font-bold text-gray-900 text-sm mb-2">إضافات</div>
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={newExtraName}
                  onChange={e => setNewExtraName(e.target.value)}
                  placeholder="اسم الإضافة"
                  className="flex-1 px-3 py-2 border rounded-lg text-sm"
                />
                <input
                  type="number"
                  value={newExtraAmount}
                  onChange={e => setNewExtraAmount(e.target.value)}
                  placeholder="المبلغ"
                  className="w-32 px-3 py-2 border rounded-lg text-sm"
                />
                <button
                  onClick={() => {
                    const name = newExtraName.trim();
                    const amt = Number(newExtraAmount);
                    if (!name || isNaN(amt) || amt <= 0) return;
                    setExtras([...extras, { id: Math.random().toString(36).slice(2, 9), name, amount: amt }]);
                    setNewExtraName('');
                    setNewExtraAmount('');
                  }}
                  className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm flex items-center gap-1"
                >
                  <Plus size={14} />
                  إضافة
                </button>
              </div>
              {extras.length > 0 && (
                <div className="divide-y border rounded-lg">
                  {extras.map(e => (
                    <div key={e.id} className="flex items-center justify-between px-3 py-2">
                      <div className="text-sm text-gray-800">{e.name}</div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm text-gray-700">{e.amount.toLocaleString()} ر.س</div>
                        <button onClick={() => setExtras(extras.filter(x => x.id !== e.id))} className="p-1 text-gray-500 hover:text-red-600">
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="bg-white border rounded-2xl p-4">
            <div className="font-bold text-gray-900 text-sm mb-2">التسعير</div>
            <div className="text-xs text-gray-600 flex justify-between mb-1"><span>المجموع الفرعي</span><span className="font-bold text-gray-900">{pricingSummary.subtotal.toLocaleString()}</span></div>
            {pricingSummary.discount > 0 && (
              <div className="text-xs text-gray-600 flex justify-between mb-1"><span>الخصم</span><span className="font-bold text-red-600">-{pricingSummary.discount.toLocaleString()}</span></div>
            )}
            {extras.length > 0 && (
              <div className="text-xs text-gray-600 flex justify-between mb-1"><span>الإضافات</span><span className="font-bold text-gray-900">{extras.reduce((s, e) => s + e.amount, 0).toLocaleString()}</span></div>
            )}
            <div className="text-xs text-gray-600 flex justify-between mb-1"><span>المبلغ الخاضع</span><span className="font-bold text-gray-900">{pricingSummary.taxable.toLocaleString()}</span></div>
            <div className="text-xs text-gray-600 flex justify-between mb-1"><span>الضريبة</span><span className="font-bold text-gray-900">{pricingSummary.tax.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
            <div className="h-px bg-gray-200 my-2"></div>
            <div className="text-sm text-gray-700 flex justify-between"><span className="font-bold">الإجمالي</span><span className="font-extrabold text-gray-900">{pricingSummary.total.toLocaleString(undefined, { maximumFractionDigits: 2 })} ر.س</span></div>
            <div className="pt-3">
              <button
                onClick={handleCreateStandaloneInvoice}
                disabled={invoiceCreating || !customer}
                className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-gray-800 flex items-center justify-center gap-2"
              >
                <FileText size={16} />
                <span>{invoiceCreating ? 'جار إنشاء الفاتورة...' : 'إنشاء فاتورة مستقلة (مسودة)'}</span>
              </button>
            </div>
          </div>
          <div className="bg-white border rounded-2xl p-4">
            <div className="font-bold text-gray-900 text-sm mb-2">عربون</div>
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => setDepositAmount(pricingSummary.total)}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg"
              >
                كامل المبلغ ({pricingSummary.total.toLocaleString(undefined, { maximumFractionDigits: 0 })})
              </button>
              <button
                onClick={() => setDepositAmount(Math.round(pricingSummary.total / 2))}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg"
              >
                50% ({Math.round(pricingSummary.total / 2).toLocaleString()})
              </button>
              <button
                onClick={() => setDepositAmount(0)}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg"
              >
                بدون عربون (0)
              </button>
            </div>
            <div className="mb-3">
              <input
                type="number"
                value={depositAmount}
                onChange={e => setDepositAmount(Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="0"
              />
            </div>
            {depositAmount > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">تم السداد الآن</label>
                  <button
                    onClick={() => setIsPaid(!isPaid)}
                    className={`w-12 h-6 rounded-full relative transition-colors ${isPaid ? 'bg-green-500' : 'bg-gray-300'}`}
                    aria-pressed={isPaid}
                    aria-label="toggle paid"
                  >
                    <span className={`absolute top-0.5 ${isPaid ? 'right-0.5' : 'left-0.5'} w-5 h-5 bg-white rounded-full transition-all`} />
                  </button>
                </div>
                {isPaid && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">طريقة الدفع</label>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-50 border">
                          {(() => {
                            const name = (paymentMethods.find(pm => pm.id === selectedMethodId)?.name || '').toLowerCase();
                            if (name.includes('نقد') || name.includes('cash')) return <Banknote size={18} />;
                            if (name.includes('تحويل') || name.includes('bank') || name.includes('بنك')) return <Wallet size={18} />;
                            if (name.includes('booking') || name.includes('agoda') || name.includes('airbnb') || name.includes('expedia') || name.includes('gathern') || name.includes('منصة') || name.includes('platform')) return <Globe size={18} />;
                            return <CreditCard size={18} />;
                          })()}
                        </div>
                        <select
                          value={selectedMethodId}
                          onChange={e => setSelectedMethodId(e.target.value)}
                          className="flex-1 px-3 py-2 border rounded-lg text-sm"
                        >
                          {paymentMethods.map(pm => (
                            <option key={pm.id} value={pm.id}>{pm.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">رقم المرجع</label>
                      <input
                        value={referenceNumber}
                        onChange={e => setReferenceNumber(e.target.value)}
                        placeholder="اختياري"
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="text-[11px] text-gray-500 mt-2">يحدد حالة الحجز</div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep('units')} className="flex-1 bg-white border border-gray-200 text-gray-700 py-3 rounded-xl font-bold text-sm hover:bg-gray-50">رجوع</button>
            <button onClick={handleCreate} className="flex-[2] bg-blue-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-blue-700">تأكيد وإنشاء</button>
          </div>
        </div>
      </div>
    </div>
  );
};
