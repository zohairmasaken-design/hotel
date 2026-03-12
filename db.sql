-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.accounting_periods (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  period_name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open'::text CHECK (status = ANY (ARRAY['open'::text, 'closed'::text])),
  closed_at timestamp with time zone,
  closed_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT accounting_periods_pkey PRIMARY KEY (id)
);
CREATE TABLE public.accounts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['asset'::text, 'liability'::text, 'equity'::text, 'revenue'::text, 'expense'::text])),
  parent_id uuid,
  is_active boolean DEFAULT true,
  is_system boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  CONSTRAINT accounts_pkey PRIMARY KEY (id),
  CONSTRAINT accounts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.ar_subledger (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  journal_entry_id uuid NOT NULL,
  amount numeric NOT NULL,
  direction text CHECK (direction = ANY (ARRAY['debit'::text, 'credit'::text])),
  transaction_date date NOT NULL,
  due_date date,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT ar_subledger_pkey PRIMARY KEY (id),
  CONSTRAINT ar_subledger_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT ar_subledger_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id)
);
CREATE TABLE public.archived_journal_entries (
  id uuid,
  accounting_period_id uuid,
  entry_date date,
  description text,
  reference_type text,
  reference_id uuid,
  voucher_number text,
  status text,
  created_at timestamp with time zone,
  created_by uuid,
  updated_at timestamp with time zone
);
CREATE TABLE public.archived_journal_lines (
  id uuid,
  journal_entry_id uuid,
  account_id uuid,
  cost_center_id uuid,
  debit numeric,
  credit numeric,
  description text,
  created_at timestamp with time zone
);
CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  table_name text,
  record_id uuid,
  action text CHECK (action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bookings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  hotel_id uuid,
  unit_id uuid,
  customer_id uuid,
  check_in date NOT NULL,
  check_out date NOT NULL,
  nights integer,
  booking_type text DEFAULT 'nightly'::text,
  status text DEFAULT 'confirmed'::text CHECK (status = ANY (ARRAY['draft'::text, 'quoted'::text, 'pending_deposit'::text, 'deposit_paid'::text, 'confirmed'::text, 'checked_in'::text, 'checked_out'::text, 'cancelled'::text, 'completed'::text])),
  total_price numeric DEFAULT 0 CHECK (total_price >= 0::numeric),
  tax_amount numeric DEFAULT 0 CHECK (tax_amount >= 0::numeric),
  subtotal numeric DEFAULT 0 CHECK (subtotal >= 0::numeric),
  daily_rate numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  created_by uuid,
  discount_amount numeric DEFAULT 0 CHECK (discount_amount >= 0::numeric),
  additional_services jsonb DEFAULT '[]'::jsonb,
  booking_source text CHECK (booking_source = ANY (ARRAY['reception'::text, 'platform'::text, 'broker'::text])),
  platform_name text,
  broker_name text,
  broker_id text,
  CONSTRAINT bookings_pkey PRIMARY KEY (id),
  CONSTRAINT bookings_hotel_id_fkey FOREIGN KEY (hotel_id) REFERENCES public.hotels(id),
  CONSTRAINT bookings_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id),
  CONSTRAINT bookings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT bookings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.cleaning_logs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  unit_id uuid,
  cleaned_by uuid,
  cleaned_at timestamp with time zone DEFAULT now(),
  notes text,
  photo_data text,
  created_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'pending'::text,
  confirmed_by uuid,
  confirmed_at timestamp with time zone,
  CONSTRAINT cleaning_logs_pkey PRIMARY KEY (id),
  CONSTRAINT cleaning_logs_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id),
  CONSTRAINT cleaning_logs_cleaned_by_fkey FOREIGN KEY (cleaned_by) REFERENCES auth.users(id),
  CONSTRAINT cleaning_logs_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.cost_centers (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  type text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cost_centers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.customer_accounts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  customer_id uuid NOT NULL UNIQUE,
  account_id uuid NOT NULL,
  deposit_account_id uuid,
  opening_balance numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT customer_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT customer_accounts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT customer_accounts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id),
  CONSTRAINT customer_accounts_deposit_account_id_fkey FOREIGN KEY (deposit_account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  full_name text NOT NULL,
  national_id text,
  phone text,
  customer_type text DEFAULT 'individual'::text CHECK (customer_type = ANY (ARRAY['individual'::text, 'company'::text, 'broker'::text, 'platform'::text])),
  nationality text,
  email text,
  country text DEFAULT 'Saudi Arabia'::text,
  commercial_register text,
  tax_number text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  address text,
  broker_name text,
  broker_id text,
  platform_name text,
  details text,
  company_name text,
  CONSTRAINT customers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  doc_type text NOT NULL CHECK (doc_type = ANY (ARRAY['voucher'::text, 'invoice'::text, 'statement'::text, 'contract'::text, 'handover'::text, 'return'::text])),
  unit_id uuid,
  unit_number text,
  customer_id uuid,
  booking_id uuid,
  storage_path text NOT NULL UNIQUE,
  content_type text NOT NULL,
  doc_date date NOT NULL DEFAULT now(),
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  uploader_id uuid,
  CONSTRAINT documents_pkey PRIMARY KEY (id),
  CONSTRAINT documents_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id),
  CONSTRAINT documents_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT documents_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id),
  CONSTRAINT documents_uploader_id_fkey FOREIGN KEY (uploader_id) REFERENCES auth.users(id)
);
CREATE TABLE public.expense_accruals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  expense_account_id uuid,
  amount numeric,
  accrual_date date,
  description text,
  reversed boolean DEFAULT false,
  CONSTRAINT expense_accruals_pkey PRIMARY KEY (id),
  CONSTRAINT expense_accruals_expense_account_id_fkey FOREIGN KEY (expense_account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.group_booking_units (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_booking_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  check_in date NOT NULL,
  check_out date NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'pending_deposit'::text, 'confirmed'::text, 'checked_in'::text, 'checked_out'::text, 'cancelled'::text])),
  unit_price numeric DEFAULT 0 CHECK (unit_price >= 0::numeric),
  subtotal numeric DEFAULT 0 CHECK (subtotal >= 0::numeric),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT group_booking_units_pkey PRIMARY KEY (id),
  CONSTRAINT group_booking_units_group_booking_id_fkey FOREIGN KEY (group_booking_id) REFERENCES public.group_bookings(id),
  CONSTRAINT group_booking_units_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id)
);
CREATE TABLE public.group_bookings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  check_in date NOT NULL,
  check_out date NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'pending_deposit'::text, 'confirmed'::text, 'checked_in'::text, 'checked_out'::text, 'cancelled'::text])),
  total_amount numeric DEFAULT 0 CHECK (total_amount >= 0::numeric),
  total_deposit numeric DEFAULT 0 CHECK (total_deposit >= 0::numeric),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  CONSTRAINT group_bookings_pkey PRIMARY KEY (id),
  CONSTRAINT group_bookings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.group_invoice_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_invoice_id uuid,
  unit_id uuid,
  description text,
  amount numeric NOT NULL CHECK (amount >= 0::numeric),
  CONSTRAINT group_invoice_items_pkey PRIMARY KEY (id),
  CONSTRAINT group_invoice_items_group_invoice_id_fkey FOREIGN KEY (group_invoice_id) REFERENCES public.group_invoices(id),
  CONSTRAINT group_invoice_items_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id)
);
CREATE TABLE public.group_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_booking_id uuid,
  invoice_number text UNIQUE,
  invoice_date date DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric DEFAULT 0 CHECK (subtotal >= 0::numeric),
  tax_amount numeric DEFAULT 0 CHECK (tax_amount >= 0::numeric),
  total_amount numeric DEFAULT 0 CHECK (total_amount >= 0::numeric),
  paid_amount numeric DEFAULT 0 CHECK (paid_amount >= 0::numeric),
  status text DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'posted'::text, 'paid'::text, 'void'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT group_invoices_pkey PRIMARY KEY (id),
  CONSTRAINT group_invoices_group_booking_id_fkey FOREIGN KEY (group_booking_id) REFERENCES public.group_bookings(id)
);
CREATE TABLE public.hotels (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  code text,
  floors_count integer DEFAULT 0,
  tax_rate numeric DEFAULT 0.15,
  currency text DEFAULT 'SAR'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  type text,
  description text,
  address text,
  phone text,
  email text,
  amenities jsonb DEFAULT '[]'::jsonb,
  CONSTRAINT hotels_pkey PRIMARY KEY (id)
);
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  booking_id uuid,
  customer_id uuid,
  invoice_number text UNIQUE,
  invoice_date date DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  total_amount numeric DEFAULT 0,
  paid_amount numeric DEFAULT 0,
  balance_due numeric DEFAULT (total_amount - paid_amount),
  status text DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'posted'::text, 'paid'::text, 'void'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  created_by uuid,
  discount_amount numeric DEFAULT 0 CHECK (discount_amount >= 0::numeric),
  additional_services_amount numeric DEFAULT 0 CHECK (additional_services_amount >= 0::numeric),
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT invoices_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id),
  CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.journal_entries (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  accounting_period_id uuid,
  entry_date date NOT NULL,
  description text,
  reference_type text,
  reference_id uuid,
  voucher_number text UNIQUE,
  status text DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'posted'::text, 'cancelled'::text])),
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  updated_at timestamp with time zone,
  CONSTRAINT journal_entries_pkey PRIMARY KEY (id),
  CONSTRAINT journal_entries_accounting_period_id_fkey FOREIGN KEY (accounting_period_id) REFERENCES public.accounting_periods(id)
);
CREATE TABLE public.journal_lines (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  journal_entry_id uuid,
  account_id uuid,
  cost_center_id uuid,
  debit numeric DEFAULT 0 CHECK (debit >= 0::numeric),
  credit numeric DEFAULT 0 CHECK (credit >= 0::numeric),
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT journal_lines_pkey PRIMARY KEY (id),
  CONSTRAINT journal_lines_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id),
  CONSTRAINT journal_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id),
  CONSTRAINT journal_lines_cost_center_id_fkey FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers(id)
);
CREATE TABLE public.maintenance_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL,
  performed_by uuid,
  performed_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text,
  photo_data text,
  status text DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  issue_type text,
  description text,
  photo_before text,
  photo_after text,
  reported_by uuid,
  reported_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  confirmed_by uuid,
  confirmed_at timestamp with time zone,
  CONSTRAINT maintenance_logs_pkey PRIMARY KEY (id),
  CONSTRAINT maintenance_logs_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id),
  CONSTRAINT maintenance_logs_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES auth.users(id),
  CONSTRAINT maintenance_logs_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES auth.users(id),
  CONSTRAINT maintenance_logs_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.payment_allocations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  payment_id uuid,
  invoice_id uuid,
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT payment_allocations_pkey PRIMARY KEY (id),
  CONSTRAINT payment_allocations_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id),
  CONSTRAINT payment_allocations_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id)
);
CREATE TABLE public.payment_methods (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  account_id uuid,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT payment_methods_pkey PRIMARY KEY (id),
  CONSTRAINT payment_methods_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  customer_id uuid,
  invoice_id uuid,
  payment_method_id uuid,
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  journal_entry_id uuid,
  description text,
  status text DEFAULT 'posted'::text,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id),
  CONSTRAINT payments_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id),
  CONSTRAINT payments_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id)
);
CREATE TABLE public.pricing_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_type_id uuid,
  season text,
  start_date date,
  end_date date,
  price numeric,
  priority integer DEFAULT 1,
  active boolean DEFAULT true,
  CONSTRAINT pricing_rules_pkey PRIMARY KEY (id),
  CONSTRAINT pricing_rules_unit_type_id_fkey FOREIGN KEY (unit_type_id) REFERENCES public.unit_types(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text,
  role text DEFAULT 'receptionist'::text CHECK (role = ANY (ARRAY['admin'::text, 'manager'::text, 'receptionist'::text, 'housekeeping'::text])),
  email text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.revenue_schedules (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  booking_id uuid,
  recognition_date date NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0::numeric),
  recognized boolean DEFAULT false,
  journal_entry_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT revenue_schedules_pkey PRIMARY KEY (id),
  CONSTRAINT revenue_schedules_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id),
  CONSTRAINT revenue_schedules_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id)
);
CREATE TABLE public.staff_notes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  target_user_id uuid,
  created_by uuid,
  type text DEFAULT 'note'::text CHECK (type = ANY (ARRAY['violation'::text, 'note'::text, 'commendation'::text])),
  severity text DEFAULT 'low'::text CHECK (severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])),
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT staff_notes_pkey PRIMARY KEY (id),
  CONSTRAINT staff_notes_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.profiles(id),
  CONSTRAINT staff_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.system_account_mappings (
  key text NOT NULL,
  account_id uuid,
  label text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT system_account_mappings_pkey PRIMARY KEY (key),
  CONSTRAINT system_account_mappings_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.system_events (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  event_type text NOT NULL,
  booking_id uuid,
  unit_id uuid,
  customer_id uuid,
  hotel_id uuid,
  staff_note_id uuid,
  payload jsonb,
  message text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  is_read boolean DEFAULT false,
  CONSTRAINT system_events_pkey PRIMARY KEY (id),
  CONSTRAINT system_events_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id),
  CONSTRAINT system_events_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT system_events_hotel_id_fkey FOREIGN KEY (hotel_id) REFERENCES public.hotels(id),
  CONSTRAINT system_events_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id)
);
CREATE TABLE public.temporary_reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL UNIQUE,
  customer_name text NOT NULL,
  phone text,
  reserve_date date NOT NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT temporary_reservations_pkey PRIMARY KEY (id),
  CONSTRAINT temporary_reservations_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id)
);
CREATE TABLE public.transaction_types (
  code text NOT NULL,
  description text,
  CONSTRAINT transaction_types_pkey PRIMARY KEY (code)
);
CREATE TABLE public.unit_types (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  hotel_id uuid,
  name text NOT NULL,
  description text,
  daily_price numeric DEFAULT 0 CHECK (daily_price >= 0::numeric),
  annual_price numeric DEFAULT 0 CHECK (annual_price >= 0::numeric),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  area numeric,
  max_adults integer DEFAULT 2,
  max_children integer DEFAULT 0,
  features jsonb DEFAULT '[]'::jsonb,
  tax_rate numeric DEFAULT 0.15,
  CONSTRAINT unit_types_pkey PRIMARY KEY (id),
  CONSTRAINT unit_types_hotel_id_fkey FOREIGN KEY (hotel_id) REFERENCES public.hotels(id)
);
CREATE TABLE public.units (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  hotel_id uuid,
  unit_type_id uuid,
  unit_number text NOT NULL,
  floor text,
  status text DEFAULT 'available'::text CHECK (status = ANY (ARRAY['available'::text, 'occupied'::text, 'maintenance'::text, 'cleaning'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  view_type text,
  notes text,
  CONSTRAINT units_pkey PRIMARY KEY (id),
  CONSTRAINT units_hotel_id_fkey FOREIGN KEY (hotel_id) REFERENCES public.hotels(id),
  CONSTRAINT units_unit_type_id_fkey FOREIGN KEY (unit_type_id) REFERENCES public.unit_types(id)
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['admin'::text, 'manager'::text, 'accountant'::text, 'reception'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_roles_pkey PRIMARY KEY (user_id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name text,
  role text NOT NULL CHECK (role = ANY (ARRAY['admin'::text, 'manager'::text, 'accountant'::text, 'reception'::text, 'guest'::text])),
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);