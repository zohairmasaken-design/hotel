'use client';

import React, { useEffect, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { Loader2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import FloatingSidebar from '@/components/layout/FloatingSidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [slowAuth, setSlowAuth] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { role, loading, error } = useUserRole();

  useEffect(() => {
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
  }, [pathname, role, loading, router]);

  useEffect(() => {
    if (!loading) {
      setSlowAuth(false);
      return;
    }
    const t = setTimeout(() => setSlowAuth(true), 7000);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (!loading && role == null) {
      const authPaths = ['/login', '/auth'];
      const isAuthPath = authPaths.some((p) => pathname.startsWith(p));
      if (!isAuthPath) {
        router.replace('/login');
      }
    }
  }, [pathname, role, loading, router]);

  useEffect(() => {
    if (!loading && role === 'housekeeping') {
      const allowedPrefixes = ['/maintenance', '/cleaning'];
      const isAllowed = allowedPrefixes.some(path => pathname.startsWith(path));
      if (!isAllowed) {
        router.replace('/maintenance');
      }
    }
  }, [pathname, role, loading, router]);

  if (loading) {
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
