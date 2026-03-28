'use client';

import React from 'react';

type Status = 'ok' | 'bad';

export default function DeviceStatusToggle({ defaultStatus = 'ok' }: { defaultStatus?: Status }) {
  const [status, setStatus] = React.useState<Status>(defaultStatus);

  return (
    <div className="flex items-center justify-center">
      <button
        type="button"
        onClick={() => setStatus((s) => (s === 'ok' ? 'bad' : 'ok'))}
        className={`w-8 h-8 rounded-lg border flex items-center justify-center text-[16px] font-black transition-colors print:border-transparent print:w-6 print:h-6 ${
          status === 'ok'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}
        aria-label={status === 'ok' ? 'صح' : 'خطأ'}
        title={status === 'ok' ? 'صح' : 'خطأ'}
      >
        {status === 'ok' ? '✓' : '✗'}
      </button>
    </div>
  );
}
