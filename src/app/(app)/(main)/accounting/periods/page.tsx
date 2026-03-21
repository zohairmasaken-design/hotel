'use client';
 
 import React, { useEffect, useState } from 'react';
 import { supabase } from '@/lib/supabase';
 import { Calendar, PlusCircle, CheckCircle2, XCircle, RefreshCcw, ArrowRight } from 'lucide-react';
 import Link from 'next/link';
 import RoleGate from '@/components/auth/RoleGate';
 
 interface AccountingPeriod {
   id: string;
   start_date: string;
   end_date: string;
   status: 'open' | 'closed';
   created_at?: string;
 }
 
 
 
 export default function AccountingPeriodsPage() {
   const [loading, setLoading] = useState(true);
   const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
   const [startDate, setStartDate] = useState<string>(new Date(new Date().setDate(1)).toISOString().split('T')[0]);
   const [endDate, setEndDate] = useState<string>(new Date(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)).toISOString().split('T')[0]);
   const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
   const [processing, setProcessing] = useState(false);
 
  const fetchPeriods = async () => {
     setLoading(true);
     const query = supabase
       .from('accounting_periods')
       .select('id, start_date, end_date, status, period_name, created_at')
       .order('start_date', { ascending: false });
 
     const { data, error } = await query;
     if (!error && data) {
       setPeriods(data as AccountingPeriod[]);
     }
     setLoading(false);
   };
 
   useEffect(() => {
     fetchPeriods();
   }, []);
 
   const hasOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
     const aS = new Date(aStart).getTime();
     const aE = new Date(aEnd).getTime();
     const bS = new Date(bStart).getTime();
     const bE = new Date(bEnd).getTime();
     return aS <= bE && bS <= aE;
   };
 
  const handleOpenPeriod = async () => {
     if (!startDate || !endDate) {
       alert('الرجاء اختيار تاريخي البداية والنهاية');
       return;
     }
     if (new Date(startDate) > new Date(endDate)) {
       alert('تاريخ البداية لا يجب أن يكون بعد تاريخ النهاية');
       return;
     }
     const overlappingOpen = periods.some(p => p.status === 'open' && hasOverlap(startDate, endDate, p.start_date, p.end_date));
     if (overlappingOpen) {
       const ok = confirm('هناك فترة مفتوحة تتداخل مع النطاق المحدد. هل تريد الاستمرار؟ قد يسبب ذلك التباساً في التقارير.');
       if (!ok) return;
     }
     setProcessing(true);
     const periodName = new Date(startDate).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
     const { error } = await supabase
       .from('accounting_periods')
       .insert({ start_date: startDate, end_date: endDate, status: 'open', period_name: periodName });
     setProcessing(false);
     if (error) {
       alert(error.message);
       return;
     }
     await fetchPeriods();
   };
 
   const handleClosePeriod = async (id: string) => {
     setProcessing(true);
     const { error } = await supabase
       .from('accounting_periods')
       .update({ status: 'closed' })
       .eq('id', id);
     setProcessing(false);
     if (error) {
       alert(error.message);
       return;
     }
     await fetchPeriods();
   };
 
   const handleReopenPeriod = async (id: string) => {
     setProcessing(true);
     const { error } = await supabase
       .from('accounting_periods')
       .update({ status: 'open' })
       .eq('id', id);
     setProcessing(false);
     if (error) {
       alert(error.message);
       return;
     }
     await fetchPeriods();
   };
 
   const filtered = periods.filter(p => statusFilter === 'all' ? true : p.status === statusFilter);
 
  return (
    <RoleGate allow={['admin', 'accountant']}>
    <div className="space-y-6">
       <div className="flex items-center gap-2 text-gray-500 mb-4">
         <Link href="/accounting/statement" className="hover:text-blue-600 transition-colors">
             المحاسبة
         </Link>
         <ArrowRight size={16} className="rotate-180" />
         <span className="font-bold text-gray-900">الفترات المحاسبية</span>
       </div>
 
       <div className="flex items-center justify-between">
         <div>
           <h1 className="text-2xl font-bold text-gray-900">الفترات المحاسبية</h1>
           <p className="text-gray-500 mt-1">فتح/إغلاق الفترات، مع منع التداخل قدر الإمكان</p>
         </div>
       </div>
 
       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <div className="bg-white border border-gray-200 rounded-2xl p-4">
           <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
             <Calendar size={18} className="text-blue-600" />
             فتح فترة جديدة
           </h3>
           <div className="space-y-3">
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ البداية</label>
               <input
                 type="date"
                 value={startDate}
                 onChange={e => setStartDate(e.target.value)}
                 className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
               />
             </div>
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ النهاية</label>
               <input
                 type="date"
                 value={endDate}
                 onChange={e => setEndDate(e.target.value)}
                 className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
               />
             </div>
             <div className="flex gap-2">
               <button
                 onClick={() => {
                   const now = new Date();
                   setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
                   setEndDate(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]);
                 }}
                 className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
               >
                 الشهر الحالي
               </button>
               <button
                 onClick={() => {
                   const now = new Date();
                   const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                   setStartDate(next.toISOString().split('T')[0]);
                   setEndDate(new Date(next.getFullYear(), next.getMonth() + 1, 0).toISOString().split('T')[0]);
                 }}
                 className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
               >
                 الشهر القادم
               </button>
             </div>
             <button
               onClick={handleOpenPeriod}
               disabled={processing}
               className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
             >
               <PlusCircle size={16} />
               فتح الفترة
             </button>
           </div>
         </div>
 
         <div className="md:col-span-2 bg-white border border-gray-200 rounded-2xl p-4">
           <div className="flex items-center justify-between mb-3">
             <h3 className="font-bold text-gray-900">القائمة</h3>
             <div className="flex items-center gap-2">
               <select
                 value={statusFilter}
                 onChange={e => setStatusFilter(e.target.value as any)}
                 className="px-3 py-2 border rounded-lg text-sm"
               >
                 <option value="all">الكل</option>
                 <option value="open">مفتوحة</option>
                 <option value="closed">مغلقة</option>
               </select>
               <button
                 onClick={fetchPeriods}
                 className="px-3 py-2 border rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
               >
                 <RefreshCcw size={16} />
                 تحديث
               </button>
             </div>
           </div>
           {loading ? (
             <div className="py-10 text-center text-gray-500">جاري التحميل...</div>
           ) : filtered.length === 0 ? (
             <div className="py-10 text-center text-gray-500">لا توجد فترات</div>
           ) : (
             <table className="w-full text-sm">
               <thead>
                 <tr className="text-gray-500">
                   <th className="text-right px-3 py-2">البداية</th>
                   <th className="text-right px-3 py-2">النهاية</th>
                   <th className="text-right px-3 py-2">اسم الفترة</th>
                   <th className="text-right px-3 py-2">الحالة</th>
                   <th className="text-left px-3 py-2">إجراءات</th>
                 </tr>
               </thead>
               <tbody className="divide-y">
                 {filtered.map(p => (
                   <tr key={p.id} className="hover:bg-gray-50">
                     <td className="px-3 py-2">{p.start_date}</td>
                     <td className="px-3 py-2">{p.end_date}</td>
                     <td className="px-3 py-2">{(p as any).period_name || '-'}</td>
                     <td className="px-3 py-2">
                       {p.status === 'open' ? (
                         <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                           <CheckCircle2 size={12} />
                           مفتوحة
                         </span>
                       ) : (
                         <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                           <XCircle size={12} />
                           مغلقة
                         </span>
                       )}
                     </td>
                     <td className="px-3 py-2">
                       {p.status === 'open' ? (
                         <button
                           onClick={() => handleClosePeriod(p.id)}
                           disabled={processing}
                           className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg transition-colors"
                         >
                           إغلاق
                         </button>
                       ) : (
                         <button
                           onClick={() => handleReopenPeriod(p.id)}
                           disabled={processing}
                           className="text-xs bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1.5 rounded-lg transition-colors"
                         >
                           إعادة فتح
                         </button>
                       )}
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           )}
         </div>
       </div>
 
       <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
         <h3 className="font-bold text-blue-800 mb-2">تنظيم الفترات المحاسبية</h3>
         <ul className="text-sm text-blue-800 space-y-2">
           <li>يفضل فتح فترة شهرية تغطي كامل الشهر لتسهيل التقارير الشهرية.</li>
           <li>تجنب وجود فترتين مفتوحتين متداخلتين لنفس التاريخ لتفادي الالتباس.</li>
           <li>أغلق الفترة بعد إنهاء جميع قيود الشهر (الفواتير، المدفوعات، التسويات).</li>
           <li>يمكن فتح فترة ليوم واحد للاختبارات أو المعاملات الاستثنائية.</li>
           <li>كل ترحيل مالي يتحقق من وجود فترة مفتوحة للتاريخ المستخدم.</li>
         </ul>
       </div>
    </div>
    </RoleGate>
   );
 }
