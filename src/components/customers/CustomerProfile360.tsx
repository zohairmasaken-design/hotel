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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center sm:p-4 overflow-hidden">
      <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-6xl h-full sm:h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Section */}
        <div className="bg-gray-50 border-b border-gray-200 p-3 sm:p-6 shrink-0">
          <div className="flex justify-between items-start">
            <div className="flex flex-row items-center gap-3 sm:gap-4 w-full min-w-0">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm shrink-0">
                {getCustomerIcon()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">
                    {customer.full_name}
                  </h2>
                  <button onClick={onEdit} className="text-gray-400 hover:text-blue-600 transition-colors shrink-0">
                    <Edit size={16} className="sm:w-[18px] sm:h-[18px]" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1 sm:mt-2 text-[10px] sm:text-sm text-gray-600">
                  {customer.phone && (
                    <div className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-gray-100">
                      <Phone size={10} className="text-gray-400 sm:w-[12px] sm:h-[12px]" />
                      <span dir="ltr" className="font-mono">{customer.phone}</span>
                    </div>
                  )}
                  {customer.national_id && (
                    <div className="hidden xs:flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-gray-100">
                      <FileText size={10} className="text-gray-400 sm:w-[12px] sm:h-[12px]" />
                      <span className="font-mono">{customer.national_id}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-gray-100">
                    <MapPin size={10} className="text-gray-400 sm:w-[12px] sm:h-[12px]" />
                    <span className="truncate max-w-[80px] sm:max-w-[150px]">{customer.address || 'العنوان'}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 shrink-0 mr-2">
              <button 
                onClick={onClose}
                className="p-1.5 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
              >
                <X size={20} className="sm:w-[24px] sm:h-[24px]" />
              </button>
            </div>
          </div>

          {/* Key Stats Cards - Improved for mobile */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mt-4 sm:mt-6">
            <div className="bg-white p-2.5 sm:p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-[9px] sm:text-xs text-gray-500 font-medium mb-0.5 sm:mb-1 truncate">إجمالي الحجوزات</div>
                <div className="text-base sm:text-2xl font-bold text-gray-900">{stats.totalBookings}</div>
              </div>
              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                <Calendar size={14} className="sm:w-[20px] sm:h-[20px]" />
              </div>
            </div>
            
            <div className="bg-white p-2.5 sm:p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-[9px] sm:text-xs text-gray-500 font-medium mb-0.5 sm:mb-1 truncate">إجمالي المدفوعات</div>
                <div className="text-base sm:text-2xl font-bold text-emerald-600 truncate">
                  {stats.totalSpent.toLocaleString()} <span className="text-[9px] sm:text-xs font-normal text-gray-400">ر.س</span>
                </div>
              </div>
              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                <CreditCard size={14} className="sm:w-[20px] sm:h-[20px]" />
              </div>
            </div>

            <div className="bg-white p-2.5 sm:p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-[9px] sm:text-xs text-gray-500 font-medium mb-0.5 sm:mb-1 truncate">آخر زيارة</div>
                <div className="text-xs sm:text-lg font-bold text-gray-900 truncate">
                  {stats.lastVisit ? format(parseISO(stats.lastVisit), 'dd/MM/yy', { locale: arSA }) : '-'}
                </div>
              </div>
              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
                <History size={14} className="sm:w-[20px] sm:h-[20px]" />
              </div>
            </div>

            <div className="bg-white p-2.5 sm:p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-[9px] sm:text-xs text-gray-500 font-medium mb-0.5 sm:mb-1 truncate">الرصيد الحالي</div>
                <div className={`text-base sm:text-2xl font-bold truncate ${stats.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {Math.abs(stats.balance).toLocaleString()} <span className="text-[9px] sm:text-xs font-normal text-gray-400">{stats.balance > 0 ? 'عليه' : 'له'}</span>
                </div>
              </div>
              <div className={`w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 ${stats.balance > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                <CreditCard size={14} className="sm:w-[20px] sm:h-[20px]" />
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs - Scrollable on mobile */}
        <div className="flex border-b border-gray-200 px-2 sm:px-6 overflow-x-auto no-scrollbar shrink-0 bg-white">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'overview' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <TrendingUp size={16} className="sm:w-[18px] sm:h-[18px]" />
            النشاط
          </button>
          <button
            onClick={() => setActiveTab('bookings')}
            className={`px-4 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'bookings' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Calendar size={16} className="sm:w-[18px] sm:h-[18px]" />
            الحجوزات ({bookings.length})
          </button>
          <button
            onClick={() => setActiveTab('financial')}
            className={`px-4 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'financial' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <CreditCard size={16} className="sm:w-[18px] sm:h-[18px]" />
            المالية
          </button>
          <button
            onClick={() => setActiveTab('crm')}
            className={`px-4 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'crm' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <ListTodo size={16} className="sm:w-[18px] sm:h-[18px]" />
            المهام
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50/50">
          
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Timeline Column */}
              <div className="lg:col-span-2 space-y-6 order-2 lg:order-1">
                
                {/* Timeline Feed */}
                <div className="relative">
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <History size={18} className="text-gray-500" />
                    سجل النشاط والجدول الزمني
                  </h3>
                  
                  <div className="absolute top-10 bottom-0 right-5 w-0.5 bg-gray-200 hidden sm:block"></div>
                  
                  <div className="space-y-4 sm:space-y-6 relative">
                    {timelineEvents.length === 0 ? (
                      <div className="text-center py-10 text-gray-500 bg-white rounded-xl border border-gray-200">
                        لا يوجد نشاط مسجل
                      </div>
                    ) : (
                      timelineEvents.map((event) => (
                        <div key={event.id} className="flex gap-3 sm:gap-4 relative">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white border-2 border-white shadow-sm flex items-center justify-center z-10 shrink-0 mt-1">
                            {/* Icons based on type */}
                            {event.type === 'booking_created' && <Calendar size={16} className="text-blue-600 sm:w-[18px] sm:h-[18px]" />}
                            {event.type === 'check_in' && <CheckCircle size={16} className="text-emerald-600 sm:w-[18px] sm:h-[18px]" />}
                            {event.type === 'check_out' && <History size={16} className="text-gray-600 sm:w-[18px] sm:h-[18px]" />}
                            {event.type === 'note' && <StickyNote size={16} className="text-amber-600 sm:w-[18px] sm:h-[18px]" />}
                            {event.type === 'call' && <PhoneCall size={16} className="text-purple-600 sm:w-[18px] sm:h-[18px]" />}
                            {event.type === 'whatsapp' && <MessageCircle size={16} className="text-green-600 sm:w-[18px] sm:h-[18px]" />}
                            {event.type === 'email' && <Mail size={16} className="text-blue-500 sm:w-[18px] sm:h-[18px]" />}
                            {event.type === 'meeting' && <Users size={16} className="text-orange-600 sm:w-[18px] sm:h-[18px]" />}
                            {event.type === 'task' && <CheckSquare size={16} className="text-red-600 sm:w-[18px] sm:h-[18px]" />}
                            {(event.type === 'crm_note' || event.type === 'system_note') && <StickyNote size={16} className="text-gray-600 sm:w-[18px] sm:h-[18px]" />}
                          </div>
                          
                          <div className={`flex-1 bg-white p-3 sm:p-4 rounded-xl border shadow-sm hover:shadow-md transition-shadow ${event.type === 'task' ? 'border-l-4 border-l-red-500' : 'border-gray-100'}`}>
                            <div className="flex justify-between items-start mb-1 gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs sm:text-sm font-bold text-gray-900">
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
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${
                                    event.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' :
                                    event.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                    'bg-gray-50 text-gray-600 border-gray-200'
                                  }`}>
                                    {event.status === 'completed' ? 'مكتمل' : 'قيد الانتظار'}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-col items-end shrink-0">
                                <span className="text-[10px] sm:text-xs font-medium text-gray-500">
                                  {formatDistanceToNow(parseISO(event.created_at), { addSuffix: true, locale: arSA })}
                                </span>
                                <span className="text-[9px] sm:text-[10px] text-gray-400 font-mono">
                                  {format(parseISO(event.created_at), 'HH:mm')}
                                </span>
                              </div>
                            </div>
                            
                            <p className="text-gray-700 text-xs sm:text-sm whitespace-pre-wrap mt-1">{event.content}</p>
                            
                            {event.due_date && (
                              <div className="mt-2 flex items-center gap-1 text-[10px] sm:text-xs text-red-600 bg-red-50 w-fit px-2 py-1 rounded">
                                <CalendarClock size={12} />
                                <span>تاريخ الاستحقاق: {format(parseISO(event.due_date), 'dd/MM/yyyy')}</span>
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
              <div className="space-y-6 order-1 lg:order-2">
                <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-sm">
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <User size={18} className="text-gray-500" />
                    معلومات تفصيلية
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] sm:text-xs text-gray-500 block mb-1">نوع العميل</label>
                      <div className="text-sm sm:text-base font-medium text-gray-900 flex items-center gap-2">
                        {customer.customer_type === 'individual' ? 'فرد' : 
                         customer.customer_type === 'company' ? 'شركة' : 
                         customer.customer_type === 'platform' ? 'منصة حجز' : 'وسيط'}
                      </div>
                    </div>
                    
                    {customer.nationality && (
                      <div>
                        <label className="text-[10px] sm:text-xs text-gray-500 block mb-1">الجنسية</label>
                        <div className="text-sm sm:text-base font-medium text-gray-900">{customer.nationality}</div>
                      </div>
                    )}
                    
                    {customer.details && (
                      <div>
                        <label className="text-[10px] sm:text-xs text-gray-500 block mb-1">ملاحظات دائمة</label>
                        <div className="bg-amber-50 text-amber-900 p-3 rounded-lg text-xs sm:text-sm border border-amber-100">
                          {customer.details}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-sm">
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Phone size={18} className="text-gray-500" />
                    تواصل سريع
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {customer.phone && (
                      <>
                        <a 
                          href={`tel:${customer.phone}`}
                          className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-xs sm:text-sm font-medium"
                        >
                          <Phone size={14} className="sm:w-4 sm:h-4" />
                          اتصال
                        </a>
                        <a 
                          href={`https://wa.me/${String(customer.phone).replace(/\D/g, '').replace(/^0/, '966')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-xs sm:text-sm font-medium"
                        >
                          <MessageCircle size={14} className="sm:w-4 sm:h-4" />
                          واتساب
                        </a>
                      </>
                    )}
                    {customer.email && (
                      <a 
                        href={`mailto:${customer.email}`}
                        className="col-span-2 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-xs sm:text-sm font-medium"
                      >
                        <Mail size={14} className="sm:w-4 sm:h-4" />
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
                  <div key={booking.id} className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-blue-50 flex flex-col items-center justify-center text-blue-700 font-bold border border-blue-100 shrink-0">
                        <span className="text-[8px] sm:text-xs uppercase">UNIT</span>
                        <span className="text-sm sm:text-lg">{booking.unit?.unit_number || '?'}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h4 className="font-bold text-gray-900 text-xs sm:text-base truncate">
                            {booking.hotel?.name || 'الفندق'} - {booking.unit?.unit_type?.name}
                          </h4>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${getStatusColor(booking.status)}`}>
                            {getStatusLabel(booking.status)}
                          </span>
                        </div>
                        <div className="text-[10px] sm:text-sm text-gray-500 flex items-center gap-2 sm:gap-4 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar size={12} className="sm:w-[14px] sm:h-[14px]" />
                            {format(parseISO(booking.check_in), 'dd MMM yyyy', { locale: arSA })}
                          </span>
                          <span className="text-gray-300">➜</span>
                          <span className="flex items-center gap-1">
                            <Calendar size={12} className="sm:w-[14px] sm:h-[14px]" />
                            {format(parseISO(booking.check_out), 'dd MMM yyyy', { locale: arSA })}
                          </span>
                          <span className="bg-gray-100 px-2 rounded text-[10px] sm:text-xs whitespace-nowrap">
                            {booking.nights} ليالي
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between md:justify-end gap-4 sm:gap-6 border-t md:border-t-0 pt-3 md:pt-0">
                      <div className="text-right md:text-left">
                        <div className="text-[10px] sm:text-xs text-gray-500">إجمالي الحجز</div>
                        <div className="font-bold text-gray-900 text-sm sm:text-base">{Number(booking.total_price).toLocaleString()} ريال</div>
                      </div>
                      <div className="text-right md:text-left">
                        <div className="text-[10px] sm:text-xs text-gray-500">المدفوع</div>
                        <div className="font-bold text-emerald-600 text-sm sm:text-base">{Number(booking.paid_amount || 0).toLocaleString()} ريال</div>
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
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-4 sm:p-5 rounded-xl shadow-lg">
                  <div className="text-emerald-100 text-[10px] sm:text-sm font-medium mb-1">إجمالي المدفوعات المستلمة</div>
                  <div className="text-xl sm:text-3xl font-bold">{stats.totalSpent.toLocaleString()} ريال</div>
                </div>
              </div>

              <h3 className="font-bold text-gray-900 mt-6 mb-4 flex items-center gap-2">
                <CreditCard size={18} className="text-gray-500" />
                سجل العمليات المالية
              </h3>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm text-right">
                    <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                      <tr>
                        <th className="px-3 sm:px-4 py-3 whitespace-nowrap">التاريخ</th>
                        <th className="px-3 sm:px-4 py-3 whitespace-nowrap">المبلغ</th>
                        <th className="px-3 sm:px-4 py-3 whitespace-nowrap">طريقة الدفع</th>
                        <th className="px-3 sm:px-4 py-3">الوصف</th>
                        <th className="px-3 sm:px-4 py-3">الحالة</th>
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
                            <td className="px-3 sm:px-4 py-3 font-mono text-gray-600 whitespace-nowrap">
                              {format(parseISO(payment.payment_date), 'dd/MM/yyyy')}
                            </td>
                            <td className="px-3 sm:px-4 py-3 font-bold text-gray-900 whitespace-nowrap">
                              {Number(payment.amount).toLocaleString()} ريال
                            </td>
                            <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                              <span className="bg-gray-100 px-2 py-1 rounded text-[10px] sm:text-xs text-gray-700">
                                {payment.payment_method_id || 'نقدي'}
                              </span>
                            </td>
                            <td className="px-3 sm:px-4 py-3 text-gray-600 min-w-[120px]">{payment.description || '-'}</td>
                            <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                              <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full text-[10px] sm:text-xs border border-emerald-100">
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
            </div>
          )}
          {/* CRM Tab */}
          {activeTab === 'crm' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Add Activity Form */}
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-sm lg:sticky lg:top-0">
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Plus size={18} className="text-blue-600" />
                    تسجيل نشاط جديد
                  </h3>

                  <div className="space-y-4">
                    {/* Activity Type Selection */}
                    <div>
                      <label className="text-[10px] sm:text-xs font-medium text-gray-500 mb-2 block">نوع النشاط</label>
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
                            className={`p-2 rounded-lg border text-[10px] sm:text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                              newActivityType === type.id 
                                ? `${type.color} ring-1 ring-offset-1 ring-blue-300` 
                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <type.icon size={14} className="sm:w-4 sm:h-4" />
                            {type.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Fields */}
                    <div>
                      <label className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1 block">الموضوع / العنوان</label>
                      <input
                        type="text"
                        value={newSubject}
                        onChange={(e) => setNewSubject(e.target.value)}
                        placeholder="مثال: متابعة الحجز، استفسار عن..."
                        className="w-full border border-gray-300 rounded-lg p-2 sm:p-2.5 text-xs sm:text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1 block">التفاصيل</label>
                      <textarea
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        placeholder="اكتب التفاصيل هنا..."
                        rows={3}
                        className="w-full border border-gray-300 rounded-lg p-2 sm:p-2.5 text-xs sm:text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none"
                      />
                    </div>

                    {/* Task Specific Fields */}
                    {newActivityType === 'task' && (
                      <div className="bg-red-50 p-3 rounded-lg border border-red-100 space-y-3 animate-in fade-in slide-in-from-top-2">
                        <div>
                          <label className="text-[10px] sm:text-xs font-medium text-red-800 mb-1 block">تاريخ الاستحقاق</label>
                          <input
                            type="date"
                            value={newDueDate}
                            onChange={(e) => setNewDueDate(e.target.value)}
                            className="w-full border border-red-200 rounded-lg p-2 text-xs sm:text-sm focus:ring-2 focus:ring-red-100"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] sm:text-xs font-medium text-red-800 mb-1 block">الأولوية</label>
                          <div className="flex gap-2">
                            {['low', 'medium', 'high'].map((p) => (
                              <button
                                key={p}
                                onClick={() => setNewPriority(p as any)}
                                className={`flex-1 py-1.5 rounded text-[10px] sm:text-xs font-medium border ${
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
                      className="w-full py-2 sm:py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                      {isAddingActivity ? (
                        <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <Plus size={16} className="sm:w-[18px] sm:h-[18px]" />
                          {newActivityType === 'task' ? 'إضافة المهمة' : 'حفظ النشاط'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Lists */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Pending Tasks Section */}
                {timelineEvents.some(e => e.type === 'task' && e.status === 'pending') && (
                  <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <ListTodo size={18} className="text-red-500" />
                      المهام المعلقة
                      <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-[10px] sm:text-xs">
                        {timelineEvents.filter(e => e.type === 'task' && e.status === 'pending').length}
                      </span>
                    </h3>
                    <div className="space-y-3">
                      {timelineEvents
                        .filter(e => e.type === 'task' && e.status === 'pending')
                        .map(task => (
                          <div key={task.id} className="flex items-start gap-3 p-3 bg-red-50/50 border border-red-100 rounded-lg hover:bg-red-50 transition-colors group">
                            <div className="mt-1 shrink-0">
                              <div className={`w-2 h-2 rounded-full ${
                                task.priority === 'high' ? 'bg-red-500' : 
                                task.priority === 'medium' ? 'bg-orange-500' : 'bg-blue-500'
                              }`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start gap-2">
                                <h4 className="font-bold text-gray-900 text-xs sm:text-sm truncate">{task.subject}</h4>
                                {task.due_date && (
                                  <span className={`text-[10px] flex items-center gap-1 whitespace-nowrap ${
                                    isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date)) ? 'text-red-600 font-bold' : 'text-gray-500'
                                  }`}>
                                    <CalendarClock size={10} />
                                    {format(parseISO(task.due_date), 'dd/MM/yyyy')}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] sm:text-sm text-gray-600 mt-1 line-clamp-2">{task.content}</p>
                            </div>
                            <button className="sm:opacity-0 group-hover:opacity-100 p-1.5 hover:bg-white rounded text-gray-500 transition-all shrink-0">
                              <CheckCircle size={16} />
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* History Log */}
                <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-sm">
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <History size={18} className="text-gray-500" />
                    سجل التواصل والنشاطات
                  </h3>
                  <div className="space-y-4">
                    {timelineEvents
                      .filter(e => !(e.type === 'task' && e.status === 'pending'))
                      .map((event) => (
                        <div key={event.id} className="flex gap-3 pb-4 border-b border-gray-50 last:border-0 last:pb-0">
                          <div className="mt-1 shrink-0">
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 border border-gray-100">
                              {event.type === 'call' ? <PhoneCall size={12} className="text-purple-600" /> :
                               event.type === 'whatsapp' ? <MessageCircle size={12} className="text-green-600" /> :
                               event.type === 'email' ? <Mail size={12} className="text-blue-600" /> :
                               event.type === 'task' ? <CheckSquare size={12} className="text-green-600" /> :
                               <StickyNote size={12} className="text-amber-600" />}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between gap-2">
                              <span className="text-xs sm:text-sm font-medium text-gray-900 truncate">{event.subject || event.content?.slice(0, 30)}</span>
                              <span className="text-[10px] text-gray-400 whitespace-nowrap">{formatDistanceToNow(parseISO(event.created_at), { locale: arSA })}</span>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{event.content}</p>
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