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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const action = body.action || "register";
    const instanceId = body.instance_id;

    let subdomain = "";
    let token = "";

    if (instanceId) {
      // Use instance-specific credentials
      const { data: inst } = await supabase
        .from("instances")
        .select("uazapi_subdomain, uazapi_token")
        .eq("id", instanceId)
        .single();
      if (!inst) {
        return new Response(
          JSON.stringify({ error: "Instância não encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      subdomain = inst.uazapi_subdomain;
      token = inst.uazapi_token;
    } else {
      // Fall back to agent_settings
      const { data: settings } = await supabase
        .from("agent_settings")
        .select("uazapi_subdomain, uazapi_token")
        .limit(1)
        .single();
      subdomain = settings?.uazapi_subdomain || "";
      token = settings?.uazapi_token || "";
    }

    if (!subdomain || !token) {
      return new Response(
        JSON.stringify({ error: "Subdomínio ou token da uazapi não configurados" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = subdomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const webhookURL = instanceId
      ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/uazapi-webhook?instance_id=${instanceId}`
      : `${Deno.env.get("SUPABASE_URL")}/functions/v1/uazapi-webhook`;

    if (action === "verify") {
      const resp = await fetch(`https://${baseUrl}/webhook`, {
        method: "GET",
        headers: { token },
      });
      const data = await resp.json();
      return new Response(
        JSON.stringify({ ok: resp.ok, status: resp.status, current_config: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Register webhook (V2 format)
    const v2Body = { url: webhookURL, enabled: true, events: ["messages"] };

    const resp = await fetch(`https://${baseUrl}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify(v2Body),
    });
    const data = await resp.json();
    console.log("POST result:", JSON.stringify(data));

    // uazapi returns an ARRAY like [{"enabled": true, "url": "..."}]
    const result = Array.isArray(data) ? data[0] : data;
    const success = result?.enabled === true && result?.url;

    if (!success) {
      console.log("POST didn't succeed, trying PUT...");
      const putResp = await fetch(`https://${baseUrl}/webhook`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify(v2Body),
      });
      const putData = await putResp.json();
      console.log("PUT result:", JSON.stringify(putData));

      return new Response(
        JSON.stringify({ ok: putResp.ok, status: putResp.status, result: putData, webhookURL }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Webhook registered successfully:", JSON.stringify(result));
    return new Response(
      JSON.stringify({ ok: true, status: resp.status, result, webhookURL }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("register-webhook error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
