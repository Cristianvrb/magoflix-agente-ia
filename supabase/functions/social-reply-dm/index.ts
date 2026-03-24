import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { dm_id, recipient_id, message, platform } = await req.json();
    if (!recipient_id || !message) throw new Error("recipient_id and message required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings } = await supabase.from("social_settings").select("*");
    const get = (k: string) => settings?.find((s: any) => s.key === k)?.value || "";

    const isThreads = platform === "threads";
    const token = isThreads ? get("threads_access_token") : get("ig_access_token");
    const userId = isThreads ? get("threads_user_id") : get("ig_user_id");

    if (!token || !userId) throw new Error(`Credenciais não configuradas para ${platform || "instagram"}`);

    // Send message via Instagram Messaging API
    const res = await fetch(`https://graph.instagram.com/v21.0/${userId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipient_id },
        message: { text: message },
        access_token: token,
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    // Update DB
    if (dm_id) {
      await supabase
        .from("social_dms")
        .update({ reply_content: message, replied_at: new Date().toISOString() })
        .eq("id", dm_id);
    }

    return new Response(JSON.stringify({ success: true, message_id: data.message_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("social-reply-dm error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
