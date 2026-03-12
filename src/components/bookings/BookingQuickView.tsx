'use client';

import React, { useEffect, useState } from 'react';
import { Eye, X, Pencil } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type BookingQuick = {
  id: string;
  check_in: string;
  check_out: string;
  booking_type?: string | null;
  status?: string | null;
  total_price?: number | null;
  notes?: string | null;
  customer?: {
    full_name?: string | null;
    phone?: string | null;
    national_id?: string | null;
  } | null;
  unit?: {
    unit_number?: string | null;
    unit_type?: { name?: string | null } | null;
    floor?: string | null;
  } | null;
};

export default function BookingQuickView({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BookingQuick | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: booking, error: err } = await supabase
          .from('bookings')
          .select(`
            *,
            customer:customers(full_name, phone, national_id),
            unit:units(unit_number, floor, unit_type:unit_types(name))
          `)
          .eq('id', id)
          .single();
        if (err) throw err;
        if (!cancelled) setData(booking as any);
      } catch (e: any) {
        if (!cancelled) setError('تعذر جلب بيانات الحجز');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, id]);

  const fmt = (d?: string | null) => {
    if (!d) return '—';
    try {
      const dd = new Date(d);
      if (Number.isNaN(dd.getTime())) return d;
      return dd.toLocaleDateString('ar-SA');
    } catch {
      return d;
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        title="عرض سريع"
      >
        <Eye size={18} />
      </button>
      <Link
        href={`/bookings-list/${id}`}
        className="p-1.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
        title="تعديل / فتح التفاصيل"
      >
        <Pencil size={18} />
      </Link>

      {open && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-0 z-50 flex items-start justify-center p-4 sm:p-6">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900">تفاصيل الحجز</span>
                  <span className="text-xs font-mono text-gray-600 bg-gray-100 rounded px-2 py-0.5">
                    #{id.slice(0, 8).toUpperCase()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="إغلاق"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-4">
                {loading ? (
                  <div className="py-8 text-center text-gray-500">جارِ التحميل...</div>
                ) : error ? (
                  <div className="py-8 text-center text-red-600">{error}</div>
                ) : !data ? (
                  <div className="py-8 text-center text-gray-500">لا توجد بيانات</div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                        <div className="text-xs text-gray-600 mb-1">العميل</div>
                        <div className="font-bold text-gray-900">{data.customer?.full_name || '—'}</div>
                        <div className="text-xs font-mono text-gray-700" dir="ltr">{data.customer?.phone || '—'}</div>
                      </div>
                      <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                        <div className="text-xs text-gray-600 mb-1">الوحدة</div>
                        <div className="font-bold text-gray-900">
                          {data.unit?.unit_number || '—'}
                          <span className="text-xs text-gray-600 ms-2">
                            {data.unit?.unit_type?.name || ''}
                          </span>
                        </div>
                        <div className="text-xs text-gray-700">الدور: {data.unit?.floor || '—'}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-white rounded-xl border border-gray-200 p-3">
                        <div className="text-[11px] text-gray-600">الوصول</div>
                        <div className="font-bold text-gray-900">{fmt(data.check_in)}</div>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-200 p-3">
                        <div className="text-[11px] text-gray-600">المغادرة</div>
                        <div className="font-bold text-gray-900">{fmt(data.check_out)}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white rounded-xl border border-gray-200 p-3">
                        <div className="text-[11px] text-gray-600">النوع</div>
                        <div className="font-bold text-gray-900">
                          {data.booking_type === 'yearly' ? 'سنوي' : data.booking_type === 'daily' ? 'يومي' : data.booking_type || '—'}
                        </div>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-200 p-3">
                        <div className="text-[11px] text-gray-600">الحالة</div>
                        <div className="font-bold text-gray-900">{data.status || '—'}</div>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-200 p-3">
                        <div className="text-[11px] text-gray-600">الإجمالي</div>
                        <div className="font-bold text-gray-900">
                          {typeof data.total_price === 'number' ? data.total_price.toLocaleString() + ' ر.س' : '—'}
                        </div>
                      </div>
                    </div>
                    {data.notes && data.notes.trim().length > 0 ? (
                      <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                        <div className="text-xs text-gray-600 mb-1">ملاحظات</div>
                        <div className="text-sm text-gray-800">{data.notes}</div>
                      </div>
                    ) : null}
                    <div className="flex justify-end gap-2 pt-2">
                      <Link
                        href={`/bookings-list/${id}`}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 shadow-sm"
                        title="فتح صفحة التفاصيل والتعديل"
                      >
                        <Pencil size={16} />
                        تعديل
                      </Link>
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-bold hover:bg-gray-50"
                      >
                        إغلاق
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

