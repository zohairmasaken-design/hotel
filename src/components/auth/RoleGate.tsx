 'use client';
 
 import React from 'react';
 import { useUserRole, UserRole } from '@/hooks/useUserRole';
 import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
 
 interface RoleGateProps {
   allow: Exclude<UserRole, null>[];
   children: React.ReactNode;
   fallback?: React.ReactNode;
 }
 
 export default function RoleGate({ allow, children, fallback }: RoleGateProps) {
  const { role, loading, error } = useUserRole();
  const allowKey = allow.join('|');
  const [hasAccess, setHasAccess] = React.useState(false);

  React.useEffect(() => {
    if (!role) return;
    setHasAccess(allow.includes(role));
  }, [role, allowKey]);
 
   if (loading && hasAccess) {
     return <>{children}</>;
   }

   if (loading) {
     return (
       <div className="p-10 flex items-center justify-center text-gray-500">
         جارِ التحقق من الصلاحيات...
       </div>
     );
   }
 
  if (!role) {
     if (fallback) return <>{fallback}</>;
     return (
       <div className="p-10">
         <div className="max-w-xl mx-auto bg-white border border-gray-200 rounded-2xl p-6 text-center">
           <div className="flex items-center justify-center mb-3">
             <ShieldAlert className="text-red-600" size={28} />
           </div>
          <div className="font-bold text-gray-900 mb-1">تعذر التحقق من الصلاحيات</div>
           <div className="text-sm text-gray-600">
            {error?.message || 'قد تكون جلسة الدخول انتهت أو يوجد خلل اتصال. أعد المحاولة أو سجّل الدخول.'}
           </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 transition-colors"
            >
              إعادة المحاولة
            </button>
            <Link
              href="/login"
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm font-bold hover:bg-gray-50 transition-colors"
            >
              تسجيل الدخول
            </Link>
          </div>
         </div>
       </div>
     );
   }
 
  if (!allow.includes(role)) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="p-10">
        <div className="max-w-xl mx-auto bg-white border border-gray-200 rounded-2xl p-6 text-center">
          <div className="flex items-center justify-center mb-3">
            <ShieldAlert className="text-red-600" size={28} />
          </div>
          <div className="font-bold text-gray-900 mb-1">صلاحيات غير كافية</div>
          <div className="text-sm text-gray-600">
            لا تملك الصلاحيات للوصول إلى هذه الصفحة. تواصل مع المشرف لمنح الإذن.
          </div>
        </div>
      </div>
    );
  }

   return <>{children}</>;
 }
