'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
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
  History as HistoryIcon
} from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';

export default function FloatingSidebar() {
  const [open, setOpen] = useState(false);
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

  return (
    <div className="hidden lg:block 2xl:hidden">
      <button
        ref={btnRef}
        onPointerDown={onDown}
        onClick={() => setOpen(v => !v)}
        style={{ left: pos.x, top: pos.y }}
        className="fixed z-50 w-14 h-14 rounded-full bg-blue-600 text-white shadow-2xl flex items-center justify-center active:scale-95 transition-transform"
        aria-label="القائمة"
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
          tabs.push({ href: '/maintenance', label: 'صيانة', icon: Wrench });
          tabs.push({ href: '/cleaning', label: 'تنظيف', icon: Brush });
        } else if (isReceptionist) {
          tabs.push({ href: '/', label: 'لوحة', icon: LayoutDashboard });
          tabs.push({ href: '/invoices', label: 'فواتير', icon: FileText });
          tabs.push({ href: '/payments', label: 'مدفوعات', icon: CreditCard });
          tabs.push({ href: '/customers', label: 'عملاء', icon: Users });
          tabs.push({ href: '/booking-intake', label: 'تعبئة', icon: ScrollText });
          tabs.push({ href: '/maintenance', label: 'صيانة', icon: Wrench });
          tabs.push({ href: '/cleaning', label: 'تنظيف', icon: Brush });
          tabs.push({ href: '/notifications', label: 'تنبيهات', icon: Bell });
          tabs.push({ href: '/documents-archive', label: 'وثائق', icon: FileText });
        } else {
          // Admin & Manager
          tabs.push({ href: '/', label: 'لوحة', icon: LayoutDashboard });
          tabs.push({ href: '/bookings', label: 'حجز جديد', icon: CalendarDays });
          tabs.push({ href: '/booking-intake', label: 'تعبئة', icon: ScrollText });
          tabs.push({ href: '/bookings-list', label: 'السجل', icon: ListIcon });
          if (!isManager) tabs.push({ href: '/units', label: 'الوحدات', icon: BedDouble });
          tabs.push({ href: '/maintenance', label: 'صيانة', icon: Wrench });
          tabs.push({ href: '/cleaning', label: 'تنظيف', icon: Brush });
          tabs.push({ href: '/notifications', label: 'تنبيهات', icon: Bell });
          tabs.push({ href: '/customers', label: 'عملاء', icon: Users });
          tabs.push({ href: '/templates', label: 'تمبلت', icon: ScrollText });
          tabs.push({ href: '/documents-archive', label: 'وثائق', icon: FileText });
          
          // Financial
          tabs.push({ href: '/invoices', label: 'فواتير', icon: FileText });
          tabs.push({ href: '/payments', label: 'مدفوعات', icon: CreditCard });
          if (!isManager) tabs.push({ href: '/reports', label: 'تقارير', icon: PieChart });

          // Accounting (Admin Only)
          if (!isManager) {
            tabs.push({ href: '/accounting/chart-of-accounts', label: 'دليل الحسابات', icon: BookOpen });
            tabs.push({ href: '/accounting/statement', label: 'كشف حساب', icon: ScrollText });
            tabs.push({ href: '/accounting/periods', label: 'الفترات', icon: CalendarDays });
            tabs.push({ href: '/accounting/platforms', label: 'المنصات', icon: Building2 });
            tabs.push({ href: '/accounting/manual-entry', label: 'القيود', icon: ArrowLeftRight });
          }

          // System
          if (isAdmin) {
            tabs.push({ href: '/admin/users', label: 'الموظفين', icon: UserCog });
            tabs.push({ href: '/admin/audit-log', label: 'المراقبة', icon: HistoryIcon });
          }
          if (!isManager) tabs.push({ href: '/settings', label: 'إعدادات', icon: Settings });
        }

        if (openUp) {
          const bottom = Math.max(8, wh - pos.y);
          return (
            <div
              style={{ left, bottom, transform: 'translateX(-50%)' }}
              className="fixed z-50 w-72 max-h-[70vh] bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <div className="text-xs font-bold text-gray-600">القائمة السريعة</div>
                <X size={16} className="text-gray-400 cursor-pointer" onClick={() => setOpen(false)} />
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
                <div className="text-xs font-bold text-gray-600">القائمة السريعة</div>
                <X size={16} className="text-gray-400 cursor-pointer" onClick={() => setOpen(false)} />
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
