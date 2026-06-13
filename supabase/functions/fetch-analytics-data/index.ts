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

const FetchAnalyticsDataSchema = z.object({
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
      await logAudit(supabaseClient, undefined, 'Fetch Analytics Data Failed', { reason: 'Unauthorized: No active session', ipAddress: req.headers.get('x-forwarded-for') });
      return new Response(JSON.stringify({ error: 'Unauthorized: No active session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requestBody = await req.json();
    const parsedRequest = FetchAnalyticsDataSchema.safeParse(requestBody);

    if (!parsedRequest.success) {
      await logAudit(supabaseClient, user.id, 'Fetch Analytics Data Failed', { reason: 'Invalid request body', details: parsedRequest.error.issues, ipAddress: req.headers.get('x-forwarded-for') });
      return new Response(JSON.stringify({ error: 'Invalid request body', details: parsedRequest.error.issues }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { userId: requestedUserId, startDate, endDate } = parsedRequest.data;

    let targetUserId = user.id;
    if (requestedUserId && user.id !== requestedUserId) {
      const { data: profileData, error: profileError } = await supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError || profileData?.role !== 'trainer') {
        await logAudit(supabaseClient, user.id, 'Fetch Analytics Data Failed', { 
          reason: 'Forbidden: Not authorized to view other users data', 
          requestedUserId: requestedUserId, 
          ipAddress: req.headers.get('x-forwarded-for') 
        });
        return new Response(JSON.stringify({ error: 'Forbidden: Not authorized to view other users data' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      targetUserId = requestedUserId;
    }

    // Fetch completed workout assignments for the target user
    let workoutsQuery = supabaseClient
      .from('workout_schedules')
      .select('*')
      .eq('athlete_id', targetUserId)
      .eq('status', 'completed');

    if (startDate) {
      workoutsQuery = workoutsQuery.gte('completed_at', startDate); // Wait, workout_schedules has updated_at or scheduled_date? Let's check.
    }
    if (endDate) {
      workoutsQuery = workoutsQuery.lte('completed_at', endDate);
    }

    const { data: completedWorkouts, error: workoutsError } = await workoutsQuery;
    if (workoutsError) {
      await logAudit(supabaseClient, user.id, 'Fetch Analytics Data Failed', { reason: 'Database error fetching workouts', details: workoutsError.message, ipAddress: req.headers.get('x-forwarded-for') });
      throw workoutsError;
    }

    // Aggregate data
    const totalWorkouts = completedWorkouts.length;
    const totalDuration = completedWorkouts.reduce((sum, wa) => sum + (wa.duration_minutes || 0), 0);

    const exerciseFrequency: { [key: string]: number } = {};
    completedWorkouts.forEach(wa => {
      if (wa.title) {
        exerciseFrequency[wa.title] = (exerciseFrequency[wa.title] || 0) + 1;
      }
    });

    const mostFrequentExercise = Object.entries(exerciseFrequency).sort(([, a], [, b]) => b - a)[0] || ['N/A', 0];

    const analyticsData = {
      totalWorkouts,
      totalDuration,
      mostFrequentExercise: mostFrequentExercise[0],
      mostFrequentExerciseCount: mostFrequentExercise[1],
      exerciseFrequency,
    };

    await logAudit(supabaseClient, user.id, 'Fetch Analytics Data Success', { targetUserId: targetUserId, ipAddress: req.headers.get('x-forwarded-for') });

    return new Response(JSON.stringify(analyticsData), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Error in fetch-analytics-data function:", error);
    await logAudit(supabaseClient, undefined, 'Fetch Analytics Data Failed', { error: (error as Error).message, ipAddress: req.headers.get('x-forwarded-for') });
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});