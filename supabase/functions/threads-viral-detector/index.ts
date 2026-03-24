import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function gaussianDelay(minMs: number, maxMs: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const mid = (minMs + maxMs) / 2;
  const spread = (maxMs - minMs) / 6;
  return Math.max(minMs, Math.min(maxMs, mid + z * spread));
}

const CTA_BLACKLIST = /https?:\/\/|www\.|compre|assine|clique|cadastre|link na bio|preço|promo|desconto|oferta|grátis|cupom|inscreva/i;

const REPLY_STYLES = [
  "educacional — compartilhe um insight ou dica útil relacionada ao tema",
  "empático — mostre que entende a situação, compartilhe experiência similar",
  "pergunta — faça uma pergunta genuína que aprofunde a conversa",
];

function calcViralScore(likes: number, replies: number, reposts: number, velocity: number): number {
  return likes * 1 + replies * 2 + reposts * 3 + velocity * 5;
}

// Fetch posts via keyword search
async function fetchViaKeywordSearch(keyword: string, token: string): Promise<{ posts: any[] | null; permissionError: boolean }> {
  const searchUrl = `https://graph.threads.net/v1.0/search?q=${encodeURIComponent(keyword)}&type=thread&fields=id,text,username,timestamp,like_count,reply_count,repost_count&access_token=${token}&limit=25`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) {
    const errBody = await searchRes.text();
    console.error(`[ERR_${searchRes.status}] Search failed for "${keyword}": ${errBody}`);
    return { posts: null, permissionError: searchRes.status === 400 };
  }
  const searchData = await searchRes.json();
  if (searchData.error) return { posts: null, permissionError: false };
  return { posts: searchData.data || [], permissionError: false };
}

