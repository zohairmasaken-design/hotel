import React from 'react';
import Logo from '@/components/Logo';
import PrintActions from '../../PrintActions';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import RoleGate from '@/components/auth/RoleGate';
import ContractSignature from '@/components/ContractSignature';

export const runtime = 'edge';

export default async function BlankHandoverPage() {
  const today = format(new Date(), 'dd/MM/yyyy', { locale: ar });

  return (
    <RoleGate allow={['admin','manager']}>
    <div dir="rtl" className="bg-gray-100 min-h-screen py-8 print:bg-white print:py-0 print:m-0 print:min-h-0">
      <style>{`@media print { @page { size: A4; margin: 8mm; } body { -webkit-print-color-adjust: exact; } }`}</style>
      <div className="mx-auto bg-white box-border w-full max-w-[194mm] min-h-[281mm] shadow-lg print:shadow-none p-[8mm] print:min-h-0 print:p-[6mm] text-[12.5px] leading-relaxed text-gray-900 relative" style={{ breakInside: 'avoid' }}>
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
                <h1 className="text-xl font-extrabold">محضر استلام وحدة</h1>
                <p className="text-xs text-gray-600">وحدة سكنية مفروشة</p>
              </div>
            </div>
            <div className="text-left space-y-1 text-xs font-semibold">
              <p>
                رقم الحجز:
                <span className="font-mono">—</span>
              </p>
              <p>تاريخ التحرير: {today}</p>
              <p>رقم الفاتورة: —</p>
            </div>
          </div>
        </div>

        <section className="mb-3 grid grid-cols-2 gap-4 border border-gray-300 rounded-lg p-2">
          <div>
            <h2 className="font-bold mb-1 text-[12px]">المؤجر</h2>
            <p className="text-[11px]">المالك: شركة مساكن الرفاهية</p>
            <p className="text-[11px]">الممثل: شركة شموخ الرفاهية للتطوير والاستثمار العقاري</p>
            <p className="text-[10px] text-gray-700">السجل التجاري: <span className="font-mono font-bold">7037421299</span></p>
          </div>
          <div>
            <h2 className="font-bold mb-1 text-[12px]">المستأجر</h2>
            <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[11px]">
              <p className="text-gray-600 text-right">الاسم</p>
              <p className="text-center">—</p>
              <p className="text-gray-600 text-left">Name</p>

              <p className="text-gray-600 text-right">الهوية</p>
              <p className="text-center font-mono">—</p>
              <p className="text-gray-600 text-left">National ID</p>

              <p className="text-gray-600 text-right">الجوال</p>
              <p className="text-center font-mono" dir="ltr">—</p>
              <p className="text-gray-600 text-left">Mobile</p>
            </div>
          </div>
        </section>

        <section className="mb-3 border border-gray-300 rounded-lg p-2">
          <h2 className="font-bold mb-1 text-[12px]">بيانات الوحدة</h2>
          <p className="text-[11px] text-gray-800">
            رقم الوحدة: <span className="font-mono">—</span>
            <span className="mx-2">—</span>
            الدور: <span className="font-mono">—</span>
            <span className="mx-2">—</span>
            النموذج: <span>—</span>
          </p>
        </section>

        <section className="mb-3 border border-gray-300 rounded-lg p-3">
          <h2 className="font-bold mb-2 text-sm">الاجهزة عند الاستلام</h2>
          <table className="w-full text-[11px] text-gray-900 border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className="border border-gray-300 px-1 py-1 text-right">الجهاز</th>
                <th className="border border-gray-300 px-1 py-1 text-center">العدد</th>
                <th className="border border-gray-300 px-1 py-1 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'طباخ كهربائي ريفو (حجري) عينين (2) — موديل 8014', qty: 1 },
                { name: 'ميكرويف فوجياك 20 لتر (مفتاح أسود) — موديل FJK-M20LDB', qty: 1 },
                { name: 'مكيف سبليت سوبر كلاسك 18 وحدة — موديل SCSP-18C (شامل التركيب)', qty: 2 },
                { name: 'ثلاجة جستنهاوس ستيل (بخار) 6.1 قدم — موديل JSRF-3199', qty: 1 },
                { name: 'غسالة أوتوماتيك سوبر كلاسك 6 كجم فتحة أمامية — موديل SPWM-601', qty: 1 },
                { name: 'شاشة تلفزيون 50 بوصة', qty: 1 }
              ].map((device, i) => (
                <tr key={i} className="h-6">
                  <td className="border border-gray-300 px-1 py-1">{device.name}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{device.qty}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">—</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-gray-600">
            ملاحظة مهمة: تجهيزات الشقة من تأثيث أو أدوات لم تذكر كأجهزة تندرج في التعهد.
          </p>
        </section>

        <section className="mb-3 border border-gray-900 rounded-lg p-4">
          <h2 className="font-bold mb-3 text-sm">إقرار الاستلام</h2>
          <p className="text-[12px] leading-relaxed">
            يقر المستأجر بأنه قد استلم الوحدة السكنية المذكورة أعلاه بكامل خدماتها وتجهيزاتها وأثاثها وأجهزتها 
            بحالة سليمة وصالحة للاستخدام، وأنه اطّلع على مواصفاتها ومحتوياتها وتأكد من مطابقتها لما تم الاتفاق عليه. 
            كما يلتزم بالحفاظ على الوحدة ومرافقها وعدم إساءة استخدامها أو تعريضها لأي ضرر متعمد أو ناتج عن إهمال، 
            ويتحمل المسؤولية الكاملة عن أي أعطال أو أضرار تنشأ بسبب سوء الاستخدام أو مخالفة التعليمات، 
            ويلتزم بسداد قيمة الإصلاحات بموجب سندات رسمية أو فواتير صادرة من إدارة المبنى أو الجهة المختصة، 
            وذلك فور المطالبة ودون تأخير، ولا يحق له الامتناع أو التأخير عن السداد لأي سبب.
          </p>
        </section>

        <ContractSignature customerName="—" />

        <div className="mt-4 text-center text-[11px] text-gray-700">
          هذه الوثيقة معمدة إلكترونياً ولا تحتاج إلى ختم
        </div>
      </div>

      <PrintActions />
    </div>
    </RoleGate>
  );
}
