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
    const { group_id, content, image_url, audio_url } = await req.json();
    console.log("[SEND-GROUP] Received:", { group_id, hasContent: !!content, hasImage: !!image_url, hasAudio: !!audio_url });

    if (!group_id) {
      return new Response(JSON.stringify({ error: "group_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!content && !image_url && !audio_url) {
      return new Response(JSON.stringify({ error: "Envie ao menos texto, imagem ou áudio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Buscar grupo com instância vinculada
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .select("*, instances(*)")
      .eq("id", group_id)
      .single();

    if (groupError || !group) {
      return new Response(JSON.stringify({ error: "Grupo não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!group.instance_id || !group.instances) {
      return new Response(JSON.stringify({ error: "Grupo sem instância vinculada" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instance = group.instances;
    const sub = instance.uazapi_subdomain || "";
    const baseUrl = sub.startsWith("http") ? sub.replace(/\/+$/, "") : `https://${sub}.uazapi.com`;

    let sendData;

    if (image_url) {
      const url = `${baseUrl}/send/media`;
      const payload = { number: group.wa_group_id, type: "image", file: image_url, text: content || "" };
      console.log("[SEND-GROUP] Sending image:", { url, payload });
      const sendRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: instance.uazapi_token },
        body: JSON.stringify(payload),
      });
      sendData = await sendRes.json();
      console.log("[SEND-GROUP] Response:", { status: sendRes.status, data: sendData });
    } else if (audio_url) {
      const url = `${baseUrl}/send/media`;
      const payload = { number: group.wa_group_id, type: "ptt", file: audio_url };
      console.log("[SEND-GROUP] Sending audio:", { url, payload });
      const sendRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: instance.uazapi_token },
        body: JSON.stringify(payload),
      });
      sendData = await sendRes.json();
      console.log("[SEND-GROUP] Response:", { status: sendRes.status, data: sendData });
    } else {
      const url = `${baseUrl}/send/text`;
      const payload = { number: group.wa_group_id, text: content };
      console.log("[SEND-GROUP] Sending text:", { url, payload });
      const sendRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: instance.uazapi_token },
        body: JSON.stringify(payload),
      });
      sendData = await sendRes.json();
      console.log("[SEND-GROUP] Response:", { status: sendRes.status, data: sendData });
    }

    // Atualizar last_sent_at na group_messages se existir
    await supabase
      .from("group_messages")
      .update({ last_sent_at: new Date().toISOString() })
      .eq("group_id", group_id);

    return new Response(JSON.stringify({ success: true, data: sendData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[SEND-GROUP] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
