BEGIN;

ALTER TABLE public.bookings
  ADD COLUMN booking_source text,
  ADD COLUMN platform_name text,
  ADD COLUMN broker_name text,
  ADD COLUMN broker_id text;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_booking_source_chk
  CHECK (booking_source IN ('reception','platform','broker'));

CREATE INDEX IF NOT EXISTS idx_bookings_booking_source
ON public.bookings (booking_source);

COMMIT; 


- الالغاء-
BEGIN;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_booking_source_chk;

DROP INDEX IF EXISTS idx_bookings_booking_source;

ALTER TABLE public.bookings
  DROP COLUMN IF EXISTS broker_id,
  DROP COLUMN IF EXISTS broker_name,
  DROP COLUMN IF EXISTS platform_name,
  DROP COLUMN IF EXISTS booking_source;

COMMIT;

- اضافة للحجوزات السابقة -
-- يجلب أحدث حدث لكل حجز ويعبئ الأعمدة الجديدة
WITH latest_source AS (
  SELECT DISTINCT ON (booking_id)
    booking_id,
    payload->>'booking_source' AS booking_source,
    NULLIF(payload->>'platform_name','') AS platform_name,
    NULLIF(payload->>'broker_name','')   AS broker_name,
    NULLIF(payload->>'broker_id','')     AS broker_id
  FROM public.system_events
  WHERE event_type = 'booking_source' AND booking_id IS NOT NULL
  ORDER BY booking_id, created_at DESC
)
UPDATE public.bookings b
SET
  booking_source = ls.booking_source,
  platform_name  = ls.platform_name,
  broker_name    = ls.broker_name,
  broker_id      = ls.broker_id
FROM latest_source ls
WHERE b.id = ls.booking_id;
