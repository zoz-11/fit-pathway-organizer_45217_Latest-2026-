import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function for audit logging
async function logAudit(supabaseClient: SupabaseClient, userId: string | undefined, action: string, details: Record<string, unknown>) {
  try {
    const { error } = await supabaseClient
      .from('audit_logs')
      .insert([
        {
          user_id: userId,
          action: action,
          details: details,
        },
      ]);
    if (error) {
      console.error("Error inserting audit log:", error);
    }
  } catch (e) {
    console.error("Exception while logging audit:", e);
  }
}

const FetchProgressDataSchema = z.object({
  userId: z.string().uuid().optional(), // Optional: if trainer wants to fetch athlete's data
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
      },
    }
  );

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      await logAudit(supabaseClient, undefined, 'Fetch Progress Data Failed', { reason: 'Unauthorized: No active session', ipAddress: req.headers.get('x-forwarded-for') });
      return new Response(JSON.stringify({ error: 'Unauthorized: No active session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requestBody = await req.json();
    const parsedRequest = FetchProgressDataSchema.safeParse(requestBody);

    if (!parsedRequest.success) {
      await logAudit(supabaseClient, user.id, 'Fetch Progress Data Failed', { reason: 'Invalid request body', details: parsedRequest.error.issues, ipAddress: req.headers.get('x-forwarded-for') });
      return new Response(JSON.stringify({ error: 'Invalid request body', details: parsedRequest.error.issues }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { userId: requestedUserId, startDate, endDate } = parsedRequest.data;

    // Determine the user whose data is being requested
    let targetUserId = user.id;
    if (requestedUserId && user.id !== requestedUserId) {
      // If a userId is provided and it's not the current user, check if the current user is a trainer
      const { data: profileData, error: profileError } = await supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError || profileData?.role !== 'trainer') {
        await logAudit(supabaseClient, user.id, 'Fetch Progress Data Failed', { reason: 'Forbidden: Not authorized to view other user\'s data', requestedUserId: requestedUserId, ipAddress: req.headers.get('x-forwarded-for') });
        return new Response(JSON.stringify({ error: 'Forbidden: Not authorized to view other user\'s data' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      // If current user is a trainer, allow fetching data for the requested user
      targetUserId = requestedUserId;
    }

    // Fetch completed workouts for the target user within the date range
    let query = supabaseClient
      .from('workout_assignments')
      .select('completed_at')
      .eq('athlete_id', targetUserId)
      .eq('status', 'completed');

    if (startDate) {
      query = query.gte('completed_at', startDate);
    }
    if (endDate) {
      query = query.lte('completed_at', endDate);
    }

    const { data: completedWorkouts, error: fetchError } = await query;

    if (fetchError) {
      await logAudit(supabaseClient, user.id, 'Fetch Progress Data Failed', { reason: 'Database error', details: fetchError.message, targetUserId: targetUserId, ipAddress: req.headers.get('x-forwarded-for') });
      throw fetchError;
    }

    // Aggregate data by date
    const aggregatedData: { date: string; count: number }[] = [];
    const dateMap = new Map<string, number>();

    completedWorkouts.forEach((assignment) => {
      if (assignment.completed_at) {
        const date = new Date(assignment.completed_at).toISOString().split('T')[0]; // YYYY-MM-DD
        dateMap.set(date, (dateMap.get(date) || 0) + 1);
      }
    });

    dateMap.forEach((count, date) => {
      aggregatedData.push({ date, count });
    });

    // Sort by date
    aggregatedData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    await logAudit(supabaseClient, user.id, 'Fetch Progress Data Success', { targetUserId: targetUserId, startDate: startDate, endDate: endDate, recordCount: aggregatedData.length, ipAddress: req.headers.get('x-forwarded-for') });

    return new Response(JSON.stringify(aggregatedData), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Error in fetch-progress-data function:", error);
    await logAudit(supabaseClient, undefined, 'Fetch Progress Data Failed', { error: (error as Error).message, ipAddress: req.headers.get('x-forwarded-for') });
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});