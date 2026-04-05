'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BedDouble, Wrench, Sparkles, User, LogOut, LogIn, AlertTriangle, Calendar, CalendarCheck, MoreVertical, X, Search } from 'lucide-react';
import BookingRangeModal from '@/components/dashboard/BookingRangeModal';

export interface Unit {
  id: string;
  unit_number: string;
  status: string;
  unit_type_id?: string;
  booking_id?: string;
  booking_check_in?: string;
  booking_check_out?: string;
  unit_type_name?: string;
  annual_price?: number | string;
  guest_name?: string;
  next_action?: 'arrival' | 'departure' | 'overdue' | null;
  action_guest_name?: string;
  guest_phone?: string;
  has_temp_res?: boolean;
  remaining_days?: number;
  future_bookings?: Array<{ start: string; end: string }>;
  payment_due_status?: 'due_today' | 'due_soon' | 'overdue' | null;
  payment_due_in_days?: number;
  payment_due_date?: string;
  payment_due_amount?: number;
  payment_booking_id?: string;
}

export const RoomStatusGrid = ({ units, selectedDate, dateLabel, tempResTotalCount, onJumpTempDate, language = 'ar', size = 'normal' }: { units: Unit[]; selectedDate?: string; dateLabel?: string; tempResTotalCount?: number; onJumpTempDate?: () => void; language?: 'ar' | 'en'; size?: 'normal' | 'compact' | 'mini' }) => {
    const t = (arText: string, enText: string) => (language === 'en' ? enText : arText);
    const [filter, setFilter] = useState<'all' | 'arrival' | 'departure' | 'overdue' | 'payment_today' | 'payment_soon' | 'payment_overdue'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
    const [showReserveFormFor, setShowReserveFormFor] = useState<string | null>(null);
    const [reserveName, setReserveName] = useState('');
    const [reservePhone, setReservePhone] = useState('');
    const [reserveDate, setReserveDate] = useState('');
    const [unitsState, setUnitsState] = useState<Unit[]>(units);
    const [rangeModalUnit, setRangeModalUnit] = useState<Unit | null>(null);
    const [bookingActionUnit, setBookingActionUnit] = useState<Unit | null>(null);
    const router = useRouter();

    useEffect(() => {
        setUnitsState(units);
    }, [units]);

    const openRangeModal = (u: Unit) => {
      setRangeModalUnit(u);
    };

    const goToNewBooking = (u: Unit, checkIn: string, checkOut: string) => {
      const params = new URLSearchParams({
        unit_id: u.id,
        check_in: checkIn,
        check_out: checkOut,
      });
      router.push(`/bookings?${params.toString()}`);
    };

    const getStatusStyle = (status: string) => {
        switch(status) {
            case 'available': return {
                wrapper: 'bg-gradient-to-br from-emerald-700 to-emerald-900 hover:from-emerald-800 hover:to-emerald-900',
                icon: 'text-white',
                text: 'text-white',
                label: t('متاح', 'Available'),
                Icon: BedDouble
            };
            case 'reserved': return {
                wrapper: 'bg-gradient-to-br from-indigo-700 to-indigo-900 hover:from-indigo-800 hover:to-indigo-900',
                icon: 'text-white',
                text: 'text-white',
                label: t('محجوز مؤقت', 'Temporarily reserved'),
                Icon: Calendar
            };
            case 'booked': return {
                wrapper: 'bg-gradient-to-br from-blue-700 to-blue-900 hover:from-blue-800 hover:to-blue-900 animate-pulse',
                icon: 'text-white',
                text: 'text-white',
                label: t('محجوز (بعربون)', 'Booked (deposit)'),
                Icon: CalendarCheck
            };
            case 'future_booked': return {
                wrapper: 'bg-gradient-to-br from-orange-500 to-orange-700 hover:from-orange-600 hover:to-orange-800',
                icon: 'text-white',
                text: 'text-white',
                label: t('محجوز قادم', 'Upcoming booking'),
                Icon: CalendarCheck
            };
            case 'occupied': return {
                wrapper: 'bg-gradient-to-br from-red-600 to-red-800 hover:from-red-700 hover:to-red-900',
                icon: 'text-white',
                text: 'text-white',
                label: t('مشغول', 'Occupied'),
                Icon: User
            };
            case 'cleaning': return {
                wrapper: 'bg-gradient-to-br from-sky-500 to-sky-700 hover:from-sky-600 hover:to-sky-800',
                icon: 'text-white',
                text: 'text-white',
                label: t('تنظيف', 'Cleaning'),
                Icon: Sparkles
            };
            case 'maintenance': return {
                wrapper: 'bg-gradient-to-br from-gray-900 to-black hover:from-black hover:to-black',
                icon: 'text-white',
                text: 'text-white',
                label: t('صيانة', 'Maintenance'),
                Icon: Wrench
            };
            default: return {
                wrapper: 'bg-gray-50 hover:bg-gray-100 border-gray-200',
                icon: 'text-gray-500',
                text: 'text-gray-700',
                label: status,
                Icon: BedDouble
            };
        }
    };

    const getActionBadge = (unit: Unit) => {
        if (unit.next_action === 'overdue') {
             return { icon: AlertTriangle, color: 'text-white', bg: 'bg-white/20', label: t('تجاوز', 'Overdue'), animate: true };
        }
        if (unit.next_action === 'departure') {
             return { icon: LogOut, color: 'text-white', bg: 'bg-white/20', label: t('خروج', 'Departure') };
        }
        if (unit.next_action === 'arrival') {
             return { icon: LogIn, color: 'text-white', bg: 'bg-white/20', label: t('وصول', 'Arrival') };
        }
        return null;
    };

    // Calculate stats
    const stats = {
        total: unitsState.length,
        available: unitsState.filter(u => {
            const s = (u.has_temp_res && u.status === 'available') ? 'reserved' : u.status;
            return s === 'available';
        }).length,
        occupied: unitsState.filter(u => {
            const s = (u.has_temp_res && u.status === 'available') ? 'reserved' : u.status;
            return s === 'occupied';
        }).length,
        booked: unitsState.filter(u => u.status === 'booked').length,
        maintenance: unitsState.filter(u => {
            const s = (u.has_temp_res && u.status === 'available') ? 'reserved' : u.status;
            return ['maintenance', 'cleaning'].includes(s);
        }).length,
        
        // Action stats
        arrival: unitsState.filter(u => u.next_action === 'arrival').length,
        departure: unitsState.filter(u => u.next_action === 'departure').length,
        overdue: unitsState.filter(u => u.next_action === 'overdue').length,
        // Payment stats
        payment_today: unitsState.filter(u => u.payment_due_status === 'due_today').length,
        payment_soon: unitsState.filter(u => u.payment_due_status === 'due_soon').length,
        payment_overdue: unitsState.filter(u => u.payment_due_status === 'overdue').length
    };

    const filteredUnits = unitsState.filter(u => {
        // Text Search Filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            const matchesSearch = 
                (u.guest_name?.toLowerCase().includes(query)) ||
                (u.guest_phone?.toLowerCase().includes(query)) ||
                (u.action_guest_name?.toLowerCase().includes(query)) ||
                (u.unit_number?.toLowerCase().includes(query));
            
            if (!matchesSearch) return false;
        }

        // Status/Action Filters
        if (filter === 'all') return true;
        if (filter === 'arrival' || filter === 'departure' || filter === 'overdue') {
            return u.next_action === filter;
        }
        if (filter === 'payment_today') return u.payment_due_status === 'due_today';
        if (filter === 'payment_soon') return u.payment_due_status === 'due_soon';
        if (filter === 'payment_overdue') return u.payment_due_status === 'overdue';
        return true;
    });

    const labelText = dateLabel || new Date().toLocaleDateString(language === 'en' ? 'en-US' : 'ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const selectedUnit = unitsState.find(u => u.id === showReserveFormFor);
    const handleSaveReserve = async () => {
        if (!selectedUnit || !reserveName || !reserveDate) return;
        setUnitsState(prev => prev.map(u => u.id === selectedUnit.id ? { ...u, action_guest_name: reserveName, guest_phone: reservePhone, has_temp_res: true } : u));
        const res = await fetch('/api/units/set-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unit_id: selectedUnit.id, status: 'reserved', customer_name: reserveName, phone: reservePhone, reserve_date: reserveDate }) });
        if (!res.ok) {
            setUnitsState(prev => prev.map(u => u.id === selectedUnit.id ? { ...u, action_guest_name: undefined, guest_phone: undefined, has_temp_res: false } : u));
            alert(t('فشل حفظ الحجز المؤقت', 'Failed to save temporary reservation'));
        } else {
            router.refresh();
        }
        setShowReserveFormFor(null);
        setActiveUnitId(null);
    };

    const departureUnits = unitsState.filter(u => {
        if (u.next_action !== 'departure') return false;
        return true;
    });

    const sizePad = size === 'mini' ? 'p-1' : size === 'compact' ? 'p-2' : 'p-3';
    const sizeGap = size === 'mini' ? 'gap-1' : size === 'compact' ? 'gap-1.5' : 'gap-2';
    const sizeMinH = size === 'mini' ? 'min-h-[80px]' : size === 'compact' ? 'min-h-[92px]' : 'min-h-[100px]';
    const sizeUnitNum = size === 'mini' ? 'text-base' : size === 'compact' ? 'text-lg' : 'text-lg';
    const sizeText = size === 'mini' ? 'text-[9px]' : size === 'compact' ? 'text-[10px]' : 'text-[10px]';
    const sizeBadge = size === 'mini' ? 'text-[9px]' : 'text-[10px]';
    const sizeActionLabel = size === 'mini' ? 'text-[9px]' : 'text-[10px]';

    return (
        <>
        <BookingRangeModal
            open={Boolean(rangeModalUnit)}
            onClose={() => setRangeModalUnit(null)}
            unitId={rangeModalUnit?.id}
            unitNumber={rangeModalUnit?.unit_number}
            unitTypeName={rangeModalUnit?.unit_type_name}
            annualPrice={rangeModalUnit?.annual_price as any}
            blockedRanges={[
                ...(rangeModalUnit?.booking_check_in && rangeModalUnit?.booking_check_out
                    ? [{ start: rangeModalUnit.booking_check_in, end: rangeModalUnit.booking_check_out }]
                    : []),
                ...(rangeModalUnit?.future_bookings || [])
            ]}
            initialMonth={selectedDate || new Date().toISOString().split('T')[0]}
            minDate={new Date().toISOString().split('T')[0]}
            onComplete={(checkIn, checkOut) => {
                const u = rangeModalUnit;
                if (!u) return;
                goToNewBooking(u, checkIn, checkOut);
            }}
        />
        {bookingActionUnit && (
            <div className="fixed inset-0 z-[75]" dir="rtl">
                <div className="absolute inset-0 bg-black/40" onClick={() => setBookingActionUnit(null)} />
                <div className="absolute inset-0 flex items-center justify-center p-3">
                    <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden">
                        <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
                            <div className="min-w-0">
                                <div className="font-black text-gray-900 text-sm truncate">خيارات الوحدة</div>
                                <div className="text-[11px] text-gray-600 truncate">
                                    الوحدة: {bookingActionUnit.unit_number}{bookingActionUnit.unit_type_name ? ` • ${bookingActionUnit.unit_type_name}` : ''}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setBookingActionUnit(null)}
                                className="p-2 rounded-2xl hover:bg-gray-100 text-gray-700"
                                title="إغلاق"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="text-[11px] text-gray-700 font-bold">
                                {bookingActionUnit.guest_name ? `الحجز الحالي: ${bookingActionUnit.guest_name}` : 'هذه الوحدة عليها حجز'}
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const u = bookingActionUnit;
                                        setBookingActionUnit(null);
                                        openRangeModal(u);
                                    }}
                                    className="w-full px-4 py-3 rounded-2xl bg-blue-600 text-white font-black text-sm hover:bg-blue-700"
                                >
                                    حجز جديد
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const id = bookingActionUnit.booking_id;
                                        setBookingActionUnit(null);
                                        if (id) router.push(`/bookings-list/${id}`);
                                    }}
                                    className="w-full px-4 py-3 rounded-2xl bg-white border border-gray-200 text-gray-900 font-black text-sm hover:bg-gray-50"
                                >
                                    فتح بيانات الحجز
                                </button>
                            </div>
                            <div className="text-[10px] text-gray-500">
                                في شاشة اختيار التواريخ: الأيام باللون الأحمر محجوزة ولا يمكن اختيارها.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-sm h-full flex flex-col">
            <div className="flex flex-col gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    <div>
                        <h3 className="font-bold text-base sm:text-lg text-gray-900 flex items-center gap-2">
                            {t('حالة الغرف', 'Room status')}
                            <span className="text-[10px] sm:text-xs font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full flex items-center gap-1">
                                <Calendar size={12} />
                                {labelText}
                            </span>
                        </h3>
                        <p className="text-[11px] sm:text-sm text-gray-500 mt-1">
                            <span className="font-medium text-emerald-600">{stats.available} {t('متاح', 'available')}</span> • 
                            <span className="font-medium text-blue-600 mx-1">{stats.occupied} {t('مشغول', 'occupied')}</span> • 
                            <span className="font-medium text-blue-500 mx-1">{stats.booked} {t('محجوز', 'booked')}</span> • 
                            <span className="font-medium text-amber-600">{stats.maintenance} {t('غير جاهز', 'not ready')}</span>
                        </p>
                    </div>

                    {/* Search Bar */}
                    <div className="relative w-full lg:max-w-md">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('بحث باسم العميل، الجوال، الهوية، أو الغرفة...', 'Search by guest, phone, ID or room...')}
                            className="w-full pr-10 pl-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Filters / Tabs */}
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide items-center">
                    <button 
                        onClick={() => setFilter('all')}
                        className={cn(
                            "px-2.5 sm:px-3 py-1.5 rounded-lg text-[12px] sm:text-sm font-medium transition-colors whitespace-nowrap",
                            filter === 'all' ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        )}
                    >
                        {t('الكل', 'All')} ({units.length})
                    </button>
                    <button 
                        onClick={() => setFilter('overdue')}
                        className={cn(
                            "px-2.5 sm:px-3 py-1.5 rounded-lg text-[12px] sm:text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap",
                            filter === 'overdue' ? "bg-red-100 text-red-700 ring-1 ring-red-200" : "bg-gray-50 text-gray-600 hover:bg-red-50"
                        )}
                    >
                        <AlertTriangle size={14} className={filter === 'overdue' ? "text-red-600" : "text-gray-400"} />
                        {t('تجاوز الخروج', 'Overdue check-out')}
                        {stats.overdue > 0 && <span className="bg-red-600 text-white text-[10px] px-1.5 rounded-full">{stats.overdue}</span>}
                    </button>
                    <button 
                        onClick={() => setFilter('departure')}
                        className={cn(
                            "px-2.5 sm:px-3 py-1.5 rounded-lg text-[12px] sm:text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap",
                            filter === 'departure' ? "bg-orange-100 text-orange-700 ring-1 ring-orange-200" : "bg-gray-50 text-gray-600 hover:bg-orange-50"
                        )}
                    >
                        <LogOut size={14} className={filter === 'departure' ? "text-orange-600" : "text-gray-400"} />
                        {t('مغادرة اليوم', 'Departures today')}
                        {stats.departure > 0 && <span className="bg-orange-600 text-white text-[10px] px-1.5 rounded-full">{stats.departure}</span>}
                    </button>
                    <button 
                        onClick={() => setFilter('arrival')}
                        className={cn(
                            "px-2.5 sm:px-3 py-1.5 rounded-lg text-[12px] sm:text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap",
                            filter === 'arrival' ? "bg-blue-100 text-blue-700 ring-1 ring-blue-200" : "bg-gray-50 text-gray-600 hover:bg-blue-50"
                        )}
                    >
                        <LogIn size={14} className={filter === 'arrival' ? "text-blue-600" : "text-gray-400"} />
                        {t('وصول اليوم', 'Arrivals today')}
                        {stats.arrival > 0 && <span className="bg-blue-600 text-white text-[10px] px-1.5 rounded-full">{stats.arrival}</span>}
                    </button>

                    <span className="mx-1 text-gray-300">|</span>

                    {/* New Payment Filters */}
                    <button 
                        onClick={() => setFilter('payment_overdue')}
                        className={cn(
                            "px-2.5 sm:px-3 py-1.5 rounded-lg text-[12px] sm:text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap",
                            filter === 'payment_overdue' ? "bg-red-600 text-white shadow-lg" : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-100"
                        )}
                    >
                        <AlertTriangle size={14} />
                        {t('دفعات متأخرة', 'Overdue Payments')}
                        {stats.payment_overdue > 0 && <span className={cn("text-[10px] px-1.5 rounded-full", filter === 'payment_overdue' ? "bg-white text-red-600" : "bg-red-600 text-white")}>{stats.payment_overdue}</span>}
                    </button>
                    <button 
                        onClick={() => setFilter('payment_today')}
                        className={cn(
                            "px-2.5 sm:px-3 py-1.5 rounded-lg text-[12px] sm:text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap",
                            filter === 'payment_today' ? "bg-emerald-600 text-white shadow-lg" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100"
                        )}
                    >
                        <CalendarCheck size={14} />
                        {t('مستحق اليوم', 'Due Today')}
                        {stats.payment_today > 0 && <span className={cn("text-[10px] px-1.5 rounded-full", filter === 'payment_today' ? "bg-white text-emerald-600" : "bg-emerald-600 text-white")}>{stats.payment_today}</span>}
                    </button>
                    <button 
                        onClick={() => setFilter('payment_soon')}
                        className={cn(
                            "px-2.5 sm:px-3 py-1.5 rounded-lg text-[12px] sm:text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap",
                            filter === 'payment_soon' ? "bg-amber-500 text-white shadow-lg" : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-100"
                        )}
                    >
                        <Calendar size={14} />
                        {t('قريب سداد', 'Due Soon')}
                        {stats.payment_soon > 0 && <span className={cn("text-[10px] px-1.5 rounded-full", filter === 'payment_soon' ? "bg-white text-amber-600" : "bg-amber-600 text-white")}>{stats.payment_soon}</span>}
                    </button>
                    {typeof tempResTotalCount === 'number' && onJumpTempDate && (
                        <button
                            onClick={onJumpTempDate}
                            className="ml-auto px-3 py-1.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap bg-amber-100 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-200"
                            title={t('التنقل بين تواريخ الحجوزات المؤقتة', 'Jump between temporary reservation dates')}
                        >
                            {t('حجز مؤقت', 'Temp reservation')}
                            <span className="bg-amber-600 text-white text-[10px] px-1.5 rounded-full">{tempResTotalCount}</span>
                        </button>
                    )}
                </div>
            </div>

            {filter === 'departure' && departureUnits.length > 0 && (
                <div className="mb-3 p-3 rounded-xl border border-orange-200 bg-orange-50">
                    <div className="text-xs font-bold text-orange-800 mb-2">{t('المغادرون اليوم', 'Departures today')}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {departureUnits.map(u => (
                            <div key={u.id} className="flex items-center justify-between gap-2 bg-white/70 border border-orange-200 rounded-lg px-2.5 py-1.5">
                                <div className="text-[11px] text-gray-700">
                                    <div className="font-bold text-gray-900">{u.guest_name || u.action_guest_name || t('ضيف', 'Guest')}</div>
                                    <div className="text-[10px] text-gray-500">{t('الوحدة', 'Unit')} {u.unit_number}{u.unit_type_name ? ` • ${u.unit_type_name}` : ''}</div>
                                </div>
                                <button
                                    className="px-2 py-1 text-[10px] rounded bg-orange-600 text-white hover:bg-orange-700"
                                    onClick={() => {
                                        if (u.booking_id) {
                                            router.push(`/bookings-list/${u.booking_id}`);
                                        } else {
                                            const q = encodeURIComponent(u.guest_name || u.action_guest_name || '');
                                            router.push(`/bookings?q=${q}&unit_id=${u.id}&search=1`);
                                        }
                                    }}
                                >
                                    {t('فتح الحجز', 'Open booking')}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {filteredUnits.length === 0 ? (
                 <div className="flex-1 flex flex-col items-center justify-center py-12 text-gray-400 bg-gray-50/50 rounded-xl border border-dashed">
                    <BedDouble size={48} className="mb-3 opacity-20" />
                    <p>{t('لا توجد وحدات تطابق الفلتر', 'No units match the filter')}</p>
                 </div>
            ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3 content-start">
                    {filteredUnits.map((unit) => {
                        const effectiveStatus = (unit.has_temp_res && unit.status === 'available') ? 'reserved' : unit.status;
                        const style = getStatusStyle(effectiveStatus);
                        const StatusIcon = style.Icon;
                        const actionBadge = getActionBadge(unit);
                        const ActionIcon = actionBadge?.icon;
                        
                        const hasBooking = Boolean(unit.booking_id);

                        return (
                            <div 
                                key={unit.id} 
                                style={{ transform: 'scale(0.92)', transformOrigin: 'top center' }}
                                className={cn(
                                    `group relative ${sizePad} rounded-xl transition-all duration-200 flex flex-col items-center text-center ${sizeGap} hover:shadow-md hover:-translate-y-0.5 ${sizeMinH} text-white`,
                                    hasBooking && "cursor-pointer",
                                    style.wrapper,
                                    false
                                )}
                                onClick={() => {
                                    if (unit.booking_id) {
                                        if (unit.status === 'booked' || unit.status === 'future_booked' || unit.status === 'occupied') {
                                            setBookingActionUnit(unit);
                                            return;
                                        }
                                        router.push(`/bookings-list/${unit.booking_id}`);
                                    } else if (unit.status === 'available' || unit.status === 'cleaning') {
                                        openRangeModal(unit);
                                    }
                                }}
                                title={unit.guest_name || style.label}
                            >
                                {/* Status Header */}
                                <div className="flex items-center justify-between w-full">
                                    <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded-full bg-white/20", style.text)}>
                                        {style.label}
                                    </span>
                                    {!hasBooking && (unit.status === 'available' || unit.status === 'cleaning') && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveUnitId(unit.id === activeUnitId ? null : unit.id);
                                            }}
                                            className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white"
                                            title={t('إعدادات', 'Actions')}
                                        >
                                            <MoreVertical size={14} />
                                        </button>
                                    )}
                                    <StatusIcon size={14} className={style.icon} />
                                </div>
                                
                                {/* Unit Number */}
                                <span className={cn("font-bold font-sans text-white group-hover:scale-110 transition-transform mt-1", sizeUnitNum)}>
                                    {unit.unit_number}
                                </span>
                                
                                {/* Unit Type and Monthly Price */}
                                <div className={cn("leading-tight text-white", sizeText)}>
                                    <div className="font-extrabold truncate w-full">
                                        {String(unit.unit_type_name || t('نوع غير محدد', 'Unspecified type'))}
                                    </div>
                                    <div className="font-mono text-white/90">
                                        {(() => {
                                            const annual = unit.annual_price === null || unit.annual_price === undefined ? NaN : Number(unit.annual_price);
                                            const monthly = Number.isFinite(annual) ? annual / 12 : NaN;
                                            return Number.isFinite(monthly) && monthly > 0
                                                ? `${Math.round(monthly).toLocaleString(language === 'en' ? 'en-US' : 'ar-EG')} ${t('ر.س/شهر', 'SAR/mo')}`
                                                : t('—', '—');
                                        })()}
                                    </div>
                                </div>
                                
                                {/* Guest Name or Action Badge */}
                                <div className="w-full mt-auto space-y-1">
                                    {/* Remaining Days for occupied/booked */}
                                    {(unit.status === 'occupied' || unit.status === 'booked') && typeof unit.remaining_days === 'number' && unit.remaining_days >= 0 && (
                                        <p className="text-[10px] font-bold text-white/70">
                                            {t('متبقي', 'Remaining')} {unit.remaining_days} {t('يوم', 'days')}
                                        </p>
                                    )}

                                    {/* Payment Due Badge */}
                                    {unit.payment_due_status && (
                                        <div className={cn(
                                            "w-full py-1 px-1.5 rounded text-[9px] font-black flex items-center justify-center gap-1 shadow-sm",
                                            unit.payment_due_status === 'due_today' && "bg-emerald-500 text-white animate-pulse",
                                            unit.payment_due_status === 'due_soon' && "bg-amber-400 text-gray-900",
                                            unit.payment_due_status === 'overdue' && "bg-red-500 text-white animate-bounce"
                                        )}>
                                            <AlertTriangle size={10} />
                                            {unit.payment_due_status === 'due_today' ? t('السداد اليوم', 'Pay Today') :
                                             unit.payment_due_status === 'due_soon' ? `${t('باقي', 'Left')} ${unit.payment_due_in_days} ${t('أيام', 'days')}` :
                                             `${t('متأخر', 'Overdue')} ${Math.abs(unit.payment_due_in_days || 0)} ${t('يوم', 'days')}`}
                                        </div>
                                    )}

                                    {/* Action Badge if exists */}
                                    {actionBadge && ActionIcon && (
                                        <div className={cn(
                                            `w-full py-1 px-1.5 rounded ${sizeActionLabel} font-bold flex items-center justify-center gap-1`, 
                                            actionBadge.bg, 
                                            actionBadge.color,
                                            // @ts-ignore
                                            actionBadge.animate && "animate-pulse"
                                        )}>
                                            <ActionIcon size={10} />
                                            {actionBadge.label}
                                        </div>
                                    )}

                                    {/* Guest Name */}
                                    {(unit.guest_name || unit.action_guest_name) && (
                                        <div className="w-full pt-1">
                                            <p className="text-[10px] font-medium truncate w-full text-white/90">
                                                {unit.guest_name || unit.action_guest_name || t('ضيف', 'Guest')}
                                            </p>
                                            {unit.guest_phone && (
                                                <p className="text-[9px] text-white/70 font-mono truncate dir-ltr">
                                                    {unit.guest_phone}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                    
                                    {(unit.status === 'available' || unit.status === 'cleaning') && activeUnitId === unit.id && (
                                        <div className="mt-2 grid grid-cols-3 gap-1">
                                            <button 
                                                className="px-2 py-1 text-[10px] rounded bg-amber-50 text-amber-700 hover:bg-amber-100"
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    setUnitsState(prev => prev.map(u => u.id === unit.id ? { ...u, status: 'cleaning' } : u));
                                                    const res = await fetch('/api/units/set-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unit_id: unit.id, status: 'cleaning' }) });
                                                    if (!res.ok) {
                                                        setUnitsState(prev => prev.map(u => u.id === unit.id ? { ...u, status: 'available' } : u));
                                                        alert(t('فشل تعديل الحالة إلى تنظيف', 'Failed to change status to cleaning'));
                                                    } else {
                                                        router.refresh();
                                                    }
                                                    setActiveUnitId(null);
                                                }}
                                            >
                                                {t('تنظيف', 'Cleaning')}
                                            </button>
                                            <button 
                                                className="px-2 py-1 text-[10px] rounded bg-rose-50 text-rose-700 hover:bg-rose-100"
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    setUnitsState(prev => prev.map(u => u.id === unit.id ? { ...u, status: 'maintenance' } : u));
                                                    const res = await fetch('/api/units/set-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unit_id: unit.id, status: 'maintenance' }) });
                                                    if (!res.ok) {
                                                        setUnitsState(prev => prev.map(u => u.id === unit.id ? { ...u, status: 'available' } : u));
                                                        alert(t('فشل تعديل الحالة إلى صيانة', 'Failed to change status to maintenance'));
                                                    } else {
                                                        router.refresh();
                                                    }
                                                    setActiveUnitId(null);
                                                }}
                                            >
                                                {t('صيانة', 'Maintenance')}
                                            </button>
                                            <button 
                                                className="px-2 py-1 text-[10px] rounded bg-blue-50 text-blue-700 hover:bg-blue-100"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowReserveFormFor(unit.id);
                                                    setActiveUnitId(null);
                                                    setReserveName('');
                                                    setReservePhone('');
                                                    setReserveDate(new Date().toISOString().split('T')[0]);
                                                }}
                                            >
                                                {t('حجز مؤقت', 'Temp reserve')}
                                            </button>
                                        </div>
                                    )}
                                    
                                    {(unit.status === 'reserved' || unit.has_temp_res) && (
                                        <div className="mt-2 grid grid-cols-2 gap-1">
                                            <button
                                                className="px-2 py-1 text-[10px] rounded bg-blue-600 text-white hover:bg-blue-700"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const q = encodeURIComponent(unit.action_guest_name || '');
                                                    router.push(`/bookings?q=${q}&unit_id=${unit.id}&search=1`);
                                                }}
                                            >
                                                {t('تأكيد الحجز', 'Confirm booking')}
                                            </button>
                                            <button
                                                className="px-2 py-1 text-[10px] rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    const prev = { status: unit.status, action_guest_name: unit.action_guest_name, guest_phone: unit.guest_phone, has_temp_res: unit.has_temp_res };
                                                    setUnitsState(prevUnits => prevUnits.map(u => u.id === unit.id ? { ...u, status: 'available', action_guest_name: undefined, guest_phone: undefined, has_temp_res: false } : u));
                                                    const res = await fetch('/api/units/cancel-reservation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unit_id: unit.id }) });
                                                    if (!res.ok) {
                                                        setUnitsState(prevUnits => prevUnits.map(u => u.id === unit.id ? { ...u, status: prev.status as any, action_guest_name: prev.action_guest_name, guest_phone: prev.guest_phone, has_temp_res: prev.has_temp_res } : u));
                                                        alert(t('فشل إلغاء الحجز المؤقت', 'Failed to cancel temporary reservation'));
                                                    } else {
                                                        router.refresh();
                                                    }
                                                }}
                                            >
                                                {t('إلغاء الحجز', 'Cancel')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            
            {showReserveFormFor && (
                <ReserveModal
                    unit={selectedUnit}
                    visible
                    onClose={() => setShowReserveFormFor(null)}
                    onSave={handleSaveReserve}
                    name={reserveName}
                    phone={reservePhone}
                    date={reserveDate}
                    setName={setReserveName}
                    setPhone={setReservePhone}
                    setDate={setReserveDate}
                    language={language}
                />
            )}
        </div>
        </>
    );
};

// Global Modal (Rendered outside unit card to avoid parent click handlers)
export const ReserveModal = ({
    unit,
    visible,
    onClose,
    onSave,
    name,
    phone,
    date,
    setName,
    setPhone,
    setDate,
    language = 'ar'
}: {
    unit: Unit | undefined;
    visible: boolean;
    onClose: () => void;
    onSave: () => void;
    name: string;
    phone: string;
    date: string;
    setName: (v: string) => void;
    setPhone: (v: string) => void;
    setDate: (v: string) => void;
    language?: 'ar' | 'en';
}) => {
    if (!visible) return null;
    const t = (arText: string, enText: string) => (language === 'en' ? enText : arText);
    return (
        <div
            className="fixed inset-0 z-40 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-2xl p-5 space-y-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-800">{t('حجز مؤقت للوحدة', 'Temporary reservation')}</span>
                        {unit && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600">
                                {unit.unit_number}
                            </span>
                        )}
                    </div>
                    <button
                        className="px-2 py-1 rounded-lg text-xs bg-gray-100 text-gray-700 hover:bg-gray-200"
                        onClick={onClose}
                    >
                        {t('إغلاق', 'Close')}
                    </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-gray-700">{t('اسم العميل', 'Customer name')}</label>
                        <input
                            type="text"
                            className="w-full p-2.5 border border-gray-200 rounded-xl text-[12px] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            placeholder={t('ادخل الاسم', 'Enter name')}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-gray-700">{t('رقم الجوال', 'Mobile')}</label>
                        <input
                            type="tel"
                            className="w-full p-2.5 border border-gray-200 rounded-xl text-[12px] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            placeholder="05xxxxxxxx"
                            dir="ltr"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-[11px] font-bold text-gray-700">{t('تاريخ الحجز', 'Reservation date')}</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                className="w-full p-2.5 border border-gray-200 rounded-xl text-[12px] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
                <div className="flex gap-2 pt-2">
                    <button
                        className="flex-1 px-3 py-2 text-[12px] rounded-xl bg-blue-600 text-white hover:bg-blue-700"
                        onClick={onSave}
                    >
                        {t('حفظ', 'Save')}
                    </button>
                    <button
                        className="flex-1 px-3 py-2 text-[12px] rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200"
                        onClick={onClose}
                    >
                        {t('إلغاء', 'Cancel')}
                    </button>
                </div>
            </div>
        </div>
    );
};