// Fetch own posts with engagement metrics (fallback)
async function fetchOwnPostsWithEngagement(token: string, myUserId: string): Promise<any[]> {
  const timelineUrl = `https://graph.threads.net/v1.0/${myUserId || "me"}/threads?fields=id,text,username,timestamp,like_count,reply_count,repost_count&access_token=${token}&limit=25`;
  const timelineRes = await fetch(timelineUrl);
  if (!timelineRes.ok) {
    console.error(`[ERR_${timelineRes.status}] Timeline fetch failed: ${await timelineRes.text()}`);
    return [];
  }
  const timelineData = await timelineRes.json();
  return timelineData.data || [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const force = body?.force === true;
  const viralThreshold = body?.viral_threshold ?? 40;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings } = await supabase.from("social_settings").select("*");
    const get = (k: string) => settings?.find((s: any) => s.key === k)?.value || "";

    if (!force && get("viral_detector_enabled") !== "true") {
      return json({ message: "Viral detector disabled" });
    }

    const token = get("threads_access_token");
    if (!token) throw new Error("threads_access_token not configured");

    const myUserId = get("threads_user_id");
    const prospectMode = get("prospect_mode") || "own_timeline";
    const keywords = (get("prospect_keywords") || "").split(",").map((k: string) => k.trim()).filter(Boolean);
    if (!keywords.length) {
      return json({ message: "No prospect keywords configured.", scanned: 0, trending: 0, replied: 0 });
    }

    const replyPrompt = get("prospect_reply_prompt") || "Responda de forma natural e útil. Máx 200 chars.";
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const dailyLimit = parseInt(get("prospect_daily_limit") || "15");
    const since24h = new Date(Date.now() - 86400000).toISOString();
    const { count: dailyCount } = await supabase
      .from("threads_prospects")
      .select("*", { count: "exact", head: true })
      .eq("status", "replied")
      .gte("replied_at", since24h);

    if ((dailyCount || 0) >= dailyLimit) {
      return json({ message: "Daily limit reached", dailyCount, dailyLimit });
    }

    let totalScanned = 0;
    let totalTrending = 0;
    let totalReplied = 0;
    const trendingPosts: any[] = [];
    let usedMode = prospectMode;

    // Collect all threads to scan
    let allThreads: any[] = [];

    if (prospectMode === "own_timeline") {
      // Fallback: monitor own posts' engagement
      const ownPosts = await fetchOwnPostsWithEngagement(token, myUserId);
      allThreads = ownPosts;
      usedMode = "own_timeline";
    } else {
      // Try keyword search, fallback if 400
      let fellBack = false;
      for (const keyword of keywords) {
        const result = await fetchViaKeywordSearch(keyword, token);
        if (result.permissionError) {
          console.log("Keyword search returned 400, falling back to own_timeline");
          await supabase.from("social_settings").upsert({ key: "prospect_mode", value: "own_timeline" }, { onConflict: "key" });
          const ownPosts = await fetchOwnPostsWithEngagement(token, myUserId);
          allThreads = ownPosts;
          usedMode = "own_timeline_fallback";
          fellBack = true;
          break;
        }
        if (result.posts) {
          allThreads.push(...result.posts);
        }
      }
      if (!fellBack) usedMode = "keyword_search";
    }

    const now = Date.now();

    for (const thread of allThreads) {
      if (!thread.timestamp) continue;
      const ageMs = now - new Date(thread.timestamp).getTime();
      const ageMin = ageMs / 60000;

      // For own_timeline mode, allow posts up to 2h old (own posts have slower viral cycle)
      const maxAge = usedMode === "keyword_search" ? 30 : 120;
      if (ageMin > maxAge) continue;
      if (myUserId && thread.username === myUserId && usedMode === "keyword_search") continue;

      totalScanned++;

      const likes = thread.like_count || 0;
      const replies = thread.reply_count || 0;
      const reposts = thread.repost_count || 0;
      const velocity = ageMin > 0 ? (likes + replies + reposts) / ageMin : 0;
      const score = calcViralScore(likes, replies, reposts, velocity);

      // Previous snapshot for growth rate
      const { data: prevSnapshots } = await supabase
        .from("threads_trending_monitor")
        .select("*")
        .eq("thread_id", thread.id)
        .order("snapshot_time", { ascending: false })
        .limit(1);

      const prevSnapshot = prevSnapshots?.[0];
      let growthRate = 0;
      if (prevSnapshot) {
        const timeDiffMin = (now - new Date(prevSnapshot.snapshot_time).getTime()) / 60000;
        if (timeDiffMin > 0) {
          const likeDiff = likes - (prevSnapshot.like_count || 0);
          const replyDiff = replies - (prevSnapshot.reply_count || 0);
          const repostDiff = reposts - (prevSnapshot.repost_count || 0);
          growthRate = (likeDiff + replyDiff * 2 + repostDiff * 3) / timeDiffMin;
        }
      }

      const finalScore = score + growthRate * 10;
      const isTrending = finalScore >= viralThreshold;

      // Save snapshot
      const keywordMatched = usedMode === "keyword_search"
        ? keywords.find(kw => (thread.text || "").toLowerCase().includes(kw.toLowerCase())) || keywords[0]
        : "own_post";

      await supabase.from("threads_trending_monitor").insert({
        thread_id: thread.id,
        author_username: thread.username || "",
        content: (thread.text || "").substring(0, 2000),
        keyword_matched: keywordMatched,
        like_count: likes,
        reply_count: replies,
        repost_count: reposts,
        velocity: Math.round(velocity * 100) / 100,
        viral_score: Math.round(finalScore * 100) / 100,
        is_trending: isTrending,
        post_timestamp: thread.timestamp,
      });

      if (!isTrending) continue;

      totalTrending++;
      trendingPosts.push({
        thread_id: thread.id,
        author: thread.username,
        score: Math.round(finalScore),
        velocity: Math.round(velocity * 100) / 100,
        age_min: Math.round(ageMin),
        likes, replies, reposts,
        growth_rate: Math.round(growthRate * 100) / 100,
        mode: usedMode,
      });

      // For own_timeline mode on own posts, don't auto-reply to own posts
      if (myUserId && thread.username === myUserId) continue;

      // Check if already replied
      const { data: existing } = await supabase
        .from("threads_prospects")
        .select("id")
        .eq("thread_id", thread.id)
        .limit(1);
      if (existing?.length) continue;

      // Author rate limit
      const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: authorReplied } = await supabase
        .from("threads_prospects")
        .select("id")
        .eq("author_username", thread.username)
        .eq("status", "replied")
        .gte("replied_at", since7d)
        .limit(1);
      if (authorReplied?.length) continue;

      // Generate reply
      const chosenStyle = REPLY_STYLES[Math.floor(Math.random() * REPLY_STYLES.length)];
      const { data: recentReplies } = await supabase
        .from("threads_prospects")
        .select("reply_content")
        .eq("status", "replied")
        .order("replied_at", { ascending: false })
        .limit(10);
      const pastReplies = (recentReplies || []).map((r: any) => r.reply_content).filter(Boolean);
      const diversityNote = pastReplies.length
        ? `\n\nNÃO repita estas frases já usadas:\n${pastReplies.map((r: string, i: number) => `${i + 1}. "${r}"`).join("\n")}`
        : "";

      const replyRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Você é um usuário casual do Threads. ${replyPrompt}\n\nESTILO: ${chosenStyle}\n\n⚡ Este post está VIRALIZANDO. Responda rápido e de forma relevante.\n\nREGRAS:\n- Resposta CURTA (máx 200 chars)\n- Tom natural, NÃO pareça bot\n- NÃO use hashtags\n- NÃO inclua links ou URLs\n- NÃO use CTAs agressivos${diversityNote}`,
            },
            {
              role: "user",
              content: `Post TRENDING do @${thread.username} (${likes} likes, ${replies} replies em ${Math.round(ageMin)} min): "${thread.text}"\n\nCrie uma resposta natural.`,
            },
          ],
          max_tokens: 100,
          frequency_penalty: 0.6,
          presence_penalty: 0.4,
        }),
      });
      const replyData = await replyRes.json();
      if (replyData.error) continue;

      const replyText = replyData.choices?.[0]?.message?.content?.trim();
      if (!replyText) continue;

      if (CTA_BLACKLIST.test(replyText)) {
        await supabase.from("threads_trending_monitor")
          .update({ auto_replied: false, reply_content: "[BLOCKED_CTA] " + replyText })
          .eq("thread_id", thread.id)
          .order("snapshot_time", { ascending: false })
          .limit(1);
        continue;
      }

      // AI safety
      const classRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Este comentário parece propaganda ou venda direta? Responda apenas: SAFE ou PROMOTIONAL" },
            { role: "user", content: replyText },
          ],
          max_tokens: 5,
        }),
      });
      const classData = await classRes.json();
      if (!classData.error) {
        const classification = classData.choices?.[0]?.message?.content?.trim().toUpperCase();
        if (classification?.includes("PROMOTIONAL")) {
          await supabase.from("threads_trending_monitor")
            .update({ auto_replied: false, reply_content: "[PROMOTIONAL] " + replyText })
            .eq("thread_id", thread.id)
            .order("snapshot_time", { ascending: false })
            .limit(1);
          continue;
        }
      }

      // Post reply
      const createRes = await fetch(`https://graph.threads.net/v1.0/${myUserId || "me"}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "TEXT",
          text: replyText,
          reply_to_id: thread.id,
          access_token: token,
        }),
      });
      const createData = await createRes.json();
      if (createData.error) continue;

      const publishRes = await fetch(`https://graph.threads.net/v1.0/${myUserId || "me"}/threads_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: createData.id, access_token: token }),
      });
      const publishData = await publishRes.json();
      if (publishData.error) continue;

      await supabase.from("threads_prospects").insert({
        thread_id: thread.id,
        author_username: thread.username || "",
        content: (thread.text || "").substring(0, 2000),
        keyword_matched: keywordMatched,
        status: "replied",
        reply_content: `[VIRAL🔥] ${replyText}`,
        replied_at: new Date().toISOString(),
      });

      await supabase.from("threads_trending_monitor")
        .update({ auto_replied: true, reply_content: replyText })
        .eq("thread_id", thread.id)
        .order("snapshot_time", { ascending: false })
        .limit(1);

      totalReplied++;

      const usage = replyData.usage;
      if (usage) {
        const cost = (usage.prompt_tokens || 0) * 0.00000015 + (usage.completion_tokens || 0) * 0.0000006;
        await supabase.from("token_usage").insert({
          model: "gpt-4o-mini",
          usage_type: "social_viral_detect",
          prompt_tokens: usage.prompt_tokens || 0,
          completion_tokens: usage.completion_tokens || 0,
          total_tokens: usage.total_tokens || 0,
          cost_usd: cost,
        });
      }

      if (totalReplied < 3) {
        const delay = gaussianDelay(30000, 60000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    // Cleanup old snapshots (> 48h)
    const cutoff = new Date(Date.now() - 48 * 3600000).toISOString();
    await supabase.from("threads_trending_monitor").delete().lt("snapshot_time", cutoff);

    return json({
      success: true,
      mode: usedMode,
      scanned: totalScanned,
      trending: totalTrending,
      replied: totalReplied,
      threshold: viralThreshold,
      posts: trendingPosts,
    });
  } catch (e: any) {
    console.error("threads-viral-detector error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
