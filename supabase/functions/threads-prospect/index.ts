import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

function getHumanWindow(): boolean {
  const now = new Date();
  const spHour = new Date(now.getTime() - 3 * 3600000).getUTCHours();
  if (spHour >= 9 && spHour < 12) return true;
  if (spHour >= 14 && spHour < 18) return true;
  if (spHour >= 20 && spHour < 22) return true;
  return false;
}

function ageScore(timestamp: string): number {
  const ageMs = Date.now() - new Date(timestamp).getTime();
  const ageH = ageMs / 3600000;
  if (ageH < 1) return 3;
  if (ageH < 3) return 2;
  if (ageH < 12) return 1;
  return 0;
}

// Fetch posts via keyword search API
async function fetchViaKeywordSearch(keyword: string, token: string): Promise<{ posts: any[] | null; permissionError: boolean; errorDetails?: string }> {
  const searchUrl = `https://graph.threads.net/v1.0/keyword_search?q=${encodeURIComponent(keyword)}&fields=id,text,media_type,permalink,timestamp,username,has_replies,is_quote_post,is_reply&access_token=${token}&limit=25`;
  const searchRes = await fetch(searchUrl);

  if (!searchRes.ok) {
    const errBody = await searchRes.text();
    console.error(`[ERR_${searchRes.status}] Search failed for "${keyword}": ${errBody}`);
    // Detect permission errors: 400 (wrong endpoint/scope) or 500 with code 10 (no permission)
    if (searchRes.status === 400) {
      return { posts: null, permissionError: true, errorDetails: errBody };
    }
    if (searchRes.status === 500 || searchRes.status === 403) {
      try {
        const errJson = JSON.parse(errBody);
        // code 10 = "Application does not have permission for this action"
        if (errJson?.error?.code === 10 || errJson?.error?.type === "OAuthException") {
          return { posts: null, permissionError: true, errorDetails: errBody };
        }
      } catch (_) { /* not JSON, treat as generic error */ }
    }
    return { posts: null, permissionError: false };
  }

  const searchData = await searchRes.json();
  if (searchData.error) {
    console.error(`Search error for "${keyword}":`, searchData.error);
    return { posts: null, permissionError: false };
  }

  return { posts: searchData.data || [], permissionError: false };
}

// Intent phrases to expand keyword queries for better lead quality
const INTENT_PHRASES = [
  "alguém indica",
  "vale a pena",
  "preciso de",
  "recomendam",
  "alguém conhece",
  "onde assistir",
  "melhor que",
  "alternativa",
];

// Fetch posts via Google Search using Firecrawl
async function fetchViaGoogleSearch(keywords: string[], firecrawlKey: string): Promise<any[]> {
  const foundPosts: any[] = [];
  
  // Build expanded queries: base keyword + intent phrase combos
  const queries: { query: string; keyword: string }[] = [];
  for (const keyword of keywords) {
    // Direct keyword search
    queries.push({ query: `site:threads.net "${keyword}"`, keyword });
    // Intent-expanded searches (pick 2 random intent phrases per keyword to limit API calls)
    const shuffled = [...INTENT_PHRASES].sort(() => Math.random() - 0.5);
    for (const phrase of shuffled.slice(0, 2)) {
      queries.push({ query: `site:threads.net "${phrase}" ${keyword}`, keyword });
    }
  }

  for (const { query, keyword } of queries) {
    try {
      console.log(`[Google Search] Searching: ${query}`);
      
      const response = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          limit: 10,
          lang: "pt",
          country: "BR",
          tbs: "qdr:w", // last week (broader window for better results)
          scrapeOptions: { formats: ["markdown"] },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Google Search] Firecrawl error ${response.status}: ${errText}`);
        continue;
      }

      const data = await response.json();
      const results = data.data || [];
      console.log(`[Google Search] Found ${results.length} results for query: ${query}`);

      for (const result of results) {
        const url = result.url || "";
        // STRICT FILTER: Only accept individual post URLs, reject profiles
        const match = url.match(/threads\.net\/@([^/]+)\/post\/([^/?#]+)/);
        if (!match) {
          // Skip profile pages, search pages, etc.
          continue;
        }

        const [, username, postId] = match;
        
        // Extract text content from snippet/markdown
        let content = result.description || "";
        if (result.markdown) {
          // Take first meaningful paragraph from markdown
          const lines = result.markdown.split("\n").filter((l: string) => l.trim().length > 20);
          if (lines.length > 0) content = lines[0].trim();
        }
        
        // Clean up content
        content = content.replace(/[#*_~`]/g, "").trim();
        if (!content || content.length < 10) continue;

        foundPosts.push({
          id: `threads_${postId}`,
          text: content.substring(0, 2000),
          username,
          timestamp: new Date().toISOString(),
          _keyword: keyword,
          _source: "google_search",
          _url: url,
        });
      }
    } catch (err) {
      console.error(`[Google Search] Error for query "${query}":`, err);
    }
  }

  // Deduplicate by post ID
  const seen = new Set<string>();
  return foundPosts.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

