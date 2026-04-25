'use client';

import React from 'react';
import { addDays, addMonths, differenceInCalendarDays } from 'date-fns';
import { ChevronLeft, ChevronRight, X, CreditCard, AlertCircle } from 'lucide-react';
import { calculateDetailedDuration, formatArabicDuration } from '@/lib/pricing';

function toYMD(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

function startOfMonth(d: Date) {
  const n = new Date(d);
  n.setDate(1);
  n.setHours(0, 0, 0, 0);
  return n;
}

function daysInMonth(d: Date) {
  const n = new Date(d);
  n.setMonth(n.getMonth() + 1, 0);
  return n.getDate();
}

function weekdayIndexMonFirst(d: Date) {
  const js = d.getDay();
  return (js + 6) % 7;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isBeforeDay(a: Date, b: Date) {
  const aa = new Date(a);
  aa.setHours(0, 0, 0, 0);
  const bb = new Date(b);
  bb.setHours(0, 0, 0, 0);
  return aa.getTime() < bb.getTime();
}

function isAfterDay(a: Date, b: Date) {
  const aa = new Date(a);
  aa.setHours(0, 0, 0, 0);
  const bb = new Date(b);
  bb.setHours(0, 0, 0, 0);
  return aa.getTime() > bb.getTime();
}

function isBetweenInclusive(d: Date, start: Date, end: Date) {
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  return dd.getTime() >= s.getTime() && dd.getTime() <= e.getTime();
}

function monthLabel(d: Date) {
  return d.toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' });
}

const weekdayLabels = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];

export default function BookingRangeModal({
  open,
  onClose,
  unitId,
  unitNumber,
  unitTypeName,
  annualPrice,
  blockedRanges,
  initialMonth,
  minDate,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  unitId?: string;
  unitNumber?: string;
  unitTypeName?: string;
  annualPrice?: number | string | null;
  blockedRanges?: Array<{ start: string; end: string }>;
  initialMonth?: string;
  minDate?: string;
  onComplete: (checkIn: string, checkOut: string) => void;
}) {
  const base = React.useMemo(() => {
    const d = initialMonth ? new Date(`${initialMonth}T00:00:00`) : new Date();
    d.setHours(0, 0, 0, 0);
    return startOfMonth(d);
  }, [initialMonth]);

  const [month0, setMonth0] = React.useState<Date>(base);
  const month1 = React.useMemo(() => startOfMonth(addMonths(month0, 1)), [month0]);

  React.useEffect(() => {
    setMonth0(base);
  }, [base]);

  const min = React.useMemo(() => {
    const d = minDate ? new Date(`${minDate}T00:00:00`) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [minDate]);

  const parsedBlocked = React.useMemo(() => {
    const toDateOnly = (v: string) => {
      const s = String(v || '');
      const d = s.includes('T') ? s.split('T')[0] : s.includes(' ') ? s.split(' ')[0] : s;
      return new Date(`${d}T00:00:00`);
    };
    return (blockedRanges || [])
      .filter((r) => r?.start && r?.end)
      .map((r) => ({ start: toDateOnly(r.start), end: toDateOnly(r.end) }));
  }, [blockedRanges]);

  const [start, setStart] = React.useState<Date | null>(null);
  const [end, setEnd] = React.useState<Date | null>(null);
  const [presetMonths, setPresetMonths] = React.useState<number>(1);
  const [stage, setStage] = React.useState<'range' | 'wizard'>('range');
  const [selectedRange, setSelectedRange] = React.useState<{ checkIn: string; checkOut: string } | null>(null);
  const [embedScale, setEmbedScale] = React.useState(0.9);
  const [iframeLoading, setIframeLoading] = React.useState(false);
  const [iframeError, setIframeError] = React.useState(false);
  const wheelLockRef = React.useRef(0);
  const prevFreezeRef = React.useRef<any>(null);

  const annual = React.useMemo(() => {
    const n = annualPrice == null ? NaN : Number(annualPrice);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [annualPrice]);
  const monthly = React.useMemo(() => {
    if (annual == null) return null;
    return Math.round((annual / 12) * 100) / 100;
  }, [annual]);

  React.useEffect(() => {
    if (!open) {
      setStart(null);
      setEnd(null);
      setPresetMonths(1);
      setStage('range');
      setSelectedRange(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!open) return;
    if (stage !== 'wizard') {
      if (prevFreezeRef.current !== null) {
        (window as any).__freeze_role_updates = prevFreezeRef.current;
        prevFreezeRef.current = null;
      }
      return;
    }
    if (prevFreezeRef.current === null) {
      prevFreezeRef.current = (window as any).__freeze_role_updates;
    }
    (window as any).__freeze_role_updates = true;
    
    // Also set a temporary flag to let useUserRole know we are in an iframe scenario
    // to avoid potential auth conflicts that cause reloads
    try {
      sessionStorage.setItem('is_booking_wizard_active', 'true');
    } catch {}

    return () => {
      try {
        sessionStorage.removeItem('is_booking_wizard_active');
      } catch {}
      if (prevFreezeRef.current !== null) {
        (window as any).__freeze_role_updates = prevFreezeRef.current;
        prevFreezeRef.current = null;
      }
    };
  }, [open, stage]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      const w = window.innerWidth;
      if (w < 390) setEmbedScale(0.78);
      else if (w < 430) setEmbedScale(0.82);
      else if (w < 520) setEmbedScale(0.86);
      else setEmbedScale(0.9);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const openWizard = (checkIn: string, checkOut: string) => {
    // 1. SET FLAGS FIRST - Crucial to stop re-renders before they happen
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('is_booking_wizard_active', 'true');
        (window as any).__freeze_role_updates = true;
      } catch {}
    }

    setSelectedRange({ checkIn, checkOut });
    setStage('wizard');
    setIframeLoading(true);
    setIframeError(false);
  };

  const pickDay = (d: Date) => {
    if (isBeforeDay(d, min)) return;
    const isBlocked = parsedBlocked.some((r) => !isBeforeDay(d, r.start) && isBeforeDay(d, r.end));
    if (isBlocked) return;
    if (!start || (start && end)) {
      setStart(d);
      setEnd(null);
      return;
    }
    if (isBeforeDay(d, start)) {
      setStart(d);
      setEnd(null);
      return;
    }
    setEnd(d);
    openWizard(toYMD(start), toYMD(d));
  };

  const shiftMonths = (delta: number) => {
    setMonth0((prev) => startOfMonth(addMonths(prev, delta)));
  };

  const applyPreset = (months: number) => {
    if (!start) return;
    // Set end date to (start date + months - 1 day)
    const out = addDays(addMonths(start, Math.max(1, Math.floor(months))), -1);
    setEnd(out);
  };

  const applyDaysPreset = (days: number) => {
    if (!start) return;
    const out = addDays(start, Math.max(1, Math.floor(days)));
    setEnd(out);
  };

  const confirmPreset = () => {
    if (!start || !end) return;
    if (isBeforeDay(start, min)) return;
    if (isBeforeDay(end, start)) return;
    openWizard(toYMD(start), toYMD(end));
  };

  const getDurationLabel = () => {
    if (!start || !end) return '';
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays >= 15) {
      const { months, days } = calculateDetailedDuration(start, end);
      return formatArabicDuration(months, days);
    }
    
    return `${diffDays} ليلة`;
  };

  const renderMonth = (m: Date) => {
    const startM = startOfMonth(m);
    const dim = daysInMonth(startM);
    const offset = weekdayIndexMonFirst(startM);
    const cells: Array<Date | null> = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let day = 1; day <= dim; day++) {
      const d = new Date(startM);
      d.setDate(day);
      cells.push(d);
    }
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-black text-gray-900">{monthLabel(startM)}</div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-[10px] text-gray-500 font-bold mb-1">
          {weekdayLabels.map((w) => (
            <div key={w} className="text-center">{w.slice(0, 2)}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, idx) => {
            if (!d) return <div key={idx} className="h-8 sm:h-9" />;
            const blocked = parsedBlocked.some((r) => !isBeforeDay(d, r.start) && isBeforeDay(d, r.end));
            const disabled = isBeforeDay(d, min) || blocked;
            const isStart = start ? isSameDay(d, start) : false;
            const isEnd = end ? isSameDay(d, end) : false;
            const inRange = start && end ? isBetweenInclusive(d, start, end) : false;
            const isToday = isSameDay(d, new Date());
            const baseCls =
              'h-8 sm:h-9 rounded-xl flex items-center justify-center text-[12px] sm:text-sm font-black transition-colors select-none';
            const cls = disabled
              ? blocked
                ? `${baseCls} bg-red-50 text-red-700 cursor-not-allowed`
                : `${baseCls} bg-gray-50 text-gray-300 cursor-not-allowed`
              : isStart || isEnd
                ? `${baseCls} bg-blue-600 text-white`
                : inRange
                  ? `${baseCls} bg-blue-50 text-blue-900`
                  : `${baseCls} bg-white hover:bg-gray-50 text-gray-900`;
            return (
              <button
                key={idx}
                type="button"
                disabled={disabled}
                onClick={() => pickDay(d)}
                className={cls}
                title={toYMD(d)}
              >
                <span className={isToday && !disabled ? 'underline decoration-dotted' : ''}>{d.getDate()}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (!open) return null;

  const iframeSrc = (() => {
    if (!unitId || !selectedRange) return null;
    const params = new URLSearchParams({
      unit_id: unitId,
      check_in: selectedRange.checkIn,
      check_out: selectedRange.checkOut,
      embed: '1',
      scale: String(embedScale),
    });
    return `/bookings?${params.toString()}`;
  })();

  return (
    <div className="fixed inset-0 z-[70]" dir="rtl">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => {
          if (stage === 'wizard') return;
          onClose();
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-4">
        <div className="w-full max-w-[96vw] sm:max-w-3xl max-h-[calc(100vh-16px)] bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
          <div className="sticky top-0 z-10 px-3 sm:px-4 py-2.5 border-b bg-white flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-black text-gray-900 text-[12px] sm:text-sm truncate">حجز سريع</div>
              <div className="text-[10px] sm:text-[11px] text-gray-600 truncate">
                {unitNumber ? `الوحدة: ${unitNumber}` : 'اختر تاريخ الدخول ثم تاريخ الخروج'}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {stage === 'wizard' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setStage('range')}
                    className="px-3 py-2 rounded-2xl hover:bg-gray-100 text-gray-700 text-[11px] font-black"
                    title="تعديل المدة"
                  >
                    تعديل المدة
                  </button>
                  {selectedRange ? (
                    <button
                      type="button"
                      onClick={() => {
                        onComplete(selectedRange.checkIn, selectedRange.checkOut);
                        onClose();
                      }}
                      className="px-3 py-2 rounded-2xl hover:bg-gray-100 text-gray-700 text-[11px] font-black"
                      title="فتح بصفحة كاملة"
                    >
                      صفحة كاملة
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => shiftMonths(-1)}
                    className="p-2 rounded-2xl hover:bg-gray-100 text-gray-700"
                    title="الشهر السابق"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftMonths(1)}
                    className="p-2 rounded-2xl hover:bg-gray-100 text-gray-700"
                    title="الشهر التالي"
                  >
                    <ChevronLeft size={18} />
                  </button>
                </>
              )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-2xl hover:bg-gray-100 text-gray-700"
              title="إغلاق"
            >
              <X size={18} />
            </button>
            </div>
          </div>
          <div className="p-3 sm:p-4 bg-gray-50 overflow-y-auto overscroll-contain">
            <div className="bg-white border border-gray-200 rounded-2xl p-2 sm:p-3 mb-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] sm:text-[11px] text-gray-800">
                <div className="flex items-center justify-between sm:block">
                  <div className="text-gray-500 font-bold">الوحدة</div>
                  <div className="font-black text-gray-900">{unitNumber || '—'}</div>
                </div>
                <div className="flex items-center justify-between sm:block">
                  <div className="text-gray-500 font-bold">النوع</div>
                  <div className="font-black text-gray-900 truncate">{unitTypeName || '—'}</div>
                </div>
                <div className="flex items-center justify-between sm:block">
                  <div className="text-gray-500 font-bold">شهري</div>
                  <div className="font-black text-gray-900 font-mono text-[10px] sm:text-[11px]">
                    {monthly == null ? '—' : `${Math.round(monthly).toLocaleString('ar-SA')} ر.س`}
                  </div>
                </div>
                <div className="flex items-center justify-between sm:block">
                  <div className="text-gray-500 font-bold">سنوي</div>
                  <div className="font-black text-gray-900 font-mono text-[10px] sm:text-[11px]">
                    {annual == null ? '—' : `${Math.round(annual).toLocaleString('ar-SA')} ر.س`}
                  </div>
                </div>
              </div>
            </div>
            {stage === 'range' && parsedBlocked.length > 0 && (
              <div className="mb-3 bg-red-50 border border-red-200 rounded-2xl p-3 text-[10px] sm:text-[11px] text-red-800 font-bold">
                الأيام باللون الأحمر محجوزة ولا يمكن اختيارها.
              </div>
            )}
            {stage === 'wizard' ? (
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                {iframeSrc ? (
                  <div className="relative">
                    {iframeLoading && !iframeError && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white">
                        <div className="text-sm font-black text-gray-700">جار تحميل صفحة الحجز…</div>
                      </div>
                    )}
                    {iframeError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white p-4 text-center">
                        <div className="text-sm font-black text-red-700">تعذر تحميل صفحة الحجز داخل النافذة</div>
                        <div className="text-xs text-gray-600">اضغط “صفحة كاملة” للمتابعة</div>
                      </div>
                    )}
                    <iframe
                      key={iframeSrc}
                      src={iframeSrc}
                      className="w-full h-[62vh] sm:h-[74vh]"
                      sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
                      referrerPolicy="no-referrer"
                      onLoad={() => {
                        setIframeLoading(false);
                        setIframeError(false);
                      }}
                      onError={() => {
                        setIframeLoading(false);
                        setIframeError(true);
                      }}
                    />
                  </div>
                ) : (
                  <div className="p-6 text-sm text-gray-700 font-bold">تعذر فتح صفحة الحجز</div>
                )}
              </div>
            ) : (
              <>
                <div className="text-[10px] sm:text-[11px] text-gray-700 font-bold mb-3 flex items-center justify-between">
                  <div>
                    {!start && 'اختر تاريخ الدخول'}
                    {start && !end && `تاريخ الدخول: ${toYMD(start)} — اختر تاريخ الخروج`}
                    {start && end && `من ${toYMD(start)} إلى ${toYMD(end)}`}
                  </div>
                  {start && end && (
                    <div className="flex flex-col items-end gap-1">
                      <div className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-xl border border-blue-100 text-xs font-black">
                        {getDurationLabel()}
                      </div>
                      {monthly && (
                        <div className="flex items-center gap-1.5 text-emerald-600 font-black text-sm">
                          <CreditCard size={14} />
                          {(() => {
                            const { months, days } = calculateDetailedDuration(start, end);
                            const extraDaily = monthly / 30;
                            const total = Math.round((monthly * months) + (extraDaily * days));
                            return `${total.toLocaleString()} ريال`;
                          })()}
                        </div>
                      )}
                      {start.getDate() === end.getDate() && (
                        <div className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-0.5 rounded-lg border border-red-100 animate-pulse mt-0.5">
                          <AlertCircle size={12} />
                          <span className="text-[10px] font-black">شهر ويوم</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4"
                  onWheel={(e) => {
                    const now = Date.now();
                    if (now - wheelLockRef.current < 250) return;
                    wheelLockRef.current = now;
                    if (e.deltaY > 0) shiftMonths(1);
                    else if (e.deltaY < 0) shiftMonths(-1);
                  }}
                >
                  {renderMonth(month0)}
                  {renderMonth(month1)}
                </div>
                <div className="mt-4 bg-white border border-gray-200 rounded-2xl p-3">
                  <div className="text-xs font-black text-gray-900 mb-2">مدد جاهزة</div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => applyDaysPreset(7)}
                      disabled={!start}
                      className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl border bg-white hover:bg-gray-50 text-[11px] font-black disabled:opacity-50"
                    >
                      أسبوع
                    </button>
                    {[1, 2, 3, 6, 12].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setPresetMonths(m);
                          applyPreset(m);
                        }}
                        disabled={!start}
                        className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl border text-[11px] font-black disabled:opacity-50 ${
                          presetMonths === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'
                        }`}
                      >
                        {m} شهر
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="flex items-center gap-2">
                      <div className="text-[11px] font-black text-gray-700">عدد الأشهر</div>
                      <select
                        value={presetMonths}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 1;
                          setPresetMonths(v);
                          applyPreset(v);
                        }}
                        disabled={!start}
                        className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl border bg-white text-[11px] font-black disabled:opacity-50"
                      >
                        {[1, 2, 3, 4, 5, 6, 12].map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={confirmPreset}
                      disabled={!start || !end}
                      className="sm:mr-auto px-3.5 py-2 sm:px-4 rounded-2xl bg-emerald-600 text-white text-[12px] font-black hover:bg-emerald-700 disabled:opacity-50"
                    >
                      تأكيد
                    </button>
                  </div>
                  <div className="mt-2 text-[10px] text-gray-500">
                    لن يتم الانتقال إلا بعد تحديد تاريخ الدخول والمغادرة (إما بالنقر على يومين أو باختيار مدة ثم تأكيد).
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
