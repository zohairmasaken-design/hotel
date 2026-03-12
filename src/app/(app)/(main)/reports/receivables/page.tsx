'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Users, ArrowRight, Calendar, Download } from 'lucide-react';
import RoleGate from '@/components/auth/RoleGate';

interface Row {
  customer_id: string;
  customer_name: string;
  invoices_count: number;
  total_invoiced: number;
  total_paid: number;
  total_remaining: number;
}

export default function ReceivablesReportPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [detailsByCustomer, setDetailsByCustomer] = useState<Record<string, any[]>>({});
  const [contactByCustomer, setContactByCustomer] = useState<Record<string, { phone?: string; email?: string; name: string }>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [contactExpanded, setContactExpanded] = useState<Set<string>>(new Set());
  const [companyName, setCompanyName] = useState('شموخ الرفاهية ');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    fetchReport();
    try {
      const n = typeof window !== 'undefined' ? localStorage.getItem('companyName') : null;
      const l = typeof window !== 'undefined' ? localStorage.getItem('companyLogo') : null;
      if (n) setCompanyName(n);
      if (l) setCompanyLogo(l);
    } catch {}
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const { data: invoices, error } = await supabase
        .from('invoices')
        .select(`
          id,
          customer_id,
          total_amount,
          invoice_date,
          status,
          customer:customers(full_name, phone, email),
          booking:bookings(id, check_in, check_out, unit:units(unit_number))
        `)
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate)
        .neq('status', 'void');
      if (error) throw error;

      const invs = invoices || [];
      const ids = invs.map((i: any) => i.id);
      let paidByInvoice: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: pays } = await supabase
          .from('payments')
          .select('invoice_id, amount')
          .in('invoice_id', ids);
        (pays || []).forEach((p: any) => {
          const k = p.invoice_id;
          const amt = Number(p?.amount || 0);
          paidByInvoice[k] = (paidByInvoice[k] || 0) + amt;
        });
      }

      const byCustomer = new Map<string, Row>();
      const detailsMap: Record<string, any[]> = {};
      const contactMap: Record<string, { phone?: string; email?: string; name: string }> = {};
      invs.forEach((inv: any) => {
        const cid = inv.customer_id || 'unknown';
        const cname = inv.customer?.full_name || 'غير معروف';
        const total = Number(inv.total_amount || 0);
        const paid = Math.min(Number(paidByInvoice[inv.id] || 0), total);
        const rem = Math.max(0, total - paid);
        if (!byCustomer.has(cid)) {
          byCustomer.set(cid, {
            customer_id: cid,
            customer_name: cname,
            invoices_count: 0,
            total_invoiced: 0,
            total_paid: 0,
            total_remaining: 0
          });
        }
        const r = byCustomer.get(cid)!;
        r.invoices_count += 1;
        r.total_invoiced += total;
        r.total_paid += paid;
        r.total_remaining += rem;
        if (!detailsMap[cid]) detailsMap[cid] = [];
        detailsMap[cid].push({
          invoice_id: inv.id,
          invoice_date: inv.invoice_date,
          unit_number: inv.booking?.unit?.unit_number || '-',
          check_in: inv.booking?.check_in || null,
          check_out: inv.booking?.check_out || null,
          total_amount: total,
          paid_amount: paid,
          remaining_amount: rem
        });
        if (!contactMap[cid]) {
          contactMap[cid] = {
            phone: inv.customer?.phone || undefined,
            email: inv.customer?.email || undefined,
            name: cname
          };
        }
      });

      const list = Array.from(byCustomer.values()).sort((a, b) =>
        b.total_remaining - a.total_remaining
      );
      setRows(list);
      setDetailsByCustomer(detailsMap);
      setContactByCustomer(contactMap);
      setSearchText('');
    } catch (err: any) {
      console.error('Error building receivables report:', err);
      alert('حدث خطأ أثناء تحميل تقرير المديونية: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = useMemo(() => {
    const t = searchText.trim();
    if (!t) return rows;
    return rows.filter((r) => (r.customer_name || '').includes(t));
  }, [rows, searchText]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        acc.customers += 1;
        acc.invoices += Number(r.invoices_count || 0);
        acc.invoiced += Number(r.total_invoiced || 0);
        acc.paid += Number(r.total_paid || 0);
        acc.remaining += Number(r.total_remaining || 0);
        return acc;
      },
      { customers: 0, invoices: 0, invoiced: 0, paid: 0, remaining: 0 }
    );
  }, [filteredRows]);

  const formatDate = (d?: string | null) => {
    if (!d) return '-';
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return '-';
      return dt.toLocaleDateString('ar-SA');
    } catch {
      return '-';
    }
  };
  const sanitizePhone = (p?: string) => (p || '').replace(/\D/g, '');
  const composeMessage = (name: string, r: Row) => {
    return `عميلنا ${name}، المديونية الحالية: ${r.total_remaining.toLocaleString()} ر.س عن ${r.invoices_count} فاتورة خلال الفترة ${startDate} إلى ${endDate}. شاكرين تعاونكم.`;
  };

  return (
    <RoleGate allow={['admin','manager']}>
    <>
      <style>{`
        .screen-only { display: block; }
        .print-only { display: none; }
        @media print {
          .screen-only { display: none !important; }
          .print-only { display: block !important; }
          header, aside, nav, .sticky, .fixed { display: none !important; }
          .print-title { font-size: 18px; font-weight: 800; color: #111827; margin-bottom: 6px; }
          .print-sub { color: #6b7280; font-size: 12px; margin-bottom: 10px; }
          .p-table { width: 100%; border-collapse: collapse; }
          .p-table th, .p-table td { border: 1px solid #e5e7eb; padding: 6px; text-align: right; font-size: 12px; }
          .p-table th { background: #f9fafb; font-weight: 700; }
          .print-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
          .print-brand { display: flex; align-items: center; gap: 10px; }
          .print-brand img { height: 48px; width: auto; object-fit: contain; }
          .print-summary { margin: 8px 0 12px 0; }
          .sig-row { display: flex; gap: 40px; margin-top: 24px; }
          .sig-box { flex: 1 1 0; }
          .sig-label { font-size: 12px; color: #374151; margin-bottom: 28px; }
          .sig-line { border-top: 1px solid #e5e7eb; height: 1px; }
        }
      `}</style>
    <div className="p-6 max-w-7xl mx-auto space-y-6 screen-only">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/reports"
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
          >
            <ArrowRight size={24} />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="text-rose-600" />
              تقرير المديونية
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              كشف بالمديونية حسب العملاء بناءً على الفواتير والمدفوعات المرتبطة بها.
            </p>
          </div>
        </div>
+
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download size={18} />
          <span>طباعة / تصدير</span>
        </button>
      </div>
+
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchReport();
          }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 items-end"
        >
          <div className="space-y-1.5">
            <label className="text-xs sm:text-sm font-medium text-gray-700 flex items-center gap-1">
              <Calendar size={14} />
              من تاريخ
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs sm:text-sm font-medium text-gray-700 flex items-center gap-1">
              <Calendar size={14} />
              إلى تاريخ
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs sm:text-sm font-medium text-gray-700">بحث بالعميل</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="اسم العميل"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              <button
                type="button"
                onClick={() => setSearchText('')}
                className="px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-700 hover:bg-gray-50"
              >
                مسح
              </button>
            </div>
          </div>
          <div className="flex sm:block">
            <button
              type="submit"
              className="w-full px-4 sm:px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-xs sm:text-sm flex items-center justify-center gap-2"
            >
              تحديث التقرير
            </button>
          </div>
        </form>
      </div>
