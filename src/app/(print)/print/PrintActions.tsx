'use client';

import React, { useMemo, useState } from 'react';
import { Printer, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function PrintActions() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'normal' | 'custom'>('normal');
  const [text, setText] = useState('');
  const currentNote = useMemo(() => {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get('note') || '';
    } catch {
      return '';
    }
  }, []);

  const apply = () => {
    const url = new URL(window.location.href);
    if (mode === 'normal') {
      url.searchParams.delete('note');
    } else {
      url.searchParams.set('note', text.trim());
    }
    window.location.href = url.toString();
  };

  const handlePrint = async () => {
    try {
      const { data: { user: actor } } = await supabase.auth.getUser();
      const url = new URL(window.location.href);
      const path = url.pathname;
      const parts = path.split('/').filter(Boolean);
      const docType = parts.length > 1 ? parts[1] : 'unknown';
      const sourceId = parts.length > 2 ? parts[2] : null;
      await supabase.from('system_events').insert({
        event_type: 'document_printed',
        message: `طباعة مستند ${docType}`,
        payload: {
          path,
          doc_type: docType,
          source_id: sourceId,
          note: url.searchParams.get('note') || null,
          actor_id: actor?.id || null,
          actor_email: actor?.email || null
        }
      });
    } catch {}
    window.print();
  };

  return (
    <div className="fixed top-6 right-6 z-50 print:hidden flex flex-col gap-3 items-end">
      <button 
        onClick={handlePrint} 
        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-full shadow-lg flex items-center gap-2 transition-transform hover:scale-105"
      >
        <Printer size={20} />
        طباعة / حفظ PDF
      </button>

      <div className="relative">
        <button
          onClick={() => {
            setOpen((v) => !v);
            setMode(currentNote ? 'custom' : 'normal');
            setText(currentNote || '');
          }}
          className="bg-gray-900 hover:bg-black text-white font-bold py-3 px-6 rounded-full shadow-lg flex items-center gap-2 transition-transform hover:scale-105"
        >
          <ChevronDown size={18} />
          إضافة ملاحظة
        </button>

        {open && (
          <div className="absolute mt-2 right-0 w-80 bg-white border border-gray-200 rounded-xl shadow-xl p-3">
            <div className="space-y-3">
              <div className="text-sm font-bold text-gray-900">ملاحظة الطباعة</div>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value === 'custom' ? 'custom' : 'normal')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="normal">عادية (بدون تغيير)</option>
                <option value="custom">إضافة ملاحظة</option>
              </select>
              {mode === 'custom' && (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="اكتب الملاحظة المراد طباعتها"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={3}
                />
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-bold"
                >
                  إغلاق
                </button>
                <button
                  onClick={apply}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold"
                >
                  تطبيق
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
