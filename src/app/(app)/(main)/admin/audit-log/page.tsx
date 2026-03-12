'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Bell, User, Home, CalendarCheck, LogIn, LogOut, Brush, 
  CheckCircle2, CreditCard, AlertTriangle, Printer, 
  History, Search, ShieldCheck, Wrench, FileText, Trash2, Edit, Clock
} from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import RoleGate from '@/components/auth/RoleGate';

const AUDIT_EVENT_LABELS: Record<string, { label: string; icon: React.ComponentType<any>; color: string }> = {
  booking_created: { label: 'إنشاء حجز', icon: CalendarCheck, color: 'bg-blue-100 text-blue-700' },
  booking_updated: { label: 'تحديث حجز', icon: Edit, color: 'bg-blue-50 text-blue-600' },
  booking_cancelled: { label: 'إلغاء حجز', icon: Trash2, color: 'bg-red-100 text-red-700' },
  invoice_draft_created: { label: 'فاتورة مسودة', icon: FileText, color: 'bg-gray-100 text-gray-700' },
  invoice_posted: { label: 'ترحيل فاتورة', icon: CheckCircle2, color: 'bg-green-100 text-green-700' },
  invoice_unposted: { label: 'إلغاء ترحيل فاتورة', icon: AlertTriangle, color: 'bg-amber-100 text-amber-700' },
  payment_posted: { label: 'تسجيل سند قبض/صرف', icon: CreditCard, color: 'bg-emerald-100 text-emerald-700' },
  payment_unposted: { label: 'حذف/إلغاء سند', icon: Trash2, color: 'bg-rose-100 text-rose-700' },
  advance_payment_posted: { label: 'تسجيل عربون', icon: CreditCard, color: 'bg-fuchsia-100 text-fuchsia-700' },
  insurance_voucher: { label: 'سند تأمين', icon: ShieldCheck, color: 'bg-teal-100 text-teal-700' },
  document_printed: { label: 'طباعة مستند', icon: Printer, color: 'bg-indigo-100 text-indigo-700' },
  user_login: { label: 'تسجيل دخول', icon: LogIn, color: 'bg-green-100 text-green-700' },
  user_logout: { label: 'تسجيل خروج', icon: LogOut, color: 'bg-gray-100 text-gray-700' },
  unit_status_changed: { label: 'تغيير حالة وحدة', icon: Home, color: 'bg-orange-100 text-orange-700' },
  maintenance_request: { label: 'طلب صيانة', icon: Wrench, color: 'bg-yellow-100 text-yellow-700' },
  maintenance_resolved: { label: 'إصلاح صيانة', icon: CheckCircle2, color: 'bg-green-100 text-green-700' },
  cleaning_started: { label: 'بدء تنظيف', icon: Brush, color: 'bg-sky-100 text-sky-700' },
  cleaning_finished: { label: 'انتهاء تنظيف', icon: CheckCircle2, color: 'bg-green-100 text-green-700' },
  temporary_reservation_created: { label: 'حجز مؤقت', icon: Clock, color: 'bg-cyan-100 text-cyan-700' },
  temporary_reservation_cancelled: { label: 'إلغاء حجز مؤقت', icon: AlertTriangle, color: 'bg-rose-100 text-rose-700' },
};

export default function AuditLogPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventType, setEventType] = useState<string>('');
  const [actorId, setActorId] = useState<string>('');
  const [profiles, setProfiles] = useState<any[]>([]);
  const { role } = useUserRole();

  const profilesMap = useMemo(() => {
    const m: Record<string, any> = {};
    profiles.forEach((p) => { m[p.id] = p; });
    return m;
  }, [profiles]);

  const loadProfiles = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .order('full_name', { ascending: true });
    setProfiles(data || []);
  };

  const loadEvents = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('system_events')
        .select('*, customer:customers(full_name), unit:units(unit_number)')
        .order('created_at', { ascending: false })
        .limit(200);

      if (eventType) {
        query = query.eq('event_type', eventType);
      }
      if (actorId) {
        query = query.eq('payload->>actor_id', actorId);
      }

      const { data } = await query;
      setEvents(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfiles();
    loadEvents();
  }, []);

  useEffect(() => {
    loadEvents();
  }, [eventType, actorId]);

  return (
    <RoleGate allow={['admin']}>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gray-900 text-white flex items-center justify-center shadow-lg">
              <History size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">سجل مراقبة النظام (Audit Log)</h1>
              <p className="text-gray-500 text-sm">تتبع كافة العمليات والأنشطة التي تمت من قبل جميع الموظفين</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5 mr-1">نوع العملية</label>
                <div className="relative">
                  <select 
                    value={eventType} 
                    onChange={(e) => setEventType(e.target.value)} 
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm appearance-none bg-white focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                  >
                    <option value="">جميع العمليات</option>
                    {Object.keys(AUDIT_EVENT_LABELS).map((key) => (
                      <option key={key} value={key}>{AUDIT_EVENT_LABELS[key].label}</option>
                    ))}
                  </select>
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5 mr-1">الموظف / المسؤول</label>
                <div className="relative">
                  <select 
                    value={actorId} 
                    onChange={(e) => setActorId(e.target.value)} 
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm appearance-none bg-white focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                  >
                    <option value="">جميع الموظفين</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name || p.email} ({p.role})
                      </option>
                    ))}
                  </select>
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div className="flex items-end">
                <button 
                  onClick={() => { setEventType(''); setActorId(''); }}
                  className="px-4 py-2.5 text-sm font-bold text-gray-600 hover:text-gray-900 transition-colors"
                >
                  إعادة ضبط الفلاتر
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="py-20 text-center text-gray-500">
                <div className="animate-spin w-8 h-8 border-4 border-gray-900 border-t-transparent rounded-full mx-auto mb-4"></div>
                جارٍ تحميل سجل العمليات...
              </div>
            ) : events.length === 0 ? (
              <div className="py-20 text-center text-gray-500">
                <History size={48} className="mx-auto mb-4 opacity-20" />
                لا توجد عمليات مسجلة تطابق البحث
              </div>
            ) : (
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-xs font-bold uppercase tracking-wider border-b border-gray-100">
                    <th className="px-6 py-4">العملية</th>
                    <th className="px-6 py-4">الموظف</th>
                    <th className="px-6 py-4">التفاصيل</th>
                    <th className="px-6 py-4">الوقت والتاريخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {events.map((event) => {
                    const meta = AUDIT_EVENT_LABELS[event.event_type] || {
                      label: event.event_type,
                      icon: Bell,
                      color: 'bg-gray-100 text-gray-700',
                    };
                    const Icon = meta.icon;
                    const actor = profilesMap[event.payload?.actor_id] || { full_name: event.payload?.actor_email || 'نظام آلي' };
                    
                    return (
                      <tr key={event.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${meta.color}`}>
                              <Icon size={16} />
                            </div>
                            <span className="text-sm font-bold text-gray-900">{meta.label}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-gray-900">{actor.full_name}</span>
                            <span className="text-[10px] text-gray-500 uppercase">{actor.role || 'System'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-700 max-w-md break-words">
                            {event.message}
                            <div className="flex gap-2 mt-1">
                                {event.unit?.unit_number && (
                                    <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">وحدة: {event.unit.unit_number}</span>
                                )}
                                {event.customer?.full_name && (
                                    <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">عميل: {event.customer.full_name}</span>
                                )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-left" dir="ltr">
                          <div className="text-xs font-mono text-gray-500">
                            {new Date(event.created_at).toLocaleString('en-GB', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </RoleGate>
  );
}
