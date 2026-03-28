'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { RoomStatusGrid, Unit } from './RoomStatusGrid';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

function toYMD(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

function formatDayLabel(d: Date, language: 'ar' | 'en') {
  const w = d.toLocaleDateString(language === 'en' ? 'en-US' : 'ar-EG', { weekday: 'short' });
  const day = d.getDate();
  return { w, day };
}

export default function RoomStatusWithDate({ initialUnits, language = 'ar' }: { initialUnits: Unit[]; language?: 'ar' | 'en' }) {
  const t = (arText: string, enText: string) => (language === 'en' ? enText : arText);
  const [selectedDate, setSelectedDate] = useState<string>(toYMD(new Date()));
  const [units, setUnits] = useState<Unit[]>(initialUnits);
  const [loading, setLoading] = useState(false);
  const [unitTypes, setUnitTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedUnitTypeId, setSelectedUnitTypeId] = useState<string>('all');
  const [unitTypesIssue, setUnitTypesIssue] = useState<string | null>(null);
  const [cardSize, setCardSize] = useState<'normal' | 'compact' | 'mini'>('compact');
  const [tempResTotalCount, setTempResTotalCount] = useState<number>(0);
  const [tempResCountMap, setTempResCountMap] = useState<Map<string, number>>(new Map());
  const [tempResDates, setTempResDates] = useState<string[]>([]);
  const [typeInfoMap, setTypeInfoMap] = useState<Map<string, { unit_type_name?: string; annual_price?: number }>>(() => {
    const m = new Map<string, { unit_type_name?: string; annual_price?: number }>();
    (initialUnits || []).forEach(u => {
      const annualRaw = (u as any).annual_price;
      const annualNum = annualRaw == null ? NaN : Number(annualRaw);
      m.set(u.id, { unit_type_name: u.unit_type_name, annual_price: Number.isFinite(annualNum) ? annualNum : undefined });
    });
    return m;
  });
  const WINDOW_SIZE = 20;
  const [windowStart, setWindowStart] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - Math.floor(WINDOW_SIZE / 2));
    return d;
  });
  const todayBase = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const daysRange = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < WINDOW_SIZE; i++) {
      const d = new Date(windowStart);
      d.setDate(windowStart.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [windowStart]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        let unitsData: any[] | null = null;
        let hasNested = false;
        {
          const rel = await supabase
            .from('units')
            .select('id, unit_number, status, unit_type_id, unit_type:unit_types(id, name, annual_price, daily_price, price_per_year)')
            .order('unit_number');
          if (!rel.error && rel.data) {
            unitsData = rel.data as any[];
            hasNested = true;
          } else {
            const base = await supabase
              .from('units')
              .select('id, unit_number, status, unit_type_id')
              .order('unit_number');
            if (base.error) throw base.error;
            unitsData = base.data as any[];
            hasNested = false;
          }
        }

        const typeMap = new Map<string, any>();
        {
          const { data: typesData, error: typesErr } = await supabase
            .from('unit_types')
            .select('id, name, annual_price, daily_price, price_per_year');
          if (mounted) {
            if (typesErr) {
              setUnitTypesIssue(typesErr.message || 'unit_types_error');
            } else if ((typesData || []).length === 0) {
              setUnitTypesIssue('empty_unit_types');
            } else {
              setUnitTypesIssue(null);
            }
          }
          (typesData || []).forEach((ut: any) => typeMap.set(ut.id, ut));
          if (mounted) {
            const list = (typesData || [])
              .map((ut: any) => ({ id: ut.id as string, name: String(ut.name || '').trim() }))
              .filter((ut: any) => Boolean(ut.id) && Boolean(ut.name))
              .sort((a: any, b: any) => a.name.localeCompare(b.name, language === 'en' ? 'en' : 'ar'));
            setUnitTypes(list);
          }
        }

        const { data: activeForDate } = await supabase
          .from('bookings')
          .select('id, unit_id, status, check_out, customers(full_name, phone)')
          .lte('check_in', selectedDate)
          .gt('check_out', selectedDate)
          .in('status', ['confirmed', 'checked_in']);

        const { data: arrivals } = await supabase
          .from('bookings')
          .select('id, unit_id, customers(full_name, phone)')
          .eq('status', 'confirmed')
          .eq('check_in', selectedDate);

        const depRef = (() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); return toYMD(d); })();
        const { data: departures } = await supabase
          .from('bookings')
          .select('id, unit_id, customers(full_name, phone)')
          .in('status', ['checked_in', 'confirmed'])
          .eq('check_out', depRef)
          .lte('check_in', selectedDate);

        const { data: overdue } = await supabase
          .from('bookings')
          .select('id, unit_id, customers(full_name, phone)')
          .eq('status', 'checked_in')
          .lt('check_out', selectedDate);

        const activeMap = new Map<string, { id: string; guest: string; check_out?: string }>();
        (activeForDate || []).forEach((b: any) => {
          if (b.unit_id) {
            const guestName = Array.isArray(b.customers)
              ? b.customers[0]?.full_name
              : (b.customers as any)?.full_name || t('غير معروف', 'Unknown');
            activeMap.set(b.unit_id, { id: b.id, guest: guestName, check_out: b.check_out });
          }
        });

        const actionMap = new Map<string, { action: 'arrival' | 'departure' | 'overdue'; guest: string; phone?: string }>();
        (arrivals || []).forEach((b: any) => {
          if (b.unit_id) {
            const guestName = Array.isArray(b.customers)
              ? b.customers[0]?.full_name
              : (b.customers as any)?.full_name || t('غير معروف', 'Unknown');
            const phone = Array.isArray(b.customers) ? b.customers[0]?.phone : (b.customers as any)?.phone;
            actionMap.set(b.unit_id, { action: 'arrival', guest: guestName, phone });
          }
        });
        (departures || []).forEach((b: any) => {
          if (b.unit_id) {
            const guestName = Array.isArray(b.customers)
              ? b.customers[0]?.full_name
              : (b.customers as any)?.full_name || t('غير معروف', 'Unknown');
            const phone = Array.isArray(b.customers) ? b.customers[0]?.phone : (b.customers as any)?.phone;
            actionMap.set(b.unit_id, { action: 'departure', guest: guestName, phone });
          }
        });
        (overdue || []).forEach((b: any) => {
          if (b.unit_id) {
            const guestName = Array.isArray(b.customers)
              ? b.customers[0]?.full_name
              : (b.customers as any)?.full_name || t('غير معروف', 'Unknown');
            const phone = Array.isArray(b.customers) ? b.customers[0]?.phone : (b.customers as any)?.phone;
            actionMap.set(b.unit_id, { action: 'overdue', guest: guestName, phone });
          }
        });

        const mapped: Unit[] = (unitsData || []).map((u: any) => {
          const active = activeMap.get(u.id);
          const action = actionMap.get(u.id);
          let status = u.status;
          if (active) {
            status = 'occupied';
          } else {
            if (!['maintenance', 'cleaning'].includes(status)) status = 'available';
          }
          const nested = hasNested ? u.unit_type : undefined;
          const fb = typeInfoMap.get(u.id);
          const ut = typeMap.get(u.unit_type_id);
          const typeName = ut?.name ?? nested?.name ?? fb?.unit_type_name;
          const typeAnnual = (
            ut?.annual_price ??
            ut?.price_per_year ??
            nested?.annual_price ??
            nested?.price_per_year ??
            fb?.annual_price ??
            // Fallback: derive annual price from daily_price if available (daily * 30 days * 12 months)
            (typeof (ut?.daily_price ?? nested?.daily_price) === 'number'
              ? Number(ut?.daily_price ?? nested?.daily_price) * 30 * 12
              : undefined)
          );
          const annualNum = typeAnnual === null || typeAnnual === undefined ? undefined : Number(typeAnnual);
          return {
            id: u.id,
            unit_number: u.unit_number,
            status,
            unit_type_id: u.unit_type_id || undefined,
            booking_id: active?.id || undefined,
            guest_name: active?.guest || action?.guest,
            next_action: action?.action || null,
            action_guest_name: action?.guest,
            guest_phone: action?.phone,
            unit_type_name: typeName || undefined,
            annual_price: annualNum,
            remaining_days: (() => {
              if (status === 'occupied' && active?.check_out) {
                const sd = new Date(selectedDate);
                const co = new Date(active.check_out);
                const diff = Math.ceil((co.getTime() - sd.getTime()) / (1000 * 60 * 60 * 24));
                return diff >= 0 ? diff : 0;
              }
              return undefined;
            })()
          };
        });

        {
          const merged = new Map(typeInfoMap);
          mapped.forEach(u => {
            const prev = merged.get(u.id) || {};
            merged.set(u.id, {
              unit_type_name: u.unit_type_name ?? prev.unit_type_name,
              annual_price: typeof u.annual_price === 'number' ? u.annual_price : prev.annual_price
            });
          });
          setTypeInfoMap(merged);
        }

        {
          const unitIds = (unitsData || []).map((u: any) => u.id);
          const { data: tempRes } = await supabase
            .from('temporary_reservations')
            .select('unit_id, customer_name, reserve_date, phone')
            .eq('reserve_date', selectedDate)
            .in('unit_id', unitIds);
          const tempMap = new Map<string, any>();
          (tempRes || []).forEach((t: any) => tempMap.set(t.unit_id, t));
          for (let i = 0; i < mapped.length; i++) {
            const t = tempMap.get(mapped[i].id);
            if (t) {
              mapped[i] = {
                ...mapped[i],
                has_temp_res: true,
                action_guest_name: t.customer_name,
                guest_phone: t.phone,
              };
            }
          }
        }

        if (mounted) setUnits(mapped);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [selectedDate]);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const btn = el.querySelector<HTMLButtonElement>(`button[data-date="${selectedDate}"]`);
    btn?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selectedDate]);

  const stripRef = useRef<HTMLDivElement | null>(null);

  const scrollStrip = (dir: 'left' | 'right') => {
    const deltaDays = WINDOW_SIZE;
    setWindowStart(prev => {
      const n = new Date(prev);
      n.setDate(prev.getDate() + (dir === 'left' ? -deltaDays : deltaDays));
      return n;
    });
  };

  useEffect(() => {
    const sd = new Date(selectedDate);
    sd.setHours(0, 0, 0, 0);
    const end = new Date(windowStart);
    end.setDate(windowStart.getDate() + WINDOW_SIZE - 1);
    if (sd < windowStart || sd > end) {
      const ns = new Date(sd);
      ns.setDate(sd.getDate() - Math.floor(WINDOW_SIZE / 2));
      setWindowStart(ns);
    }
  }, [selectedDate, windowStart]);

  // Fixed window around اليوم — لا توسيع تلقائي
  useEffect(() => {
    const fetchTempReservationsRange = async () => {
      try {
        const start = toYMD(daysRange[0]);
        const end = toYMD(daysRange[daysRange.length - 1]);
        const { data } = await supabase
          .from('temporary_reservations')
          .select('reserve_date')
          .gte('reserve_date', start)
          .lte('reserve_date', end);
        const map = new Map<string, number>();
        (data || []).forEach((r: any) => {
          const d = r.reserve_date as string;
          map.set(d, (map.get(d) || 0) + 1);
        });
        const dates = Array.from(map.keys()).sort();
        if (mounted) {
          setTempResTotalCount((data || []).length);
          setTempResCountMap(map);
          setTempResDates(dates);
        }
      } catch (err) {
        console.error('Fetch temp reservations range error:', err);
      }
    };
    let mounted = true;
    fetchTempReservationsRange();
    return () => { mounted = false; };
  }, [daysRange]);

  const jumpToNextTempDate = () => {
    if (tempResDates.length === 0) return;
    const idx = tempResDates.indexOf(selectedDate);
    if (idx === -1) {
      setSelectedDate(tempResDates[0]);
      return;
    }
    const nextIdx = (idx + 1) % tempResDates.length;
    setSelectedDate(tempResDates[nextIdx]);
  };

  const unitsForGrid = useMemo(() => {
    if (selectedUnitTypeId === 'all') return units;
    return units.filter(u => (u.unit_type_id || '') === selectedUnitTypeId);
  }, [units, selectedUnitTypeId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarIcon size={18} className="text-blue-600" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white shadow-sm"
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSelectedDate(toYMD(new Date()))}
            className="px-2.5 py-1.5 text-xs rounded-lg border bg-white hover:bg-blue-50 text-gray-700"
            aria-label={t('اليوم', 'Today')}
          >
            {t('اليوم', 'Today')}
          </button>
          <button
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() + 1);
              setSelectedDate(toYMD(d));
            }}
            className="px-2.5 py-1.5 text-xs rounded-lg border bg-white hover:bg-blue-50 text-gray-700"
            aria-label={t('غداً', 'Tomorrow')}
          >
            {t('غداً', 'Tomorrow')}
          </button>
          <button
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() - 1);
              setSelectedDate(toYMD(d));
            }}
            className="px-2.5 py-1.5 text-xs rounded-lg border bg-white hover:bg-blue-50 text-gray-700"
            aria-label={t('أمس', 'Yesterday')}
          >
            {t('أمس', 'Yesterday')}
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-full">
          <div className="hidden sm:block absolute left-0 top-1/2 -translate-y-1/2 z-10">
            <button
              onClick={() => scrollStrip('left')}
              className="p-1.5 rounded-full bg-white border shadow hover:bg-gray-50"
              aria-label="Scroll left"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="hidden sm:block absolute right-0 top-1/2 -translate-y-1/2 z-10">
            <button
              onClick={() => scrollStrip('right')}
              className="p-1.5 rounded-full bg-white border shadow hover:bg-gray-50"
              aria-label="Scroll right"
            >
              <ChevronLeft size={18} />
            </button>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50 edge-fade">
            <div
              ref={stripRef}
              className="no-scrollbar flex gap-1 overflow-x-auto overflow-y-hidden pb-1 snap-x snap-mandatory px-1"
            >
          {daysRange.map((d) => {
            const ymd = toYMD(d);
            const { w, day } = formatDayLabel(d, language);
            const active = selectedDate === ymd;
                const todayYMD = toYMD(new Date(todayBase));
                const yesterday = (() => { const t = new Date(todayBase); t.setDate(t.getDate() - 1); return toYMD(t); })();
                const tomorrow = (() => { const t = new Date(todayBase); t.setDate(t.getDate() + 1); return toYMD(t); })();
                let rel: string | null = null;
                if (ymd === todayYMD) rel = t('اليوم', 'Today');
                else if (ymd === yesterday) rel = t('أمس', 'Yesterday');
                else if (ymd === tomorrow) rel = t('غداً', 'Tomorrow');
            return (
              <button
                key={ymd}
                    data-date={ymd}
                onClick={() => setSelectedDate(ymd)}
                className={cn(
                      'min-w-[48px] sm:min-w-[60px] md:min-w-[64px] px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-center transition-colors snap-center',
                  active ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-blue-50'
                )}
                title={d.toLocaleDateString(language === 'en' ? 'en-US' : 'ar-EG', { dateStyle: 'full' })}
              >
                    <div className="relative">
                      {rel && (
                        <span className="absolute top-0 right-0 translate-y-[-4px] translate-x-1 text-[9px] font-bold text-blue-600/80">
                          {rel}
                        </span>
                      )}
                      <div className="text-[9px] sm:text-[10px] md:text-[11px] font-medium">{w}</div>
                      <div className="text-sm sm:text-base md:text-lg font-bold font-sans">{day}</div>
                    </div>
              </button>
            );
          })}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="text-xs font-bold text-gray-700">{t('فلتر النموذج', 'Type filter')}</div>
          <select
            value={selectedUnitTypeId}
            onChange={(e) => setSelectedUnitTypeId(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white shadow-sm"
          >
            <option value="all">{t('كل النماذج', 'All types')}</option>
            {unitTypes.map((ut) => (
              <option key={ut.id} value={ut.id}>{ut.name}</option>
            ))}
          </select>
          {unitTypesIssue ? (
            <span className="text-[11px] font-bold text-rose-700">
              {unitTypesIssue === 'empty_unit_types' ? t('النماذج غير ظاهرة (صلاحيات؟)', 'Types not visible (permissions?)') : t('تعذر جلب النماذج', 'Failed to load types')}
            </span>
          ) : null}
          <span className="mx-2 text-gray-300">|</span>
          <div className="text-xs font-bold text-gray-700">{t('مقياس البطاقات', 'Card scale')}</div>
          <select
            value={cardSize}
            onChange={(e) => setCardSize(e.target.value as any)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white shadow-sm"
          >
            <option value="normal">{t('عادي', 'Normal')}</option>
            <option value="compact">{t('مصغّر', 'Compact')}</option>
            <option value="mini">{t('صغير جداً', 'Mini')}</option>
          </select>
        </div>
        <div className="text-xs text-gray-500">
          {t('عدد الوحدات', 'Units')}: {unitsForGrid.length}
        </div>
      </div>
      <div className={cn(loading && 'opacity-60 pointer-events-none')}>
        <RoomStatusGrid 
          units={unitsForGrid} 
          language={language}
          dateLabel={new Date(selectedDate).toLocaleDateString(language === 'en' ? 'en-US' : 'ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          tempResTotalCount={tempResTotalCount}
          onJumpTempDate={jumpToNextTempDate}
          size={cardSize}
        />
      </div>
      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .edge-fade {
          -webkit-mask-image: linear-gradient(to right, transparent 0, black 12px, black calc(100% - 12px), transparent 100%);
                  mask-image: linear-gradient(to right, transparent 0, black 12px, black calc(100% - 12px), transparent 100%);
        }
        @media (min-width: 640px) {
          .edge-fade {
            -webkit-mask-image: linear-gradient(to right, transparent 0, black 16px, black calc(100% - 16px), transparent 100%);
                    mask-image: linear-gradient(to right, transparent 0, black 16px, black calc(100% - 16px), transparent 100%);
          }
        }
        @media (min-width: 768px) {
          .edge-fade {
            -webkit-mask-image: linear-gradient(to right, transparent 0, black 24px, black calc(100% - 24px), transparent 100%);
                    mask-image: linear-gradient(to right, transparent 0, black 24px, black calc(100% - 24px), transparent 100%);
          }
        }
      `}</style>
    </div>
  );
}
