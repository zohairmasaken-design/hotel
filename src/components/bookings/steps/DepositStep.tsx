import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PricingResult } from './PricingStep';
import { Wallet, CreditCard, Banknote, Loader2, ArrowRight, CheckCircle2, Globe, Coins, ShieldCheck, Receipt, Landmark, LayoutGrid, ChevronRight } from 'lucide-react';
import { useAppLanguage } from '@/hooks/useAppLanguage';

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
  const language = languageProp ?? storedLanguage;
  const t = (arText: string, enText: string) => (language === 'en' ? enText : arText);
  const [loading, setLoading] = useState(true);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [userName, setUserName] = useState<string>('');
  
  const [depositAmount, setDepositAmount] = useState<number>(initialData?.depositAmount || Math.round(pricingResult.finalTotal / 2));
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
      const { data, error } = await supabase
        .from('payment_methods')
        .select('id, name')
        .eq('is_active', true);

      if (data) {
        setPaymentMethods(data);
        if (!selectedMethodId && data.length > 0) {
          setSelectedMethodId(data[0].id);
        }
      }

      setLoading(false);
    };

    fetchMethodsAndUser();
  }, []);

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
            <div className="w-16 h-16 border-4 border-blue-100 rounded-full"></div>
            <div className="w-16 h-16 border-4 border-t-blue-600 rounded-full animate-spin absolute top-0 left-0"></div>
        </div>
        <p className="text-sm font-black text-gray-400 animate-pulse">جاري تحميل طرق الدفع...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      
      {/* Main Container */}
      <div className="bg-white border border-gray-100 rounded-[2.5rem] overflow-hidden shadow-xl shadow-gray-100/50">
        {/* Header */}
        <div className="bg-gray-50/50 px-8 py-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Wallet size={24} />
            </div>
            <div>
              <h3 className="font-black text-lg text-gray-900">تسجيل العربون</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Advance Payment Details</p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">إجمالي الحجز</span>
            <span className="text-lg font-black text-gray-900">{pricingResult.finalTotal.toLocaleString()} <span className="text-xs font-normal">ر.س</span></span>
          </div>
        </div>

        <div className="p-8 space-y-10">
          
          {/* 1. Deposit Amount Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                        <Coins size={18} />
                    </div>
                    <h4 className="font-black text-sm text-gray-900 uppercase tracking-tighter">قيمة العربون المدفوع</h4>
                </div>
                <div className="flex gap-2">
                    {[
                        { label: '0%', val: 0 },
                        { label: '50%', val: Math.round(pricingResult.finalTotal / 2) },
                        { label: '100%', val: pricingResult.finalTotal }
                    ].map((opt) => (
                        <button
                            key={opt.label}
                            onClick={() => setDepositAmount(opt.val)}
                            className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all border ${depositAmount === opt.val ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100' : 'bg-white text-gray-400 border-gray-100 hover:border-blue-200'}`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="relative group">
                <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(Number(e.target.value))}
                    className="w-full p-6 bg-gray-50 border-2 border-gray-50 rounded-[2rem] text-4xl font-black text-blue-600 focus:bg-white focus:border-blue-500 focus:ring-8 focus:ring-blue-500/5 outline-none transition-all text-center"
                />
                <div className="absolute inset-y-0 left-8 flex items-center pointer-events-none">
                    <span className="text-gray-300 font-black text-xl">ر.س</span>
                </div>
                <div className="absolute inset-y-0 right-8 flex items-center pointer-events-none opacity-0 group-focus-within:opacity-100 transition-opacity">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                </div>
            </div>
          </div>

          {/* 2. Payment Methods Section (Horizontal Scroll) */}
          {depositAmount > 0 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                            <LayoutGrid size={18} />
                        </div>
                        <h4 className="font-black text-sm text-gray-900 uppercase tracking-tighter">اختر طريقة الدفع</h4>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-black text-gray-300 uppercase italic">
                        <span>تمرير</span>
                        <ArrowRight size={10} className="rotate-180" />
                    </div>
                </div>

                <div className="relative group">
                    <div 
                        ref={scrollRef}
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
                                    flex-none w-28 p-4 rounded-[1.5rem] border-2 transition-all duration-500 flex flex-col items-center gap-2
                                    ${selectedMethodId === method.id 
                                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-lg shadow-emerald-100 scale-105 z-10' 
                                        : 'bg-white border-gray-50 text-gray-400 hover:border-emerald-200 hover:bg-gray-50/50'
                                    }
                                `}
                            >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 ${selectedMethodId === method.id ? 'bg-emerald-500 text-white shadow-md' : 'bg-gray-50 text-gray-400'}`}>
                                    {React.cloneElement(getIcon(method.name) as React.ReactElement<any>, { size: 20 })}
                                </div>
                                <span className="text-[10px] font-black text-center leading-tight h-6 flex items-center">{method.name}</span>
                                {selectedMethodId === method.id && (
                                    <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Account Type & Statement Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">نوع الحساب</label>
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
                                            ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm' 
                                            : 'bg-white border-gray-100 text-gray-400 hover:border-blue-200'
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
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">البيان / الوصف</label>
                        <div className="flex flex-wrap gap-2">
                            {[
                                'جاري المالك سعد',
                                'حساب مساكن الرفاهية',
                                `استلام نقد من قبل ${userName || 'المستخدم'}`
                            ].map((opt) => (
                                <button
                                    key={opt}
                                    onClick={() => setStatement(opt)}
                                    className={`
                                        px-3 py-2 rounded-xl text-[10px] font-black transition-all border
                                        ${statement === opt 
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                                            : 'bg-gray-50 text-gray-500 border-gray-100 hover:border-indigo-200'
                                        }
                                    `}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                        <input 
                            type="text"
                            value={statement}
                            onChange={(e) => setStatement(e.target.value)}
                            placeholder="أو اكتب بياناً مخصصاً..."
                            className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-black text-gray-900 focus:bg-white focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all"
                        />
                    </div>
                </div>

                {/* Reference Number & Receipt Toggle */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">رقم المرجع / ملاحظات</label>
                        <div className="relative">
                            <input 
                                type="text"
                                value={referenceNumber}
                                onChange={(e) => setReferenceNumber(e.target.value)}
                                placeholder={t('رقم الحوالة، آخر 4 أرقام...', 'Reference number...')}
                                className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-black text-gray-900 focus:bg-white focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all pr-10"
                            />
                            <div className="absolute inset-y-0 right-4 flex items-center text-gray-300">
                                <Landmark size={16} />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col justify-end">
                        <label className={`
                            flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer group
                            ${isPaid ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-gray-100 hover:border-indigo-100'}
                        `}>
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isPaid ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400 group-hover:bg-indigo-100 group-hover:text-indigo-600'}`}>
                                    <ShieldCheck size={18} />
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-gray-900 leading-none">تأكيد الاستلام</p>
                                    <p className="text-[8px] font-bold text-gray-400 mt-1 uppercase">Instant Receipt</p>
                                </div>
                            </div>
                            <div className="relative flex items-center">
                                <input 
                                    type="checkbox"
                                    className="hidden"
                                    checked={isPaid}
                                    onChange={(e) => setIsPaid(e.target.checked)}
                                />
                                <div className={`w-10 h-5 rounded-full p-1 transition-all duration-300 ${isPaid ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                                    <div className={`w-3 h-3 bg-white rounded-full transition-all duration-300 transform ${isPaid ? 'mr-5' : 'mr-0'}`}></div>
                                </div>
                            </div>
                        </label>
                    </div>
                </div>
            </div>
          )}

          {/* 3. Final Summary Card */}
          <div className="bg-gray-950 text-white rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden border border-white/10">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full blur-[100px] -mr-32 -mt-32 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-600/5 rounded-full blur-[80px] -ml-24 -mb-24 pointer-events-none"></div>
            
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/10 backdrop-blur-md">
                  <Receipt size={20} className="text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-gray-100">ملخص المستحقات المالية</h3>
                  <p className="text-[9px] text-white/30 font-black uppercase tracking-[0.3em] mt-0.5">Payment Distribution Summary</p>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="flex justify-between items-center text-xs font-bold group">
                <span className="text-gray-500 group-hover:text-gray-400 transition-colors italic">إجمالي الفاتورة النهائية</span>
                <span className="text-gray-200 tracking-tight">{pricingResult.finalTotal.toLocaleString()} ر.س</span>
              </div>
              
              <div className="flex justify-between items-center text-xs font-bold group animate-in fade-in slide-in-from-right-2">
                <span className="text-gray-500 group-hover:text-gray-400 transition-colors italic">قيمة العربون (المقدم)</span>
                <span className="text-blue-400 tracking-tight">-{depositAmount.toLocaleString()} ر.س</span>
              </div>

              <div className="h-px bg-white/5 my-6"></div>

              <div className="flex justify-between items-center relative">
                <div className="space-y-2">
                  <span className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em]">المبلغ المتبقي للتحصيل</span>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse"></div>
                    <span className="text-[10px] text-emerald-500 font-black uppercase tracking-tighter">الحالة: متوازن مالياً</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-black text-white tracking-tighter leading-none mb-1">
                    {(pricingResult.finalTotal - depositAmount).toLocaleString()}
                  </div>
                  <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">ريال سعودي</span>
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
          className="flex-1 bg-white border-2 border-gray-100 text-gray-600 py-4 rounded-[1.5rem] font-black text-sm hover:bg-gray-50 hover:border-gray-200 transition-all flex items-center justify-center gap-3 group shadow-sm"
        >
          <ArrowRight size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span>رجوع</span>
        </button>
        <button
          onClick={handleNext}
          disabled={depositAmount > 0 && isPaid && !selectedMethodId}
          className="flex-[2] bg-blue-600 text-white py-4 rounded-[1.5rem] font-black text-sm hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center justify-center gap-3 group"
        >
          <span>مراجعة وتأكيد الحجز</span>
          <CheckCircle2 size={20} className="group-hover:scale-110 transition-transform" />
        </button>
      </div>
    </div>
  );
};
