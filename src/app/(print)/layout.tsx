import React from 'react';
import '@/app/globals.css';
import localFont from 'next/font/local';

export const runtime = 'edge';

export const metadata = {
  title: 'طباعة المستند',
};

const ibmArabic = localFont({
  src: [
    { path: '../fonts/IBMPlexSansArabic-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../fonts/IBMPlexSansArabic-Medium.ttf', weight: '500', style: 'normal' },
    { path: '../fonts/IBMPlexSansArabic-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: '../fonts/IBMPlexSansArabic-Bold.ttf', weight: '700', style: 'normal' }
  ]
});

export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={`${ibmArabic.className} bg-white text-black min-h-screen`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
