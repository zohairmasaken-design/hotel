import React from 'react';
import Link from 'next/link';
import { Printer, FileText, ClipboardList, ClipboardCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'edge';

export default async function TemplatesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let isReceptionist = false;
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    isReceptionist = profile?.role === 'receptionist';
  }
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">التمبلت</h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-500">اختَر تمبلت العقد المطلوب للطباعة</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow text-right">
          <div className="flex items-center gap-4 mb-6">
            <div className="bg-purple-100 p-3 rounded-xl">
              <FileText className="text-purple-600 w-8 h-8" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-gray-900">عقد إيجار فارغ</h3>
              <p className="text-sm text-gray-500">تمبلت عقد بدون بيانات مستأجر أو وحدة</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/print/contract/blank"
              target="_blank"
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isReceptionist ? 'bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}
              aria-disabled={isReceptionist ? true : undefined}
              title={isReceptionist ? 'غير مسموح للرسيبشن' : undefined}
            >
              <Printer size={16} />
              عرض
            </Link>
            <Link
              href="/print/contract/blank"
              target="_blank"
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isReceptionist ? 'bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}
              aria-disabled={isReceptionist ? true : undefined}
              title={isReceptionist ? 'غير مسموح للرسيبشن' : undefined}
            >
              <Printer size={16} />
              طباعة
            </Link>
          </div>
        </div>

        <div className="bg-white border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow text-right">
          <div className="flex items-center gap-4 mb-6">
            <div className="bg-blue-100 p-3 rounded-xl">
              <ClipboardList className="text-blue-600 w-8 h-8" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-gray-900">محضر استلام فارغ</h3>
              <p className="text-sm text-gray-500">تمبلت محضر استلام بدون بيانات</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/print/handover/blank"
              target="_blank"
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isReceptionist ? 'bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}
              aria-disabled={isReceptionist ? true : undefined}
              title={isReceptionist ? 'غير مسموح للرسيبشن' : undefined}
            >
              <Printer size={16} />
              عرض
            </Link>
            <Link
              href="/print/handover/blank"
              target="_blank"
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isReceptionist ? 'bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}
              aria-disabled={isReceptionist ? true : undefined}
              title={isReceptionist ? 'غير مسموح للرسيبشن' : undefined}
            >
              <Printer size={16} />
              طباعة
            </Link>
          </div>
        </div>

        <div className="bg-white border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow text-right">
          <div className="flex items-center gap-4 mb-6">
            <div className="bg-green-100 p-3 rounded-xl">
              <ClipboardCheck className="text-green-600 w-8 h-8" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-gray-900">محضر تسليم فارغ</h3>
              <p className="text-sm text-gray-500">تمبلت محضر تسليم بدون بيانات</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/print/return/blank"
              target="_blank"
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isReceptionist ? 'bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}
              aria-disabled={isReceptionist ? true : undefined}
              title={isReceptionist ? 'غير مسموح للرسيبشن' : undefined}
            >
              <Printer size={16} />
              عرض
            </Link>
            <Link
              href="/print/return/blank"
              target="_blank"
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isReceptionist ? 'bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}
              aria-disabled={isReceptionist ? true : undefined}
              title={isReceptionist ? 'غير مسموح للرسيبشن' : undefined}
            >
              <Printer size={16} />
              طباعة
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
