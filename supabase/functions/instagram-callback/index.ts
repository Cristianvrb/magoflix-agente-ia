import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);

  // GET = Meta webhook verification challenge
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token) {
      const { data } = await supabase
        .from("social_settings")
        .select("value")
        .eq("key", "webhook_verify_token")
        .single();

      if (data && data.value === token) {
        console.log("Webhook verified successfully");
        return new Response(challenge, { status: 200, headers: corsHeaders });
      }

      const receivedToken = token?.substring(0, 8) + "...";
      const storedToken = data?.value?.substring(0, 8) + "..." || "NOT_FOUND";
      console.error(`Verify token mismatch. Received: ${receivedToken}, Stored: ${storedToken}`);
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    return new Response("Bad Request", { status: 400, headers: corsHeaders });
  }

  // POST = incoming webhook events
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("Instagram webhook event:", JSON.stringify(body));

      // Handle deauthorize / data deletion callbacks
      const type = url.searchParams.get("type");
      if (type === "deauthorize") {
        console.log("Deauthorize callback received");
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (type === "delete") {
        console.log("Data deletion request received");
        return new Response(
          JSON.stringify({
            url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/instagram-callback?status=deleted`,
            confirmation_code: crypto.randomUUID(),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Process webhook entries
      if (body.entry) {
        for (const entry of body.entry) {
          // Process comments
          if (entry.changes) {
            for (const change of entry.changes) {
              if (change.field === "comments" && change.value) {
                const v = change.value;
                await supabase.from("social_comments").insert({
                  post_id: v.media?.id || null,
                  platform: "instagram",
                  author_name: v.from?.username || v.from?.name || "Desconhecido",
                  author_id: v.id || v.from?.id || null,
                  content: v.text || "",
                });
                console.log("Comment saved:", v.id);

                // Trigger auto-reply by keyword
                try {
                  const autoReplyRes = await fetch(
                    `${Deno.env.get("SUPABASE_URL")}/functions/v1/social-auto-reply-keyword`,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                      },
                      body: JSON.stringify({
                        comment_id: v.id || null,
                        comment_text: v.text || "",
                        author_id: v.from?.id || v.id || null,
                        author_name: v.from?.username || v.from?.name || "Desconhecido",
                        post_id: v.media?.id || null,
                        platform: "instagram",
                      }),
                    }
                  );
                  const autoReplyData = await autoReplyRes.json();
                  console.log("IG auto-reply result:", JSON.stringify(autoReplyData));
                } catch (autoErr) {
                  console.error("IG auto-reply call failed:", autoErr);
                }
              }
            }
          }

          // Process messages (DMs)
          if (entry.messaging) {
            for (const msg of entry.messaging) {
              if (msg.message?.text) {
                await supabase.from("social_dms").insert({
                  platform: "instagram",
                  sender_name: msg.sender?.id || "Desconhecido",
                  sender_id: msg.sender?.id || null,
                  content: msg.message.text,
                });
                console.log("DM saved from:", msg.sender?.id);
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e: any) {
      console.error("instagram-callback error:", e);
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
});
