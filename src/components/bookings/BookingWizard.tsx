'use client';

import React, { useState } from 'react';
import { CustomerStep, Customer } from './steps/CustomerStep';
import { UnitSelectionStep } from './steps/UnitSelectionStep';
import { PricingStep, PricingResult } from './steps/PricingStep';
import { DepositStep, DepositResult } from './steps/DepositStep';
import { ConfirmStep } from './steps/ConfirmStep';
import { UnitType, PriceCalculation, calculateDetailedDuration } from '@/lib/pricing';
import { User, Calendar, CreditCard, FileCheck, CheckCircle } from 'lucide-react';
import { format, addDays, addMonths, differenceInCalendarDays, parseISO } from 'date-fns';
import { useAppLanguage } from '@/hooks/useAppLanguage';

type Step = 'customer' | 'unit' | 'price' | 'deposit' | 'confirm';

export interface Unit {
  id: string;
  unit_number: string;
  floor: string;
  status: string;
  unit_type_id: string;
  hotel_id?: string;
}

export interface BookingData {
  customer: Customer | null;
  unitType?: UnitType;
  unit?: Unit;
  startDate?: Date;
  endDate?: Date;
  priceCalculation?: PriceCalculation;
  pricingResult?: PricingResult;
  depositResult?: DepositResult;
  bookingType?: 'daily' | 'monthly' | 'yearly';
  customerPreferences?: string;
  companions?: Array<{ name: string; national_id?: string }>;
  bookingSource?: 'reception' | 'platform' | 'broker';
  platformName?: string;
  brokerName?: string;
  brokerId?: string;
}

const STEPS = [
  { id: 'customer', label: { ar: 'العميل', en: 'Customer' }, icon: User },
  { id: 'unit', label: { ar: 'الوحدة والتواريخ', en: 'Unit & dates' }, icon: Calendar },
  { id: 'price', label: { ar: 'التسعير', en: 'Pricing' }, icon: CreditCard },
  { id: 'deposit', label: { ar: 'العربون', en: 'Deposit' }, icon: FileCheck },
  { id: 'confirm', label: { ar: 'تأكيد', en: 'Confirm' }, icon: CheckCircle },
];

