import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings } = await supabase.from("social_settings").select("*");
    const get = (k: string) => settings?.find((s: any) => s.key === k)?.value || "";

    const igUserId = get("ig_user_id");
    const igToken = get("ig_access_token");
    const today = new Date().toISOString().split("T")[0];
    const results: any[] = [];

    if (igUserId && igToken) {
      // Fetch user profile for followers count
      const profileRes = await fetch(
        `https://graph.instagram.com/v21.0/${igUserId}?fields=followers_count,media_count&access_token=${igToken}`
      );
      const profile = await profileRes.json();

      // Fetch insights
      let impressions = 0, reach = 0, profileViews = 0;
      try {
        const insightsRes = await fetch(
          `https://graph.instagram.com/v21.0/${igUserId}/insights?metric=impressions,reach,profile_views&period=day&access_token=${igToken}`
        );
        const insights = await insightsRes.json();
        if (insights.data) {
          for (const m of insights.data) {
            const val = m.values?.[0]?.value || 0;
            if (m.name === "impressions") impressions = val;
            if (m.name === "reach") reach = val;
            if (m.name === "profile_views") profileViews = val;
          }
        }
      } catch (e) {
        console.error("Insights fetch error:", e);
      }

      // Count posts, comments, dms for today
      const { count: postsCount } = await supabase
        .from("social_posts")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today);

      const { count: commentsCount } = await supabase
        .from("social_comments")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today);

      const { count: dmsCount } = await supabase
        .from("social_dms")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today);

      // Upsert metric for today
      const { error } = await supabase
        .from("social_metrics")
        .upsert({
          date: today,
          platform: "instagram",
          followers: profile.followers_count || 0,
          impressions,
          reach,
          profile_views: profileViews,
          posts_count: postsCount || 0,
          comments_count: commentsCount || 0,
          dms_count: dmsCount || 0,
        }, { onConflict: "date,platform" });

      results.push({ platform: "instagram", followers: profile.followers_count, impressions, reach, error: error?.message });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("social-fetch-metrics error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
