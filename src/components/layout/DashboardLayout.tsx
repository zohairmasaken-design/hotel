'use client';

import React, { useEffect, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { Loader2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import FloatingSidebar from '@/components/layout/FloatingSidebar';
import { supabase } from '@/lib/supabase';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [slowAuth, setSlowAuth] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role, loading, error, authState } = useUserRole();
  const isEmbed = searchParams.get('embed') === '1';
  const embedScale = (() => {
    const raw = searchParams.get('scale');
    const n = raw == null ? NaN : Number(raw);
    if (!Number.isFinite(n)) return 1;
    return Math.max(0.6, Math.min(1, n));
  })();

  useEffect(() => {
    if (isEmbed) return;
    if (!loading && role === 'receptionist') {
      const restrictedPaths = [
        '/units',
        '/invoices',
        '/payments',
        '/reports',
        '/accounting',
        '/settings',
        '/admin',
        '/maintenance',
        '/cleaning'
      ];

      const isRestricted = restrictedPaths.some(path => pathname.startsWith(path));
      
      if (isRestricted) {
        router.replace('/'); // Redirect to dashboard
      }
    }
  }, [isEmbed, pathname, role, loading, router]);

  useEffect(() => {
    if (isEmbed) return;

    const shouldThrottle = (key: string, windowMs: number) => {
      try {
        const now = Date.now();
        const raw = sessionStorage.getItem(key);
        const last = raw ? Number(raw) : 0;
        if (Number.isFinite(last) && now - last < windowMs) return true;
        sessionStorage.setItem(key, String(now));
        return false;
      } catch {
        return false;
      }
    };

    const refreshAuthIfNeeded = async () => {
      if (shouldThrottle('auth_refresh_ts', 15000)) return;
      let hasUser = false;
      let didRefresh = false;

      try {
        for (let i = 0; i < 3; i++) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            hasUser = true;
            const expiresAtMs = (session.expires_at || 0) * 1000;
            const needsRefresh = !expiresAtMs || expiresAtMs - Date.now() < 60_000;
            if (needsRefresh) {
              await supabase.auth.refreshSession();
              didRefresh = true;
            }
            break;
          }

          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            hasUser = true;
            break;
          }

          await new Promise((r) => setTimeout(r, 600 + i * 600));
        }
      } catch {}

      if (!hasUser) {
        try {
          await supabase.auth.refreshSession();
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            hasUser = true;
            didRefresh = true;
          }
        } catch {}
      }

      if (!shouldThrottle('ban_check_ts', 10 * 60 * 1000)) {
        try {
          await fetch('/api/auth/ban-status', {
            method: 'GET',
            cache: 'no-store',
            credentials: 'include'
          });
        } catch {}
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshAuthIfNeeded();
      }
    };
    const onFocus = () => {
      void refreshAuthIfNeeded();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    void refreshAuthIfNeeded();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [isEmbed]);

  useEffect(() => {
    if (isEmbed) return;
    const shouldThrottle = (key: string, windowMs: number) => {
      try {
        const now = Date.now();
        const raw = sessionStorage.getItem(key);
        const last = raw ? Number(raw) : 0;
        if (Number.isFinite(last) && now - last < windowMs) return true;
        sessionStorage.setItem(key, String(now));
        return false;
      } catch {
        return false;
      }
    };

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        if (!shouldThrottle('ban_check_ts', 10 * 60 * 1000)) {
          try {
            fetch('/api/auth/ban-status', { method: 'GET', cache: 'no-store', credentials: 'include' }).catch(() => null);
          } catch {}
        }
        try {
          router.refresh();
        } catch {}
      }
    });
    return () => {
      data?.subscription?.unsubscribe();
    };
  }, [isEmbed, router]);

  useEffect(() => {
    if (isEmbed) return;
    if (!loading) {
      setSlowAuth(false);
      return;
    }
    const t = setTimeout(() => setSlowAuth(true), 7000);
    return () => clearTimeout(t);
  }, [isEmbed, loading]);

  useEffect(() => {
    if (isEmbed) return;
    if (!loading && authState === 'signed_out') {
      const authPaths = ['/login', '/auth'];
      const isAuthPath = authPaths.some((p) => pathname.startsWith(p));
      if (!isAuthPath) {
        router.replace('/login');
      }
    }
  }, [isEmbed, pathname, authState, loading, router]);

  useEffect(() => {
    if (isEmbed) return;
    if (!loading && role === 'housekeeping') {
      const allowedPrefixes = ['/maintenance', '/cleaning'];
      const isAllowed = allowedPrefixes.some(path => pathname.startsWith(path));
      if (!isAllowed) {
        router.replace('/maintenance');
      }
    }
  }, [isEmbed, pathname, role, loading, router]);

  if (loading && role == null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-blue-600" size={48} />
          {slowAuth && (
            <div className="text-center space-y-2">
              <div className="text-sm font-bold text-gray-900">جارِ تحميل الصلاحيات...</div>
              <div className="text-xs text-gray-600">إذا استمر التحميل، تحقق من الاتصال أو أعد تسجيل الدخول</div>
              <button
                onClick={() => window.location.reload()}
                className="mt-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 transition-colors"
              >
                إعادة المحاولة
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error && role == null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-center space-y-3">
          <div className="text-lg font-bold text-gray-900">تعذر تحميل الصلاحيات</div>
          <div className="text-sm text-gray-600">{error.message}</div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 transition-colors"
            >
              إعادة المحاولة
            </button>
            <button
              onClick={() => router.replace('/login')}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm font-bold hover:bg-gray-50 transition-colors"
            >
              تسجيل الدخول
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isEmbed) {
    if (embedScale === 1) {
      return <div className="min-h-screen bg-white">{children}</div>;
    }
    return (
      <div className="min-h-screen bg-white overflow-auto">
        <div
          style={{
            transform: `scale(${embedScale})`,
            transformOrigin: 'top center',
            width: `${100 / embedScale}%`,
            height: `${100 / embedScale}%`
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <div className="hidden 2xl:block">
        <Sidebar />
      </div>
      <FloatingSidebar />

      <div className="flex-1 transition-all duration-300 w-full 2xl:mr-64">
        <Header />
        <main className="p-3 md:p-4 lg:p-6 xl:p-8">
          <div className="mx-auto w-full max-w-screen-xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