// Fetch posts via own timeline + replies (fallback mode)
async function fetchViaOwnTimeline(keywords: string[], token: string, myUserId: string): Promise<any[]> {
  const timelineUrl = `https://graph.threads.net/v1.0/${myUserId || "me"}/threads?fields=id,text,username,timestamp&access_token=${token}&limit=25`;
  const timelineRes = await fetch(timelineUrl);
  if (!timelineRes.ok) {
    console.error(`[ERR_${timelineRes.status}] Timeline fetch failed: ${await timelineRes.text()}`);
    return [];
  }

  const timelineData = await timelineRes.json();
  const myPosts = timelineData.data || [];
  const foundReplies: any[] = [];

  for (const post of myPosts) {
    try {
      const repliesUrl = `https://graph.threads.net/v1.0/${post.id}/replies?fields=id,text,username,timestamp&access_token=${token}&limit=50`;
      const repliesRes = await fetch(repliesUrl);
      if (!repliesRes.ok) continue;

      const repliesData = await repliesRes.json();
      for (const reply of (repliesData.data || [])) {
        const text = (reply.text || "").toLowerCase();
        const matchedKw = keywords.find(kw => text.includes(kw.toLowerCase()));
        if (matchedKw) {
          foundReplies.push({
            ...reply,
            _keyword: matchedKw,
          });
        }
      }
    } catch (err) {
      console.error(`Error fetching replies for post ${post.id}:`, err);
    }
  }

  return foundReplies;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const force = body?.force === true;
  const dryRun = body?.dry_run === true;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings } = await supabase.from("social_settings").select("*");
    const get = (k: string) => settings?.find((s: any) => s.key === k)?.value || "";

    if (!force && get("prospect_enabled") !== "true") {
      return json({ message: "Prospecting disabled" });
    }

    const humanWindowEnabled = get("prospect_human_window") !== "false";
    if (!force && humanWindowEnabled && !getHumanWindow()) {
      return json({ message: "Sleep mode — fora da janela humana" });
    }

    const token = get("threads_access_token");
    if (!token) throw new Error("threads_access_token not configured");

    const myUserId = get("threads_user_id");
    const prospectMode = get("prospect_mode") || "own_timeline";
    const keywords = (get("prospect_keywords") || "").split(",").map((k: string) => k.trim()).filter(Boolean);
    if (!keywords.length) {
      return json({ message: "No prospect keywords configured. Add keywords in Auto Piloto > Prospecção Threads first.", found: 0, replied: 0 });
    }

    const maxReplies = parseInt(get("prospect_max_replies") || "3");
    const dailyLimit = parseInt(get("prospect_daily_limit") || "15");
    const hourlyLimit = parseInt(get("prospect_hourly_limit") || "5");
    const replyPrompt = get("prospect_reply_prompt") || "Responda de forma natural e útil, mencionando MagoFlix como solução. Máx 200 chars.";

    const since24h = new Date(Date.now() - 86400000).toISOString();
    const { count: dailyCount } = await supabase
      .from("threads_prospects")
      .select("*", { count: "exact", head: true })
      .eq("status", "replied")
      .gte("replied_at", since24h);

    if ((dailyCount || 0) >= dailyLimit) {
      return json({ message: "Daily limit reached", dailyCount, dailyLimit });
    }

    const since1h = new Date(Date.now() - 3600000).toISOString();
    const { count: hourlyCount } = await supabase
      .from("threads_prospects")
      .select("*", { count: "exact", head: true })
      .eq("status", "replied")
      .gte("replied_at", since1h);

    if ((hourlyCount || 0) >= hourlyLimit) {
      return json({ message: "Hourly limit reached", hourlyCount, hourlyLimit });
    }

    if (!force) {
      const { data: recent } = await supabase
        .from("threads_prospects")
        .select("replied_at")
        .eq("status", "replied")
        .order("replied_at", { ascending: false })
        .limit(1);
      if (recent?.length && recent[0].replied_at) {
        const minsSince = (Date.now() - new Date(recent[0].replied_at).getTime()) / 60000;
        if (minsSince < 5) return json({ message: "Cooldown active", minsSince });
      }
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

    const { data: recentReplies } = await supabase
      .from("threads_prospects")
      .select("reply_content")
      .eq("status", "replied")
      .order("replied_at", { ascending: false })
      .limit(10);
    const pastReplies = (recentReplies || []).map((r: any) => r.reply_content).filter(Boolean);

    const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: repliedAuthors } = await supabase
      .from("threads_prospects")
      .select("author_username")
      .eq("status", "replied")
      .gte("replied_at", since7d);
    const repliedAuthorSet = new Set((repliedAuthors || []).map((a: any) => a.author_username));

    let totalFound = 0;
    let totalReplied = 0;
    let totalSkipped = 0;
    let consecutiveErrors = 0;
    const foundPosts: any[] = [];
    const remainingDaily = dailyLimit - (dailyCount || 0);
    const remainingHourly = hourlyLimit - (hourlyCount || 0);
    const effectiveMax = Math.min(maxReplies, remainingDaily, remainingHourly);
    let usedMode = prospectMode;

    // ==========================================
    // MODE: own_timeline — fetch own posts + replies
    // ==========================================
    if (prospectMode === "own_timeline") {
      const timelineReplies = await fetchViaOwnTimeline(keywords, token, myUserId);

      // Filter <24h
      const now = Date.now();
      const recentThreads = timelineReplies.filter((t: any) => {
        if (!t.timestamp) return true;
        return (now - new Date(t.timestamp).getTime()) < 86400000;
      });

      recentThreads.sort((a: any, b: any) => {
        const scoreA = a.timestamp ? ageScore(a.timestamp) : 0;
        const scoreB = b.timestamp ? ageScore(b.timestamp) : 0;
        return scoreB - scoreA;
      });

      const threadIds = recentThreads.map((t: any) => t.id);
      const { data: existing } = await supabase
        .from("threads_prospects")
        .select("thread_id")
        .in("thread_id", threadIds.length ? threadIds : ["__none__"]);
      const existingIds = new Set(existing?.map((e: any) => e.thread_id) || []);

      for (const thread of recentThreads) {
        if (totalReplied >= effectiveMax) break;
        if (consecutiveErrors >= 3) break;
        if (existingIds.has(thread.id)) continue;
        if (myUserId && thread.username === myUserId) continue;
        if (repliedAuthorSet.has(thread.username)) continue;

        totalFound++;
        const keyword = thread._keyword || "";

        await supabase.from("threads_prospects").insert({
          thread_id: thread.id,
          author_username: thread.username || "",
          content: (thread.text || "").substring(0, 2000),
          keyword_matched: keyword,
          status: "found",
        });

        foundPosts.push({
          thread_id: thread.id,
          author: thread.username,
          content: (thread.text || "").substring(0, 200),
          keyword,
          mode: "own_timeline",
        });

        if (dryRun) continue;

        // Process through AI pipeline (same as keyword_search mode)
        const replyResult = await processThread(thread, keyword, replyPrompt, pastReplies, OPENAI_API_KEY, myUserId, token, supabase);
        
        if (replyResult === "replied") {
          totalReplied++;
          repliedAuthorSet.add(thread.username);
          if (totalReplied < effectiveMax) {
            const delay = gaussianDelay(60000, 180000);
            await new Promise(r => setTimeout(r, delay));
          }
        } else if (replyResult === "skipped") {
          totalSkipped++;
        } else if (replyResult === "error") {
          consecutiveErrors++;
        } else {
          consecutiveErrors = 0;
        }
      }
    }
    // ==========================================
    // MODE: google_search — via Firecrawl
    // ==========================================
    else if (prospectMode === "google_search") {
      if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY not configured. Connect Firecrawl in Settings > Connectors.");

      const googlePosts = await fetchViaGoogleSearch(keywords, FIRECRAWL_API_KEY);
      usedMode = "google_search";

      const threadIds = googlePosts.map((t: any) => t.id);
      const { data: existing } = await supabase
        .from("threads_prospects")
        .select("thread_id")
        .in("thread_id", threadIds.length ? threadIds : ["__none__"]);
      const existingIds = new Set(existing?.map((e: any) => e.thread_id) || []);

      for (const thread of googlePosts) {
        if (totalReplied >= effectiveMax) break;
        if (consecutiveErrors >= 3) break;
        if (existingIds.has(thread.id)) continue;
        if (repliedAuthorSet.has(thread.username)) continue;

        totalFound++;
        const keyword = thread._keyword || "";

        await supabase.from("threads_prospects").insert({
          thread_id: thread.id,
          author_username: thread.username || "",
          content: (thread.text || "").substring(0, 2000),
          keyword_matched: keyword,
          status: "found",
        });

        foundPosts.push({
          thread_id: thread.id,
          author: thread.username,
          content: (thread.text || "").substring(0, 200),
          keyword,
          mode: "google_search",
          url: thread._url,
        });

        if (dryRun) continue;

        // For Google Search mode, we need to extract the real thread_id for replying
        // The thread.id is "threads_postId" — we need the actual Threads API media ID
        // We'll try to reply using the post URL pattern, but this may need the real media ID
        // For now, process through AI pipeline for intent/relevance, but skip actual reply
        // since we don't have the Threads API media ID from Google results
        const replyResult = await processThread(thread, keyword, replyPrompt, pastReplies, OPENAI_API_KEY, myUserId, token, supabase);
        if (replyResult === "replied") {
          totalReplied++;
          repliedAuthorSet.add(thread.username);
          if (totalReplied < effectiveMax) {
            const delay = gaussianDelay(60000, 180000);
            await new Promise(r => setTimeout(r, delay));
          }
        } else if (replyResult === "skipped") totalSkipped++;
        else if (replyResult === "error") consecutiveErrors++;
      }
    }
    // ==========================================
    // MODE: keyword_search — original search API
    // ==========================================
    else {
      for (const keyword of keywords) {
        if (totalReplied >= effectiveMax) break;
        if (consecutiveErrors >= 3) break;

        const searchResult = await fetchViaKeywordSearch(keyword, token);

        if (searchResult.permissionError) {
          // Auto-fallback to own_timeline
          console.log("Keyword search returned 400, falling back to own_timeline mode");
          
          // Save the mode change
          await supabase.from("social_settings").upsert({ key: "prospect_mode", value: "own_timeline" }, { onConflict: "key" });

          const timelineReplies = await fetchViaOwnTimeline(keywords, token, myUserId);
          usedMode = "own_timeline_fallback";

          const now = Date.now();
          const recentThreads = timelineReplies.filter((t: any) => {
            if (!t.timestamp) return true;
            return (now - new Date(t.timestamp).getTime()) < 86400000;
          });

          const threadIds = recentThreads.map((t: any) => t.id);
          const { data: existing } = await supabase
            .from("threads_prospects")
            .select("thread_id")
            .in("thread_id", threadIds.length ? threadIds : ["__none__"]);
          const existingIds = new Set(existing?.map((e: any) => e.thread_id) || []);

          for (const thread of recentThreads) {
            if (totalReplied >= effectiveMax) break;
            if (existingIds.has(thread.id)) continue;
            if (myUserId && thread.username === myUserId) continue;
            if (repliedAuthorSet.has(thread.username)) continue;

            totalFound++;
            const kw = thread._keyword || "";

            await supabase.from("threads_prospects").insert({
              thread_id: thread.id,
              author_username: thread.username || "",
              content: (thread.text || "").substring(0, 2000),
              keyword_matched: kw,
              status: "found",
            });

            foundPosts.push({ thread_id: thread.id, author: thread.username, content: (thread.text || "").substring(0, 200), keyword: kw, mode: "own_timeline_fallback" });

            if (dryRun) continue;

            const replyResult = await processThread(thread, kw, replyPrompt, pastReplies, OPENAI_API_KEY, myUserId, token, supabase);
            if (replyResult === "replied") {
              totalReplied++;
              repliedAuthorSet.add(thread.username);
              if (totalReplied < effectiveMax) {
                const delay = gaussianDelay(60000, 180000);
                await new Promise(r => setTimeout(r, delay));
              }
            } else if (replyResult === "skipped") totalSkipped++;
            else if (replyResult === "error") consecutiveErrors++;
          }
          break; // Exit keyword loop since we did fallback
        }

        if (!searchResult.posts) {
          consecutiveErrors++;
          continue;
        }
        consecutiveErrors = 0;

        const threads = searchResult.posts;
        if (!threads.length) continue;

        const now = Date.now();
        const recentThreads = threads.filter((t: any) => {
          if (!t.timestamp) return true;
          return (now - new Date(t.timestamp).getTime()) < 86400000;
        });

        recentThreads.sort((a: any, b: any) => {
          const scoreA = a.timestamp ? ageScore(a.timestamp) : 0;
          const scoreB = b.timestamp ? ageScore(b.timestamp) : 0;
          return scoreB - scoreA;
        });

        const threadIds = recentThreads.map((t: any) => t.id);
        const { data: existing } = await supabase
          .from("threads_prospects")
          .select("thread_id")
          .in("thread_id", threadIds.length ? threadIds : ["__none__"]);
        const existingIds = new Set(existing?.map((e: any) => e.thread_id) || []);

        for (const thread of recentThreads) {
          if (totalReplied >= effectiveMax) break;
          if (consecutiveErrors >= 3) break;
          if (existingIds.has(thread.id)) continue;
          if (myUserId && thread.username === myUserId) continue;
          if (repliedAuthorSet.has(thread.username)) continue;

          totalFound++;

          await supabase.from("threads_prospects").insert({
            thread_id: thread.id,
            author_username: thread.username || "",
            content: (thread.text || "").substring(0, 2000),
            keyword_matched: keyword,
            status: "found",
          });

          foundPosts.push({ thread_id: thread.id, author: thread.username, content: (thread.text || "").substring(0, 200), keyword });

          if (dryRun) continue;

          const replyResult = await processThread(thread, keyword, replyPrompt, pastReplies, OPENAI_API_KEY, myUserId, token, supabase);
          if (replyResult === "replied") {
            totalReplied++;
            repliedAuthorSet.add(thread.username);
            pastReplies.unshift(thread._replyText || "");
            if (pastReplies.length > 10) pastReplies.pop();
            if (totalReplied < effectiveMax) {
              const delay = gaussianDelay(60000, 180000);
              await new Promise(r => setTimeout(r, delay));
            }
          } else if (replyResult === "skipped") totalSkipped++;
          else if (replyResult === "error") consecutiveErrors++;
        }
      }
    }

    return json({
      success: true,
      dryRun,
      mode: usedMode,
      found: totalFound,
      replied: totalReplied,
      skipped: totalSkipped,
      dailyUsed: (dailyCount || 0) + totalReplied,
      dailyLimit,
      hourlyUsed: (hourlyCount || 0) + totalReplied,
      hourlyLimit,
      circuitBroken: consecutiveErrors >= 3,
      posts: dryRun ? foundPosts : undefined,
    });
  } catch (e: any) {
    console.error("threads-prospect error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Shared AI pipeline for processing a single thread
async function processThread(
  thread: any,
  keyword: string,
  replyPrompt: string,
  pastReplies: string[],
  OPENAI_API_KEY: string,
  myUserId: string,
  token: string,
  supabase: any
): Promise<"replied" | "skipped" | "error"> {
  try {
    // Intent detection
    const intentRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Classifique a intenção deste post do Threads. Responda APENAS com uma destas palavras: question, complaint, recommendation, discussion" },
          { role: "user", content: thread.text },
        ],
        max_tokens: 10,
      }),
    });
    const intentData = await intentRes.json();

    if (intentData.error) {
      await supabase.from("threads_prospects").update({ status: "error", reply_content: `[ERR_INTENT] ${intentData.error.message}` }).eq("thread_id", thread.id);
      return "error";
    }

    const intent = (intentData.choices?.[0]?.message?.content?.trim().toLowerCase() || "discussion");

    if (intent === "discussion") {
      await supabase.from("threads_prospects").update({ status: "skipped", reply_content: "[SKIP_DISCUSSION]" }).eq("thread_id", thread.id);
      return "skipped";
    }

    // Relevance check
    const relevanceRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Avalie se este post do Threads é de alguém que poderia ser um lead/cliente potencial. Responda APENAS 'SIM' ou 'NAO'." },
          { role: "user", content: `Post: "${thread.text}"\nKeyword buscada: "${keyword}"` },
        ],
        max_tokens: 5,
      }),
    });
    const relevanceData = await relevanceRes.json();

    if (relevanceData.error) {
      await supabase.from("threads_prospects").update({ status: "error", reply_content: `[ERR_RELEVANCE] ${relevanceData.error.message}` }).eq("thread_id", thread.id);
      return "error";
    }

    const isRelevant = relevanceData.choices?.[0]?.message?.content?.trim().toUpperCase().startsWith("SIM");
    if (!isRelevant) {
      await supabase.from("threads_prospects").update({ status: "skipped" }).eq("thread_id", thread.id);
      return "skipped";
    }

    // Generate reply
    const chosenStyle = REPLY_STYLES[Math.floor(Math.random() * REPLY_STYLES.length)];
    const intentTone = intent === "complaint"
      ? "Mostre empatia e compreensão. NÃO venda diretamente."
      : intent === "question"
        ? "Responda a pergunta de forma útil e natural."
        : "Faça uma recomendação genuína e sutil.";

    const diversityNote = pastReplies.length
      ? `\n\nNÃO repita estas frases já usadas:\n${pastReplies.map((r: string, i: number) => `${i + 1}. "${r}"`).join("\n")}`
      : "";

    const replyRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: `Você é um usuário casual do Threads. ${replyPrompt}\n\nESTILO DESTA RESPOSTA: ${chosenStyle}\nTOM: ${intentTone}\n\nREGRAS:\n- Resposta CURTA (máx 200 chars)\n- Tom natural, NÃO pareça bot\n- Seja relevante ao contexto do post\n- NÃO use hashtags\n- NÃO inclua links ou URLs\n- NÃO use CTAs agressivos como "compre", "assine", "clique"\n- Pode mencionar @omagoflix sutilmente${diversityNote}` },
          { role: "user", content: `Post do @${thread.username}: "${thread.text}"\n\nCrie uma resposta natural e útil.` },
        ],
        max_tokens: 100,
        frequency_penalty: 0.6,
        presence_penalty: 0.4,
      }),
    });
    const replyData = await replyRes.json();

    if (replyData.error) {
      await supabase.from("threads_prospects").update({ status: "error", reply_content: `[ERR_REPLY] ${replyData.error.message}` }).eq("thread_id", thread.id);
      return "error";
    }

    const replyText = replyData.choices?.[0]?.message?.content?.trim();
    if (!replyText) {
      await supabase.from("threads_prospects").update({ status: "error" }).eq("thread_id", thread.id);
      return "error";
    }

    // Blacklist check
    if (CTA_BLACKLIST.test(replyText)) {
      await supabase.from("threads_prospects").update({ status: "skipped", reply_content: "[BLOCKED_CTA] " + replyText }).eq("thread_id", thread.id);
      return "skipped";
    }

    // AI safety check
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
        await supabase.from("threads_prospects").update({ status: "skipped", reply_content: "[PROMOTIONAL] " + replyText }).eq("thread_id", thread.id);
        return "skipped";
      }
    }

    // Log AI cost
    const usage = replyData.usage;
    if (usage) {
      const cost = (usage.prompt_tokens || 0) * 0.00000015 + (usage.completion_tokens || 0) * 0.0000006;
      await supabase.from("token_usage").insert({
        model: "gpt-4o-mini",
        usage_type: "social_prospect",
        prompt_tokens: usage.prompt_tokens || 0,
        completion_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0,
        cost_usd: cost,
      });
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

    if (createData.error) {
      await supabase.from("threads_prospects").update({ status: "error", reply_content: `[ERR_${createRes.status}] ${createData.error.message}` }).eq("thread_id", thread.id);
      return "error";
    }

    // Publish
    const publishRes = await fetch(`https://graph.threads.net/v1.0/${myUserId || "me"}/threads_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: createData.id, access_token: token }),
    });
    const publishData = await publishRes.json();

    if (publishData.error) {
      await supabase.from("threads_prospects").update({ status: "error", reply_content: `[ERR_${publishRes.status}] ${publishData.error.message}` }).eq("thread_id", thread.id);
      return "error";
    }

    await supabase.from("threads_prospects").update({
      status: "replied",
      reply_content: replyText,
      replied_at: new Date().toISOString(),
    }).eq("thread_id", thread.id);

    thread._replyText = replyText;
    pastReplies.unshift(replyText);
    if (pastReplies.length > 10) pastReplies.pop();

    return "replied";
  } catch (err: any) {
    console.error(`Error processing thread ${thread.id}:`, err);
    await supabase.from("threads_prospects").update({ status: "error", reply_content: `[ERR] ${err.message}` }).eq("thread_id", thread.id);
    return "error";
  }
}

function json(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
