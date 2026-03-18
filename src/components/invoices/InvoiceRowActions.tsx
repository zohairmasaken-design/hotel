'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Printer, Trash2 } from 'lucide-react';

export default function InvoiceRowActions({
  invoiceId,
  invoiceNumber,
  status,
  canPrint,
  canHardDelete
}: {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  canPrint: boolean;
  canHardDelete: boolean;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleHardDelete = async () => {
    if (!canHardDelete) return;
    if (status !== 'draft' && status !== 'void') {
      alert('الحذف النهائي مسموح فقط للفواتير المسودة أو الملغاة');
      return;
    }
    if (!confirm(`هل أنت متأكد من حذف الفاتورة نهائياً؟\nرقم الفاتورة: ${invoiceNumber}\nهذا الإجراء لا يمكن التراجع عنه.`)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/invoices/${encodeURIComponent(invoiceId)}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        if (body?.error === 'missing_service_role') {
          throw new Error('لا يمكن الحذف النهائي حالياً: لم يتم تهيئة مفتاح الخدمة على الخادم');
        }
        if (body?.error === 'invoice_has_payments') {
          throw new Error('لا يمكن الحذف النهائي: توجد سندات مرتبطة بالفاتورة');
        }
        if (body?.error === 'invoice_has_journal_entries') {
          throw new Error('لا يمكن الحذف النهائي: توجد قيود محاسبية مرتبطة بالفاتورة');
        }
        if (body?.error === 'only_draft_or_void_can_be_deleted') {
          throw new Error('الحذف النهائي مسموح فقط للفواتير المسودة أو الملغاة');
        }
        throw new Error(body?.error || `فشل الحذف (HTTP ${res.status})`);
      }
      router.refresh();
      alert('تم حذف الفاتورة نهائياً');
    } catch (e: any) {
      alert(e?.message || 'تعذر حذف الفاتورة');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex justify-center gap-2">
      {canPrint && (
        <Link
          href={`/print/invoice/${invoiceId}`}
          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="عرض / طباعة"
        >
          <Printer size={18} />
        </Link>
      )}
      {canHardDelete && (
        <button
          type="button"
          onClick={handleHardDelete}
          disabled={deleting}
          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
          title="حذف نهائي (مسودة/ملغاة)"
        >
          {deleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
        </button>
      )}
    </div>
  );
}