export const BookingWizard: React.FC<{ initialCustomer?: Customer; initialUnitId?: string; initialQuery?: string; initialCheckIn?: string; initialCheckOut?: string; language?: 'ar' | 'en' }> = ({ initialCustomer, initialUnitId, initialQuery, initialCheckIn, initialCheckOut, language: languageProp }) => {
  const { language: storedLanguage } = useAppLanguage();
  const language = languageProp ?? storedLanguage;
  const t = (arText: string, enText: string) => (language === 'en' ? enText : arText);
  const [currentStep, setCurrentStep] = useState<Step>('customer');
  const toLocalYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const parseYMD = (ymd?: string) => {
    const s = (ymd || '').trim();
    if (!s) return null;
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const addDaysLocal = (d: Date, days: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const addMonthsAligned = (d: Date, months: number) => {
    const year = d.getFullYear();
    const monthIndex = d.getMonth() + months;
    const day = d.getDate();
    const lastDayInTargetMonth = new Date(year, monthIndex + 1, 0).getDate();
    const safeDay = Math.min(day, lastDayInTargetMonth);
    const x = new Date(year, monthIndex, safeDay, 0, 0, 0, 0);
    return x;
  };
  const diffDaysLocal = (start: Date, end: Date) => {
    const a = new Date(start);
    const b = new Date(end);
    a.setHours(0, 0, 0, 0);
    b.setHours(0, 0, 0, 0);
    const msDay = 24 * 60 * 60 * 1000;
    return Math.ceil((b.getTime() - a.getTime()) / msDay);
  };

  const rawStart = parseYMD(initialCheckIn);
  const rawEnd = parseYMD(initialCheckOut);
  let initialStartDate = rawStart ?? undefined;
  let initialEndDate = rawEnd ?? undefined;
  let initialBookingType: BookingData['bookingType'] | undefined = undefined;
  let initialDurationDays: number | undefined = undefined;
  let initialDurationMonths: number | undefined = undefined;

  if (initialStartDate) {
    if (!initialEndDate || initialEndDate <= initialStartDate) {
      initialEndDate = addDays(initialStartDate, 1);
    }
    const rawNights = Math.max(1, differenceInCalendarDays(initialEndDate, initialStartDate));
    
    // If we have both dates from outside, respect them
    if (rawStart && rawEnd) {
      initialEndDate = rawEnd;
      if (rawNights < 15) {
        initialBookingType = 'daily';
        initialDurationDays = rawNights;
      } else {
        initialBookingType = rawNights >= 360 ? 'yearly' : 'monthly';
        const { months } = calculateDetailedDuration(initialStartDate, initialEndDate);
        initialDurationMonths = months;
      }
    } else {
      // Logic for when only start date or invalid range is provided
      if (rawNights < 15) {
        initialBookingType = 'daily';
        initialDurationDays = rawNights;
      } else {
        const months = Math.max(1, Math.round(rawNights / 30));
        initialDurationMonths = months;
        initialBookingType = months >= 12 ? 'yearly' : 'monthly';
        initialEndDate = addDays(addMonths(initialStartDate, months), -1);
      }
    }
  }
  const [bookingData, setBookingData] = useState<BookingData>({
    customer: initialCustomer || null,
    startDate: initialStartDate,
    endDate: initialEndDate,
    bookingType: initialBookingType,
  });

  const handleCustomerSelect = (customer: Customer, meta?: { bookingSource?: 'reception'|'platform'|'broker'; platformName?: string; brokerName?: string; brokerId?: string }) => {
    setBookingData(prev => ({ 
      ...prev, 
      customer,
      bookingSource: meta?.bookingSource || prev.bookingSource,
      platformName: meta?.platformName || prev.platformName,
      brokerName: meta?.brokerName || prev.brokerName,
      brokerId: meta?.brokerId || prev.brokerId
    }));
    setCurrentStep('unit');
  };

  const handleUnitSelect = (data: { unitType: UnitType; unit: Unit; startDate: Date; endDate: Date; calculation: PriceCalculation; bookingType: 'daily' | 'monthly' | 'yearly'; customerPreferences?: string; companions?: Array<{ name: string; national_id?: string }> }) => {
    setBookingData(prev => ({
      ...prev,
      unitType: data.unitType,
      unit: data.unit,
      startDate: data.startDate,
      endDate: data.endDate,
      priceCalculation: data.calculation,
      bookingType: data.bookingType,
      customerPreferences: data.customerPreferences,
      companions: data.companions
    }));
    setCurrentStep('price');
  };

  const handlePricingConfirm = (data: PricingResult) => {
    setBookingData(prev => ({ ...prev, pricingResult: data }));
    setCurrentStep('deposit');
  };

  const handleDepositConfirm = (data: DepositResult) => {
    setBookingData(prev => ({ ...prev, depositResult: data }));
    setCurrentStep('confirm');
  };

  const handleBack = () => {
    switch (currentStep) {
      case 'unit':
        setCurrentStep('customer');
        break;
      case 'price':
        setCurrentStep('unit');
        break;
      case 'deposit':
        setCurrentStep('price');
        break;
      case 'confirm':
        setCurrentStep('deposit');
        break;
    }
  };

  const handleFinalSuccess = () => {
      // Keep user on confirm step (which shows success message)
      // Optionally reset form after delay or manual action
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'customer':
        return (
          <CustomerStep 
            onNext={handleCustomerSelect} 
            initialCustomer={bookingData.customer || undefined}
            initialQuery={initialQuery}
            language={language}
          />
        );
      case 'unit':
        return (
          <UnitSelectionStep 
            onNext={handleUnitSelect}
            onBack={handleBack}
            selectedCustomer={bookingData.customer || undefined}
            initialUnitId={initialUnitId}
            initialData={{
              unitType: bookingData.unitType,
              startDate: bookingData.startDate,
              endDate: bookingData.endDate,
              bookingType: bookingData.bookingType,
              durationMonths: initialDurationMonths,
              durationDays: initialDurationDays
            }}
            language={language}
          />
        );
      case 'price':
        if (!bookingData.unitType || !bookingData.priceCalculation) return <div>{t('بيانات ناقصة', 'Missing data')}</div>;
        return (
          <PricingStep
            unitType={bookingData.unitType}
            calculation={bookingData.priceCalculation}
            bookingType={bookingData.bookingType || 'monthly'}
            initialData={bookingData.pricingResult}
            onNext={handlePricingConfirm}
            onBack={handleBack}
            language={language}
          />
        );
      case 'deposit':
        if (!bookingData.pricingResult) return <div>{t('بيانات ناقصة', 'Missing data')}</div>;
        return (
          <DepositStep
            pricingResult={bookingData.pricingResult}
            customerName={bookingData.customer?.full_name}
            initialData={bookingData.depositResult}
            onNext={handleDepositConfirm}
            onBack={handleBack}
            language={language}
          />
        );
      case 'confirm':
        return (
            <ConfirmStep 
                data={bookingData}
                onSuccess={handleFinalSuccess}
                onBack={handleBack}
                language={language}
            />
        );
      default:
        return <div>{t('قريباً', 'Coming soon')}</div>;
    }
  };

  const steps = STEPS.map((s) => ({ ...s, label: language === 'en' ? s.label.en : s.label.ar }));
  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Stepper Header - Compact & Elegant */}
      <div className="mb-6 md:mb-8 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6">
        <div className="overflow-x-auto pb-2 -mb-2 hide-scrollbar">
            <div className="relative flex justify-between items-start px-2 md:px-4 min-w-[400px] md:min-w-0">
            
            {/* Progress Lines Wrapper - Aligned with circle centers */}
            <div className="absolute top-4 left-0 right-0 mx-6 md:mx-8 h-0.5 -z-10">
                {/* Background Line */}
                <div className="absolute inset-0 bg-gray-100" />
                
                {/* Active Progress Line */}
                <div 
                className="absolute top-0 right-0 h-full bg-blue-600 transition-all duration-500"
                style={{ width: `${(currentStepIndex / (STEPS.length - 1)) * 100}%` }}
                />
            </div>

            {steps.map((step, index) => {
                const isActive = index === currentStepIndex;
                const isCompleted = index < currentStepIndex;
                const Icon = step.icon;

                return (
                <div key={step.id} className="flex flex-col items-center group cursor-default relative z-10">
                    <div 
                    className={`
                        w-8 h-8 rounded-full flex items-center justify-center border transition-all duration-300 bg-white
                        ${isActive ? 'border-blue-600 bg-blue-600 text-white shadow-md scale-110' : 
                        isCompleted ? 'border-blue-600 text-blue-600' : 
                        'border-gray-200 text-gray-300'}
                    `}
                    >
                    {isCompleted ? <CheckCircle size={14} /> : <Icon size={14} />}
                    </div>
                    <span className={`mt-3 text-[10px] font-bold transition-colors duration-300 text-center w-16 md:w-20 ${isActive ? 'text-blue-700' : isCompleted ? 'text-blue-600' : 'text-gray-400'}`}>
                    {step.label}
                    </span>
                </div>
                );
            })}
            </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-2xl shadow-lg shadow-gray-100/50 border border-gray-100 overflow-hidden min-h-[500px]">
        <div className="p-6">
          <div className="mb-6 pb-4 border-b border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
              {steps[currentStepIndex].label}
            </h2>
            <p className="text-gray-500 mt-2 text-base">
              {currentStep === 'customer' && t('ابدأ باختيار العميل أو إنشاء ملف جديد للمتابعة', 'Start by selecting a customer or creating a new profile')}
              {currentStep === 'unit' && t('حدد نوع الوحدة وتواريخ الإقامة المناسبة', 'Choose the unit type and your stay dates')}
              {currentStep === 'price' && t('مراجعة تفاصيل التكلفة وتطبيق الخصومات', 'Review price details and apply discounts')}
              {currentStep === 'deposit' && t('تسجيل العربون أو الدفعة المقدمة لتأكيد الحجز', 'Record a deposit/payment to confirm the booking')}
              {currentStep === 'confirm' && t('مراجعة نهائية وإصدار وثائق الحجز', 'Final review and issue booking documents')}
            </p>
          </div>

          {renderStep()}
        </div>
      </div>
    </div>
  );
};
