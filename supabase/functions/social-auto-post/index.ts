import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calendarPresets } from "../_shared/calendar-prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const force = body?.force === true;
  const platform = body?.platform || "both"; // "instagram", "threads", or "both"

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings } = await supabase.from("social_settings").select("*");
    const get = (k: string) => settings?.find((s: any) => s.key === k)?.value || "";

    if (get("auto_post_enabled") !== "true") {
      return json({ message: "Auto post disabled" });
    }

    const now = new Date();
    const brtHour = (now.getUTCHours() - 3 + 24) % 24;
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const results: any = {};

    const doIG = platform === "both" || platform === "instagram";
    const doThreads = platform === "both" || platform === "threads";

    // --- INSTAGRAM (Calendar Mode) ---
    if (doIG) {
      const igFreq = parseInt(get("auto_post_ig_frequency") || get("auto_post_frequency") || "3");
      const igPeakHours = (get("auto_post_ig_peak_hours") || get("auto_post_peak_hours") || "9,13,19")
        .split(",").map((h: string) => parseInt(h.trim()));

      let igSkip = false;
      if (!force) {
        const inWindow = igPeakHours.some((h: number) => brtHour === h);
        if (!inWindow) igSkip = true;

        if (!igSkip) {
          const { data: todayIgPosts } = await supabase
            .from("social_posts").select("created_at")
            .eq("ai_generated", true)
            .in("platform", ["instagram", "both"])
            .gte("created_at", todayStart.toISOString())
            .order("created_at", { ascending: false });

          if ((todayIgPosts?.length || 0) >= igFreq) igSkip = true;
          else if (todayIgPosts && todayIgPosts.length > 0) {
            const hoursSince = (Date.now() - new Date(todayIgPosts[0].created_at).getTime()) / 3600000;
            if (hoursSince < 1.5) igSkip = true;
          }
        }
      }

      if (!igSkip) {
        const igResult = await generateFromCalendar(supabase, get);
        results.instagram = igResult;
      } else {
        results.instagram = { skipped: true, brtHour };
      }
    }

    // --- THREADS (keeps random AI generation) ---
    if (doThreads) {
      const thFreq = parseInt(get("auto_post_threads_frequency") || "6");
      const thPeakHours = (get("auto_post_threads_peak_hours") || "8,10,12,14,17,20")
        .split(",").map((h: string) => parseInt(h.trim()));
      const thStyle = get("auto_post_threads_style") || "Curto, direto, provocativo sobre filmes e séries";
      const thTextRatio = parseInt(get("auto_post_threads_text_ratio") || "70");

      let thSkip = false;
      if (!force) {
        const inWindow = thPeakHours.some((h: number) => brtHour === h);
        if (!inWindow) thSkip = true;

        if (!thSkip) {
          const { data: todayThPosts } = await supabase
            .from("social_posts").select("created_at")
            .eq("ai_generated", true)
            .eq("platform", "threads")
            .gte("created_at", todayStart.toISOString())
            .order("created_at", { ascending: false });

          if ((todayThPosts?.length || 0) >= thFreq) thSkip = true;
          else if (todayThPosts && todayThPosts.length > 0) {
            const hoursSince = (Date.now() - new Date(todayThPosts[0].created_at).getTime()) / 3600000;
            if (hoursSince < 0.8) thSkip = true;
          }
        }
      }

      if (!thSkip) {
        const useImage = Math.random() * 100 >= thTextRatio;
        const thResult = await generateAndPublish(supabase, "threads", thStyle, useImage);
        results.threads = thResult;
      } else {
        results.threads = { skipped: true, brtHour };
      }
    }

    return json({ success: true, results });
  } catch (e: any) {
    console.error("social-auto-post error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function json(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// --- Instagram: Calendar-based generation ---
async function generateFromCalendar(supabase: any, get: (k: string) => string) {
  // Read current index
  const calendarIndex = parseInt(get("auto_post_ig_calendar_index") || "0");
  const preset = calendarPresets[calendarIndex % calendarPresets.length];

  console.log(`[Calendar] Index ${calendarIndex} → Dia ${preset.day} / ${preset.slot} / ${preset.theme}`);

  // Generate image via social-create-post
  const createPostUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/social-create-post`;
  const createRes = await fetch(createPostUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
    },
    body: JSON.stringify({
      prompt: preset.prompt,
      caption: preset.caption,
      platform: "instagram",
      aspect_ratio: preset.aspectRatio,
      publish_now: true,
      style_type: "DESIGN",
      rendering_speed: "TURBO",
    }),
  });

  const createResult = await createRes.json();

  if (!createRes.ok || createResult.error) {
    console.error("[Calendar] social-create-post error:", createResult);
    throw new Error(createResult.error || `social-create-post failed: ${createRes.status}`);
  }

  // Extract keyword from caption for auto-reply
  const keywordMatch = preset.caption.match(/[Cc]omenta\s+([A-ZÁÉÍÓÚÂÊÔÃÕ0-9]+)\s/);
  const keyword = keywordMatch?.[1] || "";

  if (keyword) {
    const { data: existing } = await supabase
      .from("social_keyword_replies").select("id").ilike("keyword", keyword).limit(1);
    if (!existing?.length) {
      await supabase.from("social_keyword_replies").insert({
        keyword: keyword.toUpperCase(),
        reply_text: `🎬 Oi! Você pediu e aqui vai! 🔥\n\nAcesse tudo na MagoFlix: https://magoflix.com\n\n✨ Filmes, séries, animes por um preço que cabe no bolso!`,
        active: true,
      });
    }
  }

  // Increment index
  const nextIndex = (calendarIndex + 1) % calendarPresets.length;
  await supabase.from("social_settings").upsert(
    { key: "auto_post_ig_calendar_index", value: String(nextIndex) },
    { onConflict: "key" }
  );

  return {
    calendarIndex,
    nextIndex,
    day: preset.day,
    slot: preset.slot,
    theme: preset.theme,
    keyword,
    postId: createResult.post_id,
    imageUrl: createResult.image_url,
  };
}

