'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, User, Menu } from 'lucide-react';
import NotificationsMenu from './NotificationsMenu';
import UserMenu from './UserMenu';
import Logo from '@/components/Logo';
import { useUserRole } from '@/hooks/useUserRole';
import { useActiveHotel } from '@/hooks/useActiveHotel';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  onMenuClick?: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { role } = useUserRole();
  const isHousekeeping = role === 'housekeeping';
  const isAdmin = role === 'admin';
  const { activeHotelId, setActiveHotelId } = useActiveHotel();
  const router = useRouter();
  const [hotels, setHotels] = useState<Array<{ id: string; name: string }>>([]);
  const [hotelsLoading, setHotelsLoading] = useState(false);
  const initRef = useRef(false);

  const activeHotelValue = useMemo(() => {
    if (!activeHotelId) return isAdmin ? 'all' : '';
    if (activeHotelId === 'all') return 'all';
    return activeHotelId;
  }, [activeHotelId, isAdmin]);

  function readLocalActiveHotel() {
    try {
      const v = localStorage.getItem('active_hotel_id');
      return v || null;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    const load = async () => {
      if (!role) return;
      setHotelsLoading(true);
      try {
        if (isAdmin) {
          const { data, error } = await supabase
            .from('hotels')
            .select('id, name')
            .order('name', { ascending: true });
          if (error) throw error;
          setHotels((data || []) as any);
          if (!initRef.current) {
            initRef.current = true;
            if (!readLocalActiveHotel()) setActiveHotelId('all');
          }
          return;
        }

        const { data: idsRaw, error: idsErr } = await supabase.rpc('get_my_hotels');
        if (idsErr) throw idsErr;

        const ids = Array.isArray(idsRaw)
          ? (idsRaw as any[])
              .map((x) => (typeof x === 'string' ? x : (x?.hotel_id ?? x?.id ?? null)))
              .filter((x) => typeof x === 'string' && x.length > 0)
          : [];

        if (ids.length === 0) {
          setHotels([]);
          return;
        }

        const { data: hotelRows, error: hErr } = await supabase
          .from('hotels')
          .select('id, name')
          .in('id', ids)
          .order('name', { ascending: true });
        if (hErr) throw hErr;
        setHotels((hotelRows || []) as any);

        if (!initRef.current) {
          initRef.current = true;
          const local = readLocalActiveHotel();
          const localOk = local && local !== 'all' && ids.includes(local);
          if (localOk) return;

          const { data: defId, error: defErr } = await supabase.rpc('get_my_default_hotel');
          if (!defErr && defId && typeof defId === 'string' && ids.includes(defId)) {
            setActiveHotelId(defId);
            return;
          }

          setActiveHotelId(ids[0]);
        }
      } catch {
        setHotels([]);
      } finally {
        setHotelsLoading(false);
      }
    };
    load();
  }, [role, isAdmin, setActiveHotelId]);

  const handleHotelChange = async (value: string) => {
    if (!role) return;
    if (isAdmin) {
      setActiveHotelId(value === 'all' ? 'all' : value);
      router.refresh();
      return;
    }
    if (!value) return;
    setActiveHotelId(value);
    try {
      await supabase.rpc('set_my_default_hotel', { p_hotel_id: value });
    } catch {}
    router.refresh();
  };

  return (
    <header className="h-16 bg-white/90 lg:bg-white/75 supports-[backdrop-filter]:backdrop-blur-md flex items-center justify-between px-4 md:px-6 sticky top-0 z-20 shadow-sm ring-1 ring-emerald-100/60">
      <div className="flex items-center gap-3 md:gap-4 lg:w-[28rem]">
        <Logo className="w-8 h-8 object-contain" alt="Logo" />
        {onMenuClick && (
          <button 
            onClick={onMenuClick}
            className="lg:hidden p-2 -ml-2 text-emerald-900 hover:bg-emerald-50 rounded-md"
          >
            <Menu size={24} />
          </button>
        )}
        <div className="relative w-full hidden sm:block">
          <Search className="absolute right-3 top-2.5 text-emerald-700" size={18} />
          <input 
            type="text" 
            placeholder="بحث عن حجز، ضيف، أو فاتورة..." 
            className="w-full pr-10 pl-4 py-2 border border-emerald-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-sans transition-all lg:py-2.5 bg-white"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        {role && (
          <div className="hidden md:flex items-center gap-2">
            <div className="text-[11px] font-extrabold text-emerald-900">الفرع</div>
            <select
              value={activeHotelValue}
              onChange={(e) => handleHotelChange(e.target.value)}
              disabled={hotelsLoading || (!isAdmin && hotels.length === 0)}
              className="h-9 px-3 rounded-lg border border-emerald-200 bg-white text-sm font-extrabold text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:opacity-60"
            >
              {isAdmin && <option value="all">كل الفنادق</option>}
              {!isAdmin && hotels.length === 0 ? <option value="">لا توجد صلاحية فروع</option> : null}
              {hotels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {!isHousekeeping && <NotificationsMenu />}
        <UserMenu />
      </div>
    </header>
  );
}
