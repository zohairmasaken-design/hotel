import React from 'react';
import { 
  DollarSign, 
  Users, 
  BedDouble, 
  CalendarCheck,
  TrendingUp,
  Clock,
  ArrowRight,
  Download,
  Plus,
  Bell,
  Zap,
  CreditCard,
  FileText,
  Sparkles,
  Layers
} from 'lucide-react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase-server';
import { KPICard } from '@/components/dashboard/KPICard';
import { RoomStatusGrid, Unit } from '@/components/dashboard/RoomStatusGrid';
import RoomStatusWithDate from '@/components/dashboard/RoomStatusWithDate';
import { RecentBookingsTable, Booking } from '@/components/dashboard/RecentBookingsTable';
import { RevenueChart } from '@/components/dashboard/RevenueChart';
import { formatDistanceToNow } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';
import GlobalCustomerSearch from '@/components/dashboard/GlobalCustomerSearch';

export const runtime = 'edge';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let role: 'admin' | 'manager' | 'receptionist' | 'accountant' | 'marketing' | null = 'receptionist';
  let defaultHotelId: string | null = null;
  if (user?.id) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('role, default_hotel_id')
      .eq('id', user.id)
      .single();
    role = (prof?.role as any) || 'receptionist';
    defaultHotelId = (prof as any)?.default_hotel_id ? String((prof as any).default_hotel_id) : null;
  }
  const isReceptionist = role === 'receptionist';
  const isMarketing = role === 'marketing';
  const cookieStore = await cookies();
  const language = cookieStore.get('app_language')?.value === 'en' ? 'en' : 'ar';
  const cookieHotel = cookieStore.get('active_hotel_id')?.value || null;
  const selectedHotelId = (() => {
    if (role === 'admin') {
      return cookieHotel || 'all';
    }
    if (cookieHotel && cookieHotel !== 'all') return cookieHotel;
    if (defaultHotelId) return defaultHotelId;
    return 'all';
  })();
  const t = (arText: string, enText: string) => (language === 'en' ? enText : arText);
  const unknownGuestName = t('غير معروف', 'Unknown');
  const currencyFormatter = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'ar-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 0
  });
  const timeAgoLocale = language === 'en' ? enUS : ar;

  // 1. Fetch Units Status
  const unitsQ = supabase
    .from('units')
    .select('id, unit_number, status, unit_type_id, unit_type:unit_types(id, name, annual_price, daily_price, price_per_year)')
    .order('unit_number');
  const { data: unitsData } = selectedHotelId !== 'all' ? await unitsQ.eq('hotel_id', selectedHotelId) : await unitsQ;

  const typeIds = Array.from(new Set((unitsData || []).map((u: any) => u.unit_type_id).filter(Boolean)));
  const typeMap = new Map<string, any>();
  if (typeIds.length > 0) {
    const { data: typesData } = await supabase
      .from('unit_types')
      .select('id, name, annual_price, daily_price, price_per_year')
      .in('id', typeIds);
    (typesData || []).forEach((t: any) => typeMap.set(t.id, t));
  }
  // Fetch active bookings (Checked-in or Confirmed/Booked) to get guest names
  const activeBookingsQ = supabase
    .from('bookings')
    .select('id, unit_id, customers(full_name, phone)')
    .in('status', ['checked_in', 'confirmed']);
  const { data: activeBookings } = selectedHotelId !== 'all' ? await activeBookingsQ.eq('hotel_id', selectedHotelId) : await activeBookingsQ;

  const activeBookingsMap = new Map<string, { id: string; guest: string; phone?: string; status: string }>();
  activeBookings?.forEach((b: any) => {
      if (b.unit_id) {
        const guestName = Array.isArray(b.customers)
          ? b.customers[0]?.full_name
          : (b.customers as any)?.full_name || unknownGuestName;
        const phone = Array.isArray(b.customers)
          ? b.customers[0]?.phone
          : (b.customers as any)?.phone;
        
        // Prioritize checked_in status if multiple bookings exist for the same unit
        const existing = activeBookingsMap.get(b.unit_id);
        if (!existing || b.status === 'checked_in') {
          activeBookingsMap.set(b.unit_id, { id: b.id, guest: guestName, phone, status: b.status });
        }
      }
  });

  // ==========================================
  // Fetch Today's Actions (Arrivals, Departures, Overdue)
  // ==========================================
  // Use Saudi Arabia timezone for accurate "today" calculation
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });

  // A. Arrivals Today (Confirmed + Check-in Today)
  const arrivalsQ = supabase
    .from('bookings')
    .select('id, unit_id, customers(full_name, phone)')
    .eq('status', 'confirmed')
    .eq('check_in', todayStr);
  const { data: arrivalsToday } = selectedHotelId !== 'all' ? await arrivalsQ.eq('hotel_id', selectedHotelId) : await arrivalsQ;

  // B. Departures Today
  const departuresQ = supabase
    .from('bookings')
    .select('id, unit_id, customers(full_name, phone)')
    .in('status', ['checked_in', 'confirmed'])
    .eq('check_out', todayStr)
    .lte('check_in', todayStr);
  const { data: departuresToday } = selectedHotelId !== 'all' ? await departuresQ.eq('hotel_id', selectedHotelId) : await departuresQ;

  // C. Overdue Checkouts (Checked-in + Check-out < Today)
  const overdueQ = supabase
    .from('bookings')
    .select('id, unit_id, customers(full_name, phone)')
    .eq('status', 'checked_in')
    .lt('check_out', todayStr);
  const { data: overdueCheckouts } = selectedHotelId !== 'all' ? await overdueQ.eq('hotel_id', selectedHotelId) : await overdueQ;

  const unitActionMap = new Map<string, { action: 'arrival' | 'departure' | 'overdue', guest: string, phone?: string }>();

  arrivalsToday?.forEach((b: any) => {
      if(b.unit_id) {
        const guestName = Array.isArray(b.customers) 
            ? b.customers[0]?.full_name 
            : (b.customers as any)?.full_name || unknownGuestName;
        const phone = Array.isArray(b.customers) 
            ? b.customers[0]?.phone 
            : (b.customers as any)?.phone;
        unitActionMap.set(b.unit_id, { action: 'arrival', guest: guestName, phone });
      }
  });

  departuresToday?.forEach((b: any) => {
      if(b.unit_id) {
        const guestName = Array.isArray(b.customers) 
            ? b.customers[0]?.full_name 
            : (b.customers as any)?.full_name || unknownGuestName;
        const phone = Array.isArray(b.customers) 
            ? b.customers[0]?.phone 
            : (b.customers as any)?.phone;
        unitActionMap.set(b.unit_id, { action: 'departure', guest: guestName, phone });
      }
  });
  
  overdueCheckouts?.forEach((b: any) => {
      if(b.unit_id) {
        const guestName = Array.isArray(b.customers) 
            ? b.customers[0]?.full_name 
            : (b.customers as any)?.full_name || unknownGuestName;
        const phone = Array.isArray(b.customers) 
            ? b.customers[0]?.phone 
            : (b.customers as any)?.phone;
        unitActionMap.set(b.unit_id, { action: 'overdue', guest: guestName, phone });
      }
  });

  const units: Unit[] = (unitsData || []).map((u: any) => {
      const actionInfo = unitActionMap.get(u.id);
      const activeBooking = activeBookingsMap.get(u.id);
      const nested = (u.unit_type ?? null) as any;
      const typeName = nested?.name ?? typeMap.get(u.unit_type_id)?.name;
      const typeAnnual = (
        (nested?.annual_price ?? typeMap.get(u.unit_type_id)?.annual_price) ??
        (nested?.price_per_year ?? typeMap.get(u.unit_type_id)?.price_per_year) ??
        // Fallback: derive annual from daily_price (daily * 30 * 12)
        (typeof (nested?.daily_price ?? typeMap.get(u.unit_type_id)?.daily_price) === 'number'
          ? Number(nested?.daily_price ?? typeMap.get(u.unit_type_id)?.daily_price) * 30 * 12
          : undefined)
      );
      const annualNum = typeof typeAnnual === 'number' ? Number(typeAnnual) : (typeAnnual ? Number(typeAnnual) : undefined);

      // A unit is "booked" if:
      // 1. It's available but has a confirmed arrival today (actionInfo)
      // 2. OR it has an active confirmed booking in the system
      const displayStatus = (u.status === 'available' && (actionInfo?.action === 'arrival' || activeBooking?.status === 'confirmed')) ? 'booked' : u.status;

      return {
        id: u.id,
        unit_number: u.unit_number,
        status: displayStatus,
        unit_type_id: u.unit_type_id || undefined,
        unit_type_name: typeName || undefined,
        annual_price: annualNum,
        booking_id: activeBooking?.id || undefined,
        guest_name: activeBooking?.guest || actionInfo?.guest,
        next_action: actionInfo?.action,
        action_guest_name: actionInfo?.guest || activeBooking?.guest,
        guest_phone: actionInfo?.phone || activeBooking?.phone
      };
  });
  
  {
    const unitIds = (unitsData || []).map((u: any) => u.id);
    const { data: tempRes } = await supabase
      .from('temporary_reservations')
      .select('unit_id, customer_name, reserve_date, phone')
      .in('unit_id', unitIds)
      .eq('reserve_date', todayStr);
    if (tempRes && tempRes.length > 0) {
      const tempMap = new Map<string, any>();
      tempRes.forEach((t: any) => tempMap.set(t.unit_id, t));
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        const t = tempMap.get(u.id);
        if (t) {
          units[i] = { 
            ...u, 
            has_temp_res: true,
            action_guest_name: t.customer_name, 
            guest_phone: t.phone 
          };
        }
      }
    }
  }

  // 2. Fetch Recent Bookings
  const recentQ = supabase
    .from('bookings')
    .select(`
      id,
      check_in,
      status,
      total_price,
      units (unit_number),
      customers (full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(5);
  const { data: bookingsData } = selectedHotelId !== 'all' ? await recentQ.eq('hotel_id', selectedHotelId) : await recentQ;

  const bookings: Booking[] = (bookingsData || []).map((b: any) => ({
    id: b.id,
    guest_name: b.customers?.full_name || unknownGuestName,
    unit_number: b.units?.unit_number || '-',
    check_in: b.check_in,
    status: b.status,
    total_price: Number(b.total_price) || 0
  }));

  // 3. Calculate KPIs
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfMonthStr = startOfMonth.toISOString().split('T')[0];

  let totalRevenue = 0;
  let chartData: { date: string; amount: number }[] = [];

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  }).reverse();
  const last7Start = last7Days[0];

  if (selectedHotelId !== 'all') {
    const { data: monthPays } = await supabase
      .from('payments')
      .select('amount,payment_date,status, invoice:invoices!inner(booking:bookings!inner(hotel_id))')
      .eq('status', 'posted')
      .gte('payment_date', startOfMonthStr)
      .eq('invoice.booking.hotel_id', selectedHotelId);
    totalRevenue = (monthPays || []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);

    const { data: weekPays } = await supabase
      .from('payments')
      .select('amount,payment_date,status, invoice:invoices!inner(booking:bookings!inner(hotel_id))')
      .eq('status', 'posted')
      .gte('payment_date', last7Start)
      .lte('payment_date', todayStr)
      .eq('invoice.booking.hotel_id', selectedHotelId);

    chartData = last7Days.map((date) => ({
      date: new Date(date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }),
      amount:
        (weekPays || [])
          .filter((p: any) => String(p.payment_date || '') === date)
          .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0) || 0,
    }));
  } else {
    // Try to get Cash Flow Stats (RPC) - Cash Basis
    const { data: cashFlowStats, error: statsError } = await supabase.rpc('get_cash_flow_stats');

    if (!statsError && cashFlowStats) {
      totalRevenue = Number(cashFlowStats.month_revenue) || 0;
      const rawChartData = cashFlowStats.chart_data || [];
      chartData = rawChartData.map((d: any) => ({
        date: new Date(d.date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }),
        amount: Number(d.amount),
      }));
    } else {
      const revenueQ = supabase
        .from('revenue_schedules')
        .select('amount, recognition_date')
        .gte('recognition_date', startOfMonthStr);
      const { data: revenueData } = await revenueQ;
      totalRevenue = revenueData?.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0) || 0;

      chartData = last7Days.map((date) => ({
        date: new Date(date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }),
        amount:
          revenueData
            ?.filter((r: any) => String(r.recognition_date || '') === date)
            .reduce((sum: number, r: any) => sum + Number(r.amount), 0) || 0,
      }));
    }
  }

  const totalUnitsCount = units.length;

  const nextDayStr = (() => {
    const base = new Date(`${todayStr}T00:00:00`);
    base.setDate(base.getDate() + 1);
    return base.toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
  })();

  let activeCheckedInQ = supabase
    .from('bookings')
    .select('id, unit_id')
    .eq('status', 'checked_in')
    .lt('check_in', nextDayStr)
    .gt('check_out', todayStr);
  if (selectedHotelId !== 'all') {
    activeCheckedInQ = activeCheckedInQ.eq('hotel_id', selectedHotelId);
  }
  const { data: activeCheckedInFinal } = await activeCheckedInQ;

  const occupiedUnitIds = new Set<string>((activeCheckedInFinal || []).map((b: any) => b.unit_id).filter(Boolean));
  const occupancyRate = totalUnitsCount > 0 ? Math.round((occupiedUnitIds.size / totalUnitsCount) * 100) : 0;

  const activeBookingsCount = (activeCheckedInFinal || []).length;
  
  // Pending Arrivals (Today)
  const pendingArrivalsQ = supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'confirmed')
    .eq('check_in', todayStr);
  const { count: pendingArrivalsCount } =
    selectedHotelId !== 'all' ? await pendingArrivalsQ.eq('hotel_id', selectedHotelId) : await pendingArrivalsQ;

  // ==========================================
  // 4. Notifications & Reminders System
  // ==========================================

  // A. Generate "Delayed Check-in" Reminders
  // Find confirmed bookings where check_in < today (Late)
  const delayedQ = supabase
    .from('bookings')
    .select('id, hotel_id, customer_id, customers(full_name), unit_id, units(unit_number, hotel_id)')
    .eq('status', 'confirmed')
    .lt('check_in', todayStr);
  const { data: delayedBookings } =
    selectedHotelId !== 'all' ? await delayedQ.eq('hotel_id', selectedHotelId) : await delayedQ;

  if (delayedBookings && delayedBookings.length > 0) {
    for (const booking of delayedBookings) {
      // Check if reminder already exists
      const { data: existing } = await supabase
        .from('system_events')
        .select('id')
        .eq('event_type', 'check_in_reminder')
        .eq('booking_id', booking.id)
        .gte('created_at', todayStr) // Only check if reminded today
        .single();
      
      if (!existing) {
        // Safe access to customer name
        const customerName = Array.isArray(booking.customers) 
          ? booking.customers[0]?.full_name 
          : (booking.customers as any)?.full_name || 'غير معروف';
          
        const msg = `تنبيه: تأخر تسجيل الدخول للحجز رقم ${booking.id.slice(0, 8)} للعميل ${customerName}`;
        await supabase.from('system_events').insert({
          event_type: 'check_in_reminder',
          booking_id: booking.id,
          unit_id: booking.unit_id,
          customer_id: booking.customer_id,
          hotel_id: (booking as any)?.hotel_id || (booking.units as any)?.hotel_id,
          message: msg
        });
      }
    }
  }

  // B. Generate "Check-out Today" Reminders
  // Find checked_in bookings where check_out = today
  const checkoutQ = supabase
    .from('bookings')
    .select('id, hotel_id, customer_id, customers(full_name), unit_id, units(unit_number, hotel_id)')
    .eq('status', 'checked_in')
    .eq('check_out', todayStr);
  const { data: checkoutBookings } =
    selectedHotelId !== 'all' ? await checkoutQ.eq('hotel_id', selectedHotelId) : await checkoutQ;

  if (checkoutBookings && checkoutBookings.length > 0) {
    for (const booking of checkoutBookings) {
      const { data: existing } = await supabase
        .from('system_events')
        .select('id')
        .eq('event_type', 'check_out_reminder')
        .eq('booking_id', booking.id)
        .gte('created_at', todayStr)
        .single();
      
      if (!existing) {
        const customerName = Array.isArray(booking.customers) 
          ? booking.customers[0]?.full_name 
          : (booking.customers as any)?.full_name || 'غير معروف';

        const msg = `تنبيه: موعد تسجيل الخروج اليوم للحجز رقم ${booking.id.slice(0, 8)} للعميل ${customerName}`;
        await supabase.from('system_events').insert({
          event_type: 'check_out_reminder',
          booking_id: booking.id,
          unit_id: booking.unit_id,
          customer_id: booking.customer_id,
          hotel_id: (booking as any)?.hotel_id || (booking.units as any)?.hotel_id,
          message: msg
        });
      }
    }
  }

  // C. Fetch Latest Notifications for Dashboard
  const notifQ = supabase.from('system_events').select('*').order('created_at', { ascending: false }).limit(4);
  const { data: notifications } =
    selectedHotelId !== 'all' ? await notifQ.eq('hotel_id', selectedHotelId) : await notifQ;
  
  const arrivalsCount = arrivalsToday?.length || 0;
  const departuresCount = departuresToday?.length || 0;
  const overdueCount = overdueCheckouts?.length || 0;
  const last3 = chartData.slice(-3).reduce((s, d) => s + (d.amount || 0), 0);
  const prev3 = chartData.slice(-6, -3).reduce((s, d) => s + (d.amount || 0), 0);
  const trendDelta = prev3 > 0 ? ((last3 - prev3) / prev3) * 100 : null;
  const trendDir = trendDelta == null ? 'neutral' : trendDelta > 5 ? 'up' : trendDelta < -5 ? 'down' : 'flat';
  const topRevenueDay = chartData.length > 0 ? chartData.reduce((max, d) => (d.amount > max.amount ? d : max), chartData[0]) : null;
  let dailyTipText = t(
    'استمر في متابعة الأداء وراجع الأيام الأعلى دخلاً لتحسين التسعير.',
    'Keep tracking performance and review top-revenue days to improve pricing.'
  );
  if (occupancyRate >= 85 && arrivalsCount + departuresCount > 0) {
    dailyTipText = t(
      `نسبة الإشغال مرتفعة (${occupancyRate}%). نسّق تنظيف وحدات المغادرة (${departuresCount}) لتسليم سريع، وفكّر برفع سعر الليلة المتبقية.`,
      `High occupancy (${occupancyRate}%). Coordinate cleaning for ${departuresCount} departures and consider increasing tonight’s rate.`
    );
  } else if (occupancyRate <= 40 && trendDir === 'down') {
    const pct = trendDelta ? Math.abs(Math.round(trendDelta)) : 0;
    dailyTipText = t(
      `الإشغال منخفض (${occupancyRate}%) والاتجاه الإيرادي هابط (${pct}%). فعّل عرض منتصف الأسبوع وركّز على الحجوزات اليومية بالدفع المسبق.`,
      `Low occupancy (${occupancyRate}%) and revenue trend is down (${pct}%). Run mid-week offers and focus on prepaid daily bookings.`
    );
  } else if (overdueCount > 0) {
    dailyTipText = t(
      `لديك حالات تأخر في الخروج (${overdueCount}). تواصل فوراً وحدّث حالة الغرف لتجنب التعارضات وتسريع الجاهزية.`,
      `You have overdue check-outs (${overdueCount}). Follow up immediately and update room status to avoid conflicts and speed up readiness.`
    );
  } else if (arrivalsCount > departuresCount) {
    dailyTipText = t(
      `وصولات اليوم (${arrivalsCount}) أعلى من المغادرات (${departuresCount}). جهّز المفاتيح وخط سير التنظيف لاستقبال سلس.`,
      `Today’s arrivals (${arrivalsCount}) exceed departures (${departuresCount}). Prepare keys and cleaning flow for a smooth check-in.`
    );
  } else if (trendDir === 'up') {
    const pct = trendDelta ? Math.abs(Math.round(trendDelta)) : 0;
    dailyTipText = t(
      `الاتجاه الإيرادي إيجابي (+${pct}%). حافظ على التسعير الحالي وادعم المراجعات الجيدة لزيادة التحويل.`,
      `Revenue trend is positive (+${pct}%). Keep current pricing and encourage good reviews to improve conversion.`
    );
  }
  const dailyTipHighlightLabel = topRevenueDay ? t('أعلى يوم إيراد (7 أيام)', 'Top revenue day (7 days)') : t('نسبة الإشغال', 'Occupancy');
  const dailyTipHighlightValue = topRevenueDay 
    ? `${topRevenueDay.date} — ${currencyFormatter.format(topRevenueDay.amount)}`
    : `${occupancyRate}%`;

  return (
    <div className="space-y-6 sm:space-y-8 bg-[#f8fafc] min-h-screen rounded-xl p-3 sm:p-6 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] pb-20 sm:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-700">
        <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">{t('لوحة التحكم', 'Dashboard')}</h2>
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-2">
              <Clock size={16} className="text-blue-500" />
              <span className="font-medium text-gray-700">{t('أهلاً بك مجدداً.', 'Welcome back.')}</span> {t('إليك ملخص العمليات لليوم.', 'Here is today’s operations summary.')}
            </p>
        </div>
        <div className="flex w-full sm:w-auto gap-2 sm:gap-3">
            <Link
              href={`/reports/daily?date=${todayStr}&autoprint=1`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-emerald-50 via-white to-white ring-1 ring-emerald-200/70 rounded-xl text-[11px] sm:text-sm font-extrabold text-emerald-900 hover:from-emerald-100 hover:ring-emerald-300/70 transition-all shadow-sm whitespace-nowrap"
            >
              <Download size={16} className="sm:w-[18px] sm:h-[18px]" />
              {t('تقرير اليوم', 'Today report')}
            </Link>
            {!isMarketing && (
              <>
                <Link 
                  href="/bookings"
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white rounded-xl text-[11px] sm:text-sm font-extrabold hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800 transition-all shadow-lg shadow-emerald-200 whitespace-nowrap"
                >
                  <Plus size={16} className="sm:w-[18px] sm:h-[18px]" />
                  {t('حجز جديد', 'New booking')}
                </Link>
                <div
                  aria-disabled
                  title={t('غير متاح حالياً', 'Not available yet')}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white rounded-xl text-[11px] sm:text-sm font-extrabold opacity-50 cursor-not-allowed shadow-lg shadow-emerald-200 whitespace-nowrap"
                >
                  <Layers size={16} className="sm:w-[18px] sm:h-[18px]" />
                  {t('حجز متعدد', 'Group booking')}
                </div>
              </>
            )}
        </div>
      </div>

      {/* Reception Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-emerald-50 via-white to-white p-4 rounded-2xl ring-1 ring-emerald-100/70 shadow-sm hover:shadow-md hover:ring-emerald-200/70 transition-all order-2 md:order-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Bell size={18} className="text-emerald-700" />
              {t('تنبيهات الاستقبال', 'Front desk alerts')}
            </h3>
          </div>
          <div className="space-y-3">
            {(notifications || []).length > 0 ? (
              (notifications || []).slice(0, 3).map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2 rounded-xl bg-white/70 ring-1 ring-emerald-100/70 px-3 py-2"
                >
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 line-clamp-2 leading-snug">{item.message}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                      <Clock size={10} />
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: timeAgoLocale })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-2">{t('لا توجد تنبيهات حالياً', 'No alerts right now')}</p>
            )}
          </div>
        </div>

        <div className="order-1 md:order-2">
          <GlobalCustomerSearch language={language} />
        </div>

        <div className="bg-gradient-to-br from-emerald-50 via-white to-white p-4 rounded-2xl ring-1 ring-emerald-100/70 shadow-sm hover:shadow-md hover:ring-emerald-200/70 transition-all order-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Zap size={18} className="text-emerald-700" />
              {t('أزرار سريعة', 'Quick actions')}
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {!isMarketing && (
              <>
                <Link
                  href="/bookings"
                  className="flex flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-900 py-3 text-xs font-extrabold text-white hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800 transition-all text-center p-2 shadow-sm hover:shadow-md"
                >
                  <CalendarCheck size={18} className="text-white/90 mb-1" />
                  {t('حجز جديد', 'New booking')}
                </Link>
                <div
                  aria-disabled
                  title={t('غير متاح حالياً', 'Not available yet')}
                  className="flex flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-900 py-3 text-xs font-extrabold text-white cursor-not-allowed opacity-50 text-center p-2 shadow-sm"
                >
                  <Layers size={18} className="text-white/90 mb-1" />
                  {t('حجز متعدد', 'Group booking')}
                </div>
                <Link
                  href="/bookings-list"
                  className="flex flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-br from-emerald-50 via-white to-white py-3 text-xs font-extrabold text-emerald-900 hover:from-emerald-100 transition-all text-center p-2 ring-1 ring-emerald-200/70"
                >
                  <ArrowRight size={18} className="text-emerald-800 rotate-180 mb-1" />
                  {t('سجل الحجوزات', 'Bookings log')}
                </Link>
              </>
            )}
            <Link
              href="/customers"
              className="flex flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-br from-emerald-50 via-white to-white py-3 text-xs font-extrabold text-emerald-900 hover:from-emerald-100 transition-all text-center p-2 ring-1 ring-emerald-200/70"
            >
              <Users size={18} className="text-emerald-800 mb-1" />
              {t('العملاء', 'Customers')}
            </Link>
            {!isMarketing && (
              <Link
                href="/units"
                className="flex flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-br from-emerald-50 via-white to-white py-3 text-xs font-extrabold text-emerald-900 hover:from-emerald-100 transition-all text-center p-2 ring-1 ring-emerald-200/70"
              >
                <BedDouble size={18} className="text-emerald-800 mb-1" />
                {t('الوحدات', 'Units')}
              </Link>
            )}
          </div>
        </div>

        {!isReceptionist && !isMarketing && (
        <div className="bg-gradient-to-br from-emerald-50 via-white to-white p-4 rounded-2xl ring-1 ring-emerald-100/70 shadow-sm hover:shadow-md hover:ring-emerald-200/70 transition-all order-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <CreditCard size={18} className="text-emerald-600" />
              {t('المالية', 'Finance')}
            </h3>
          </div>
          <div className="space-y-2 sm:space-y-3">
            <Link
              href="/invoices"
              className="flex items-center justify-between rounded-xl ring-1 ring-emerald-200/70 bg-gradient-to-r from-emerald-50 via-white to-white px-3 py-2.5 text-xs font-extrabold text-emerald-900 hover:from-emerald-100 transition-all"
            >
              <span className="flex items-center gap-2">
                <FileText size={16} className="text-emerald-600 shrink-0" />
                <span>{t('إدارة الفواتير', 'Manage invoices')}</span>
              </span>
              <ArrowRight size={14} className="text-gray-400 rotate-180 shrink-0" />
            </Link>
            <Link
              href="/payments"
              className="flex items-center justify-between rounded-xl ring-1 ring-emerald-200/70 bg-gradient-to-r from-emerald-50 via-white to-white px-3 py-2.5 text-xs font-extrabold text-emerald-900 hover:from-emerald-100 transition-all"
            >
              <span className="flex items-center gap-2">
                <DollarSign size={16} className="text-emerald-600 shrink-0" />
                <span>{t('تسجيل المدفوعات', 'Record payments')}</span>
              </span>
              <ArrowRight size={14} className="text-gray-400 rotate-180 shrink-0" />
            </Link>
            <Link
              href="/bookings"
              className="flex items-center justify-between rounded-xl ring-1 ring-emerald-200/70 bg-gradient-to-r from-emerald-50 via-white to-white px-3 py-2.5 text-xs font-extrabold text-emerald-900 hover:from-emerald-100 transition-all"
            >
              <span className="flex items-center gap-2">
                <CalendarCheck size={16} className="text-emerald-600 shrink-0" />
                <span>{t('إدارة الحجوزات', 'Manage bookings')}</span>
              </span>
              <ArrowRight size={14} className="text-gray-400 rotate-180 shrink-0" />
            </Link>
          </div>
        </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {!isReceptionist && !isMarketing && (
          <KPICard 
              title={t('إيرادات الشهر', 'Monthly revenue')} 
              value={currencyFormatter.format(totalRevenue)} 
              change="+12%" 
              trend="up" 
              icon={TrendingUp}
              color="green"
              tone="emerald"
              description={t('إجمالي الإيرادات المحصلة (صندوق/بنك)', 'Total collected revenue (cash/bank)')}
          />
        )}
        <KPICard 
            title={t('نسبة الإشغال', 'Occupancy')} 
            value={`${occupancyRate}%`} 
            change="8%" 
            trend="up" 
            icon={BedDouble}
            color="blue"
            tone="emerald"
            description={t('نسبة الوحدات المشغولة حالياً', 'Share of units currently occupied')}
        />
        <KPICard 
            title={t('النزلاء حالياً', 'Guests now')} 
            value={activeBookingsCount.toString()} 
            change="2" 
            trend="up" 
            icon={Users}
            color="purple"
            tone="emerald"
            description={t('عدد الحجوزات النشطة', 'Number of active bookings')}
        />
        <KPICard 
            title={t('وصول اليوم', 'Arrivals today')} 
            value={(pendingArrivalsCount || 0).toString()} 
            change="-" 
            trend="neutral" 
            icon={CalendarCheck}
            color="orange"
            tone="emerald"
            description={t('حجوزات متوقع وصولها اليوم', 'Bookings expected to arrive today')}
        />
      </div>

      {/* Charts Section */}
      {!isReceptionist && !isMarketing && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2">
            <RevenueChart data={chartData} language={language} />
          </div>
          <div className="bg-gradient-to-br from-emerald-50 via-white to-white rounded-2xl p-8 text-emerald-950 shadow-sm ring-1 ring-emerald-100/70 hover:shadow-md hover:ring-emerald-200/70 transition-all relative overflow-hidden group">
            <div className="absolute -right-10 -bottom-10 opacity-[0.06] text-emerald-900 group-hover:scale-110 transition-transform duration-700">
              <TrendingUp size={240} />
            </div>
            <div className="relative z-10 h-full flex flex-col">
              <h3 className="text-xl font-bold mb-2">{t('نصيحة اليوم 💡', 'Tip of the day')}</h3>
              <p className="text-emerald-900/70 text-sm leading-relaxed mb-8">{dailyTipText}</p>
              <div className="mt-auto">
                <div className="bg-white/70 backdrop-blur-md rounded-xl p-4 ring-1 ring-emerald-100/70">
                  <p className="text-xs text-emerald-900/70 mb-1">{dailyTipHighlightLabel}</p>
                  <p className="font-extrabold text-emerald-950">{dailyTipHighlightValue}</p>
                </div>
              </div>
              <button className="mt-6 flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white rounded-xl font-extrabold text-sm hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800 transition-all shadow-sm hover:shadow-md">
                {t('عرض التقارير التفصيلية', 'View detailed reports')}
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="space-y-4 sm:space-y-8">
        <RoomStatusWithDate initialUnits={units} language={language} hotelId={selectedHotelId} />
        {!isMarketing && <RecentBookingsTable bookings={bookings} language={language} />}
      </div>
    </div>
  );
}
