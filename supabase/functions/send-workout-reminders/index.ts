import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    // Get workouts scheduled for the next hour
    const oneHourFromNow = new Date();
    oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);

    const { data: scheduledWorkouts, error } = await supabaseClient
      .from('workout_schedules')
      .select(`
        *,
        profiles!workout_schedules_athlete_id_fkey(email, full_name)
      `)
      .gte('scheduled_date', new Date().toISOString())
      .lte('scheduled_date', oneHourFromNow.toISOString());

    if (error) {
      console.error("Error fetching scheduled workouts:", error);
      throw error;
    }

    // Send reminders for each workout
    for (const workout of scheduledWorkouts || []) {
      try {
        const emailResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify({
            to: workout.profiles.email,
            type: 'workout_reminder',
            data: {
              workoutName: workout.name,
              scheduledTime: workout.scheduled_date,
            }
          })
        });

        if (!emailResponse.ok) {
          console.error(`Failed to send reminder to ${workout.profiles.email}`);
        }
      } catch (emailError) {
        console.error(`Error sending reminder for workout ${workout.id}:`, emailError);
      }
    }

    return new Response(JSON.stringify({ 
      message: "Workout reminders processed", 
      count: scheduledWorkouts?.length || 0 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in send-workout-reminders function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
