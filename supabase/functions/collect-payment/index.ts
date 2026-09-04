import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { bookingId, method, collectedBy, amount } = await req.json()

    // 1. Mark booking as paid
    await supabaseAdmin.from('bookings').update({
      payment_status: 'paid',
      payment_method: method,
      payment_collected_by: collectedBy,
      payment_collected_at: new Date().toISOString(),
    }).eq('id', bookingId)

    // 2. Update cash balances in settings
    if (method === 'cash') {
      const { data: setting } = await supabaseAdmin
        .from('settings').select('value').eq('key', 'cash_in_hand').single()
      const current = parseFloat(setting?.value ?? '0')
      await supabaseAdmin.from('settings')
        .update({ value: String(current + amount) })
        .eq('key', 'cash_in_hand')
    } else {
      const { data: setting } = await supabaseAdmin
        .from('settings').select('value').eq('key', 'cash_in_account').single()
      const current = parseFloat(setting?.value ?? '0')
      await supabaseAdmin.from('settings')
        .update({ value: String(current + amount) })
        .eq('key', 'cash_in_account')
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
