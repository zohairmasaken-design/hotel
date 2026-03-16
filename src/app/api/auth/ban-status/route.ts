import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: true, banned: false }, { status: 200 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ ok: true, banned: false, enforcement: 'unavailable' }, { status: 200 });
    }

    const admin = createSupabaseClient(supabaseUrl, serviceKey);
    const { data, error } = await admin.auth.admin.getUserById(user.id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const bannedUntilRaw = (data as any)?.user?.banned_until as string | null | undefined;
    const bannedUntil = bannedUntilRaw ? new Date(bannedUntilRaw) : null;
    const banned = !!bannedUntil && bannedUntil.getTime() > Date.now();

    return NextResponse.json({ ok: true, banned, banned_until: bannedUntilRaw ?? null }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'internal_error' }, { status: 500 });
  }
}
