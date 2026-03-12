'use client';

import React, { useState } from 'react';
import { Settings2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContractControlsProps {
  agentName?: string;
  agentTitle?: string;
  durationNote?: string;
  rentNote?: string;
  removeAgentHref: string;
  removeRentHref: string;
}

export default function ContractControls({
  agentName,
  agentTitle,
  durationNote,
  rentNote,
  removeAgentHref,
  removeRentHref
}: ContractControlsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Toggle Button - Visible on all screens during development, hidden during print */}
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed top-24 left-0 z-[60] p-2 bg-blue-600 text-white rounded-r-xl shadow-lg transition-all active:scale-95 print:hidden",
          isOpen ? "-translate-x-full" : "translate-x-0"
        )}
        aria-label="إعدادات العقد"
      >
        <Settings2 size={24} />
      </button>

      {/* Drawer Overlay - Visible on all screens when open */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[60] animate-in fade-in duration-300 print:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Controls Container - Hidden by default on all screens */}
      <div 
        className={cn(
          "fixed top-6 left-6 z-[70] print:hidden space-y-3 transition-transform duration-300 ease-out",
          !isOpen ? "-translate-x-[120%]" : "translate-x-0"
        )}
      >
        {/* Close header */}
        <div className="flex items-center justify-between bg-white/95 backdrop-blur p-2 rounded-t-xl border-x border-t border-gray-200">
          <span className="text-xs font-bold text-gray-500 px-2">إعدادات الطباعة</span>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-1.5 bg-gray-100 rounded-lg text-gray-500 hover:bg-gray-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form method="get" className="bg-white/95 backdrop-blur rounded-xl lg:rounded-xl border border-gray-200 shadow-2xl lg:shadow-md p-3 w-80 max-w-[90vw]">
          <div className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div>
            إضافة موقّع وكيل
          </div>
          <div className="space-y-2.5">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1 block">اسم الوكيل</label>
              <input name="agentName" defaultValue={agentName || ''} className="w-full border border-gray-200 bg-gray-50 focus:bg-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="مثال: فلان بن فلان" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1 block">الصفة</label>
              <input name="agentTitle" defaultValue={agentTitle || 'وكيل'} className="w-full border border-gray-200 bg-gray-50 focus:bg-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="وكيل / مفوّض" />
            </div>
            {durationNote ? <input type="hidden" name="durationNote" value={durationNote} /> : null}
            {rentNote ? <input type="hidden" name="rentNote" value={rentNote} /> : null}
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-gray-100 mt-2">
              <a href={removeAgentHref} className="text-[11px] px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">إزالة</a>
              <button type="submit" className="text-[11px] px-4 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all font-bold shadow-sm active:scale-95">
                تطبيق التغييرات
              </button>
            </div>
          </div>
        </form>

        <form method="get" className="bg-white/95 backdrop-blur rounded-xl lg:rounded-xl border border-gray-200 shadow-2xl lg:shadow-md p-3 w-80 max-w-[90vw]">
          <div className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div>
            تعديل نص الأجرة
          </div>
          <div className="space-y-2.5">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1 block">نص الأجرة المخصص</label>
              <textarea name="rentNote" defaultValue={rentNote || ''} rows={3} placeholder="اكتب نص الأجرة المخصص..." className="w-full border border-gray-200 bg-gray-50 focus:bg-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none" />
            </div>
            {durationNote ? <input type="hidden" name="durationNote" value={durationNote} /> : null}
            {agentName ? <input type="hidden" name="agentName" value={agentName} /> : null}
            {agentTitle ? <input type="hidden" name="agentTitle" value={agentTitle} /> : null}
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-gray-100 mt-2">
              <a href={removeRentHref} className="text-[11px] px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">مسح</a>
              <button type="submit" className="text-[11px] px-4 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all font-bold shadow-sm active:scale-95">
                تطبيق النص
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
