import React from 'react';
import { createClient } from '@/lib/supabase-server';
import PrintActions from '../../PrintActions';
import { format } from 'date-fns';
import { notFound } from 'next/navigation';
import ElectronicSignatureField from '@/components/print/ElectronicSignatureField';

export const runtime = 'edge';

export default async function PrintJournalEntryPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ embed?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) || {};
  const embed = String((sp as any).embed || '') === '1';
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user ?? null;
  if (!user) {
    return (
      <div dir="rtl" className="bg-white min-h-screen flex items-center justify-center p-6">
        <div className="max-w-lg w-full border border-gray-200 rounded-2xl p-6 text-center">
          <div className="font-black text-gray-900 mb-2">يلزم تسجيل الدخول</div>
          <div className="text-sm text-gray-600">الرجاء تسجيل الدخول لعرض صفحة الطباعة.</div>
        </div>
      </div>
    );
  }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (profile?.role as any) || 'receptionist';
  if (!['admin', 'manager', 'accountant'].includes(role)) {
    return (
      <div dir="rtl" className="bg-white min-h-screen flex items-center justify-center p-6">
        <div className="max-w-lg w-full border border-gray-200 rounded-2xl p-6 text-center">
          <div className="font-black text-gray-900 mb-2">صلاحيات غير كافية</div>
          <div className="text-sm text-gray-600">لا تملك الصلاحيات لعرض صفحة الطباعة.</div>
        </div>
      </div>
    );
  }
  const { data: je } = await supabase
    .from('journal_entries')
    .select(`
      *,
      journal_lines(
        id, debit, credit, description,
        account:accounts(code, name)
      )
    `)
    .eq('id', id)
    .single();

  if (!je) return notFound();

  const lines = je.journal_lines || [];
  const totalDebit = lines.reduce((acc: number, ln: any) => acc + Number(ln.debit || 0), 0);
  const totalCredit = lines.reduce((acc: number, ln: any) => acc + Number(ln.credit || 0), 0);
  const entryDate = je.entry_date ? new Date(je.entry_date) : new Date();
  const qrData = `JE:${String(je.id).slice(0,8).toUpperCase()};DATE:${format(entryDate, 'dd/MM/yyyy')};DEB:${totalDebit};CRE:${totalCredit}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrData)}`;

  return (
      <div className="p-6 print:p-0">
        <div className="max-w-3xl mx-auto bg-white">
          <div className="flex items-center justify-between border-b pb-4 mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">سند قيد يدوي</h1>
              <p className="text-gray-500">Manual Journal Voucher</p>
            </div>
            {!embed && <PrintActions />}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4">
              <h3 className="font-bold text-gray-900 mb-3">بيانات السند</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>رقم السند:</span>
                  <span className="font-mono font-bold">{je.voucher_number || String(je.id).slice(0,8).toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span>تاريخ السند:</span>
                  <span className="font-mono">{format(entryDate, 'dd/MM/yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span>الحالة:</span>
                  <span className="font-bold">{je.status || '-'}</span>
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-4 flex items-center justify-center">
              <img src={qrSrc} alt="QR" className="w-24 h-24" />
            </div>
          </div>

          <div className="mt-6">
            <table className="w-full text-sm border">
              <thead className="bg-gray-50">
                <tr className="text-right text-gray-700">
                  <th className="py-2 px-3 border">الحساب</th>
                  <th className="py-2 px-3 border">البيان</th>
                  <th className="py-2 px-3 border">مدين</th>
                  <th className="py-2 px-3 border">دائن</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((ln: any) => (
                  <tr key={ln.id} className="border-t">
                    <td className="py-2 px-3 border whitespace-nowrap">{ln.account?.code} - {ln.account?.name}</td>
                    <td className="py-2 px-3 border">{ln.description || '-'}</td>
                    <td className="py-2 px-3 border text-emerald-700 font-bold">{Number(ln.debit || 0).toLocaleString()}</td>
                    <td className="py-2 px-3 border text-red-700 font-bold">{Number(ln.credit || 0).toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="py-2 px-3 border" colSpan={2}>الإجمالي</td>
                  <td className="py-2 px-3 border text-emerald-700">{totalDebit.toLocaleString()}</td>
                  <td className="py-2 px-3 border text-red-700">{totalCredit.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8">
            <ElectronicSignatureField label="المستلم" />
            <ElectronicSignatureField label="المحاسب" />
          </div>
        </div>
      </div>
  );
}
