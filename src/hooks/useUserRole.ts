"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type UserRole = 'admin' | 'manager' | 'receptionist' | 'housekeeping' | null;

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

const emit = () => {
  listeners.forEach((l) => l());
};

const setStoreState = (patch: Partial<RoleState>) => {
  storeState = { ...storeState, ...patch };
  emit();
};

const normalizeRole = (role: unknown): UserRole => {
  if (role === 'admin' || role === 'manager' || role === 'receptionist' || role === 'housekeeping') return role;
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

const fetchRoleForCurrentUser = async () => {
  setStoreState({ loading: true, error: null });
  try {
    const { data: userRes } = await withTimeout(supabase.auth.getUser(), 6000, 'auth.getUser');
    const user = userRes?.user ?? null;

    if (!user) {
      setStoreState({ role: null, userId: null, loading: false });
      return;
    }

    if (user.email === 'zizoalzohairy@gmail.com') {
      setStoreState({ role: 'admin', userId: user.id, loading: false });
      return;
    }

    let roleFromRpc: UserRole | null = null;
    try {
      const { data: rpcRole, error: rpcError } = await withTimeout(supabase.rpc('get_my_role_safe'), 6000, 'rpc.get_my_role_safe');
      if (!rpcError) roleFromRpc = normalizeRole(rpcRole);
    } catch {}

    if (roleFromRpc) {
      setStoreState({ role: roleFromRpc, userId: user.id, loading: false });
      return;
    }

    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle(),
      6000,
      'profiles.select.role'
    );

    if (error) throw error;
    const normalized = normalizeRole(data?.role);
    setStoreState({ role: normalized ?? 'receptionist', userId: user.id, loading: false });
  } catch (err: any) {
    const message = String(err?.message || err);
    const name = String(err?.name || '');
    if (name === 'AbortError' || message.includes('AbortError') || message.includes('signal is aborted')) {
      setStoreState({ loading: false });
      return;
    }
    if (message.startsWith('timeout:')) {
      setStoreState({ role: null, loading: false, error: new Error('تعذر تحميل الصلاحيات حالياً. تحقق من الاتصال ثم أعد المحاولة.') });
      return;
    }
    const e = err instanceof Error ? err : new Error(message);
    setStoreState({ error: e, role: null, loading: false });
  }
};

const initRoleStore = async () => {
  if (initialized) return;
  initialized = true;
  await fetchRoleForCurrentUser();

  if (!authSub) {
    const { data } = supabase.auth.onAuthStateChange(async () => {
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
