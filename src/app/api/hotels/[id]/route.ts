import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export const runtime = 'edge';

function isValidId(id: string) {
  const uuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[089abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  const numeric = /^\d+$/;
  return uuid.test(id) || numeric.test(id);
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const body = await req.json()
  const { id } = await ctx.params
  if (!id || !isValidId(id)) {
    return NextResponse.json({ error: 'معرّف الفندق غير صالح' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('hotels')
    .update(body)
    .eq('id', id)
    .select('id, tax_rate')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ id: data.id, tax_rate: data.tax_rate })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await ctx.params
  if (!id || !isValidId(id)) {
    return NextResponse.json({ error: 'معرّف الفندق غير صالح' }, { status: 400 })
  }
  const { error } = await supabase
    .from('hotels')
    .delete()
    .eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
