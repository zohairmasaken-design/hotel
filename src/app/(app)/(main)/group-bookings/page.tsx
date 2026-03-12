'use client';

import React from 'react';
import { GroupBookingWizard } from '@/components/group-bookings/GroupBookingWizard';
import { Layers } from 'lucide-react';

export default function GroupBookingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
            <Layers size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">حجز متعدد</h1>
            <p className="text-gray-500 text-sm">إنشاء حجز لعدة وحدات في عملية واحدة</p>
          </div>
        </div>
      </div>

      <GroupBookingWizard />
    </div>
  );
}
