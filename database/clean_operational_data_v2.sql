-- ============================================================
-- سكربت تنظيف شامل للبيانات التشغيلية (Comprehensive Operational Cleanup)
-- يقوم هذا السكربت بحذف جميع البيانات التشغيلية مع الحفاظ على الهيكل المحاسبي الأساسي
-- ============================================================

BEGIN;

-- 1. تعطيل فحوصات المفاتيح الخارجية مؤقتاً (لتجنب أخطاء الترتيب)
SET session_replication_role = 'replica';

-- ============================================================
-- أ. العمليات المالية والمحاسبية والأرشيف (Financial & Accounting & Archive)
-- ============================================================
TRUNCATE TABLE public.archived_journal_lines RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.archived_journal_entries RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.journal_lines RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.journal_entries RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.payment_allocations RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.payments RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.invoices RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.ar_subledger RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.revenue_schedules RESTART IDENTITY CASCADE;

-- ============================================================
-- ب. العمليات التشغيلية والحجوزات (Operations & Bookings)
-- ============================================================
-- TRUNCATE TABLE public.booking_customers RESTART IDENTITY CASCADE; -- Table might not exist in current schema
TRUNCATE TABLE public.bookings RESTART IDENTITY CASCADE;

-- ============================================================
-- ج. التنبيهات والمهام والملاحظات (Notifications, Tasks & Notes)
-- ============================================================
-- نستخدم IF EXISTS لتجنب الأخطاء في حال عدم وجود الجداول
DO $$ 
BEGIN 
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN 
        TRUNCATE TABLE public.notifications RESTART IDENTITY CASCADE; 
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cleaning_logs') THEN 
        TRUNCATE TABLE public.cleaning_logs RESTART IDENTITY CASCADE; 
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'maintenance_logs') THEN 
        TRUNCATE TABLE public.maintenance_logs RESTART IDENTITY CASCADE; 
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'maintenance_requests') THEN 
        TRUNCATE TABLE public.maintenance_requests RESTART IDENTITY CASCADE; 
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'staff_notes') THEN 
        TRUNCATE TABLE public.staff_notes RESTART IDENTITY CASCADE; 
    END IF;
END $$;

-- ============================================================
-- د. العملاء وحساباتهم (Customers & Accounts)
-- ============================================================
TRUNCATE TABLE public.customer_accounts RESTART IDENTITY CASCADE; -- جدول الربط
TRUNCATE TABLE public.customers RESTART IDENTITY CASCADE;

-- حذف الحسابات الفرعية للعملاء من شجرة الحسابات
-- نقوم بحذف الحسابات التي تتبع الحسابات الرئيسية للعملاء (1200 أو 1201)
-- والتي ليست حسابات نظامية (is_system = false)
DELETE FROM public.accounts 
WHERE parent_id IN (
    SELECT id FROM public.accounts WHERE code IN ('1200', '1201')
)
AND is_system = false; 

-- ============================================================
-- هـ. سجلات النظام (System Logs)
-- ============================================================
TRUNCATE TABLE public.audit_logs RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.system_events RESTART IDENTITY CASCADE;

-- 2. إعادة تفعيل فحوصات المفاتيح الخارجية
SET session_replication_role = 'origin';

COMMIT;

-- رسالة تأكيد
SELECT 'تمت عملية التنظيف بنجاح: تم حذف القيود، الأرشيف، الفواتير، الحجوزات، العملاء، التنبيهات، الملاحظات، والبيانات التشغيلية مع الحفاظ على الهيكل المحاسبي.' as status;
