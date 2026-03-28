'use client';

import React from 'react';
import { PenLine, X } from 'lucide-react';
import SignaturePad from '@/components/SignaturePad';

export default function ElectronicSignatureField({
  label,
  secondaryLabel
}: {
  label: string;
  secondaryLabel?: string;
}) {
  const [showPad, setShowPad] = React.useState(false);
  const [signature, setSignature] = React.useState<string | null>(null);

  return (
    <div className="border border-gray-300 rounded-xl p-3 bg-white relative group">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-black text-gray-900 text-sm truncate">{label}</div>
          {secondaryLabel ? <div className="text-[11px] text-gray-600 truncate">{secondaryLabel}</div> : null}
        </div>
        <div className="flex items-center gap-1 print:hidden">
          {!signature ? (
            <button
              type="button"
              onClick={() => setShowPad(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-black hover:bg-blue-700"
            >
              <PenLine size={14} />
              توقيع
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSignature(null)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-black hover:bg-red-100"
            >
              <X size={14} />
              مسح
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 h-16 border border-dashed border-gray-400 rounded-lg flex items-center justify-center relative overflow-hidden">
        {signature ? (
          <img src={signature} alt="Signature" className="h-[60px] w-auto object-contain" style={{ mixBlendMode: 'multiply' }} />
        ) : (
          <span className="text-[10px] text-gray-500 print:hidden">اضغط توقيع</span>
        )}
      </div>

      {showPad && (
        <SignaturePad
          onSave={(dataUrl) => {
            setSignature(dataUrl);
            setShowPad(false);
          }}
          onCancel={() => setShowPad(false)}
        />
      )}
    </div>
  );
}

