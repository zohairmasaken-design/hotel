'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, ClipboardList, Calendar, Phone, User, Building2, BedDouble, Trash2, HelpCircle, CheckCircle, Pencil, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useUserRole } from '@/hooks/useUserRole';
import RoleGate from '@/components/auth/RoleGate';
import { cn } from '@/lib/utils';
import { BookingWizard } from '@/components/bookings/BookingWizard';
import { useActiveHotel } from '@/hooks/useActiveHotel';

type Entry = {
  id: string;
  created_at: string;
  customer_name: string;
  phone: string;
  id_type: 'national_id' | 'iqama' | 'passport' | 'other';
  customer_id_number: string;
  check_in: string;
  check_out: string;
  units_count: number;
  booking_type: 'daily' | 'yearly' | 'other';
  hotel_name: string;
  unit_pref: string;
  unit_type: string;
  unit_number: string;
  agreed_price: number;
  notes: string;
  staff_name: string;
  status?: 'unconfirmed' | 'confirmed';
};

export default function BookingIntakePage() {
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState<Entry[]>([]);
  const formRef = useRef<HTMLDivElement | null>(null);
  const filterStartRef = useRef<HTMLInputElement | null>(null);
  const filterEndRef = useRef<HTMLInputElement | null>(null);
  const unitsFiltersRef = useRef<HTMLDivElement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { role } = useUserRole();
  const { activeHotelId } = useActiveHotel();
  const isAdmin = role === 'admin';
  const [customer_name, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [id_type, setIdType] = useState<'national_id' | 'iqama' | 'passport' | 'other'>('national_id');
  const [customer_id_number, setCustomerIdNumber] = useState('');
  const [check_in, setCheckIn] = useState('');
  const [check_out, setCheckOut] = useState('');
  const [units_count, setUnitsCount] = useState<number>(1);
  const [booking_type, setBookingType] = useState<'daily' | 'yearly' | 'other'>('daily');
  const [hotel_name, setHotelName] = useState('');
  const [unit_pref, setUnitPref] = useState('');
  const [unit_type, setUnitType] = useState('');
  const [unit_number, setUnitNumber] = useState('');
  const [agreed_price, setAgreedPrice] = useState<number | ''>('');
  const sanitizePhone = (raw?: string | null) => {
    if (!raw) return '';
    const digits = raw.replace(/\D+/g, '');
    if (digits.startsWith('0')) return '966' + digits.slice(1);
    if (digits.startsWith('966')) return digits;
    if (digits.startsWith('5') && digits.length === 9) return '966' + digits;
    return digits;
  };

  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  useEffect(() => {
    if (!check_in) setCheckIn(formatDate(new Date()));
  }, []);

  const [notes, setNotes] = useState('');
  const [staff_name, setStaffName] = useState('');
  const [unitTypes, setUnitTypes] = useState<Array<{ id: string; name: string; daily_price?: number | null; annual_price?: number | null }>>([]);
  const [availableUnits, setAvailableUnits] = useState<Array<{ id: string; unit_number: string; floor?: string | null }>>([]);
  const [selectedUnitTypeId, setSelectedUnitTypeId] = useState<string>('');
  const [hotels, setHotels] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<string>('');
  const [staffLoading, setStaffLoading] = useState<boolean>(true);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [wizardPrefill, setWizardPrefill] = useState<{ unitId?: string; checkIn?: string; checkOut?: string } | null>(null);
  const wizardKey = useMemo(() => {
    return `${wizardPrefill?.unitId || ''}|${wizardPrefill?.checkIn || ''}|${wizardPrefill?.checkOut || ''}`;
  }, [wizardPrefill]);
  const [showUnitsFilters, setShowUnitsFilters] = useState<boolean>(true);
  const [unitsCards, setUnitsCards] = useState<Array<{
    id: string;
    unit_number: string;
    status?: string | null;
    unit_type_id?: string | null;
    unit_type_name?: string | null;
    daily_price?: number | null;
    annual_price?: number | null;
    hotel_id?: string | null;
    hotel_name?: string | null;
    floor?: string | null;
    booking?: { customer_name?: string | null; phone?: string | null; check_in?: string | null; check_out?: string | null } | null;
    hasArrivalToday?: boolean;
    hasDepartureToday?: boolean;
    hasLate?: boolean;
    arrivalsList?: string[];
    departuresList?: string[];
    bookingsRange?: Array<{ check_in: string; check_out: string; status: string; customer_name?: string; phone?: string }>;
  }>>([]);
  const [unitsLoading, setUnitsLoading] = useState<boolean>(false);
  const [filterStart, setFilterStart] = useState<string>('');
  const [filterEnd, setFilterEnd] = useState<string>('');
  const [unavailableUnitIds, setUnavailableUnitIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<{ arrivals: boolean; departures: boolean; cleaning: boolean; maintenance: boolean; available: boolean; occupied: boolean; extensionGrace: boolean }>({ arrivals: false, departures: false, cleaning: false, maintenance: false, available: false, occupied: false, extensionGrace: false });
  const [typeFilterIds, setTypeFilterIds] = useState<Set<string>>(new Set());
  const [monthsCount, setMonthsCount] = useState<number>(1);
  const [pendingUnitNumber, setPendingUnitNumber] = useState<string | null>(null);
  const [floor, setFloor] = useState<string>('');
  const [selectedDayLine, setSelectedDayLine] = useState<string>(formatDate(new Date()));
  const [unitDetailsModal, setUnitDetailsModal] = useState<any | null>(null);

  useEffect(() => {
    if (!activeHotelId) return;
    setSelectedHotelId(activeHotelId === 'all' ? '' : activeHotelId);
  }, [activeHotelId]);
  const [showPickPeriodHint, setShowPickPeriodHint] = useState(false);

  const appliedUrlPrefillRef = useRef(false);
  useEffect(() => {
    if (appliedUrlPrefillRef.current) return;
    const unitId = searchParams.get('unit_id') || '';
    const checkIn = searchParams.get('check_in') || '';
    const checkOut = searchParams.get('check_out') || '';
    if (!unitId || !checkIn || !checkOut) return;
    appliedUrlPrefillRef.current = true;
    setFilterStart(checkIn);
    setFilterEnd(checkOut);
    setSelectedDayLine(checkIn);
    setWizardPrefill({ unitId, checkIn, checkOut });
    setShowForm(true);
    setTimeout(() => {
      try {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {}
    }, 50);
  }, [searchParams]);

  // Generate days for the top bar (e.g. from 2 days ago to 14 days ahead)
  const timelineDays = useMemo(() => {
    const days = [];
    const baseDate = new Date();
    // Start from 2 days ago
    baseDate.setDate(baseDate.getDate() - 2);
    
    for (let i = 0; i < 15; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);
      days.push(formatDate(d));
    }
    return days;
  }, []);

  const parseStatusFromNotes = (raw?: string | null): { status?: 'unconfirmed' | 'confirmed'; notes: string } => {
    const text = (raw || '').toString();
    const lines = text.split('\n');
    if (lines[0]?.startsWith('__status__:')) {
      const status = lines[0].split(':')[1]?.trim();
      const rest = lines.slice(1).join('\n').trim();
      if (status === 'confirmed' || status === 'unconfirmed') {
        return { status, notes: rest };
      }
    }
    return { notes: text || '' };
  };

  const composeNotesWithStatus = (notes: string, status?: 'unconfirmed' | 'confirmed') => {
    if (!status) return (notes || '').trim();
    const body = (notes || '').trim();
    return `__status__:${status}${body ? '\n' + body : ''}`;
  };

  const loadEntriesFromDB = async () => {
    try {
      const { data, error } = await supabase
        .from('booking_intake_logs')
        .select('id, created_at, customer_name, phone, id_type, customer_id_number, hotel_name, check_in, check_out, units_count, booking_type, unit_type, unit_number, agreed_price, unit_pref, staff_name, notes')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const mapped: Entry[] = (data || []).map((r: any) => {
        const parsed = parseStatusFromNotes(r.notes);
        return {
          id: r.id,
          created_at: r.created_at,
          customer_name: r.customer_name || '',
          phone: r.phone || '',
          id_type: r.id_type || 'national_id',
          customer_id_number: r.customer_id_number || '',
          check_in: r.check_in || '',
          check_out: r.check_out || '',
          units_count: r.units_count || 1,
          booking_type: r.booking_type || 'daily',
          hotel_name: r.hotel_name || '',
          unit_pref: r.unit_pref || '',
          unit_type: r.unit_type || '',
          unit_number: r.unit_number || '',
          agreed_price: Number(r.agreed_price || 0),
          notes: parsed.notes || '',
          staff_name: r.staff_name || '',
          status: parsed.status || 'unconfirmed',
        };
      });
      setEntries(mapped);
    } catch {
      setEntries([]);
    }
  };

  useEffect(() => {
    loadEntriesFromDB();
  }, []);

  useEffect(() => {
    const loadStaffName = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setStaffLoading(false);
          return;
        }
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', user.id)
          .single();
        const name = profile?.full_name || profile?.email || '';
        if (name) setStaffName(name);
      } finally {
        setStaffLoading(false);
      }
    };
    loadStaffName();
  }, []);

  const saveEntries = (arr: Entry[]) => {
    setEntries(arr);
  };

  useEffect(() => {
    const loadUnitTypes = async () => {
      try {
        const { data, error } = await supabase
          .from('unit_types')
          .select('id, name, daily_price, annual_price')
          .order('name', { ascending: true });
        if (!error) setUnitTypes((data || []).map((d: any) => ({ id: d.id, name: d.name, daily_price: d.daily_price, annual_price: d.annual_price })));
      } catch {}
    };
    loadUnitTypes();
  }, []);

  useEffect(() => {
    const loadHotels = async () => {
      try {
        const { data, error } = await supabase
          .from('hotels')
          .select('id, name')
          .order('name', { ascending: true });
        if (!error) setHotels((data || []).map((h: any) => ({ id: h.id, name: h.name })));
      } catch {}
    };
    loadHotels();
  }, []);

  useEffect(() => {
    const loadUnitsCards = async () => {
      setUnitsLoading(true);
      try {
        const { data, error } = await supabase
          .from('units')
          .select('id, unit_number, status, unit_type_id, hotel_id, floor, unit_type:unit_types(name, daily_price, annual_price), hotel:hotels(name)')
          .order('unit_number', { ascending: true });
        if (!error) {
          const list = (data || []).map((u: any) => {
            const nested = u.unit_type || {};
            const h = u.hotel || {};
            return {
              id: u.id,
              unit_number: u.unit_number,
              status: u.status,
              unit_type_id: u.unit_type_id ?? null,
              unit_type_name: nested?.name ?? null,
              daily_price: nested?.daily_price ?? null,
              annual_price: nested?.annual_price ?? null,
              hotel_id: u.hotel_id ?? null,
              hotel_name: h?.name ?? null,
              floor: u.floor ?? null
            };
          });
          const unitIds = list.map((u) => u.id);
          let bookingsMap: Record<string, any[]> = {};
          if (unitIds.length > 0) {
            const today = new Date();
            const todayStr = today.toISOString().slice(0, 10);
            const { data: bookings, error: bErr } = await supabase
              .from('bookings')
              .select('id, unit_id, check_in, check_out, status, customer:customers(full_name, phone)')
              .in('unit_id', unitIds)
              .in('status', ['confirmed', 'deposit_paid', 'checked_in'])
              .gte('check_out', todayStr)
              .order('check_in', { ascending: true });
            if (!bErr && bookings) {
              bookings.forEach((b: any) => {
                const arr = bookingsMap[b.unit_id] || [];
                arr.push(b);
                bookingsMap[b.unit_id] = arr;
              });
            }
          }
          const withBookings = list.map((u) => {
            const arr = bookingsMap[u.id] || [];
            
            return {
              ...u,
              booking: null, // Will be calculated dynamically based on selected day
              hasArrivalToday: false, // Will be calculated dynamically
              hasDepartureToday: false, // Will be calculated dynamically
              hasLate: false, // Will be calculated dynamically
              arrivalsList: arr.map((b: any) => b.check_in).filter(Boolean),
              departuresList: arr
                .map((b: any) => {
                  if (!b.check_out) return null;
                  return b.check_out;
                })
                .filter(Boolean) as string[],
              bookingsRange: arr.map((b: any) => ({ 
                check_in: b.check_in, 
                check_out: b.check_out, 
                status: b.status,
                customer_name: b.customer && (Array.isArray(b.customer) ? b.customer[0]?.full_name : b.customer.full_name),
                phone: b.customer && (Array.isArray(b.customer) ? b.customer[0]?.phone : b.customer.phone)
              })).filter((x: any) => x.check_in && x.check_out && x.status)
            };
          });
          setUnitsCards(withBookings);
        }
      } finally {
        setUnitsLoading(false);
      }
    };
    loadUnitsCards();
  }, []);

  const addMonths = (dateStr: string, m: number) => {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      d.setMonth(d.getMonth() + m);
      return formatDate(d);
    } catch {
      return dateStr;
    }
  };
  const addDays = (dateStr: string, days: number) => {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      d.setDate(d.getDate() + days);
      return formatDate(d);
    } catch {
      return dateStr;
    }
  };
  const diffNights = (start?: string, end?: string) => {
    if (!start || !end) return null;
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    const ms = e.getTime() - s.getTime();
    if (isNaN(ms)) return null;
    const nights = Math.round(ms / (1000 * 60 * 60 * 24));
    return nights >= 0 ? nights : null;
  };

  const CalendarInline = ({
    value,
    onChange,
    min,
    label,
    rangeStart,
    rangeEnd,
    initialMonthDate,
  }: {
    value?: string;
    onChange: (v: string) => void;
    min?: string;
    label?: string;
    rangeStart?: string;
    rangeEnd?: string;
    initialMonthDate?: string;
  }) => {
    // For backwards compatibility with the old usage where we passed value
    const effectiveStart = rangeStart || value || '';
    const effectiveEnd = rangeEnd || '';

    // If there's an initialMonthDate passed, use that to determine the starting month/year
    // otherwise fallback to effectiveStart or today
    const initial = initialMonthDate ? new Date(initialMonthDate + 'T00:00:00') : (effectiveStart ? new Date(effectiveStart + 'T00:00:00') : new Date());
    const [year, setYear] = useState<number>(initial.getFullYear());
    const [month, setMonth] = useState<number>(initial.getMonth());

    // Update the calendar view if initialMonthDate changes externally
    useEffect(() => {
      if (initialMonthDate) {
        const d = new Date(initialMonthDate + 'T00:00:00');
        if (!isNaN(d.getTime())) {
          setYear(d.getFullYear());
          setMonth(d.getMonth());
        }
      }
    }, [initialMonthDate]);

    const displayDate = new Date(year, month, 1);
    const start = new Date(displayDate);
    start.setDate(1 - start.getDay()); // يبدأ من الأحد
    const days: Date[] = Array.from({ length: 42 }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });

    const rangeStartDate = effectiveStart ? new Date(effectiveStart + 'T00:00:00') : null;
    const rangeEndDate = effectiveEnd ? new Date(effectiveEnd + 'T00:00:00') : null;
    
    const isSameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    
    const ymd = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const inCurrentMonth = (d: Date) => d.getMonth() === month && d.getFullYear() === year;
    const minDate = min ? new Date(min + 'T00:00:00') : null;
    const isDisabled = (d: Date) => (minDate ? d < minDate : false);

    const inRange = (d: Date) => {
      if (!rangeStartDate || !rangeEndDate) return false;
      const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const rs = new Date(rangeStartDate.getFullYear(), rangeStartDate.getMonth(), rangeStartDate.getDate());
      const re = new Date(rangeEndDate.getFullYear(), rangeEndDate.getMonth(), rangeEndDate.getDate());
      return dd > rs && dd < re;
    };

    const handleDateClick = (d: Date) => {
      if (isDisabled(d)) return;
      onChange(ymd(d));
      setYear(d.getFullYear());
      setMonth(d.getMonth());
    };

    return (
      <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm bg-white">
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Calendar className="text-blue-600" size={18} />
            <div className="text-sm font-extrabold text-gray-900">{label || 'تحديد فترة الحجز'}</div>
          </div>
          <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
            <button
              type="button"
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              onClick={() => {
                const d = new Date(year, month, 1);
                d.setMonth(d.getMonth() - 1);
                setYear(d.getFullYear());
                setMonth(d.getMonth());
              }}
              title="الشهر السابق"
            >
              <ArrowRight size={14} className="rotate-180" />
            </button>
            <div className="text-sm font-bold text-gray-800 min-w-[110px] text-center select-none">
              {new Date(year, month, 1).toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' })}
            </div>
            <button
              type="button"
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              onClick={() => {
                const d = new Date(year, month, 1);
                d.setMonth(d.getMonth() + 1);
                setYear(d.getFullYear());
                setMonth(d.getMonth());
              }}
              title="الشهر التالي"
            >
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
        
        <div className="p-4 bg-white">
          <div className="grid grid-cols-7 gap-y-3 gap-x-1 mb-2">
            {['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'].map((w) => (
              <div key={w} className="text-[11px] font-bold text-gray-500 text-center pb-2 border-b border-gray-100 select-none">
                {w}
              </div>
            ))}
            {days.map((d) => {
              const isStart = rangeStartDate && isSameDay(d, rangeStartDate);
              const isEnd = rangeEndDate && isSameDay(d, rangeEndDate);
              const isInRange = inRange(d);
              const muted = !inCurrentMonth(d);
              
              return (
                <div key={ymd(d)} className="relative flex justify-center">
                  {/* Background highlight for range */}
                  {isInRange && (
                    <div className="absolute inset-0 bg-blue-50/80 -mx-0.5"></div>
                  )}
                  {isStart && rangeEndDate && (
                    <div className="absolute inset-y-0 left-0 w-1/2 bg-blue-50/80"></div>
                  )}
                  {isEnd && rangeStartDate && (
                    <div className="absolute inset-y-0 right-0 w-1/2 bg-blue-50/80"></div>
                  )}
                  
                  <button
                    type="button"
                    onClick={() => handleDateClick(d)}
                    className={cn(
                      "relative z-10 h-9 w-9 rounded-full text-sm font-medium transition-all flex items-center justify-center",
                      isStart || isEnd
                        ? "bg-blue-600 text-white shadow-md shadow-blue-200 scale-105"
                        : isInRange
                        ? "text-blue-800 hover:bg-blue-100"
                        : muted
                        ? "text-gray-300 hover:bg-gray-50"
                        : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    )}
                  >
                    {d.getDate()}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs">
           <div className="flex gap-4">
             <div>
               <span className="text-gray-500 ml-1">المختار:</span>
               <span className="font-medium text-gray-900 font-mono">{value || '—'}</span>
             </div>
           </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (booking_type === 'yearly' && check_in) {
      const out = addMonths(check_in, Math.max(1, monthsCount));
      setCheckOut(out);
    }
  }, [booking_type, check_in, monthsCount]);
  useEffect(() => {
    if (booking_type !== 'daily') return;
    if (!check_in) return;
    const minOut = addDays(check_in, 1);
    if (!check_out || check_out <= check_in) {
      setCheckOut(minOut);
      return;
    }
    if (check_out <= check_in) setCheckOut(minOut);
  }, [booking_type, check_in, check_out]);

  useEffect(() => {
    const run = async () => {
      if (!filterStart || !filterEnd || unitsCards.length === 0) {
        setUnavailableUnitIds(new Set());
        return;
      }
      const unitIds = unitsCards.map((u) => u.id);
      const { data: overlaps, error } = await supabase
        .from('bookings')
        .select('unit_id')
        .in('unit_id', unitIds)
        .lte('check_in', filterEnd)
        .gt('check_out', filterStart)
        .in('status', ['confirmed', 'deposit_paid', 'checked_in', 'checked_out', 'completed']);
      if (error) {
        setUnavailableUnitIds(new Set());
        return;
      }
      const busy = new Set((overlaps || []).map((b: any) => b.unit_id));
      setUnavailableUnitIds(busy);
    };
    run();
  }, [filterStart, filterEnd, unitsCards]);

  const filteredUnits = useMemo(() => {
    let list = unitsCards.slice();
    if (typeFilterIds.size > 0) {
      list = list.filter((u) => u.unit_type_id && typeFilterIds.has(u.unit_type_id));
    }
    const anyStatus = statusFilter.arrivals || statusFilter.departures || statusFilter.cleaning || statusFilter.maintenance || statusFilter.available || statusFilter.occupied || statusFilter.extensionGrace;
    
    // First, map units to update their dynamic properties based on the selected day
    const mappedList = list.map(u => {
      const arr = u.bookingsRange || [];
      const targetDay = selectedDayLine;
      
      // Find the booking that is active on the selected day
      let chosen = arr.find((b: any) => (b.check_in || '') <= targetDay && targetDay < (b.check_out || ''));
      if (!chosen && arr.length > 0) {
          // Fallback if no exact match but there are bookings (e.g. check-out day)
          chosen = arr.find((b: any) => b.check_out === targetDay) || arr[0];
      }

      const hasArrivalToday = arr.some((b: any) => (b.check_in || '') === targetDay);
      const hasDepartureToday = arr.some((b: any) => (b.check_out || '') === targetDay);
      const hasLate = arr.some((b: any) => (b.check_out || '') === targetDay && (b.status === 'checked_in')) || 
                      arr.some((b: any) => (b.check_in || '') === targetDay && (b.status === 'confirmed' || b.status === 'deposit_paid'));

      return {
        ...u,
        booking: chosen ? {
          customer_name: chosen.customer_name || null,
          phone: chosen.phone || null,
          check_in: chosen.check_in,
          check_out: chosen.check_out
        } : null,
        hasArrivalToday,
        hasDepartureToday,
        hasLate
      };
    });

    let filteredList = mappedList;

    if (anyStatus) {
      filteredList = filteredList.filter((u) => {
        const s = (u.status || '').toLowerCase();
        const isCurrentlyOccupied = s === 'occupied' || (u.booking && u.booking.check_in);
        const availByRange = filterStart && filterEnd ? !unavailableUnitIds.has(u.id) : s === 'available' && !u.booking;
        
        if (statusFilter.available && !availByRange) return false;
        if (statusFilter.occupied && !isCurrentlyOccupied && !unavailableUnitIds.has(u.id)) return false;
        if (statusFilter.cleaning && s !== 'cleaning') return false;
        if (statusFilter.maintenance && s !== 'maintenance') return false;
        
        // Arrival/Departure filters based on selected period or selected day line
        const refStart = filterStart || selectedDayLine;
        
        // For arrivals, we check against the start date (or selected day) or the range
        const inArrivalRange = (dateStr?: string): boolean => {
          if (!dateStr) return false;
          if (filterStart && filterEnd) return dateStr >= filterStart && dateStr <= filterEnd;
          return dateStr === refStart; 
        };

        // For departures, we check if it equals the selected day or the end date if a range is selected
        const inDepartureRange = (dateStr?: string): boolean => {
          if (!dateStr) return false;
          if (filterStart && filterEnd) return dateStr >= filterStart && dateStr <= filterEnd;
          return dateStr === selectedDayLine; 
        };
        
        if (statusFilter.arrivals) {
          const arrivals = u.arrivalsList || [];
          if (!arrivals.some((d) => inArrivalRange(d))) return false;
        }
        if (statusFilter.departures) {
          const deps = u.departuresList || [];
          if (!deps.some((d) => inDepartureRange(d))) return false;
        }
        if (statusFilter.extensionGrace) {
          const bookings = u.bookingsRange || [];
          const ref = refStart;
          const activeStatuses = new Set(['confirmed', 'deposit_paid', 'checked_in']);
          const needsGrace = bookings.some((b) => {
            if (!activeStatuses.has((b.status || '').toLowerCase())) return false;
            if (!(b.check_in && b.check_out)) return false;
            const active = b.check_in <= ref && ref < b.check_out;
            if (!active) return false;
            const remaining = diffNights(ref, b.check_out);
            return remaining !== null && remaining < 8 && remaining >= 0;
          });
          if (!needsGrace) return false;
        }
        return true;
      });
    }
    return filteredList;
  }, [unitsCards, typeFilterIds, statusFilter, filterStart, filterEnd, unavailableUnitIds, selectedDayLine]);

  const periodSelected = Boolean(filterStart && filterEnd);

  const unitStats = useMemo(() => {
    let total = 0;
    let available = 0;
    let reserved = 0;
    let cleaning = 0;
    let maintenance = 0;
    let arrivals = 0;
    let departures = 0;
    let late = 0;
    for (const u of filteredUnits) {
      total += 1;
      const s = (u.status || '').toLowerCase();
      const maintenanceOrCleaning = s === 'cleaning' || s === 'maintenance';
      const hasBooking = filterStart && filterEnd ? unavailableUnitIds.has(u.id) : !!u.booking;
      const effectiveStatus = hasBooking
        ? 'reserved'
        : (filterStart && filterEnd && !maintenanceOrCleaning)
          ? 'available'
          : s || 'unknown';
      if (effectiveStatus === 'available') available += 1;
      else if (effectiveStatus === 'reserved' || effectiveStatus === 'occupied') reserved += 1;
      else if (effectiveStatus === 'cleaning') cleaning += 1;
      else if (effectiveStatus === 'maintenance') maintenance += 1;
      if (u.hasArrivalToday) arrivals += 1;
      if (u.hasDepartureToday) departures += 1;
      if (u.hasLate) late += 1;
    }
    const notReady = cleaning + maintenance;
    return { total, available, reserved, notReady, arrivals, departures, late };
  }, [filteredUnits, filterStart, filterEnd, unavailableUnitIds]);

  useEffect(() => {
    if (!selectedUnitTypeId) return;
    const t = unitTypes.find(u => u.id === selectedUnitTypeId);
    if (!t) return;
    const daily = typeof t.daily_price === 'number' ? Math.round(Number(t.daily_price)) : null;
    let monthly = typeof t.annual_price === 'number' ? Math.round(Number(t.annual_price) / 12) : null;
    if (monthly == null && daily != null) monthly = Math.round(daily * 30);
    if (booking_type === 'yearly') {
      const months = Math.max(1, monthsCount || 1);
      const rate = monthly || 0;
      const total = rate * months;
      if (total > 0) setAgreedPrice(total);
    } else {
      const nights = (diffNights(check_in, check_out) ?? 0);
      const rate = daily != null ? daily : (monthly != null ? Math.round(monthly / 30) : 0);
      const total = rate * (nights > 0 ? nights : 0);
      if (total > 0) setAgreedPrice(total);
    }
  }, [selectedUnitTypeId, booking_type, unitTypes, check_in, check_out, monthsCount]);

  useEffect(() => {
    const loadUnits = async () => {
      setAvailableUnits([]);
      setUnitNumber('');
      if (!selectedUnitTypeId) return;
      try {
        let query = supabase
          .from('units')
          .select('id, unit_number, unit_type_id, hotel_id, floor')
          .eq('unit_type_id', selectedUnitTypeId) as any;
        if (selectedHotelId) {
          query = query.eq('hotel_id', selectedHotelId);
        }
        const { data: units, error: unitsErr } = await query;
        if (unitsErr) throw unitsErr;
        let list: { id: string; unit_number: string; floor: string | null }[] =
          (units || []).map((u: any) => ({
            id: u.id,
            unit_number: u.unit_number,
            floor: u.floor != null ? String(u.floor) : null,
          }));
        if (check_in && check_out) {
          const unitIds = list.map((u) => u.id);
          if (unitIds.length > 0) {
            const { data: overlaps, error: bookErr } = await supabase
              .from('bookings')
              .select('unit_id')
              .in('unit_id', unitIds)
              .lte('check_in', check_out)
              .gt('check_out', check_in)
              .in('status', ['confirmed', 'deposit_paid', 'checked_in', 'checked_out', 'completed']);
            if (!bookErr) {
              const busy = new Set((overlaps || []).map((b: any) => b.unit_id));
              list = list.filter((u) => !busy.has(u.id));
            }
          }
        }
        setAvailableUnits(list);
        if (pendingUnitNumber) {
          const found = list.find((u) => u.unit_number === pendingUnitNumber);
          if (found) {
            setUnitNumber(pendingUnitNumber);
            setFloor(found.floor ? String(found.floor) : '');
            setPendingUnitNumber(null);
          }
        }
      } catch {
        setAvailableUnits([]);
      }
    };
    loadUnits();
  }, [selectedUnitTypeId, check_in, check_out]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staff_name || !staff_name.trim()) {
      alert('اسم الموظف مطلوب. الرجاء تسجيل الدخول بحساب الموظف.');
      return;
    }
    const unitTypeName = unitTypes.find(t => t.id === selectedUnitTypeId)?.name || unit_type.trim();
    (async () => {
      try {
        const payload = {
          customer_name: customer_name.trim(),
          phone: phone.trim(),
          id_type,
          customer_id_number: customer_id_number.trim(),
          check_in: check_in || null,
          check_out: check_out || null,
          units_count: Number(units_count) || 1,
          booking_type,
          hotel_name: hotel_name.trim(),
          unit_pref: unit_pref.trim(),
          unit_type: unitTypeName,
          unit_number: unit_number.trim(),
          agreed_price: typeof agreed_price === 'number' ? agreed_price : Number(agreed_price || 0),
          notes: composeNotesWithStatus(notes.trim(), editingId ? (entries.find(e => e.id === editingId)?.status || 'unconfirmed') : 'unconfirmed'),
          staff_name: staff_name.trim(),
        } as any;
        if (editingId) {
          const { error } = await supabase
            .from('booking_intake_logs')
            .update(payload)
            .eq('id', editingId);
          if (error) throw error;
          setEditingId(null);
          alert('تم تحديث البيانات');
        } else {
          const { error } = await supabase
            .from('booking_intake_logs')
            .insert(payload);
          if (error) throw error;
          alert('تم حفظ البيانات');
        }
        await loadEntriesFromDB();
      } catch (err: any) {
        alert('تعذر حفظ البيانات: ' + (err.message || 'خطأ غير معروف'));
      }
    })();
    setCustomerName('');
    setPhone('');
    setIdType('national_id');
    setCustomerIdNumber('');
    setCheckIn('');
    setCheckOut('');
    setUnitsCount(1);
    setBookingType('daily');
    setHotelName('');
    setUnitPref('');
    setUnitType('');
    setSelectedUnitTypeId('');
    setUnitNumber('');
    setAgreedPrice('');
    setNotes('');
  };

  const handleDelete = (id: string) => {
    (async () => {
      try {
        const { error } = await supabase
          .from('booking_intake_logs')
          .delete()
          .eq('id', id);
        if (error) throw error;
        await loadEntriesFromDB();
      } catch (err: any) {
        alert('تعذر الحذف: ' + (err.message || 'خطأ غير معروف'));
      }
    })();
  };

  const handleConfirm = (id: string) => {
    if (!isAdmin) {
      alert('التأكيد مسموح للمشرف فقط');
      return;
    }
    const target = entries.find(e => e.id === id);
    if (!target) return;
    (async () => {
      try {
        const { error } = await supabase
          .from('booking_intake_logs')
          .update({ notes: composeNotesWithStatus(target.notes, 'confirmed') })
          .eq('id', id);
        if (error) throw error;
        await loadEntriesFromDB();
      } catch (err: any) {
        alert('تعذر التأكيد: ' + (err.message || 'خطأ غير معروف'));
      }
    })();
  };

  const handleEdit = (r: Entry) => {
    setEditingId(r.id);
    setShowForm(true);
    setCustomerName(r.customer_name || '');
    setPhone(r.phone || '');
    setIdType(r.id_type);
    setCustomerIdNumber(r.customer_id_number || '');
    setCheckIn(r.check_in || '');
    setCheckOut(r.check_out || '');
    setUnitsCount(r.units_count || 1);
    setBookingType(r.booking_type || 'daily');
    setUnitPref(r.unit_pref || '');
    setAgreedPrice(r.agreed_price || 0);
    setNotes(r.notes || '');
    setHotelName(r.hotel_name || '');
    const hid = hotels.find(h => h.name === r.hotel_name)?.id || '';
    setSelectedHotelId(hid);
    const tid = unitTypes.find(t => t.name === r.unit_type)?.id || '';
    setSelectedUnitTypeId(tid);
    setUnitType(r.unit_type || '');
    setPendingUnitNumber(r.unit_number || null);
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const pricingCalc = useMemo(() => {
    const t = unitTypes.find(u => u.id === selectedUnitTypeId);
    let dailyRate: number | null = null;
    let monthlyRate: number | null = null;
    if (t) {
      dailyRate = typeof t.daily_price === 'number' ? Math.round(Number(t.daily_price)) : null;
      monthlyRate = typeof t.annual_price === 'number' ? Math.round(Number(t.annual_price) / 12) : null;
      if (monthlyRate == null && dailyRate != null) monthlyRate = Math.round(dailyRate * 30);
    }
    const nights = diffNights(check_in, check_out);
    return { dailyRate, monthlyRate, nights };
  }, [unitTypes, selectedUnitTypeId, check_in, check_out, monthsCount, booking_type]);

  const inputBase = "w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500";
  const selectBase = "w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500";
  const inputDisabled = "disabled:bg-gray-50 disabled:text-gray-400 disabled:shadow-none";
  const inputReadOnly = "bg-gray-50 text-gray-700 shadow-none";

  return (
    <RoleGate allow={['admin', 'manager', 'receptionist', 'accountant', 'marketing']}>
      <>
        <style>{`
          .screen-only { display: block; }
          .print-only { display: none; }
          @media print {
            .screen-only { display: none !important; }
            .print-only { display: block !important; }
            header, aside, nav, .sticky, .fixed { display: none !important; }
            .print-title { font-size: 18px; font-weight: 800; color: #111827; margin-bottom: 6px; }
            .print-sub { color: #6b7280; font-size: 12px; margin-bottom: 10px; }
            .p-table { width: 100%; border-collapse: collapse; }
            .p-table th, .p-table td { border: 1px solid #e5e7eb; padding: 6px; text-align: right; font-size: 12px; }
            .p-table th { background: #f9fafb; font-weight: 700; }
          }
        `}</style>
        <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-5 sm:space-y-6 screen-only">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 sm:p-6 bg-gradient-to-r from-gray-50 to-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="p-2 hover:bg-white rounded-xl transition-colors text-gray-600 border border-gray-200 bg-white shadow-sm"
              >
                <ArrowRight size={20} />
              </Link>
              <div>
                <h1 className="text-lg sm:text-2xl font-extrabold text-gray-900 flex items-center gap-2">
                  <ClipboardList className="text-blue-600" size={20} />
                  تعبئة بيانات الحجز
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">
                  خاصة بالاستقبال لتسجيل بيانات الحجز واطلاع الإدارة عليها لاحقاً.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowForm((s) => {
                  const next = !s;
                  if (next) setWizardPrefill(null);
                  return next;
                })}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors text-xs sm:text-sm font-bold shadow-sm"
                title={showForm ? 'إخفاء شاشة الحجز' : 'عرض شاشة الحجز'}
              >
                <ClipboardList size={16} />
                <span>{showForm ? 'إخفاء شاشة الحجز' : 'حجز جديد'}</span>
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-xs sm:text-sm font-bold shadow-sm"
              >
                <span>طباعة</span>
              </button>
            </div>
          </div>
        </div>

        {showForm && (
          <div ref={formRef} data-form-anchor="booking-form" className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="text-sm font-extrabold text-gray-900">شاشة الحجز</div>
              <div className="text-xs text-gray-500">Booking wizard</div>
            </div>
            <BookingWizard
              key={wizardKey}
              initialUnitId={wizardPrefill?.unitId}
              initialCheckIn={wizardPrefill?.checkIn}
              initialCheckOut={wizardPrefill?.checkOut}
            />
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 sm:p-5 border-b bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="font-extrabold text-gray-900">الوحدات المتاحة في النظام</div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">{unitsLoading ? 'جارِ التحميل...' : `${unitsCards.length} وحدة`}</span>
            </div>
            <button
              onClick={() => setShowUnitsFilters(v => !v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${showUnitsFilters ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
            >
              {showUnitsFilters ? 'إخفاء الفلاتر' : 'عرض الفلاتر'}
            </button>
          </div>

          {/* Timeline Bar */}
          <div className="px-4 py-2 border-b border-gray-200 bg-gray-50/50 overflow-x-auto custom-scrollbar">
            <div className="flex items-center gap-2 min-w-max">
              <div className="text-[10px] font-bold text-gray-500 ml-2 whitespace-nowrap">شريط الأيام:</div>
              {timelineDays.map((day) => {
                const isSelected = day === selectedDayLine;
                const isToday = day === formatDate(new Date());
                const dateObj = new Date(day + 'T00:00:00');
                const dayName = ['أح', 'إث', 'ثل', 'أر', 'خم', 'جم', 'سب'][dateObj.getDay()];
                const dayNum = dateObj.getDate();
                const monthName = dateObj.toLocaleDateString('ar-SA', { month: 'short' });

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDayLine(day)}
                    className={cn(
                      "flex flex-col items-center justify-center min-w-[50px] p-1.5 rounded-xl border transition-all shadow-sm relative overflow-hidden",
                      isSelected 
                        ? "bg-blue-600 text-white border-blue-600 shadow-blue-200 shadow-md transform scale-105 z-10" 
                        : isToday
                          ? "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100"
                          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    {isToday && !isSelected && (
                      <span className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full"></span>
                    )}
                    <span className="text-[9px] font-medium opacity-80">{dayName}</span>
                    <span className="text-sm font-black mt-0.5">{dayNum}</span>
                    <span className="text-[8px] opacity-70 mt-0.5">{monthName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3 sm:p-4 space-y-3" ref={unitsFiltersRef}>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-[11px] text-emerald-900 leading-6">
              <div className="font-black mb-1">ترتيب العمل الصحيح</div>
              <div>1) حدّد فترة الإقامة (الوصول والمغادرة) أولاً.</div>
              <div>2) اختر الوحدة المناسبة من البطاقات بالأسفل.</div>
              <div>3) بعدها أكمل بيانات الحجز في النموذج.</div>
            </div>
            {showPickPeriodHint && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[11px] text-red-900 font-bold">
                قبل اختيار الوحدة: حدّد فترة الإقامة (الوصول + المغادرة) من أعلى.
              </div>
            )}
            <div className={`grid grid-cols-1 gap-3 transform transition-all duration-300 ${showUnitsFilters ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
              <div className="bg-white/70 border rounded-xl p-3 shadow-sm overflow-hidden max-w-full">
                <div className="text-xs text-gray-900 font-bold mb-2">الفترة</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] text-gray-600 mb-1">الوصول</div>
                    <CalendarInline
                      value={filterStart}
                      onChange={(v) => {
                        setFilterStart(v);
                        if (v && filterEnd && filterEnd <= v) {
                          setFilterEnd(addDays(v, 1));
                        }
                      }}
                      label="الوصول"
                      rangeStart={filterStart}
                      rangeEnd={filterEnd}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] text-gray-600 mb-1">المغادرة</div>
                    <CalendarInline
                      value={filterEnd}
                      onChange={(v) => {
                        if (filterStart && v <= filterStart) {
                          setFilterEnd(addDays(filterStart, 1));
                        } else {
                          setFilterEnd(v);
                        }
                      }}
                      min={filterStart ? (() => { const d = new Date(filterStart + 'T00:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })() : undefined}
                      label="المغادرة"
                      rangeStart={filterStart}
                      rangeEnd={filterEnd}
                      initialMonthDate={filterEnd || undefined}
                    />
                  </div>
                </div>
                <div className="mt-2">
                  {filterStart && filterEnd ? (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-900 border border-blue-200 text-[11px] font-bold">
                      عدد الليالي: {diffNights(filterStart, filterEnd) ?? '-'}
                    </div>
                  ) : null}
                </div>
                <div className="mt-4">
                  <div className="text-[11px] text-gray-500 mb-3 font-bold uppercase tracking-wider flex items-center gap-2">
                    <Calendar size={12} className="text-blue-500" />
                    تحديد سريع للفترة (بدءاً من تاريخ الوصول)
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:grid sm:grid-cols-4 sm:gap-2.5">
                    {[
                      { label: 'شهر', value: 1, color: 'text-emerald-700 bg-emerald-50 border-emerald-100 hover:bg-emerald-600 hover:text-white' },
                      { label: 'شهرين', value: 2, color: 'text-teal-700 bg-teal-50 border-teal-100 hover:bg-teal-600 hover:text-white' },
                      { label: '3 أشهر', value: 3, color: 'text-cyan-700 bg-cyan-50 border-cyan-100 hover:bg-cyan-600 hover:text-white' },
                      { label: '4 أشهر', value: 4, color: 'text-sky-700 bg-sky-50 border-sky-100 hover:bg-sky-600 hover:text-white' },
                      { label: '5 أشهر', value: 5, color: 'text-blue-700 bg-blue-50 border-blue-100 hover:bg-blue-600 hover:text-white' },
                      { label: 'نصف سنة', value: 6, color: 'text-indigo-700 bg-indigo-50 border-indigo-100 hover:bg-indigo-600 hover:text-white' },
                      { label: 'سنة كاملة', value: 12, color: 'text-violet-700 bg-violet-50 border-violet-100 hover:bg-violet-600 hover:text-white sm:col-span-2' },
                    ].map((btn) => (
                      <button
                        key={btn.value}
                        type="button"
                        className={cn(
                          "relative text-[10px] sm:text-xs py-1.5 px-2 sm:py-2 sm:px-3 rounded-lg sm:rounded-xl border font-bold transition-all duration-300 shadow-sm active:scale-95 flex-grow sm:flex-grow-0 flex items-center justify-center",
                          btn.color
                        )}
                        onClick={() => {
                          const start = filterStart || formatDate(new Date());
                          setFilterStart(start);
                          setFilterEnd(addMonths(start, btn.value));
                        }}
                      >
                        <span className="relative z-10 whitespace-nowrap">{btn.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="text-xs font-extrabold text-gray-900">الحالة</div>
                  <div className="flex flex-wrap gap-1.5 sm:grid sm:grid-cols-3 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => setStatusFilter({ arrivals: !statusFilter.arrivals, departures: false, cleaning: false, maintenance: false, available: false, occupied: false, extensionGrace: false })}
                      className={cn(
                        "relative text-[10px] py-1.5 px-2 sm:py-2 sm:px-2 rounded-lg sm:rounded-xl border font-bold transition-all duration-300 shadow-sm active:scale-95 flex-grow sm:flex-grow-0 flex items-center justify-center text-center",
                        statusFilter.arrivals 
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200' 
                          : 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100'
                      )}
                    >
                      وصول
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter({ arrivals: false, departures: !statusFilter.departures, cleaning: false, maintenance: false, available: false, occupied: false, extensionGrace: false })}
                      className={cn(
                        "relative text-[10px] py-1.5 px-2 sm:py-2 sm:px-2 rounded-lg sm:rounded-xl border font-bold transition-all duration-300 shadow-sm active:scale-95 flex-grow sm:flex-grow-0 flex items-center justify-center text-center",
                        statusFilter.departures 
                          ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-200' 
                          : 'bg-violet-50 text-violet-700 border-violet-100 hover:bg-violet-100'
                      )}
                    >
                      مغادرة
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter({ arrivals: false, departures: false, cleaning: !statusFilter.cleaning, maintenance: false, available: false, occupied: false, extensionGrace: false })}
                      className={cn(
                        "relative text-[10px] py-1.5 px-2 sm:py-2 sm:px-2 rounded-lg sm:rounded-xl border font-bold transition-all duration-300 shadow-sm active:scale-95 flex-grow sm:flex-grow-0 flex items-center justify-center text-center",
                        statusFilter.cleaning 
                          ? 'bg-sky-500 text-white border-sky-500 shadow-md shadow-sky-200' 
                          : 'bg-sky-50 text-sky-700 border-sky-100 hover:bg-sky-100'
                      )}
                    >
                      تنظيف
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter({ arrivals: false, departures: false, cleaning: false, maintenance: !statusFilter.maintenance, available: false, occupied: false, extensionGrace: false })}
                      className={cn(
                        "relative text-[10px] py-1.5 px-2 sm:py-2 sm:px-2 rounded-lg sm:rounded-xl border font-bold transition-all duration-300 shadow-sm active:scale-95 flex-grow sm:flex-grow-0 flex items-center justify-center text-center",
                        statusFilter.maintenance 
                          ? 'bg-gray-800 text-white border-gray-800 shadow-md shadow-gray-400' 
                          : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                      )}
                    >
                      صيانة
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter({ arrivals: false, departures: false, cleaning: false, maintenance: false, available: !statusFilter.available, occupied: false, extensionGrace: false })}
                      className={cn(
                        "relative text-[10px] py-1.5 px-2 sm:py-2 sm:px-2 rounded-lg sm:rounded-xl border font-bold transition-all duration-300 shadow-sm active:scale-95 flex-grow sm:flex-grow-0 flex items-center justify-center text-center",
                        statusFilter.available 
                          ? 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-200' 
                          : 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                      )}
                    >
                      متاحة
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter({ arrivals: false, departures: false, cleaning: false, maintenance: false, available: false, occupied: !statusFilter.occupied, extensionGrace: false })}
                      className={cn(
                        "relative text-[10px] py-1.5 px-2 sm:py-2 sm:px-2 rounded-lg sm:rounded-xl border font-bold transition-all duration-300 shadow-sm active:scale-95 flex-grow sm:flex-grow-0 flex items-center justify-center text-center",
                        statusFilter.occupied 
                          ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-200' 
                          : 'bg-red-50 text-red-700 border-red-100 hover:bg-red-100'
                      )}
                    >
                      مشغولة
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter({ arrivals: false, departures: false, cleaning: false, maintenance: false, available: false, occupied: false, extensionGrace: !statusFilter.extensionGrace })}
                      className={cn(
                        "relative text-[10px] py-1.5 px-2 sm:py-2 sm:px-2 rounded-lg sm:rounded-xl border font-bold transition-all duration-300 shadow-sm active:scale-95 flex-grow sm:flex-grow-0 flex items-center justify-center text-center",
                        statusFilter.extensionGrace
                          ? 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-200'
                          : 'bg-amber-50 text-amber-800 border-amber-100 hover:bg-amber-100'
                      )}
                      title="مهلة التمديد: يعرض الوحدات التي لها حجز نشط وباقي على انتهائه 7 أيام أو أقل (حسب اليوم المحدد/الفترة)"
                    >
                      مهلة التمديد
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-extrabold text-gray-900">أنواع الغرف</div>
                  
                  {/* Desktop View: Grid of buttons */}
                  <div className="hidden sm:grid sm:grid-cols-3 sm:gap-2">
                    {unitTypes.map((t) => {
                      const active = typeFilterIds.has(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setTypeFilterIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(t.id)) next.delete(t.id);
                              else next.add(t.id);
                              return next;
                            });
                          }}
                          className={cn(
                            "relative text-[10px] py-2 px-2 rounded-xl border font-bold transition-all duration-300 shadow-sm active:scale-95 flex items-center justify-center text-center leading-tight",
                            active 
                              ? 'bg-gray-900 text-white border-gray-900 shadow-md shadow-gray-200' 
                              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                          )}
                          title={t.name}
                        >
                          <span className="line-clamp-2">{t.name}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Mobile View: Custom Dropdown Style */}
                  <div className="sm:hidden relative group">
                    <div className="w-full bg-white border border-gray-200 rounded-lg p-2 text-[10px] font-bold text-gray-700 flex justify-between items-center shadow-sm">
                      <span>
                        {typeFilterIds.size === 0 
                          ? 'كل الأنواع' 
                          : `محدد (${typeFilterIds.size}) أنواع`}
                      </span>
                      <ArrowRight size={12} className="rotate-90 text-gray-400" />
                    </div>
                    
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-50 p-2 hidden group-hover:flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                      {unitTypes.map((t) => {
                        const active = typeFilterIds.has(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setTypeFilterIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(t.id)) next.delete(t.id);
                                else next.add(t.id);
                                return next;
                              });
                            }}
                            className={cn(
                              "w-full text-right text-[11px] py-2 px-3 rounded-lg font-bold transition-all flex justify-between items-center",
                              active 
                                ? 'bg-blue-50 text-blue-700' 
                                : 'bg-white text-gray-700 hover:bg-gray-50'
                            )}
                          >
                            {t.name}
                            {active && <div className="w-2 h-2 rounded-full bg-blue-600"></div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white/70 border rounded-xl p-2 shadow-sm flex items-center justify-between lg:justify-end gap-2">
                <div className="text-xs text-gray-900 font-bold lg:hidden">إجراءات</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setFilterStart('');
                      setFilterEnd('');
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg border bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                    type="button"
                  >
                    مسح
                  </button>
                  <button
                    onClick={() => {
                      if (!filterStart || !filterEnd) return;
                      setCheckIn(filterStart);
                      setCheckOut(filterEnd);
                      const nights = diffNights(filterStart, filterEnd) ?? 0;
                      if (nights >= 28) {
                        setBookingType('yearly');
                        setMonthsCount(Math.max(1, Math.ceil(nights / 30)));
                      } else {
                        setBookingType('daily');
                      }
                      setShowForm(true);
                      setTimeout(() => {
                        try {
                          if (formRef && formRef.current) {
                            formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        } catch {}
                      }, 80);
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg border bg-gray-900 text-white border-gray-900 hover:bg-gray-800"
                    type="button"
                  >
                    نسخ للتفاصيل
                  </button>
                </div>
              </div>
            </div>
            
            <div className="bg-white/70 border rounded-xl p-2 shadow-sm">
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-gray-800">
                <span className="px-2 py-1 rounded-full bg-gray-900 text-white">الإجمالي: {unitStats.total}</span>
                <span className="px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800">متاحة: {unitStats.available}</span>
                <span className="px-2 py-1 rounded-full bg-red-50 border border-red-200 text-red-800">محجوزة: {unitStats.reserved}</span>
                <span className="px-2 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-800">غير جاهز: {unitStats.notReady}</span>
                <span className="px-2 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-800">وصول: {unitStats.arrivals}</span>
                <span className="px-2 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800">مغادرة: {unitStats.departures}</span>
                <span className="px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900">تأخير: {unitStats.late}</span>
              </div>
              <div className="mt-1 text-[10px] text-gray-500">
                الإحصائيات تتغير تلقائياً حسب الفلاتر والفترة المختارة.
              </div>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1 sm:gap-2">
              {filteredUnits.map((u) => {
                const s = (u.status || '').toLowerCase();
                const hasBooking = filterStart && filterEnd ? unavailableUnitIds.has(u.id) : !!u.booking;
                const maintenanceOrCleaning = s === 'cleaning' || s === 'maintenance';
                const hasDepartureAtStartExact = !!(filterStart && (u.bookingsRange || []).some((b) => (b.check_out || '') === filterStart));
                const effectiveStatus = hasBooking
                  ? 'reserved'
                  : (filterStart && filterEnd && !maintenanceOrCleaning)
                    ? 'available'
                    : s || 'unknown';
                // Determine if there's a special action today
                const isArrivalToday = u.hasArrivalToday;
                const isDepartureToday = u.hasDepartureToday;
                
                const statusBg = (isArrivalToday || isDepartureToday)
                  ? 'bg-gradient-to-br from-gray-800 to-gray-950'
                  : effectiveStatus === 'reserved' || effectiveStatus === 'occupied'
                    ? 'bg-gradient-to-br from-red-600 to-red-800'
                    : effectiveStatus === 'available'
                    ? 'bg-gradient-to-br from-emerald-500 to-emerald-700'
                    : effectiveStatus === 'maintenance'
                    ? 'bg-gradient-to-br from-gray-800 to-black'
                    : effectiveStatus === 'cleaning'
                    ? 'bg-gradient-to-br from-sky-400 to-sky-600'
                    : effectiveStatus === 'reserved-db' // assuming this is temporary/unconfirmed booking
                    ? 'bg-gradient-to-br from-orange-500 to-orange-700'
                    : 'bg-gradient-to-br from-gray-500 to-gray-700';

                const statusLabel =
                  effectiveStatus === 'reserved' || effectiveStatus === 'occupied'
                    ? 'محجوزة'
                    : effectiveStatus === 'available'
                    ? 'متاحة'
                    : effectiveStatus === 'maintenance'
                    ? 'صيانة'
                    : effectiveStatus === 'cleaning'
                    ? 'تنظيف'
                    : effectiveStatus === 'reserved-db'
                    ? 'حجز مؤقت'
                    : (u.status || 'غير محدد');
                const isSelected = pendingUnitNumber && pendingUnitNumber === u.unit_number;
                const disableSelect = (hasBooking && !hasDepartureAtStartExact) || maintenanceOrCleaning;

                // For cleaning status, we use white text on sky blue
                const textClass = 'text-white';
                const subTextClass = 'text-white/85';
                const monoTextClass = 'text-white/95';

                return (
                  <div
                    key={u.id}
                    className={cn(
                      "rounded-lg sm:rounded-xl p-1.5 sm:p-2 shadow-sm transition-all hover:shadow-md relative overflow-hidden scale-[0.92] sm:scale-100 origin-top",
                      textClass,
                      statusBg,
                      isSelected && "ring-2 ring-white/70",
                      disableSelect && "opacity-60",
                      (isArrivalToday || isDepartureToday) && "ring-2 ring-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)] text-white"
                    )}
                  >
                    {/* Animated gradient border for special statuses */}
                    {(isArrivalToday || isDepartureToday) && (
                      <div className={cn(
                        "absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-red-600 via-red-400 to-red-600"
                      )}></div>
                    )}

                    <div className="flex items-center justify-between gap-2 relative z-10">
                      <div className="flex gap-1">
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full",
                          "bg-white/20 text-white font-medium"
                        )}>
                          {statusLabel}
                        </span>
                        {isArrivalToday && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-600 text-white font-bold animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.8)] border border-red-400">
                            وصول
                          </span>
                        )}
                        {isDepartureToday && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-600 text-white font-bold animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.8)] border border-red-400">
                            مغادرة
                          </span>
                        )}
                      </div>
                      {u.hasLate ? (
                        <span title="تأخير في تسجيل الدخول/الخروج">
                          <HelpCircle size={14} className="text-white/90" />
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1.5 sm:mt-2 text-center relative z-10 cursor-pointer" onClick={() => {
                      setUnitDetailsModal({
                        unit: u,
                        statusLabel,
                        effectiveStatus,
                        isArrivalToday,
                        isDepartureToday
                      });
                    }}>
                      <div className="text-lg sm:text-xl font-extrabold leading-6">{u.unit_number}</div>
                      <div className={cn("text-[10px] truncate", subTextClass)}>{u.unit_type_name || 'نوع غير معروف'}</div>
                      <div className={cn("text-[10px] font-mono", monoTextClass)}>
                        {(() => {
                          const annual = u.annual_price === null || u.annual_price === undefined ? NaN : Number(u.annual_price);
                          const daily = u.daily_price === null || u.daily_price === undefined ? NaN : Number(u.daily_price);
                          const monthly = Number.isFinite(annual) ? annual / 12 : (Number.isFinite(daily) ? daily * 30 : NaN);
                          return Number.isFinite(monthly) && monthly > 0 ? Math.round(monthly).toLocaleString('en-US') : '—';
                        })()} ر.س/شهر
                      </div>
                      
                      {u.booking && effectiveStatus !== 'available' && (
                        <div className={cn(
                          "mt-2 rounded-lg p-1.5 backdrop-blur-sm",
                          "bg-black/20"
                        )}>
                          <div className={cn(
                            "text-[10px] font-bold truncate",
                            "text-white/90"
                          )} title={u.booking.customer_name || ''}>
                            {u.booking.customer_name || 'عميل'}
                          </div>
                          <div className="text-[9px] text-white/80 mt-0.5 font-medium">
                            {(() => {
                              const nights = diffNights(formatDate(new Date()), u.booking.check_out || '');
                              if (nights === null || nights < 0) return 'منتهي';
                              if (nights === 0) return 'يغادر اليوم';
                              return `باقي ${nights} أيام`;
                            })()}
                          </div>
                        </div>
                      )}

                      {isSelected ? (
                        <div className="mt-1 text-[10px] font-bold text-white/90">تم الاختيار</div>
                      ) : null}
                    </div>

                    <button
                      onClick={() => {
                          if (!filterStart || !filterEnd) {
                            setShowUnitsFilters(true);
                            setShowPickPeriodHint(true);
                            window.setTimeout(() => setShowPickPeriodHint(false), 2600);
                            try {
                              unitsFiltersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            } catch {}
                            return;
                          }
                          if (u.unit_type_id) {
                            setSelectedUnitTypeId(u.unit_type_id);
                            const t = unitTypes.find(tt => tt.id === u.unit_type_id);
                            setUnitType(t?.name || u.unit_type_name || '');
                          }
                          if (u.hotel_id) {
                            setSelectedHotelId(u.hotel_id);
                            setHotelName(u.hotel_name || (hotels.find(h => h.id === u.hotel_id)?.name ?? ''));
                          } else {
                            setSelectedHotelId('');
                            setHotelName('');
                          }
                          setPendingUnitNumber(u.unit_number);
                          setFloor(u.floor ? String(u.floor) : '');
                          if (filterStart) setCheckIn(filterStart);
                          if (filterEnd) setCheckOut(filterEnd);
                          if (filterStart && (u.bookingsRange || []).some((b) => (b.check_out || '') === filterStart)) {
                            const msg = 'يوجد عميل المفروض يغادر اليوم';
                            setNotes((prev) => {
                              const p = (prev || '').trim();
                              if (!p) return msg;
                              // Avoid duplicating same line
                              if (p.includes(msg)) return prev;
                              return p + '\n' + msg;
                            });
                          }
                          if (filterStart && filterEnd) {
                            const nights = diffNights(filterStart, filterEnd) ?? 0;
                            if (nights >= 28) {
                              setBookingType('yearly');
                              setMonthsCount(Math.max(1, Math.ceil(nights / 30)));
                            } else {
                              setBookingType('daily');
                            }
                          }
                          setWizardPrefill({
                            unitId: u.id,
                            checkIn: filterStart || undefined,
                            checkOut: filterEnd || undefined,
                          });
                          setShowForm(true);
                          setTimeout(() => {
                            try {
                              if (formRef && formRef.current) {
                                formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }
                            } catch {}
                          }, 80);
                        }}
                      disabled={disableSelect || !periodSelected}
                      className={cn(
                        "mt-2 w-full px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors",
                        (disableSelect || !periodSelected) ? "bg-black/20 text-white/60 cursor-not-allowed" : "bg-white/15 hover:bg-white/25 text-white"
                      )}
                        title={!periodSelected ? 'حدد فترة الإقامة أولاً (الوصول + المغادرة)' : (disableSelect ? 'غير متاحة للاختيار' : 'اختيار هذه الوحدة في النموذج')}
                    >
                      {!periodSelected ? 'حدد المدة أولاً' : 'اختيار'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Unit Details Modal */}
        {unitDetailsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setUnitDetailsModal(null)}>
            <div 
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200"
              onClick={e => e.stopPropagation()}
            >
              <div className={cn(
                "p-4 border-b flex justify-between items-center text-white",
                unitDetailsModal.isArrivalToday || unitDetailsModal.isDepartureToday
                  ? "bg-gradient-to-r from-gray-800 to-gray-900 border-red-500"
                  : unitDetailsModal.effectiveStatus === 'reserved' ? "bg-gradient-to-r from-blue-700 to-blue-900"
                  : unitDetailsModal.effectiveStatus === 'available' ? "bg-gradient-to-r from-emerald-600 to-emerald-800"
                  : "bg-gradient-to-r from-slate-700 to-slate-900"
              )}>
                <div>
                  <h3 className="text-xl font-black flex items-center gap-2">
                    <Building2 size={20} />
                    وحدة {unitDetailsModal.unit.unit_number}
                  </h3>
                  <p className="text-xs opacity-90 mt-1">{unitDetailsModal.unit.unit_type_name || 'نوع غير معروف'}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm">
                    {unitDetailsModal.statusLabel}
                  </span>
                  {(unitDetailsModal.isArrivalToday || unitDetailsModal.isDepartureToday) && (
                    <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold animate-pulse">
                      {unitDetailsModal.isArrivalToday ? 'وصول اليوم' : 'مغادرة اليوم'}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="p-5 space-y-4">
                {unitDetailsModal.unit.booking ? (
                  <>
                    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-3">
                      <div className="flex items-start gap-3 border-b border-blue-100 pb-3">
                        <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                          <User size={20} />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 font-medium">العميل الحالي</div>
                          <div className="text-sm font-bold text-gray-900">{unitDetailsModal.unit.booking.customer_name || 'غير متوفر'}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                          <Phone size={16} />
                        </div>
                        <div className="text-sm font-medium text-gray-900" dir="ltr">
                          {unitDetailsModal.unit.booking.phone || 'غير متوفر'}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="border border-gray-100 bg-gray-50 rounded-xl p-3">
                        <div className="text-[10px] text-gray-500 mb-1 flex items-center gap-1">
                          <Calendar size={12} /> تاريخ الوصول
                        </div>
                        <div className="font-bold text-gray-900 text-sm font-mono">
                          {unitDetailsModal.unit.booking.check_in || '-'}
                        </div>
                      </div>
                      <div className="border border-gray-100 bg-gray-50 rounded-xl p-3">
                        <div className="text-[10px] text-gray-500 mb-1 flex items-center gap-1">
                          <Calendar size={12} /> تاريخ المغادرة
                        </div>
                        <div className="font-bold text-gray-900 text-sm font-mono">
                          {unitDetailsModal.unit.booking.check_out || '-'}
                        </div>
                      </div>
                    </div>
                    
                    {(() => {
                      const nights = diffNights(formatDate(new Date()), unitDetailsModal.unit.booking.check_out || '');
                      return (
                        <div className={cn(
                          "rounded-xl p-3 text-center font-bold text-sm",
                          nights === null || nights < 0 ? "bg-red-50 text-red-700 border border-red-100" 
                          : nights === 0 ? "bg-orange-50 text-orange-700 border border-orange-100"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                        )}>
                          {nights === null || nights < 0 ? 'الحجز منتهي' : nights === 0 ? 'يغادر اليوم' : `متبقي ${nights} أيام على المغادرة`}
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="py-8 flex flex-col items-center justify-center text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3">
                      <Check size={24} />
                    </div>
                    <h4 className="font-bold text-gray-900">الوحدة متاحة</h4>
                    <p className="text-xs text-gray-500 mt-1 max-w-[200px]">لا يوجد حجز نشط على هذه الوحدة في اليوم المحدد، يمكنك اختيارها لحجز جديد.</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="bg-gray-50 rounded-xl p-3 flex flex-col items-center justify-center border border-gray-100">
                    <span className="text-[10px] text-gray-500">السعر اليومي</span>
                    <span className="font-bold text-gray-900 text-sm mt-0.5">
                      {unitDetailsModal.unit.daily_price ? `${unitDetailsModal.unit.daily_price} ر.س` : '—'}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 flex flex-col items-center justify-center border border-gray-100">
                    <span className="text-[10px] text-gray-500">السعر الشهري</span>
                    <span className="font-bold text-gray-900 text-sm mt-0.5">
                      {(() => {
                        const annual = unitDetailsModal.unit.annual_price === null || unitDetailsModal.unit.annual_price === undefined ? NaN : Number(unitDetailsModal.unit.annual_price);
                        const daily = unitDetailsModal.unit.daily_price === null || unitDetailsModal.unit.daily_price === undefined ? NaN : Number(unitDetailsModal.unit.daily_price);
                        const monthly = Number.isFinite(annual) ? annual / 12 : (Number.isFinite(daily) ? daily * 30 : NaN);
                        return Number.isFinite(monthly) && monthly > 0 ? `${Math.round(monthly).toLocaleString('en-US')} ر.س` : '—';
                      })()}
                    </span>
                  </div>
                </div>
              </div>
              <div className="p-4 border-t bg-gray-50 flex justify-end">
                <button
                  type="button"
                  onClick={() => setUnitDetailsModal(null)}
                  className="px-5 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-50 transition-colors"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      </>
    </RoleGate>
  );
}
