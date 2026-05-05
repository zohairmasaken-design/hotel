import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

const TABLES: Array<{ name: string; sheetName?: string }> = [
  { name: 'hotels' },
  { name: 'units' },
  { name: 'unit_types' },
  { name: 'customers' },
  { name: 'bookings' },
  { name: 'invoices' },
  { name: 'payments' },
  { name: 'payment_methods' },
  { name: 'temporary_reservations' },
  { name: 'ejar_contract_uploads' },
  { name: 'documents' },
  { name: 'profiles' },
  { name: 'system_events' },
  { name: 'journal_entries' },
  { name: 'journal_lines' },
  { name: 'accounts' },
  { name: 'customer_accounts' },
  { name: 'payment_allocations' },
];

const BATCH_SIZE = 1000;
const MAX_ROWS_PER_TABLE = 250_000;

function sanitizeSheetName(name: string) {
  const cleaned = String(name)
    .replace(/[\[\]\:\*\?\/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const shortened = cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned;
  return shortened || 'Sheet';
}

function normalizeCellValue(value: any) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeRows(rows: any[]) {
  return (rows || []).map((row) => {
    const out: Record<string, any> = {};
    Object.keys(row || {}).forEach((k) => {
      out[k] = normalizeCellValue((row as any)[k]);
    });
    return out;
  });
}

async function fetchAllRows(admin: any, table: string) {
  const all: any[] = [];
  for (let offset = 0; offset < MAX_ROWS_PER_TABLE; offset += BATCH_SIZE) {
    const { data, error } = await admin.from(table).select('*').range(offset, offset + BATCH_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = (data || []) as any[];
    all.push(...batch);
    if (batch.length < BATCH_SIZE) break;
  }
  return all;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user || null;
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const { data: myProfile, error: roleErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (roleErr) return NextResponse.json({ ok: false, error: roleErr.message }, { status: 500 });
    if (!myProfile || myProfile.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ ok: false, error: 'missing_service_role' }, { status: 409 });
    }

    const admin = createSupabaseClient(supabaseUrl, serviceKey);
    const workbook = XLSX.utils.book_new();

    for (const t of TABLES) {
      try {
        const rows = await fetchAllRows(admin, t.name);
        const normalized = normalizeRows(rows);
        const sheet = XLSX.utils.json_to_sheet(normalized);
        XLSX.utils.book_append_sheet(workbook, sheet, sanitizeSheetName(t.sheetName || t.name));
      } catch (e: any) {
        const sheet = XLSX.utils.json_to_sheet([{ table: t.name, error: String(e?.message || e || 'error') }]);
        XLSX.utils.book_append_sheet(workbook, sheet, sanitizeSheetName(`${t.name}_error`));
      }
    }

    const buf = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
    const stamp = new Date().toISOString().replace(/[:]/g, '-').replace('T', '_').slice(0, 19);
    const filename = `backup_${stamp}.xlsx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'internal_error' }, { status: 500 });
  }
}

