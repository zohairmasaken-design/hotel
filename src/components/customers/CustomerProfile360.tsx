'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  X, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Calendar, 
  Clock, 
  CreditCard, 
  MessageCircle, 
  Edit, 
  FileText, 
  StickyNote, 
  CheckCircle, 
  AlertCircle,
  Building2,
  Briefcase,
  Globe,
  Plus,
  ArrowUpRight,
  TrendingUp,
  History,
  ListTodo,
  CheckSquare,
  CalendarClock,
  Flag,
  MessageSquare,
  PhoneCall,
  Users
} from 'lucide-react';
import { format, formatDistanceToNow, parseISO, isPast, isToday, isTomorrow } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { Customer } from './CustomerModal';

interface CustomerProfile360Props {
  customer: Customer;
  onClose: () => void;
  onEdit: () => void;
}

export default function CustomerProfile360({ customer, onClose, onEdit }: CustomerProfile360Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings' | 'financial' | 'crm'>('overview');
  const [loading, setLoading] = useState(true);
  
  // Data States
  const [bookings, setBookings] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalBookings: 0,
    totalSpent: 0,
    balance: 0,
    lastVisit: null as string | null,
    avgStay: 0,
    cancellationRate: 0
  });

  // CRM Input State
  const [newActivityType, setNewActivityType] = useState<'note' | 'call' | 'whatsapp' | 'email' | 'meeting' | 'task'>('note');
  const [newSubject, setNewSubject] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDueDate, setNewDueDate] = useState<string>('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [isAddingActivity, setIsAddingActivity] = useState(false);

  useEffect(() => {
    fetchCustomerData();
  }, [customer.id]);

  const fetchCustomerData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Bookings
      const { data: bookingsData } = await supabase
        .from('bookings')
        .select(`
          *,
          unit:units(unit_number, floor, unit_type:unit_types(name)),
          hotel:hotels(name)
        `)
        .eq('customer_id', customer.id)
        .order('check_in', { ascending: false });

      // 2. Fetch Payments
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('*')
        .eq('customer_id', customer.id)
        .order('payment_date', { ascending: false });

      // 3. Fetch CRM Data (System Events + New Activities)
      const { data: systemEvents } = await supabase
        .from('system_events')
        .select('*')
        .eq('customer_id', customer.id)
        .in('event_type', ['booking_created', 'check_in', 'check_out', 'system_note']) // Keep legacy system events
        .order('created_at', { ascending: false });

      const { data: crmActivities, error: crmError } = await supabase
        .from('crm_activities')
        .select('*')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false });

      if (crmError) console.warn('CRM Activities table access error:', crmError);

      // Merge & Sort Timeline
      const allEvents = [
        ...(systemEvents || []).map((e: any) => ({ 
          id: e.id,
          type: e.event_type,
          content: e.message || e.payload?.description,
          created_at: e.created_at,
          source: 'system',
          metadata: e.payload
        })),
        ...(crmActivities || []).map((e: any) => ({
          id: e.id,
          type: e.activity_type,
          content: e.description || e.subject,
          subject: e.subject,
          created_at: e.created_at,
          source: 'crm',
          status: e.status,
          priority: e.priority,
          due_date: e.due_date,
          metadata: e.metadata
        }))
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setTimelineEvents(allEvents);

      // 4. Fetch Balance (RPC)
      const { data: statementData } = await supabase.rpc('get_customer_statement', {
        p_customer_id: customer.id
      });
      const balance = statementData && statementData.length > 0 
        ? (Number(statementData[statementData.length - 1].balance) || 0) 
        : 0;

      // Calculate Stats
      const totalBookings = bookingsData?.length || 0;
      const validBookings = bookingsData?.filter((b: any) => b.status !== 'cancelled') || [];
      const cancelledBookings = bookingsData?.filter((b: any) => b.status === 'cancelled') || [];
      
      const totalSpent = paymentsData?.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0) || 0;
      
      const lastVisit = validBookings.length > 0 ? validBookings[0].check_out : null;
      
      const totalNights = validBookings.reduce((sum: number, b: any) => sum + (Number(b.nights) || 0), 0);
      const avgStay = validBookings.length > 0 ? Math.round(totalNights / validBookings.length) : 0;
      
      const cancellationRate = totalBookings > 0 ? Math.round((cancelledBookings.length / totalBookings) * 100) : 0;

      setBookings(bookingsData || []);
      setPayments(paymentsData || []);
      // Timeline events are set above
      setStats({
        totalBookings,
        totalSpent,
        balance,
        lastVisit,
        avgStay,
        cancellationRate
      });

    } catch (error) {
      console.error('Error fetching customer profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const addActivity = async () => {
    if (!newSubject.trim() && !newDescription.trim()) return;
    setIsAddingActivity(true);
    
    try {
      const { error } = await supabase.from('crm_activities').insert({
        customer_id: customer.id,
        activity_type: newActivityType,
        subject: newSubject,
        description: newDescription,
        status: newActivityType === 'task' ? 'pending' : 'completed',
        priority: newActivityType === 'task' ? newPriority : null,
        due_date: newActivityType === 'task' && newDueDate ? new Date(newDueDate).toISOString() : null,
        created_at: new Date().toISOString()
      });

      if (error) throw error;

      // Reset Form
      setNewSubject('');
      setNewDescription('');
      setNewDueDate('');
      setNewPriority('medium');
      setNewActivityType('note');

      // Refresh Data
      await fetchCustomerData();
      
    } catch (error) {
      console.error('Error adding activity:', error);
      alert('حدث خطأ أثناء إضافة النشاط. تأكد من تشغيل سكربت قاعدة البيانات الجديد.');
    } finally {
      setIsAddingActivity(false);
    }
  };

  const getCustomerIcon = () => {
    switch (customer.customer_type) {
      case 'company': return <Building2 className="text-purple-600" size={24} />;
      case 'platform': return <Globe className="text-blue-600" size={24} />;
      case 'broker': return <Briefcase className="text-orange-600" size={24} />;
      default: return <User className="text-gray-600" size={24} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'checked_in': return 'bg-green-100 text-green-800';
      case 'checked_out': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'confirmed': return 'مؤكد';
      case 'checked_in': return 'سكن';
      case 'checked_out': return 'غادر';
      case 'cancelled': return 'ملغي';
      default: return status;
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-5xl h-[80vh] flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-hidden">
      <div className="bg-white rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Section */}
        <div className="bg-gray-50 border-b border-gray-200 p-6">
          <div className="flex justify-between items-start">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                {getCustomerIcon()}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  {customer.full_name}
                  <button onClick={onEdit} className="text-gray-400 hover:text-blue-600 transition-colors">
                    <Edit size={18} />
                  </button>
                </h2>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-600">
                  {customer.phone && (
                    <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded border border-gray-200">
                      <Phone size={14} className="text-gray-400" />
                      <span dir="ltr" className="font-mono">{customer.phone}</span>
                    </div>
                  )}
                  {customer.email && (
                    <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded border border-gray-200">
                      <Mail size={14} className="text-gray-400" />
                      <span>{customer.email}</span>
                    </div>
                  )}
                  {customer.national_id && (
                    <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded border border-gray-200">
                      <FileText size={14} className="text-gray-400" />
                      <span className="font-mono">{customer.national_id}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded border border-gray-200">
                    <MapPin size={14} className="text-gray-400" />
                    <span>{customer.address || 'العنوان غير محدد'}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={onClose}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Key Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500 font-medium mb-1">إجمالي الحجوزات</div>
                <div className="text-2xl font-bold text-gray-900">{stats.totalBookings}</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                <Calendar size={20} />
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500 font-medium mb-1">إجمالي المدفوعات</div>
                <div className="text-2xl font-bold text-emerald-600">
                  {stats.totalSpent.toLocaleString()} <span className="text-xs font-normal text-gray-400">ريال</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                <CreditCard size={20} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500 font-medium mb-1">آخر زيارة</div>
                <div className="text-lg font-bold text-gray-900">
                  {stats.lastVisit ? format(parseISO(stats.lastVisit), 'dd MMM yyyy', { locale: arSA }) : '-'}
                </div>
              </div>
              <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
                <History size={20} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500 font-medium mb-1">الرصيد الحالي</div>
                <div className={`text-2xl font-bold ${stats.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {Math.abs(stats.balance).toLocaleString()} <span className="text-xs font-normal text-gray-400">ريال {stats.balance > 0 ? 'عليه' : 'له'}</span>
                </div>
              </div>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${stats.balance > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                <CreditCard size={20} />
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 px-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'overview' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <TrendingUp size={18} />
            نظرة عامة والنشاط
          </button>
          <button
            onClick={() => setActiveTab('bookings')}
            className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'bookings' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Calendar size={18} />
            سجل الحجوزات ({bookings.length})
          </button>
          <button
            onClick={() => setActiveTab('financial')}
            className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'financial' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <CreditCard size={18} />
            المالية والمدفوعات
          </button>
          <button
            onClick={() => setActiveTab('crm')}
            className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'crm' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <ListTodo size={18} />
            المهام والتواصل
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
          
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Timeline Column */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Quick Actions / Stats could go here */}
                
                {/* Timeline Feed */}
                <div className="relative">
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <History size={18} className="text-gray-500" />
                    سجل النشاط والجدول الزمني
                  </h3>
                  
                  <div className="absolute top-10 bottom-0 right-5 w-0.5 bg-gray-200"></div>
                  
                  <div className="space-y-6 relative">
                    {timelineEvents.length === 0 ? (
                      <div className="text-center py-10 text-gray-500 bg-white rounded-xl border border-gray-200">
                        لا يوجد نشاط مسجل
                      </div>
                    ) : (
                      timelineEvents.map((event) => (
                        <div key={event.id} className="flex gap-4 relative">
                          <div className="w-10 h-10 rounded-full bg-white border-2 border-white shadow-sm flex items-center justify-center z-10 shrink-0 mt-1">
                            {/* Icons based on type */}
                            {event.type === 'booking_created' && <Calendar size={18} className="text-blue-600" />}
                            {event.type === 'check_in' && <CheckCircle size={18} className="text-emerald-600" />}
                            {event.type === 'check_out' && <History size={18} className="text-gray-600" />}
                            {event.type === 'note' && <StickyNote size={18} className="text-amber-600" />}
                            {event.type === 'call' && <PhoneCall size={18} className="text-purple-600" />}
                            {event.type === 'whatsapp' && <MessageCircle size={18} className="text-green-600" />}
                            {event.type === 'email' && <Mail size={18} className="text-blue-500" />}
                            {event.type === 'meeting' && <Users size={18} className="text-orange-600" />}
                            {event.type === 'task' && <CheckSquare size={18} className="text-red-600" />}
                            {(event.type === 'crm_note' || event.type === 'system_note') && <StickyNote size={18} className="text-gray-600" />}
                          </div>
                          
                          <div className={`flex-1 bg-white p-4 rounded-xl border shadow-sm hover:shadow-md transition-shadow ${event.type === 'task' ? 'border-l-4 border-l-red-500' : 'border-gray-100'}`}>
                            <div className="flex justify-between items-start mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-gray-900">
                                  {event.subject || (
                                    event.type === 'booking_created' ? 'حجز جديد' :
                                    event.type === 'check_in' ? 'تسجيل دخول' :
                                    event.type === 'check_out' ? 'مغادرة' :
                                    event.type === 'task' ? 'مهمة' :
                                    event.type === 'note' ? 'ملاحظة' : 
                                    event.type === 'call' ? 'اتصال' : 'نشاط'
                                  )}
                                </span>
                                {event.status && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                    event.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' :
                                    event.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                    'bg-gray-50 text-gray-600 border-gray-200'
                                  }`}>
                                    {event.status === 'completed' ? 'مكتمل' : 'قيد الانتظار'}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-xs font-medium text-gray-500">
                                  {formatDistanceToNow(parseISO(event.created_at), { addSuffix: true, locale: arSA })}
                                </span>
                                <span className="text-[10px] text-gray-400 font-mono">
                                  {format(parseISO(event.created_at), 'HH:mm')}
                                </span>
                              </div>
                            </div>
                            
                            <p className="text-gray-700 text-sm whitespace-pre-wrap mt-1">{event.content}</p>
                            
                            {event.due_date && (
                              <div className="mt-2 flex items-center gap-1 text-xs text-red-600 bg-red-50 w-fit px-2 py-1 rounded">
                                <CalendarClock size={12} />
                                <span>تاريخ الاستحقاق: {format(parseISO(event.due_date), 'dd/MM/yyyy')}</span>
                              </div>
                            )}

                            {event.metadata && Object.keys(event.metadata).length > 0 && (
                              <div className="mt-2 text-xs bg-gray-50 p-2 rounded border border-gray-100 text-gray-600 font-mono">
                                {JSON.stringify(event.metadata).slice(0, 100)}...
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Sidebar Info */}
              <div className="space-y-6">
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <User size={18} className="text-gray-500" />
                    معلومات تفصيلية
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">نوع العميل</label>
                      <div className="font-medium text-gray-900 flex items-center gap-2">
                        {customer.customer_type === 'individual' ? 'فرد' : 
                         customer.customer_type === 'company' ? 'شركة' : 
                         customer.customer_type === 'platform' ? 'منصة حجز' : 'وسيط'}
                      </div>
                    </div>
                    
                    {customer.nationality && (
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">الجنسية</label>
                        <div className="font-medium text-gray-900">{customer.nationality}</div>
                      </div>
                    )}
                    
                    {customer.details && (
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">ملاحظات دائمة</label>
                        <div className="bg-amber-50 text-amber-900 p-3 rounded-lg text-sm border border-amber-100">
                          {customer.details}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Phone size={18} className="text-gray-500" />
                    تواصل سريع
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {customer.phone && (
                      <>
                        <a 
                          href={`tel:${customer.phone}`}
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                        >
                          <Phone size={16} />
                          اتصال
                        </a>
                        <a 
                          href={`https://wa.me/${String(customer.phone).replace(/\D/g, '').replace(/^0/, '966')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-sm font-medium"
                        >
                          <MessageCircle size={16} />
                          واتساب
                        </a>
                      </>
                    )}
                    {customer.email && (
                      <a 
                        href={`mailto:${customer.email}`}
                        className="col-span-2 flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
                      >
                        <Mail size={16} />
                        إرسال بريد
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bookings Tab */}
          {activeTab === 'bookings' && (
            <div className="space-y-4">
              {bookings.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                  <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900">لا توجد حجوزات سابقة</h3>
                </div>
              ) : (
                bookings.map((booking) => (
                  <div key={booking.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-blue-50 flex flex-col items-center justify-center text-blue-700 font-bold border border-blue-100">
                        <span className="text-xs uppercase">UNIT</span>
                        <span className="text-lg">{booking.unit?.unit_number || '?'}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-gray-900">
                            {booking.hotel?.name || 'الفندق'} - {booking.unit?.unit_type?.name}
                          </h4>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(booking.status)}`}>
                            {getStatusLabel(booking.status)}
                          </span>
                        </div>
                        <div className="text-sm text-gray-500 flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <Calendar size={14} />
                            {format(parseISO(booking.check_in), 'dd MMM yyyy', { locale: arSA })}
                          </span>
                          <span className="text-gray-300">➜</span>
                          <span className="flex items-center gap-1">
                            <Calendar size={14} />
                            {format(parseISO(booking.check_out), 'dd MMM yyyy', { locale: arSA })}
                          </span>
                          <span className="bg-gray-100 px-2 rounded text-xs">
                            {booking.nights} ليالي
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6 border-t md:border-t-0 pt-3 md:pt-0">
                      <div className="text-left">
                        <div className="text-xs text-gray-500">إجمالي الحجز</div>
                        <div className="font-bold text-gray-900">{Number(booking.total_price).toLocaleString()} ريال</div>
                      </div>
                      <div className="text-left">
                        <div className="text-xs text-gray-500">المدفوع</div>
                        <div className="font-bold text-emerald-600">{Number(booking.paid_amount || 0).toLocaleString()} ريال</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Financial Tab */}
          {activeTab === 'financial' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-5 rounded-xl shadow-lg">
                  <div className="text-emerald-100 text-sm font-medium mb-1">إجمالي المدفوعات المستلمة</div>
                  <div className="text-3xl font-bold">{stats.totalSpent.toLocaleString()} ريال</div>
                </div>
                {/* Placeholder for Balance Due if calculated */}
              </div>

              <h3 className="font-bold text-gray-900 mt-6 mb-4">سجل العمليات المالية</h3>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm text-right">
                  <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3">التاريخ</th>
                      <th className="px-4 py-3">المبلغ</th>
                      <th className="px-4 py-3">طريقة الدفع</th>
                      <th className="px-4 py-3">الوصف</th>
                      <th className="px-4 py-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">لا توجد عمليات مالية مسجلة</td>
                      </tr>
                    ) : (
                      payments.map((payment) => (
                        <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-gray-600">
                            {format(parseISO(payment.payment_date), 'dd/MM/yyyy')}
                          </td>
                          <td className="px-4 py-3 font-bold text-gray-900">
                            {Number(payment.amount).toLocaleString()} ريال
                          </td>
                          <td className="px-4 py-3">
                            <span className="bg-gray-100 px-2 py-1 rounded text-xs text-gray-700">
                              {payment.payment_method_id || 'نقدي'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{payment.description || '-'}</td>
                          <td className="px-4 py-3">
                            <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full text-xs border border-emerald-100">
                              مكتمل
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* CRM Tab */}
          {activeTab === 'crm' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
              {/* Left Column: Add Activity Form */}
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm sticky top-0">
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Plus size={18} className="text-blue-600" />
                    تسجيل نشاط جديد
                  </h3>

                  <div className="space-y-4">
                    {/* Activity Type Selection */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-2 block">نوع النشاط</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'note', icon: StickyNote, label: 'ملاحظة', color: 'bg-amber-50 text-amber-700 border-amber-200' },
                          { id: 'call', icon: PhoneCall, label: 'اتصال', color: 'bg-purple-50 text-purple-700 border-purple-200' },
                          { id: 'whatsapp', icon: MessageCircle, label: 'واتساب', color: 'bg-green-50 text-green-700 border-green-200' },
                          { id: 'email', icon: Mail, label: 'بريد', color: 'bg-blue-50 text-blue-700 border-blue-200' },
                          { id: 'meeting', icon: Users, label: 'اجتماع', color: 'bg-orange-50 text-orange-700 border-orange-200' },
                          { id: 'task', icon: CheckSquare, label: 'مهمة', color: 'bg-red-50 text-red-700 border-red-200' },
                        ].map((type) => (
                          <button
                            key={type.id}
                            onClick={() => setNewActivityType(type.id as any)}
                            className={`p-2 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                              newActivityType === type.id 
                                ? `${type.color} ring-1 ring-offset-1 ring-blue-300` 
                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <type.icon size={16} />
                            {type.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Fields */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">الموضوع / العنوان</label>
                      <input
                        type="text"
                        value={newSubject}
                        onChange={(e) => setNewSubject(e.target.value)}
                        placeholder="مثال: متابعة الحجز، استفسار عن..."
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">التفاصيل</label>
                      <textarea
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        placeholder="اكتب التفاصيل هنا..."
                        rows={4}
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none"
                      />
                    </div>

                    {/* Task Specific Fields */}
                    {newActivityType === 'task' && (
                      <div className="bg-red-50 p-3 rounded-lg border border-red-100 space-y-3 animate-in fade-in slide-in-from-top-2">
                        <div>
                          <label className="text-xs font-medium text-red-800 mb-1 block">تاريخ الاستحقاق</label>
                          <input
                            type="date"
                            value={newDueDate}
                            onChange={(e) => setNewDueDate(e.target.value)}
                            className="w-full border border-red-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-red-100"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-red-800 mb-1 block">الأولوية</label>
                          <div className="flex gap-2">
                            {['low', 'medium', 'high'].map((p) => (
                              <button
                                key={p}
                                onClick={() => setNewPriority(p as any)}
                                className={`flex-1 py-1.5 rounded text-xs font-medium border ${
                                  newPriority === p
                                    ? 'bg-white text-red-700 border-red-300 shadow-sm'
                                    : 'bg-red-100/50 text-red-600 border-transparent hover:bg-red-100'
                                }`}
                              >
                                {p === 'low' ? 'منخفضة' : p === 'medium' ? 'متوسطة' : 'عالية'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={addActivity}
                      disabled={(!newSubject && !newDescription) || isAddingActivity}
                      className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                      {isAddingActivity ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <Plus size={18} />
                          {newActivityType === 'task' ? 'إضافة المهمة' : 'حفظ النشاط'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Lists */}
              <div className="lg:col-span-2 space-y-6 overflow-y-auto max-h-[calc(90vh-200px)]">
                
                {/* Pending Tasks Section */}
                {timelineEvents.some(e => e.type === 'task' && e.status === 'pending') && (
                  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <ListTodo size={18} className="text-red-500" />
                      المهام المعلقة
                      <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">
                        {timelineEvents.filter(e => e.type === 'task' && e.status === 'pending').length}
                      </span>
                    </h3>
                    <div className="space-y-3">
                      {timelineEvents
                        .filter(e => e.type === 'task' && e.status === 'pending')
                        .map(task => (
                          <div key={task.id} className="flex items-start gap-3 p-3 bg-red-50/50 border border-red-100 rounded-lg hover:bg-red-50 transition-colors group">
                            <div className="mt-1">
                              <div className={`w-2 h-2 rounded-full ${
                                task.priority === 'high' ? 'bg-red-500' : 
                                task.priority === 'medium' ? 'bg-orange-500' : 'bg-blue-500'
                              }`} />
                            </div>
                            <div className="flex-1">
                              <div className="flex justify-between items-start">
                                <h4 className="font-bold text-gray-900 text-sm">{task.subject}</h4>
                                {task.due_date && (
                                  <span className={`text-xs flex items-center gap-1 ${
                                    isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date)) ? 'text-red-600 font-bold' : 'text-gray-500'
                                  }`}>
                                    <CalendarClock size={12} />
                                    {format(parseISO(task.due_date), 'dd/MM/yyyy')}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600 mt-1">{task.content}</p>
                            </div>
                            <button className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-white rounded text-gray-500 transition-all">
                              <CheckCircle size={16} />
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* History Log */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <History size={18} className="text-gray-500" />
                    سجل التواصل والنشاطات السابقة
                  </h3>
                  <div className="space-y-4">
                    {timelineEvents
                      .filter(e => !(e.type === 'task' && e.status === 'pending'))
                      .map((event) => (
                        <div key={event.id} className="flex gap-3 pb-4 border-b border-gray-50 last:border-0 last:pb-0">
                          <div className="mt-1 shrink-0">
                            <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 border border-gray-100">
                              {event.type === 'call' ? <PhoneCall size={14} className="text-purple-600" /> :
                               event.type === 'whatsapp' ? <MessageCircle size={14} className="text-green-600" /> :
                               event.type === 'email' ? <Mail size={14} className="text-blue-600" /> :
                               event.type === 'task' ? <CheckSquare size={14} className="text-green-600" /> :
                               <StickyNote size={14} className="text-amber-600" />}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between">
                              <span className="text-sm font-medium text-gray-900">{event.subject || event.content?.slice(0, 30)}</span>
                              <span className="text-xs text-gray-400">{formatDistanceToNow(parseISO(event.created_at), { locale: arSA })}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{event.content}</p>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}