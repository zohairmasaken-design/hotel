'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { 
  Search, 
  Plus, 
  User, 
  Building2, 
  Globe, 
  Briefcase, 
  Filter,
  MoreVertical,
  Phone,
  Mail,
  MapPin,
  FileText,
  Edit,
  MessageCircle,
  X,
  Calendar,
  CheckCircle,
  StickyNote,
  CheckSquare,
  Users,
  PhoneCall,
   Clock,
   AlertCircle,
   History
 } from 'lucide-react';
import { CustomerModal, Customer as CustomerType, CustomerType as CustomerTypeEnum } from '@/components/customers/CustomerModal';
import CustomerProfile360 from '@/components/customers/CustomerProfile360';

// Types (Reusing from Modal)
type Customer = CustomerType;

const CUSTOMER_TYPES: { id: CustomerTypeEnum | 'all'; label: string; icon: any }[] = [
  { id: 'all', label: 'الكل', icon: User },
  { id: 'individual', label: 'أفراد', icon: User },
  { id: 'company', label: 'شركات', icon: Building2 },
  { id: 'platform', label: 'منصات', icon: Globe },
  { id: 'broker', label: 'وسطاء', icon: Briefcase },
];

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<CustomerTypeEnum | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'list' | 'crm' | 'segments'>('list');
  const [crmEvents, setCrmEvents] = useState<any[]>([]);
  const [crmType, setCrmType] = useState<string>('all');
  const [crmCustomerId, setCrmCustomerId] = useState<string>('');
  const [crmText, setCrmText] = useState<string>('');
  const [crmSubject, setCrmSubject] = useState<string>('');
  const [crmEventType, setCrmEventType] = useState<'note' | 'call' | 'whatsapp' | 'email' | 'meeting' | 'task'>('note');
  const [crmPriority, setCrmPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [crmDueDate, setCrmDueDate] = useState<string>('');
  const [stages, setStages] = useState<Record<string, string>>({});
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | undefined>(undefined);
  const [activeCustomerIds, setActiveCustomerIds] = useState<string[]>([]);
  const [onlyActive, setOnlyActive] = useState(false);
  const [selectedProfileCustomer, setSelectedProfileCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    fetchCustomers();
  }, [selectedType, searchQuery]);

  useEffect(() => {
    fetchActiveCustomers();
  }, []);

  useEffect(() => {
    if (activeTab === 'crm') {
      loadCrmEvents();
    }
    if (activeTab === 'segments') {
      loadStages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, customers]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (selectedType !== 'all') {
        query = query.eq('customer_type', selectedType);
      }

      if (searchQuery) {
        query = query.or(`full_name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,national_id.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      // @ts-ignore
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('customer_id, status')
        .in('status', ['checked_in', 'confirmed']);

      if (error) throw error;

      const ids = Array.from(
        new Set(
          (data || [])
            .map((b: any) => b.customer_id)
            .filter((id: string | null) => !!id)
        )
      ) as string[];

      setActiveCustomerIds(ids);
    } catch (error) {
      console.error('Error fetching active customers:', error);
    }
  };

  const loadCrmEvents = async () => {
    let query = supabase
      .from('crm_activities')
      .select('*, customer:customers(full_name)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (crmType && crmType !== 'all') query = query.eq('activity_type', crmType);
    if (crmCustomerId) query = query.eq('customer_id', crmCustomerId);
    
    const { data, error } = await query;
    if (error) {
      console.error('Error fetching CRM activities:', error);
      return;
    }
    setCrmEvents(data || []);
  };

  const addCrmEvent = async () => {
    if (!crmCustomerId || (!crmText.trim() && !crmSubject.trim())) return;
    
    const { error } = await supabase.from('crm_activities').insert({
      customer_id: crmCustomerId,
      activity_type: crmEventType,
      subject: crmSubject || (crmEventType === 'note' ? 'ملاحظة سريعة' : 'تواصل جديد'),
      description: crmText,
      status: crmEventType === 'task' ? 'pending' : 'completed',
      priority: crmEventType === 'task' ? crmPriority : null,
      due_date: crmEventType === 'task' && crmDueDate ? new Date(crmDueDate).toISOString() : null,
      created_at: new Date().toISOString()
    });

    if (error) {
      console.error('Error adding activity:', error);
      alert('حدث خطأ أثناء إضافة النشاط. تأكد من تشغيل سكربت قاعدة البيانات الجديد.');
      return;
    }

    setCrmText('');
    setCrmSubject('');
    setCrmDueDate('');
    setCrmPriority('medium');
    await loadCrmEvents();
  };

  const loadStages = async () => {
    const ids = customers.map((c) => c.id);
    if (ids.length === 0) {
      setStages({});
      return;
    }
    const { data } = await supabase
      .from('system_events')
      .select('id, customer_id, payload, created_at')
      .eq('event_type', 'crm_stage')
      .in('customer_id', ids)
      .order('created_at', { ascending: false });
    const map: Record<string, string> = {};
    (data || []).forEach((e: any) => {
      if (!map[e.customer_id] && e.payload?.stage) {
        map[e.customer_id] = e.payload.stage;
      }
    });
    setStages(map);
  };

  const setStage = async (customerId: string, stage: string) => {
    await supabase.from('system_events').insert({
      event_type: 'crm_stage',
      customer_id: customerId,
      message: `Stage set to ${stage}`,
      payload: { stage }
    });
    setStages((prev) => ({ ...prev, [customerId]: stage }));
  };

  const handleEdit = (customer: Customer) => {
    setCustomerToEdit(customer);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setCustomerToEdit(undefined);
    setIsModalOpen(true);
  };

  const handleOpenProfile = (customer: Customer) => {
    setSelectedProfileCustomer(customer);
  };

  const getCustomerIcon = (type: CustomerTypeEnum) => {
    switch (type) {
      case 'company': return <Building2 className="text-purple-500" size={20} />;
      case 'platform': return <Globe className="text-blue-500" size={20} />;
      case 'broker': return <Briefcase className="text-orange-500" size={20} />;
      default: return <User className="text-gray-500" size={20} />;
    }
  };

  const getCustomerLabel = (type: CustomerTypeEnum) => {
    const found = CUSTOMER_TYPES.find(t => t.id === type);
    return found ? found.label : type;
  };

  const activeSet = new Set(activeCustomerIds);
  const filteredCustomers = customers.filter((customer) => {
    if (onlyActive && !activeSet.has(customer.id)) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إدارة العملاء والضيوف</h1>
          <p className="text-gray-500 mt-1">قائمة بجميع العملاء والشركات والمنصات المسجلة</p>
        </div>
        <button 
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
          onClick={handleAdd}
        >
          <Plus size={20} />
          <span>عميل جديد</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-4 py-2 rounded-lg border text-sm ${activeTab === 'list' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-700 border-gray-200'}`}
        >
          العملاء
        </button>
        <button
          onClick={() => setActiveTab('crm')}
          className={`px-4 py-2 rounded-lg border text-sm ${activeTab === 'crm' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-700 border-gray-200'}`}
        >
          تواصل
        </button>
        <button
          onClick={() => setActiveTab('segments')}
          className={`px-4 py-2 rounded-lg border text-sm ${activeTab === 'segments' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-700 border-gray-200'}`}
        >
          نوع العميل
        </button>
      </div>

      {activeTab === 'list' && (
      <>
      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex-1 relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="بحث بالاسم، رقم الجوال، أو الهوية..."
            className="w-full pr-10 pl-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
          {CUSTOMER_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => setSelectedType(type.id as CustomerTypeEnum | 'all')}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-all
                ${selectedType === type.id 
                  ? 'bg-blue-50 text-blue-600 font-bold ring-1 ring-blue-200' 
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }
              `}
            >
              <type.icon size={16} />
              {type.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setOnlyActive(false)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
            !onlyActive ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-600 border-gray-200'
          }`}
        >
          كل العملاء
        </button>
        <button
          onClick={() => setOnlyActive(true)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1 ${
            onlyActive ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-600 border-gray-200'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-green-500"></span>
          العملاء النشطين
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="text-gray-400" size={32} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">لا يوجد عملاء</h3>
          <p className="text-gray-500 mt-2">لم يتم العثور على أي عملاء مطابقين للبحث</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredCustomers.map((customer) => (
            <div
              key={customer.id}
              className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow group relative cursor-pointer"
              onClick={() => handleOpenProfile(customer)}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                    {getCustomerIcon(customer.customer_type)}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 line-clamp-1">{customer.full_name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 inline-block">
                        {getCustomerLabel(customer.customer_type)}
                      </span>
                      {activeSet.has(customer.id) && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                          نشط
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(customer);
                  }}
                  className="text-gray-400 hover:text-blue-600 p-1 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Edit size={16} />
                </button>
              </div>

              <div className="space-y-2.5 text-sm text-gray-500">
                {customer.phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="text-gray-400" />
                    <span dir="ltr">{customer.phone}</span>
                  </div>
                )}
                {customer.national_id && (
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-gray-400" />
                    <span>{customer.national_id}</span>
                  </div>
                )}
                {customer.email && (
                  <div className="flex items-center gap-2">
                    <Mail size={14} className="text-gray-400" />
                    <span className="truncate">{customer.email}</span>
                  </div>
                )}
                {customer.nationality && (
                  <div className="flex items-center gap-2">
                    <Globe size={14} className="text-gray-400" />
                    <span>{customer.nationality}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {customer.phone && (
                  <>
                    <a
                      href={`tel:${customer.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100"
                    >
                      <Phone size={14} />
                      اتصال
                    </a>
                    <a
                      href={`https://wa.me/${String(customer.phone).replace(/\D/g, '').replace(/^0/, '966')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100"
                    >
                      <MessageCircle size={14} />
                      واتساب
                    </a>
                  </>
                )}
                {customer.email && (
                  <a
                    href={`mailto:${customer.email}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    <Mail size={14} />
                    إيميل
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}

      {activeTab === 'crm' && (
        <div className="space-y-6">
          {/* Add New Activity Section */}
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">تسجيل نشاط جديد</h3>
            
            <div className="space-y-4">
              {/* Type Selection */}
              <div className="flex flex-wrap gap-2">
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
                    onClick={() => setCrmEventType(type.id as any)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium flex items-center gap-2 transition-all ${
                      crmEventType === type.id 
                        ? `${type.color} ring-1 ring-offset-1 ring-blue-300` 
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <type.icon size={16} />
                    {type.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Customer Select */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">العميل</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    value={crmCustomerId}
                    onChange={(e) => setCrmCustomerId(e.target.value)}
                  >
                    <option value="">اختر العميل...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.full_name}</option>
                    ))}
                  </select>
                </div>

                {/* Subject */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">العنوان</label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    placeholder="عنوان النشاط..."
                    value={crmSubject}
                    onChange={(e) => setCrmSubject(e.target.value)}
                  />
                </div>
              </div>

              {/* Task Specific Fields */}
              {crmEventType === 'task' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1.5 block">تاريخ الاستحقاق</label>
                    <input
                      type="date"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      value={crmDueDate}
                      onChange={(e) => setCrmDueDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1.5 block">الأولوية</label>
                    <div className="flex bg-white rounded-lg border border-gray-200 p-1">
                      {['low', 'medium', 'high', 'urgent'].map((p) => (
                        <button
                          key={p}
                          onClick={() => setCrmPriority(p as any)}
                          className={`flex-1 text-xs py-1.5 rounded-md capitalize transition-colors ${
                            crmPriority === p 
                              ? 'bg-blue-100 text-blue-700 font-medium' 
                              : 'text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {p === 'low' ? 'منخفض' : p === 'medium' ? 'متوسط' : p === 'high' ? 'عالي' : 'عاجل'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">التفاصيل</label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  placeholder="اكتب تفاصيل النشاط..."
                  value={crmText}
                  onChange={(e) => setCrmText(e.target.value)}
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={addCrmEvent}
                  disabled={!crmCustomerId || (!crmText && !crmSubject)}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  حفظ النشاط
                </button>
              </div>
            </div>
          </div>

          {/* Activities List */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">سجل النشاطات الأخيرة</h3>
              <div className="flex gap-2">
                <select
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white"
                  value={crmType}
                  onChange={(e) => { setCrmType(e.target.value); loadCrmEvents(); }}
                >
                  <option value="all">كل الأنشطة</option>
                  <option value="note">ملاحظات</option>
                  <option value="call">مكالمات</option>
                  <option value="whatsapp">واتساب</option>
                  <option value="email">بريد</option>
                  <option value="meeting">اجتماعات</option>
                  <option value="task">مهام</option>
                </select>
                <button
                  onClick={loadCrmEvents}
                  className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500"
                >
                  <History size={16} />
                </button>
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              {crmEvents.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <StickyNote className="text-gray-400" size={24} />
                  </div>
                  <p>لا توجد نشاطات مسجلة</p>
                </div>
              ) : (
                crmEvents.map((e) => (
                  <div key={e.id} className="p-4 hover:bg-gray-50 transition-colors group">
                    <div className="flex gap-4">
                      {/* Icon */}
                      <div className="mt-1 shrink-0">
                        <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100">
                          {e.activity_type === 'call' ? <PhoneCall size={18} className="text-purple-600" /> :
                           e.activity_type === 'whatsapp' ? <MessageCircle size={18} className="text-green-600" /> :
                           e.activity_type === 'email' ? <Mail size={18} className="text-blue-600" /> :
                           e.activity_type === 'task' ? <CheckSquare size={18} className="text-red-600" /> :
                           e.activity_type === 'meeting' ? <Users size={18} className="text-orange-600" /> :
                           <StickyNote size={18} className="text-amber-600" />}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                              {e.subject || 'بدون عنوان'}
                              <span className="text-xs font-normal text-gray-500 px-2 py-0.5 bg-gray-100 rounded-full">
                                {e.customer?.full_name}
                              </span>
                            </h4>
                            <p className="text-xs text-gray-500 mt-1">
                              {formatDistanceToNow(parseISO(e.created_at), { locale: arSA, addSuffix: true })}
                              {' • '}
                              {new Date(e.created_at).toLocaleDateString('ar-SA')}
                            </p>
                          </div>
                          
                          {/* Task Status Badge */}
                          {e.activity_type === 'task' && (
                            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                              e.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' :
                              e.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-gray-50 text-gray-600 border-gray-200'
                            }`}>
                              {e.status === 'completed' ? 'مكتملة' : 'معلقة'}
                            </span>
                          )}
                        </div>

                        {e.description && (
                          <p className="text-sm text-gray-700 mt-2 whitespace-pre-line line-clamp-3 group-hover:line-clamp-none transition-all">
                            {e.description}
                          </p>
                        )}

                        {/* Task Details */}
                        {e.activity_type === 'task' && e.due_date && (
                          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Calendar size={14} />
                              <span>الاستحقاق: {new Date(e.due_date).toLocaleDateString('ar-SA')}</span>
                            </div>
                            {e.priority && (
                              <div className="flex items-center gap-1 text-xs">
                                <AlertCircle size={14} className={
                                  e.priority === 'high' || e.priority === 'urgent' ? 'text-red-500' : 'text-gray-400'
                                } />
                                <span className="text-gray-500">
                                  أولوية: {e.priority === 'low' ? 'منخفضة' : e.priority === 'medium' ? 'متوسطة' : e.priority === 'high' ? 'عالية' : 'عاجلة'}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'segments' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-gray-500 px-2 py-1">اختر مرحلة لكل عميل: محتمل، مهتم، عميل، عميل مميز</span>
          </div>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="border border-gray-100 rounded-xl overflow-hidden bg-white">
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">العميل</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">نوع الحساب</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">مرحلة CRM</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr key={c.id} className="border-b border-gray-50">
                        <td className="px-4 py-2 text-gray-900">{c.full_name}</td>
                        <td className="px-4 py-2 text-gray-700">
                          {CUSTOMER_TYPES.find(t => t.id === c.customer_type)?.label || c.customer_type}
                        </td>
                        <td className="px-4 py-2">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
                            {stages[c.id] === 'lead' ? 'محتمل' :
                             stages[c.id] === 'prospect' ? 'مهتم' :
                             stages[c.id] === 'vip' ? 'عميل مميز' :
                             stages[c.id] === 'customer' ? 'عميل' : 'غير محدد'}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => setStage(c.id, 'lead')} className="px-2 py-1 rounded-lg text-xs border bg-white hover:bg-gray-50">محتمل</button>
                            <button onClick={() => setStage(c.id, 'prospect')} className="px-2 py-1 rounded-lg text-xs border bg-white hover:bg-gray-50">مهتم</button>
                            <button onClick={() => setStage(c.id, 'customer')} className="px-2 py-1 rounded-lg text-xs border bg-white hover:bg-gray-50">عميل</button>
                            <button onClick={() => setStage(c.id, 'vip')} className="px-2 py-1 rounded-lg text-xs border bg-white hover:bg-gray-50">عميل مميز</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <CustomerModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          fetchCustomers();
        }}
        // @ts-ignore
        customerToEdit={customerToEdit}
      />
      {selectedProfileCustomer && (
        <CustomerProfile360
          customer={selectedProfileCustomer}
          onClose={() => setSelectedProfileCustomer(null)}
          onEdit={() => {
            setSelectedProfileCustomer(null);
            handleEdit(selectedProfileCustomer);
          }}
        />
      )}
    </div>
  );
}
