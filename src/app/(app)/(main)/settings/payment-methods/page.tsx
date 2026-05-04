import React from 'react';
import { createClient } from '@/lib/supabase-server';
import PaymentMethodManager from '@/components/settings/PaymentMethodManager';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import RoleGate from '@/components/auth/RoleGate';
import { cookies } from 'next/headers';

export const runtime = 'edge';

export const metadata = {
  title: 'إعدادات طرق الدفع',
};

export default async function PaymentMethodsPage() {
  const supabase = await createClient();

  const cookieStore = await cookies();
  const activeHotelCookie = cookieStore.get('active_hotel_id')?.value ?? null;
  const activeHotelIdRaw = activeHotelCookie ? decodeURIComponent(activeHotelCookie) : null;

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id ?? null;

  let role: string | null = null;
  let defaultHotelId: string | null = null;
  if (userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, default_hotel_id')
      .eq('id', userId)
      .maybeSingle();
    role = (profile as any)?.role ? String((profile as any).role) : null;
    defaultHotelId = (profile as any)?.default_hotel_id ? String((profile as any).default_hotel_id) : null;
  }

  let selectedHotelId = activeHotelIdRaw || 'all';
  if (role !== 'admin' && selectedHotelId === 'all' && defaultHotelId) {
    selectedHotelId = defaultHotelId;
  }

  // Fetch Payment Methods with linked Account info
  let methodsQuery = supabase
    .from('payment_methods')
    .select(`
      *,
      account:accounts(id, name, code)
    `)
    .order('created_at', { ascending: true });

  if (selectedHotelId !== 'all') {
    methodsQuery = methodsQuery.or(`hotel_id.is.null,hotel_id.eq.${selectedHotelId}`);
  }

  const { data: paymentMethods } = await methodsQuery;

  // Fetch Asset Accounts (Cash, Bank) to link
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, code, type')
    .eq('type', 'asset')
    .order('code', { ascending: true });

  return (
    <RoleGate allow={['admin','manager']}>
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-gray-500 mb-4">
        <Link href="/settings" className="hover:text-blue-600 transition-colors">
            الإعدادات
        </Link>
        <ArrowRight size={16} className="rotate-180" />
        <span className="font-bold text-gray-900">طرق الدفع</span>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <h3 className="font-bold text-blue-800 mb-2">كيف يعمل الربط المحاسبي؟</h3>
        <p className="text-sm text-blue-700 leading-relaxed">
          عند إضافة طريقة دفع جديدة (مثل "نقداً" أو "تحويل بنكي")، يجب ربطها بحساب محاسبي من نوع "أصول" (Asset) في دليل الحسابات.
          <br/>
          عند تسجيل أي عملية دفع باستخدام هذه الطريقة، سيقوم النظام تلقائياً بتسجيل القيد المحاسبي في الحساب المرتبط.
        </p>
      </div>

      <PaymentMethodManager 
        initialPaymentMethods={paymentMethods || []} 
        accounts={accounts || []} 
        selectedHotelId={selectedHotelId}
      />
    </div>
    </RoleGate>
  );
}
