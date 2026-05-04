'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { RoomStatusGrid, Unit } from './RoomStatusGrid';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, RefreshCw, AlertCircle, FileDown, Printer, X, ShieldAlert } from 'lucide-react';
import { addDays, addMonths, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

function toYMD(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

function formatDayLabel(d: Date, language: 'ar' | 'en') {
  const w = d.toLocaleDateString(language === 'en' ? 'en-US' : 'ar-EG', { weekday: 'short' });
  const day = d.getDate();
  return { w, day };
}

export default function RoomStatusWithDate({
  initialUnits,
  language = 'ar',
  hotelId
}: {
  initialUnits: Unit[];
  language?: 'ar' | 'en';
  hotelId?: string;
}) {
  const t = (arText: string, enText: string) => (language === 'en' ? enText : arText);
  const [selectedDate, setSelectedDate] = useState<string>(toYMD(new Date()));
  const [units, setUnits] = useState<Unit[]>(initialUnits);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unitTypes, setUnitTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedUnitTypeId, setSelectedUnitTypeId] = useState<string>('all');
  const [unitTypesIssue, setUnitTypesIssue] = useState<string | null>(null);
  const [cardSize, setCardSize] = useState<'normal' | 'compact' | 'mini'>('compact');
  const [extensionGraceOnly, setExtensionGraceOnly] = useState(false);
  const [showOpsPdf, setShowOpsPdf] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
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
  const emptyUnitsRetryRef = useRef(0);
  const emptyUnitsKeyRef = useRef<string>('');
  const typeInfoMapRef = useRef(typeInfoMap);
  useEffect(() => {
    typeInfoMapRef.current = typeInfoMap;
  }, [typeInfoMap]);
  const WINDOW_SIZE = 20;
  const [windowStart, setWindowStart] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - Math.floor(WINDOW_SIZE / 2));
    return d;
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => startOfMonth(new Date()));
  const calendarRef = useRef<HTMLDivElement | null>(null);
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
    setUnits(initialUnits || []);
    setError(null);
    const m = new Map<string, { unit_type_name?: string; annual_price?: number }>();
    (initialUnits || []).forEach(u => {
      const annualRaw = (u as any).annual_price;
      const annualNum = annualRaw == null ? NaN : Number(annualRaw);
      m.set(u.id, { unit_type_name: u.unit_type_name, annual_price: Number.isFinite(annualNum) ? annualNum : undefined });
    });
    setTypeInfoMap(m);
  }, [initialUnits]);

  useEffect(() => {
    setSelectedUnitTypeId('all');
    setError(null);
    emptyUnitsRetryRef.current = 0;
    emptyUnitsKeyRef.current = '';
  }, [hotelId]);

  const load = useCallback(async (isAutoRetry = false) => {
    setLoading(true);
    setError(null);
    try {
        const ensureAuthReady = async () => {
          try {
            for (let i = 0; i < 3; i++) {
              const { data: { session } } = await supabase.auth.getSession();
              if (session?.user) return true;
              const { data: { user } } = await supabase.auth.getUser();
              if (user) return true;
              await new Promise((r) => setTimeout(r, 700 + i * 700));
            }
          } catch {}
          return false;
        };

        const authReady = await ensureAuthReady();
        if (!authReady) {
          if (!isAutoRetry) {
            setTimeout(() => load(true), 1200);
          }
          return;
        }

        const { data: snapshot, error: snapshotError } = await supabase.rpc('get_room_status_snapshot', {
          p_hotel_id: hotelId && hotelId !== 'all' ? hotelId : null,
          p_date: selectedDate
        });

        if (snapshotError) throw snapshotError;
        if (!snapshot || (snapshot as any)?.ok === false) {
          throw new Error('room_status_snapshot_failed');
        }

        const unitsData = (((snapshot as any)?.units ?? []) as any[]);
        const typesData = (((snapshot as any)?.unit_types ?? []) as any[]);
        const activeForDate = (((snapshot as any)?.active ?? []) as any[]);
        const arrivals = (((snapshot as any)?.arrivals ?? []) as any[]);
        const departures = (((snapshot as any)?.departures ?? []) as any[]);
        const overdue = (((snapshot as any)?.overdue ?? []) as any[]);
        const upcoming = (((snapshot as any)?.upcoming ?? []) as any[]);
        const checkedOut = (((snapshot as any)?.checked_out ?? []) as any[]);
        const tempResList = (((snapshot as any)?.temporary_reservations ?? []) as any[]);
        const unpaidInvoices = (((snapshot as any)?.unpaid_invoices ?? []) as any[]);
        const invoiceTotals = (((snapshot as any)?.invoice_totals ?? []) as any[]);

        if (!unitsData || unitsData.length === 0) {
          const key = `${hotelId || 'all'}|${selectedDate}`;
          if (emptyUnitsKeyRef.current !== key) {
            emptyUnitsKeyRef.current = key;
            emptyUnitsRetryRef.current = 0;
          }
          emptyUnitsRetryRef.current += 1;

          if (emptyUnitsRetryRef.current <= 4) {
            setTimeout(() => load(true), 900 + emptyUnitsRetryRef.current * 300);
            return;
          }

          setUnits([]);
          return;
        }

        const typeMap = new Map<string, any>();
        if (typesData.length === 0) setUnitTypesIssue('empty_unit_types');
        else setUnitTypesIssue(null);
        typesData.forEach((ut: any) => typeMap.set(ut.id, ut));
        const list = typesData
          .map((ut: any) => ({ id: ut.id as string, name: String(ut.name || '').trim() }))
          .filter((ut: any) => Boolean(ut.id) && Boolean(ut.name))
          .sort((a: any, b: any) => a.name.localeCompare(b.name, language === 'en' ? 'en' : 'ar'));
        setUnitTypes(list);

        const activeMap = new Map<string, { id: string; guest: string; phone?: string; check_in?: string; check_out?: string; booking_status?: string }>();
        activeForDate.forEach((b: any) => {
          if (b.unit_id) {
            const guestName = Array.isArray(b.customers)
              ? b.customers[0]?.full_name
              : (b.customers as any)?.full_name || t('غير معروف', 'Unknown');
            const phone = Array.isArray(b.customers)
              ? b.customers[0]?.phone
              : (b.customers as any)?.phone;
            activeMap.set(b.unit_id, { id: b.id, guest: guestName, phone, check_in: b.check_in, check_out: b.check_out, booking_status: b.status });
          }
        });

        const upcomingMap = new Map<string, { id: string; guest: string; phone?: string; check_in?: string; check_out?: string; booking_status?: string }>();
        upcoming.forEach((b: any) => {
          if (!b.unit_id) return;
          if (upcomingMap.has(b.unit_id)) return;
          const guestName = Array.isArray(b.customers)
            ? b.customers[0]?.full_name
            : (b.customers as any)?.full_name || t('غير معروف', 'Unknown');
          const phone = Array.isArray(b.customers)
            ? b.customers[0]?.phone
            : (b.customers as any)?.phone;
          upcomingMap.set(b.unit_id, { id: b.id, guest: guestName, phone, check_in: b.check_in, check_out: b.check_out, booking_status: b.status });
        });

        const checkedOutMap = new Map<string, { id: string; guest: string; phone?: string; check_in?: string; check_out?: string; booking_status?: string }>();
        checkedOut.forEach((b: any) => {
          if (!b.unit_id) return;
          if (checkedOutMap.has(b.unit_id)) return;
          const guestName = Array.isArray(b.customers)
            ? b.customers[0]?.full_name
            : (b.customers as any)?.full_name || t('غير معروف', 'Unknown');
          const phone = Array.isArray(b.customers)
            ? b.customers[0]?.phone
            : (b.customers as any)?.phone;
          checkedOutMap.set(b.unit_id, { id: b.id, guest: guestName, phone, check_in: b.check_in, check_out: b.check_out, booking_status: b.status });
        });

        const actionMap = new Map<
          string,
          { action: 'arrival' | 'departure' | 'overdue'; guest: string; phone?: string; check_out?: string; booking_id?: string }
        >();
        const paymentMap = new Map<string, { status: 'due_today' | 'due_soon' | 'overdue'; days: number; date: string; amount: number; booking_id: string }>();

        // Build a booking to unit map for easy lookup
        const bookingToUnitMap = new Map<string, string>();
        [...activeForDate, ...upcoming, ...checkedOut].forEach((b: any) => {
          if (b.unit_id) bookingToUnitMap.set(b.id, b.unit_id);
        });

        // Process Unpaid Invoices & Installments (Logic from BookingDetails.tsx)
        const allRelevantBookings = [...activeForDate, ...upcoming, ...checkedOut];
        const totalInvoicedByBooking = new Map<string, number>();
        const totalPaidInvoicedByBooking = new Map<string, number>();
        (invoiceTotals || []).forEach((row: any) => {
          const bid = row?.booking_id;
          if (!bid) return;
          totalInvoicedByBooking.set(String(bid), Number(row?.total_invoiced) || 0);
          totalPaidInvoicedByBooking.set(String(bid), Number(row?.total_paid) || 0);
        });
        const bookingTypeById = new Map<string, string>();
        const bookingStatusById = new Map<string, string>();
        allRelevantBookings.forEach((b: any) => {
          if (!b?.id) return;
          bookingTypeById.set(b.id, String(b.booking_type || ''));
          bookingStatusById.set(b.id, String(b.status || ''));
        });
        
        allRelevantBookings.forEach((booking: any) => {
          if (!booking.unit_id) return;
          if (paymentMap.has(booking.unit_id)) return;

          const bookingType = String(booking.booking_type || '');
          if (bookingType !== 'monthly' && bookingType !== 'yearly') return;
          const totalAmount = Number(totalInvoicedByBooking.get(booking.id) ?? booking.total_price ?? 0);
          
          const nights = Number(booking.nights || 0);
          if (totalAmount <= 0) return;
          const platformFee = String(booking.booking_source || '') === 'platform' ? 250 : 0;
          const netTotal = Math.max(0, totalAmount - platformFee);
          const bookingStatus = String(booking.status || '');
          const invTotal = Number(totalInvoicedByBooking.get(booking.id) ?? totalAmount);
          const invPaid = Number(totalPaidInvoicedByBooking.get(booking.id) ?? 0);
          const remainingFromInvoices = Math.max(0, invTotal - invPaid);
          if (bookingStatus === 'checked_out' && remainingFromInvoices <= 1) return;
          const paidForInstallments = Math.max(0, invPaid - platformFee);
          if (Math.max(0, netTotal - paidForInstallments) <= 1) return;

          const checkIn = new Date(booking.check_in);
          const today = new Date(selectedDate);
          today.setHours(0, 0, 0, 0);

          // Calculate installments (Logic from BookingDetails.tsx:4081)
          const derivedNights = (() => {
            if (Number.isFinite(nights) && nights > 0) return nights;
            try {
              const ci = new Date(booking.check_in);
              const co = new Date(booking.check_out);
              const diff = Math.ceil((co.getTime() - ci.getTime()) / (1000 * 60 * 60 * 24));
              return Number.isFinite(diff) && diff > 0 ? diff : 0;
            } catch {
              return 0;
            }
          })();
          const monthsCount = Math.max(1, Math.round(derivedNights / 30));
          const installmentAmount = netTotal / monthsCount;
          let currentPaid = paidForInstallments;

          for (let i = 0; i < monthsCount; i++) {
            const dueDate = addMonths(checkIn, i);
            dueDate.setHours(0, 0, 0, 0);
            
            const amountForThisInstallment = installmentAmount;
            const amountPaidForThis = Math.min(amountForThisInstallment, Math.max(0, currentPaid));
            currentPaid -= amountForThisInstallment;
            
            const isFullyPaid = amountPaidForThis >= (amountForThisInstallment - 1); // Small margin for rounding
            
            if (!isFullyPaid) {
              const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              
              let pStatus: 'due_today' | 'due_soon' | 'overdue' | null = null;
              if (diffDays < 0) pStatus = 'overdue';
              else if (diffDays === 0) pStatus = 'due_today';
              else if (diffDays <= 5) pStatus = 'due_soon';

              if (pStatus) {
                paymentMap.set(booking.unit_id, {
                  status: pStatus,
                  days: diffDays,
                  date: toYMD(dueDate),
                  amount: amountForThisInstallment - amountPaidForThis,
                  booking_id: booking.id
                });
                break; // Found the earliest unpaid installment
              }
            }
          }
        });

        // Fallback: explicit unpaid invoices (for non-monthly/yearly and any missed cases)
        unpaidInvoices.forEach((inv: any) => {
          const unitId = bookingToUnitMap.get(inv.booking_id);
          if (!unitId) return;
          if (paymentMap.has(unitId)) return;
          const bt = bookingTypeById.get(inv.booking_id) || '';
          if (bt === 'monthly' || bt === 'yearly') return;

          const today = new Date(selectedDate);
          today.setHours(0, 0, 0, 0);
          const dueDate = new Date(inv.due_date);
          dueDate.setHours(0, 0, 0, 0);
          
          const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          
          let pStatus: 'due_today' | 'due_soon' | 'overdue' | null = null;
          if (diffDays < 0) pStatus = 'overdue';
          else if (diffDays === 0) pStatus = 'due_today';
          else if (diffDays <= 5) pStatus = 'due_soon';

          const remaining = Math.max(0, (Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0));
          if (pStatus && remaining > 1) {
            paymentMap.set(unitId, {
              status: pStatus,
              days: diffDays,
              date: inv.due_date,
              amount: remaining,
              booking_id: inv.booking_id
            });
          }
        });

        arrivals.forEach((b: any) => {
          if (b.unit_id) {
            const guestName = Array.isArray(b.customers)
              ? b.customers[0]?.full_name
              : (b.customers as any)?.full_name || t('غير معروف', 'Unknown');
            const phone = Array.isArray(b.customers) ? b.customers[0]?.phone : (b.customers as any)?.phone;
            actionMap.set(b.unit_id, { action: 'arrival', guest: guestName, phone });
          }
        });
        departures.forEach((b: any) => {
          if (b.unit_id) {
            const guestName = Array.isArray(b.customers)
              ? b.customers[0]?.full_name
              : (b.customers as any)?.full_name || t('غير معروف', 'Unknown');
            const phone = Array.isArray(b.customers) ? b.customers[0]?.phone : (b.customers as any)?.phone;
            actionMap.set(b.unit_id, { action: 'departure', guest: guestName, phone });
          }
        });
        overdue.forEach((b: any) => {
          if (b.unit_id) {
            const guestName = Array.isArray(b.customers)
              ? b.customers[0]?.full_name
              : (b.customers as any)?.full_name || t('غير معروف', 'Unknown');
            const phone = Array.isArray(b.customers) ? b.customers[0]?.phone : (b.customers as any)?.phone;
            actionMap.set(b.unit_id, { action: 'overdue', guest: guestName, phone, check_out: b.check_out, booking_id: b.id });
          }
        });

        const mapped: Unit[] = (unitsData || []).map((u: any) => {
          const active = activeMap.get(u.id);
          const action = actionMap.get(u.id);
          const payment = paymentMap.get(u.id);
          const checkedOutInfo = checkedOutMap.get(u.id);
          const unitFutureBookings = upcoming
            .filter((b: any) => b.unit_id === u.id)
            .map((b: any) => ({ start: b.check_in, end: b.check_out }));

          let status = u.status;
          if (active) {
            status = String(active.booking_status || '').toLowerCase() === 'checked_in' ? 'occupied' : 'booked';
          } else {
            if (!['maintenance', 'cleaning', 'unavailable'].includes(status)) status = 'available';
          }
          const up = !active ? upcomingMap.get(u.id) : null;
          if (!active && status === 'available' && up) {
            status = 'future_booked';
          }
          const nested = u.unit_type;
          const fb = typeInfoMapRef.current.get(u.id);
          const ut = typeMap.get(u.unit_type_id);
          const typeName = ut?.name ?? nested?.name ?? fb?.unit_type_name;
          const typeAnnual = (
            ut?.annual_price ??
            nested?.annual_price ??
            fb?.annual_price ??
            (typeof (ut?.daily_price ?? nested?.daily_price) === 'number'
              ? Number(ut?.daily_price ?? nested?.daily_price) * 30 * 12
              : undefined)
          );
          const annualNum = typeAnnual === null || typeAnnual === undefined ? undefined : Number(typeAnnual);
          const paymentBookingId = payment?.booking_id;
          const invTotal = paymentBookingId ? totalInvoicedByBooking.get(paymentBookingId) : undefined;
          const invPaid = paymentBookingId ? totalPaidInvoicedByBooking.get(paymentBookingId) : undefined;
          const paymentBookingStatus = paymentBookingId ? bookingStatusById.get(paymentBookingId) : undefined;
          const invRemaining =
            typeof invTotal === 'number'
              ? Math.max(0, invTotal - (Number(invPaid) || 0))
              : undefined;
          return {
            id: u.id,
            unit_number: u.unit_number,
            status,
            unit_type_id: u.unit_type_id || undefined,
            booking_id: (active?.id || up?.id || (action as any)?.booking_id || payment?.booking_id || checkedOutInfo?.id) || undefined,
            booking_check_in: (active?.check_in || up?.check_in || checkedOutInfo?.check_in) || undefined,
            booking_check_out: (active?.check_out || up?.check_out || (action as any)?.check_out || checkedOutInfo?.check_out) || undefined,
            guest_name: active?.guest || up?.guest || action?.guest || checkedOutInfo?.guest,
            next_action: action?.action || null,
            action_guest_name: action?.guest,
            guest_phone: active?.phone || up?.phone || action?.phone || checkedOutInfo?.phone,
            unit_type_name: typeName || undefined,
            annual_price: annualNum,
            future_bookings: unitFutureBookings,
            payment_due_status: payment?.status || null,
            payment_due_in_days: payment?.days,
            payment_due_date: payment?.date,
            payment_due_amount: payment?.amount,
            payment_booking_id: payment?.booking_id,
            payment_booking_status: paymentBookingStatus,
            payment_invoice_total: invTotal,
            payment_invoice_paid: invPaid,
            payment_invoice_remaining: invRemaining,
            remaining_days: (() => {
              if ((status === 'occupied' || status === 'booked') && active?.check_out) {
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
          const merged = new Map(typeInfoMapRef.current);
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
          const tempResData = tempResList || [];
          const tempMap = new Map<string, any>();
          tempResData.forEach((t: any) => tempMap.set(t.unit_id, t));
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

        setUnits(mapped);
      } catch (err: any) {
        console.error('RoomStatusWithDate load error details:', {
          message: err?.message || 'No message',
          code: err?.code || 'No code',
          details: err?.details || 'No details',
          full: err
        });
        
        // Auto-retry with increasing delay
        if (!isAutoRetry && !units.length) {
          const retryDelay = 2500; // Increased delay for stability
          console.log(`Auto-retrying load in ${retryDelay}ms...`);
          setTimeout(() => load(true), retryDelay);
          return;
        }
        
        const errorMsg = err?.message || String(err) || t('حدث خطأ غير معروف', 'Unknown error');
        setError(`${t('حدث خطأ أثناء تحميل حالة الوحدات:', 'Error loading units:')} ${errorMsg}`);
      } finally {
        setLoading(false);
      }
  }, [language, selectedDate, hotelId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    let timeoutId: any = null;
    const schedule = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        load(true);
      }, 250);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') schedule();
    };
    const onFocus = () => schedule();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  useEffect(() => {
    let timeoutId: any = null;
    const scheduleReload = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        load();
      }, 250);
    };
    const ch = supabase
      .channel(`room-status-live-${selectedDate}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'units' }, scheduleReload)
      .subscribe();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      supabase.removeChannel(ch);
    };
  }, [load, selectedDate]);

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
    let list = units;
    if (selectedUnitTypeId !== 'all') {
      list = list.filter(u => (u.unit_type_id || '') === selectedUnitTypeId);
    }
    if (extensionGraceOnly) {
      list = list.filter(u => (u.status === 'occupied' || u.status === 'booked') && typeof u.remaining_days === 'number' && u.remaining_days <= 7);
    }
    return list;
  }, [units, selectedUnitTypeId, extensionGraceOnly]);

  const opsPdfData = useMemo(() => {
    const list = unitsForGrid || [];
    const departures = list.filter(u => u.next_action === 'departure');
    const overdueCheckouts = list.filter(u => u.next_action === 'overdue');
    const paymentOverdue = list.filter(u => u.payment_due_status === 'overdue');
    const paymentSoon = list.filter(u => u.payment_due_status === 'due_today' || u.payment_due_status === 'due_soon');
    const nearExtension = list.filter(u => (u.status === 'occupied' || u.status === 'booked') && typeof u.remaining_days === 'number' && u.remaining_days >= 0 && u.remaining_days <= 3);
    const sortByUnit = (a: Unit, b: Unit) => String(a.unit_number || '').localeCompare(String(b.unit_number || ''), 'ar');
    return {
      departures: departures.sort(sortByUnit),
      overdueCheckouts: overdueCheckouts.sort(sortByUnit),
      paymentOverdue: paymentOverdue.sort(sortByUnit),
      paymentSoon: paymentSoon.sort(sortByUnit),
      nearExtension: nearExtension.sort(sortByUnit),
    };
  }, [unitsForGrid]);

  const formatMoney = useCallback((n: number | undefined) => {
    const v = Number(n || 0);
    return `${Math.round(v).toLocaleString('ar-SA')} ر.س`;
  }, []);

  useEffect(() => {
    if (!calendarOpen) return;
    const d = new Date(`${selectedDate}T00:00:00`);
    d.setHours(0, 0, 0, 0);
    setCalendarMonth(startOfMonth(d));
  }, [calendarOpen, selectedDate]);

  useEffect(() => {
    if (!calendarOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = calendarRef.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (target && !el.contains(target)) setCalendarOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCalendarOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [calendarOpen]);

  const buildPdfName = useCallback(() => {
    const d = new Date();
    const ts = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
    return `dashboard_ops_${selectedDate}_${ts}.pdf`;
  }, [selectedDate]);

  const captureOpsPdf = useCallback(async () => {
    const el = document.getElementById('ops-print-root') as HTMLElement | null;
    if (!el) throw new Error('ops_print_root_missing');
    const rect = el.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) throw new Error('ops_print_root_empty');
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: el.scrollWidth || undefined,
      windowHeight: el.scrollHeight || undefined,
      scrollX: -window.scrollX,
      scrollY: -window.scrollY,
      onclone: (doc) => {
        const style = doc.createElement('style');
        style.textContent = `
          html, body { background: #ffffff !important; }
          #ops-print-root, #ops-print-root * {
            color: #111827 !important;
            background-color: transparent !important;
            border-color: #e5e7eb !important;
            box-shadow: none !important;
            text-shadow: none !important;
          }
        `;
        doc.head.appendChild(style);
      },
    });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0.5) {
      pdf.addPage();
      position = -((imgHeight - heightLeft));
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    return pdf.output('blob');
  }, []);

  const handleSaveOpsPdf = useCallback(async () => {
    try {
      setGeneratingPdf(true);
      await new Promise((r) => setTimeout(r, 100));
      const blob = await captureOpsPdf();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = buildPdfName();
      link.click();
      URL.revokeObjectURL(link.href);
    } finally {
      setGeneratingPdf(false);
    }
  }, [buildPdfName, captureOpsPdf]);

  const handleOpenOpsPdf = useCallback(async () => {
    setShowOpsPdf(true);
    setTimeout(() => {
      handleSaveOpsPdf();
    }, 450);
  }, [handleSaveOpsPdf]);

  const Table = ({ rows, mode }: { rows: Unit[]; mode: 'departure' | 'overdue_checkout' | 'payment_overdue' | 'near_extension' | 'payment_soon' }) => {
    if (!rows || rows.length === 0) {
      return <div className="text-[12px] text-gray-500">لا يوجد</div>;
    }
    return (
      <div className="overflow-hidden rounded-xl border border-gray-200">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-2 py-2 font-black text-right">الوحدة</th>
              <th className="px-2 py-2 font-black text-right">العميل</th>
              <th className="px-2 py-2 font-black text-right">الهاتف</th>
              <th className="px-2 py-2 font-black text-right">{mode.includes('payment') ? 'الاستحقاق' : 'الخروج'}</th>
              <th className="px-2 py-2 font-black text-right">ملاحظة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const guest = u.action_guest_name || u.guest_name || '—';
              const phone = u.guest_phone || '—';
              const checkout = u.booking_check_out || '—';
              const dueDate = u.payment_due_date || '—';
              const note = (() => {
                if (mode === 'overdue_checkout') return 'متجاوز تاريخ الخروج';
                if (mode === 'payment_overdue') return 'متأخر عن السداد';
                if (mode === 'payment_soon') return u.payment_due_status === 'due_today' ? 'السداد اليوم' : 'قريب سداد';
                if (mode === 'near_extension') {
                  const rd = typeof u.remaining_days === 'number' ? u.remaining_days : undefined;
                  if (rd === 0) return 'ينتهي اليوم';
                  if (typeof rd === 'number') return `متبقي ${rd} يوم`;
                  return 'قريب انتهاء';
                }
                return 'مغادرة اليوم';
              })();
              const noteTone = (() => {
                if (mode === 'overdue_checkout' || mode === 'payment_overdue') return 'bg-red-50 text-red-700 border-red-200';
                if (mode === 'payment_soon' && u.payment_due_status === 'due_today') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
                if (mode === 'payment_soon') return 'bg-amber-50 text-amber-800 border-amber-200';
                if (mode === 'near_extension') return 'bg-amber-50 text-amber-800 border-amber-200';
                return 'bg-blue-50 text-blue-800 border-blue-200';
              })();
              return (
                <tr key={u.id} className="border-t border-gray-100">
                  <td className="px-2 py-2 font-black text-gray-900">{u.unit_number}</td>
                  <td className="px-2 py-2 text-gray-800">{guest}</td>
                  <td className="px-2 py-2 text-gray-800">{phone}</td>
                  <td className="px-2 py-2 text-gray-800">
                    {mode.includes('payment') ? dueDate : checkout}
                  </td>
                  <td className="px-2 py-2">
                    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 font-black', noteTone)}>
                      {note}
                    </span>
                    {(mode === 'payment_overdue' || mode === 'payment_soon') && (
                      <div className="mt-1 text-[10px] font-bold text-gray-700 grid grid-cols-3 gap-2">
                        <div>
                          <span className="text-gray-500">إجمالي:</span>{' '}
                          <span className="text-gray-900">{typeof u.payment_invoice_total === 'number' ? formatMoney(u.payment_invoice_total) : '—'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">مدفوع:</span>{' '}
                          <span className="text-emerald-700">{typeof u.payment_invoice_paid === 'number' ? formatMoney(u.payment_invoice_paid) : '—'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">متبقي:</span>{' '}
                          <span className="text-red-700">{typeof u.payment_invoice_remaining === 'number' ? formatMoney(u.payment_invoice_remaining) : '—'}</span>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {showOpsPdf && (
        <div id="ops-print-overlay" className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] p-3 sm:p-6">
          <div className="mx-auto max-w-5xl h-full flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 print:hidden">
              <div className="flex items-center gap-2 text-white">
                <ShieldAlert size={18} />
                <div className="text-sm font-black">PDF التشغيل السريع</div>
                <div className="text-[11px] opacity-80">التاريخ: {selectedDate}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-2 rounded-xl bg-white text-gray-900 font-black shadow hover:bg-gray-50 flex items-center gap-2"
                >
                  <Printer size={16} />
                  طباعة
                </button>
                <button
                  type="button"
                  onClick={handleSaveOpsPdf}
                  disabled={generatingPdf}
                  className={cn(
                    'px-3 py-2 rounded-xl font-black shadow flex items-center gap-2',
                    generatingPdf ? 'bg-amber-300 text-amber-900' : 'bg-amber-500 text-white hover:bg-amber-600'
                  )}
                >
                  <FileDown size={16} className={generatingPdf ? 'animate-pulse' : ''} />
                  {generatingPdf ? 'جارٍ التجهيز...' : 'حفظ PDF'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowOpsPdf(false)}
                  className="p-2 rounded-xl bg-white/10 text-white hover:bg-white/15"
                  aria-label="إغلاق"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div id="ops-print-panel" className="flex-1 overflow-auto rounded-2xl bg-white shadow-xl">
              <div id="ops-print-root" dir="rtl" className="p-5 sm:p-8 text-gray-900">
                <div className="flex items-start justify-between gap-4 border-b pb-4">
                  <div>
                    <div className="text-xl sm:text-2xl font-black tracking-tight">مذكرة تشغيل سريعة</div>
                    <div className="text-[12px] text-gray-600 mt-1">لوحة المتابعة • التاريخ: {selectedDate}</div>
                  </div>
                  <div className="text-left">
                    <div className="text-[11px] text-gray-600">طُبع في</div>
                    <div className="text-[12px] font-black">{new Date().toLocaleString('ar-SA')}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">
                  <div className="rounded-xl border bg-blue-50 border-blue-100 p-3">
                    <div className="text-[10px] text-blue-700 font-black">المغادرون</div>
                    <div className="text-lg font-black text-blue-900">{opsPdfData.departures.length}</div>
                  </div>
                  <div className="rounded-xl border bg-red-50 border-red-100 p-3">
                    <div className="text-[10px] text-red-700 font-black">متأخرون خروج</div>
                    <div className="text-lg font-black text-red-900">{opsPdfData.overdueCheckouts.length}</div>
                  </div>
                  <div className="rounded-xl border bg-red-50 border-red-100 p-3">
                    <div className="text-[10px] text-red-700 font-black">متأخرون سداد</div>
                    <div className="text-lg font-black text-red-900">{opsPdfData.paymentOverdue.length}</div>
                  </div>
                  <div className="rounded-xl border bg-amber-50 border-amber-100 p-3">
                    <div className="text-[10px] text-amber-800 font-black">قريب تمديد</div>
                    <div className="text-lg font-black text-amber-900">{opsPdfData.nearExtension.length}</div>
                  </div>
                  <div className="rounded-xl border bg-emerald-50 border-emerald-100 p-3">
                    <div className="text-[10px] text-emerald-800 font-black">قريب دفع</div>
                    <div className="text-lg font-black text-emerald-900">{opsPdfData.paymentSoon.length}</div>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-black">وحدات المغادرون</div>
                      <div className="text-[11px] text-gray-500">حالة اليوم</div>
                    </div>
                    <div className="mt-3">
                      <Table rows={opsPdfData.departures} mode="departure" />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-black text-red-900">المتأخرون عن الخروج</div>
                      <div className="text-[11px] text-red-700 font-black">ملاحظة حمراء: تم تجاوز تاريخ الخروج</div>
                    </div>
                    <div className="mt-3">
                      <Table rows={opsPdfData.overdueCheckouts} mode="overdue_checkout" />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-black text-red-900">المتأخرون عن السداد</div>
                      <div className="text-[11px] text-red-700 font-black">ملاحظة حمراء: استحقاق متجاوز</div>
                    </div>
                    <div className="mt-3">
                      <Table rows={opsPdfData.paymentOverdue} mode="payment_overdue" />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-black text-amber-900">قريبو التمديد</div>
                      <div className="text-[11px] text-amber-800 font-black">آخر 3 أيام قبل الانتهاء</div>
                    </div>
                    <div className="mt-3">
                      <Table rows={opsPdfData.nearExtension} mode="near_extension" />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-black text-emerald-900">قريبو الدفع</div>
                      <div className="text-[11px] text-emerald-800 font-black">اليوم أو خلال 5 أيام</div>
                    </div>
                    <div className="mt-3">
                      <Table rows={opsPdfData.paymentSoon} mode="payment_soon" />
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-gray-200 p-5">
                  <div className="text-sm font-black text-gray-900">سياسة التشغيل المختصرة</div>
                  <div className="mt-3 grid gap-2 text-[12px] leading-6 text-gray-800">
                    <div className="font-black">1) المسؤولية التشغيلية</div>
                    <div>أي خطأ في الحجز أو البيانات (مهما كان نوعه) يتحمل مسؤوليته مشغل النظام، ويتصرف مباشرة مع مدخل البيانات لتصحيح الخطأ فوراً.</div>
                    <div>أي حجز غير مسجل في النظام، أو لم يتم تسجيل دخوله/خروجه داخل النظام، يتحمل مسؤوليته مشغل النظام.</div>
                    <div>أي اختلاف بين الواقع والنظام (خرج ولم يُسجل خروجه، دخل ولم تُسجل بياناته، بيانات غير صحيحة) يُعالج فوراً ويُوثّق، والمسؤولية على مشغل النظام.</div>
                    <div>أي مبالغ/خصومات/رسوم أو حجوزات لم تُسجل كما هي في الواقع (خطأ إدخال، فرق مبلغ، عدم إصدار فاتورة صحيحة) يتحمل مسؤوليتها مشغل النظام حتى يتم تصحيحها وتوثيق سببها.</div>
                    <div className="font-black mt-2">2) سياسة الخروج</div>
                    <div>قبل تسجيل الخروج يجب مراجعة الوحدة وسلامتها وتوثيق أي ضرر. أي ضرر لم يُسجل قبل الخروج يتحمل مسؤوليته مشغل النظام إن لم يقم بتسجيله.</div>
                    <div>إذا كان تاريخ الخروج اليوم: يكون الخروج الساعة 6:00 مساءً، مع مهلة حتى الساعة 11:00 صباحاً من اليوم التالي.</div>
                    <div>بعد الساعة 11:00 صباحاً يُطبق الشرط الجزائي بقيمة <span className="font-black">500 ريال</span> لكل يوم تأخير.</div>
                  </div>
                </div>

                <div className="mt-4 text-[10px] text-gray-500 border-t pt-3">
                  هذه المذكرة تشغيلية داخلية، وتم توليدها من النظام بناءً على بيانات اليوم المحدد.
                </div>
              </div>
            </div>
          </div>
          <style>{`
            @media print {
              @page { size: A4; margin: 10mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              body * { visibility: hidden; }
              #ops-print-root, #ops-print-root * { visibility: visible; }
              #ops-print-overlay { position: static !important; inset: auto !important; background: transparent !important; padding: 0 !important; }
              #ops-print-panel { overflow: visible !important; height: auto !important; max-height: none !important; border-radius: 0 !important; box-shadow: none !important; }
              #ops-print-root { position: static !important; width: auto !important; padding: 0 !important; margin: 0 !important; }
            }
          `}</style>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div ref={calendarRef} className="relative">
            <button
              type="button"
              onClick={() => setCalendarOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-50 via-white to-white ring-1 ring-emerald-200/70 shadow-sm hover:shadow-md hover:ring-emerald-300/70 transition-all"
              aria-haspopup="dialog"
              aria-expanded={calendarOpen}
            >
              <CalendarIcon size={18} className="text-emerald-700" />
              <div className="text-right">
                <div className="text-[11px] text-emerald-900/70 font-bold">{t('التاريخ', 'Date')}</div>
                <div className="text-[12px] sm:text-sm font-extrabold text-emerald-950">
                  {new Date(`${selectedDate}T00:00:00`).toLocaleDateString(language === 'en' ? 'en-US' : 'ar-SA', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </div>
              </div>
            </button>

            {calendarOpen && (
              <div className="absolute z-40 mt-2 w-[320px] sm:w-[360px] rounded-2xl bg-white shadow-xl ring-1 ring-emerald-200/70 overflow-hidden">
                <div className="px-3 py-3 bg-gradient-to-br from-emerald-50 via-white to-white border-b border-emerald-100/70">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setCalendarMonth((m) => startOfMonth(addMonths(m, -1)))}
                      className="p-2 rounded-xl ring-1 ring-emerald-200/70 bg-white/70 text-emerald-900 hover:bg-emerald-50 transition-colors"
                      aria-label={t('الشهر السابق', 'Previous month')}
                    >
                      <ChevronRight size={18} />
                    </button>
                    <div className="text-center flex-1">
                      <div className="text-sm font-extrabold text-emerald-950">
                        {calendarMonth.toLocaleDateString(language === 'en' ? 'en-US' : 'ar-SA', { month: 'long', year: 'numeric' })}
                      </div>
                      <div className="mt-2 flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDate(toYMD(new Date()));
                            setCalendarOpen(false);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white text-[11px] font-extrabold hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800 transition-all shadow-sm"
                        >
                          {t('اليوم', 'Today')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCalendarOpen(false)}
                          className="px-3 py-1.5 rounded-xl ring-1 ring-emerald-200/70 bg-white/70 text-emerald-900 text-[11px] font-extrabold hover:bg-emerald-50 transition-colors"
                        >
                          {t('إغلاق', 'Close')}
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCalendarMonth((m) => startOfMonth(addMonths(m, 1)))}
                      className="p-2 rounded-xl ring-1 ring-emerald-200/70 bg-white/70 text-emerald-900 hover:bg-emerald-50 transition-colors"
                      aria-label={t('الشهر التالي', 'Next month')}
                    >
                      <ChevronLeft size={18} />
                    </button>
                  </div>
                </div>

                <div className="p-3">
                  <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-extrabold text-emerald-900/70 mb-2" dir="ltr">
                    {Array.from({ length: 7 }).map((_, i) => {
                      const base = startOfWeek(new Date(), { weekStartsOn: 0 });
                      const d = addDays(base, i);
                      const label = d.toLocaleDateString(language === 'en' ? 'en-US' : 'ar-SA', { weekday: 'narrow' });
                      return <div key={i}>{label}</div>;
                    })}
                  </div>

                  {(() => {
                    const start = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 0 });
                    const end = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 0 });
                    const days: Date[] = [];
                    for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
                      days.push(d);
                    }
                    const todayYmd = toYMD(new Date(todayBase));
                    return (
                      <div className="grid grid-cols-7 gap-1" dir="ltr">
                        {days.map((d) => {
                          const ymd = toYMD(d);
                          const isInMonth = d.getMonth() === calendarMonth.getMonth();
                          const isSelected = ymd === selectedDate;
                          const isToday = ymd === todayYmd;
                          return (
                            <button
                              key={ymd}
                              type="button"
                              onClick={() => {
                                setSelectedDate(ymd);
                                setCalendarOpen(false);
                              }}
                              className={cn(
                                'h-9 sm:h-10 rounded-xl text-[12px] sm:text-sm font-extrabold transition-all',
                                isSelected &&
                                  'bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white shadow-sm',
                                !isSelected &&
                                  (isInMonth
                                    ? 'text-emerald-950 hover:bg-emerald-50'
                                    : 'text-gray-400 hover:bg-emerald-50/70'),
                                !isSelected && isToday && 'ring-2 ring-emerald-400/50 bg-emerald-50'
                              )}
                            >
                              {d.getDate()}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSelectedDate(toYMD(new Date()))}
            className="px-2.5 py-1.5 text-xs rounded-xl ring-1 ring-emerald-200/70 bg-white/70 hover:bg-emerald-50 text-emerald-900 font-extrabold transition-colors"
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
            className="px-2.5 py-1.5 text-xs rounded-xl ring-1 ring-emerald-200/70 bg-white/70 hover:bg-emerald-50 text-emerald-900 font-extrabold transition-colors"
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
            className="px-2.5 py-1.5 text-xs rounded-xl ring-1 ring-emerald-200/70 bg-white/70 hover:bg-emerald-50 text-emerald-900 font-extrabold transition-colors"
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
              className="p-2 rounded-full bg-white/80 ring-1 ring-emerald-200/70 shadow-sm hover:bg-emerald-50 transition-colors"
              aria-label="Scroll left"
            >
              <ChevronRight size={18} className="text-emerald-900" />
            </button>
          </div>
          <div className="hidden sm:block absolute right-0 top-1/2 -translate-y-1/2 z-10">
            <button
              onClick={() => scrollStrip('right')}
              className="p-2 rounded-full bg-white/80 ring-1 ring-emerald-200/70 shadow-sm hover:bg-emerald-50 transition-colors"
              aria-label="Scroll right"
            >
              <ChevronLeft size={18} className="text-emerald-900" />
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl ring-1 ring-emerald-100/70 bg-gradient-to-r from-emerald-50 via-white to-emerald-50 edge-fade">
            <div
              ref={stripRef}
              className="no-scrollbar flex gap-1 overflow-x-auto overflow-y-hidden pb-1 snap-x snap-mandatory px-2 py-1"
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
                      'min-w-[52px] sm:min-w-[66px] md:min-w-[70px] px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl text-center transition-all snap-center',
                  active
                        ? 'bg-gradient-to-l from-emerald-700 via-emerald-800 to-emerald-900 text-white shadow-sm'
                        : 'bg-white/70 text-emerald-950 ring-1 ring-emerald-200/70 hover:bg-emerald-50'
                )}
                title={d.toLocaleDateString(language === 'en' ? 'en-US' : 'ar-EG', { dateStyle: 'full' })}
              >
                    <div className="relative">
                      {rel && (
                        <span className={cn(
                          "absolute top-0 right-0 translate-y-[-4px] translate-x-1 text-[9px] font-extrabold",
                          active ? "text-white/80" : "text-emerald-700/80"
                        )}>
                          {rel}
                        </span>
                      )}
                      <div className={cn("text-[9px] sm:text-[10px] md:text-[11px] font-bold", active ? "text-emerald-100" : "text-emerald-900/70")}>{w}</div>
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
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedUnitTypeId}
            onChange={(e) => setSelectedUnitTypeId(e.target.value)}
            className="px-3 sm:px-4 py-2 rounded-xl text-[12px] sm:text-sm font-extrabold bg-gradient-to-r from-emerald-50 via-white to-white text-emerald-950 ring-1 ring-emerald-200/70 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:ring-offset-0 transition-all"
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
          <span className="mx-1 sm:mx-2 text-gray-300">|</span>
          <select
            value={cardSize}
            onChange={(e) => setCardSize(e.target.value as any)}
            className="px-3 sm:px-4 py-2 rounded-xl text-[12px] sm:text-sm font-extrabold bg-gradient-to-r from-emerald-50 via-white to-white text-emerald-950 ring-1 ring-emerald-200/70 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:ring-offset-0 transition-all"
          >
            <option value="normal">{t('عادي', 'Normal')}</option>
            <option value="compact">{t('مصغّر', 'Compact')}</option>
            <option value="mini">{t('صغير جداً', 'Mini')}</option>
          </select>
          <span className="mx-1 sm:mx-2 text-gray-300">|</span>
          <button
            type="button"
            onClick={() => setExtensionGraceOnly((v) => !v)}
            className={cn(
              'px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border text-[12px] sm:text-sm font-bold shadow-sm transition-colors whitespace-nowrap',
              extensionGraceOnly
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
            )}
            title="مهلة التمديد: يعرض الحجوزات التي باقي على انتهائها 7 أيام أو أقل"
          >
            مهلة التمديد
          </button>
          <button
            type="button"
            onClick={handleOpenOpsPdf}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border text-[12px] sm:text-sm font-black shadow-sm transition-colors whitespace-nowrap bg-gray-900 text-white hover:bg-gray-800 flex items-center gap-2"
            title="تجهيز PDF سريع للوضع التشغيلي"
          >
            <FileDown size={16} />
            PDF سريع
          </button>
        </div>
        <div className="text-xs text-gray-500">
          {t('عدد الوحدات', 'Units')}: {unitsForGrid.length}
        </div>
      </div>
      <div className={cn('relative', loading && 'opacity-60 pointer-events-none')}>
        {error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm rounded-2xl p-6 text-center animate-in fade-in duration-300">
            <div className="bg-red-50 text-red-600 p-4 rounded-full mb-4 shadow-sm">
              <AlertCircle size={32} />
            </div>
            <h4 className="text-lg font-bold text-gray-900 mb-2">{t('تعذر تحميل البيانات', 'Failed to load data')}</h4>
            <p className="text-sm text-gray-500 mb-6 max-w-md">{error}</p>
            <button
              onClick={() => load()}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              {t('إعادة المحاولة', 'Retry')}
            </button>
          </div>
        )}
        <RoomStatusGrid 
          units={unitsForGrid} 
          language={language}
          selectedDate={selectedDate}
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
