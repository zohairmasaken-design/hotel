'use client';

import React, { useCallback, useState } from 'react';
import { Printer, FileDown, Mail, MessageSquare } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { supabase } from '@/lib/supabase';

function getFileName() {
  const d = new Date();
  const ts = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}_${d.getHours().toString().padStart(2,'0')}-${d.getMinutes().toString().padStart(2,'0')}`;
  return `invoice_${ts}.pdf`;
}

async function capturePDF(selector = 'body', a4 = true) {
  const el = document.querySelector(selector) as HTMLElement;
  const canvas = await html2canvas(el, { scale: 2, useCORS: true });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF(a4 ? 'p' : 'p', 'mm', a4 ? 'a4' : [80, 200]);
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let imgWidth = pageWidth;
  let imgHeight = (canvas.height * imgWidth) / canvas.width;
  if (imgHeight > pageHeight) {
    const scale = pageHeight / imgHeight;
    imgWidth = imgWidth * scale;
    imgHeight = pageHeight;
  }
  const offsetX = (pageWidth - imgWidth) / 2;
  pdf.addImage(imgData, 'PNG', offsetX, 0, imgWidth, imgHeight);
  return pdf.output('blob');
}

function normalizePhone(input: string | undefined): string | null {
  if (!input) return null;
  let p = input.replace(/\D/g, '');
  if (p.startsWith('0')) p = '966' + p.slice(1);
  if (!p.startsWith('966')) p = '966' + p;
  return p;
}

export default function EnhancedPrintActions({ containerSelector = 'body', currentId, customerPhone }: { containerSelector?: string; currentId?: string, customerPhone?: string }) {
  const [sending, setSending] = useState(false);

  const handlePrintA4 = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'a4');
    url.searchParams.set('print', '1');
    window.open(url.toString(), '_blank');
  }, []);

  const handlePrintThermal = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'thermal');
    url.searchParams.set('print', '1');
    window.open(url.toString(), '_blank');
  }, []);

  const handleSavePdf = useCallback(async (a4: boolean) => {
    const blob = await capturePDF(containerSelector, a4);
    const fileName = getFileName();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [containerSelector]);

  const uploadToStorage = async (blob: Blob, name: string) => {
    const { data, error } = await supabase.storage.from('invoices').upload(name, blob, {
      contentType: 'application/pdf',
      upsert: true,
    });
    if (error) throw error;
    const { data: pub } = supabase.storage.from('invoices').getPublicUrl(name);
    return pub.publicUrl;
  };

  const handleSendEmail = useCallback(async () => {
    try {
      setSending(true);
      const email = window.prompt('أدخل البريد الإلكتروني للمرسل إليه:');
      if (!email) return;
      const blob = await capturePDF(containerSelector, true);
      const fileName = getFileName();
      const url = await uploadToStorage(blob, fileName);
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email, subject: 'فاتورة إقامة', fileUrl: url, fileName }),
      });
      if (!res.ok) throw new Error('فشل إرسال البريد');
      alert('تم إرسال البريد بنجاح');
    } catch (e: any) {
      alert('تعذر الإرسال، يرجى التحقق من الإعدادات: ' + e.message);
    } finally {
      setSending(false);
    }
  }, [containerSelector]);

  const handleSendWhatsApp = useCallback(async () => {
    try {
      setSending(true);
      const autoPhone = normalizePhone(customerPhone);
      const phone = autoPhone || window.prompt('أدخل رقم واتساب مع رمز الدولة (مثال: 9665XXXXXXXX):') || '';
      const normalized = normalizePhone(phone);
      if (!normalized) return;
      const blob = await capturePDF(containerSelector, true);
      const fileName = getFileName();
      const url = await uploadToStorage(blob, fileName);
      const res = await fetch('/api/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: normalized, fileUrl: url, fileName }),
      });
      if (res.status === 501) {
        window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(url)}`, '_blank');
        alert('تم فتح واتساب برسالة تحتوي رابط الملف (يلزم تفعيل API للارسال كملف)');
      } else if (!res.ok) {
        throw new Error('فشل إرسال واتساب');
      } else {
        alert('تم إرسال الملف عبر واتساب بنجاح');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert('تعذر الإرسال، يرجى التحقق من الإعدادات: ' + msg);
    } finally {
      setSending(false);
    }
  }, [containerSelector, customerPhone]);

  return (
    <div className="fixed top-6 right-6 z-50 print:hidden flex gap-2 flex-wrap">
      <button 
        onClick={handlePrintA4} 
        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow flex items-center gap-2"
      >
        <Printer size={18} />
        طباعة A4
      </button>
      <button 
        onClick={handlePrintThermal} 
        className="bg-gray-900 hover:bg-gray-800 text-white font-bold py-2 px-4 rounded-lg shadow flex items-center gap-2"
      >
        <Printer size={18} />
        طباعة حرارية
      </button>
      <button 
        onClick={() => handleSavePdf(true)} 
        className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg shadow flex items-center gap-2"
      >
        <FileDown size={18} />
        حفظ PDF
      </button>
      <button 
        onClick={handleSendEmail} 
        disabled={sending}
        className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow flex items-center gap-2 disabled:opacity-50"
      >
        <Mail size={18} />
        إرسال بريد
      </button>
      <button 
        onClick={handleSendWhatsApp} 
        disabled={sending}
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg shadow flex items-center gap-2 disabled:opacity-50"
      >
        <MessageSquare size={18} />
        واتساب
      </button>
    </div>
  );
}
