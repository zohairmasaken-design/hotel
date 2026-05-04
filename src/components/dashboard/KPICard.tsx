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
  tone?: 'neutral' | 'emerald';
}

export const KPICard = ({ 
  title, 
  value, 
  change, 
  trend, 
  icon: Icon, 
  description,
  color = 'blue',
  tone = 'neutral'
}: KPICardProps) => {
  
  const colorStyles = {
    blue: "bg-blue-50 text-blue-600 ring-blue-100",
    green: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    purple: "bg-purple-50 text-purple-600 ring-purple-100",
    orange: "bg-orange-50 text-orange-600 ring-orange-100",
  };

  const trendColor = trend === 'up' ? "text-emerald-600" : trend === 'down' ? "text-rose-600" : "text-gray-500";
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;

  const isEmerald = tone === 'emerald';

  return (
    <div
      className={cn(
        "group relative overflow-hidden p-4 sm:p-6 rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300",
        isEmerald
          ? "bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-900 text-white"
          : "bg-white/90 backdrop-blur-sm ring-1 ring-emerald-100/70 hover:ring-emerald-200/70"
      )}
    >
      <div
        className={cn(
          "absolute top-0 right-0 p-3 sm:p-4 transition-opacity transform group-hover:scale-110 duration-500",
          isEmerald ? "opacity-10 group-hover:opacity-15" : "opacity-5 group-hover:opacity-10"
        )}
      >
        <Icon size={80} />
      </div>
      
      <div className="relative flex justify-between items-start mb-3 sm:mb-4">
        <div
          className={cn(
            "p-2.5 sm:p-3 rounded-xl ring-1 ring-inset transition-colors",
            isEmerald ? "bg-white/10 text-white ring-white/20" : colorStyles[color]
          )}
        >
          <Icon size={22} className={cn("stroke-[1.5] sm:w-[24px] sm:h-[24px]", isEmerald && "text-white")} />
        </div>
        {change && change !== '-' && change !== '0%' && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ring-1",
              isEmerald ? "bg-white/10 ring-white/20 text-white" : cn("bg-white/80 ring-emerald-100/70", trendColor)
            )}
          >
            <TrendIcon size={14} />
            <span>{change}</span>
          </div>
        )}
      </div>

      <div className="relative">
        <h3 className={cn("text-2xl sm:text-3xl font-bold tracking-tight font-sans mb-1", isEmerald ? "text-white" : "text-gray-900")}>
          {value}
        </h3>
        <p className={cn("text-[11px] sm:text-sm font-medium mb-1", isEmerald ? "text-emerald-100" : "text-gray-500")}>{title}</p>
        <p className={cn("text-[10px] sm:text-xs font-light leading-4", isEmerald ? "text-emerald-200/90" : "text-gray-400")}>
          {description}
        </p>
      </div>
    </div>
  );
};
