import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildBaseUrl(subdomain: string): string {
  let baseUrl = subdomain || "";
  if (baseUrl.startsWith("http://") || baseUrl.startsWith("https://")) {
    // already full URL
  } else if (baseUrl.includes(".")) {
    baseUrl = `https://${baseUrl}`;
  } else {
    baseUrl = `https://${baseUrl}.uazapi.com`;
  }
  return baseUrl.replace(/\/+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, instance_id, group_jid, participants, instance_ids } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Action: get-instance-jids — get JIDs for given instance IDs
    if (action === "get-instance-jids") {
      const ids = instance_ids || [];
      if (!ids.length) {
        return new Response(JSON.stringify({ error: "instance_ids required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: instances, error } = await supabase
        .from("instances")
        .select("id, name, uazapi_subdomain, uazapi_token")
        .in("id", ids);

      if (error) throw error;

      const results: any[] = [];
      for (const inst of instances || []) {
        const baseUrl = buildBaseUrl(inst.uazapi_subdomain);
        try {
          // Try multiple endpoints to find JID
          let data: any = {};
          let jid = "";
          
          // Try /instance/info first
          for (const endpoint of ["/instance/info", "/status", "/instance/me"]) {
            try {
              const res = await fetch(`${baseUrl}${endpoint}`, {
                headers: { token: inst.uazapi_token },
              });
              if (res.ok) {
                data = await res.json();
                jid = data?.WID || data?.wid || data?.Jid || data?.jid || data?.phone || data?.data?.wid || data?.data?.jid || "";
                if (jid) break;
              }
            } catch {}
          }
          
          // If still no JID, try /group/list and extract bot from participants
          if (!jid) {
            try {
              const gRes = await fetch(`${baseUrl}/group/list`, {
                headers: { token: inst.uazapi_token },
              });
              if (gRes.ok) {
                data = { note: "extracted from group list - check logs" };
                const groups = await gRes.json();
                console.log(`[MANAGE-GROUP] Instance ${inst.name} group/list first item:`, JSON.stringify(groups?.[0])?.slice(0, 500));
              }
            } catch {}
          }
          results.push({ id: inst.id, name: inst.name, jid, raw: data });
        } catch (e: any) {
          results.push({ id: inst.id, name: inst.name, error: e.message });
        }
      }

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: add-participants
    if (action === "add-participants") {
      if (!instance_id || !group_jid || !participants?.length) {
        return new Response(JSON.stringify({ error: "instance_id, group_jid, participants required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: instance, error: iErr } = await supabase
        .from("instances")
        .select("uazapi_subdomain, uazapi_token")
        .eq("id", instance_id)
        .single();

      if (iErr || !instance) {
        return new Response(JSON.stringify({ error: "Instance not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const baseUrl = buildBaseUrl(instance.uazapi_subdomain);
      
      // Try multiple endpoint patterns
      const endpoints = [
        { method: "POST", url: `${baseUrl}/group/${group_jid}/addParticipant`, body: { participants } },
        { method: "PUT", url: `${baseUrl}/group/${group_jid}/addParticipant`, body: { participants } },
        { method: "POST", url: `${baseUrl}/group/addParticipant`, body: { groupJid: group_jid, participants } },
        { method: "POST", url: `${baseUrl}/group/${group_jid}/participants/add`, body: participants },
        { method: "POST", url: `${baseUrl}/group/inviteLink`, body: { groupJid: group_jid } },
      ];

      let resData: any = null;
      let lastStatus = 0;
      
      for (const ep of endpoints) {
        console.log("[MANAGE-GROUP] Trying:", ep.method, ep.url);
        try {
          const res = await fetch(ep.url, {
            method: ep.method,
            headers: { "Content-Type": "application/json", token: instance.uazapi_token },
            body: JSON.stringify(ep.body),
          });
          resData = await res.json();
          lastStatus = res.status;
          console.log("[MANAGE-GROUP] Response:", { status: res.status, data: resData });
          if (res.ok) break;
          if (res.status !== 404 && res.status !== 405) break;
        } catch (e: any) {
          console.log("[MANAGE-GROUP] Error on", ep.url, e.message);
        }
      }

      return new Response(JSON.stringify({ success: lastStatus >= 200 && lastStatus < 300, data: resData, status: lastStatus }), {
        status: lastStatus || 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action. Use: get-instance-jids, add-participants" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[MANAGE-GROUP] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
