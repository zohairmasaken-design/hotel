'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  CalendarDays, 
  BedDouble, 
  Users, 
  FileText, 
  Settings, 
  LogOut,
  CreditCard,
  PieChart,
  List,
  BookOpen,
  ScrollText,
  UserCog,
  Wrench,
  Brush,
  Bell,
  Building2,
    Layers,
    ArrowLeftRight,
    History as HistoryIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserRole } from '@/hooks/useUserRole';

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  href: string;
  onClick?: () => void;
  disabled?: boolean;
}

const SidebarItem = ({ icon: Icon, label, href, onClick, disabled }: SidebarItemProps) => {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link 
      href={href}
      onClick={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        onClick?.();
      }}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
        "lg:justify-center xl:justify-start lg:group-hover:justify-start",
        "hover:bg-gray-100 text-gray-700",
        isActive && "bg-blue-50 text-blue-600 font-medium",
        disabled && "opacity-50 cursor-not-allowed pointer-events-none"
      )}
      aria-disabled={disabled ? true : undefined}
      title={label}
    >
      <Icon size={20} />
      <span className="hidden xl:inline lg:group-hover:inline">{label}</span>
    </Link>
  );
};

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { role, loading } = useUserRole();
  const isAdmin = role === 'admin';
  const isManager = role === 'manager';
  const isReceptionist = role === 'receptionist';
  const isHousekeeping = role === 'housekeeping';

  // Helper to show/hide items based on role
  // If role is loading, we default to showing nothing or safe items to prevent flickering of forbidden items?
  // Or we show skeleton? For now, let's just render. 
  // If loading, role is null. isReceptionist is false. So we might show items briefly?
  // Better to check if loading.
  
  if (loading) {
    return (
      <div className="p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-3/4 mb-6"></div>
        <div className="space-y-4">
          <div className="h-4 bg-gray-200 rounded w-full"></div>
          <div className="h-4 bg-gray-200 rounded w-full"></div>
          <div className="h-4 bg-gray-200 rounded w-full"></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-6 border-b hidden xl:block">
        <h1 className="text-xl font-bold text-blue-600">مساكن<span className="text-gray-900">App</span></h1>
        <p className="text-xs text-gray-500 mt-1">نظام إدارة الفنادق المتكامل</p>
      </div>

      <nav className="flex-1 p-2 xl:p-4 space-y-1 overflow-y-auto">
        <div className="mb-4">
            <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 hidden xl:block">العمليات</p>
            {isHousekeeping ? (
              <>
                <SidebarItem icon={Wrench} label="صيانة الوحدات" href="/maintenance" onClick={onNavigate} />
                <SidebarItem icon={Brush} label="تنظيف الوحدات" href="/cleaning" onClick={onNavigate} />
              </>
            ) : (
              <>
                {isReceptionist ? (
                  <>
                    <SidebarItem icon={LayoutDashboard} label="لوحة التحكم" href="/" onClick={onNavigate} />
                    <SidebarItem icon={FileText} label="الفواتير" href="/invoices" onClick={onNavigate} />
                    <SidebarItem icon={CreditCard} label="المدفوعات" href="/payments" onClick={onNavigate} />
                    <SidebarItem icon={Users} label="العملاء والضيوف" href="/customers" onClick={onNavigate} />
                    <SidebarItem icon={ScrollText} label="حالة الوحدات " href="/booking-intake" onClick={onNavigate} />
                    <SidebarItem icon={Wrench} label="صيانة الوحدات" href="/maintenance" onClick={onNavigate} />
                    <SidebarItem icon={Brush} label="تنظيف الوحدات" href="/cleaning" onClick={onNavigate} />
                    <SidebarItem icon={Bell} label="التنبيهات" href="/notifications" onClick={onNavigate} />
                    <SidebarItem icon={FileText} label="أرشيف الوثائق" href="/documents-archive" onClick={onNavigate} />
                  </>
                ) : (
                  <>
                    <SidebarItem icon={LayoutDashboard} label="لوحة التحكم" href="/" onClick={onNavigate} />
                    <SidebarItem icon={CalendarDays} label="حجز جديد" href="/bookings" onClick={onNavigate} />
                    <SidebarItem icon={Layers} label="حجز متعدد" href="/group-bookings" onClick={onNavigate} disabled />
                    <SidebarItem icon={ScrollText} label="تعبئة بيانات الحجز" href="/booking-intake" onClick={onNavigate} />
                    <SidebarItem icon={List} label="سجل الحجوزات" href="/bookings-list" onClick={onNavigate} />
                    {!isManager && <SidebarItem icon={BedDouble} label="الوحدات" href="/units" onClick={onNavigate} />}
                    <SidebarItem icon={Wrench} label="صيانة الوحدات" href="/maintenance" onClick={onNavigate} />
                    <SidebarItem icon={Brush} label="تنظيف الوحدات" href="/cleaning" onClick={onNavigate} />
                    <SidebarItem icon={Bell} label="التنبيهات" href="/notifications" onClick={onNavigate} />
                    <SidebarItem icon={Users} label="العملاء والضيوف" href="/customers" onClick={onNavigate} />
                    <SidebarItem icon={ScrollText} label="التمبلت" href="/templates" onClick={onNavigate} />
                    <SidebarItem icon={FileText} label="أرشيف الوثائق" href="/documents-archive" onClick={onNavigate} />
                  </>
                )}
              </>
            )}
        </div>

        {!isReceptionist && !isHousekeeping && (
          <div className="mb-4">
              <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 hidden xl:block">المالية</p>
              <SidebarItem icon={FileText} label="الفواتير" href="/invoices" onClick={onNavigate} />
              <SidebarItem icon={CreditCard} label="المدفوعات" href="/payments" onClick={onNavigate} />
              {!isManager && <SidebarItem icon={PieChart} label="التقارير" href="/reports" onClick={onNavigate} />}
          </div>
        )}

        {!isReceptionist && !isHousekeeping && !isManager && (
          <div className="mb-4">
              <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 hidden xl:block">المحاسبة</p>
              <SidebarItem icon={BookOpen} label="دليل الحسابات" href="/accounting/chart-of-accounts" onClick={onNavigate} />
              <SidebarItem icon={ScrollText} label="كشف حساب" href="/accounting/statement" onClick={onNavigate} />
              <SidebarItem icon={CalendarDays} label="الفترات المحاسبية" href="/accounting/periods" onClick={onNavigate} />
              <SidebarItem icon={Building2} label="تسوية المنصات" href="/accounting/platforms" onClick={onNavigate} />
              <SidebarItem icon={ArrowLeftRight} label="قيود يدوية" href="/accounting/manual-entry" onClick={onNavigate} />
          </div>
        )}

        <div>
            <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 hidden xl:block">النظام</p>
            {isAdmin && (
              <>
                <SidebarItem icon={UserCog} label="المستخدمين والصلاحيات" href="/admin/users" onClick={onNavigate} />
                <SidebarItem icon={HistoryIcon} label="سجل مراقبة النظام" href="/admin/audit-log" onClick={onNavigate} />
              </>
            )}
            
            {!isReceptionist && !isHousekeeping && !isManager && (
              <SidebarItem icon={Settings} label="الإعدادات" href="/settings" onClick={onNavigate} />
            )}
        </div>
      </nav>

      <div className="p-2 xl:p-4 border-t">
        <button className="flex items-center gap-3 px-3 py-2 w-full text-right text-red-600 hover:bg-red-50 rounded-md transition-colors lg:justify-center xl:justify-start">
          <LogOut size={20} />
          <span className="hidden xl:inline">تسجيل الخروج</span>
        </button>
      </div>
    </>
  );
}

export default function Sidebar() {
  return (
    <aside className="group hidden 2xl:flex 2xl:w-64 transition-[width] duration-300 border-l bg-white h-screen flex-col fixed right-0 top-0 z-50 overflow-y-auto overflow-x-hidden">
      <SidebarContent />
    </aside>
  );
}
