import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from "npm:zod@3.23.4";

// Helper function for audit logging
async function logAudit(supabaseClient: any, userId: string | undefined, action: string, details: any) {
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

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5; // 5 requests per minute

const requestCounts = new Map<string, { count: number; lastReset: number }>();

const WorkoutReminderDataSchema = z.object({
  workoutName: z.string().min(1, "Workout name cannot be empty"),
  scheduledTime: z.string().datetime("Scheduled time must be a valid datetime string"),
});

const ProgressUpdateDataSchema = z.object({
  workoutsCompleted: z.number().int().min(0, "Workouts completed cannot be negative"),
  totalTime: z.number().min(0, "Total time cannot be negative"),
});

const WelcomeDataSchema = z.object({
  name: z.string().min(1, "Name cannot be empty"),
  role: z.string().min(1, "Role cannot be empty"),
});

const AssignmentDataSchema = z.object({
  workoutName: z.string().min(1, "Workout name cannot be empty"),
  description: z.string().min(1, "Description cannot be empty"),
});

const InvitationDataSchema = z.object({
  trainerName: z.string().min(1, "Trainer name cannot be empty"),
});

const NotificationEmailRequestSchema = z.object({
  to: z.string().email("Invalid 'to' email address"),
  type: z.union([
    z.literal('workout_reminder'),
    z.literal('progress_update'),
    z.literal('welcome'),
    z.literal('assignment'),
    z.literal('invitation'),
  ]),
  data: z.union([
    WorkoutReminderDataSchema,
    ProgressUpdateDataSchema,
    WelcomeDataSchema,
    AssignmentDataSchema,
    InvitationDataSchema,
  ]),
});

type WorkoutReminderData = z.infer<typeof WorkoutReminderDataSchema>;
type ProgressUpdateData = z.infer<typeof ProgressUpdateDataSchema>;
type WelcomeData = z.infer<typeof WelcomeDataSchema>;
type AssignmentData = z.infer<typeof AssignmentDataSchema>;
type InvitationData = z.infer<typeof InvitationDataSchema>;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      await logAudit(supabaseClient, undefined, 'Email Notification Failed', { reason: 'Unauthorized: No active session', ipAddress: req.headers.get('x-forwarded-for') });
      return new Response(
        JSON.stringify({ error: 'Unauthorized: No active session' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Basic Rate Limiting
    const userId = user.id;
    const now = Date.now();
    const userRequest = requestCounts.get(userId) || { count: 0, lastReset: now };

    if (now - userRequest.lastReset > RATE_LIMIT_WINDOW_MS) {
      userRequest.count = 1;
      userRequest.lastReset = now;
    } else {
      userRequest.count++;
    }
    requestCounts.set(userId, userRequest);

    if (userRequest.count > MAX_REQUESTS_PER_WINDOW) {
      return new Response(
        JSON.stringify({ error: 'Too Many Requests: Please try again later.' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let to: string;
    let type: 'workout_reminder' | 'progress_update' | 'welcome' | 'assignment' | 'invitation';
    let data: WorkoutReminderData | ProgressUpdateData | WelcomeData | AssignmentData | InvitationData;

    const parsedBody = await NotificationEmailRequestSchema.parseAsync(await req.json());
    to = parsedBody.to;
    type = parsedBody.type;
    data = parsedBody.data;

    const { data: profileData, error: profileError } = await supabaseClient
      .from('profiles')
      .select('id, role, email')
      .eq('id', user.id)
      .single();

    if (profileError || !profileData) {
      console.error('Error fetching user profile:', profileError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: User profile not found' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const userRole = profileData.role;
    const userEmail = profileData.email;

    // Authorization checks based on email type
    switch (type) {
      case 'assignment':
        if (userRole !== 'trainer') {
          return new Response(
            JSON.stringify({ error: 'Forbidden: Only trainers can send workout assignments' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
        // Further check: Ensure trainer is assigning to their own athlete
        // This would require fetching the athlete's profile and checking trainer_athletes table
        // For simplicity, we'll assume the frontend handles this for now, but ideally,
        // a more robust check would be implemented here.
        break;
      case 'invitation':
        if (userRole !== 'trainer') {
          return new Response(
            JSON.stringify({ error: 'Forbidden: Only trainers can send invitations' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
        break;
      case 'workout_reminder':
      case 'progress_update':
      case 'welcome':
        // For personal notifications, ensure 'to' email matches authenticated user's email
        if (to !== userEmail) {
          return new Response(
            JSON.stringify({ error: 'Forbidden: Cannot send this notification to another user' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
        break;
      default:
        // No specific authorization for unknown types, but authentication is already done.
        break;
    }

    let subject = '';
    let html = '';

    switch (type) {
      case 'workout_reminder':
        subject = '🏋️ Time for your workout!';
        html = `
          <h1>Workout Reminder</h1>
          <p>Hi there!</p>
          <p>Don't forget about your scheduled workout: <strong>${data.workoutName}</strong></p>
          <p>Scheduled for: ${new Date(data.scheduledTime).toLocaleString()}</p>
        `;
        break;
      case 'progress_update':
        subject = '📈 Your fitness progress update';
        html = `
          <h1>Progress Update</h1>
          <p>Great job on your fitness journey!</p>
          <p>Workouts completed this week: ${data.workoutsCompleted}</p>
          <p>Total exercise time: ${data.totalTime} minutes</p>
          <p>Keep pushing forward!</p>
        `;
        break;
      case 'welcome':
        subject = '🎉 Welcome to FitPathway!';
        html = `
          <h1>Welcome to FitPathway!</h1>
          <p>Hi ${data.name}!</p>
          <p>We're excited to have you join our fitness community as a ${data.role}.</p>
          <p>Get started by exploring your dashboard and setting up your first workout!</p>
        `;
        break;
      case 'assignment':
        subject = '💪 New workout assignment';
        html = `
          <h1>New Workout Assignment</h1>
          <p>Your trainer has assigned you a new workout!</p>
          <p><strong>${data.workoutName}</strong></p>
          <p>Description: ${data.description}</p>
          <p>Log in to view the full details and start your workout.</p>
        `;
        break;
      case 'invitation':
        subject = `🤝 You've been invited to FitPathway!`;
        html = `
          <h1>Invitation to FitPathway</h1>
          <p>Hi there!</p>
          <p>You've been invited by <strong>${data.trainerName}</strong> to join FitPathway.</p>
          <p>Click <a href="${Deno.env.get("SITE_URL")}/auth">here</a> to accept the invitation and get started!</p>
        `;
        break;
      default:
        throw new Error('Invalid email type');
    }

    const emailResponse = await resend.emails.send({
      from: "FitPathway <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    });

    await logAudit(supabaseClient, user.id, 'Email Notification Sent', { to: to, type: type, emailResponse: emailResponse });

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error("Error in send-notification-email function:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