+
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-gray-500">عدد العملاء</p>
          <p className="mt-1 text-2xl font-extrabold text-gray-900">{totals.customers.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-gray-500">عدد الفواتير</p>
          <p className="mt-1 text-2xl font-extrabold text-gray-900">{totals.invoices.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-gray-500">إجمالي الفواتير</p>
          <p className="mt-1 text-xl font-extrabold text-gray-900">
            {totals.invoiced.toLocaleString()} <span className="text-sm font-bold">ر.س</span>
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-rose-700">إجمالي المديونية</p>
          <p className="mt-1 text-xl font-extrabold text-rose-700">
            {totals.remaining.toLocaleString()} <span className="text-sm font-bold">ر.س</span>
          </p>
        </div>
      </div>
+
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-right min-w-[1100px]">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">العميل</th>
              <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">عدد الفواتير</th>
              <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">إجمالي الفواتير</th>
              <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">إجمالي المدفوع</th>
              <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">المتبقي</th>
              <th className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 text-center whitespace-nowrap">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredRows.length > 0 ? (
              filteredRows.map((r) => {
                const isOpen = expanded.has(r.customer_id);
                const contact = contactByCustomer[r.customer_id] || { name: r.customer_name };
                const message = composeMessage(contact.name, r);
                const phone = sanitizePhone(contact.phone);
                const waLink = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message)}`;
                const mailLink = `mailto:${contact.email || ''}?subject=${encodeURIComponent('مديونية مستحقة')}&body=${encodeURIComponent(message)}`;
                const telLink = phone ? `tel:${phone}` : undefined;
                const isContactOpen = contactExpanded.has(r.customer_id);
                return (
                  <>
                    <tr key={r.customer_id} className="hover:bg-gray-50 transition-colors odd:bg-white even:bg-gray-50">
                      <td className="px-4 py-3 sm:px-6 sm:py-4 font-medium text-gray-900 whitespace-nowrap">
                        {r.customer_name}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 text-gray-700 whitespace-nowrap">
                        {r.invoices_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">
                        {r.total_invoiced.toLocaleString()} ر.س
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900 whitespace-nowrap">
                        {r.total_paid.toLocaleString()} ر.س
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 font-extrabold text-rose-700 whitespace-nowrap">
                        {r.total_remaining.toLocaleString()} ر.س
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const next = new Set(expanded);
                              if (next.has(r.customer_id)) next.delete(r.customer_id);
                              else next.add(r.customer_id);
                              setExpanded(next);
                            }}
                            className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs"
                          >
                            {isOpen ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
                          </button>
                          <button
                            onClick={() => {
                              const next = new Set(contactExpanded);
                              if (next.has(r.customer_id)) next.delete(r.customer_id);
                              else next.add(r.customer_id);
                              setContactExpanded(next);
                            }}
                            className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs"
                          >
                            {isContactOpen ? 'إخفاء التواصل' : 'تواصل'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-white">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="overflow-x-auto">
                            <table className="w-full text-right min-w-[900px] border border-gray-100 rounded-lg">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-xs font-bold text-gray-700">رقم الفاتورة</th>
                                  <th className="px-3 py-2 text-xs font-bold text-gray-700">الغرفة</th>
                                  <th className="px-3 py-2 text-xs font-bold text-gray-700">تاريخ الدخول</th>
                                  <th className="px-3 py-2 text-xs font-bold text-gray-700">تاريخ الخروج</th>
                                  <th className="px-3 py-2 text-xs font-bold text-gray-700">المبلغ</th>
                                  <th className="px-3 py-2 text-xs font-bold text-gray-700">المدفوع</th>
                                  <th className="px-3 py-2 text-xs font-bold text-gray-700">المتبقي</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {(detailsByCustomer[r.customer_id] || []).map((d, idx) => (
                                  <tr key={idx} className="odd:bg-white even:bg-gray-50">
                                    <td className="px-3 py-2 font-mono text-sm">{d.invoice_id.slice(0, 8).toUpperCase()}</td>
                                    <td className="px-3 py-2 text-sm">{d.unit_number || '-'}</td>
                                    <td className="px-3 py-2 text-sm">{formatDate(d.check_in)}</td>
                                    <td className="px-3 py-2 text-sm">{formatDate(d.check_out)}</td>
                                    <td className="px-3 py-2 text-sm font-bold">{Number(d.total_amount || 0).toLocaleString()} ر.س</td>
                                    <td className="px-3 py-2 text-sm font-bold">{Number(d.paid_amount || 0).toLocaleString()} ر.س</td>
                                    <td className="px-3 py-2 text-sm font-extrabold text-rose-700">{Number(d.remaining_amount || 0).toLocaleString()} ر.س</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                    {isContactOpen && (
                      <tr className="bg-white">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <a
                                href={waLink}
                                target="_blank"
                                className="px-3 py-1.5 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 text-xs"
                              >
                                رسالة واتساب
                              </a>
                            <a
                                href={mailLink}
                                className="px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 text-xs"
                              >
                                رسالة بريد إلكتروني
                              </a>
                              {telLink ? (
                                <a
                                  href={telLink}
                                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50 text-xs"
                                >
                                  اتصال هاتفي
                                </a>
                              ) : (
                                <span className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-400 text-xs">
                                  رقم الهاتف غير متوفر
                                </span>
                              )}
                            </div>
                            <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                              <div className="text-xs text-gray-500 mb-1">نص الرسالة</div>
                              <div className="text-sm text-gray-800 whitespace-pre-wrap">{message}</div>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-right min-w-[900px] border border-gray-100 rounded-lg">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-3 py-2 text-xs font-bold text-gray-700">رقم الفاتورة</th>
                                    <th className="px-3 py-2 text-xs font-bold text-gray-700">الغرفة</th>
                                    <th className="px-3 py-2 text-xs font-bold text-gray-700">تاريخ الدخول</th>
                                    <th className="px-3 py-2 text-xs font-bold text-gray-700">تاريخ الخروج</th>
                                    <th className="px-3 py-2 text-xs font-bold text-gray-700">المبلغ</th>
                                    <th className="px-3 py-2 text-xs font-bold text-gray-700">المدفوع</th>
                                    <th className="px-3 py-2 text-xs font-bold text-gray-700">المتبقي</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {(detailsByCustomer[r.customer_id] || []).map((d, idx) => (
                                    <tr key={idx} className="odd:bg-white even:bg-gray-50">
                                      <td className="px-3 py-2 font-mono text-sm">{d.invoice_id.slice(0, 8).toUpperCase()}</td>
                                      <td className="px-3 py-2 text-sm">{d.unit_number || '-'}</td>
                                      <td className="px-3 py-2 text-sm">{formatDate(d.check_in)}</td>
                                      <td className="px-3 py-2 text-sm">{formatDate(d.check_out)}</td>
                                      <td className="px-3 py-2 text-sm font-bold">{Number(d.total_amount || 0).toLocaleString()} ر.س</td>
                                      <td className="px-3 py-2 text-sm font-bold">{Number(d.paid_amount || 0).toLocaleString()} ر.س</td>
                                      <td className="px-3 py-2 text-sm font-extrabold text-rose-700">{Number(d.remaining_amount || 0).toLocaleString()} ر.س</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  لا توجد بيانات ضمن الفترة المحددة
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    <div className="print-only">
      <div className="print-header">
        <div className="print-brand">
          {companyLogo ? <img src={companyLogo} alt="Logo" /> : null}
          <div>
            <div className="print-title">{companyName}</div>
            <div className="print-sub">تقرير المديونية</div>
          </div>
        </div>
        <div>
          <div className="print-sub">الفترة: {startDate} إلى {endDate}</div>
        </div>
      </div>
      <table className="p-table print-summary">
        <thead>
          <tr>
            <th>إجمالي الفواتير</th>
            <th>إجمالي المدفوع</th>
            <th>إجمالي المديونية</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{totals.invoiced.toLocaleString()} ر.س</td>
            <td>{totals.paid.toLocaleString()} ر.س</td>
            <td>{totals.remaining.toLocaleString()} ر.س</td>
          </tr>
        </tbody>
      </table>
      <table className="p-table">
        <thead>
          <tr>
            <th>العميل</th>
            <th>عدد الفواتير</th>
            <th>إجمالي الفواتير</th>
            <th>إجمالي المدفوع</th>
            <th>المتبقي</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((r) => (
            <tr key={r.customer_id}>
              <td>{r.customer_name}</td>
              <td>{r.invoices_count.toLocaleString()}</td>
              <td>{r.total_invoiced.toLocaleString()} ر.س</td>
              <td>{r.total_paid.toLocaleString()} ر.س</td>
              <td>{r.total_remaining.toLocaleString()} ر.س</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sig-row">
        <div className="sig-box">
          <div className="sig-label">توقيع المدير</div>
          <div className="sig-line"></div>
        </div>
        <div className="sig-box">
          <div className="sig-label">توقيع المحاسب</div>
          <div className="sig-line"></div>
        </div>
      </div>
    </div>
    </>
    </RoleGate>
  );
}
