'use client';

import React from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

interface RevenueChartProps {
  data: { date: string; amount: number }[];
  title?: string;
  description?: string;
  language?: 'ar' | 'en';
}

export const RevenueChart = ({ 
  data, 
  title, 
  description,
  language = 'ar'
}: RevenueChartProps) => {
  const t = (arText: string, enText: string) => (language === 'en' ? enText : arText);
  const resolvedTitle = title ?? t('إيرادات آخر 7 أيام', 'Revenue (last 7 days)');
  const resolvedDescription = description ?? t('متابعة الأداء المالي اليومي', 'Track daily financial performance');
  const currencyFormatter = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'ar-SA', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-[400px]">
      <div className="mb-6">
        <h3 className="font-bold text-lg text-gray-900">{resolvedTitle}</h3>
        <p className="text-sm text-gray-500">{resolvedDescription}</p>
      </div>
      
      <div className="h-[300px] w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis 
              dataKey="date" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              dy={10}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              tickFormatter={(value) => `${value / 1000}k`}
              dx={-10}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#fff', 
                borderRadius: '8px', 
                border: '1px solid #e5e7eb',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' 
              }}
              formatter={(value) => {
                const num = typeof value === 'number' ? value : Number(value || 0);
                return [currencyFormatter.format(num), t('الإيراد', 'Revenue')];
              }}
            />
            <Area 
              type="monotone" 
              dataKey="amount" 
              stroke="#3b82f6" 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorAmount)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
