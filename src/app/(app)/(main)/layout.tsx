import DashboardLayout from "@/components/layout/DashboardLayout";
import React, { Suspense } from "react";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <DashboardLayout>
        {children}
      </DashboardLayout>
    </Suspense>
  );
}
