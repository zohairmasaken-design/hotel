 'use client';
 
 import React from 'react';
 import { useUserRole, UserRole } from '@/hooks/useUserRole';
 import { ShieldAlert } from 'lucide-react';
 
 interface RoleGateProps {
   allow: Exclude<UserRole, null>[];
   children: React.ReactNode;
   fallback?: React.ReactNode;
 }
 
 export default function RoleGate({ allow, children, fallback }: RoleGateProps) {
   const { role, loading } = useUserRole();
 
   if (loading) {
     return (
       <div className="p-10 flex items-center justify-center text-gray-500">
         جارِ التحقق من الصلاحيات...
       </div>
     );
   }
 
   if (!role || !allow.includes(role)) {
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
