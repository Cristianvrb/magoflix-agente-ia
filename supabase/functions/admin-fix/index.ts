import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendMetaConversionEvent, getAdAttribution } from "../_shared/ai-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversation_id, lead_stage, event_name, value, phone } = await req.json();

    if (!conversation_id) {
      return new Response(JSON.stringify({ error: "conversation_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const results: string[] = [];

    // 1. Update lead_stage
    if (lead_stage) {
      const { error } = await supabase
        .from("conversations")
        .update({ lead_stage })
        .eq("id", conversation_id);
      if (error) throw new Error(`Update lead_stage failed: ${error.message}`);
      results.push(`lead_stage -> ${lead_stage}`);
    }

    // 2. Insert conversion
    if (event_name) {
      let metaEventId: string | null = null;
      let sentToMeta = false;

      // Try Meta CAPI
      if (phone) {
        const pixelId = Deno.env.get("META_PIXEL_ID");
        const accessToken = Deno.env.get("META_ACCESS_TOKEN");
        if (pixelId && accessToken) {
          const adAttr = await getAdAttribution(supabase, conversation_id);
          metaEventId = await sendMetaConversionEvent({
            pixelId,
            accessToken,
            eventName: event_name,
            value: value || 0,
            currency: "BRL",
            phone,
            ...adAttr,
          });
          sentToMeta = !!metaEventId;
          results.push(`Meta CAPI: ${sentToMeta ? "sent" : "failed"}`);
        }
      }

      const { error } = await supabase.from("conversions").insert({
        conversation_id,
        event_name,
        value: value || 0,
        currency: "BRL",
        sent_to_meta: sentToMeta,
        meta_event_id: metaEventId,
      });
      if (error) throw new Error(`Insert conversion failed: ${error.message}`);
      results.push(`conversion: ${event_name} R$${value}`);
    }

    console.log(`[ADMIN-FIX] Done for ${conversation_id}:`, results);

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[ADMIN-FIX] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
