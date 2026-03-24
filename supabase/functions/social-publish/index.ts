import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForIgContainer(containerId: string, token: string, maxAttempts = 20): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `https://graph.instagram.com/v21.0/${containerId}?fields=status_code&access_token=${token}`
    );
    const data = await res.json();
    console.log(`IG container ${containerId} status (attempt ${i + 1}):`, data.status_code);
    if (data.status_code === "FINISHED") return "FINISHED";
    if (data.status_code === "ERROR") throw new Error("IG container processing failed");
    await sleep(3000);
  }
  throw new Error("IG container timeout after 60s");
}

async function postFirstComment(igPostId: string, hashtags: string, token: string) {
  if (!hashtags || !igPostId) return null;
  try {
    console.log("Posting first comment with hashtags on IG post:", igPostId);
    const res = await fetch(`https://graph.instagram.com/v21.0/${igPostId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: hashtags,
        access_token: token,
      }),
    });
    const data = await res.json();
    if (data.error) {
      console.error("First comment error:", data.error);
      return null;
    }
    console.log("First comment posted:", data.id);
    return data.id;
  } catch (e: any) {
    console.error("First comment failed:", e.message);
    return null;
  }
}

// Helper to extract detailed error from Meta API response
function extractDetailedError(res: Response, data: any, platform: string): string {
  const statusCode = res.status;
  const errorCode = data?.error?.code || "unknown";
  const errorSubcode = data?.error?.error_subcode || "";
  const errorMsg = data?.error?.message || "Unknown error";
  const errorType = data?.error?.type || "";
  return `${platform} HTTP ${statusCode} | code=${errorCode}${errorSubcode ? ` sub=${errorSubcode}` : ""} | ${errorType}: ${errorMsg}`;
}

// Retry wrapper: tries once, if fails waits 30s and retries
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    console.warn(`[RETRY] ${label} failed: ${e.message}. Retrying in 30s...`);
    await sleep(30000);
    return await fn();
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { post_id } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: post, error: postErr } = await supabase
      .from("social_posts")
      .select("*")
      .eq("id", post_id)
      .single();
    if (postErr || !post) throw new Error("Post não encontrado");

    const { data: settings } = await supabase.from("social_settings").select("*");
    const get = (k: string) => settings?.find((s: any) => s.key === k)?.value || "";

    const igUserId = get("ig_user_id");
    const igToken = get("ig_access_token");
    const threadsUserId = get("threads_user_id");
    const threadsToken = get("threads_access_token");

    let igPostId = null;
    let threadsPostId = null;
    const errors: string[] = [];

    // Publish to Instagram (with retry)
    if ((post.platform === "instagram" || post.platform === "both") && igUserId && igToken) {
      try {
        if (!post.image_url) {
          errors.push("Instagram requer uma imagem");
        } else {
          await withRetry(async () => {
            console.log("IG Step 1: Creating media container...");
            const createRes = await fetch(
              `https://graph.instagram.com/v21.0/${igUserId}/media`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  image_url: post.image_url,
                  caption: post.content,
                  access_token: igToken,
                }),
              }
            );
            const createData = await createRes.json();
            console.log("IG container created:", JSON.stringify(createData));
            if (createData.error) throw new Error(extractDetailedError(createRes, createData, "IG"));

            console.log("IG Step 2: Polling container status...");
            await waitForIgContainer(createData.id, igToken);

            console.log("IG Step 3: Publishing...");
            const publishRes = await fetch(
              `https://graph.instagram.com/v21.0/${igUserId}/media_publish`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  creation_id: createData.id,
                  access_token: igToken,
                }),
              }
            );
            const publishData = await publishRes.json();
            console.log("IG publish result:", JSON.stringify(publishData));
            if (publishData.error) throw new Error(extractDetailedError(publishRes, publishData, "IG"));
            igPostId = publishData.id;

            // Post first comment with hashtags
            if (post.hashtags && igPostId) {
              await sleep(2000);
              await postFirstComment(igPostId, post.hashtags, igToken);
            }
          }, "Instagram publish");
        }
      } catch (e: any) {
        console.error("IG error:", e.message);
        errors.push(`IG: ${e.message}`);
      }
    }

    // Publish to Threads (with retry)
    if ((post.platform === "threads" || post.platform === "both") && threadsUserId && threadsToken) {
      try {
        await withRetry(async () => {
          const threadParams: any = {
            text: post.content,
            media_type: post.image_url ? "IMAGE" : "TEXT",
            access_token: threadsToken,
          };
          if (post.image_url) threadParams.image_url = post.image_url;

          const createRes = await fetch(
            `https://graph.threads.net/v1.0/${threadsUserId}/threads`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(threadParams),
            }
          );
          const createData = await createRes.json();
          if (createData.error) throw new Error(extractDetailedError(createRes, createData, "Threads"));

          const publishRes = await fetch(
            `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                creation_id: createData.id,
                access_token: threadsToken,
              }),
            }
          );
          const publishData = await publishRes.json();
          if (publishData.error) throw new Error(extractDetailedError(publishRes, publishData, "Threads"));
          threadsPostId = publishData.id;
        }, "Threads publish");
      } catch (e: any) {
        errors.push(`Threads: ${e.message}`);
      }
    }

    const newStatus = errors.length > 0 && !igPostId && !threadsPostId ? "failed" : "published";
    await supabase
      .from("social_posts")
      .update({
        status: newStatus,
        published_at: newStatus === "published" ? new Date().toISOString() : null,
        ig_post_id: igPostId,
        threads_post_id: threadsPostId,
        error: errors.length ? errors.join("; ") : null,
      })
      .eq("id", post_id);

    return new Response(JSON.stringify({ success: true, igPostId, threadsPostId, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("social-publish error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
