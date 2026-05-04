'use client';

import React, { useState, useEffect } from 'react';
import { Building2, Box, Layers, Plus, Search, Filter, Home, BedDouble, AlertCircle, MapPin, Phone, Calendar, DollarSign, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import HotelModal from '@/components/units/HotelModal';
import UnitTypeModal from '@/components/units/UnitTypeModal';
import UnitGeneratorModal from '@/components/units/UnitGeneratorModal';
import { useActiveHotel } from '@/hooks/useActiveHotel';

interface Unit {
  id: string;
  unit_number: string;
  floor: string;
  status: string;
  hotel_id?: string;
  cost_center_id?: string | null;
  revenue_account_id?: string | null;
  has_revenue_account?: boolean;
  hotel: { name: string };
  unit_type: { name: string };
}

interface Hotel {
  id: string;
  name: string;
  type: string;
  phone: string;
  address: string;
  description: string;
  tax_rate?: number;
  vat_rate?: number;
  cost_center_id?: string | null;
  revenue_account_id?: string | null;
  revenue_account?: { id: string; code: string; name: string } | null;
  has_revenue_account?: boolean;
}

interface UnitType {
  daily_price: any;
  annual_price: any;
  max_children: any;
  max_adults: any;
  id: string;
  name: string;
  description: string;
  price_per_night: number;
  price_per_year: number;
  area: number;
  max_occupancy: number;
  hotel: { name: string };
}

type TabType = 'units' | 'hotels' | 'unit_types';

import RoleGate from '@/components/auth/RoleGate';

export default function UnitsPage() {
  const { activeHotelId } = useActiveHotel();
  const [activeTab, setActiveTab] = useState<TabType>('units');
  
  // Data States
  const [units, setUnits] = useState<Unit[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Stats
  const [stats, setStats] = useState({
    hotels: 0,
    unitTypes: 0,
    units: 0
  });

  // Modals State
  const [showHotelModal, setShowHotelModal] = useState(false);
  const [showUnitTypeModal, setShowUnitTypeModal] = useState(false);
  const [showGeneratorModal, setShowGeneratorModal] = useState(false);
  
  const [selectedUnitType, setSelectedUnitType] = useState<UnitType | null>(null);
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);
  const [selectedHotelId, setSelectedHotelId] = useState<string>('all');
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [accountingBusyHotelId, setAccountingBusyHotelId] = useState<string | null>(null);
  const [linkHotelModalOpen, setLinkHotelModalOpen] = useState(false);
  const [linkHotelTarget, setLinkHotelTarget] = useState<Hotel | null>(null);
  const [revenueAccounts, setRevenueAccounts] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [selectedRevenueAccountId, setSelectedRevenueAccountId] = useState<string>('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkUnitsModalOpen, setLinkUnitsModalOpen] = useState(false);
  const [linkUnitsBusy, setLinkUnitsBusy] = useState(false);
  const [linkUnitsAccounts, setLinkUnitsAccounts] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [linkUnitsRows, setLinkUnitsRows] = useState<Array<{ id: string; unit_number: string; revenue_account_id: string | null }>>([]);
  const [linkUnitsSelected, setLinkUnitsSelected] = useState<Record<string, string>>({});

  const chunk = <T,>(arr: T[], size: number) => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  useEffect(() => {
    if (!activeHotelId) return;
    setSelectedHotelId(activeHotelId === 'all' ? 'all' : activeHotelId);
  }, [activeHotelId]);

  useEffect(() => {
    fetchData();
  }, [activeTab]); // Refetch when tab changes to ensure fresh data

  const fetchData = async () => {
    setLoading(true);
    await fetchStats();
    
    // Always fetch hotels to populate filter in Units tab
    await fetchHotels();

    if (activeTab === 'units') {
      await fetchUnits();
    } else if (activeTab === 'hotels') {
      // hotels already fetched
    } else if (activeTab === 'unit_types') {
      await fetchUnitTypes();
    }
    
    setLoading(false);
  };

  const fetchStats = async () => {
    const { count: hotelCount } = await supabase.from('hotels').select('*', { count: 'exact', head: true });
    const { count: typeCount } = await supabase.from('unit_types').select('*', { count: 'exact', head: true });
    const { count: unitCount } = await supabase.from('units').select('*', { count: 'exact', head: true });
    
    setStats({
      hotels: hotelCount || 0,
      unitTypes: typeCount || 0,
      units: unitCount || 0
    });
  };

  const fetchHotels = async () => {
    const preferred = await supabase
      .from('hotels')
      .select('*, revenue_account_id, revenue_account:accounts(id, code, name)')
      .order('created_at', { ascending: false });

    if (!preferred.error && preferred.data) {
      const enriched = (preferred.data as any[]).map((h: any) => ({
        ...h,
        revenue_account_id: h.revenue_account_id ?? null,
        revenue_account: (h.revenue_account as any) ?? null,
        has_revenue_account: Boolean(h.revenue_account_id),
      }));
      setHotels(enriched as any);
      return;
    }

    const fallback = await supabase.from('hotels').select('*').order('created_at', { ascending: false });
    if (fallback.data) {
      const enriched = (fallback.data as any[]).map((h: any) => ({ ...h, has_revenue_account: undefined }));
      setHotels(enriched as any);
    }
  };

  const fetchUnitTypes = async () => {
    const { data } = await supabase
      .from('unit_types')
      .select('*, hotel:hotels(name)')
      .order('created_at', { ascending: false });
      
    if (data) {
        const mappedTypes = data.map((t: any) => ({
            ...t,
            hotel: { name: t.hotel?.name || '-' }
        }));
        setUnitTypes(mappedTypes);
    }
  };

  const fetchUnits = async () => {
    const { data, error } = await supabase
      .from('units')
      .select(
        `
        id,
        hotel_id,
        unit_number,
        floor,
        status,
        cost_center_id,
        revenue_account_id,
        hotel:hotels(name),
        unit_type:unit_types(name),
        revenue_account:accounts!revenue_account_id(id, code, name)
      `
      )
      .order('hotel_id')
      .order('floor')
      .order('unit_number');

    if (error || !data) return;

    const mappedUnits = (data as any[]).map((u: any) => ({
      id: u.id,
      unit_number: u.unit_number,
      floor: u.floor,
      status: u.status,
      hotel_id: u.hotel_id,
      cost_center_id: u.cost_center_id ?? null,
      revenue_account_id: u.revenue_account_id ?? null,
      has_revenue_account: Boolean(u.revenue_account_id),
      hotel: { name: u.hotel?.name || '-' },
      unit_type: { name: u.unit_type?.name || '-' }
    }));

    setUnits(mappedUnits as any);
  };

  const openLinkHotelModal = async (hotel: Hotel) => {
    setLinkHotelTarget(hotel);
    setSelectedRevenueAccountId(hotel.revenue_account_id ? String(hotel.revenue_account_id) : '');
    setLinkHotelModalOpen(true);
    setLinkBusy(true);
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, code, name')
        .eq('type', 'revenue')
        .order('code', { ascending: true })
        .limit(2000);
      if (error) throw error;
      setRevenueAccounts((data || []).map((a: any) => ({ id: String(a.id), code: String(a.code), name: String(a.name) })));
    } catch (e: any) {
      setRevenueAccounts([]);
      alert(String(e?.message || 'تعذر تحميل دليل الحسابات'));
    } finally {
      setLinkBusy(false);
    }
  };

  const saveHotelRevenueLink = async () => {
    if (!linkHotelTarget?.id) return;
    if (!selectedRevenueAccountId) {
      alert('اختر حساباً أولاً');
      return;
    }
    setLinkBusy(true);
    try {
      const { error } = await supabase
        .from('hotels')
        .update({ revenue_account_id: selectedRevenueAccountId })
        .eq('id', linkHotelTarget.id);
      if (error) throw error;
      setLinkHotelModalOpen(false);
      setLinkHotelTarget(null);
      await fetchHotels();
      if (activeTab === 'units') await fetchUnits();
    } catch (e: any) {
      alert(String(e?.message || 'فشل ربط حساب الفندق'));
    } finally {
      setLinkBusy(false);
    }
  };

  const ensureMissingUnitRevenueAccounts = async (hotel: Hotel) => {
    if (!hotel?.id) return;
    if (!hotel.revenue_account_id) {
      alert('اربط حساب الفندق أولاً');
      return;
    }
    if (!confirm(`سيتم إنشاء حسابات إيرادات للوحدات التي لا تملك حساباً وربطها تحت حساب الفندق.\n\nالفندق: ${hotel.name}\n\nمتابعة؟`)) return;
    setAccountingBusyHotelId(hotel.id);
    try {
      const { data: unitsRows, error: uErr } = await supabase
        .from('units')
        .select('id, unit_number, revenue_account_id')
        .eq('hotel_id', hotel.id);
      if (uErr) throw uErr;
      const missing = (unitsRows || []).filter((u: any) => !u.revenue_account_id && u.unit_number).map((u: any) => ({ id: String(u.id), unit_number: String(u.unit_number) }));
      if (missing.length === 0) {
        alert('جميع وحدات الفندق مرتبطة بحسابات');
        return;
      }

      const hotelCode = hotel.revenue_account?.code ? String(hotel.revenue_account.code) : `4400-${String(hotel.id).replace(/-/g, '').slice(0, 8)}`;
      for (const u of missing) {
        const unitName = `إيرادات وحدة ${u.unit_number}`;
        const code = `${hotelCode}-${u.unit_number}`;
        const { data: created, error: accErr } = await supabase
          .from('accounts')
          .insert({ code, name: unitName, type: 'revenue', parent_id: hotel.revenue_account_id, is_active: true, is_system: false })
          .select('id')
          .maybeSingle();
        if (accErr) {
          const { data: byCode } = await supabase.from('accounts').select('id').eq('code', code).maybeSingle();
          if (!(byCode as any)?.id) throw accErr;
          const { error: uUpdErr } = await supabase.from('units').update({ revenue_account_id: String((byCode as any).id) }).eq('id', u.id);
          if (uUpdErr) throw uUpdErr;
        } else {
          const accId = (created as any)?.id ? String((created as any).id) : null;
          if (!accId) continue;
          const { error: uUpdErr } = await supabase.from('units').update({ revenue_account_id: accId }).eq('id', u.id);
          if (uUpdErr) throw uUpdErr;
        }
      }

      await fetchUnits();
      await fetchHotels();
      alert('تمت إضافة وربط الحسابات الناقصة');
    } catch (e: any) {
      alert(String(e?.message || 'فشل إنشاء حسابات الوحدات'));
    } finally {
      setAccountingBusyHotelId(null);
    }
  };

  const openLinkUnitsModal = async () => {
    if (selectedHotelId === 'all') {
      alert('اختر فندقاً محدداً من الأعلى أولاً');
      return;
    }
    if (selectedUnitIds.length === 0) {
      alert('اختر وحدات أولاً');
      return;
    }
    setLinkUnitsModalOpen(true);
    setLinkUnitsBusy(true);
    try {
      const { data: hRow, error: hErr } = await supabase
        .from('hotels')
        .select('id, name, revenue_account_id, revenue_account:accounts(id, code, name)')
        .eq('id', selectedHotelId)
        .maybeSingle();
      if (hErr) throw hErr;
      const hotelRevenueAccountId = (hRow as any)?.revenue_account_id ? String((hRow as any).revenue_account_id) : null;
      if (!hotelRevenueAccountId) {
        throw new Error('اربط حساب الفندق أولاً ثم أعد المحاولة');
      }

      const { data: unitsRows, error: uErr } = await supabase
        .from('units')
        .select('id, unit_number, revenue_account_id')
        .in('id', selectedUnitIds)
        .eq('hotel_id', selectedHotelId);
      if (uErr) throw uErr;
      const rows = (unitsRows || []).map((u: any) => ({
        id: String(u.id),
        unit_number: String(u.unit_number || ''),
        revenue_account_id: u.revenue_account_id ? String(u.revenue_account_id) : null
      })).filter((u: any) => u.id && u.unit_number);

      const { data: accRows, error: aErr } = await supabase
        .from('accounts')
        .select('id, code, name')
        .eq('parent_id', hotelRevenueAccountId)
        .order('code', { ascending: true })
        .limit(3000);
      if (aErr) throw aErr;
      const accounts = (accRows || []).map((a: any) => ({ id: String(a.id), code: String(a.code), name: String(a.name) }));

      const initial: Record<string, string> = {};
      const byNumber = new Map<string, string>();
      accounts.forEach((a) => {
        const m = String(a.name || '').match(/(\d+)/);
        if (m?.[1]) byNumber.set(m[1], a.id);
      });
      rows.forEach((r: any) => {
        if (r.revenue_account_id) {
          initial[r.id] = r.revenue_account_id;
        } else {
          const guess = byNumber.get(String(r.unit_number));
          if (guess) initial[r.id] = guess;
        }
      });

      setLinkUnitsRows(rows);
      setLinkUnitsAccounts(accounts);
      setLinkUnitsSelected(initial);
    } catch (e: any) {
      alert(String(e?.message || 'تعذر فتح ربط حسابات الوحدات'));
      setLinkUnitsModalOpen(false);
    } finally {
      setLinkUnitsBusy(false);
    }
  };

  const saveUnitsRevenueLinks = async () => {
    if (linkUnitsRows.length === 0) return;
    setLinkUnitsBusy(true);
    try {
      for (const r of linkUnitsRows) {
        const nextId = linkUnitsSelected[r.id] || '';
        if (!nextId) continue;
        if (r.revenue_account_id && String(r.revenue_account_id) === String(nextId)) continue;
        const { error } = await supabase.from('units').update({ revenue_account_id: nextId }).eq('id', r.id);
        if (error) throw error;
      }
      setLinkUnitsModalOpen(false);
      setLinkUnitsRows([]);
      setLinkUnitsAccounts([]);
      setLinkUnitsSelected({});
      await fetchUnits();
      alert('تم حفظ ربط حسابات الوحدات');
    } catch (e: any) {
      alert(String(e?.message || 'فشل حفظ ربط الوحدات'));
    } finally {
      setLinkUnitsBusy(false);
    }
  };

  const getFilteredData = () => {
    if (activeTab === 'units') {
      return units.filter(u => 
        (selectedHotelId === 'all' || u.hotel_id === selectedHotelId) &&
        (
          u.unit_number.includes(search) || 
          u.hotel.name.includes(search) || 
          u.unit_type.name.includes(search)
        )
      );
    } else if (activeTab === 'hotels') {
      return hotels.filter(h => 
        h.name.includes(search) || 
        (h.phone && h.phone.includes(search)) ||
        (h.address && h.address.includes(search))
      );
    } else {
      return unitTypes.filter(t => 
        t.name.includes(search) || 
        t.hotel.name.includes(search)
      );
    }
  };

  const filteredData = getFilteredData();
  const allFilteredUnitIds = activeTab === 'units' ? (filteredData as Unit[]).map(u => u.id) : [];
  const allSelected = allFilteredUnitIds.length > 0 && allFilteredUnitIds.every(id => selectedUnitIds.includes(id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedUnitIds([]);
    } else {
      setSelectedUnitIds(allFilteredUnitIds);
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedUnitIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const bulkDeleteUnits = async () => {
    if (selectedUnitIds.length === 0) return;
    if (!confirm(`هل أنت متأكد من حذف ${selectedUnitIds.length} وحدة محددة؟`)) return;
    try {
      // Check references in bookings to avoid FK constraint errors
      const { data: refs, error: refsError } = await supabase
        .from('bookings')
        .select('unit_id')
        .in('unit_id', selectedUnitIds);
      if (refsError) throw refsError;
      const referencedIds = Array.from(new Set((refs || []).map((r: any) => r.unit_id))).filter(Boolean);
      const deletableIds = selectedUnitIds.filter(id => !referencedIds.includes(id));

      if (deletableIds.length === 0) {
        alert('لا يمكن حذف أي من الوحدات المحددة لوجود حجوزات مرتبطة بها');
        return;
      }

      const { error } = await supabase.from('units').delete().in('id', deletableIds);
      if (error) throw error;
      await fetchStats();
      await fetchUnits();
      // Keep non-deletable (referenced) selections so يمكن مراجعتها
      setSelectedUnitIds(referencedIds);
      if (referencedIds.length > 0) {
        alert(`تم حذف ${deletableIds.length} وحدة، وتم تجاهل ${referencedIds.length} لوجود حجوزات مرتبطة بها`);
      } else {
        alert('تم حذف الوحدات المحددة بنجاح');
      }
    } catch (e: any) {
      alert(e?.message || 'فشل حذف الوحدات المحددة');
    }
  };

  return (
    <RoleGate allow={['admin']}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Home className="text-blue-600" />
            إدارة الوحدات
          </h1>
          <p className="text-gray-500 mt-1">إدارة الفنادق، نماذج الوحدات، وتوليد الوحدات الجديدة</p>
        </div>
        
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <button 
                onClick={() => setShowHotelModal(true)}
                className="flex-1 md:flex-none justify-center px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 hover:text-blue-600 hover:border-blue-200 transition-all font-medium flex items-center gap-2 shadow-sm"
            >
                <Building2 size={18} />
                <span>فندق جديد</span>
            </button>
            <button 
                onClick={() => setShowUnitTypeModal(true)}
                className="flex-1 md:flex-none justify-center px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 hover:text-purple-600 hover:border-purple-200 transition-all font-medium flex items-center gap-2 shadow-sm"
            >
                <Box size={18} />
                <span>نموذج جديد</span>
            </button>
            <button 
                onClick={() => setShowGeneratorModal(true)}
                className="flex-1 md:flex-none justify-center px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 shadow-md shadow-blue-200"
            >
                <Layers size={18} />
                <span>توليد وحدات</span>
            </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <div 
          onClick={() => setActiveTab('hotels')}
          className={`cursor-pointer p-5 rounded-xl border shadow-sm flex items-center justify-between group transition-all ${
            activeTab === 'hotels' ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-300' : 'bg-white border-gray-100 hover:border-blue-200'
          }`}
        >
            <div>
                <p className="text-sm font-medium text-gray-500 mb-1">إجمالي الفنادق</p>
                <h3 className="text-3xl font-bold text-gray-900">{stats.hotels}</h3>
            </div>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 ${
               activeTab === 'hotels' ? 'bg-blue-100 text-blue-600' : 'bg-blue-50 text-blue-600' 
            }`}>
                <Building2 size={24} />
            </div>
        </div>
        
        <div 
          onClick={() => setActiveTab('unit_types')}
          className={`cursor-pointer p-5 rounded-xl border shadow-sm flex items-center justify-between group transition-all ${
            activeTab === 'unit_types' ? 'bg-purple-50 border-purple-200 ring-1 ring-purple-300' : 'bg-white border-gray-100 hover:border-purple-200'
          }`}
        >
            <div>
                <p className="text-sm font-medium text-gray-500 mb-1">نماذج الوحدات</p>
                <h3 className="text-3xl font-bold text-gray-900">{stats.unitTypes}</h3>
            </div>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 ${
                activeTab === 'unit_types' ? 'bg-purple-100 text-purple-600' : 'bg-purple-50 text-purple-600'
            }`}>
                <Box size={24} />
            </div>
        </div>

        <div 
          onClick={() => setActiveTab('units')}
          className={`cursor-pointer p-5 rounded-xl border shadow-sm flex items-center justify-between group transition-all ${
            activeTab === 'units' ? 'bg-green-50 border-green-200 ring-1 ring-green-300' : 'bg-white border-gray-100 hover:border-green-200'
          }`}
        >
            <div>
                <p className="text-sm font-medium text-gray-500 mb-1">إجمالي الوحدات</p>
                <h3 className="text-3xl font-bold text-gray-900">{stats.units}</h3>
            </div>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 ${
                activeTab === 'units' ? 'bg-green-100 text-green-600' : 'bg-green-50 text-green-600'
            }`}>
                <BedDouble size={24} />
            </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-gray-200 bg-white rounded-t-xl px-4 pt-2">
        <button
          onClick={() => setActiveTab('units')}
          className={`px-6 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'units' 
              ? 'text-blue-600 border-b-2 border-blue-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
            الوحدات
        </button>
        <button
          onClick={() => setActiveTab('hotels')}
          className={`px-6 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'hotels' 
              ? 'text-blue-600 border-b-2 border-blue-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
            الفنادق
        </button>
        <button
          onClick={() => setActiveTab('unit_types')}
          className={`px-6 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'unit_types' 
              ? 'text-blue-600 border-b-2 border-blue-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
            نماذج الوحدات
        </button>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-b-xl rounded-tr-none border border-gray-200 shadow-sm overflow-hidden -mt-px">
        <div className="p-5 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-gray-50/50">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                {activeTab === 'units' && <Layers size={20} className="text-gray-400" />}
                {activeTab === 'hotels' && <Building2 size={20} className="text-gray-400" />}
                {activeTab === 'unit_types' && <Box size={20} className="text-gray-400" />}
                {activeTab === 'units' ? 'قائمة الوحدات' : activeTab === 'hotels' ? 'قائمة الفنادق' : 'قائمة نماذج الوحدات'}
            </h3>
            <div className="flex gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-72">
                    <Search className="absolute right-3 top-2.5 text-gray-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="بحث..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white text-gray-900"
                    />
                </div>
                {activeTab === 'units' && (
                  <>
                    <select
                      value={selectedHotelId}
                      onChange={(e) => {
                        setSelectedHotelId(e.target.value);
                        setSelectedUnitIds([]);
                      }}
                      className="p-2.5 border border-gray-200 rounded-xl bg-white text-sm text-gray-700"
                    >
                      <option value="all">كل الفنادق</option>
                      {hotels.map(h => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={openLinkUnitsModal}
                      disabled={selectedUnitIds.length === 0 || selectedHotelId === 'all'}
                      className={`p-2.5 rounded-xl transition-colors flex items-center gap-2 ${
                        (selectedUnitIds.length === 0 || selectedHotelId === 'all')
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-white text-gray-700 border border-gray-200 hover:border-blue-200 hover:text-blue-700'
                      }`}
                    >
                      ربط حسابات ({selectedUnitIds.length})
                    </button>
                    <button
                      onClick={bulkDeleteUnits}
                      disabled={selectedUnitIds.length === 0}
                      className={`p-2.5 rounded-xl transition-colors flex items-center gap-2 ${selectedUnitIds.length === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700'}`}
                    >
                      <Trash2 size={18} />
                      حذف المحدد ({selectedUnitIds.length})
                    </button>
                  </>
                )}
            </div>
        </div>

        <div className="overflow-x-auto">
            <table className="w-full text-right">
                <thead className="bg-gray-50/80 text-gray-500 text-xs uppercase tracking-wider">
                    {activeTab === 'units' && (
                        <tr>
                            <th className="px-6 py-4 font-medium">
                              <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={toggleSelectAll}
                              />
                            </th>
                            <th className="px-6 py-4 font-medium">رقم الوحدة</th>
                            <th className="px-6 py-4 font-medium">الفندق</th>
                            <th className="px-6 py-4 font-medium">النموذج</th>
                            <th className="px-6 py-4 font-medium">الدور</th>
                            <th className="px-6 py-4 font-medium">الحالة</th>
                            <th className="px-6 py-4 font-medium">الإجراءات</th>
                        </tr>
                    )}
                    {activeTab === 'hotels' && (
                        <tr>
                            <th className="px-6 py-4 font-medium">اسم الفندق</th>
                            <th className="px-6 py-4 font-medium">النوع</th>
                            <th className="px-6 py-4 font-medium">العنوان</th>
                            <th className="px-6 py-4 font-medium">الضريبة</th>
                            <th className="px-6 py-4 font-medium">الهاتف</th>
                            <th className="px-6 py-4 font-medium">الإجراءات</th>
                        </tr>
                    )}
                    {activeTab === 'unit_types' && (
                        <tr>
                            <th className="px-6 py-4 font-medium">اسم النموذج</th>
                            <th className="px-6 py-4 font-medium">الفندق التابع</th>
                            <th className="px-6 py-4 font-medium">السعر اليومي</th>
                            <th className="px-6 py-4 font-medium">السعر السنوي</th>
                            <th className="px-6 py-4 font-medium">المساحة</th>
                            <th className="px-6 py-4 font-medium">السعة</th>
                            <th className="px-6 py-4 font-medium">الإجراءات</th>
                        </tr>
                    )}
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                    {loading ? (
                        [...Array(5)].map((_, i) => (
                            <tr key={i} className="animate-pulse">
                                <td colSpan={activeTab === 'units' ? 7 : 6} className="px-6 py-4">
                                    <div className="h-4 bg-gray-100 rounded w-3/4 mx-auto"></div>
                                </td>
                            </tr>
                        ))
                    ) : filteredData.length === 0 ? (
                        <tr>
                            <td colSpan={activeTab === 'units' ? 7 : 6} className="px-6 py-12 text-center text-gray-500">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                                        <Search size={32} />
                                    </div>
                                    <p className="font-medium">لا توجد بيانات مطابقة</p>
                                </div>
                            </td>
                        </tr>
                    ) : (
                        <>
                            {activeTab === 'units' && (filteredData as Unit[]).map((unit) => (
                                <tr key={unit.id} className="hover:bg-blue-50/30 transition-colors group">
                                    <td className="px-6 py-4">
                                      <input
                                        type="checkbox"
                                        checked={selectedUnitIds.includes(unit.id)}
                                        onChange={() => toggleSelectOne(unit.id)}
                                      />
                                    </td>
                                    <td className="px-6 py-4 font-bold text-gray-900 font-mono text-base">
                                      <div className="flex items-center gap-2">
                                        <span>{unit.unit_number}</span>
                                        {unit.has_revenue_account === false && (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-100">
                                            بدون حساب إيرادات
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-700 font-medium">
                                        <div className="flex items-center gap-2">
                                            <Building2 size={14} className="text-gray-400" />
                                            {unit.hotel.name}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        <div className="flex items-center gap-2">
                                            <Box size={14} className="text-gray-400" />
                                            {unit.unit_type.name}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600 font-mono">{unit.floor}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                                            unit.status === 'available' ? 'bg-green-50 text-green-700 border-green-100' :
                                            unit.status === 'occupied' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                            'bg-gray-50 text-gray-700 border-gray-100'
                                        }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${
                                                unit.status === 'available' ? 'bg-green-500' :
                                                unit.status === 'occupied' ? 'bg-blue-500' :
                                                'bg-gray-500'
                                            }`}></span>
                                            {unit.status === 'available' ? 'متاح' : 
                                             unit.status === 'occupied' ? 'مشغول' : unit.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <button className="text-gray-400 hover:text-blue-600 font-medium text-xs transition-colors opacity-0 group-hover:opacity-100">
                                            تعديل
                                        </button>
                                    </td>
                                </tr>
                            ))}

                            {activeTab === 'hotels' && (filteredData as Hotel[]).map((hotel) => (
                                <tr key={hotel.id} className="hover:bg-blue-50/30 transition-colors group">
                                    <td className="px-6 py-4 font-bold text-gray-900">
                                      <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                          <span>{hotel.name}</span>
                                          {hotel.has_revenue_account === false && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-100">
                                              غير مرتبط بحساب
                                            </span>
                                          )}
                                        </div>
                                        {hotel.revenue_account?.code && (
                                          <div className="text-[10px] font-mono text-gray-400">
                                            {hotel.revenue_account.code} — {hotel.revenue_account.name}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">{hotel.type || '-'}</td>
                                    <td className="px-6 py-4 text-gray-600">
                                        <div className="flex items-center gap-2">
                                            <MapPin size={14} className="text-gray-400" />
                                            {hotel.address || '-'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        {(Math.round(((hotel.tax_rate ?? hotel.vat_rate ?? 0) * 100 * 100)) / 100).toLocaleString('en-US')}%
                                    </td>
                                    <td className="px-6 py-4 text-gray-600 font-mono" dir="ltr">
                                        <div className="flex items-center gap-2 justify-end">
                                            {hotel.phone}
                                            <Phone size={14} className="text-gray-400" />
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => openLinkHotelModal(hotel)}
                                                disabled={linkBusy && linkHotelTarget?.id === hotel.id}
                                                className={`text-xs font-medium transition-colors px-3 py-1.5 rounded-lg border ${
                                                  (linkBusy && linkHotelTarget?.id === hotel.id)
                                                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-200 hover:text-blue-700'
                                                }`}
                                            >
                                                ربط حساب الفندق
                                            </button>
                                            <button
                                                onClick={() => ensureMissingUnitRevenueAccounts(hotel)}
                                                disabled={accountingBusyHotelId === hotel.id}
                                                className={`text-xs font-medium transition-colors px-3 py-1.5 rounded-lg border ${
                                                  accountingBusyHotelId === hotel.id
                                                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-200 hover:text-blue-700'
                                                }`}
                                            >
                                                {accountingBusyHotelId === hotel.id ? 'جاري...' : 'إضافة حسابات الوحدات'}
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    setSelectedHotel(hotel);
                                                    setShowHotelModal(true);
                                                }}
                                                className="text-gray-400 hover:text-blue-600 font-medium text-xs transition-colors"
                                            >
                                                تعديل
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (!confirm('هل أنت متأكد من حذف هذا الفندق؟ قد يفشل الحذف إذا كانت هناك بيانات مرتبطة به.')) return;
                                                    try {
                                                        // Pre-check: deny delete if there are units or unit types referencing this hotel
                                                        const [{ count: unitsCount }, { count: typesCount }] = await Promise.all([
                                                            supabase.from('units').select('*', { count: 'exact', head: true }).eq('hotel_id', hotel.id),
                                                            supabase.from('unit_types').select('*', { count: 'exact', head: true }).eq('hotel_id', hotel.id)
                                                        ] as any);
                                                        if ((unitsCount || 0) > 0 || (typesCount || 0) > 0) {
                                                            alert('لا يمكن حذف الفندق لوجود وحدات أو نماذج مرتبطة به');
                                                            return;
                                                        }
                                                        const res = await fetch(`/api/hotels/${hotel.id}`, { method: 'DELETE' });
                                                        if (!res.ok) {
                                                            const err = await res.json().catch(() => ({}));
                                                            const msg = err?.error || 'فشل حذف الفندق';
                                                            alert(msg);
                                                            return;
                                                        }
                                                        await fetchStats();
                                                        await fetchHotels();
                                                        alert('تم حذف الفندق بنجاح');
                                                    } catch (e: any) {
                                                        const msg = e?.message || 'حدث خطأ أثناء الحذف';
                                                        alert(msg);
                                                    }
                                                }}
                                                className="text-gray-400 hover:text-red-600 font-medium text-xs transition-colors"
                                            >
                                                حذف
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}

                            {activeTab === 'unit_types' && (filteredData as UnitType[]).map((type) => (
                                <tr key={type.id} className="hover:bg-blue-50/30 transition-colors group">
                                    <td className="px-6 py-4 font-bold text-gray-900">{type.name}</td>
                                    <td className="px-6 py-4 text-gray-600">{type.hotel.name}</td>
                                    <td className="px-6 py-4 text-gray-600 font-mono">
                                        {(type.daily_price ?? type.price_per_night)?.toLocaleString()} SAR
                                    </td>
                                    <td className="px-6 py-4 text-gray-600 font-mono">
                                        {(type.annual_price ?? type.price_per_year)?.toLocaleString()} SAR
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        {type.area ? `${type.area} م²` : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        {type.max_adults ? `${type.max_adults} بالغين` : '-'}
                                        {type.max_children ? `, ${type.max_children} أطفال` : ''}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => {
                                                    setSelectedUnitType(type);
                                                    setShowUnitTypeModal(true);
                                                }}
                                                className="text-gray-400 hover:text-blue-600 font-medium text-xs transition-colors"
                                            >
                                                تعديل
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (!confirm('هل أنت متأكد من حذف هذا النموذج؟ سيتم الحذف فقط إذا لم توجد وحدات مرتبطة به.')) return;
                                                    try {
                                                        const { count, error: cntErr } = await supabase
                                                            .from('units')
                                                            .select('*', { count: 'exact', head: true })
                                                            .eq('unit_type_id', type.id);
                                                        if (cntErr) throw cntErr;
                                                        if ((count || 0) > 0) {
                                                            alert('لا يمكن حذف النموذج لوجود وحدات مرتبطة به');
                                                            return;
                                                        }
                                                        const { error } = await supabase
                                                            .from('unit_types')
                                                            .delete()
                                                            .eq('id', type.id);
                                                        if (error) throw error;
                                                        await fetchStats();
                                                        await fetchUnitTypes();
                                                        alert('تم حذف النموذج بنجاح');
                                                    } catch (e: any) {
                                                        alert(e?.message || 'فشل حذف النموذج');
                                                    }
                                                }}
                                                className="text-gray-400 hover:text-red-600 font-medium text-xs transition-colors"
                                            >
                                                حذف
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </>
                    )}
                </tbody>
            </table>
        </div>
        <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 text-xs text-gray-500 flex justify-between items-center">
            <span>عرض {filteredData.length} سجل</span>
            <div className="flex gap-2">
                <button className="px-2 py-1 rounded hover:bg-gray-200 disabled:opacity-50" disabled>السابق</button>
                <button className="px-2 py-1 rounded hover:bg-gray-200 disabled:opacity-50" disabled>التالي</button>
            </div>
        </div>
      </div>

      {/* Modals */}
      <HotelModal 
        isOpen={showHotelModal} 
        onClose={() => {
            setShowHotelModal(false);
            setSelectedHotel(null);
        }} 
        onSuccess={() => {
            fetchStats();
            if (activeTab === 'hotels') fetchHotels();
            setShowHotelModal(false);
            setSelectedHotel(null);
        }} 
        initialData={selectedHotel}
      />
      <UnitTypeModal 
        isOpen={showUnitTypeModal} 
        onClose={() => {
            setShowUnitTypeModal(false);
            setSelectedUnitType(null);
        }} 
        onSuccess={(payload) => {
            if (payload) {
                setUnitTypes(prev => prev.map(t => 
                    t.id === payload.id 
                      ? { 
                          ...t, 
                          annual_price: payload.annual_price, 
                          price_per_year: payload.annual_price, 
                          daily_price: payload.daily_price, 
                          price_per_night: payload.daily_price 
                        } 
                      : t
                ));
            }
            fetchStats();
            if (activeTab === 'unit_types') fetchUnitTypes();
            setShowUnitTypeModal(false);
            setSelectedUnitType(null);
        }} 
        initialData={selectedUnitType}
      />
      <UnitGeneratorModal 
        isOpen={showGeneratorModal} 
        onClose={() => setShowGeneratorModal(false)} 
        onSuccess={() => {
            fetchStats();
            if (activeTab === 'units') fetchUnits();
            setShowGeneratorModal(false);
        }} 
      />
      {linkHotelModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-gray-900">ربط حساب إيرادات الفندق</div>
              <button
                onClick={() => {
                  setLinkHotelModalOpen(false);
                  setLinkHotelTarget(null);
                }}
                className="text-gray-400 hover:text-gray-700"
              >
                إغلاق
              </button>
            </div>

            <div className="text-sm text-gray-600 mb-3">
              الفندق: <span className="font-bold text-gray-900">{linkHotelTarget?.name || '-'}</span>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-bold text-gray-900">اختر الحساب</label>
              <select
                value={selectedRevenueAccountId}
                onChange={(e) => setSelectedRevenueAccountId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                disabled={linkBusy}
              >
                <option value="">اختر...</option>
                {revenueAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-5">
              <button
                type="button"
                onClick={() => {
                  setLinkHotelModalOpen(false);
                  setLinkHotelTarget(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50"
                disabled={linkBusy}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={saveHotelRevenueLink}
                className="flex-1 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                disabled={linkBusy}
              >
                {linkBusy ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
      {linkUnitsModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl p-6 max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-gray-900">ربط حسابات الوحدات</div>
              <button
                onClick={() => {
                  setLinkUnitsModalOpen(false);
                  setLinkUnitsRows([]);
                  setLinkUnitsAccounts([]);
                  setLinkUnitsSelected({});
                }}
                className="text-gray-400 hover:text-gray-700"
              >
                إغلاق
              </button>
            </div>

            <div className="text-sm text-gray-600 mb-4">
              يتم عرض حسابات الوحدات تحت حساب الفندق فقط. إذا لم تظهر الحسابات، اربط حساب الفندق أولاً ثم اضغط "إضافة حسابات الوحدات".
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full text-right">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">الوحدة</th>
                    <th className="px-4 py-3 font-medium">الحساب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {linkUnitsRows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-bold text-gray-900">{r.unit_number}</td>
                      <td className="px-4 py-3">
                        <select
                          value={linkUnitsSelected[r.id] || ''}
                          onChange={(e) => setLinkUnitsSelected((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                          disabled={linkUnitsBusy}
                        >
                          <option value="">اختر...</option>
                          {linkUnitsAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} - {a.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {linkUnitsRows.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-center text-sm text-gray-500" colSpan={2}>
                        لا توجد وحدات للعرض
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3 pt-5">
              <button
                type="button"
                onClick={() => {
                  setLinkUnitsModalOpen(false);
                  setLinkUnitsRows([]);
                  setLinkUnitsAccounts([]);
                  setLinkUnitsSelected({});
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50"
                disabled={linkUnitsBusy}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={saveUnitsRevenueLinks}
                className="flex-1 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                disabled={linkUnitsBusy}
              >
                {linkUnitsBusy ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </RoleGate>
  );
}
