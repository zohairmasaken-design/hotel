import React from 'react';
import { Bell } from 'lucide-react';
import ActivityLog from '@/components/notifications/ActivityLog';

export const metadata = {
  title: 'تنبيهات النظام',
};

export default async function NotificationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
            <Bell size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">تنبيهات النظام</h1>
            <p className="text-gray-500 text-sm">متابعة الأحداث المهمة للحجوزات والوحدات والموظفين</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <ActivityLog />
      </div>
    </div>
  );
}