// --- Threads: 100% posts de venda com tom natural ---
async function generateAndPublish(supabase: any, platform: string, style: string, withImage: boolean) {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

  const { data: products } = await supabase.from("pepper_products").select("name, price_cents").eq("active", true);
  const productList = products?.map((p: any) => `${p.name} - R$${(p.price_cents / 100).toFixed(2)}`).join("\n") || "";

  const { count: totalAiPosts } = await supabase
    .from("social_posts").select("*", { count: "exact", head: true })
    .eq("ai_generated", true).eq("platform", platform);

  // Templates de venda rotacionados — 16 modelos para máxima variedade
  const salesTemplates = [
    {
      angle: "dor_preco",
      instruction: `Escreve como se fosse um post real de alguém que descobriu o MagoFlix. Tom de conversa, como se tivesse falando com um amigo.
Exemplo de vibe (NÃO copie, use como referência de tom):
"mano eu pagava 55 conto na netflix com anuncio ainda por cima
descobri o magoflix, 19,90 e tem TUDO
se quiser o link comenta QUERO"
Keyword: QUERO
CTA: comenta QUERO`,
    },
    {
      angle: "comparacao_real",
      instruction: `Post no estilo de quem fez as contas e ficou chocado. Linguagem informal brasileira, sem formalidade.
Exemplo de vibe:
"fiz as contas aqui
netflix + disney + hbo = 130 por mês = 1560 por ano
magoflix = 19,90 por mês = 238 por ano
tava literalmente jogando 1300 reais fora
comenta GASTO que te mostro como mudar"
Keyword: GASTO
CTA: comenta GASTO`,
    },
    {
      angle: "cancelei",
      instruction: `Post como se fosse um depoimento real de quem cancelou streaming caro. Curto, direto.
Exemplo de vibe:
"cancelei a netflix faz 3 meses e sinceramente? não fez falta nenhuma
magoflix tem o mesmo catálogo por 19,90
comenta CANCELA que te passo o link"
Keyword: CANCELA
CTA: comenta CANCELA`,
    },
    {
      angle: "provocacao",
      instruction: `Post provocativo questionando quem ainda paga caro. Tipo tweet polêmico mas sobre streaming.
Exemplo de vibe:
"quem ainda paga 55 reais em streaming em 2025 tá sendo roubado e não sabe
existe opção por 19,90 com tudo junto
quer saber? comenta EU"
Keyword: EU
CTA: comenta EU`,
    },
    {
      angle: "familia",
      instruction: `Post focado em família/economia doméstica. Tom de mãe/pai que descobriu algo bom.
Exemplo de vibe:
"a gente cortou netflix disney e hbo aqui em casa
colocou magoflix por 19,90 e os mlk nem perceberam a diferença
se vc tb quer economizar comenta FAMILIA"
Keyword: FAMILIA
CTA: comenta FAMILIA`,
    },
    {
      angle: "menos_1_real",
      instruction: `Post focando no absurdo de custar menos de 1 real por dia. Incrédulo, como se tivesse contando uma novidade.
Exemplo de vibe:
"menos de 1 real por dia pra ter netflix disney hbo tudo junto
não é piada, é o magoflix
19,90 por mês
comenta REAL que te mando o link"
Keyword: REAL
CTA: comenta REAL`,
    },
    {
      angle: "urgencia",
      instruction: `Post com senso de urgência natural, sem parecer spam. Como alguém avisando os amigos.
Exemplo de vibe:
"vo falar uma vez só
streaming completo por 19,90
enquanto vc paga 55 só numa plataforma
comenta LINK que te mando"
Keyword: LINK
CTA: comenta LINK`,
    },
    {
      angle: "ironia",
      instruction: `Post com ironia leve sobre o preço dos streamings tradicionais. Humor sutil.
Exemplo de vibe:
"netflix aumentando preço de novo e eu aqui pagando 19,90 no magoflix com TUDO
as vezes ser esperto dói nos outros
comenta ESPERTO"
Keyword: ESPERTO
CTA: comenta ESPERTO`,
    },
    // --- NOVOS TEMPLATES ---
    {
      angle: "prova_social",
      instruction: `Post com tom de prova social — como se muita gente estivesse aderindo. Números fictícios mas realistas.
Exemplo de vibe:
"mais de 200 pessoas entraram pro magoflix essa semana
o povo tá cansado de pagar caro
19,90 por tudo e sem contrato
me chama no DM que te explico"
SEM keyword de comenta. CTA: me chama no DM`,
    },
    {
      angle: "curiosidade_filme",
      instruction: `Post que começa com uma pergunta sobre filme/série pra gerar engajamento, e no final menciona o MagoFlix de forma sutil.
Exemplo de vibe:
"qual série vc já maratonou inteira num dia só?
eu vi breaking bad em 3 dias seguidos
tudo isso por 19,90 no magoflix btw
conta a sua aí 👇"
SEM keyword de comenta. CTA: engajamento orgânico`,
    },
    {
      angle: "storytelling",
      instruction: `Mini-história de 3-4 linhas sobre alguém que economizou. Tom de narrativa real, não de anúncio.
Exemplo de vibe:
"meu amigo me zoava por pagar 19,90 em streaming
aí ele viu que tinha tudo que a netflix dele de 55 tem
adivinha quem tá no magoflix agora? 😂
link na bio pra quem quiser"
SEM keyword. CTA: link na bio`,
    },
    {
      angle: "educativo",
      instruction: `Post educativo sobre quanto a pessoa gasta por ano com streaming. Tom de "abre o olho".
Exemplo de vibe:
"faz essa conta comigo:
netflix 44 + disney 34 + hbo 35 = 113/mês
113 x 12 = 1.356 por ANO
magoflix: 19,90 x 12 = 238 por ano
diferença: 1.118 reais
é quase uma viagem de férias"
SEM keyword. CTA: reflexão`,
    },
    {
      angle: "escassez",
      instruction: `Post com escassez natural — muita demanda, sem forçar urgência fake.
Exemplo de vibe:
"o suporte do magoflix tá bombando de mensagem
muita gente migrando do netflix esse mês
19,90 tudo junto, sem fidelidade
se quiser testar me chama no DM"
SEM keyword. CTA: me chama no DM`,
    },
    {
      angle: "depoimento",
      instruction: `Post com tom de review/depoimento real, como se fosse um usuário satisfeito compartilhando experiência.
Exemplo de vibe:
"tô no magoflix faz 2 meses e preciso falar:
catálogo gigante, funciona no celular e tv
19,90 sem propaganda nenhuma
honestamente não sei pq paguei caro antes
nota: 9/10"
SEM keyword. CTA: depoimento natural`,
    },
    {
      angle: "pergunta_aberta",
      instruction: `Post que é só uma pergunta sobre streaming/filmes pra gerar conversa. Menção ao MagoFlix só no final como assinatura.
Exemplo de vibe:
"vocês acham que streaming deveria custar mais de 50 reais?
sério, me explica esse preço
(eu pago 19,90 no magoflix e tô de boa)"
SEM keyword. CTA: debate`,
    },
    {
      angle: "dm_direto",
      instruction: `Post curto e direto oferecendo ajuda no DM. Máximo 2-3 linhas. Bem casual.
Exemplo de vibe:
"streaming completo 19,90
sem contrato, cancela quando quiser
quer saber mais? me chama no DM 👇"
SEM keyword. CTA: me chama no DM`,
    },
  ];

  const templateIndex = (totalAiPosts || 0) % salesTemplates.length;
  const salesTemplate = salesTemplates[templateIndex];

  console.log(`[Threads] Post #${totalAiPosts} → template: ${salesTemplate.angle}`);

  // Buscar posts recentes para evitar repetição
  const { data: recentPosts } = await supabase
    .from("social_posts").select("content")
    .eq("ai_generated", true).eq("platform", platform)
    .order("created_at", { ascending: false }).limit(5);
  
  const recentContext = recentPosts?.length 
    ? `\n\nPOSTS RECENTES (NÃO repita ideias parecidas):\n${recentPosts.map((p: any) => `- "${p.content.substring(0, 100)}"`).join("\n")}`
    : "";

  // Variação de comprimento: alterna entre posts curtos e médios
  const lengthVariation = (totalAiPosts || 0) % 3 === 0 
    ? "Post CURTO: máximo 2-3 linhas, direto ao ponto."
    : (totalAiPosts || 0) % 3 === 1 
      ? "Post MÉDIO: 4-5 linhas com um pouco mais de contexto."
      : "Post LONGO: até 280 caracteres, conte uma mini-história.";

  const systemPrompt = `Você é uma pessoa REAL postando no Threads sobre streaming. NÃO é um social media, NÃO é uma marca.

REGRAS OBRIGATÓRIAS:
- Escreva como brasileiro normal na internet (abreviações ok, gírias ok, erros leves ok)
- Máximo 280 caracteres
- NO MÁXIMO 1-2 emojis (pode ser zero)
- SEM hashtags
- SEM linguagem corporativa ou de marketing
- NÃO use "🔥💜✨🎬" toda hora — varie ou não use nenhum emoji
- Cada post deve parecer que uma pessoa comum escreveu
- SEMPRE termine com @omagoflix
- Se o template pedir keyword, inclua "comenta [KEYWORD]" de forma natural
- Se o template disser "SEM keyword", NÃO inclua "comenta X" — use o CTA indicado
- Mencione o preço R$19,90 do MagoFlix
- ${lengthVariation}
- NÃO comece o post com emoji
- Varie a estrutura: às vezes começa com pergunta, às vezes com afirmação, às vezes com história

Retorne APENAS JSON: { "content": "texto do post", "keyword": "PALAVRA_OU_VAZIO" }`;

  const userMessage = `${salesTemplate.instruction}\n\nProdutos disponíveis:\n${productList}${recentContext}\n\nCrie um post ORIGINAL seguindo a vibe do exemplo. NÃO copie o exemplo. Varie o tom e a estrutura.`;

  const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      temperature: 0.85,
    }),
  });

  if (!aiRes.ok) throw new Error(`AI error: ${aiRes.status}`);

  const aiData = await aiRes.json();
  const rawContent = aiData.choices?.[0]?.message?.content?.trim();
  if (!rawContent) throw new Error("AI returned empty content");

  let parsed;
  try { parsed = JSON.parse(rawContent); } catch { parsed = { content: rawContent }; }

  const content = parsed.content || rawContent;
  const keyword = parsed.keyword || "";

  // Log cost
  const usage = aiData.usage;
  if (usage) {
    const promptCost = (usage.prompt_tokens || 0) * 0.00000015;
    const completionCost = (usage.completion_tokens || 0) * 0.0000006;
    await supabase.from("token_usage").insert({
      model: "gpt-4o-mini",
      usage_type: "social_caption",
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
      cost_usd: promptCost + completionCost,
    });
  }

  // Create post
  const postData: any = {
    content,
    platform,
    status: "scheduled",
    scheduled_at: new Date().toISOString(),
    ai_generated: true,
  };

  const { data: newPost, error: insertErr } = await supabase
    .from("social_posts").insert(postData).select().single();
  if (insertErr) throw insertErr;

  // Publish
  const publishUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/social-publish`;
  const publishRes = await fetch(publishUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
    },
    body: JSON.stringify({ post_id: newPost.id }),
  });
  const publishResult = await publishRes.json();

  // Save keyword for auto-reply
  if (keyword) {
    const { data: existing } = await supabase
      .from("social_keyword_replies").select("id").ilike("keyword", keyword).limit(1);
    if (!existing?.length) {
      await supabase.from("social_keyword_replies").insert({
        keyword: keyword.toUpperCase(),
        reply_text: `oi! te mando o link sim 👇\n\nhttps://listamagoflix.shop\n\ntudo por 19,90/mês, sem contrato\nqualquer dúvida me chama`,
        active: true,
      });
    }
  }

  return { postId: newPost.id, keyword, withImage, publishResult };
}
