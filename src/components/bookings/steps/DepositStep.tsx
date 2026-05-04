import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PricingResult } from './PricingStep';
import { Wallet, CreditCard, Banknote, Loader2, ArrowRight, CheckCircle2, Globe, Coins, ShieldCheck, Receipt, Landmark, LayoutGrid, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { useActiveHotel } from '@/hooks/useActiveHotel';

interface DepositStepProps {
  onNext: (data: DepositResult) => void;
  onBack: () => void;
  pricingResult: PricingResult;
  customerName?: string;
  initialData?: DepositResult;
  language?: 'ar' | 'en';
}

export interface DepositResult {
  depositAmount: number;
  paymentMethodId: string;
  paymentMethodName: string;
  referenceNumber?: string;
  isPaid: boolean;
  accountType: 'advance_payment' | 'payment';
  statement: string;
}

interface PaymentMethod {
  id: string;
  name: string;
}

export const DepositStep: React.FC<DepositStepProps> = ({ onNext, onBack, pricingResult, customerName, initialData, language: languageProp }) => {
  const { language: storedLanguage } = useAppLanguage();
  const { activeHotelId } = useActiveHotel();
  const language = languageProp ?? storedLanguage;
  const t = (arText: string, enText: string) => (language === 'en' ? enText : arText);
  const [loading, setLoading] = useState(true);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [userName, setUserName] = useState<string>('');
  const statementPresets = [
    'جاري المالك سعد',
    'حساب مساكن الرفاهية',
    `استلام نقد من قبل ${userName || 'المستخدم'}`,
  ];
  
  const initialDeposit = initialData?.depositAmount ?? Math.round(pricingResult.finalTotal / 2);
  const [depositAmount, setDepositAmount] = useState<number>(initialDeposit);
  const [depositAmountInput, setDepositAmountInput] = useState<string>(String(initialDeposit));
  const [selectedMethodId, setSelectedMethodId] = useState<string>(initialData?.paymentMethodId || '');
  const [referenceNumber, setReferenceNumber] = useState<string>(initialData?.referenceNumber || '');
  const [isPaid, setIsPaid] = useState<boolean>(initialData?.isPaid || true);
  const [accountType, setAccountType] = useState<'advance_payment' | 'payment'>(initialData?.accountType || 'advance_payment');
  const [statement, setStatement] = useState<string>(initialData?.statement || '');

  // Mouse Drag Scroll Logic
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };

  const handleMouseLeave = () => setIsDragging(false);
  const handleMouseUp = () => setIsDragging(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 2; // Scroll speed
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const updateScrollButtons = () => {
    const el = scrollRef.current;
    if (!el) {
      setCanScrollPrev(false);
      setCanScrollNext(false);
      return;
    }
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    setCanScrollPrev(el.scrollLeft > 4);
    setCanScrollNext(maxScrollLeft - el.scrollLeft > 4);
  };

  const scrollByCards = (dir: 'prev' | 'next') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = 260;
    const delta = dir === 'next' ? amount : -amount;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const normalizeEnglishDigits = (raw: string) => {
    const arabic = '٠١٢٣٤٥٦٧٨٩';
    const persian = '۰۱۲۳۴۵۶۷۸۹';
    return raw
      .replace(/[٠-٩]/g, (d) => String(arabic.indexOf(d)))
      .replace(/[۰-۹]/g, (d) => String(persian.indexOf(d)))
      .replace(/,/g, '')
      .replace(/[^\d.]/g, '');
  };

  const onDepositAmountChange = (raw: string) => {
    const normalized = normalizeEnglishDigits(raw);
    const parts = normalized.split('.');
    const safe =
      parts.length <= 1 ? parts[0] : `${parts[0]}.${parts.slice(1).join('')}`;

    setDepositAmountInput(safe);
    const next = safe.trim() === '' ? 0 : Number(safe);
    setDepositAmount(Number.isFinite(next) ? Math.max(0, next) : 0);
  };

  useEffect(() => {
    const fetchMethodsAndUser = async () => {
      setLoading(true);
      
      // Fetch User Name
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();
        if (profile?.full_name) {
          setUserName(profile.full_name);
        }
      }

      // Fetch Payment Methods
      const selectedHotelId = activeHotelId || 'all';
      let query = supabase.from('payment_methods').select('id, name').eq('is_active', true);
      if (selectedHotelId !== 'all') {
        query = query.or(`hotel_id.is.null,hotel_id.eq.${selectedHotelId}`);
      }
      const { data, error } = await query;

      if (data) {
        const scoreMethod = (name: string) => {
          const n = (name || '').toLowerCase();
          if (n.includes('نقد') || n.includes('cash')) return 100;
          if (n.includes('مدى') || n.includes('mada')) return 90;
          if (n.includes('تحويل') || n.includes('transfer') || n.includes('bank') || n.includes('بنك')) return 80;
          if (n.includes('فيزا') || n.includes('visa') || n.includes('master') || n.includes('credit') || n.includes('بطاقة')) return 70;
          if (n.includes('apple') || n.includes('stc') || n.includes('pay') || n.includes('wallet')) return 60;
          if (n.includes('booking') || n.includes('agoda') || n.includes('airbnb') || n.includes('expedia') || n.includes('gathern') || n.includes('منصة') || n.includes('platform')) return 30;
          return 50;
        };

        const sorted = [...data].sort((a, b) => {
          const d = scoreMethod(b.name) - scoreMethod(a.name);
          if (d !== 0) return d;
          return (a.name || '').localeCompare(b.name || '', 'ar');
        });

        setPaymentMethods(sorted);
        if (!selectedMethodId && sorted.length > 0) {
          setSelectedMethodId(sorted[0].id);
        }
      }

      setLoading(false);
    };

    fetchMethodsAndUser();
  }, [activeHotelId]);

  useEffect(() => {
    updateScrollButtons();
    const onResize = () => updateScrollButtons();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [paymentMethods.length, depositAmount]);

  const handleNext = () => {
    const method = paymentMethods.find(m => m.id === selectedMethodId);
    onNext({
      depositAmount,
      paymentMethodId: selectedMethodId,
      paymentMethodName: method?.name || '',
      referenceNumber,
      isPaid,
      accountType,
      statement: statement || getDefaultStatement()
    });
  };

  const getDefaultStatement = () => {
    if (accountType === 'advance_payment') {
      return `عربون حجز - ${customerName || 'عميل'}`;
    }
    return `ايراد حجز - ${customerName || 'عميل'}`;
  };

  const getIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('نقد') || n.includes('cash')) return <Banknote size={24} />;
    if (n.includes('تحويل') || n.includes('transfer') || n.includes('bank') || n.includes('بنك')) return <Landmark size={24} />;
    if (n.includes('alahli') || n.includes('mada') || n.includes('مدى')) return <CreditCard size={24} />;
    if (n.includes('booking') || n.includes('agoda') || n.includes('airbnb') || n.includes('expedia') || n.includes('gathern') || n.includes('منصة') || n.includes('platform')) return <Globe size={24} />;
    return <Wallet size={24} />;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="relative">
            <div className="w-16 h-16 border-4 border-emerald-100 rounded-full"></div>
            <div className="w-16 h-16 border-4 border-t-emerald-700 rounded-full animate-spin absolute top-0 left-0"></div>
        </div>
        <p className="text-sm font-black text-gray-400 animate-pulse">جاري تحميل طرق الدفع...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-10">
      
      {/* Main Container */}
      <div className="bg-white ring-1 ring-emerald-100/70 rounded-3xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="bg-gradient-to-br from-emerald-50 via-white to-white px-6 sm:px-8 py-6 border-b border-emerald-100/70 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 rounded-2xl flex items-center justify-center text-white shadow-sm">
              <Wallet size={24} />
            </div>
            <div>
              <h3 className="font-black text-lg text-emerald-950">تسجيل العربون</h3>
              <p className="text-[12px] text-emerald-900/70 font-bold mt-0.5">حدد المبلغ وطريقة الدفع والبيان ثم تابع</p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black text-emerald-900/60 tracking-tighter">إجمالي الحجز</span>
            <span className="text-lg font-black text-emerald-950">{pricingResult.finalTotal.toLocaleString()} <span className="text-xs font-normal">ر.س</span></span>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-8">
          
          {/* 1. Deposit Amount Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-700">
                        <Coins size={18} />
                    </div>
                    <h4 className="font-black text-sm text-emerald-950 tracking-tight">قيمة العربون</h4>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                    {[
                        { label: '0%', val: 0 },
                        { label: '50%', val: Math.round(pricingResult.finalTotal / 2) },
                        { label: '100%', val: pricingResult.finalTotal }
                    ].map((opt) => (
                        <button
                            key={opt.label}
                            onClick={() => {
                              setDepositAmount(opt.val);
                              setDepositAmountInput(String(opt.val));
                            }}
                            className={`px-3 py-1.5 rounded-2xl text-[10px] font-black transition-all ${
                              depositAmount === opt.val
                                ? 'bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white shadow-sm'
                                : 'bg-white/70 ring-1 ring-emerald-200/70 text-emerald-950 hover:bg-emerald-50'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="relative group">
                <input
                    type="text"
                    inputMode="decimal"
                    lang="en"
                    dir="ltr"
                    value={depositAmountInput}
                    onChange={(e) => onDepositAmountChange(e.target.value)}
                    onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                    className="w-full p-5 sm:p-6 bg-white border border-emerald-200 rounded-3xl text-3xl sm:text-4xl font-black text-emerald-800 focus:bg-white focus:border-emerald-600 focus:ring-8 focus:ring-emerald-500/10 outline-none transition-all text-center"
                />
                <div className="absolute inset-y-0 left-6 sm:left-8 flex items-center pointer-events-none">
                    <span className="text-emerald-900/35 font-black text-xl">ر.س</span>
                </div>
                <div className="absolute inset-y-0 right-6 sm:right-8 flex items-center pointer-events-none opacity-0 group-focus-within:opacity-100 transition-opacity">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                </div>
            </div>
          </div>

          {/* 2. Payment Methods Section (Horizontal Scroll) */}
          {depositAmount > 0 && (
            <div className="space-y-6">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-700">
                            <LayoutGrid size={18} />
                        </div>
                        <h4 className="font-black text-sm text-emerald-950 tracking-tight">اختر طريقة الدفع</h4>
                    </div>
                </div>

                <div className="relative group">
                    <div 
                        ref={scrollRef}
                        onScroll={updateScrollButtons}
                        onMouseDown={handleMouseDown}
                        onMouseLeave={handleMouseLeave}
                        onMouseUp={handleMouseUp}
                        onMouseMove={handleMouseMove}
                        className={`
                            flex overflow-x-auto pb-4 gap-3 no-scrollbar scroll-smooth px-2 -mx-2 select-none
                            ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}
                        `}
                    >
                        {paymentMethods.map(method => (
                            <button
                                key={method.id}
                                onClick={() => setSelectedMethodId(method.id)}
                                className={`
                                    flex-none w-28 p-4 rounded-3xl border transition-all duration-300 flex flex-col items-center gap-2 ring-1 ring-emerald-100/70
                                    ${selectedMethodId === method.id 
                                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-sm scale-[1.02] z-10 ring-emerald-300/70' 
                                        : 'bg-white text-gray-600 hover:bg-emerald-50/40'
                                    }
                                `}
                            >
                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-300 ${selectedMethodId === method.id ? 'bg-emerald-800 text-white shadow-sm' : 'bg-emerald-50 text-emerald-800'}`}>
                                    {React.cloneElement(getIcon(method.name) as React.ReactElement<any>, { size: 20 })}
                                </div>
                                <span className="text-[10px] font-black text-center leading-tight h-6 flex items-center">{method.name}</span>
                                {selectedMethodId === method.id && (
                                    <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></div>
                                )}
                            </button>
                        ))}
                    </div>

                    {(canScrollPrev || canScrollNext) && (
                      <>
                        <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-white via-white/70 to-transparent" />
                        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white via-white/70 to-transparent" />

                        <button
                          type="button"
                          onClick={() => scrollByCards('prev')}
                          disabled={!canScrollPrev}
                          className={`absolute left-1 top-1/2 -translate-y-1/2 h-9 w-9 rounded-2xl ring-1 shadow-sm transition-all ${
                            canScrollPrev
                              ? 'bg-white/90 ring-emerald-200/70 text-emerald-900 hover:bg-emerald-50'
                              : 'bg-white/60 ring-emerald-100/60 text-emerald-900/30 cursor-not-allowed'
                          }`}
                          aria-label="تمرير لليسار"
                        >
                          <ChevronLeft size={18} className="mx-auto" />
                        </button>

                        <button
                          type="button"
                          onClick={() => scrollByCards('next')}
                          disabled={!canScrollNext}
                          className={`absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 rounded-2xl ring-1 shadow-sm transition-all ${
                            canScrollNext
                              ? 'bg-white/90 ring-emerald-200/70 text-emerald-900 hover:bg-emerald-50'
                              : 'bg-white/60 ring-emerald-100/60 text-emerald-900/30 cursor-not-allowed'
                          }`}
                          aria-label="تمرير لليمين"
                        >
                          <ChevronRight size={18} className="mx-auto" />
                        </button>

                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                          <div className="flex items-center gap-1 rounded-full bg-white/80 ring-1 ring-emerald-100/70 px-2 py-1 text-[10px] font-black text-emerald-900/80">
                            <span>يوجد المزيد</span>
                            <ChevronRight size={12} />
                          </div>
                        </div>
                      </>
                    )}
                </div>

                {/* Account Type & Statement Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    <div className="space-y-4">
                        <label className="text-[11px] font-black text-emerald-900/70 px-2">نوع العملية</label>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { id: 'advance_payment', label: 'عربون (دفعة مقدمة)', icon: <Wallet size={16} /> },
                                { id: 'payment', label: 'إيراد (دفعة مباشرة)', icon: <Banknote size={16} /> }
                            ].map((type) => (
                                <button
                                    key={type.id}
                                    onClick={() => setAccountType(type.id as any)}
                                    className={`
                                        flex items-center justify-center gap-2 p-3 rounded-2xl border-2 transition-all text-xs font-black
                                        ${accountType === type.id 
                                            ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-sm' 
                                            : 'bg-white/70 border-emerald-100 text-gray-500 hover:border-emerald-200 hover:bg-emerald-50/40'
                                        }
                                    `}
                                >
                                    {type.icon}
                                    <span>{type.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="text-[11px] font-black text-emerald-900/70 px-2">البيان / الوصف</label>
                        <select
                          value={statementPresets.includes(statement) ? statement : ''}
                          onChange={(e) => setStatement(e.target.value)}
                          className="w-full p-3 bg-white border border-emerald-200 rounded-2xl text-xs font-black text-emerald-950 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-600 outline-none transition-all"
                        >
                          <option value="">اختر بياناً جاهزاً</option>
                          {statementPresets.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        <input 
                            type="text"
                            value={statement}
                            onChange={(e) => setStatement(e.target.value)}
                            placeholder="أو اكتب بياناً مخصصاً..."
                            className="w-full p-3 bg-white/70 border border-emerald-200 rounded-2xl text-xs font-black text-emerald-950 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-600 outline-none transition-all"
                        />
                    </div>
                </div>

                {/* Reference Number & Receipt Toggle */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    <div className="space-y-3">
                        <label className="text-[11px] font-black text-emerald-900/70 px-2">رقم المرجع / ملاحظات</label>
                        <div className="relative">
                            <input 
                                type="text"
                                value={referenceNumber}
                                onChange={(e) => setReferenceNumber(e.target.value)}
                                placeholder={t('رقم الحوالة، آخر 4 أرقام...', 'Reference number...')}
                                className="w-full p-3 bg-white/70 border border-emerald-200 rounded-2xl text-xs font-black text-emerald-950 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-600 outline-none transition-all pr-10"
                            />
                            <div className="absolute inset-y-0 right-4 flex items-center text-gray-300">
                                <Landmark size={16} />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col justify-end">
                        <label className={`
                            flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer group
                            ${isPaid ? 'bg-emerald-50 border-emerald-200 shadow-sm' : 'bg-white/70 border-emerald-100 hover:border-emerald-200'}
                        `}>
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isPaid ? 'bg-emerald-800 text-white' : 'bg-emerald-50 text-emerald-800 group-hover:bg-emerald-100'}`}>
                                    <ShieldCheck size={18} />
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-gray-900 leading-none">تأكيد الاستلام</p>
                                    <p className="text-[8px] font-bold text-emerald-900/55 mt-1">يظهر كمدفوع فوراً</p>
                                </div>
                            </div>
                            <div className="relative flex items-center">
                                <input 
                                    type="checkbox"
                                    className="hidden"
                                    checked={isPaid}
                                    onChange={(e) => setIsPaid(e.target.checked)}
                                />
                                <div className={`w-10 h-5 rounded-full p-1 transition-all duration-300 ${isPaid ? 'bg-emerald-800' : 'bg-emerald-100'}`}>
                                    <div className={`w-3 h-3 bg-white rounded-full transition-all duration-300 transform ${isPaid ? 'mr-5' : 'mr-0'}`}></div>
                                </div>
                            </div>
                        </label>
                    </div>
                </div>
            </div>
          )}

          {/* 3. Final Summary Card */}
          <div className="bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden ring-1 ring-emerald-900/20">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-[110px] -mr-32 -mt-32 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full blur-[90px] -ml-24 -mb-24 pointer-events-none"></div>
            
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/10 backdrop-blur-md">
                  <Receipt size={20} className="text-emerald-100" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white">ملخص المستحقات المالية</h3>
                  <p className="text-[10px] text-white/70 font-bold mt-0.5">يوضح المتبقي بعد خصم العربون</p>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="flex justify-between items-center text-xs font-bold group">
                <span className="text-white/80 group-hover:text-white transition-colors">إجمالي الفاتورة النهائية</span>
                <span className="text-white tracking-tight">{pricingResult.finalTotal.toLocaleString()} ر.س</span>
              </div>
              
              <div className="flex justify-between items-center text-xs font-bold group">
                <span className="text-white/80 group-hover:text-white transition-colors">قيمة العربون (المقدم)</span>
                <span className="text-emerald-100 tracking-tight">-{depositAmount.toLocaleString()} ر.س</span>
              </div>

              <div className="h-px bg-white/5 my-6"></div>

              <div className="flex justify-between items-center relative">
                <div className="space-y-2">
                  <span className="text-white/75 text-[10px] font-black tracking-[0.2em]">المبلغ المتبقي للتحصيل</span>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse"></div>
                    <span className="text-[10px] text-emerald-100 font-black tracking-tighter">الحالة: متوازن مالياً</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-black text-white tracking-tighter leading-none mb-1">
                    {(pricingResult.finalTotal - depositAmount).toLocaleString()}
                  </div>
                  <span className="text-[10px] text-white/70 font-black tracking-widest">ريال سعودي</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Actions */}
      <div className="flex gap-4 pt-4">
        <button
          onClick={onBack}
          className="flex-1 bg-white/70 ring-1 ring-emerald-200/70 text-emerald-950 py-4 rounded-[1.5rem] font-black text-sm hover:bg-emerald-50 transition-all flex items-center justify-center gap-3 group shadow-sm"
        >
          <ArrowRight size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span>رجوع</span>
        </button>
        <button
          onClick={handleNext}
          disabled={depositAmount > 0 && isPaid && !selectedMethodId}
          className="flex-[2] bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white py-4 rounded-[1.5rem] font-black text-sm hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800 transition-all shadow-sm flex items-center justify-center gap-3 group"
        >
          <span>مراجعة وتأكيد الحجز</span>
          <CheckCircle2 size={20} className="group-hover:scale-110 transition-transform" />
        </button>
      </div>
    </div>
  );
};
