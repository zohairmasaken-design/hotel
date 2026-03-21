import React from 'react';
import Logo from '@/components/Logo';
import PrintActions from '../../PrintActions';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import RoleGate from '@/components/auth/RoleGate';
import ContractSignature from '@/components/ContractSignature';
 
export const runtime = 'edge';
 
export default async function BlankContractPage() {
  const today = format(new Date(), 'dd/MM/yyyy', { locale: ar });
 
  return (
    <RoleGate allow={['admin', 'manager', 'receptionist', 'accountant']}>
    <div dir="rtl" className="bg-gray-100 min-h-screen py-8 print:bg-white print:py-0 print:m-0 print:min-h-0">
      <style>{`@media print { @page { size: A4; margin: 8mm; } body { -webkit-print-color-adjust: exact; } }`}</style>
      <div className="mx-auto bg-white box-border w-full max-w-[194mm] min-h-[281mm] shadow-lg print:shadow-none p-[8mm] text-[12.5px] leading-relaxed text-gray-900 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none z-0">
          <span className="font-extrabold text-gray-900/6 print:text-gray-900/8 tracking-widest rotate-[45deg] text-[28mm] whitespace-nowrap leading-none">
            مساكن الصفا
          </span>
        </div>
 
        <div className="border-b-2 border-gray-900 pb-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full border border-gray-300 flex items-center justify-center overflow-hidden">
                <Logo className="w-12 h-12 object-contain" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold">عقد إيجار شهري</h1>
                <p className="text-xs text-gray-600">وحدة سكنية مفروشة</p>
                <p className="text-xs text-gray-700">
                  رقم الجوال <span className="font-mono" dir="ltr">0538159915</span>
                </p>
              </div>
            </div>
            <div className="text-left space-y-1 text-xs font-semibold">
              <p>
                رقم العقد:
                <span className="font-mono">—</span>
              </p>
              <p>تاريخ التحرير: {today}</p>
              <p>رقم الفاتورة: —</p>
            </div>
          </div>
        </div>
 
        <section className="mb-4 grid grid-cols-2 gap-6 border border-gray-300 rounded-lg p-3">
          <div>
            <h2 className="font-bold mb-2 text-sm">الطرف الأول</h2>
            <p>المالك: شركة مساكن الرفاهية</p>
            <p>الممثل: شركة شموخ الرفاهية للتطوير والاستثمار العقاري</p>
            <p className="text-xs text-gray-700">السجل التجاري: <span className="font-mono font-bold">7037421299</span></p>
          </div>
          <div>
            <h2 className="font-bold mb-2 text-sm">الطرف الثاني</h2>
            <p>الاسم: —</p>
            <p>الهوية: —</p>
            <p>الجوال: —</p>
          </div>
        </section>
 
        <section className="mb-4 border border-gray-300 rounded-lg p-3">
          <h2 className="font-bold mb-2 text-sm">بيانات الوحدة</h2>
          <div className="grid grid-cols-3 gap-3">
            <p>رقم الوحدة: <span className="font-mono">—</span></p>
            <p>الدور: <span className="font-mono">—</span></p>
            <p>الاستخدام: سكني فقط</p>
          </div>
          <p className="mt-2 text-xs text-gray-600">
            النموذج: — 
          </p>
        </section>
 
        <section className="grid grid-cols-1 gap-3 mb-4">
          <div className="border border-gray-300 rounded-lg p-3 space-y-2 text-[11px]">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-bold text-[12px]">المدة:</span>
              <span className="text-[11px]">
                مدة العقد: <span className="font-mono font-bold">—</span>
                {' '}— من تاريخ <span className="font-mono font-bold" dir="ltr">—</span>
                {' '}— إلى تاريخ <span className="font-mono font-bold" dir="ltr">—</span>
              </span>
            </div>
          </div>
          <div className="border border-gray-300 rounded-lg p-3 space-y-2 text-[11px]">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-bold text-[12px]">القيمة الإيجارية:</span>
              <span className="text-[11px]">
                الأجرة الشهرية: <span className="font-mono font-bold">—</span> ر.س
                {' '}— التأمين: <span className="font-mono font-bold">—</span> ر.س
              </span>
            </div>
          </div>
        </section>
 
        <section className="mb-4 border border-gray-900 rounded-lg p-4">
          <h2 className="font-bold mb-3 text-sm">الشروط والأحكام</h2>
           <ul className="list-disc pr-4 space-y-1 text-[11px] leading-relaxed">
            <li>مراعاة السلوك والآداب الإسلامية، وعدم السماح بغير المرافقين، والالتزام بالهدوء وعدم إزعاج الآخرين.</li>
            <li>الطرف الثاني مسؤول عن كامل محتويات الشقة، المحافظة عليها، وتعويض أي تلف، ولا يجوز تحويل العهدة إلى شخص آخر.</li>
            <li>إغلاق التكييف والإضاءة والأجهزة الكهربائية عند المغادرة، ويتحمل المسؤولية عن أي أخطار.</li>
            <li>يحق للطرف الأول دخول الشقة للصيانة أو المعاينة بعد إشعار الطرف الثاني، كما يحق له الإخلاء الفوري عند استخدام العقار بشكل غير نظامي.</li>
<li>يتحمل الطرف الثاني كامل المسؤولية عن الشقة ومحتوياتها، وأي أضرار ناتجة عن سوء الاستخدام أو الإهمال، ويلتزم بتسليمها بالحالة المستلمة عليها.</li>
<li>يلتزم الطرف الثاني بسداد الإيجار في موعده، ويحق للطرف الأول عند التأخر فرض غرامة أو فسخ العقد دون إشعار.</li>
<li>يجب الالتزام بعدد الأشخاص المحدد، ويُمنع التأجير من الباطن أو إقامة التجمعات دون موافقة الإدارة، ويعد الإخلال سبباً لفسخ العقد.</li>
<li>لا يتحمل الطرف الأول مسؤولية انقطاع الخدمات الخارجة عن إرادته، ويحق له التصرف بالممتلكات المتروكة بعد (15) يوماً دون مسؤولية.</li>
            <li>يُدفع الإيجار مقدماً.</li>
            <li>عند التغيب بعد انتهاء العقد بثلاثة أيام، يحق للطرف الأول فتح الشقة والتصرف فيها ورفع الممتلكات إلى المستودع دون مسؤولية، ويُعتبر العقد لاغياً.</li>
            <li>الطرف الأول غير مسؤول عن فقدان الأشياء الثمينة الخاصة بالطرف الثاني داخل الشقة.</li>
            <li>لا يحق استرداد قيمة الإيجار عند المغادرة قبل انتهاء المدة المتفق عليها.</li>
            <li>عند رغبة التجديد أو الإخلاء، يجب إشعار الطرف الأول قبل انتهاء المدة بفترة مناسبة لا تقل عن 7 أيام.</li>
            <li>الإخلال بأي شرط يُلغي العقد، ويحق للطرف الأول فسخه دون إنذار مسبق.</li>
            <li>يمنع التأجير من الباطن.</li>
          </ul>
        </section>
 
        <div className="mt-2 grid grid-cols-1 gap-4">
          <ContractSignature customerName="—" />
        </div>
 
        <div className="mt-4 text-center text-[11px] text-gray-700">
          هذه الوثيقة معمدة إلكترونياً ولا تحتاج إلى ختم
        </div>
      </div>
 
      <PrintActions />
    </div>
    </RoleGate>
  );
}
