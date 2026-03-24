import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instance_id, group_name, participants, agent_id } = await req.json();

    if (!instance_id || !group_name) {
      return new Response(JSON.stringify({ error: "instance_id e group_name são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Buscar instância
    const { data: instance, error: iErr } = await supabase
      .from("instances")
      .select("uazapi_subdomain, uazapi_token")
      .eq("id", instance_id)
      .single();

    if (iErr || !instance) {
      return new Response(JSON.stringify({ error: "Instância não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let baseUrl = instance.uazapi_subdomain || "";
    if (baseUrl.startsWith("http://") || baseUrl.startsWith("https://")) {
      // already full URL
    } else if (baseUrl.includes(".")) {
      baseUrl = `https://${baseUrl}`;
    } else {
      baseUrl = `https://${baseUrl}.uazapi.com`;
    }
    baseUrl = baseUrl.replace(/\/+$/, "");

    // Criar grupo via uazapi
    const createUrl = `${baseUrl}/group/create`;
    const payload = {
      name: group_name,
      participants: participants || [],
    };

    console.log("[CREATE-GROUP] Calling:", createUrl, payload);

    const res = await fetch(createUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: instance.uazapi_token,
      },
      body: JSON.stringify(payload),
    });

    const resData = await res.json();
    console.log("[CREATE-GROUP] Response:", { status: res.status, data: resData });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Erro ao criar grupo na uazapi", details: resData }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extrair o ID do grupo criado
    const group = resData.group || resData;
    const wa_group_id = group.JID || group.jid || resData.JID || resData.jid || resData.id || resData.groupJid || resData.gid || "";

    if (!wa_group_id) {
      return new Response(JSON.stringify({
        error: "Grupo criado mas não foi possível extrair o ID",
        raw_response: resData,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Salvar no banco
    const groupInsert: any = {
      wa_group_id,
      name: group_name,
      instance_id,
    };
    if (agent_id) {
      groupInsert.agent_id = agent_id;
    }

    const { data: savedGroup, error: saveErr } = await supabase
      .from("groups")
      .upsert(groupInsert, { onConflict: "wa_group_id" })
      .select()
      .single();

    if (saveErr) {
      console.error("[CREATE-GROUP] Save error:", saveErr);
      return new Response(JSON.stringify({
        warning: "Grupo criado no WhatsApp mas erro ao salvar no banco",
        wa_group_id,
        save_error: saveErr.message,
        raw_response: resData,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      group: savedGroup,
      wa_response: resData,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[CREATE-GROUP] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
