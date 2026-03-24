import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeGroupId(g: any): string | null {
  for (const key of ["JID", "jid", "id", "groupJid", "chatId", "chatid", "remoteJid"]) {
    const val = g[key];
    if (typeof val === "string" && val.length > 3) return val;
    if (val && typeof val === "object" && val.user && val.server) {
      return `${val.user}@${val.server}`;
    }
  }
  return null;
}

function normalizeGroupName(g: any, fallbackId: string): string {
  return g.Name || g.subject || g.name || g.title || g.pushName || fallbackId;
}

function isBotAdmin(g: any, botJid: string): boolean {
  const participants = g.Participants || g.participants || [];
  for (const p of participants) {
    const pJid = p.JID || p.jid || p.id || "";
    if (pJid === botJid) {
      return p.IsAdmin === true || p.IsSuperAdmin === true || p.isAdmin === true || p.isSuperAdmin === true;
    }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { instance_id } = await req.json();
    if (!instance_id) throw new Error("instance_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: instance, error: iErr } = await supabase
      .from("instances")
      .select("uazapi_subdomain, uazapi_token")
      .eq("id", instance_id)
      .single();

    if (iErr || !instance) throw new Error("Instância não encontrada");
    if (!instance.uazapi_subdomain || !instance.uazapi_token) throw new Error("Credenciais da instância incompletas");

    let baseUrl = instance.uazapi_subdomain;
    if (baseUrl.startsWith("http://") || baseUrl.startsWith("https://")) {
      // already full URL
    } else if (baseUrl.includes(".")) {
      baseUrl = `https://${baseUrl}`;
    } else {
      baseUrl = `https://${baseUrl}.uazapi.com`;
    }
    baseUrl = baseUrl.replace(/\/+$/, "");

    // Fetch bot JID
    let botJid = "";
    try {
      const infoRes = await fetch(`${baseUrl}/instance/info`, {
        headers: { token: instance.uazapi_token },
      });
      if (infoRes.ok) {
        const info = await infoRes.json();
        botJid = info.JID || info.jid || info.wid || "";
        console.log("Bot JID:", botJid);
      } else {
        console.log("Could not fetch bot info:", infoRes.status);
      }
    } catch (e) {
      console.log("Error fetching bot info:", e.message);
    }

    const res = await fetch(`${baseUrl}/group/list`, {
      headers: { token: instance.uazapi_token },
    });

    if (!res.ok) throw new Error(`Erro uazapi: ${res.status}`);
    const rawData = await res.json();

    let groups: any[];
    if (Array.isArray(rawData)) {
      groups = rawData;
    } else if (rawData && typeof rawData === "object") {
      groups = rawData.groups || rawData.data || rawData.result || rawData.list || [];
      if (!Array.isArray(groups)) {
        groups = (Object.values(rawData).find(v => Array.isArray(v)) as any[]) || [];
      }
    } else {
      throw new Error("Resposta inesperada da API");
    }

    if (groups.length > 0) {
      console.log("Sample group item:", JSON.stringify(groups[0]).substring(0, 500));
    } else {
      console.log("Empty groups. Raw:", JSON.stringify(rawData).substring(0, 500));
    }

    let imported = 0;
    let skipped_missing_id = 0;
    let skipped_not_admin = 0;
    let failed_count = 0;
    let sample_failed_reason: string | null = null;

    for (const g of groups) {
      const wa_group_id = normalizeGroupId(g);
      if (!wa_group_id) {
        skipped_missing_id++;
        console.log("Skipped (no ID):", JSON.stringify(g).substring(0, 300));
        continue;
      }

      // Filter: only import groups where bot is admin
      if (botJid && !isBotAdmin(g, botJid)) {
        skipped_not_admin++;
        continue;
      }

      const name = normalizeGroupName(g, wa_group_id);
      const { error } = await supabase.from("groups").upsert(
        { wa_group_id, name, instance_id },
        { onConflict: "wa_group_id" }
      );

      if (error) {
        failed_count++;
        if (!sample_failed_reason) sample_failed_reason = error.message;
        console.log(`Upsert error for ${wa_group_id}:`, error.message);
      } else {
        imported++;
      }
    }

    return new Response(JSON.stringify({
      total: groups.length,
      admin_groups: imported + failed_count,
      imported,
      skipped_not_admin,
      skipped_missing_id,
      failed_count,
      sample_failed_reason,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
