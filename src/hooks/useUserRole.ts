"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type UserRole = 'admin' | 'manager' | 'receptionist' | 'housekeeping' | 'accountant' | 'marketing' | null;

type RoleState = {
  role: UserRole;
  loading: boolean;
  error: Error | null;
  userId: string | null;
};

let storeState: RoleState = { role: null, loading: true, error: null, userId: null };
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

const CACHE_KEY = 'user_role_cache';
const CACHE_TS_KEY = 'user_role_cache_ts';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

const fetchRoleForCurrentUser = async (retryCount = 0) => {
  if (!roleUpdatesFrozen()) {
    setStoreState({ loading: true, error: null });
  } else {
    setStoreState({ loading: false, error: null });
  }
  try {
    const { data: sessionRes } = await withTimeout(supabase.auth.getSession(), 15000, 'auth.getSession');
    const session = sessionRes?.session ?? null;
    const user = session?.user ?? null;

    if (!user) {
      if (roleUpdatesFrozen() && storeState.role && storeState.userId) {
        setStoreState({ loading: false });
        return;
      }
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_TS_KEY);
      setStoreState({ role: null, userId: null, loading: false });
      return;
    }

    // Check Cache
    const cachedRole = localStorage.getItem(CACHE_KEY);
    const cachedTs = localStorage.getItem(CACHE_TS_KEY);
    const now = Date.now();
    if (cachedRole && cachedTs && (now - parseInt(cachedTs)) < CACHE_DURATION) {
      setStoreState({ role: normalizeRole(cachedRole), userId: user.id, loading: false });
      // Still fetch in background to keep cache fresh
      fetchRoleInBackground(user.id);
      return;
    }

    if (user.email === 'zizoalzohairy@gmail.com') {
      const role = 'admin';
      localStorage.setItem(CACHE_KEY, role);
      localStorage.setItem(CACHE_TS_KEY, now.toString());
      setStoreState({ role: 'admin', userId: user.id, loading: false });
      return;
    }

    let roleFromRpc: UserRole | null = null;
    try {
      const { data: rpcRole, error: rpcError } = await withTimeout(supabase.rpc('get_my_role_safe'), 10000, 'rpc.get_my_role_safe');
      if (!rpcError) roleFromRpc = normalizeRole(rpcRole);
    } catch {}

    if (roleFromRpc) {
      localStorage.setItem(CACHE_KEY, roleFromRpc);
      localStorage.setItem(CACHE_TS_KEY, now.toString());
      setStoreState({ role: roleFromRpc, userId: user.id, loading: false });
      return;
    }

    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle(),
      10000,
      'profiles.select.role'
    );

    if (error) throw error;
    const normalized = normalizeRole(data?.role) ?? 'receptionist';
    localStorage.setItem(CACHE_KEY, normalized);
    localStorage.setItem(CACHE_TS_KEY, now.toString());
    setStoreState({ role: normalized, userId: user.id, loading: false });
  } catch (err: any) {
    if (retryCount < 2) {
      console.warn(`Role fetch failed, retrying... (${retryCount + 1}/2)`);
      return fetchRoleForCurrentUser(retryCount + 1);
    }

    const message = String(err?.message || err);
    const name = String(err?.name || '');
    if (name === 'AbortError' || message.includes('AbortError') || message.includes('signal is aborted')) {
      setStoreState({ loading: false });
      return;
    }
    if (message.startsWith('timeout:')) {
      // If we have a cache even if expired, use it on timeout as fallback
      const fallback = localStorage.getItem(CACHE_KEY);
      if (fallback) {
        setStoreState({ role: normalizeRole(fallback), loading: false });
        return;
      }
      setStoreState({ role: null, loading: false, error: new Error('تعذر تحميل الصلاحيات حالياً. تحقق من الاتصال ثم أعد المحاولة.') });
      return;
    }
    const e = err instanceof Error ? err : new Error(message);
    setStoreState({ error: e, role: null, loading: false });
  }
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
      localStorage.setItem(CACHE_KEY, role);
      localStorage.setItem(CACHE_TS_KEY, Date.now().toString());
      if (storeState.role !== role) {
        setStoreState({ role });
      }
    }
  } catch {}
};

const initRoleStore = async () => {
  if (initialized) return;
  initialized = true;
  await fetchRoleForCurrentUser();

  if (!authSub) {
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (roleUpdatesFrozen()) {
        if (event === 'SIGNED_OUT') {
          localStorage.removeItem(CACHE_KEY);
          localStorage.removeItem(CACHE_TS_KEY);
          setStoreState({ role: null, userId: null, loading: false, error: null });
        }
        return;
      }
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_TS_KEY);
        setStoreState({ role: null, userId: null, loading: false, error: null });
        return;
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        await fetchRoleForCurrentUser();
        return;
      }
      if (event === 'TOKEN_REFRESHED') {
        const userId = session?.user?.id;
        if (userId) {
          await fetchRoleInBackground(userId);
        }
        return;
      }
      await fetchRoleForCurrentUser();
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

  return { role: snapshot.role, loading: snapshot.loading, error: snapshot.error };
}
