import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
  icon: React.ElementType;
  description: string;
  color?: 'blue' | 'green' | 'purple' | 'orange';
}

export const KPICard = ({ 
  title, 
  value, 
  change, 
  trend, 
  icon: Icon, 
  description,
  color = 'blue' 
}: KPICardProps) => {
  
  const colorStyles = {
    blue: "bg-blue-50 text-blue-600 ring-blue-100",
    green: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    purple: "bg-purple-50 text-purple-600 ring-purple-100",
    orange: "bg-orange-50 text-orange-600 ring-orange-100",
  };

  const trendColor = trend === 'up' ? "text-emerald-600" : trend === 'down' ? "text-rose-600" : "text-gray-500";
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;

  return (
    <div className="group relative overflow-hidden bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] hover:shadow-[0_8px_30px_-4px_rgba(6,81,237,0.15)] hover:-translate-y-1 transition-all duration-300">
      <div className="absolute top-0 right-0 p-3 sm:p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
        <Icon size={80} />
      </div>
      
      <div className="relative flex justify-between items-start mb-3 sm:mb-4">
        <div className={cn("p-2.5 sm:p-3 rounded-xl ring-1 ring-inset transition-colors", colorStyles[color])}>
          <Icon size={22} className="stroke-[1.5] sm:w-[24px] sm:h-[24px]" />
        </div>
        {change && change !== '-' && change !== '0%' && (
          <div className={cn("flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-50 border border-gray-100", trendColor)}>
            <TrendIcon size={14} />
            <span>{change}</span>
          </div>
        )}
      </div>

      <div className="relative">
        <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight font-sans mb-1">{value}</h3>
        <p className="text-[11px] sm:text-sm font-medium text-gray-500 mb-1">{title}</p>
        <p className="text-[10px] sm:text-xs text-gray-400 font-light leading-4">{description}</p>
      </div>
    </div>
  );
};
