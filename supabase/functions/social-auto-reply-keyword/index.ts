import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { comment_id, comment_text, author_id, author_name, post_id, platform } = await req.json();
    if (!comment_text || !author_id) throw new Error("comment_text and author_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch active keywords
    const { data: keywords } = await supabase
      .from("social_keyword_replies")
      .select("*")
      .eq("active", true);

    if (!keywords || keywords.length === 0) {
      return new Response(JSON.stringify({ matched: false, reason: "no active keywords" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if comment contains any keyword (case-insensitive)
    const upperComment = comment_text.toUpperCase().trim();
    const matched = keywords.find((kw: any) => upperComment.includes(kw.keyword.toUpperCase()));

    if (!matched) {
      return new Response(JSON.stringify({ matched: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Keyword matched: "${matched.keyword}" from user ${author_name} (${author_id}) on ${platform}, comment_id: ${comment_id}, post_id: ${post_id}`);

    // Get credentials from social_settings
    const { data: settings } = await supabase.from("social_settings").select("*");
    const get = (k: string) => settings?.find((s: any) => s.key === k)?.value || "";

    let sent = false;
    let sendError = "";

    if (platform === "threads") {
      // === THREADS: Reply publicly to the thread ===
      const threadsToken = get("threads_access_token");
      const threadsUserId = get("threads_user_id");
      const threadsUsername = (get("threads_username") || "").replace(/^@/, "").toLowerCase().trim();

      // Skip if comment is from account owner (normalize both sides)
      const normalizedAuthor = (author_name || "").replace(/^@/, "").toLowerCase().trim();
      if (normalizedAuthor && threadsUsername && normalizedAuthor === threadsUsername) {
        console.log(`Skipping auto-reply: comment from account owner (${author_name} = ${threadsUsername})`);
        return new Response(JSON.stringify({ 
          matched: true, 
          sent: false, 
          skipped: true,
          reason: "comment from own account" 
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (!threadsToken || !threadsUserId) {
        console.error("Threads credentials not configured");
        return new Response(JSON.stringify({ matched: true, sent: false, error: "No Threads credentials" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // reply_to_id = the comment/post we're replying to
      // comment_id is the media ID of the comment that triggered this
      const replyToId = comment_id || post_id;
      console.log(`Threads reply: replyToId=${replyToId}, threadsUserId=${threadsUserId}`);

      if (!replyToId) {
        console.error("No reply_to_id available — cannot reply");
        return new Response(JSON.stringify({ matched: true, sent: false, error: "No reply_to_id" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Step 1: Create the reply media container
      const createBody = {
        media_type: "TEXT",
        text: matched.reply_text,
        reply_to_id: replyToId,
        access_token: threadsToken,
      };
      console.log(`Threads create reply body:`, JSON.stringify(createBody));
      
      const createRes = await fetch(
        `https://graph.threads.net/v1.0/${threadsUserId}/threads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createBody),
        }
      );
      const createData = await createRes.json();
      console.log(`Threads create reply response:`, JSON.stringify(createData));

      if (createData.error) {
        console.error("Threads create reply error:", JSON.stringify(createData.error));
        sendError = createData.error.message || JSON.stringify(createData.error);
      } else {
        // Step 2: Publish the reply
        const publishRes = await fetch(
          `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              creation_id: createData.id,
              access_token: threadsToken,
            }),
          }
        );
        const publishData = await publishRes.json();
        console.log(`Threads publish reply response:`, JSON.stringify(publishData));

        if (publishData.error) {
          console.error("Threads publish reply error:", JSON.stringify(publishData.error));
          sendError = publishData.error.message || JSON.stringify(publishData.error);
        } else {
          sent = true;
          console.log(`Threads reply published for keyword "${matched.keyword}" to ${author_name}, publishedId: ${publishData.id}`);
        }
      }
    } else {
      // === INSTAGRAM: Send DM ===
      const igToken = get("ig_access_token");
      const igUserId = get("ig_user_id");

      if (!igToken || !igUserId) {
        console.error("Instagram credentials not configured");
        return new Response(JSON.stringify({ matched: true, sent: false, error: "No IG credentials" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const dmRes = await fetch(`https://graph.instagram.com/v21.0/${igUserId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: author_id },
          message: { text: matched.reply_text },
          access_token: igToken,
        }),
      });
      const dmData = await dmRes.json();

      if (dmData.error) {
        console.error("DM send error:", dmData.error);
        sendError = dmData.error.message;
      } else {
        sent = true;
        console.log(`DM sent to ${author_name} (${author_id}) for keyword "${matched.keyword}"`);
      }
    }

    // Update the existing comment record with auto-reply info
    if (sent && author_id) {
      await supabase.from("social_comments")
        .update({
          ai_auto_replied: true,
          reply_content: `[${platform === "threads" ? "Thread Reply" : "DM Auto"}] ${matched.reply_text.substring(0, 100)}`,
          replied_at: new Date().toISOString(),
        })
        .eq("author_id", author_id)
        .eq("platform", platform || "instagram")
        .eq("content", comment_text)
        .order("created_at", { ascending: false })
        .limit(1);
    }

    // Save DM/reply record
    if (sent) {
      await supabase.from("social_dms").insert({
        platform: platform || "instagram",
        sender_name: "Bot → " + (author_name || "User"),
        sender_id: author_id,
        content: `[Keyword: ${matched.keyword}] Auto-reply sent (${platform === "threads" ? "public reply" : "DM"})`,
        reply_content: matched.reply_text,
        replied_at: new Date().toISOString(),
        ai_auto_replied: true,
      });
    }

    return new Response(JSON.stringify({ matched: true, sent, keyword: matched.keyword, error: sendError || undefined }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("social-auto-reply-keyword error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
