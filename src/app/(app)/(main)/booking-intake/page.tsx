'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ClipboardList, Calendar, Phone, User, Building2, BedDouble, Download, Trash2, HelpCircle, CheckCircle, Eye, Pencil, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useUserRole } from '@/hooks/useUserRole';

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
  const [entries, setEntries] = useState<Entry[]>([]);
  const formRef = useRef<HTMLDivElement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [quickView, setQuickView] = useState<Entry | null>(null);
  const { role } = useUserRole();
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
  const [notes, setNotes] = useState('');
  const [staff_name, setStaffName] = useState('');
  const [unitTypes, setUnitTypes] = useState<Array<{ id: string; name: string; daily_price?: number | null; annual_price?: number | null }>>([]);
  const [availableUnits, setAvailableUnits] = useState<Array<{ id: string; unit_number: string; floor?: string | null }>>([]);
  const [selectedUnitTypeId, setSelectedUnitTypeId] = useState<string>('');
  const [hotels, setHotels] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<string>('');
  const [staffLoading, setStaffLoading] = useState<boolean>(true);
  const [showForm, setShowForm] = useState<boolean>(false);
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
    bookingsRange?: Array<{ check_in: string; check_out: string; status: string }>;
  }>>([]);
  const [unitsLoading, setUnitsLoading] = useState<boolean>(false);
  const [filterStart, setFilterStart] = useState<string>('');
  const [filterEnd, setFilterEnd] = useState<string>('');
  const [unavailableUnitIds, setUnavailableUnitIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<{ arrivals: boolean; departures: boolean; cleaning: boolean; maintenance: boolean; available: boolean; extensionGrace: boolean }>({ arrivals: false, departures: false, cleaning: false, maintenance: false, available: false, extensionGrace: false });
  const [typeFilterIds, setTypeFilterIds] = useState<Set<string>>(new Set());
  const [monthsCount, setMonthsCount] = useState<number>(1);
  const [pendingUnitNumber, setPendingUnitNumber] = useState<string | null>(null);
  const [floor, setFloor] = useState<string>('');

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
            let chosen: any = null;
            if (arr.length > 0) {
              const todayOnly = new Date().toISOString().slice(0, 10);
              const current = arr.find((b: any) => (b.check_in || '') <= todayOnly && todayOnly < (b.check_out || ''));
              if (current) chosen = current;
              else chosen = arr[0];
            }
            const tStr = new Date().toISOString().slice(0, 10);
            const hasArrivalToday = arr.some((b: any) => (b.check_in || '') === tStr);
            const hasDepartureToday = arr.some((b: any) => (b.check_out || '') === tStr);
            const hasLateCheckout = arr.some((b: any) => (b.check_out || '') === tStr && (b.status === 'checked_in'));
            const hasLateCheckin = arr.some((b: any) => (b.check_in || '') === tStr && (b.status === 'confirmed' || b.status === 'deposit_paid'));
            const hasLate = hasLateCheckout || hasLateCheckin;
            return {
              ...u,
              booking: chosen
                ? {
                    customer_name: (chosen.customer && (Array.isArray(chosen.customer) ? chosen.customer[0]?.full_name : chosen.customer.full_name)) || null,
                    phone: (chosen.customer && (Array.isArray(chosen.customer) ? chosen.customer[0]?.phone : chosen.customer.phone)) || null,
                    check_in: chosen.check_in,
                    check_out: chosen.check_out
                  }
                : null,
              hasArrivalToday,
              hasDepartureToday,
              hasLate,
              arrivalsList: arr.map((b: any) => b.check_in).filter(Boolean),
              departuresList: arr
                .map((b: any) => {
                  if (!b.check_out) return null;
                  const d = new Date(String(b.check_out) + 'T00:00:00');
                  d.setDate(d.getDate() - 1);
                  return d.toISOString().slice(0, 10);
                })
                .filter(Boolean) as string[],
              bookingsRange: arr.map((b: any) => ({ check_in: b.check_in, check_out: b.check_out, status: b.status })).filter((x: any) => x.check_in && x.check_out && x.status)
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

  const sanitizePhone = (raw?: string | null) => {
    if (!raw) return '';
    const digits = raw.replace(/\D+/g, '');
    if (digits.startsWith('0')) return '966' + digits.slice(1);
    if (digits.startsWith('966')) return digits;
    if (digits.startsWith('5') && digits.length === 9) return '966' + digits;
    return digits;
  };

  const formatDate = (d: Date) => d.toISOString().slice(0, 10);
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
    const anyStatus = statusFilter.arrivals || statusFilter.departures || statusFilter.cleaning || statusFilter.maintenance || statusFilter.available || statusFilter.extensionGrace;
    if (anyStatus) {
      list = list.filter((u) => {
        const s = (u.status || '').toLowerCase();
        const availByRange = filterStart && filterEnd ? !unavailableUnitIds.has(u.id) : s === 'available' && !u.booking;
        if (statusFilter.available && !availByRange) return false;
        if (statusFilter.cleaning && s !== 'cleaning') return false;
        if (statusFilter.maintenance && s !== 'maintenance') return false;
        // Arrival/Departure filters based on selected period or reference start date
        const refStart = filterStart || formatDate(new Date());
        const inRange = (dateStr?: string): boolean => {
          if (!dateStr) return false;
          if (filterStart && filterEnd) return dateStr >= filterStart && dateStr <= filterEnd;
          return dateStr === refStart;
        };
        if (statusFilter.arrivals) {
          const arrivals = u.arrivalsList || [];
          if (!arrivals.some((d) => inRange(d))) return false;
        }
        if (statusFilter.departures) {
          const deps = u.departuresList || [];
          if (!deps.some((d) => inRange(d))) return false;
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
    return list;
  }, [unitsCards, typeFilterIds, statusFilter, filterStart, filterEnd, unavailableUnitIds]);

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

  const filtered = useMemo(() => entries, [entries]);
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

  return (
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
      <div className="p-6 max-w-7xl mx-auto space-y-6 screen-only">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
            >
              <ArrowRight size={24} />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
                <ClipboardList className="text-blue-600" />
                تعبئة بيانات الحجز
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                خاصة بالاستقبال لتسجيل بيانات الحجز واطلاع الإدارة عليها لاحقاً.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowForm((s) => !s)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
              title={showForm ? 'إخفاء النموذج' : 'عرض النموذج'}
            >
              <ClipboardList size={18} />
              <span>{showForm ? 'إخفاء النموذج' : 'تعبئة بيانات الحجز'}</span>
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download size={18} />
              <span>طباعة</span>
            </button>
          </div>
        </div>

        {showForm && (
          <div ref={formRef} data-form-anchor="booking-form" className="bg-white p-5 md:p-6 rounded-xl shadow-sm border border-gray-200">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-5">
              <div className="md:col-span-4 text-xs font-bold text-gray-700 tracking-wider">بيانات الحجز</div>
            <div>
              <label className="text-xs font-medium text-gray-700 flex items-center gap-1">
                <User size={14} /> اسم العميل
              </label>
              <input value={customer_name} onChange={e => setCustomerName(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" placeholder="مثال: محمد العتيبي" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 flex items-center gap-1">
                <Phone size={14} /> الهاتف
              </label>
              <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" placeholder="05xxxxxxxx" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">نوع الهوية</label>
              <select value={id_type} onChange={e => setIdType(e.target.value as any)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-white">
                <option value="national_id">هوية وطنية</option>
                <option value="iqama">إقامة</option>
                <option value="passport">جواز سفر</option>
                <option value="other">أخرى</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">رقم الهوية</label>
              <input value={customer_id_number} onChange={e => setCustomerIdNumber(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" placeholder="رقم الهوية/الإقامة/الجواز" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 flex items-center gap-1">
                <Building2 size={14} /> الفندق
              </label>
              <select
                value={selectedHotelId}
                onChange={e => {
                  const id = e.target.value;
                  setSelectedHotelId(id);
                  const name = hotels.find(h => h.id === id)?.name || '';
                  setHotelName(name);
                }}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-white"
              >
                <option value="">اختر الفندق</option>
                {hotels.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
              {selectedHotelId && (
                <div className="flex items-center gap-1 mt-1 text-[11px] text-green-700">
                  <CheckCircle size={12} className="text-green-600" /> تم التحديد
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 flex items-center gap-1">
                <Calendar size={14} /> الوصول
              </label>
              <input type="date" value={check_in} onChange={e => setCheckIn(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
              {check_in && (
                <div className="flex items-center gap-1 mt-1 text-[11px] text-green-700">
                  <CheckCircle size={12} className="text-green-600" /> تم التحديد
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 flex items-center gap-1">
                <Calendar size={14} /> المغادرة
              </label>
              <input
                type="date"
                value={check_out}
                onChange={e => setCheckOut(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg"
                min={booking_type === 'daily' && check_in ? addDays(check_in, 1) : undefined}
                disabled={booking_type === 'yearly' && !!check_in}
                title={booking_type === 'yearly' ? 'يتم احتسابه تلقائياً حسب عدد الأشهر' : undefined}
              />
              {booking_type === 'daily' && (
                <div className="text-[11px] text-gray-500 mt-1">
                  عدد الليالي: {diffNights(check_in, check_out) ?? '-'}
                </div>
              )}
              {check_out && (
                <div className="flex items-center gap-1 mt-1 text-[11px] text-green-700">
                  <CheckCircle size={12} className="text-green-600" /> تم التحديد
                </div>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <div className="text-[11px] text-gray-700">مدة سريعة</div>
              <button
                type="button"
                className="text-[11px] px-3 py-1.5 rounded-full border bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                onClick={() => {
                  const start = check_in || formatDate(new Date());
                  setCheckIn(start);
                  setBookingType('yearly');
                  setMonthsCount(1);
                  setCheckOut(addMonths(start, 1));
                }}
              >
                شهر
              </button>
              <button
                type="button"
                className="text-[11px] px-3 py-1.5 rounded-full border bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                onClick={() => {
                  const start = check_in || formatDate(new Date());
                  setCheckIn(start);
                  setBookingType('yearly');
                  setMonthsCount(3);
                  setCheckOut(addMonths(start, 3));
                }}
              >
                ربع سنة
              </button>
              <button
                type="button"
                className="text-[11px] px-3 py-1.5 rounded-full border bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                onClick={() => {
                  const start = check_in || formatDate(new Date());
                  setCheckIn(start);
                  setBookingType('yearly');
                  setMonthsCount(6);
                  setCheckOut(addMonths(start, 6));
                }}
              >
                نصف سنة
              </button>
              <button
                type="button"
                className="text-[11px] px-3 py-1.5 rounded-full border bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                onClick={() => {
                  const start = check_in || formatDate(new Date());
                  setCheckIn(start);
                  setBookingType('yearly');
                  setMonthsCount(12);
                  setCheckOut(addMonths(start, 12));
                }}
              >
                سنة
              </button>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 flex items-center gap-1">
                <BedDouble size={14} /> عدد الوحدات
              </label>
              <input type="number" min={1} value={units_count} onChange={e => setUnitsCount(Number(e.target.value) || 1)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">نوع الوحدة</label>
              <select
                value={selectedUnitTypeId}
                onChange={e => {
                  const id = e.target.value;
                  setSelectedUnitTypeId(id);
                  const name = unitTypes.find(t => t.id === id)?.name || '';
                  setUnitType(name);
                }}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-white"
              >
                <option value="">اختر نوع الوحدة</option>
                {unitTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {selectedUnitTypeId && (
                <div className="flex items-center gap-1 mt-1 text-[11px] text-green-700">
                  <CheckCircle size={12} className="text-green-600" /> تم التحديد
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">رقم الوحدة</label>
              <select
                value={unit_number}
                onChange={e => {
                  const val = e.target.value;
                  setUnitNumber(val);
                  const found = availableUnits.find(u => u.unit_number === val);
                  setFloor(found && found.floor ? String(found.floor) : '');
                }}
                disabled={!selectedUnitTypeId}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-white disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">{selectedUnitTypeId ? 'اختر رقم الوحدة' : 'اختر نوع الوحدة أولاً'}</option>
                {availableUnits.map(u => (
                  <option key={u.id} value={u.unit_number}>{u.unit_number}</option>
                ))}
              </select>
              <div className="text-[11px] text-gray-500 mt-1">
                {selectedUnitTypeId
                  ? `المتاحة: ${availableUnits.length}`
                  : 'حدد نوع الوحدة لعرض الأرقام المتاحة'}
              </div>
              {unit_number && (
                <div className="flex items-center gap-1 mt-1 text-[11px] text-green-700">
                  <CheckCircle size={12} className="text-green-600" /> تم التحديد
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">الطابق</label>
              <input
                value={floor}
                readOnly
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-gray-50 text-gray-700"
                placeholder="—"
                title="يتم تعبئته تلقائياً من رقم الوحدة"
              />
              {floor && (
                <div className="flex items-center gap-1 mt-1 text-[11px] text-green-700">
                  <CheckCircle size={12} className="text-green-600" /> تم التحديد
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">نوع الحجز</label>
              <select value={booking_type} onChange={e => setBookingType(e.target.value as any)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-white">
                <option value="daily">يومي</option>
                <option value="yearly">شهري/سنوي</option>
                <option value="other">أخرى</option>
              </select>
              {booking_type === 'yearly' && (
                <div className="mt-2">
                  <label className="text-[11px] text-gray-700">عدد الأشهر</label>
                  <input
                    type="number"
                    min={1}
                    value={monthsCount}
                    onChange={e => setMonthsCount(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full mt-1 px-3 py-2 border rounded-lg"
                  />
                  {check_in && (
                    <div className="text-[11px] text-gray-500 mt-1">
                      تاريخ المغادرة المحسوب: {addMonths(check_in, Math.max(1, monthsCount))}
                    </div>
                  )}
                </div>
              )}
              {booking_type && (
                <div className="flex items-center gap-1 mt-1 text-[11px] text-green-700">
                  <CheckCircle size={12} className="text-green-600" /> تم التحديد
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">تفضيل الوحدة</label>
              <input value={unit_pref} onChange={e => setUnitPref(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" placeholder="مثال: طابق أول، مطلة" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">السعر المتفق عليه (ر.س)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={agreed_price}
                onChange={e => setAgreedPrice(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full mt-1 px-3 py-2 border rounded-lg"
                placeholder="0.00"
              />
              {selectedUnitTypeId && (
                <div className="text-[11px] text-gray-500 mt-1">
                  {booking_type === 'yearly' ? (
                    check_in && pricingCalc.monthlyRate ? (
                      <>
                        الحساب:{' '}
                        <span dir="ltr" className="font-mono">{monthsCount}</span>{' '}
                        شهر ×{' '}
                        <span dir="ltr" className="font-mono">{pricingCalc.monthlyRate?.toLocaleString('en-US')}</span>{' '}
                        ={' '}
                        <span dir="ltr" className="font-mono">{Number(agreed_price || 0).toLocaleString('en-US')}</span>{' '}
                        ر.س
                      </>
                    ) : 'حدد تاريخ الوصول لاحتساب عدد الأشهر'
                  ) : (
                    pricingCalc.nights != null && pricingCalc.nights > 0 && pricingCalc.dailyRate ? (
                      <>
                        الحساب:{' '}
                        <span dir="ltr" className="font-mono">{pricingCalc.nights}</span>{' '}
                        ليلة ×{' '}
                        <span dir="ltr" className="font-mono">{pricingCalc.dailyRate?.toLocaleString('en-US')}</span>{' '}
                        ={' '}
                        <span dir="ltr" className="font-mono">{Number(agreed_price || 0).toLocaleString('en-US')}</span>{' '}
                        ر.س
                      </>
                    ) : 'حدد الوصول والمغادرة لاحتساب عدد الليالي'
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">اسم الموظف</label>
              <input
                value={staffLoading ? '...' : (staff_name || '')}
                readOnly
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-gray-50 text-gray-700"
                placeholder="اسم الحساب"
                title="يتم تعبئته تلقائياً من الحساب"
              />
            </div>
            <div className="md:col-span-4">
              <label className="text-xs font-medium text-gray-700">ملاحظات</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full mt-1 px-3 py-2 border rounded-lg" placeholder="أي ملاحظات إضافية" />
            </div>
              <div className="md:col-span-4">
                <button
                  type="submit"
                  disabled={staffLoading || !staff_name}
                  className={`w-full md:w-auto px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors ${staffLoading || !staff_name ? 'opacity-60 cursor-not-allowed' : ''}`}
                  title={!staff_name ? 'اسم الموظف مطلوب' : undefined}
                >
                  حفظ البيانات
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <div className="font-bold text-gray-900">الوحدات المتاحة في النظام</div>
            <div className="text-xs text-gray-500">{unitsLoading ? 'جارِ التحميل...' : `${unitsCards.length} وحدة`}</div>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 gap-3">
              <div className="bg-white/70 border rounded-xl p-3 shadow-sm overflow-hidden max-w-full">
                <div className="text-xs text-gray-900 font-bold mb-2">الفترة</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] text-gray-600 mb-1">الوصول</div>
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="date"
                        value={filterStart}
                        onChange={(e) => setFilterStart(e.target.value)}
                        className="px-3 py-2 border rounded-lg w-full min-w-0"
                      />
                      <button
                        onClick={() => {
                          const today = new Date();
                          const todayStr = today.toISOString().slice(0, 10);
                          setFilterStart(todayStr);
                          const next = new Date(todayStr + 'T00:00:00');
                          next.setDate(next.getDate() + 1);
                          setFilterEnd(next.toISOString().slice(0, 10));
                        }}
                        className="text-xs px-2 py-1 rounded-lg border bg-white hover:bg-gray-50 shrink-0"
                        title="اليوم"
                        type="button"
                      >
                        اليوم
                      </button>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] text-gray-600 mb-1">المغادرة</div>
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="date"
                        value={filterEnd}
                        onChange={(e) => setFilterEnd(e.target.value)}
                        min={filterStart ? (() => { const d = new Date(filterStart + 'T00:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })() : undefined}
                        className="px-3 py-2 border rounded-lg w-full min-w-0"
                      />
                      {filterStart && filterEnd ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-[11px] bg-gray-50 border border-gray-200 text-gray-700 shrink-0 whitespace-nowrap">
                          ليالٍ: {diffNights(filterStart, filterEnd) ?? '-'}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-[11px] text-gray-600 mb-1">مدة سريعة</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded-full border bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                      onClick={() => {
                        const start = filterStart || formatDate(new Date());
                        setFilterStart(start);
                        setFilterEnd(addMonths(start, 1));
                      }}
                    >
                      شهر
                    </button>
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded-full border bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                      onClick={() => {
                        const start = filterStart || formatDate(new Date());
                        setFilterStart(start);
                        setFilterEnd(addMonths(start, 3));
                      }}
                    >
                      ربع سنة
                    </button>
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded-full border bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                      onClick={() => {
                        const start = filterStart || formatDate(new Date());
                        setFilterStart(start);
                        setFilterEnd(addMonths(start, 6));
                      }}
                    >
                      نصف سنة
                    </button>
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded-full border bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                      onClick={() => {
                        const start = filterStart || formatDate(new Date());
                        setFilterStart(start);
                        setFilterEnd(addMonths(start, 12));
                      }}
                    >
                      سنة
                    </button>
                  </div>
                </div>
              </div>
              <div className="bg-white/70 border rounded-xl p-3 shadow-sm">
                <div className="text-xs text-gray-900 font-bold mb-2">الحالة</div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setStatusFilter((p) => ({ ...p, arrivals: !p.arrivals }))} className={`text-xs px-3 py-1.5 rounded-full border ${statusFilter.arrivals ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}`}>وصول اليوم</button>
                  <button onClick={() => setStatusFilter((p) => ({ ...p, departures: !p.departures }))} className={`text-xs px-3 py-1.5 rounded-full border ${statusFilter.departures ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}`}>مغادرة اليوم</button>
                  <button onClick={() => setStatusFilter((p) => ({ ...p, cleaning: !p.cleaning }))} className={`text-xs px-3 py-1.5 rounded-full border ${statusFilter.cleaning ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-gray-700 border-gray-200'}`}>تنظيف</button>
                  <button onClick={() => setStatusFilter((p) => ({ ...p, maintenance: !p.maintenance }))} className={`text-xs px-3 py-1.5 rounded-full border ${statusFilter.maintenance ? 'bg-yellow-600 text-white border-yellow-600' : 'bg-white text-gray-700 border-gray-200'}`}>صيانة</button>
                  <button onClick={() => setStatusFilter((p) => ({ ...p, available: !p.available }))} className={`text-xs px-3 py-1.5 rounded-full border ${statusFilter.available ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-700 border-gray-200'}`}>متاحة</button>
                  <button onClick={() => setStatusFilter((p) => ({ ...p, extensionGrace: !p.extensionGrace }))} className={`text-xs px-3 py-1.5 rounded-full border ${statusFilter.extensionGrace ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-gray-700 border-gray-200'}`}>مهلة التمديد</button>
                </div>
              </div>
              <div className="bg-white/70 border rounded-xl p-3 shadow-sm flex items-center justify-between lg:justify-end gap-2">
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
            <div className="flex flex-wrap gap-2">
              {unitTypes.map((t) => {
                const active = typeFilterIds.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTypeFilterIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(t.id)) next.delete(t.id);
                        else next.add(t.id);
                        return next;
                      });
                    }}
                    className={`text-xs px-3 py-1.5 rounded-full border ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
                const statusColor =
                  effectiveStatus === 'reserved'
                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                    : effectiveStatus === 'available'
                    ? 'bg-green-100 text-green-800 border-green-200'
                    : effectiveStatus === 'occupied'
                    ? 'bg-red-100 text-red-800 border-red-200'
                    : effectiveStatus === 'maintenance'
                    ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                    : effectiveStatus === 'cleaning'
                    ? 'bg-sky-100 text-sky-800 border-sky-200'
                    : effectiveStatus === 'reserved-db'
                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                    : 'bg-gray-100 text-gray-800 border-gray-200';
                const statusLabel =
                  effectiveStatus === 'reserved'
                    ? 'محجوزه'
                    : effectiveStatus === 'available'
                    ? 'متاحة'
                    : (u.status || 'غير محدد');
                const isSelected = unit_number && unit_number === u.unit_number;
                const disableSelect = (hasBooking && !hasDepartureAtStartExact) || maintenanceOrCleaning;
                return (
                  <div key={u.id} className={`border rounded-xl p-4 hover:shadow-sm transition-shadow ${isSelected ? 'border-blue-300 shadow' : hasBooking ? 'border-blue-200' : ''}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center">
                          <BedDouble size={16} className="text-gray-700" />
                        </div>
                        <div className="font-bold text-gray-900 flex items-center gap-1">
                          <span>وحدة {u.unit_number}</span>
                          {u.hasLate && (
                            <span title="تأخير في تسجيل الدخول/الخروج">
                              <HelpCircle size={14} className="text-amber-600" />
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] px-2 py-1 rounded-full border ${statusColor}`}>
                          {statusLabel}
                        </span>
                        {isSelected && (
                          <span className="text-[11px] px-2 py-1 rounded-full border bg-green-100 text-green-800 border-green-200">
                            تم الاختيار
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-gray-600">{u.unit_type_name || 'نوع غير معروف'}</div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-gray-50 border border-gray-100 rounded-lg p-2">
                        <div className="text-gray-500 text-[11px]">سعر شهري</div>
                        <div className="font-bold">
                          {(() => {
                            const annual = typeof u.annual_price === 'number' ? Number(u.annual_price) : null;
                            const daily = typeof u.daily_price === 'number' ? Number(u.daily_price) : null;
                            const monthly = annual != null ? Math.round(annual / 12) : (daily != null ? Math.round(daily * 30) : null);
                            return (
                              <span dir="ltr" className="font-mono">
                                {monthly != null ? monthly.toLocaleString('en-US') : '-'}
                              </span>
                            );
                          })()}{' '}ر.س
                        </div>
                      </div>
                      <div className="bg-gray-50 border border-gray-100 rounded-lg p-2">
                        <div className="text-gray-500 text-[11px]">سعر سنوي</div>
                        <div className="font-bold">
                          <span dir="ltr" className="font-mono">{typeof u.annual_price === 'number' ? Number(u.annual_price).toLocaleString('en-US') : '-' }</span>{' '}ر.س
                        </div>
                      </div>
                    </div>
                    {(!filterStart || !filterEnd) && u.booking && (
                      <div className="mt-3 border rounded-lg p-3 bg-white">
                        <div className="text-xs text-gray-500 mb-1">بيانات العميل الحالي/القادم</div>
                        <div className="text-sm font-bold text-gray-900">{u.booking.customer_name || 'غير معروف'}</div>
                        <div className="text-xs text-gray-600 mt-1">
                          من {u.booking.check_in || '-'} إلى {u.booking.check_out || '-'}
                        </div>
                        {u.booking.phone && (
                          <div className="flex items-center gap-2 mt-2">
                            <a
                              href={`https://wa.me/${sanitizePhone(u.booking.phone)}?text=${encodeURIComponent('مرحباً')}`}
                              target="_blank"
                              className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm"
                            >
                              واتساب
                            </a>
                            <a
                              href={`tel:${sanitizePhone(u.booking.phone)}`}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm"
                            >
                              اتصال
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-3">
                      <button
                        onClick={() => {
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
                          setShowForm(true);
                          setTimeout(() => {
                            try {
                              if (formRef && formRef.current) {
                                formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }
                            } catch {}
                          }, 80);
                        }}
                        disabled={disableSelect}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${disableSelect ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed' : 'border-gray-200 hover:bg-gray-50'}`}
                        title={disableSelect ? 'غير متاحة للاختيار' : 'اختيار هذه الوحدة في النموذج'}
                      >
                        اختيار
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b">
            <div className="font-bold text-gray-900">السجل</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right min-w-[1200px]">
              <thead className="bg-gray-100 border-b border-gray-200 text-gray-900 font-bold">
                <tr>
                  <th className="px-4 py-3">التاريخ</th>
                  <th className="px-4 py-3">العميل</th>
                  <th className="px-4 py-3">الهاتف</th>
                  <th className="px-4 py-3">نوع الهوية</th>
                  <th className="px-4 py-3">رقم الهوية</th>
                  <th className="px-4 py-3">الفندق</th>
                  <th className="px-4 py-3">الوصول</th>
                  <th className="px-4 py-3">المغادرة</th>
                  <th className="px-4 py-3">وحدات</th>
                  <th className="px-4 py-3">نوع</th>
                  <th className="px-4 py-3">نوع الوحدة</th>
                  <th className="px-4 py-3">رقم الوحدة</th>
                  <th className="px-4 py-3">السعر المتفق</th>
                  <th className="px-4 py-3">تفضيل</th>
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3">الموظف</th>
                  <th className="px-4 py-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length > 0 ? (
                  filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString('ar-SA')}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.customer_name}</td>
                      <td className="px-4 py-3 whitespace-nowrap" dir="ltr">{r.phone}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.id_type === 'national_id' ? 'هوية' : r.id_type === 'iqama' ? 'إقامة' : r.id_type === 'passport' ? 'جواز' : 'أخرى'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.customer_id_number}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.hotel_name}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.check_in || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.check_out || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.units_count}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.booking_type === 'daily' ? 'يومي' : r.booking_type === 'yearly' ? 'شهري/سنوي' : 'أخرى'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.unit_type || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.unit_number || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{Number(r.agreed_price || 0).toLocaleString()} ر.س</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.unit_pref || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${r.status === 'confirmed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {r.status === 'confirmed' ? 'تم التأكيد' : 'لم يتم التأكيد'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.staff_name || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setQuickView(r)}
                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                            title="معاينة"
                          >
                            <Eye size={16} />
                          </button>
                          {r.status !== 'confirmed' && isAdmin && (
                            <button
                              onClick={() => handleConfirm(r.id)}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                              title="تأكيد"
                            >
                              <Check size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(r)}
                            className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                            title="تعديل"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(r.id)}
                            className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"
                            title="حذف"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={17} className="px-6 py-12 text-center text-gray-500">
                      لا توجد بيانات
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {quickView && (
        <div className="screen-only fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setQuickView(null)} />
          <div className="absolute inset-0 z-50 flex items-start justify-center p-4 sm:p-6">
            <div className="w-full max-w-3xl bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900">معاينة السجل</span>
                  <span className="text-xs font-mono text-gray-600 bg-gray-100 rounded px-2 py-0.5">
                    #{quickView.id.slice(-6)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickView(null)}
                  className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
                >
                  إغلاق
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                    <div className="text-[11px] text-gray-600 mb-1">العميل</div>
                    <div className="font-bold text-gray-900">{quickView.customer_name || '—'}</div>
                    <div className="text-xs font-mono text-gray-700" dir="ltr">{quickView.phone || '—'}</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                    <div className="text-[11px] text-gray-600 mb-1">الفندق</div>
                    <div className="font-bold text-gray-900">{quickView.hotel_name || '—'}</div>
                    <div className="text-xs text-gray-700">نوع الوحدة: {quickView.unit_type || '—'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-white rounded-xl border border-gray-200 p-3">
                    <div className="text-[11px] text-gray-600">الوحدة</div>
                    <div className="font-bold text-gray-900">{quickView.unit_number || '—'}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-3">
                    <div className="text-[11px] text-gray-600">الوصول</div>
                    <div className="font-bold text-gray-900">{quickView.check_in || '—'}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-3">
                    <div className="text-[11px] text-gray-600">المغادرة</div>
                    <div className="font-bold text-gray-900">{quickView.check_out || '—'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-white rounded-xl border border-gray-200 p-3">
                    <div className="text-[11px] text-gray-600">عدد الوحدات</div>
                    <div className="font-bold text-gray-900">{quickView.units_count}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-3">
                    <div className="text-[11px] text-gray-600">نوع الحجز</div>
                    <div className="font-bold text-gray-900">
                      {quickView.booking_type === 'daily' ? 'يومي' : quickView.booking_type === 'yearly' ? 'شهري/سنوي' : 'أخرى'}
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-3">
                    <div className="text-[11px] text-gray-600">السعر المتفق</div>
                    <div className="font-bold text-gray-900">{Number(quickView.agreed_price || 0).toLocaleString()} ر.س</div>
                  </div>
                </div>
                {quickView.unit_pref ? (
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                    <div className="text-xs text-gray-600 mb-1">تفضيل الوحدة</div>
                    <div className="text-sm text-gray-800">{quickView.unit_pref}</div>
                  </div>
                ) : null}
                {quickView.notes ? (
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                    <div className="text-xs text-gray-600 mb-1">ملاحظات</div>
                    <div className="text-sm text-gray-800">{quickView.notes}</div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="print-only p-6">
        <div className="print-title">تعبئة بيانات الحجز</div>
        <table className="p-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>العميل</th>
              <th>الهاتف</th>
              <th>نوع الهوية</th>
              <th>رقم الهوية</th>
              <th>الفندق</th>
              <th>الوصول</th>
              <th>المغادرة</th>
              <th>وحدات</th>
              <th>نوع</th>
              <th>نوع الوحدة</th>
              <th>رقم الوحدة</th>
              <th>السعر المتفق</th>
              <th>تفضيل</th>
              <th>الحالة</th>
              <th>الموظف</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString('ar-SA')}</td>
                <td>{r.customer_name}</td>
                <td dir="ltr">{r.phone}</td>
                <td>{r.id_type === 'national_id' ? 'هوية' : r.id_type === 'iqama' ? 'إقامة' : r.id_type === 'passport' ? 'جواز' : 'أخرى'}</td>
                <td>{r.customer_id_number}</td>
                <td>{r.hotel_name}</td>
                <td>{r.check_in || '-'}</td>
                <td>{r.check_out || '-'}</td>
                <td>{r.units_count}</td>
                <td>{r.booking_type === 'daily' ? 'يومي' : r.booking_type === 'yearly' ? 'شهري/سنوي' : 'أخرى'}</td>
                <td>{r.unit_type || '-'}</td>
                <td>{r.unit_number || '-'}</td>
                <td>{Number(r.agreed_price || 0).toLocaleString()} ر.س</td>
                <td>{r.unit_pref || '-'}</td>
                <td>{r.status === 'confirmed' ? 'تم التأكيد' : 'لم يتم التأكيد'}</td>
                <td>{r.staff_name || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
