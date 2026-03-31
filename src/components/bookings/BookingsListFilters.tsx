'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar, Search, X } from 'lucide-react';

export default function BookingsListFilters({
  initialQ,
  initialArrivalDate,
  initialDepartureDate,
}: {
  initialQ: string;
  initialArrivalDate: string;
  initialDepartureDate: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = React.useState(initialQ || '');
  const [arrivalDate, setArrivalDate] = React.useState(initialArrivalDate || '');
  const [departureDate, setDepartureDate] = React.useState(initialDepartureDate || '');
  const syncRef = React.useRef(false);
  const debounceRef = React.useRef<any>(null);

  const apply = (mode: 'apply' | 'clear') => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', '1');

    const setOrDelete = (key: string, value: string) => {
      const v = value.trim();
      if (v) params.set(key, v);
      else params.delete(key);
    };

    if (mode === 'clear') {
      params.delete('q');
      params.delete('arrival');
      params.delete('departure');
      setQ('');
      setArrivalDate('');
      setDepartureDate('');
    } else {
      setOrDelete('q', q);
      setOrDelete('arrival', arrivalDate);
      setOrDelete('departure', departureDate);
    }

    const qs = params.toString();
    const href = qs ? `/bookings-list?${qs}` : '/bookings-list';
    router.push(href);
  };

  React.useEffect(() => {
    const qs = searchParams.toString();
    syncRef.current = true;
    try {
      setQ(searchParams.get('q') || '');
      setArrivalDate(searchParams.get('arrival') || '');
      setDepartureDate(searchParams.get('departure') || '');
    } finally {
      queueMicrotask(() => {
        syncRef.current = false;
      });
    }
  }, [searchParams]);

  React.useEffect(() => {
    if (syncRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('page', '1');
      const v = q.trim();
      if (v) params.set('q', v);
      else params.delete('q');
      const qs = params.toString();
      const href = qs ? `/bookings-list?${qs}` : '/bookings-list';
      router.replace(href);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, router, searchParams]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
      <div className="space-y-1.5">
        <label className="text-xs sm:text-sm font-medium text-gray-700 flex items-center gap-1">
          <Search size={14} />
          بحث (اسم أو رقم غرفة)
        </label>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="مثال: أحمد أو 101"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs sm:text-sm font-medium text-gray-700 flex items-center gap-1">
          <Calendar size={14} />
          تاريخ الوصول
        </label>
        <input
          type="date"
          value={arrivalDate}
          onChange={(e) => setArrivalDate(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs sm:text-sm font-medium text-gray-700 flex items-center gap-1">
          <Calendar size={14} />
          تاريخ المغادرة
        </label>
        <input
          type="date"
          value={departureDate}
          onChange={(e) => setDepartureDate(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </div>
      <div className="flex flex-col sm:flex-row items-stretch gap-2">
        <button
          type="button"
          onClick={() => apply('apply')}
          className="w-full px-4 sm:px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-xs sm:text-sm flex items-center justify-center gap-2"
        >
          تطبيق
        </button>
        <button
          type="button"
          onClick={() => apply('clear')}
          className="w-full px-4 sm:px-6 py-2 bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50 transition-colors text-xs sm:text-sm flex items-center justify-center gap-2"
          title="مسح الفلاتر"
        >
          <X size={16} />
          مسح
        </button>
      </div>
    </div>
  );
}
