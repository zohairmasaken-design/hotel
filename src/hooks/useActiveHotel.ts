import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'active_hotel_id';
const CHANGE_EVENT = 'active_hotel_changed';

type ActiveHotelId = string | 'all' | null;

const readActiveHotelId = (): ActiveHotelId => {
  try {
    if (typeof window === 'undefined') return null;
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (!v) return null;
    if (v === 'all') return 'all';
    return v;
  } catch {
    return null;
  }
};

export function useActiveHotel() {
  const [activeHotelId, setActiveHotelIdState] = useState<ActiveHotelId>(null);

  useEffect(() => {
    setActiveHotelIdState(readActiveHotelId());
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setActiveHotelIdState(readActiveHotelId());
    };
    const onCustom = () => {
      setActiveHotelIdState(readActiveHotelId());
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(CHANGE_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(CHANGE_EVENT, onCustom as EventListener);
    };
  }, []);

  const setActiveHotelId = useCallback((value: ActiveHotelId) => {
    try {
      if (typeof window === 'undefined') return;
      if (!value) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, value);
      }
      if (!value) {
        document.cookie = `${STORAGE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
      } else {
        const maxAge = 60 * 60 * 24 * 365;
        document.cookie = `${STORAGE_KEY}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
      setActiveHotelIdState(value);
    } catch {}
  }, []);

  return { activeHotelId, setActiveHotelId };
}
