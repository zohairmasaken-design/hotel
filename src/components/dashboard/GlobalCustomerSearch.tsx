'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Phone, User, AlertCircle, Calendar, BedDouble, Users, Loader2, Wrench, Copy } from 'lucide-react';
import { UnitType, PricingRule, calculateStayPrice } from '@/lib/pricing';
import { parseISO, isBefore, differenceInCalendarDays, format, addDays } from 'date-fns';
import { useAppLanguage } from '@/hooks/useAppLanguage';

type CustomerSummary = {
  id: string;
  full_name: string;
  phone?: string | null;
  national_id?: string | null;
  email?: string | null;
  nationality?: string | null;
  address?: string | null;
  details?: string | null;
  customer_type?: string | null;
};

type BookingSummary = {
  id: string;
  booking_number?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  status?: string | null;
  total_price?: number | null;
  unit_number?: string | null;
};

type ResultState = {
  customer: CustomerSummary;
  netBalance: number | null;
  bookings: BookingSummary[];
  isActiveToday: boolean;
  paymentsCount: number;
  lastBookingSourceLabel?: string | null;
};

type AvailabilitySummary = {
  unitType: UnitType;
  availableCount: number;
  totalPrice: number;
  nights: number;
};

export default function GlobalCustomerSearch({ language: languageProp }: { language?: 'ar' | 'en' }) {
  const { language: storedLanguage } = useAppLanguage();
  const language = languageProp ?? storedLanguage;
  const t = (arText: string, enText: string) => (language === 'en' ? enText : arText);
  const [mode, setMode] = useState<'customer' | 'availability'>('customer');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [typesLoading, setTypesLoading] = useState(false);

  const [startDate, setStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(addDays(new Date(), 30), 'yyyy-MM-dd'));
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [availabilitySummary, setAvailabilitySummary] = useState<AvailabilitySummary | null>(null);
  const [availableUnits, setAvailableUnits] = useState<Array<{ id: string; unit_number: string; status?: string | null }>>([]);

  useEffect(() => {
    const fetchMeta = async () => {
      setTypesLoading(true);
      const { data: types } = await supabase.from('unit_types').select('*');
      const { data: rules } = await supabase
        .from('pricing_rules')
        .select('*')
        .eq('active', true);
      if (types) setUnitTypes(types as UnitType[]);
      if (rules) setPricingRules(rules as PricingRule[]);
      setTypesLoading(false);
    };
    fetchMeta();
  }, []);

  const handleCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = query.trim();
    if (!value) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data: customers, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .or(`full_name.ilike.%${value}%,phone.ilike.%${value}%,national_id.ilike.%${value}%`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (customerError) {
        console.error('Global search - customers error:', customerError);
        setError(t('تعذر تحميل بيانات العميل. حاول مرة أخرى.', 'Failed to load customer data. Please try again.'));
        return;
      }

      if (!customers || customers.length === 0) {
        setError(t('لا يوجد عميل مطابق للبحث.', 'No customer matches your search.'));
        return;
      }

      const customer = customers[0] as any;

      const { data: statementData, error: statementError } = await supabase.rpc(
        'get_customer_statement',
        {
          p_customer_id: customer.id,
        }
      );

      let netBalance: number | null = null;
      if (statementError) {
        console.error('Global search - statement error:', statementError);
        netBalance = 0;
      } else if (statementData && statementData.length > 0) {
        const lastRow = statementData[statementData.length - 1] as {
          balance?: number | string | null;
        };
        netBalance = lastRow.balance != null ? Number(lastRow.balance) : 0;
      } else {
        netBalance = 0;
      }

      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('id, check_in, check_out, status, total_price, unit_id')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (bookingsError) {
        console.error('Global search - bookings error:', JSON.stringify(bookingsError));
      }

      const unitMap = new Map<string, string>();
      if (bookingsData && bookingsData.length > 0) {
        const unitIds = bookingsData
          .map((b) => b.unit_id)
          .filter((id) => id) as string[];

        if (unitIds.length > 0) {
          const { data: unitsData } = await supabase
            .from('units')
            .select('id, unit_number')
            .in('id', unitIds);

          if (unitsData) {
            unitsData.forEach((u) => {
              unitMap.set(u.id, u.unit_number);
            });
          }
        }
      }

      type BookingRow = {
        id: string;
        check_in?: string | null;
        check_out?: string | null;
        status?: string | null;
        total_price?: number | null;
        unit_id?: string | null;
      };

      const typedBookings: BookingRow[] = (bookingsData || []) as BookingRow[];
      // Get last booking source from system_events
      let lastBookingSourceLabel: string | null = null;
      if (typedBookings.length > 0) {
        const lastBookingId = typedBookings[0].id;
        try {
          const { data: sourceEvent } = await supabase
            .from('system_events')
            .select('payload')
            .eq('booking_id', lastBookingId)
            .eq('event_type', 'booking_source')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          const src = (sourceEvent?.payload as any) || null;
          if (src?.booking_source === 'reception') lastBookingSourceLabel = 'استقبال';
          else if (src?.booking_source === 'platform') lastBookingSourceLabel = `منصة حجز: ${src?.platform_name || '—'}`;
          else if (src?.booking_source === 'broker') lastBookingSourceLabel = `وسيط: ${src?.broker_name || '—'}${src?.broker_id ? ` (${src.broker_id})` : ''}`;
        } catch {}
      }

      let mappedBookings: BookingSummary[] = [];

      if (!bookingsError) {
        mappedBookings = typedBookings.map((b) => ({
          id: b.id,
          booking_number: null,
          check_in: b.check_in,
          check_out: b.check_out,
          status: b.status,
          total_price: b.total_price ? Number(b.total_price) : null,
          unit_number: b.unit_id ? unitMap.get(b.unit_id) || null : null,
        }));
      }

      const { count: paymentsCount, error: paymentsError } = await supabase
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', customer.id);

      if (paymentsError) {
        console.error('Global search - payments error:', paymentsError);
      }

      const todayStr = new Date().toISOString().split('T')[0];
      const isActiveToday = mappedBookings.some((b) => {
        const checkIn = b.check_in ? b.check_in.split('T')[0] : null;
        const checkOut = b.check_out ? b.check_out.split('T')[0] : null;
        if (b.status === 'checked_in') return true;
        if (checkIn && checkOut) {
          return checkIn <= todayStr && checkOut >= todayStr;
        }
        return false;
      });

      setResult({
        customer: {
          id: customer.id,
          full_name: customer.full_name,
          phone: customer.phone,
          national_id: customer.national_id || null,
          email: customer.email || null,
          nationality: customer.nationality || null,
          address: customer.address || null,
          details: customer.details,
          customer_type: customer.customer_type,
        },
        netBalance,
        bookings: mappedBookings,
        isActiveToday,
        paymentsCount: paymentsCount || 0,
        lastBookingSourceLabel,
      });
    } catch (err: unknown) {
      setError('حدث خطأ غير متوقع أثناء البحث. حاول مرة أخرى.');
      console.error('Global search unexpected error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAvailabilityCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setAvailabilityError(null);
    setAvailabilitySummary(null);
    setAvailableUnits([]);

    if (!startDate || !endDate) {
      setAvailabilityError('يرجى تحديد تاريخ الوصول والمغادرة.');
      return;
    }

    if (!selectedTypeId) {
      setAvailabilityError('يرجى اختيار نوع الغرفة أولاً.');
      return;
    }

    const start = parseISO(startDate);
    const end = parseISO(endDate);

    if (isBefore(end, start) || differenceInCalendarDays(end, start) < 30) {
      setAvailabilityError('الحد الأدنى لفترة التحقق شهر واحد (30 يوماً).');
      return;
    }

    const selectedType = unitTypes.find((t) => t.id === selectedTypeId);
    if (!selectedType) {
      setAvailabilityError('تعذر العثور على نوع الغرفة المحدد.');
      return;
    }

    setAvailabilityLoading(true);

    try {
      const { data: units, error: unitsError } = await supabase
        .from('units')
        .select('id, unit_number, status, unit_type_id')
        .eq('unit_type_id', selectedType.id);

      if (unitsError) {
        console.error('Availability - units error:', unitsError);
        setAvailabilityError('تعذر جلب الوحدات المتاحة حالياً.');
        setAvailableUnits([]);
        return;
      }

      if (!units || units.length === 0) {
        setAvailabilitySummary({
          unitType: selectedType,
          availableCount: 0,
          totalPrice: 0,
          nights: differenceInCalendarDays(end, start),
        });
        setAvailableUnits([]);
        return;
      }

      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('unit_id, units!inner(unit_type_id)')
        .eq('units.unit_type_id', selectedType.id)
        .in('status', ['confirmed', 'checked_in', 'pending_deposit'])
        .lt('check_in', endDate)
        .gt('check_out', startDate);

      if (bookingsError) {
        console.error('Availability - bookings error:', bookingsError);
        setAvailabilityError('تعذر جلب بيانات الحجوزات الحالية.');
        setAvailableUnits([]);
        return;
      }

      const bookedUnitIds = new Set((bookings || []).map((b: any) => b.unit_id as string));
      const filteredUnits = (units as any[]).filter((u) => !bookedUnitIds.has(u.id as string));
      const strictlyAvailable = filteredUnits.filter((u: any) => (u.status || 'available') === 'available');

      const calc = calculateStayPrice(selectedType, pricingRules, start, end);

      setAvailabilitySummary({
        unitType: selectedType,
        availableCount: strictlyAvailable.length,
        totalPrice: calc.totalPrice,
        nights: calc.nights,
      });
      setAvailableUnits(
        filteredUnits
          .map((u: any) => ({
            id: String(u.id),
            unit_number: String(u.unit_number || ''),
            status: u.status || 'available'
          }))
          // sort: available first, then by unit number
          .sort((a, b) => {
            const av = (a.status || 'available') === 'available' ? 0 : 1;
            const bv = (b.status || 'available') === 'available' ? 0 : 1;
            if (av !== bv) return av - bv;
            return a.unit_number.localeCompare(b.unit_number, language === 'en' ? 'en' : 'ar');
          })
      );
    } catch (err) {
      console.error('Availability unexpected error:', err);
      setAvailabilityError(t('حدث خطأ غير متوقع أثناء فحص الإتاحة.', 'An unexpected error occurred while checking availability.'));
      setAvailableUnits([]);
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const formattedBalance =
    result && result.netBalance !== null
      ? new Intl.NumberFormat(language === 'en' ? 'en-US' : 'ar-SA', {
          style: 'currency',
          currency: 'SAR',
          maximumFractionDigits: 2,
        }).format(result.netBalance)
      : null;

  const buildCustomerDetailsText = () => {
    if (!result) return '';
    const c = result.customer;
    const lines: string[] = [];
    lines.push(`${t('الاسم', 'Name')}: ${c.full_name}`);
    if (c.phone) lines.push(`${t('الجوال', 'Mobile')}: ${c.phone}`);
    if (c.national_id) lines.push(`${t('الهوية', 'ID')}: ${c.national_id}`);
    if (c.nationality) lines.push(`${t('الجنسية', 'Nationality')}: ${c.nationality}`);
    if (c.customer_type) lines.push(`${t('نوع العميل', 'Customer type')}: ${c.customer_type}`);
    if (c.email) lines.push(`${t('البريد', 'Email')}: ${c.email}`);
    if (c.address) lines.push(`${t('العنوان', 'Address')}: ${c.address}`);
    lines.push(`${t('صافي الحساب', 'Net balance')}: ${formattedBalance ?? '—'}`);
    lines.push(`${t('عدد الحجوزات', 'Bookings')}: ${result.bookings.length}`);
    lines.push(`${t('عدد المدفوعات', 'Payments')}: ${result.paymentsCount}`);
    if (result.lastBookingSourceLabel) lines.push(`${t('مصدر آخر حجز', 'Last booking source')}: ${result.lastBookingSourceLabel}`);
    if (c.details && c.details.trim().length > 0) lines.push(`${t('التفضيلات/الملاحظات', 'Notes')}: ${c.details.trim()}`);
    return lines.join('\n');
  };

  return (
    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <Search size={18} className="text-blue-600" />
          {t('البحث السريع', 'Quick search')}
        </h3>
        <div className="flex bg-gray-100 p-1 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setMode('customer')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              mode === 'customer' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {t('العميل', 'Customer')}
          </button>
          <button
            type="button"
            onClick={() => setMode('availability')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              mode === 'availability'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {t('اختبار الإتاحة', 'Availability')}
          </button>
        </div>
      </div>

      {mode === 'customer' && (
        <>
          <form onSubmit={handleCustomerSubmit} className="space-y-3">
            <div className="relative">
              <input
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pr-3 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                placeholder={t('ابحث عن عميل بالاسم أو الجوال أو الهوية...', 'Search by name, mobile, or ID...')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={loading}
              />
              <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? t('جاري البحث...', 'Searching...') : t('بحث عن العميل', 'Search customer')}
            </button>
          </form>
          {error && (
            <div className="mt-3 flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
          {result && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                    <User size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {result.customer.full_name}
                    </p>
                    {result.customer.phone && (
                      <p className="text-xs text-gray-500 flex items-center gap-1" dir="ltr">
                        <Phone size={12} className="text-gray-400" />
                        {result.customer.phone}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-xs text-right">
                  <p
                    className={
                      result.isActiveToday
                        ? 'inline-flex items-center gap-1 rounded-full bg-green-50 text-green-700 px-2 py-0.5'
                        : 'inline-flex items-center gap-1 rounded-full bg-gray-50 text-gray-500 px-2 py-0.5'
                    }
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {result.isActiveToday ? t('نشط اليوم', 'Active today') : t('غير نشط اليوم', 'Not active today')}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                  <p className="text-gray-500 mb-1">{t('صافي الحساب', 'Net balance')}</p>
                  <p className="font-bold text-gray-900 text-sm">
                    {formattedBalance ?? '...'}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                  <p className="text-gray-500 mb-1">{t('عدد الحجوزات', 'Bookings')}</p>
                  <p className="font-bold text-gray-900 text-sm">
                    {result.bookings.length}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                  <p className="text-gray-500 mb-1">{t('عدد المدفوعات', 'Payments')}</p>
                  <p className="font-bold text-gray-900 text-sm">
                    {result.paymentsCount}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1">
                  {t('آخر الحجوزات', 'Recent bookings')}
                </p>
                {result.bookings.length === 0 ? (
                  <p className="text-xs text-gray-500">
                    {t('لا توجد حجوزات مسجلة لهذا العميل.', 'No bookings found for this customer.')}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {result.bookings.slice(0, 3).map((b) => (
                      <div
                        key={b.id}
                        className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs"
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-gray-800">
                            {b.booking_number || b.id.slice(0, 8)}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                            {b.status}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] text-gray-500">
                          <span>
                            {b.check_in
                              ? new Date(b.check_in).toLocaleDateString(language === 'en' ? 'en-US' : 'ar-EG')
                              : '-'}
                            {' - '}
                            {b.check_out
                              ? new Date(b.check_out).toLocaleDateString(language === 'en' ? 'en-US' : 'ar-EG')
                              : '-'}
                          </span>
                          <span>{b.unit_number || '-'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {result.customer.national_id && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                    <p className="text-gray-500 mb-1">{t('رقم الهوية', 'ID number')}</p>
                    <p className="font-bold text-gray-900 text-sm" dir="ltr">
                      {result.customer.national_id}
                    </p>
                  </div>
                )}
                {result.customer.nationality && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                    <p className="text-gray-500 mb-1">{t('الجنسية', 'Nationality')}</p>
                    <p className="font-bold text-gray-900 text-sm">
                      {result.customer.nationality}
                    </p>
                  </div>
                )}
                {result.customer.customer_type && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                    <p className="text-gray-500 mb-1">{t('نوع العميل', 'Customer type')}</p>
                    <p className="font-bold text-gray-900 text-sm">
                      {result.customer.customer_type}
                    </p>
                  </div>
                )}
                {result.lastBookingSourceLabel && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                    <p className="text-gray-500 mb-1">{t('مصدر آخر حجز', 'Last booking source')}</p>
                    <p className="font-bold text-gray-900 text-sm">
                      {result.lastBookingSourceLabel}
                    </p>
                  </div>
                )}
                {result.customer.email && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 col-span-2">
                    <p className="text-gray-500 mb-1">{t('البريد الإلكتروني', 'Email')}</p>
                    <p className="font-bold text-gray-900 text-sm" dir="ltr">
                      {result.customer.email}
                    </p>
                  </div>
                )}
                {result.customer.address && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 col-span-2">
                    <p className="text-gray-500 mb-1">{t('العنوان', 'Address')}</p>
                    <p className="font-bold text-gray-900 text-sm">
                      {result.customer.address}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1">{t('تفضيلات / ملاحظات', 'Notes')}</p>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-700 min-h-[40px] line-clamp-3">
                  {result.customer.details && result.customer.details.trim().length > 0
                    ? result.customer.details
                    : t('لا توجد ملاحظات مسجلة لهذا العميل.', 'No notes recorded for this customer.')}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(buildCustomerDetailsText());
                    setCopiedAll(true);
                    setTimeout(() => setCopiedAll(false), 1500);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold hover:bg-gray-50"
                  disabled={!result}
                  title={t('نسخ التفاصيل كاملة', 'Copy full details')}
                >
                  <Copy size={14} />
                  {copiedAll ? t('تم النسخ', 'Copied') : t('نسخ التفاصيل', 'Copy details')}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!result?.customer.national_id) return;
                    await navigator.clipboard.writeText(result.customer.national_id);
                    setCopiedId(true);
                    setTimeout(() => setCopiedId(false), 1500);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold hover:bg-gray-50 disabled:opacity-50"
                  disabled={!result?.customer.national_id}
                  title={t('نسخ رقم الهوية', 'Copy ID')}
                >
                  <Copy size={14} />
                  {copiedId ? t('تم النسخ', 'Copied') : t('نسخ الهوية', 'Copy ID')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {mode === 'availability' && (
        <div className="space-y-4">
          <form onSubmit={handleAvailabilityCheck} className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-1">
                    <Calendar size={14} className="text-blue-600" />
                    {t('تاريخ الوصول', 'Check-in date')}
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    value={startDate}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      const minEnd = format(addDays(parseISO(e.target.value), 30), 'yyyy-MM-dd');
                      if (!endDate || endDate < minEnd) {
                        setEndDate(minEnd);
                      }
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-1">
                    <Calendar size={14} className="text-blue-600" />
                    {t('تاريخ المغادرة', 'Check-out date')}
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    value={endDate}
                    min={
                      startDate
                        ? format(addDays(parseISO(startDate), 30), 'yyyy-MM-dd')
                        : format(addDays(new Date(), 30), 'yyyy-MM-dd')
                    }
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 flex items-center gap-1">
                  <BedDouble size={14} className="text-blue-600" />
                  {t('نوع الغرفة', 'Room type')}
                </label>
                <div className="relative">
                  <select
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    value={selectedTypeId}
                    onChange={(e) => setSelectedTypeId(e.target.value)}
                    disabled={typesLoading}
                  >
                    <option value="">{t('اختر نوع الغرفة...', 'Select room type...')}</option>
                    {unitTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {typesLoading && (
                    <Loader2
                      size={14}
                      className="absolute left-3 top-2.5 text-gray-400 animate-spin"
                    />
                  )}
                </div>
              </div>
            </div>
            <button
              type="submit"
              disabled={availabilityLoading}
              className="w-full py-2.5 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {availabilityLoading && (
                <Loader2 size={16} className="animate-spin" />
              )}
              <span>{t('فحص الإتاحة لهذه التواريخ', 'Check availability for these dates')}</span>
            </button>
          </form>

          {availabilityError && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <AlertCircle size={14} />
              <span>{availabilityError}</span>
            </div>
          )}

          {availabilitySummary && (
            <div className="space-y-3 mt-2">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                    <BedDouble size={18} className="text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-emerald-700 font-semibold">
                      {availabilitySummary.unitType.name}
                    </p>
                    <p className="text-[11px] text-emerald-800">
                      {availabilitySummary.availableCount > 0
                        ? t(
                            `${availabilitySummary.availableCount} غرفة متاحة في هذه الفترة`,
                            `${availabilitySummary.availableCount} rooms available for this period`
                          )
                        : t('لا توجد غرف متاحة في هذه الفترة لهذا النوع', 'No rooms available for this type in this period')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-600 mb-1">{t('الأسعار الشهرية والسنوية', 'Monthly & yearly pricing')}</p>
                  <div className="flex items-center gap-3 justify-end">
                    <div className="bg-white rounded-xl border border-gray-200 px-2 py-1">
                      <div className="text-[11px] text-gray-500">{t('شهري', 'Monthly')}</div>
                      <div className="text-sm font-bold text-gray-900">
                        {(
                          availabilitySummary.unitType.annual_price
                            ? Math.round((availabilitySummary.unitType.annual_price as number) / 12)
                            : availabilitySummary.unitType.daily_price * 30
                        ).toLocaleString(language === 'en' ? 'en-US' : undefined)} {t('ر.س', 'SAR')}
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 px-2 py-1">
                      <div className="text-[11px] text-gray-500">{t('سنوي', 'Yearly')}</div>
                      <div className="text-sm font-bold text-gray-900">
                        {(
                          availabilitySummary.unitType.annual_price
                            ? (availabilitySummary.unitType.annual_price as number)
                            : availabilitySummary.unitType.daily_price * 365
                        ).toLocaleString(language === 'en' ? 'en-US' : undefined)} {t('ر.س', 'SAR')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {availableUnits.length > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <div className="text-xs font-bold text-gray-700 mb-2">{t('الوحدات المتاحة', 'Available units')}</div>
                  <div className="grid grid-cols-5 gap-2">
                    {availableUnits.map((u) => {
                      const isMaintenance = (u.status || '') === 'maintenance';
                      return (
                        <div
                          key={u.id}
                          className={`relative rounded-lg text-center py-2 text-xs font-bold ${
                            isMaintenance
                              ? 'bg-amber-50 border border-amber-200 text-amber-900'
                              : 'bg-gray-50 border border-gray-200 text-gray-900'
                          }`}
                          title={`${t('وحدة', 'Unit')} ${u.unit_number}${isMaintenance ? ` • ${t('صيانة', 'Maintenance')}` : ''}`}
                        >
                          {isMaintenance && (
                            <span className="absolute -top-1 -right-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[10px]">
                              <Wrench size={10} />
                              {t('صيانة', 'Maintenance')}
                            </span>
                          )}
                          {u.unit_number}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 text-[11px] text-gray-600 flex items-center gap-2">
                <Users size={14} className="text-gray-500" />
                <span>
                  {t(
                    'هذا القسم مخصص للاستقبال للرد السريع على اتصالات العملاء أو الاستفسار حضوريًا عن التوفر والأسعار في نفس اللحظة.',
                    'This section helps the front desk respond quickly to customer calls or walk-in availability and pricing inquiries.'
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
