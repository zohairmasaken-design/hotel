"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type UserRole = 'admin' | 'manager' | 'receptionist' | 'housekeeping' | 'accountant' | 'marketing' | null;

export type AuthState = 'unknown' | 'signed_in' | 'signed_out';

type RoleState = {
  role: UserRole;
  loading: boolean;
  error: Error | null;
  userId: string | null;
  authState: AuthState;
};

let storeState: RoleState = { role: null, loading: true, error: null, userId: null, authState: 'unknown' };
const listeners = new Set<() => void>();
let initialized = false;
let initPromise: Promise<void> | null = null;
let authSub: { unsubscribe: () => void } | null = null;

const roleUpdatesFrozen = () => {
  try {
    return typeof window !== 'undefined' && Boolean((window as any).__freeze_role_updates);
  } catch {
    return false;
  }
};

const emit = () => {
  listeners.forEach((l) => l());
};

const setStoreState = (patch: Partial<RoleState>) => {
  storeState = { ...storeState, ...patch };
  emit();
};

const normalizeRole = (role: unknown): UserRole => {
  if (role === 'admin' || role === 'manager' || role === 'receptionist' || role === 'housekeeping' || role === 'accountant' || role === 'marketing') return role;
  return null;
};

const withTimeout = async <T>(promiseLike: PromiseLike<T>, ms: number, label: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
  });
  try {
    return await Promise.race([Promise.resolve(promiseLike), timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const CACHE_KEY_PREFIX = 'user_role_';
const CACHE_TS_KEY_PREFIX = 'user_role_ts_';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

let activeFetchPromise: Promise<void> | null = null;

const fetchRoleForCurrentUser = async (retryCount = 0): Promise<void> => {
  // 1. SINGLETON & THROTTLE: Don't fetch if already fetching or if fetched very recently
  if (activeFetchPromise && retryCount === 0) return activeFetchPromise;
  
  // EXTRA SAFETY: If we are in an iframe wizard, be very conservative about triggering updates
  // that could cause parent re-renders and iframe reloads
  const isWizardActive = typeof window !== 'undefined' && sessionStorage.getItem('is_booking_wizard_active') === 'true';
  
  const now = Date.now();
  const cacheTs = storeState.userId ? localStorage.getItem(`${CACHE_TS_KEY_PREFIX}${storeState.userId}`) : null;
  
  // If we have a role and it's recently fetched, OR if wizard is active and we have ANY role, don't re-fetch
  const threshold = isWizardActive ? 120000 : 30000; // 2 minutes if wizard is active, else 30s
  if (storeState.role && cacheTs && (now - parseInt(cacheTs)) < threshold && retryCount === 0) {
    return;
  }

  const performFetch = async (): Promise<void> => {
    // Only set loading if we don't have a role yet to prevent UI flickering
    if (!storeState.role && !roleUpdatesFrozen()) {
      setStoreState({ loading: true, error: null });
    }

    try {
      // 2. FAST SESSION CHECK: Try getSession first for immediate response
      const { data: { session } } = await supabase.auth.getSession();
      let user = session?.user ?? null;

      // 3. SECURE FALLBACK: If session is null but it might be just loading, use getUser()
      if (!user) {
        const { data: { user: verifiedUser } } = await supabase.auth.getUser();
        user = verifiedUser;
      }

      if (!user) {
        // Give the client a grace window on first load to rehydrate session from storage.
        if (retryCount === 0 && storeState.authState === 'unknown') {
          await new Promise(res => setTimeout(res, 1500));
          const { data: { session: retrySession } } = await supabase.auth.getSession();
          const retryUser = retrySession?.user ?? (await supabase.auth.getUser()).data.user ?? null;
          if (retryUser) {
            activeFetchPromise = null;
            return fetchRoleForCurrentUser(1);
          }
        }

        // Confirmed signed out (do NOT clear role caches here; only on SIGNED_OUT event).
        setStoreState({ role: null, userId: null, loading: false, error: null, authState: 'signed_out' });
        return;
      }

      const cacheKey = `${CACHE_KEY_PREFIX}${user.id}`;
      const cacheTsKey = `${CACHE_TS_KEY_PREFIX}${user.id}`;

      // 4. SWR LOGIC: Use cache immediately if available
      const cachedRole = localStorage.getItem(cacheKey);
      const cachedTs = localStorage.getItem(cacheTsKey);
      const now = Date.now();
      
      if (cachedRole) {
        const normalized = normalizeRole(cachedRole);
        if (storeState.role !== normalized || storeState.userId !== user.id) {
          setStoreState({ role: normalized, userId: user.id, authState: 'signed_in' });
        }
        
        // If cache is fresh, we're done
        if (cachedTs && (now - parseInt(cachedTs)) < CACHE_DURATION) {
          setStoreState({ loading: false, authState: 'signed_in' });
          // Background revalidation
          fetchRoleInBackground(user.id);
          return;
        }
      }

      // 5. RPC REVALIDATION: Single source of truth
      let roleFromRpc: UserRole | null = null;
      try {
        const { data: rpcRole, error: rpcError } = await withTimeout(supabase.rpc('get_my_role_safe'), 8000, 'rpc.get_my_role_safe');
        if (!rpcError) roleFromRpc = normalizeRole(rpcRole);
      } catch (e) {
        console.error("RPC role fetch error:", e);
      }

      if (roleFromRpc) {
        localStorage.setItem(cacheKey, roleFromRpc);
        localStorage.setItem(cacheTsKey, now.toString());
        setStoreState({ role: roleFromRpc, userId: user.id, loading: false, authState: 'signed_in' });
        return;
      }

      // 6. FINAL FALLBACK: Direct table query
      const { data, error } = await withTimeout(
        supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
        8000,
        'profiles.select.role'
      );

      if (error) throw error;
      const finalRole = normalizeRole(data?.role) ?? 'receptionist';
      localStorage.setItem(cacheKey, finalRole);
      localStorage.setItem(cacheTsKey, now.toString());
      setStoreState({ role: finalRole, userId: user.id, loading: false, authState: 'signed_in' });

    } catch (err: any) {
      const message = String(err?.message || err);
      const name = String(err?.name || '');

      if (name === 'AbortError' || message.includes('AbortError') || message.includes('signal is aborted')) {
        setStoreState({ loading: false });
        return;
      }

      if (retryCount < 2) {
        const delay = (retryCount + 1) * 1000;
        setTimeout(() => fetchRoleForCurrentUser(retryCount + 1), delay);
        return;
      }

      if (message.includes('timeout')) {
        const cached = storeState.userId ? localStorage.getItem(`${CACHE_KEY_PREFIX}${storeState.userId}`) : null;
        if (cached) {
          setStoreState({ role: normalizeRole(cached), loading: false });
        } else {
          setStoreState({ loading: false, error: new Error('تحقق من اتصالك بالإنترنت.') });
        }
      } else {
        setStoreState({ loading: false, error: err instanceof Error ? err : new Error(message) });
      }
    } finally {
      activeFetchPromise = null;
    }
  };

  activeFetchPromise = performFetch();
  return activeFetchPromise;
};

const fetchRoleInBackground = async (userId: string) => {
  try {
    const { data: rpcRole, error: rpcError } = await supabase.rpc('get_my_role_safe');
    let role: UserRole | null = null;
    if (!rpcError) {
      role = normalizeRole(rpcRole);
    } else {
      const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
      role = normalizeRole(data?.role);
    }
    
    if (role) {
      localStorage.setItem(`${CACHE_KEY_PREFIX}${userId}`, role);
      localStorage.setItem(`${CACHE_TS_KEY_PREFIX}${userId}`, Date.now().toString());
      if (storeState.role !== role) {
        setStoreState({ role });
      }
    }
  } catch {}
};

const initRoleStore = async () => {
  if (initialized) return;
  initialized = true;
  
  // Initial fetch
  await fetchRoleForCurrentUser();

  if (!authSub) {
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      const userId = session?.user?.id;

      if (event === 'SIGNED_OUT') {
        // Clear all role caches when signed out
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith(CACHE_KEY_PREFIX) || key.startsWith(CACHE_TS_KEY_PREFIX)) {
            localStorage.removeItem(key);
          }
        });
        setStoreState({ role: null, userId: null, loading: false, error: null, authState: 'signed_out' });
        return;
      }
      
      // If wizard is active, we IGNORE auth changes to prevent parent re-renders
      // that close the modal prematurely
      if (roleUpdatesFrozen() || (typeof window !== 'undefined' && sessionStorage.getItem('is_booking_wizard_active') === 'true')) {
        return;
      }
      
      // Only trigger full fetch for critical events to avoid loops
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setStoreState({ authState: 'signed_in' });
        await fetchRoleForCurrentUser();
      } else if (event === 'TOKEN_REFRESHED' && userId) {
        setStoreState({ authState: 'signed_in' });
        await fetchRoleInBackground(userId);
      }
    });
    authSub = { unsubscribe: () => data?.subscription?.unsubscribe() };
  }
};

export function useUserRole() {
  const [snapshot, setSnapshot] = useState<RoleState>(storeState);

  useEffect(() => {
    const listener = () => setSnapshot(storeState);
    listeners.add(listener);

    if (!initialized) {
      initPromise = initPromise ?? initRoleStore();
      void initPromise;
    }

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { role: snapshot.role, loading: snapshot.loading, error: snapshot.error, authState: snapshot.authState };
}
