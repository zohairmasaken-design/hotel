import { createClient } from '@/lib/supabase-server';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { Calendar, Layers } from 'lucide-react';
import RoleGate from '@/components/auth/RoleGate';
import BookingsListTable from '@/components/bookings/BookingsListTable';

export const runtime = 'edge';

export const metadata = {
  title: 'سجل الحجوزات',
};

export default async function BookingsListPage({
  searchParams,
}: {
  searchParams: Promise<{ 
    status?: string; 
    type?: string; 
    page?: string;
    q?: string;
    arrival?: string;
    departure?: string;
  }>;
}) {
  const supabase = await createClient();
  const { status, type } = await searchParams;
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
  const cookieStore = await cookies();
  const cookieHotel = cookieStore.get('active_hotel_id')?.value || null;
  const selectedHotelId = (() => {
    if (role === 'admin') return cookieHotel || 'all';
    if (cookieHotel && cookieHotel !== 'all') return cookieHotel;
    if (defaultHotelId) return defaultHotelId;
    return 'all';
  })();
  const buildQueryString = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const nextStatus = patch.status ?? status;
    const nextType = patch.type ?? type;
    if (nextStatus && nextStatus !== 'all') params.set('status', nextStatus);
    if (nextType && nextType !== 'all') params.set('type', nextType);
    const qs = params.toString();
    return qs ? `/bookings-list?${qs}` : '/bookings-list';
  };

  const FilterButton = ({ value, label }: { value: string, label: string }) => {
    const isActive = (status === value) || (!status && value === 'all');
    return (
      <Link
        href={buildQueryString({ status: value === 'all' ? 'all' : value })}
        className={`px-2 py-1 sm:px-4 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-sm font-bold transition-colors border ${
          isActive
            ? 'bg-emerald-800 text-white border-emerald-800'
            : 'bg-white text-emerald-900 hover:bg-emerald-50 border-emerald-200'
        }`}
      >
        {label}
      </Link>
    );
  };

  const TypeFilterButton = ({ value, label }: { value: string, label: string }) => {
    const isActive = (type === value) || (!type && value === 'all');
    return (
      <Link
        href={buildQueryString({ type: value === 'all' ? 'all' : value })}
        className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg text-[9px] sm:text-xs font-bold transition-colors border ${
          isActive
            ? 'bg-emerald-900 text-white border-emerald-900'
            : 'bg-white text-emerald-900 hover:bg-emerald-50 border-emerald-200'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <RoleGate allow={['admin', 'manager', 'receptionist', 'accountant']}>
      <div className="space-y-4 sm:space-y-6">
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-3 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
            <div className="space-y-1">
              <h1 className="text-lg sm:text-2xl font-extrabold text-emerald-950">سجل الحجوزات</h1>
              <p className="text-xs sm:text-sm text-emerald-900">عرض وإدارة جميع الحجوزات المسجلة في النظام</p>
            </div>
            <div className="flex gap-1.5">
              <Link
                href="/bookings"
                className="bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 hover:from-emerald-800 hover:via-emerald-900 hover:to-emerald-950 text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold shadow-sm transition-colors flex items-center gap-1.5 text-[11px] sm:text-sm"
              >
                <Calendar size={14} />
                <span className="sm:hidden">جديد</span>
                <span className="hidden sm:inline">حجز جديد</span>
              </Link>
              <div
                aria-disabled
                title="غير متاح حالياً"
                className="bg-gradient-to-l from-emerald-800 via-emerald-900 to-emerald-950 text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold shadow-sm transition-colors flex items-center gap-1.5 opacity-50 cursor-not-allowed text-[11px] sm:text-sm"
              >
                <Layers size={14} />
                <span className="sm:hidden">متعدد</span>
                <span className="hidden sm:inline">حجز متعدد</span>
              </div>
            </div>
          </div>

          <div className="mt-3 sm:mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-2 sm:p-3 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <FilterButton value="all" label="الكل" />
              <FilterButton value="pending_deposit" label="بانتظار العربون" />
              <FilterButton value="confirmed" label="مؤكد" />
              <FilterButton value="checked_in" label="تم الدخول" />
              <FilterButton value="checked_out" label="تم الخروج" />
              <FilterButton value="cancelled" label="ملغي" />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] sm:text-xs text-emerald-900 font-bold whitespace-nowrap">النوع:</span>
              <TypeFilterButton value="all" label="الكل" />
              <TypeFilterButton value="daily" label="يومي" />
              <TypeFilterButton value="yearly" label="سنوي" />
            </div>
          </div>
        </div>

        <BookingsListTable selectedHotelId={selectedHotelId} pageSize={5} />
      </div>
    </RoleGate>
  );
}
