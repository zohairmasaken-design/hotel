'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Menu, X,
  LayoutDashboard,
  CalendarDays,
  BedDouble,
  Users,
  FileText,
  CreditCard,
  List as ListIcon,
  ScrollText,
  Wrench,
  Brush,
  Bell,
  Layers,
  Settings,
  PieChart,
  BookOpen,
  Building2,
  ArrowLeftRight,
  UserCog,
  History as HistoryIcon,
  Languages
} from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { useAppLanguage } from '@/hooks/useAppLanguage';

export default function FloatingSidebar() {
  const [open, setOpen] = useState(false);
  const { language, toggleLanguage } = useAppLanguage();
  const router = useRouter();
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;
    const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
    return { x: w - 80, y: h - 120 };
  });
  const dragging = useRef(false);
  const offset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const { role, loading } = useUserRole();
  const isAdmin = role === 'admin';
  const isManager = role === 'manager';
  const isReceptionist = role === 'receptionist';
  const isHousekeeping = role === 'housekeeping';
  const isAccountant = role === 'accountant';
  const isMarketing = role === 'marketing';

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const nx = e.clientX - offset.current.x;
      const ny = e.clientY - offset.current.y;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const clampedX = Math.max(8, Math.min(nx, w - 72));
      const clampedY = Math.max(8, Math.min(ny, h - 72));
      setPos({ x: clampedX, y: clampedY });
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const onDown = (e: React.PointerEvent) => {
    if (!btnRef.current) return;
    dragging.current = true;
    const rect = btnRef.current.getBoundingClientRect();
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    document.body.style.userSelect = 'none';
  };

  const openUp = typeof window !== 'undefined' ? pos.y > window.innerHeight / 2 : false;
  const t = (ar: string, en: string) => (language === 'en' ? en : ar);
  const onToggleLanguage = () => {
    toggleLanguage();
    router.refresh();
  };

  return (
    <div className="block 2xl:hidden">
      <button
        ref={btnRef}
        onPointerDown={onDown}
        onClick={() => setOpen(v => !v)}
        style={{ left: pos.x, top: pos.y }}
        className="fixed z-50 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-blue-600 text-white shadow-2xl flex items-center justify-center active:scale-95 transition-transform"
        aria-label={t('القائمة', 'Menu')}
      >
        {open ? <X /> : <Menu />}
      </button>

      {open && (() => {
        const ww = typeof window !== 'undefined' ? window.innerWidth : 1200;
        const wh = typeof window !== 'undefined' ? window.innerHeight : 800;
        const menuW = 280;
        const menuH = Math.floor(wh * 0.7);
        const minX = 8 + menuW / 2;
        const maxX = ww - 8 - menuW / 2;
        const left = Math.max(minX, Math.min(pos.x, maxX));

        // Generate Tabs based on Sidebar.tsx logic
        const tabs: { href: string; label: string; icon: any; adminOnly?: boolean; hideFromManager?: boolean }[] = [];

        if (isHousekeeping) {
          tabs.push({ href: '/maintenance', label: t('صيانة الوحدات', 'Maintenance'), icon: Wrench });
          tabs.push({ href: '/cleaning', label: t('تنظيف الوحدات', 'Cleaning'), icon: Brush });
        } else if (isReceptionist) {
          tabs.push({ href: '/', label: t('لوحة التحكم', 'Dashboard'), icon: LayoutDashboard });
          tabs.push({ href: '/invoices', label: t('الفواتير', 'Invoices'), icon: FileText });
          tabs.push({ href: '/payments', label: t('المدفوعات', 'Payments'), icon: CreditCard });
          tabs.push({ href: '/customers', label: t('العملاء والضيوف', 'Customers'), icon: Users });
          tabs.push({ href: '/booking-intake', label: t('حالة الوحدات', 'Unit Status'), icon: ScrollText });
          tabs.push({ href: '/maintenance', label: t('صيانة الوحدات', 'Maintenance'), icon: Wrench });
          tabs.push({ href: '/cleaning', label: t('تنظيف الوحدات', 'Cleaning'), icon: Brush });
          tabs.push({ href: '/notifications', label: t('التنبيهات', 'Notifications'), icon: Bell });
          tabs.push({ href: '/documents-archive', label: t('أرشيف الوثائق', 'Documents'), icon: FileText });
        } else if (isAccountant) {
          tabs.push({ href: '/', label: t('لوحة التحكم', 'Dashboard'), icon: LayoutDashboard });
          tabs.push({ href: '/bookings', label: t('حجز جديد', 'New Booking'), icon: CalendarDays });
          tabs.push({ href: '/booking-intake', label: t('تعبئة بيانات الحجز', 'Booking Intake'), icon: ScrollText });
          tabs.push({ href: '/bookings-list', label: t('سجل الحجوزات', 'Bookings Log'), icon: ListIcon });
          tabs.push({ href: '/customers', label: t('العملاء والضيوف', 'Customers'), icon: Users });
          tabs.push({ href: '/maintenance', label: t('صيانة الوحدات', 'Maintenance'), icon: Wrench });
          tabs.push({ href: '/cleaning', label: t('تنظيف الوحدات', 'Cleaning'), icon: Brush });
          tabs.push({ href: '/invoices', label: t('الفواتير', 'Invoices'), icon: FileText });
          tabs.push({ href: '/payments', label: t('المدفوعات', 'Payments'), icon: CreditCard });
          tabs.push({ href: '/reports', label: t('التقارير', 'Reports'), icon: PieChart });
          tabs.push({ href: '/accounting/chart-of-accounts', label: t('دليل الحسابات', 'Accounts'), icon: BookOpen });
          tabs.push({ href: '/accounting/statement', label: t('كشف حساب', 'Statement'), icon: ScrollText });
          tabs.push({ href: '/accounting/periods', label: t('الفترات المحاسبية', 'Periods'), icon: CalendarDays });
          tabs.push({ href: '/accounting/platforms', label: t('تسوية المنصات', 'Platforms'), icon: Building2 });
          tabs.push({ href: '/accounting/manual-entry', label: t('قيود يدوية', 'Manual Entries'), icon: ArrowLeftRight });
        } else if (isMarketing) {
          tabs.push({ href: '/', label: t('لوحة التحكم', 'Dashboard'), icon: LayoutDashboard });
          tabs.push({ href: '/booking-intake', label: t('تعبئة بيانات الحجز', 'Booking Intake'), icon: ScrollText });
          tabs.push({ href: '/customers', label: t('العملاء والضيوف', 'Customers'), icon: Users });
          tabs.push({ href: '/reports', label: t('التقارير', 'Reports'), icon: PieChart });
        } else {
          // Admin & Manager
          tabs.push({ href: '/', label: t('لوحة التحكم', 'Dashboard'), icon: LayoutDashboard });
          tabs.push({ href: '/bookings', label: t('حجز جديد', 'New Booking'), icon: CalendarDays });
          tabs.push({ href: '/group-bookings', label: t('حجز متعدد', 'Group Booking'), icon: Layers });
          tabs.push({ href: '/booking-intake', label: t('تعبئة بيانات الحجز', 'Booking Intake'), icon: ScrollText });
          tabs.push({ href: '/bookings-list', label: t('سجل الحجوزات', 'Bookings Log'), icon: ListIcon });
          if (isAdmin || isManager) tabs.push({ href: '/units', label: t('الوحدات', 'Units'), icon: BedDouble });
          tabs.push({ href: '/maintenance', label: t('صيانة الوحدات', 'Maintenance'), icon: Wrench });
          tabs.push({ href: '/cleaning', label: t('تنظيف الوحدات', 'Cleaning'), icon: Brush });
          tabs.push({ href: '/notifications', label: t('التنبيهات', 'Notifications'), icon: Bell });
          tabs.push({ href: '/customers', label: t('العملاء والضيوف', 'Customers'), icon: Users });
          tabs.push({ href: '/templates', label: t('التمبلت', 'Templates'), icon: ScrollText });
          tabs.push({ href: '/documents-archive', label: t('أرشيف الوثائق', 'Documents'), icon: FileText });
          
          // Financial
          tabs.push({ href: '/invoices', label: t('الفواتير', 'Invoices'), icon: FileText });
          tabs.push({ href: '/payments', label: t('المدفوعات', 'Payments'), icon: CreditCard });
          tabs.push({ href: '/reports', label: t('التقارير', 'Reports'), icon: PieChart });

          // Accounting (Admin Only by default, but Manager might need it too if requested)
          // Matching Sidebar.tsx: (!isManager || isAccountant)
          if (!isManager) {
            tabs.push({ href: '/accounting/chart-of-accounts', label: t('دليل الحسابات', 'Accounts'), icon: BookOpen });
            tabs.push({ href: '/accounting/statement', label: t('كشف حساب', 'Statement'), icon: ScrollText });
            tabs.push({ href: '/accounting/periods', label: t('الفترات المحاسبية', 'Periods'), icon: CalendarDays });
            tabs.push({ href: '/accounting/platforms', label: t('تسوية المنصات', 'Platforms'), icon: Building2 });
            tabs.push({ href: '/accounting/manual-entry', label: t('قيود يدوية', 'Manual Entries'), icon: ArrowLeftRight });
          }

          // System
          if (isAdmin) {
            tabs.push({ href: '/admin/users', label: t('الموظفين', 'Users'), icon: UserCog });
            tabs.push({ href: '/admin/audit-log', label: t('سجل المراقبة', 'Audit'), icon: HistoryIcon });
            tabs.push({ href: '/settings', label: t('الإعدادات', 'Settings'), icon: Settings });
          }
        }

        if (openUp) {
          const bottom = Math.max(8, wh - pos.y);
          return (
            <div
              style={{ left, bottom, transform: 'translateX(-50%)' }}
              className="fixed z-50 w-72 max-h-[70vh] bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <div className="text-xs font-bold text-gray-600">{t('القائمة السريعة', 'Quick menu')}</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onToggleLanguage}
                    className="h-8 px-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
                    aria-label={t('تغيير اللغة', 'Change language')}
                  >
                    <Languages size={16} />
                    <span className="text-[10px] font-bold">{language === 'en' ? 'AR' : 'EN'}</span>
                  </button>
                  <X size={16} className="text-gray-400 cursor-pointer" onClick={() => setOpen(false)} />
                </div>
              </div>
              <div className="overflow-y-auto p-3 bg-white">
                <div className="grid grid-cols-3 gap-3">
                  {tabs.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setOpen(false)}
                      className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-blue-50 transition-colors group"
                    >
                      <div className="w-11 h-11 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-600 group-hover:bg-blue-100 group-hover:text-blue-600 group-hover:border-blue-200 transition-all">
                        <Icon size={20} />
                      </div>
                      <div className="text-[10px] font-bold text-gray-700 text-center leading-tight">{label}</div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          );
        } else {
          const maxTop = wh - 8 - menuH;
          const top = Math.max(8, Math.min(pos.y + 72, maxTop));
          return (
            <div
              style={{ left, top, transform: 'translateX(-50%)' }}
              className="fixed z-50 w-72 max-h-[70vh] bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <div className="text-xs font-bold text-gray-600">{t('القائمة السريعة', 'Quick menu')}</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onToggleLanguage}
                    className="h-8 px-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
                    aria-label={t('تغيير اللغة', 'Change language')}
                  >
                    <Languages size={16} />
                    <span className="text-[10px] font-bold">{language === 'en' ? 'AR' : 'EN'}</span>
                  </button>
                  <X size={16} className="text-gray-400 cursor-pointer" onClick={() => setOpen(false)} />
                </div>
              </div>
              <div className="overflow-y-auto p-3 bg-white">
                <div className="grid grid-cols-3 gap-3">
                  {tabs.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setOpen(false)}
                      className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-blue-50 transition-colors group"
                    >
                      <div className="w-11 h-11 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-600 group-hover:bg-blue-100 group-hover:text-blue-600 group-hover:border-blue-200 transition-all">
                        <Icon size={20} />
                      </div>
                      <div className="text-[10px] font-bold text-gray-700 text-center leading-tight">{label}</div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          );
        }
      })()}
    </div>
  );
}
