import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { name, phone, address, joining_date, salary, role, email, password, speciality } = await req.json()

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) throw new Error(authError.message)

    const userId = authData.user.id

    const { error: staffError } = await supabaseAdmin.from('staff').insert({
      id: userId,
      name,
      phone,
      address: address || null,
      joining_date,
      salary,
      role,
      speciality: speciality || 'General',
      active: true,
    })

    if (staffError) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      throw new Error(staffError.message)
    }

    // If receptionist, create default permissions
    if (role === 'receptionist') {
      await supabaseAdmin.from('receptionist_permissions').insert({
        staff_id: userId,
        can_view_bookings: true,
        can_create_bookings: true,
        can_view_customers: true,
        can_view_services: true,
        can_view_staff: false,
        can_view_reports: false,
      })
    }

    return new Response(
      JSON.stringify({ success: true, userId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
