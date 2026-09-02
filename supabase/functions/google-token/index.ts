// Exchanges the caller's stored Google refresh token for a fresh access token.
// The Google client secret lives only here (function secrets), never in the
// browser. Auth: we validate the caller's Supabase JWT explicitly via
// auth.getUser (verify_jwt is off because user JWTs use the new asymmetric keys).

import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // supabase-js sends apikey + x-client-info; missing them fails the preflight
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
  const user = userData?.user
  if (userErr || !user) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: CORS })
  }

  const { data: row } = await supabase
    .from('google_tokens')
    .select('refresh_token')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!row) {
    return Response.json({ error: 'not_connected' }, { status: 404, headers: CORS })
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return Response.json({ error: 'secrets_missing' }, { status: 500, headers: CORS })
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    // Revoked/expired grant: forget it so the client prompts a re-connect.
    if (body.includes('invalid_grant')) {
      await supabase.from('google_tokens').delete().eq('owner_id', user.id)
      return Response.json({ error: 'reconnect_required' }, { status: 401, headers: CORS })
    }
    return Response.json({ error: 'exchange_failed', detail: body }, { status: 502, headers: CORS })
  }

  const json = await res.json()
  return Response.json(
    { access_token: json.access_token, expires_in: json.expires_in },
    { headers: CORS },
  )
})
