'use client';

import React from 'react';
import Link from 'next/link';
import { FileBarChart, TrendingUp, DollarSign, Calendar, Users, Home, Send } from 'lucide-react';
import RoleGate from '@/components/auth/RoleGate';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/lib/supabase';

export default function ReportsPage() {
  const { role } = useUserRole();
  const isManager = role === 'manager';
  const isMarketing = role === 'marketing';

  const reports = [
    {
      title: 'عقود منصة إيجار',
      description: 'عرض العقود التي تم تسجيل رفعها إلى منصة إيجار.',
      icon: Send,
      color: 'bg-emerald-100 text-emerald-600',
      href: '/reports/ejar-contracts',
      isAdminOnly: true
    },
    {
      title: 'التقرير الشامل',
      description: 'تقرير يجمع كافة العمليات المالية (فواتير، سندات، حجوزات) في جدول واحد مفصل.',
      icon: FileBarChart,
      color: 'bg-amber-100 text-amber-600',
      href: '/reports/comprehensive',
      isAdminOnly: true
    },
    {
      title: 'ميزان المراجعة',
      description: 'كشف بأرصدة جميع الحسابات (أصول، خصوم، إيرادات، مصروفات) للتحقق من توازن القيد المزدوج.',
      icon: FileBarChart,
      color: 'bg-indigo-100 text-indigo-600',
      href: '/reports/trial-balance',
      isAdminOnly: true,
      hideFromMarketing: true
    },
    {
      title: 'تقرير المديونية',
      description: 'كشف بالمديونية حسب العملاء اعتمادًا على الفواتير والمدفوعات.',
      icon: Users,
      color: 'bg-rose-100 text-rose-600',
      href: '/reports/receivables',
      isAdminOnly: true
    },
    {
      title: 'تقرير الإيرادات',
      description: 'ملخص الإيرادات اليومية والشهرية والسنوية',
      icon: DollarSign,
      color: 'bg-green-100 text-green-600',
      href: '/reports/revenue',
      isAdminOnly: true
    },
    {
      title: 'تقرير مراكز التكلفة',
      description: 'تجميع العمليات المالية حسب الفنادق والشقق كوحدات تكلفة.',
      icon: TrendingUp,
      color: 'bg-blue-100 text-blue-600',
      href: '/reports/cost-centers',
      isAdminOnly: true,
      hideFromMarketing: true
    },
    {
      title: 'تقرير الإشغال',
      description: 'نسب الإشغال للوحدات والغرف',
      icon: TrendingUp,
      color: 'bg-cyan-100 text-cyan-600',
      href: '/reports/occupancy',
      isAdminOnly: false
    },
    {
      title: 'سجل الحجوزات',
      description: 'تقرير تفصيلي عن جميع الحجوزات وحالاتها',
      icon: Calendar,
      color: 'bg-purple-100 text-purple-600',
      href: '/reports/bookings-log',
      isAdminOnly: false
    },
    {
      title: 'التحديثيات',
      description: 'عرض حالة كل وحدة مع تاريخ الخروج إن كانت عليها حجز.',
      icon: Home,
      color: 'bg-emerald-100 text-emerald-600',
      href: '/reports/updates',
      isAdminOnly: false
    },
    {
      title: 'تقرير اليوم',
      description: 'تقرير منظم لكل ما حدث اليوم (حجوزات، دخول/خروج، سندات، فواتير، متبقي).',
      icon: Calendar,
      color: 'bg-blue-100 text-blue-600',
      href: '/reports/daily',
      isAdminOnly: false,
      hideFromMarketing: true
    },
    {
      title: 'تقرير العملاء',
      description: 'تحليل بيانات العملاء والأكثر تردداً',
      icon: Users,
      color: 'bg-orange-100 text-orange-600',
      href: '#',
      isAdminOnly: false
    }
  ];

  const filteredReports = reports.filter(r => {
    // Admin and Accountant see everything
    if (role === 'admin' || role === 'accountant') return true;
    
    // Marketing sees everything except accounting reports (Trial Balance and Cost Centers)
    if (role === 'marketing') return !r.hideFromMarketing;
    
    // Managers see all reports except accounting-only reports
    if (role === 'manager') return !['/reports/comprehensive', '/reports/trial-balance'].includes(r.href);

    // Receptionists see daily report and public reports
    if (role === 'receptionist') return r.href === '/reports/daily' || (!r.isAdminOnly && !r.hideFromMarketing);
    
    // Others see only public reports
    return !r.isAdminOnly && !r.hideFromMarketing;
  });

  const handleLogReportView = async (reportTitle: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('system_events').insert({
        event_type: 'report_viewed',
        message: `تم عرض تقرير: ${reportTitle}`,
        payload: {
          report_title: reportTitle,
          actor_id: user?.id || null,
          actor_email: user?.email || null
        }
      });
    } catch {}
  };

  return (
    <RoleGate allow={['admin', 'manager', 'accountant', 'marketing', 'receptionist']}>
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">التقارير</h1>
          <p className="text-gray-500 mt-1">تقارير وإحصائيات الأداء المالي والتشغيلي</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredReports.map((report, index) => (
          <Link 
            key={index} 
            href={report.href}
            className="block"
            onClick={() => handleLogReportView(report.title)}
          >
            <div 
              className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer group h-full"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-lg ${report.color}`}>
                  <report.icon size={24} />
                </div>
                <div className="bg-gray-50 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                  <FileBarChart size={16} className="text-gray-400" />
                </div>
              </div>
              
              <h3 className="text-lg font-bold text-gray-900 mb-2">{report.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                {report.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
      
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 text-center mt-8">
        <h3 className="text-lg font-bold text-blue-800 mb-2">هل تحتاج تقارير مخصصة؟</h3>
        <p className="text-blue-600 mb-4">
          يمكنك طلب تقارير مخصصة حسب احتياجاتك من فريق الدعم الفني.
        </p>
        <button className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors">
          تواصل مع الدعم
        </button>
      </div>
    </div>
    </RoleGate>
  );
}
