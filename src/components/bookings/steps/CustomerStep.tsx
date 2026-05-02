'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Plus, User, Check, X, Loader2, UserPlus, ChevronDown } from 'lucide-react';
import { countries } from '@/constants/countries';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { useActiveHotel } from '@/hooks/useActiveHotel';

const bookingPlatforms = [
  'Booking.com',
  'Agoda',
  'Airbnb',
  'Expedia',
  'Hotels.com',
  'Trip.com',
  'Google Hotels',
  'Gathern (جاذر إن)',
  'Almatar (المطار)',
  'Almosafer (المسافر)',
  'Ego (إيجو)',
  'Holidays (عطلات)',
  'Flynas',
  'Saudia Holidays',
  'MyTable',
  'HungerStation',
  'Jahez',
  'Other (أخرى)'
];

export interface Customer {
  id: string;
  full_name: string;
  national_id?: string;
  phone: string;
  customer_type: 'individual' | 'company' | 'broker' | 'platform';
  nationality?: string;
  email?: string;
  address?: string;
  details?: string;
  commercial_register?: string;
  tax_number?: string;
  company_name?: string;
  broker_name?: string;
  broker_id?: string;
  platform_name?: string;
  created_at: string;
}

interface CustomerStepProps {
  onNext: (customer: Customer, meta?: { bookingSource?: 'reception'|'platform'|'broker'; platformName?: string; brokerName?: string; brokerId?: string }) => void;
  initialCustomer?: Customer;
  initialQuery?: string;
  language?: 'ar' | 'en';
}

