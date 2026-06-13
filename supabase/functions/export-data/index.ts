
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function for audit logging
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", // Use service role key for backend operations
    { auth: { persistSession: false } }
  );

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      await logAudit(supabaseClient, undefined, 'Data Export Failed', { reason: 'Unauthorized: No active session', ipAddress: req.headers.get('x-forwarded-for') });
      return new Response(JSON.stringify({ error: 'Unauthorized: No active session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;

    // Fetch user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (profileError) throw profileError;

    // Fetch user goals
    const { data: goals, error: goalsError } = await supabaseClient
      .from('goals')
      .select('*')
      .eq('user_id', userId);
    if (goalsError) throw goalsError;

    // Fetch user workout assignments
    const { data: workoutAssignments, error: waError } = await supabaseClient
      .from('workout_schedules')
      .select('*')
      .eq('athlete_id', userId);
    if (waError) throw waError;

    const exportData = {
      profile,
      goals,
      workoutAssignments,
    };

    await logAudit(supabaseClient, userId, 'Data Export Success', { ipAddress: req.headers.get('x-forwarded-for') });

    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="fitpathway_data_${userId}.json"`,
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error("Error in export-data function:", error);
    await logAudit(supabaseClient, undefined, 'Data Export Failed', { error: (error as Error).message, ipAddress: req.headers.get('x-forwarded-for') });
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
