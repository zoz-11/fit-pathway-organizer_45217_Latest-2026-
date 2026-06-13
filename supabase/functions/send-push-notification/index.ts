import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.4";
import { initializeApp, cert, getApps } from "npm:firebase-admin@12.1.0/app";
import { getMessaging } from "npm:firebase-admin@12.1.0/messaging";

// Initialize Firebase Admin SDK
const firebaseAdminConfig = {
  projectId: Deno.env.get("FIREBASE_ADMIN_PROJECT_ID"),
  clientEmail: Deno.env.get("FIREBASE_ADMIN_CLIENT_EMAIL"),
  privateKey: Deno.env.get("FIREBASE_ADMIN_PRIVATE_KEY")?.replace(/\\n/g, '\n'),
};

// Check if Firebase app is already initialized to avoid re-initialization errors
let firebaseAdminApp;
try {
  if (getApps().length === 0) {
    firebaseAdminApp = initializeApp({
      credential: cert(firebaseAdminConfig)
    });
  } else {
    firebaseAdminApp = getApps()[0];
  }
} catch (error) {
  console.error("Error initializing Firebase Admin SDK:", error);
}

const messagingAdmin = getMessaging(firebaseAdminApp);

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

const SendPushNotificationSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().min(1, "Title cannot be empty"),
  body: z.string().min(1, "Body cannot be empty"),
  data: z.record(z.string(), z.any()).optional(), // Optional data payload
});

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
    const requestBody = await req.json();
    const parsedRequest = SendPushNotificationSchema.safeParse(requestBody);

    if (!parsedRequest.success) {
      await logAudit(supabaseClient, undefined, 'Send Push Notification Failed', { reason: 'Invalid request body', details: parsedRequest.error.issues, ipAddress: req.headers.get('x-forwarded-for') });
      return new Response(JSON.stringify({ error: 'Invalid request body', details: parsedRequest.error.issues }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { userId, title, body, data } = parsedRequest.data;

    // Fetch device tokens for the user
    const { data: deviceTokens, error: fetchError } = await supabaseClient
      .from('device_tokens')
      .select('token')
      .eq('user_id', userId);

    if (fetchError) {
      console.error('Error fetching device tokens:', fetchError);
      await logAudit(supabaseClient, userId, 'Send Push Notification Failed', { reason: 'Failed to fetch device tokens', error: fetchError.message, ipAddress: req.headers.get('x-forwarded-for') });
      return new Response(JSON.stringify({ error: 'Failed to fetch device tokens' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (!deviceTokens || deviceTokens.length === 0) {
      await logAudit(supabaseClient, userId, 'Push Notification Skipped', { reason: 'No device tokens', targetUserId: userId, title: title, ipAddress: req.headers.get('x-forwarded-for') });
      return new Response(JSON.stringify({ message: 'No device tokens found for user, notification skipped' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract tokens
    const tokens = deviceTokens.map(dt => dt.token);

    const messages = tokens.map(token => ({
      notification: { title, body },
      data: data,
      token: token,
    }));

    const sendPromises = messages.map(message => messagingAdmin.send(message));
    const results = await Promise.allSettled(sendPromises);

    let successCount = 0;
    let failureCount = 0;
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successCount++;
      } else {
        failureCount++;
        console.error(`Failed to send message to token ${tokens[index]}:`, result.reason);
      }
    });

    if (failureCount > 0) {
      await logAudit(supabaseClient, userId, 'Push Notification Partial Failure', { targetUserId: userId, title: title, successCount, failureCount, ipAddress: req.headers.get('x-forwarded-for') });
      return new Response(JSON.stringify({ message: `Push notifications sent with ${successCount} successes and ${failureCount} failures.` }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await logAudit(supabaseClient, userId, 'Push Notification Sent', { targetUserId: userId, title: title, ipAddress: req.headers.get('x-forwarded-for') });

    return new Response(JSON.stringify({ message: 'Push notification simulated successfully' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Error in send-push-notification function:", error);
    await logAudit(supabaseClient, undefined, 'Send Push Notification Failed', { error: (error as Error).message, ipAddress: req.headers.get('x-forwarded-for') });
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
