'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, User, Home, CalendarCheck, LogIn, LogOut, Brush, CheckCircle2, CreditCard, AlertTriangle, Printer } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';

const EVENT_LABELS: Record<string, { label: string; icon: React.ComponentType<any>; color: string }> = {
  booking_created: { label: 'حجز جديد', icon: CalendarCheck, color: 'bg-blue-100 text-blue-700' },
  invoice_draft_created: { label: 'إنشاء فاتورة مسودة', icon: CreditCard, color: 'bg-indigo-100 text-indigo-700' },
  advance_payment_posted: { label: 'تسجيل عربون', icon: CreditCard, color: 'bg-fuchsia-100 text-fuchsia-700' },
  document_printed: { label: 'طباعة مستند', icon: Printer, color: 'bg-teal-100 text-teal-700' },
  user_login: { label: 'تسجيل دخول مستخدم', icon: LogIn, color: 'bg-green-100 text-green-700' },
  user_logout: { label: 'تسجيل خروج مستخدم', icon: LogOut, color: 'bg-gray-100 text-gray-700' },
  unit_status_changed: { label: 'تغيير حالة وحدة', icon: Home, color: 'bg-orange-100 text-orange-700' },
  temporary_reservation_created: { label: 'إنشاء حجز مؤقت', icon: CalendarCheck, color: 'bg-cyan-100 text-cyan-700' },
  temporary_reservation_cancelled: { label: 'إلغاء حجز مؤقت', icon: CalendarCheck, color: 'bg-rose-100 text-rose-700' },
  document_deleted: { label: 'حذف وثيقة', icon: AlertTriangle, color: 'bg-red-100 text-red-700' },
};

export default function ActivityLog() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventType, setEventType] = useState<string>('');
  const [actorId, setActorId] = useState<string>('');
  const [profiles, setProfiles] = useState<any[]>([]);
  const { role } = useUserRole();
  const isReceptionist = role === 'receptionist';

  const profilesMap = useMemo(() => {
    const m: Record<string, any> = {};
    profiles.forEach((p) => { m[p.id] = p; });
    return m;
  }, [profiles]);

  const loadProfiles = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .order('full_name', { ascending: true });
    setProfiles(data || []);
  };

  const loadEvents = async (opts?: { eventType?: string; actorId?: string }) => {
    setLoading(true);
    try {
      let query = supabase
        .from('system_events')
        .select('*, customer:customers(full_name), unit:units(unit_number), hotel:hotels(name)')
        .order('created_at', { ascending: false })
        .limit(100);

      // Restriction for Manager: only see booking related events, no financial or login events
      if (role === 'manager') {
        query = query.in('event_type', [
          'booking_created', 
          'booking_updated', 
          'booking_cancelled', 
          'unit_status_changed',
          'temporary_reservation_created',
          'temporary_reservation_cancelled',
          'document_printed' // Printed receipts/invoices allowed as per requirement 1
        ]);
      }

      if (opts?.eventType) {
        query = query.eq('event_type', opts.eventType);
      }
      if (opts?.actorId) {
        query = query.eq('payload->>actor_id', opts.actorId);
      }
      const { data } = await query;
      setEvents(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isReceptionist) {
      loadProfiles();
    }
    loadEvents({ eventType: isReceptionist ? '' : eventType, actorId: isReceptionist ? '' : actorId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isReceptionist) {
      // Receptionist sees stream only, no filters
      loadEvents({ eventType: '', actorId: '' });
    } else {
      loadEvents({ eventType, actorId });
    }
  }, [eventType, actorId, isReceptionist]);

  return (
    <div className="space-y-3">
      <div className="px-6 py-4 border-b border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            إجمالي التنبيهات: {events.length}
          </span>
        </div>
        {!isReceptionist && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">نوع الحدث</label>
              <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">الكل</option>
                {Object.keys(EVENT_LABELS).map((key) => (
                  <option key={key} value={key}>{EVENT_LABELS[key].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">المستخدم</label>
              <select value={actorId} onChange={(e) => setActorId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">الكل</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email || p.id}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-10 text-center text-gray-500">جارٍ التحميل...</div>
      ) : events.length === 0 ? (
        <div className="py-16 text-center text-gray-500">
          لا توجد تنبيهات حالياً
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {events.map((event) => {
            const meta = EVENT_LABELS[event.event_type] || {
              label: event.event_type,
              icon: Bell,
              color: 'bg-gray-100 text-gray-700',
            };
            const Icon = meta.icon;
            return (
              <div key={event.id} className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors">
                <div className={`mt-1 w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${meta.color}`}>
                  <Icon size={16} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{meta.label}</span>
                    {event.customer?.full_name && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        <User size={12} />
                        {event.customer.full_name}
                      </span>
                    )}
                    {event.unit?.unit_number && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        <Home size={12} />
                        {event.unit.unit_number}
                      </span>
                    )}
                    {(event.payload?.actor_id || event.payload?.actor_email) && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        <User size={12} />
                        {profilesMap[event.payload?.actor_id || '']?.full_name || event.payload?.actor_email || profilesMap[event.payload?.actor_id || '']?.email || ''}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mt-1">
                    {event.message}
                  </p>
                  <div className="mt-1 text-xs text-gray-400">
                    {new Date(event.created_at).toLocaleString('ar-EG', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {event.hotel?.name && (
                      <span className="mx-2 text-gray-500">
                        • {event.hotel.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
