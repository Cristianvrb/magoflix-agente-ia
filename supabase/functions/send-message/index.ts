import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversation_id, content } = await req.json();
    if (!conversation_id || !content) {
      return new Response(JSON.stringify({ error: "Missing conversation_id or content" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get conversation
    const { data: conversation, error: convErr } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversation_id)
      .single();

    if (convErr || !conversation) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save message
    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .insert({
        conversation_id,
        role: "assistant",
        content,
      })
      .select()
      .single();

    if (msgErr) throw msgErr;

    // Update conversation timestamp
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation_id);

    // If WhatsApp, send via uazapi V2
    if (conversation.channel === "whatsapp" && conversation.contact_phone) {
      let subdomain = "";
      let token = "";

      // Try instance-specific credentials first
      if (conversation.instance_id) {
        const { data: inst } = await supabase
          .from("instances")
          .select("uazapi_subdomain, uazapi_token")
          .eq("id", conversation.instance_id)
          .single();
        if (inst) {
          subdomain = inst.uazapi_subdomain;
          token = inst.uazapi_token;
        }
      }

      // Fall back to agent_settings
      if (!subdomain || !token) {
        const { data: settings } = await supabase
          .from("agent_settings")
          .select("uazapi_subdomain, uazapi_token")
          .limit(1)
          .single();
        if (settings) {
          subdomain = settings.uazapi_subdomain;
          token = settings.uazapi_token;
        }
      }

      if (subdomain && token) {
        const baseUrl = subdomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
        const sendUrl = `https://${baseUrl}/send/text`;
        const sendResp = await fetch(sendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            token: token,
          },
          body: JSON.stringify({
            number: conversation.contact_phone.replace(/\D/g, ""),
            text: content,
          }),
        });
        if (!sendResp.ok) {
          console.error("uazapi send error:", sendResp.status);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, message: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-message error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
