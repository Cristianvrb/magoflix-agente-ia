import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Buscar mensagens agendadas que precisam ser enviadas
    const { data: messages, error: fetchError } = await supabase
      .from("group_messages")
      .select("*, groups!inner(*, instances!inner(*))")
      .eq("schedule_enabled", true)
      .lte("next_send_at", new Date().toISOString());

    if (fetchError) {
      console.error("[CRON] Error fetching scheduled messages:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!messages || messages.length === 0) {
      console.log("[CRON] No scheduled messages to process");
      return new Response(JSON.stringify({ processed: 0, errors: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[CRON] Found ${messages.length} scheduled messages to process`);

    let processed = 0;
    let errors = 0;

    for (const msg of messages) {
      try {
        const group = msg.groups;
        const instance = group.instances;
        const sub = instance.uazapi_subdomain || "";
        const baseUrl = sub.startsWith("http") ? sub.replace(/\/+$/, "") : `https://${sub}.uazapi.com`;

        let sendRes;

        if (msg.image_url) {
          const url = `${baseUrl}/send/media`;
          const payload = { number: group.wa_group_id, type: "image", file: msg.image_url, text: msg.content || "" };
          console.log(`[CRON] Sending image to ${group.name}:`, payload);
          sendRes = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: instance.uazapi_token },
            body: JSON.stringify(payload),
          });
        } else if (msg.audio_url) {
          const url = `${baseUrl}/send/media`;
          const payload = { number: group.wa_group_id, type: "ptt", file: msg.audio_url };
          console.log(`[CRON] Sending audio to ${group.name}:`, payload);
          sendRes = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: instance.uazapi_token },
            body: JSON.stringify(payload),
          });
        } else if (msg.content) {
          const url = `${baseUrl}/send/text`;
          const payload = { number: group.wa_group_id, text: msg.content };
          console.log(`[CRON] Sending text to ${group.name}:`, payload);
          sendRes = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: instance.uazapi_token },
            body: JSON.stringify(payload),
          });
        } else {
          console.log(`[CRON] Skipping message ${msg.id} - no content`);
          continue;
        }

        const sendData = await sendRes!.json();
        console.log(`[CRON] Response for ${msg.id}:`, { status: sendRes!.status, data: sendData });

        // Atualizar last_sent_at e calcular next_send_at
        const now = new Date();
        const nextSend = new Date(now.getTime() + msg.schedule_interval_hours * 60 * 60 * 1000);

        await supabase
          .from("group_messages")
          .update({
            last_sent_at: now.toISOString(),
            next_send_at: nextSend.toISOString(),
          })
          .eq("id", msg.id);

        processed++;
      } catch (err) {
        console.error(`[CRON] Error processing message ${msg.id}:`, err);
        errors++;
      }
    }

    console.log(`[CRON] Done. Processed: ${processed}, Errors: ${errors}`);
    return new Response(JSON.stringify({ processed, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[CRON] Fatal error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
