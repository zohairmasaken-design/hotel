import React from 'react';
import { cn } from '@/lib/utils';
import { MoreHorizontal, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

export interface Booking {
  id: string;
  guest_name: string;
  unit_number: string;
  check_in: string;
  status: string;
  total_price: number;
}

export const RecentBookingsTable = ({ bookings, language = 'ar' }: { bookings: Booking[]; language?: 'ar' | 'en' }) => {
    const t = (arText: string, enText: string) => (language === 'en' ? enText : arText);
    const currencyFormatter = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'ar-SA', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 });
    const dateLocale = language === 'en' ? 'en-US' : 'ar-EG';
    const getStatusStyle = (status: string) => {
        switch(status) {
            case 'confirmed': return 'bg-blue-50 text-blue-700 ring-blue-600/20';
            case 'checked_in': return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
            case 'checked_out': return 'bg-gray-50 text-gray-700 ring-gray-600/20';
            case 'cancelled': return 'bg-rose-50 text-rose-700 ring-rose-600/20';
            default: return 'bg-gray-50 text-gray-700 ring-gray-600/20';
        }
    };
    
    const getStatusLabel = (status: string) => {
        switch(status) {
            case 'confirmed': return t('مؤكد', 'Confirmed');
            case 'checked_in': return t('دخول', 'Checked in');
            case 'checked_out': return t('مغادرة', 'Checked out');
            case 'cancelled': return t('ملغي', 'Cancelled');
            default: return status;
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-full flex flex-col">
             <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center">
                <div>
                    <h3 className="font-bold text-base sm:text-lg text-gray-900">{t('أحدث الحجوزات', 'Recent bookings')}</h3>
                    <p className="text-[11px] sm:text-sm text-gray-500 mt-0.5">{t('آخر 5 عمليات حجز مسجلة', 'Last 5 recorded bookings')}</p>
                </div>
                <Link 
                    href="/bookings-list"
                    className="group flex items-center gap-1 text-[11px] sm:text-sm font-medium text-blue-600 hover:text-blue-700 px-2.5 sm:px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                >
                    {t('عرض الكل', 'View all')}
                    <ArrowUpRight size={16} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
            </div>
            
            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto flex-1">
                <table className="w-full text-sm text-right">
                    <thead className="bg-gray-50/50 text-gray-500 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="px-6 py-4 font-semibold">{t('رقم الحجز', 'Booking')}</th>
                            <th className="px-6 py-4 font-semibold">{t('الضيف', 'Guest')}</th>
                            <th className="px-6 py-4 font-semibold">{t('الوحدة', 'Unit')}</th>
                            <th className="px-6 py-4 font-semibold">{t('تاريخ الدخول', 'Check-in')}</th>
                            <th className="px-6 py-4 font-semibold">{t('الحالة', 'Status')}</th>
                            <th className="px-6 py-4 font-semibold text-left">{t('المبلغ', 'Amount')}</th>
                            <th className="w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {bookings.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">{t('لا توجد حجوزات حديثة', 'No recent bookings')}</td>
                            </tr>
                        ) : (
                            bookings.map((booking) => (
                                <tr key={booking.id} className="group hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                            {booking.id.substring(0, 6)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-900">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] text-blue-600 font-bold">
                                                {booking.guest_name.charAt(0)}
                                            </div>
                                            {booking.guest_name}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-500 font-sans font-medium">{booking.unit_number}</td>
                                    <td className="px-6 py-4 text-gray-500 font-sans text-xs">
                                        {new Date(booking.check_in).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={cn(
                                            "inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ring-1 ring-inset",
                                            getStatusStyle(booking.status)
                                        )}>
                                            {getStatusLabel(booking.status)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-left font-bold text-gray-900 font-sans">
                                        {currencyFormatter.format(booking.total_price)}
                                    </td>
                                    <td className="px-4 text-right">
                                        <button className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
                                            <MoreHorizontal size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card View */}
            <div className="sm:hidden flex flex-col divide-y divide-gray-50">
                {bookings.length === 0 ? (
                    <div className="px-4 py-10 text-center text-gray-500 text-[12px]">{t('لا توجد حجوزات حديثة', 'No recent bookings')}</div>
                ) : (
                    bookings.map((booking) => (
                        <div key={booking.id} className="p-3 hover:bg-gray-50/50 transition-colors">
                            <div className="flex justify-between items-start mb-2.5">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-[12px] text-blue-600 font-bold">
                                        {booking.guest_name.charAt(0)}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-[12px]">{booking.guest_name}</h4>
                                        <p className="text-[10px] text-gray-500 font-sans mt-0.5">#{booking.id.substring(0, 6)} • {booking.unit_number}</p>
                                    </div>
                                </div>
                                <span className={cn(
                                    "inline-flex items-center px-2 py-1 rounded-md text-[10px] font-medium ring-1 ring-inset",
                                    getStatusStyle(booking.status)
                                )}>
                                    {getStatusLabel(booking.status)}
                                </span>
                            </div>
                            
                            <div className="flex justify-between items-center pl-1">
                                <div className="text-[10px] text-gray-500 flex items-center gap-1">
                                    <span>{t('دخول:', 'Check-in:')}</span>
                                    <span className="font-sans">
                                        {new Date(booking.check_in).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })}
                                    </span>
                                </div>
                                <div className="font-bold text-gray-900 font-sans text-[12px]">
                                    {currencyFormatter.format(booking.total_price)}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
