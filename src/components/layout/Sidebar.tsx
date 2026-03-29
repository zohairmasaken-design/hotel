'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  CalendarDays, 
  BedDouble, 
  Users, 
  FileText, 
  Settings, 
  LogOut,
  Languages,
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
import { useAppLanguage } from '@/hooks/useAppLanguage';

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
  const { language, toggleLanguage } = useAppLanguage();
  const router = useRouter();
  const isAdmin = role === 'admin';
  const isManager = role === 'manager';
  const isReceptionist = role === 'receptionist';
  const isHousekeeping = role === 'housekeeping';
  const isAccountant = role === 'accountant';
  const isMarketing = role === 'marketing';

  const t = (ar: string, en: string) => (language === 'en' ? en : ar);
  const onToggleLanguage = () => {
    toggleLanguage();
    router.refresh();
  };

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
        <h1 className="text-xl font-bold text-blue-600">{t('مساكن', 'Masaken')}<span className="text-gray-900">{t('App', 'App')}</span></h1>
        <p className="text-xs text-gray-500 mt-1">{t('نظام إدارة الفنادق المتكامل', 'All‑in‑one hotel management')}</p>
      </div>

      <nav className="flex-1 p-2 xl:p-4 space-y-1 overflow-y-auto">
        <div className="mb-4">
            <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 hidden xl:block">{t('العمليات', 'Operations')}</p>
            {isHousekeeping ? (
              <>
                <SidebarItem icon={Wrench} label={t('صيانة الوحدات', 'Maintenance')} href="/maintenance" onClick={onNavigate} />
                <SidebarItem icon={Brush} label={t('تنظيف الوحدات', 'Cleaning')} href="/cleaning" onClick={onNavigate} />
              </>
            ) : (
              <>
                {isReceptionist ? (
                  <>
                    <SidebarItem icon={LayoutDashboard} label={t('لوحة التحكم', 'Dashboard')} href="/" onClick={onNavigate} />
                    <SidebarItem icon={FileText} label={t('الفواتير', 'Invoices')} href="/invoices" onClick={onNavigate} />
                    <SidebarItem icon={CreditCard} label={t('المدفوعات', 'Payments')} href="/payments" onClick={onNavigate} />
                    <SidebarItem icon={Users} label={t('العملاء والضيوف', 'Customers')} href="/customers" onClick={onNavigate} />
                    <SidebarItem icon={ScrollText} label={t('حالة الوحدات', 'Unit Status')} href="/booking-intake" onClick={onNavigate} />
                    <SidebarItem icon={Wrench} label={t('صيانة الوحدات', 'Maintenance')} href="/maintenance" onClick={onNavigate} />
                    <SidebarItem icon={Brush} label={t('تنظيف الوحدات', 'Cleaning')} href="/cleaning" onClick={onNavigate} />
                    <SidebarItem icon={Bell} label={t('التنبيهات', 'Notifications')} href="/notifications" onClick={onNavigate} />
                    <SidebarItem icon={FileText} label={t('أرشيف الوثائق', 'Documents')} href="/documents-archive" onClick={onNavigate} />
                  </>
                ) : isAccountant ? (
                  <>
                    <SidebarItem icon={LayoutDashboard} label={t('لوحة التحكم', 'Dashboard')} href="/" onClick={onNavigate} />
                    <SidebarItem icon={CalendarDays} label={t('حجز جديد', 'New Booking')} href="/bookings" onClick={onNavigate} />
                    <SidebarItem icon={ScrollText} label={t('تعبئة بيانات الحجز', 'Booking Intake')} href="/booking-intake" onClick={onNavigate} />
                    <SidebarItem icon={List} label={t('سجل الحجوزات', 'Bookings Log')} href="/bookings-list" onClick={onNavigate} />
                    <SidebarItem icon={Users} label={t('العملاء والضيوف', 'Customers')} href="/customers" onClick={onNavigate} />
                    <SidebarItem icon={Wrench} label={t('صيانة الوحدات', 'Maintenance')} href="/maintenance" onClick={onNavigate} />
                    <SidebarItem icon={Brush} label={t('تنظيف الوحدات', 'Cleaning')} href="/cleaning" onClick={onNavigate} />
                  </>
                ) : isMarketing ? (
                  <>
                    <SidebarItem icon={LayoutDashboard} label={t('لوحة التحكم', 'Dashboard')} href="/" onClick={onNavigate} />
                    <SidebarItem icon={ScrollText} label={t('تعبئة بيانات الحجز', 'Booking Intake')} href="/booking-intake" onClick={onNavigate} />
                    <SidebarItem icon={Users} label={t('العملاء والضيوف', 'Customers')} href="/customers" onClick={onNavigate} />
                  </>
                ) : (
                  <>
                    <SidebarItem icon={LayoutDashboard} label={t('لوحة التحكم', 'Dashboard')} href="/" onClick={onNavigate} />
                    <SidebarItem icon={CalendarDays} label={t('حجز جديد', 'New Booking')} href="/bookings" onClick={onNavigate} />
                    <SidebarItem icon={Layers} label={t('حجز متعدد', 'Group Booking')} href="/group-bookings" onClick={onNavigate} disabled />
                    <SidebarItem icon={ScrollText} label={t('تعبئة بيانات الحجز', 'Booking Intake')} href="/booking-intake" onClick={onNavigate} />
                    <SidebarItem icon={List} label={t('سجل الحجوزات', 'Bookings Log')} href="/bookings-list" onClick={onNavigate} />
                    {(isAdmin || isManager) && <SidebarItem icon={BedDouble} label={t('الوحدات', 'Units')} href="/units" onClick={onNavigate} />}
                    <SidebarItem icon={Wrench} label={t('صيانة الوحدات', 'Maintenance')} href="/maintenance" onClick={onNavigate} />
                    <SidebarItem icon={Brush} label={t('تنظيف الوحدات', 'Cleaning')} href="/cleaning" onClick={onNavigate} />
                    <SidebarItem icon={Bell} label={t('التنبيهات', 'Notifications')} href="/notifications" onClick={onNavigate} />
                    <SidebarItem icon={Users} label={t('العملاء والضيوف', 'Customers')} href="/customers" onClick={onNavigate} />
                    <SidebarItem icon={ScrollText} label={t('التمبلت', 'Templates')} href="/templates" onClick={onNavigate} />
                    <SidebarItem icon={FileText} label={t('أرشيف الوثائق', 'Documents')} href="/documents-archive" onClick={onNavigate} />
                  </>
                )}
              </>
            )}
        </div>

        {!isReceptionist && !isHousekeeping && (
          <div className="mb-4">
              <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 hidden xl:block">{t('المالية والتقارير', 'Finance & Reports')}</p>
              {!isMarketing && (
                <>
                  <SidebarItem icon={FileText} label={t('الفواتير', 'Invoices')} href="/invoices" onClick={onNavigate} />
                  <SidebarItem icon={CreditCard} label={t('المدفوعات', 'Payments')} href="/payments" onClick={onNavigate} />
                </>
              )}
              <SidebarItem icon={PieChart} label={t('التقارير', 'Reports')} href="/reports" onClick={onNavigate} />
          </div>
        )}

        {!isReceptionist && !isHousekeeping && (!isManager || isAccountant) && !isMarketing && (
          <div className="mb-4">
              <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 hidden xl:block">{t('المحاسبة', 'Accounting')}</p>
              <SidebarItem icon={BookOpen} label={t('دليل الحسابات', 'Chart of Accounts')} href="/accounting/chart-of-accounts" onClick={onNavigate} />
              <SidebarItem icon={ScrollText} label={t('كشف حساب', 'Statement')} href="/accounting/statement" onClick={onNavigate} />
              <SidebarItem icon={CalendarDays} label={t('الفترات المحاسبية', 'Periods')} href="/accounting/periods" onClick={onNavigate} />
              <SidebarItem icon={Building2} label={t('تسوية المنصات', 'Platforms')} href="/accounting/platforms" onClick={onNavigate} />
              <SidebarItem icon={ArrowLeftRight} label={t('قيود يدوية', 'Manual Entries')} href="/accounting/manual-entry" onClick={onNavigate} />
          </div>
        )}

        <div>
            <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 hidden xl:block">{t('النظام', 'System')}</p>
            {isAdmin && (
              <>
                <SidebarItem icon={UserCog} label={t('المستخدمين والصلاحيات', 'Users & Roles')} href="/admin/users" onClick={onNavigate} />
                <SidebarItem icon={HistoryIcon} label={t('سجل مراقبة النظام', 'Audit Log')} href="/admin/audit-log" onClick={onNavigate} />
              </>
            )}
            
            {!isReceptionist && !isHousekeeping && !isManager && !isAccountant && !isMarketing && (
              <SidebarItem icon={Settings} label={t('الإعدادات', 'Settings')} href="/settings" onClick={onNavigate} />
            )}
        </div>
      </nav>

      <div className="p-2 xl:p-4 border-t">
        <button
          onClick={onToggleLanguage}
          className="flex items-center gap-3 px-3 py-2 w-full hover:bg-gray-100 rounded-md transition-colors lg:justify-center xl:justify-start text-gray-700"
        >
          <Languages size={20} />
          <span className="hidden xl:inline">{language === 'en' ? 'العربية' : 'English'}</span>
        </button>
        <button className="flex items-center gap-3 px-3 py-2 w-full text-right text-red-600 hover:bg-red-50 rounded-md transition-colors lg:justify-center xl:justify-start">
          <LogOut size={20} />
          <span className="hidden xl:inline">{t('تسجيل الخروج', 'Sign out')}</span>
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
