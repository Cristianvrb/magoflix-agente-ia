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
        console.log("Threads webhook verified successfully");
        return new Response(challenge, { status: 200, headers: corsHeaders });
      }

      console.error(`Threads verify token mismatch`);
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    return new Response("Bad Request", { status: 400, headers: corsHeaders });
  }

  // POST = incoming webhook events
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("Threads webhook event:", JSON.stringify(body));

      const type = url.searchParams.get("type");
      if (type === "deauthorize") {
        console.log("Threads deauthorize callback received");
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (type === "delete") {
        console.log("Threads data deletion request received");
        return new Response(
          JSON.stringify({
            url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/threads-callback?status=deleted`,
            confirmation_code: crypto.randomUUID(),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Process Threads-native webhook format (body.values)
      if (body.values && Array.isArray(body.values)) {
        for (const item of body.values) {
          // Only process reply/comment events, ignore "publish" and others
          if (item.field !== "replies" && item.field !== "comments") {
            console.log(`Skipping Threads event field: ${item.field}`);
            continue;
          }

          const v = item.value;
          if (!v || !v.text) {
            console.log("Skipping empty Threads event value");
            continue;
          }

          // Extract proper IDs from Threads webhook
          const commentId = v.id || null; // This is the thread/reply media ID
          const authorUsername = v.username || "Desconhecido";
          // replied_to.id = parent comment/post this is replying to
          // root_post.id = the original root post
          const parentId = v.replied_to?.id || null;
          const rootPostId = v.root_post?.id || null;

          console.log(`Threads webhook field: ${item.field}, commentId: ${commentId}, user: ${authorUsername}, parentId: ${parentId}, rootPostId: ${rootPostId}`);

          // Deduplication: check by content + username + platform
          const { data: existing } = await supabase
            .from("social_comments")
            .select("id")
            .eq("author_name", authorUsername)
            .eq("content", v.text)
            .eq("platform", "threads")
            .maybeSingle();

          if (existing) {
            console.log("Threads comment already exists, skipping duplicate:", commentId);
            continue;
          }

          const commentData = {
            post_id: rootPostId || parentId || null,
            platform: "threads",
            author_name: authorUsername,
            author_id: commentId, // Store the comment's media ID as author_id for reference
            content: v.text,
          };
          await supabase.from("social_comments").insert(commentData);
          console.log("Threads comment saved:", commentId);

          // Trigger auto-reply by keyword
          // reply_to_id for Threads API should be the comment we're replying TO
          // which is the commentId (the media ID of this comment)
          try {
            const autoReplyPayload = {
              comment_id: commentId,
              comment_text: v.text,
              author_id: commentId, // media ID for reply_to_id
              author_name: authorUsername,
              post_id: rootPostId || parentId || null,
              platform: "threads",
            };
            console.log("Threads auto-reply payload:", JSON.stringify(autoReplyPayload));
            
            const autoReplyRes = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/social-auto-reply-keyword`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify(autoReplyPayload),
              }
            );
            const autoReplyData = await autoReplyRes.json();
            console.log("Threads auto-reply result:", JSON.stringify(autoReplyData));
          } catch (autoErr) {
            console.error("Threads auto-reply call failed:", autoErr);
          }
        }
      }

      // Fallback: Process Instagram-style webhook entries (body.entry)
      if (body.entry) {
        for (const entry of body.entry) {
          if (entry.changes) {
            for (const change of entry.changes) {
              if ((change.field === "replies" || change.field === "comments") && change.value) {
                const v = change.value;
                const commentData = {
                  post_id: v.media?.id || null,
                  platform: "threads",
                  author_name: v.from?.username || v.from?.name || "Desconhecido",
                  author_id: v.from?.id || null,
                  content: v.text || "",
                };
                await supabase.from("social_comments").insert(commentData);
                console.log("Threads comment saved (entry format):", v.id);

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
                        author_id: v.from?.id || null,
                        author_name: v.from?.username || v.from?.name || "Desconhecido",
                        post_id: v.media?.id || null,
                        platform: "threads",
                      }),
                    }
                  );
                  const autoReplyData = await autoReplyRes.json();
                  console.log("Threads auto-reply result:", JSON.stringify(autoReplyData));
                } catch (autoErr) {
                  console.error("Threads auto-reply call failed:", autoErr);
                }
              }
            }
          }

          if (entry.messaging) {
            for (const msg of entry.messaging) {
              if (msg.message?.text) {
                await supabase.from("social_dms").insert({
                  platform: "threads",
                  sender_name: msg.sender?.id || "Desconhecido",
                  sender_id: msg.sender?.id || null,
                  content: msg.message.text,
                });
                console.log("Threads DM saved from:", msg.sender?.id);
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e: any) {
      console.error("threads-callback error:", e);
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
});