export const CustomerStep: React.FC<CustomerStepProps> = ({ onNext, initialCustomer, initialQuery, language: languageProp }) => {
  const { language: storedLanguage } = useAppLanguage();
  const { activeHotelId } = useActiveHotel();
  const language = languageProp ?? storedLanguage;
  const t = (arText: string, enText: string) => (language === 'en' ? enText : arText);
  // Supabase client is imported globally
  const [searchQuery, setSearchQuery] = useState(initialQuery || '');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(initialCustomer || null);
  const [isCreating, setIsCreating] = useState(false);
  const [bookingSource, setBookingSource] = useState<'reception' | 'platform' | 'broker'>(() => {
    if (typeof window === 'undefined') return 'reception';
    return (sessionStorage.getItem('booking_source') as any) || 'reception';
  });
  const [platformName, setPlatformName] = useState<string>(() => (typeof window !== 'undefined' ? (sessionStorage.getItem('platform_name') || '') : ''));
  const [brokerName, setBrokerName] = useState<string>(() => (typeof window !== 'undefined' ? (sessionStorage.getItem('broker_name') || '') : ''));
  const [brokerId, setBrokerId] = useState<string>(() => (typeof window !== 'undefined' ? (sessionStorage.getItem('broker_id') || '') : ''));
  
  // New Customer Form State
  const [formData, setFormData] = useState<Partial<Customer>>({
    customer_type: 'individual',
    nationality: language === 'en' ? 'Saudi Arabia' : 'السعودية'
  });
  const [saving, setSaving] = useState(false);

  // Nationality Combobox State
  const [nationalityQuery, setNationalityQuery] = useState('');
  const [isNationalityOpen, setIsNationalityOpen] = useState(false);
  const nationalityWrapperRef = useRef<HTMLDivElement>(null);
  const [documentType, setDocumentType] = useState<string>('');
  const [nationalIdError, setNationalIdError] = useState<string>('');
  const searchReqIdRef = useRef(0);
  const [branchCustomers, setBranchCustomers] = useState<Customer[]>([]);
  const [branchCustomersLoading, setBranchCustomersLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!activeHotelId || activeHotelId === 'all') {
        setBranchCustomers([]);
        return;
      }
      setBranchCustomersLoading(true);
      try {
        const { data: bRows, error: bErr } = await supabase
          .from('bookings')
          .select('customer_id, created_at')
          .eq('hotel_id', activeHotelId)
          .not('customer_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(30);
        if (bErr) throw bErr;
        const ids = Array.from(new Set((bRows || []).map((r: any) => String(r.customer_id)).filter(Boolean))).slice(0, 10);
        if (ids.length === 0) {
          setBranchCustomers([]);
          return;
        }
        const { data: cRows, error: cErr } = await supabase
          .from('customers')
          .select('*')
          .in('id', ids);
        if (cErr) throw cErr;
        const byId = new Map<string, Customer>();
        (cRows || []).forEach((c: any) => byId.set(String(c.id), c as Customer));
        setBranchCustomers(ids.map((id) => byId.get(id)).filter(Boolean) as Customer[]);
      } catch {
        setBranchCustomers([]);
      } finally {
        setBranchCustomersLoading(false);
      }
    };
    load();
  }, [activeHotelId]);

  // Initialize nationality query when creating
  useEffect(() => {
    if (isCreating) {
      setNationalityQuery(formData.nationality || '');
    }
  }, [isCreating]);

  // Handle click outside nationality dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (nationalityWrapperRef.current && !nationalityWrapperRef.current.contains(event.target as Node)) {
        setIsNationalityOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('booking_source', bookingSource);
      sessionStorage.setItem('platform_name', platformName || '');
      sessionStorage.setItem('broker_name', brokerName || '');
      sessionStorage.setItem('broker_id', brokerId || '');
    }
  }, [bookingSource, platformName, brokerName, brokerId]);

  const filteredCountries = countries.filter(country => 
    country.name_ar.includes(nationalityQuery) || 
    country.name_en.toLowerCase().includes(nationalityQuery.toLowerCase())
  );

  // Search Effect
  useEffect(() => {
    const searchCustomers = async () => {
      const q = searchQuery.trim();
      if (!q) {
        setCustomers([]);
        return;
      }

      const digits = q.replace(/\D+/g, '');
      const isDigits = digits.length === q.length;
      const minLen = isDigits ? 3 : 2;
      if (q.length < minLen) {
        setCustomers([]);
        return;
      }

      const reqId = ++searchReqIdRef.current;
      setLoading(true);
      try {
        let query: any = supabase.from('customers').select('*').limit(5);
        if (isDigits) {
          if (digits.length === 10) {
            query = query.or(`national_id.eq.${digits},phone.ilike.${digits}%`);
          } else {
            query = query.or(`phone.ilike.${digits}%,national_id.ilike.${digits}%`);
          }
        } else {
          const safe = q.replace(/[,()]/g, ' ');
          query = query.or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%,national_id.ilike.%${safe}%`);
        }
        const { data, error } = await query;

        if (reqId !== searchReqIdRef.current) return;
        if (!error && data) setCustomers(data);
        if (error) setCustomers([]);
      } finally {
        if (reqId === searchReqIdRef.current) setLoading(false);
      }
    };

    const timeoutId = setTimeout(searchCustomers, 250);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name || !formData.phone) return;

    // Validate National ID
    if (formData.national_id) {
      if (!/^\d{10}$/.test(formData.national_id)) {
        setNationalIdError(t('رقم الهوية يجب أن يتكون من 10 أرقام بالضبط', 'ID number must be exactly 10 digits'));
        return;
      }
    }

    // Check for duplicates before submitting (Nationality + National ID)
    if (formData.nationality?.trim() && formData.national_id?.trim()) {
      const { data: existing, error: checkError } = await supabase
        .from('customers')
        .select('id, full_name, nationality')
        .eq('nationality', formData.nationality.trim())
        .eq('national_id', formData.national_id.trim())
        .maybeSingle();

      if (checkError) {
        console.error('Error checking for duplicate customer:', checkError);
      }

      if (existing) {
        alert(`${t('يوجد عميل مسجل مسبقاً بنفس الجنسية ورقم الهوية', 'A customer with the same nationality and ID already exists')}: ${existing.full_name} (${existing.nationality})`);
        return;
      }
    }

    setSaving(true);
    const detailsLine = documentType ? `${t('نوع الوثيقة', 'Document type')}: ${documentType}` : '';
    const detailsCombined = [formData.details?.trim(), detailsLine].filter(Boolean).join('\n');
    const { data, error } = await supabase
      .from('customers')
      .insert([{ ...formData, details: detailsCombined }])
      .select()
      .single();

    if (!error && data) {
      setSelectedCustomer(data);
      setIsCreating(false);
      // Optional: onNext(data); // Auto advance? Maybe better to let user review then click next.
    } else {
      console.error('Error creating customer:', JSON.stringify(error, null, 2));
      alert(`${t('حدث خطأ أثناء إضافة العميل', 'Error while creating customer')}: ${error?.message || t('خطأ غير معروف', 'Unknown error')}`);
    }
    setSaving(false);
  };

  const handleSmartCreate = () => {
    const query = searchQuery.trim();
    // Check if query contains only digits
    const isDigits = /^\d+$/.test(query);
    const newFormData: Partial<Customer> = { 
      ...formData,
      customer_type: 'individual',
      nationality: language === 'en' ? 'Saudi Arabia' : 'السعودية'
    };

    if (isDigits) {
      if (query.startsWith('05')) {
        newFormData.phone = query;
      } else if (query.length === 10) {
        newFormData.national_id = query;
      } else {
        newFormData.phone = query; // Default to phone for other numbers
      }
    } else {
      newFormData.full_name = query;
    }

    setFormData(newFormData);
    // If we have a name, we might want to reset nationality query if it was set before
    if (newFormData.nationality) {
        setNationalityQuery(newFormData.nationality);
    }
    setIsCreating(true);
  };

  if (selectedCustomer && !isCreating) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto">
        <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 flex justify-between items-center shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
              <User size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">{selectedCustomer.full_name}</h3>
              <div className="flex gap-3 text-xs text-gray-600 mt-0.5">
                <span className="font-medium">{selectedCustomer.phone}</span>
                <span className="text-gray-300">•</span>
                <span>{selectedCustomer.national_id || t('لا يوجد هوية', 'No ID')}</span>
              </div>
            </div>
          </div>
          <button 
            onClick={() => setSelectedCustomer(null)}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
          >
            <X size={18} />
          </button>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <label className="text-xs font-bold text-gray-700 block mb-2">{t('مصدر الحجز', 'Booking source')}</label>
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              onClick={() => setBookingSource('reception')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${bookingSource === 'reception' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              {t('استقبال', 'Front desk')}
            </button>
            <button
              type="button"
              onClick={() => setBookingSource('platform')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${bookingSource === 'platform' ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              {t('منصة حجز', 'Platform')}
            </button>
            <button
              type="button"
              onClick={() => setBookingSource('broker')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${bookingSource === 'broker' ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              {t('وسيط', 'Broker')}
            </button>
          </div>
          {bookingSource === 'platform' && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">{t('منصة الحجز', 'Booking platform')}</label>
              <select
                className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-bold text-gray-900 appearance-none bg-white"
                value={platformName}
                onChange={e => setPlatformName(e.target.value)}
              >
                <option value="">{t('اختر المنصة...', 'Select platform...')}</option>
                {bookingPlatforms.map(platform => (
                  <option key={platform} value={platform}>{platform}</option>
                ))}
              </select>
            </div>
          )}
          {bookingSource === 'broker' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">{t('اسم الوسيط', 'Broker name')}</label>
                <input
                  type="text"
                  className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-bold text-gray-900 placeholder:text-gray-400 placeholder:font-normal"
                  value={brokerName}
                  onChange={e => setBrokerName(e.target.value)}
                  placeholder={t('اسم الوسيط', 'Broker name')}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">{t('رقم هوية الوسيط', 'Broker ID')}</label>
                <input
                  type="text"
                  className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-bold text-gray-900 placeholder:text-gray-400 placeholder:font-normal"
                  value={brokerId}
                  onChange={e => setBrokerId(e.target.value)}
                  placeholder={t('رقم الهوية الوطنية للوسيط', 'Broker national ID')}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => onNext(selectedCustomer, { bookingSource, platformName, brokerName, brokerId })}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-200 text-sm"
          >
            <span>{t('التالي: اختيار الوحدة', 'Next: Unit selection')}</span>
            <Check size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!isCreating ? (
        <>
          {activeHotelId && activeHotelId !== 'all' && (
            <div className="max-w-2xl mx-auto bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-sm font-extrabold text-gray-900">{t('عملاء هذا الفرع', 'Branch customers')}</div>
                {branchCustomersLoading ? <Loader2 className="animate-spin text-blue-600" size={16} /> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {branchCustomers.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setSelectedCustomer(c)}
                    className="px-3 py-2 rounded-xl border border-gray-200 hover:bg-blue-50 hover:border-blue-200 text-sm font-bold text-gray-800"
                  >
                    {c.full_name}
                  </button>
                ))}
                {!branchCustomersLoading && branchCustomers.length === 0 ? (
                  <div className="text-xs text-gray-500">{t('لا توجد بيانات حديثة لهذا الفرع', 'No recent data for this branch')}</div>
                ) : null}
              </div>
            </div>
          )}
          <div className="relative group max-w-2xl mx-auto">
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors">
              <Search size={20} />
            </div>
            <input
              type="text"
              placeholder={t('ابحث بالاسم، رقم الجوال، أو رقم الهوية...', 'Search by name, mobile, or ID...')}
              className="w-full pl-4 pr-12 py-3 border-2 border-gray-100 rounded-xl text-base font-medium text-gray-900 placeholder:text-gray-400 focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {loading && (
              <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-white p-1 rounded-full shadow-sm">
                <Loader2 className="animate-spin text-blue-600" size={20} />
              </div>
            )}
          </div>

          <div className="space-y-2 max-w-2xl mx-auto">
            {customers.map((customer) => (
              <div
                key={customer.id}
                onClick={() => setSelectedCustomer(customer)}
                className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:bg-blue-50/50 hover:border-blue-200 cursor-pointer transition-all group shadow-sm hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                    <User size={20} />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 text-base group-hover:text-blue-700 transition-colors">{customer.full_name}</div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                      <span className="flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-gray-300 group-hover:bg-blue-400"></span>
                        {customer.phone}
                      </span>
                      {customer.national_id && (
                        <span className="flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-gray-300 group-hover:bg-blue-400"></span>
                          {customer.national_id}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="px-3 py-1.5 bg-gray-50 text-gray-400 rounded-lg text-xs font-medium group-hover:bg-blue-100 group-hover:text-blue-700 transition-all">
                  {t('اختيار', 'Select')}
                </div>
              </div>
            ))}

            {customers.length === 0 && searchQuery && !loading && (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm mb-4">{t(`لا توجد نتائج مطابقة لـ "${searchQuery}"`, `No results match "${searchQuery}"`)}</p>
                <button
                  onClick={handleSmartCreate}
                  className="px-6 py-2 bg-blue-50 text-blue-600 rounded-xl font-bold hover:bg-blue-100 transition-all flex items-center gap-2 mx-auto"
                >
                  <UserPlus size={18} />
                  <span>{t(`تسجيل "${searchQuery}" كعميل جديد`, `Register "${searchQuery}" as a new customer`)}</span>
                </button>
              </div>
            )}
          </div>

          <div className="pt-4 border-t max-w-2xl mx-auto">
            <button
              onClick={() => setIsCreating(true)}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-medium hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 text-sm"
            >
              <Plus size={18} />
              <span>{t('تسجيل عميل جديد', 'Register new customer')}</span>
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={handleCreateCustomer} className="max-w-3xl mx-auto bg-white border border-gray-100 rounded-2xl p-5 shadow-lg shadow-gray-100/50 animate-in zoom-in-95 duration-300">
          <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-6">
            <h3 className="text-base font-bold flex items-center gap-2 text-gray-800">
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <UserPlus size={18} />
              </div>
              {t('بيانات العميل الجديد', 'New customer details')}
            </h3>
            <button 
              type="button" 
              onClick={() => setIsCreating(false)}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
            >
              <X size={18} />
            </button>
          </div>
          
          <div className="mb-4">
            <label className="text-xs font-bold text-gray-700 block mb-1">{t('مصدر الحجز', 'Booking source')}</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setBookingSource('reception')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${bookingSource === 'reception' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {t('استقبال', 'Front desk')}
              </button>
              <button
                type="button"
                onClick={() => setBookingSource('platform')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${bookingSource === 'platform' ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {t('منصة حجز', 'Platform')}
              </button>
              <button
                type="button"
                onClick={() => setBookingSource('broker')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${bookingSource === 'broker' ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {t('وسيط', 'Broker')}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">{t('نوع العميل', 'Customer type')}</label>
              <select
                className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-bold text-gray-900 bg-white"
                value={formData.customer_type}
                onChange={e => {
                  const newType = e.target.value as any;
                  setFormData(prev => ({
                    ...prev, 
                    customer_type: newType
                  }));
                }}
              >
                <option value="individual">{t('فرد', 'Individual')}</option>
                <option value="company">{t('شركة', 'Company')}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">{t('الاسم الكامل', 'Full name')} <span className="text-red-500">*</span></label>
              <input
                required
                type="text"
                className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-bold text-gray-900 placeholder:text-gray-400 placeholder:font-normal"
                value={formData.full_name || ''}
                onChange={e => setFormData({...formData, full_name: e.target.value})}
                placeholder={t('الاسم الثلاثي', 'Full name')}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">{t('رقم الجوال', 'Mobile')} <span className="text-red-500">*</span></label>
              <input
                required
                type="tel"
                className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-bold text-gray-900 placeholder:text-gray-400 placeholder:font-normal text-left"
                dir="ltr"
                placeholder="05xxxxxxxx"
                value={formData.phone || ''}
                onChange={e => setFormData({...formData, phone: e.target.value})}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">{t('رقم الهوية / الإقامة', 'ID / Iqama')}</label>
              <input
                type="text"
                className={`w-full p-2.5 border ${nationalIdError ? 'border-red-500' : 'border-gray-200'} rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-bold text-gray-900 placeholder:text-gray-400 placeholder:font-normal`}
                value={formData.national_id || ''}
                onChange={e => {
                  const val = e.target.value;
                  // Only allow digits
                  if (val && !/^\d*$/.test(val)) return;
                  // Max 10 digits
                  if (val.length > 10) return;
                  
                  setFormData({...formData, national_id: val});
                  if (val.length === 10) {
                    setNationalIdError('');
                  } else if (val.length > 0) {
                    setNationalIdError(t('يجب أن يكون 10 أرقام', 'Must be 10 digits'));
                  } else {
                    setNationalIdError('');
                  }
                }}
                placeholder="1xxxxxxxx / 2xxxxxxxx"
                maxLength={10}
              />
              {nationalIdError && <p className="text-xs text-red-500">{nationalIdError}</p>}
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">{t('نوع وثيقة الهوية', 'Document type')}</label>
              <select
                className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-bold text-gray-900 appearance-none bg-white"
                value={documentType}
                onChange={e => setDocumentType(e.target.value)}
              >
                <option value="">{t('اختر نوع الوثيقة', 'Select document type')}</option>
                <option value={t('هوية وطنية', 'National ID')}>{t('هوية وطنية', 'National ID')}</option>
                <option value={t('إقامة', 'Iqama')}>{t('إقامة', 'Iqama')}</option>
                <option value={t('بطاقة مجلس التعاون الخليجي', 'GCC ID')}>{t('بطاقة مجلس التعاون الخليجي', 'GCC ID')}</option>
                <option value={t('جواز سفر', 'Passport')}>{t('جواز سفر', 'Passport')}</option>
              </select>
              <p className="text-[11px] text-gray-500">
                {t('يرجى اختيار نوع الهوية قبل حفظ العميل.', 'Please choose the document type before saving the customer.')}
              </p>
            </div>

            <div className="space-y-1.5" ref={nationalityWrapperRef}>
              <label className="text-xs font-bold text-gray-700">{t('الجنسية', 'Nationality')}</label>
              <div className="relative">
                <input
                  type="text"
                  className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-bold text-gray-900 placeholder:text-gray-400 placeholder:font-normal"
                  value={nationalityQuery}
                  onChange={e => {
                    setNationalityQuery(e.target.value);
                    setFormData({...formData, nationality: e.target.value});
                    setIsNationalityOpen(true);
                  }}
                  onFocus={() => setIsNationalityOpen(true)}
                  placeholder={t('ابحث عن الدولة...', 'Search country...')}
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <ChevronDown size={16} />
                </div>
                
                {isNationalityOpen && filteredCountries.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                    {filteredCountries.map((country) => (
                      <div
                        key={country.code}
                        className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm text-gray-700 hover:text-blue-700 flex items-center justify-between group"
                        onClick={() => {
                          const selected = language === 'en' ? country.name_en : country.name_ar;
                          setNationalityQuery(selected);
                          setFormData({...formData, nationality: selected});
                          setIsNationalityOpen(false);
                        }}
                      >
                        <span className="font-medium">{language === 'en' ? country.name_en : country.name_ar}</span>
                        <span className="text-xs text-gray-400 group-hover:text-blue-400">{language === 'en' ? country.name_ar : country.name_en}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">{t('البريد الإلكتروني', 'Email')}</label>
              <input
                type="email"
                className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-bold text-gray-900 placeholder:text-gray-400 placeholder:font-normal text-left"
                value={formData.email || ''}
                onChange={e => setFormData({...formData, email: e.target.value})}
                placeholder="example@mail.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">{t('العنوان', 'Address')}</label>
              <input
                type="text"
                className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-bold text-gray-900 placeholder:text-gray-400 placeholder:font-normal"
                value={formData.address || ''}
                onChange={e => setFormData({...formData, address: e.target.value})}
                placeholder={t('المدينة - الحي', 'City - District')}
              />
            </div>
          </div>
          {formData.customer_type === 'individual' && (
            <div className="mt-4 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="text-xs font-bold text-gray-700">{t('تفاصيل إضافية (المرافقين، العائلة، إلخ)', 'Additional details (companions, family, etc.)')}</label>
              <textarea
                className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-bold text-gray-900 placeholder:text-gray-400 placeholder:font-normal h-24 resize-none"
                value={formData.details || ''}
                onChange={e => setFormData({...formData, details: e.target.value})}
                placeholder={t('اكتب هنا أسماء المرافقين (الزوجة، الأولاد) أو أي ملاحظات تشغيلية أخرى...', 'Write companions names or any operational notes...')}
              />
              <p className="text-[11px] text-gray-500">
                {t('يرجى إدخال تفاصيل إضافية هنا عند الحاجة (مثل المرافقين أو ملاحظات مهمة للاستقبال).', 'Add extra details here when needed (companions, operational notes for front desk).')}
              </p>
            </div>
          )}

          {formData.customer_type === 'company' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">{t('السجل التجاري', 'Commercial register')}</label>
                <input
                  type="text"
                  className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-bold text-gray-900 placeholder:text-gray-400 placeholder:font-normal"
                  value={formData.commercial_register || ''}
                  onChange={e => setFormData({...formData, commercial_register: e.target.value})}
                  placeholder={t('رقم السجل التجاري', 'CR number')}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">{t('اسم الشركة', 'Company name')}</label>
                <input
                  type="text"
                  className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-bold text-gray-900 placeholder:text-gray-400 placeholder:font-normal"
                  value={formData.company_name || ''}
                  onChange={e => setFormData({...formData, company_name: e.target.value})}
                  placeholder={t('اسم الشركة الكامل', 'Full company name')}
                />
              </div>
            </div>
          )}

          {bookingSource === 'broker' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">{t('اسم الوسيط', 'Broker name')}</label>
                <input
                  type="text"
                  className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-bold text-gray-900 placeholder:text-gray-400 placeholder:font-normal"
                  value={brokerName}
                  onChange={e => setBrokerName(e.target.value)}
                  placeholder={t('اسم الوسيط', 'Broker name')}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">{t('رقم هوية الوسيط', 'Broker ID')}</label>
                <input
                  type="text"
                  className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-bold text-gray-900 placeholder:text-gray-400 placeholder:font-normal"
                  value={brokerId}
                  onChange={e => setBrokerId(e.target.value)}
                  placeholder={t('رقم الهوية الوطنية للوسيط', 'Broker national ID')}
                />
              </div>
            </div>
          )}

          {bookingSource === 'platform' && (
            <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">{t('منصة الحجز', 'Booking platform')}</label>
                <div className="relative">
                  <select
                    className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-bold text-gray-900 appearance-none bg-white"
                    value={platformName}
                    onChange={e => setPlatformName(e.target.value)}
                  >
                    <option value="">{t('اختر المنصة...', 'Select platform...')}</option>
                    {bookingPlatforms.map(platform => (
                      <option key={platform} value={platform}>{platform}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 mt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              {t('إلغاء', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-blue-200 transition-all"
            >
              {saving && <Loader2 className="animate-spin" size={16} />}
              {t('حفظ العميل', 'Save customer')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
