import { parseISO, isWithinInterval, addDays, addMonths, differenceInCalendarDays, format } from 'date-fns';

export interface PricingRule {
  unit_type_id: string;
  start_date: string;
  end_date: string;
  price: number;
}

export interface UnitType {
  id: string;
  name: string;
  daily_price: number;
  annual_price?: number;
  tax_rate?: number;
  max_adults: number;
  max_children: number;
  description?: string;
  area?: number;
  hotel?: { name: string; tax_rate?: number };
  features?: string[];
  max_occupancy?: number;
}

export interface PriceCalculation {
  totalPrice: number;
  breakdown: { date: string; price: number; isSeason: boolean }[];
  basePrice: number;
  nights: number;
}

export const calculateStayPrice = (
  unitType: UnitType,
  pricingRules: PricingRule[],
  startDate: Date,
  endDate: Date
): PriceCalculation => {
  let totalPrice = 0;
  const breakdown: { date: string; price: number; isSeason: boolean }[] = [];
  const nights = differenceInCalendarDays(endDate, startDate);

  if (nights <= 0) {
      return { totalPrice: 0, breakdown: [], basePrice: unitType.daily_price, nights: 0 };
  }

  for (let i = 0; i < nights; i++) {
    const currentDate = addDays(startDate, i);
    
    // Find applicable rule
    const applicableRule = pricingRules.find(rule => 
      rule.unit_type_id === unitType.id &&
      isWithinInterval(currentDate, {
        start: parseISO(rule.start_date),
        end: parseISO(rule.end_date)
      })
    );

    const price = applicableRule ? applicableRule.price : unitType.daily_price;
    
    breakdown.push({
      date: format(currentDate, 'yyyy-MM-dd'),
      price: Number(price),
      isSeason: !!applicableRule
    });
    
    totalPrice += Number(price);
  }

  return {
    totalPrice,
    breakdown,
    basePrice: unitType.daily_price,
    nights
  };
};

/**
 * Calculates duration in months and days based on the policy:
 * 1 Month = (Start Date) to (Start Date + 1 Month - 1 Day)
 */
export const calculateDetailedDuration = (startDate: Date, endDate: Date) => {
  const checkIn = new Date(startDate);
  checkIn.setHours(0, 0, 0, 0);
  const checkOutPlusOne = addDays(new Date(endDate), 1);
  checkOutPlusOne.setHours(0, 0, 0, 0);

  let months = 0;
  let tempDate = new Date(checkIn);

  // Count full months
  while (true) {
    const nextMonth = addMonths(tempDate, 1);
    if (nextMonth <= checkOutPlusOne) {
      months++;
      tempDate = nextMonth;
    } else {
      break;
    }
  }

  // Count remaining days
  const days = differenceInCalendarDays(checkOutPlusOne, tempDate);

  return { months, days };
};

export const formatArabicDuration = (months: number, days: number) => {
  const parts = [];
  
  if (months > 0) {
    if (months === 1) parts.push('شهر');
    else if (months === 2) parts.push('شهرين');
    else if (months >= 3 && months <= 10) parts.push(`${months} أشهر`);
    else parts.push(`${months} شهر`);
  }
  
  if (days > 0) {
    if (days === 1) parts.push('يوم');
    else if (days === 2) parts.push('يومين');
    else if (days >= 3 && days <= 10) parts.push(`${days} أيام`);
    else parts.push(`${days} يوم`);
  }
  
  if (parts.length === 0) return '0 يوم';
  if (parts.length === 1) return parts[0];
  
  // Join with "و" (and)
  return parts.join(' و');
};
