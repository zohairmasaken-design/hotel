'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BedDouble, Wrench, Sparkles, User, LogOut, LogIn, AlertTriangle, Calendar, CalendarCheck } from 'lucide-react';

export interface Unit {
  id: string;
  unit_number: string;
  status: string;
  booking_id?: string;
  unit_type_name?: string;
  annual_price?: number;
  guest_name?: string;
  next_action?: 'arrival' | 'departure' | 'overdue' | null;
  action_guest_name?: string;
  guest_phone?: string;
  has_temp_res?: boolean;
}

export const RoomStatusGrid = ({ units, dateLabel, tempResTotalCount, onJumpTempDate, language = 'ar' }: { units: Unit[]; dateLabel?: string; tempResTotalCount?: number; onJumpTempDate?: () => void; language?: 'ar' | 'en' }) => {
    const t = (arText: string, enText: string) => (language === 'en' ? enText : arText);
    const [filter, setFilter] = useState<'all' | 'arrival' | 'departure' | 'overdue'>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
    const [showReserveFormFor, setShowReserveFormFor] = useState<string | null>(null);
    const [reserveName, setReserveName] = useState('');
    const [reservePhone, setReservePhone] = useState('');
    const [reserveDate, setReserveDate] = useState('');
    const [unitsState, setUnitsState] = useState<Unit[]>(units);
    const router = useRouter();

    useEffect(() => {
        setUnitsState(units);
    }, [units]);

    const getStatusStyle = (status: string) => {
        switch(status) {
            case 'available': return {
                wrapper: 'bg-emerald-50/50 hover:bg-emerald-50 border-emerald-100',
                icon: 'text-emerald-500',
                text: 'text-emerald-700',
                label: t('متاح', 'Available'),
                Icon: BedDouble
            };
            case 'reserved': return {
                wrapper: 'bg-indigo-50/50 hover:bg-indigo-50 border-indigo-100',
                icon: 'text-indigo-500',
                text: 'text-indigo-700',
                label: t('محجوز مؤقت', 'Temporarily reserved'),
                Icon: Calendar
            };
            case 'booked': return {
                wrapper: 'bg-blue-50/50 hover:bg-blue-50 border-blue-100 animate-pulse',
                icon: 'text-blue-500',
                text: 'text-blue-700',
                label: t('محجوز (بعربون)', 'Booked (deposit)'),
                Icon: CalendarCheck
            };
            case 'occupied': return {
                wrapper: 'bg-blue-50/50 hover:bg-blue-50 border-blue-100',
                icon: 'text-blue-500',
                text: 'text-blue-700',
                label: t('مشغول', 'Occupied'),
                Icon: User
            };
            case 'cleaning': return {
                wrapper: 'bg-amber-50/50 hover:bg-amber-50 border-amber-100',
                icon: 'text-amber-500',
                text: 'text-amber-700',
                label: t('تنظيف', 'Cleaning'),
                Icon: Sparkles
            };
            case 'maintenance': return {
                wrapper: 'bg-rose-50/50 hover:bg-rose-50 border-rose-100',
                icon: 'text-rose-500',
                text: 'text-rose-700',
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
             return { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100', label: t('تجاوز', 'Overdue'), animate: true };
        }
        if (unit.next_action === 'departure') {
             return { icon: LogOut, color: 'text-orange-600', bg: 'bg-orange-100', label: t('خروج', 'Departure') };
        }
        if (unit.next_action === 'arrival') {
             return { icon: LogIn, color: 'text-blue-600', bg: 'bg-blue-100', label: t('وصول', 'Arrival') };
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
        overdue: unitsState.filter(u => u.next_action === 'overdue').length
    };

    const typeNames = Array.from(new Set(unitsState.map(u => u.unit_type_name).filter(Boolean))) as string[];

    const filteredUnits = unitsState.filter(u => {
        if (filter !== 'all' && u.next_action !== filter) return false;
        if (typeFilter !== 'all') {
            if ((u.unit_type_name || '') !== typeFilter) return false;
        }
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
        if (typeFilter !== 'all' && (u.unit_type_name || '') !== typeFilter) return false;
        return true;
    });

    return (
        <>
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-full flex flex-col">
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                            {t('حالة الغرف', 'Room status')}
                            <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full flex items-center gap-1">
                                <Calendar size={12} />
                                {labelText}
                            </span>
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                            <span className="font-medium text-emerald-600">{stats.available} {t('متاح', 'available')}</span> • 
                            <span className="font-medium text-blue-600 mx-1">{stats.occupied} {t('مشغول', 'occupied')}</span> • 
                            <span className="font-medium text-blue-500 mx-1">{stats.booked} {t('محجوز', 'booked')}</span> • 
                            <span className="font-medium text-amber-600">{stats.maintenance} {t('غير جاهز', 'not ready')}</span>
                        </p>
                    </div>
                </div>

                {/* Filters / Tabs */}
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide items-center">
                    <button 
                        onClick={() => setFilter('all')}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                            filter === 'all' ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        )}
                    >
                        {t('الكل', 'All')} ({units.length})
                    </button>
                    <button 
                        onClick={() => setFilter('overdue')}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap",
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
                            "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap",
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
                            "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap",
                            filter === 'arrival' ? "bg-blue-100 text-blue-700 ring-1 ring-blue-200" : "bg-gray-50 text-gray-600 hover:bg-blue-50"
                        )}
                    >
                        <LogIn size={14} className={filter === 'arrival' ? "text-blue-600" : "text-gray-400"} />
                        {t('وصول اليوم', 'Arrivals today')}
                        {stats.arrival > 0 && <span className="bg-blue-600 text-white text-[10px] px-1.5 rounded-full">{stats.arrival}</span>}
                    </button>
                    <span className="mx-1 text-gray-300">|</span>
                    <button
                        onClick={() => setTypeFilter('all')}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                            typeFilter === 'all' ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        )}
                    >
                        {t('كل النماذج', 'All types')}
                    </button>
                    {typeNames.map((t) => (
                        <button
                            key={t}
                            onClick={() => setTypeFilter(t)}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                                typeFilter === t ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200" : "bg-gray-50 text-gray-700 hover:bg-indigo-50"
                            )}
                            title={t}
                        >
                            {t}
                        </button>
                    ))}
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
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 content-start">
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
                                className={cn(
                                    "group relative p-3 rounded-xl border transition-all duration-200 flex flex-col items-center text-center gap-2 hover:shadow-md hover:-translate-y-0.5 min-h-[100px]",
                                    hasBooking && "cursor-pointer",
                                    style.wrapper,
                                    actionBadge && "ring-2 ring-offset-1",
                                    unit.next_action === 'overdue' && "ring-red-500/50",
                                    unit.next_action === 'departure' && "ring-orange-500/50",
                                    unit.next_action === 'arrival' && "ring-blue-500/50"
                                )}
                                onClick={() => {
                                    if (unit.booking_id) {
                                        router.push(`/bookings-list/${unit.booking_id}`);
                                    } else if (unit.status === 'available') {
                                        setActiveUnitId(unit.id === activeUnitId ? null : unit.id);
                                    }
                                }}
                                title={unit.guest_name || style.label}
                            >
                                {/* Status Header */}
                                <div className="flex items-center justify-between w-full">
                                    <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded-full bg-white/60 backdrop-blur-sm", style.text)}>
                                        {style.label}
                                    </span>
                                    <StatusIcon size={14} className={style.icon} />
                                </div>
                                
                                {/* Unit Number */}
                                <span className="font-bold text-lg font-sans text-gray-800 group-hover:scale-110 transition-transform mt-1">
                                    {unit.unit_number}
                                </span>
                                
                                {/* Unit Type and Annual Price */}
                                {(unit.unit_type_name || typeof unit.annual_price === 'number') && (
                                    <div className="text-[10px] text-gray-600">
                                        <div className="font-medium">{unit.unit_type_name || ''}</div>
                                        {typeof unit.annual_price === 'number' && (
                                            <div className="font-mono">
                                                {Number(unit.annual_price).toLocaleString(language === 'en' ? 'en-US' : 'ar-EG')} {t('ر.س/سنة', 'SAR/yr')}
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                {/* Guest Name or Action Badge */}
                                <div className="w-full mt-auto space-y-1">
                                    {/* Action Badge if exists */}
                                    {actionBadge && ActionIcon && (
                                        <div className={cn(
                                            "w-full py-1 px-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1", 
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
                                        <div className={cn("w-full pt-1 border-t", unit.status === 'occupied' ? "border-blue-200/50" : "border-gray-200/50")}>
                                            <p className="text-[10px] font-medium truncate w-full text-gray-600">
                                                {unit.guest_name || unit.action_guest_name || t('ضيف', 'Guest')}
                                            </p>
                                            {unit.guest_phone && (
                                                <p className="text-[9px] text-gray-400 font-mono truncate dir-ltr">
                                                    {unit.guest_phone}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                    
                                    {unit.status === 'available' && activeUnitId === unit.id && (
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
