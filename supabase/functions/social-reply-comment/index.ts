import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { comment_id, reply_text, platform } = await req.json();
    if (!comment_id || !reply_text) throw new Error("comment_id and reply_text required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings } = await supabase.from("social_settings").select("*");
    const get = (k: string) => settings?.find((s: any) => s.key === k)?.value || "";

    const isThreads = platform === "threads";
    const token = isThreads ? get("threads_access_token") : get("ig_access_token");
    const baseUrl = isThreads ? "https://graph.threads.net/v1.0" : "https://graph.instagram.com/v21.0";

    if (!token) throw new Error(`Token não configurado para ${platform || "instagram"}`);

    // Reply to comment
    const res = await fetch(`${baseUrl}/${comment_id}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: reply_text, access_token: token }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    // Update DB
    await supabase
      .from("social_comments")
      .update({ reply_content: reply_text, replied_at: new Date().toISOString() })
      .eq("author_id", comment_id);

    return new Response(JSON.stringify({ success: true, reply_id: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("social-reply-comment error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
