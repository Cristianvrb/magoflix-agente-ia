import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ====== AUTO-SYNC: pull fresh data from external APIs ======

async function tryAutoSync() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  console.log("[MANAGER] Auto-syncing Pepper + Meta in parallel...");

  const [pepperResult, metaResult] = await Promise.allSettled([
    // Pepper sync with correct params (start_date/end_date)
    fetch(`${supabaseUrl}/functions/v1/pepper-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({
        action: "list_transactions",
        params: {
          per_page: 50,
          start_date: thirtyDaysAgo.toISOString().split("T")[0],
          end_date: now.toISOString().split("T")[0],
        },
      }),
    }),
    // Meta Ads sync
    fetch(`${supabaseUrl}/functions/v1/meta-ads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ action: "sync_campaigns" }),
    }),
  ]);

  console.log(`[MANAGER] Pepper sync: ${pepperResult.status === "fulfilled" ? pepperResult.value.status : pepperResult.reason}`);
  console.log(`[MANAGER] Meta sync: ${metaResult.status === "fulfilled" ? metaResult.value.status : metaResult.reason}`);
}

// ====== DATA COLLECTORS (deep context) ======

async function collectDeepContext(sb: any) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const sevenDaysAgoDate = sevenDaysAgo.split("T")[0];
  const fourteenDaysAgoDate = fourteenDaysAgo.split("T")[0];

  // ── Pepper Transactions ──
  const { data: txCurrent } = await sb.from("pepper_transactions").select("*").gte("created_at", sevenDaysAgo);
  const { data: txPrevious } = await sb.from("pepper_transactions").select("*").gte("created_at", fourteenDaysAgo).lt("created_at", sevenDaysAgo);

  const calcSales = (txs: any[]) => {
    const approved = txs?.filter((t: any) => t.payment_status === "approved") || [];
    const revenue = approved.reduce((s: number, t: any) => s + (t.amount || 0), 0);
    const liquid = approved.reduce((s: number, t: any) => s + (t.amount_liquid || 0), 0);
    const products: Record<string, number> = {};
    approved.forEach((t: any) => { products[t.product_name] = (products[t.product_name] || 0) + 1; });
    return {
      total: txs?.length || 0,
      approved: approved.length,
      revenue_cents: revenue,
      liquid_cents: liquid,
      avg_ticket: approved.length > 0 ? Math.round(revenue / approved.length) : 0,
      top_products: Object.entries(products).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5),
    };
  };

  const salesCurrent = calcSales(txCurrent || []);
  const salesPrevious = calcSales(txPrevious || []);

  // ── Conversions (rich proxy for sales) ──
  const { data: conversionsCurrent } = await sb.from("conversions").select("*").gte("created_at", sevenDaysAgo);
  const { data: conversionsPrevious } = await sb.from("conversions").select("*").gte("created_at", fourteenDaysAgo).lt("created_at", sevenDaysAgo);
  const { data: conversions30d } = await sb.from("conversions").select("*").gte("created_at", thirtyDaysAgo);

  const calcConversions = (convs: any[]) => {
    if (!convs?.length) return { count: 0, total_value: 0, avg_value: 0, by_event: {} as Record<string, { count: number; value: number }> };
    const totalVal = convs.reduce((s: number, c: any) => s + Number(c.value || 0), 0);
    const byEvent: Record<string, { count: number; value: number }> = {};
    convs.forEach((c: any) => {
      if (!byEvent[c.event_name]) byEvent[c.event_name] = { count: 0, value: 0 };
      byEvent[c.event_name].count++;
      byEvent[c.event_name].value += Number(c.value || 0);
    });
    return { count: convs.length, total_value: totalVal, avg_value: Math.round(totalVal / convs.length * 100) / 100, by_event: byEvent };
  };

  const conv7d = calcConversions(conversionsCurrent || []);
  const convPrev7d = calcConversions(conversionsPrevious || []);
  const conv30d = calcConversions(conversions30d || []);

  // Derived: checkout→purchase rate
  const purchases7d = conv7d.by_event["Purchase"]?.count || 0;
  const checkouts7d = conv7d.by_event["InitiateCheckout"]?.count || 0;
  const checkoutToPurchaseRate = checkouts7d > 0 ? ((purchases7d / checkouts7d) * 100).toFixed(1) + "%" : "N/A";

  // ── Ads by campaign ──
  const { data: adsCurrent } = await sb.from("campaign_snapshots").select("*").gte("date", sevenDaysAgoDate);
  const { data: adsPrevious } = await sb.from("campaign_snapshots").select("*").gte("date", fourteenDaysAgoDate).lt("date", sevenDaysAgoDate);

  const calcAds = (snaps: any[]) => {
    if (!snaps?.length) return { spend: 0, clicks: 0, impressions: 0, leads: 0, campaigns: [] };
    const byCampaign: Record<string, any> = {};
    snaps.forEach((s: any) => {
      if (!byCampaign[s.campaign_name]) byCampaign[s.campaign_name] = { spend: 0, clicks: 0, impressions: 0, leads: 0 };
      byCampaign[s.campaign_name].spend += Number(s.spend || 0);
      byCampaign[s.campaign_name].clicks += s.clicks || 0;
      byCampaign[s.campaign_name].impressions += s.impressions || 0;
      byCampaign[s.campaign_name].leads += s.leads_meta || 0;
    });
    const total = snaps.reduce((a: any, s: any) => ({
      spend: a.spend + Number(s.spend || 0), clicks: a.clicks + (s.clicks || 0),
      impressions: a.impressions + (s.impressions || 0), leads: a.leads + (s.leads_meta || 0),
    }), { spend: 0, clicks: 0, impressions: 0, leads: 0 });
    return { ...total, campaigns: Object.entries(byCampaign).map(([name, data]: any) => ({ name, ...data })) };
  };

  // ── Funnel: lead_stage distribution ──
  const { data: convos7d } = await sb.from("conversations").select("lead_stage, created_at").gte("created_at", sevenDaysAgo);
  const { data: convosAllTime } = await sb.from("conversations").select("lead_stage");

  const countStages = (rows: any[]) => {
    const stages: Record<string, number> = {};
    (rows || []).forEach((c: any) => { stages[c.lead_stage] = (stages[c.lead_stage] || 0) + 1; });
    return stages;
  };

  const stages7d = countStages(convos7d || []);
  const stagesAllTime = countStages(convosAllTime || []);

  // ── Products & offers ──
  const { data: products } = await sb.from("pepper_products").select("*").eq("active", true);

  // Revenue per product (from conversions joined with conversations)
  const productRevenue: Record<string, { count: number; value: number }> = {};
  (conversions30d || []).forEach((c: any) => {
    if (c.event_name === "Purchase" && c.value > 0) {
      const key = `purchase_${c.conversation_id || "unknown"}`;
      if (!productRevenue[key]) productRevenue[key] = { count: 0, value: 0 };
      productRevenue[key].count++;
      productRevenue[key].value += Number(c.value || 0);
    }
  });

  // ── Groups with messages info ──
  const { data: groups } = await sb.from("groups").select("id, name, enabled, members_joined, members_left, instance_id, wa_group_id, agent_id").eq("enabled", true);

  // Get recent group messages for each group
  const { data: groupMessages } = await sb.from("group_messages").select("group_id, content, last_sent_at, next_send_at, schedule_enabled").order("last_sent_at", { ascending: false }).limit(50);

  // Group events (joins/leaves last 30d) for real member activity
  const { data: groupEvents } = await sb.from("group_events").select("group_id, event_type").gte("created_at", thirtyDaysAgo);

  const groupEventCounts: Record<string, { joins: number; leaves: number }> = {};
  (groupEvents || []).forEach((e: any) => {
    if (!groupEventCounts[e.group_id]) groupEventCounts[e.group_id] = { joins: 0, leaves: 0 };
    if (e.event_type === "join") groupEventCounts[e.group_id].joins++;
    else groupEventCounts[e.group_id].leaves++;
  });

  // Messages by group
  const msgsByGroup: Record<string, any[]> = {};
  (groupMessages || []).forEach((m: any) => {
    if (!msgsByGroup[m.group_id]) msgsByGroup[m.group_id] = [];
    msgsByGroup[m.group_id].push(m);
  });

  // ── Social Metrics ──
  const { data: socialMetrics } = await sb.from("social_metrics").select("*").order("date", { ascending: false }).limit(14);

  // ── Top recent conversations with stage ──
  const { data: recentConvos } = await sb.from("conversations").select("id, contact_name, lead_stage, created_at, updated_at, ai_enabled").order("updated_at", { ascending: false }).limit(8);

  // ── AI costs ──
  const { data: usage } = await sb.from("token_usage").select("*").gte("created_at", sevenDaysAgo);
  const aiCost = (usage || []).reduce((s: number, u: any) => s + Number(u.cost_usd || 0), 0);
  const aiByModel: Record<string, number> = {};
  (usage || []).forEach((u: any) => { aiByModel[u.model] = (aiByModel[u.model] || 0) + Number(u.cost_usd || 0); });

  // ── Agent settings ──
  const { data: agentSettings } = await sb.from("agent_settings").select("*").limit(1).single();

  // ── Instances ──
  const { data: instances } = await sb.from("instances").select("id, name, enabled, agent_id, uazapi_subdomain").eq("enabled", true);

  // ── Decision history ──
  const { data: pastDecisions } = await sb.from("manager_decisions").select("decision_type, description, status, reasoning, rejected_reason, priority, created_at").order("created_at", { ascending: false }).limit(10);

  // ── All-time baselines ──
  const { count: totalConversationsAllTime } = await sb.from("conversations").select("id", { count: "exact", head: true });
  const { count: totalConversionsAllTime } = await sb.from("conversions").select("id", { count: "exact", head: true });

  const hasPepperData = (txCurrent?.length || 0) > 0 || (txPrevious?.length || 0) > 0;
  const hasConversionData = (conversionsCurrent?.length || 0) > 0;

  // ── Derived metrics ──
  const totalSpend7d = calcAds(adsCurrent || []).spend;
  const purchaseValue7d = conv7d.by_event["Purchase"]?.value || 0;
  const roas7d = totalSpend7d > 0 ? (purchaseValue7d / totalSpend7d).toFixed(2) : "N/A (sem gasto ads)";
  const cac7d = purchases7d > 0 && totalSpend7d > 0 ? (totalSpend7d / purchases7d).toFixed(2) : "N/A";
  const leads7d = convos7d?.length || 0;
  const cpl7d = leads7d > 0 && totalSpend7d > 0 ? (totalSpend7d / leads7d).toFixed(2) : "N/A";

  return {
    data_quality: {
      has_pepper_transactions: hasPepperData,
      has_campaign_snapshots: (adsCurrent?.length || 0) > 0,
      has_conversions: hasConversionData,
      primary_sales_source: hasPepperData ? "pepper_transactions" : hasConversionData ? "conversions" : "nenhuma",
      note: !hasPepperData && hasConversionData
        ? "pepper_transactions vazio — usando CONVERSIONS como fonte principal de vendas (dados confiáveis)"
        : !hasPepperData && !hasConversionData
        ? "NENHUMA fonte de vendas disponível"
        : "Dados Pepper disponíveis",
    },
    derived_metrics: {
      roas_7d: roas7d,
      cac_7d: cac7d,
      cpl_7d: cpl7d,
      checkout_to_purchase_rate_7d: checkoutToPurchaseRate,
      purchases_7d: purchases7d,
      checkouts_7d: checkouts7d,
      purchase_revenue_7d: purchaseValue7d,
      total_ad_spend_7d: totalSpend7d,
    },
    sales: {
      current_7d: salesCurrent,
      previous_7d: salesPrevious,
      trend: salesCurrent.revenue_cents > 0 && salesPrevious.revenue_cents > 0
        ? `${((salesCurrent.revenue_cents / salesPrevious.revenue_cents - 1) * 100).toFixed(1)}%`
        : "sem dados Pepper — consulte conversions",
    },
    conversions: {
      current_7d: conv7d,
      previous_7d: convPrev7d,
      last_30d: conv30d,
      trend: conv7d.count > 0 && convPrev7d.count > 0
        ? `${((conv7d.count / convPrev7d.count - 1) * 100).toFixed(1)}%`
        : conv7d.count > 0 ? `${conv7d.count} conversões (sem período anterior para comparar)` : "sem conversões",
    },
    ads: {
      current_7d: calcAds(adsCurrent || []),
      previous_7d: calcAds(adsPrevious || []),
    },
    funnel: {
      leads_7d: leads7d,
      stages_7d: stages7d,
      stages_all_time: stagesAllTime,
      total_conversations_all_time: totalConversationsAllTime || 0,
      total_conversions_all_time: totalConversionsAllTime || 0,
      conversion_rate_7d: leads7d > 0
        ? `${((purchases7d / leads7d) * 100).toFixed(1)}%`
        : "0%",
      qualification_rate_7d: leads7d > 0
        ? `${(((stages7d["qualificado"] || 0) / leads7d) * 100).toFixed(1)}%`
        : "0%",
    },
    products: (products || []).map((p: any) => ({
      name: p.name,
      price_cents: p.price_cents,
      price_display: `R$${(p.price_cents / 100).toFixed(2)}`,
      product_hash: p.product_hash,
      offer_hash: p.offer_hash,
      id: p.id,
    })),
    groups: (groups || []).map((g: any) => {
      const events = groupEventCounts[g.id] || { joins: 0, leaves: 0 };
      const msgs = msgsByGroup[g.id] || [];
      return {
        id: g.id,
        name: g.name,
        wa_group_id: g.wa_group_id,
        agent_id: g.agent_id,
        members_joined_db: g.members_joined || 0,
        members_left_db: g.members_left || 0,
        events_30d: events,
        is_active: true,
        note: "Grupo ativo — contadores do DB podem estar desatualizados, use group_events como referência",
        scheduled_messages: msgs.filter((m: any) => m.schedule_enabled).length,
        last_message_sent: msgs[0]?.last_sent_at || null,
        recent_messages_preview: msgs.slice(0, 3).map((m: any) => ({
          content: m.content?.slice(0, 100),
          last_sent_at: m.last_sent_at,
          schedule_enabled: m.schedule_enabled,
        })),
      };
    }),
    social_media: {
      recent_metrics: (socialMetrics || []).slice(0, 7).map((m: any) => ({
        date: m.date,
        platform: m.platform,
        followers: m.followers,
        impressions: m.impressions,
        reach: m.reach,
        posts_count: m.posts_count,
        comments_count: m.comments_count,
        dms_count: m.dms_count,
      })),
    },
    recent_conversations: (recentConvos || []).map((c: any) => ({
      contact_name: c.contact_name,
      lead_stage: c.lead_stage,
      ai_enabled: c.ai_enabled,
      last_activity: c.updated_at,
    })),
    ai_costs: { total_usd: aiCost.toFixed(4), by_model: aiByModel, requests: usage?.length || 0 },
    instances: (instances || []).map((i: any) => ({ id: i.id, name: i.name, agent_id: i.agent_id })),
    agent_settings: agentSettings ? {
      agent_name: agentSettings.agent_name,
      agent_prompt: agentSettings.agent_prompt?.slice(0, 400) + (agentSettings.agent_prompt?.length > 400 ? "..." : ""),
      welcome_message: agentSettings.welcome_message,
      business_hours_enabled: agentSettings.business_hours_enabled,
      followup_enabled: agentSettings.followup_enabled,
    } : {},
    past_decisions: pastDecisions || [],
  };
}

// ====== TOOL EXECUTORS ======

async function executeAction(sb: any, decisionType: string, payload: any): Promise<{ success: boolean; result: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    switch (decisionType) {
      case "update_offer_price": {
        const resp = await fetch(`${supabaseUrl}/functions/v1/pepper-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
          body: JSON.stringify({ action: "update_offer", params: payload }),
        });
        const data = await resp.json();
        return data.error ? { success: false, result: data.error } : { success: true, result: "Preço atualizado" };
      }
      case "create_offer": {
        const resp = await fetch(`${supabaseUrl}/functions/v1/pepper-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
          body: JSON.stringify({ action: "create_offer", params: payload }),
        });
        const data = await resp.json();
        return data.error ? { success: false, result: data.error } : { success: true, result: "Oferta criada" };
      }
      case "send_group_message": {
        const resp = await fetch(`${supabaseUrl}/functions/v1/send-group-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
          body: JSON.stringify({ group_id: payload.group_id, content: payload.content, image_url: payload.image_url }),
        });
        const data = await resp.json();
        return data.error ? { success: false, result: data.error } : { success: true, result: "Mensagem enviada ao grupo" };
      }
      case "schedule_group_campaign": {
        // Insert scheduled messages for the group
        const messages = payload.messages || [{ content: payload.content }];
        const results: string[] = [];
        for (const msg of messages) {
          const { error } = await sb.from("group_messages").insert({
            group_id: payload.group_id,
            content: msg.content,
            image_url: msg.image_url || null,
            schedule_enabled: true,
            schedule_interval_hours: payload.interval_hours || 24,
            next_send_at: msg.send_at || new Date(Date.now() + 3600000).toISOString(),
          });
          results.push(error ? `Erro: ${error.message}` : "OK");
        }
        return { success: true, result: `Campanha agendada: ${results.join(", ")}` };
      }
      case "update_agent_prompt": {
        const updates: any = {};
        if (payload.agent_prompt) updates.agent_prompt = payload.agent_prompt;
        if (payload.product_info) updates.product_info = payload.product_info;
        if (payload.welcome_message) updates.welcome_message = payload.welcome_message;
        if (payload.followup_message) updates.followup_message = payload.followup_message;
        const { error } = await sb.from("agent_settings").update(updates).select().single();
        return error ? { success: false, result: error.message } : { success: true, result: `Campos atualizados: ${Object.keys(updates).join(", ")}` };
      }
      case "adjust_ad_budget": {
        // Log recommendation — actual budget changes require Meta API
        return { success: true, result: `Recomendação registrada: ${payload.recommendation || "ajustar orçamento"}` };
      }
      default:
        return { success: false, result: `Tipo de ação desconhecido: ${decisionType}` };
    }
  } catch (e: any) {
    return { success: false, result: e.message || "Erro desconhecido" };
  }
}

// ====== ANALYZE PROMPT ======

const ANALYZE_PROMPT = `Você é o MagoFlix Gerente — um analista estratégico de alto nível responsável por otimizar toda a operação de vendas digital.

## Seu papel
Analise TODOS os dados disponíveis de forma PROFUNDA e CRUZADA. Você NÃO executa nada — apenas propõe ações estratégicas com justificativas sólidas baseadas em dados.

## Dados que você receberá
Um JSON completo com:
- **data_quality**: LEIA PRIMEIRO — indica quais fontes estão disponíveis e qual usar como principal
- **derived_metrics**: métricas já calculadas (ROAS, CAC, CPL, taxa checkout→purchase)
- **sales**: transações Pepper (pode estar vazio)
- **conversions**: eventos de conversão (Purchase, InitiateCheckout, etc.) — FONTE CONFIÁVEL de vendas
- **ads**: campanhas Meta Ads com spend, clicks, impressions por campanha
- **funnel**: distribuição de lead_stage (novo, qualificado, proposta, fechado) — 7d e all-time
- **products**: produtos Pepper com preços e hashes reais
- **groups**: grupos WhatsApp ATIVOS com mensagens agendadas e eventos recentes
- **social_media**: métricas de redes sociais (followers, reach, impressions)
- **recent_conversations**: últimas conversas com lead_stage atual
- **ai_costs**: custos de IA detalhados por modelo
- **agent_settings**: configuração do agente de vendas
- **past_decisions**: histórico de decisões aprovadas e rejeitadas — APRENDA com isso

## Análise obrigatória (faça ANTES de propor ações)

### 1. Panorama de Vendas
- Use CONVERSIONS como fonte principal se pepper está vazio
- Quantas purchases? Qual valor total? Ticket médio?
- Taxa checkout→purchase (quantos abandonam?)
- Tendência vs semana anterior (crescendo? caindo?)

### 2. Análise de Funil
- Quantos leads em cada estágio? Onde está o gargalo?
- Taxa novo→qualificado, qualificado→proposta, proposta→fechado
- Comparar 7d com all-time para ver se está melhorando

### 3. Performance de Ads (se houver dados)
- Qual campanha tem melhor CPL?
- ROAS geral e por campanha
- Sugestões de realocar budget

### 4. Canais de Vendas
- Grupos WhatsApp: são canais ATIVOS (IGNORE contadores zerados no DB — use events_30d e scheduled_messages como prova de atividade)
- Social media: está gerando awareness? Tendência de followers?
- WhatsApp direto: quantas conversas ativas com IA?

### 5. Oportunidades e Riscos
- O que está funcionando bem? (duplicar)
- O que está fraco? (corrigir ou pausar)
- Riscos: custos subindo sem retorno? Canal abandonado?

## Regras CRÍTICAS
1. **CITE NÚMEROS CONCRETOS** em toda análise e proposta — "11 purchases de R$238,70" e não "algumas vendas"
2. **CRUZE OS DADOS**: ads spend vs conversões = ROAS; leads vs purchases = taxa conversão; custo IA vs receita = margem
3. **Grupos são ATIVOS** — mesmo com members_joined=0 no DB (tracking incompleto). Use events_30d e scheduled_messages como evidência
4. **Histórico importa**: se algo foi REJEITADO, NÃO proponha igual (a menos que contexto mudou significativamente)
5. **Se tudo vai bem**, proponha MENOS ações (foco em otimizar o que funciona)
6. **Máximo 5 propostas** — priorizadas por ROI esperado
7. **Sempre use IDs/hashes REAIS** dos grupos e produtos nos payloads

## Formato de resposta OBRIGATÓRIO
Responda APENAS com JSON válido (sem markdown, sem code blocks):
{
  "analysis": {
    "sales_overview": "Resumo de vendas com números concretos",
    "funnel_health": "Estado do funil com taxas de conversão por estágio",
    "channel_performance": "Performance por canal (WhatsApp, grupos, social)",
    "opportunities": ["oportunidade 1 com dados", "oportunidade 2"],
    "risks": ["risco 1 com dados", "risco 2"]
  },
  "summary": "Resumo executivo em 3-4 frases com os insights mais importantes e números-chave",
  "proposals": [
    {
      "decision_type": "update_offer_price | create_offer | send_group_message | schedule_group_campaign | update_agent_prompt | adjust_ad_budget | log_decision",
      "description": "O que será feito (claro e específico)",
      "reasoning": "Justificativa com MÉTRICAS CONCRETAS (ex: 'taxa checkout→purchase é 64.7%, podemos melhorar com...')",
      "expected_impact": "Impacto esperado quantificado (ex: '+15% conversão', 'economia de R$X')",
      "priority": "high | medium | low",
      "action_payload": { ... }
    }
  ]
}

Para action_payload:
- update_offer_price: { "product_hash": "REAL", "offer_hash": "REAL", "price": centavos }
- create_offer: { "product_hash": "REAL", "title": "...", "price": centavos }
- send_group_message: { "group_id": "UUID_REAL", "content": "texto persuasivo", "image_url": "opcional" }
- schedule_group_campaign: { "group_id": "UUID_REAL", "messages": [{"content": "msg1", "send_at": "ISO"}], "interval_hours": 24 }
- update_agent_prompt: { "agent_prompt": "...", "product_info": "...", "welcome_message": "..." }
- adjust_ad_budget: { "campaign_name": "nome", "recommendation": "aumentar/diminuir X%", "reason": "..." }
- log_decision: { "title": "...", "description": "..." }

Responda em português brasileiro.`;

// ====== ANALYZE MODE ======

async function handleAnalyze(sb: any, instructions: string) {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada");

  console.log("[MANAGER] Collecting deep context (skipping sync for speed)...");
  const context = await collectDeepContext(sb);
  console.log("[MANAGER] Context summary:", JSON.stringify({
    pepper_tx: context.sales.current_7d.total,
    conversions_7d: context.conversions.current_7d.count,
    conv_by_event: context.conversions.current_7d.by_event,
    leads_7d: context.funnel.leads_7d,
    stages_7d: context.funnel.stages_7d,
    products: context.products.length,
    groups: context.groups.length,
    derived: context.derived_metrics,
    social_days: context.social_media.recent_metrics.length,
    recent_convos: context.recent_conversations.length,
  }));

  const contextJson = JSON.stringify(context);
  const userMsg = instructions
    ? `Instruções do operador: ${instructions}\n\nDados completos da operação:\n${contextJson}`
    : `Dados completos da operação:\n${contextJson}`;

  const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: ANALYZE_PROMPT },
        { role: "user", content: userMsg },
      ],
      temperature: 0.4,
      max_tokens: 4000,
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    throw new Error(`AI API error: ${aiRes.status} ${errText}`);
  }

  const aiData = await aiRes.json();
  const content = aiData.choices?.[0]?.message?.content || "";

  let parsed: any;
  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("[MANAGER] Failed to parse AI response:", content);
    throw new Error("IA retornou formato inválido");
  }

  const proposals = parsed.proposals || [];
  const inserted: any[] = [];

  for (const p of proposals) {
    const { data, error } = await sb.from("manager_decisions").insert({
      decision_type: p.decision_type || "log_decision",
      description: p.description || "",
      reasoning: p.reasoning || "",
      priority: p.priority || "medium",
      action_payload: p.action_payload || {},
      data: {
        analysis: parsed.analysis || {},
        expected_impact: p.expected_impact || "",
        context_snapshot: {
          sales_trend: context.sales.trend,
          conversions_7d: context.conversions.current_7d.count,
          purchases_7d: context.derived_metrics.purchases_7d,
          purchase_revenue_7d: context.derived_metrics.purchase_revenue_7d,
          leads_7d: context.funnel.leads_7d,
          stages_7d: context.funnel.stages_7d,
          roas_7d: context.derived_metrics.roas_7d,
          checkout_to_purchase_rate: context.derived_metrics.checkout_to_purchase_rate_7d,
        },
      },
      status: "pending",
      result: "",
    }).select().single();

    if (!error && data) inserted.push(data);
  }

  return {
    analysis: parsed.analysis || {},
    summary: parsed.summary || "",
    proposals: inserted,
    total: inserted.length,
  };
}

// ====== EXECUTE MODE ======

async function handleExecute(sb: any, decisionIds: string[]) {
  const results: any[] = [];

  for (const id of decisionIds) {
    const { data: decision } = await sb.from("manager_decisions").select("*").eq("id", id).eq("status", "approved").single();
    if (!decision) {
      results.push({ id, success: false, result: "Decisão não encontrada ou não aprovada" });
      continue;
    }

    const { success, result } = await executeAction(sb, decision.decision_type, decision.action_payload);
    const newStatus = success ? "executed" : "failed";

    await sb.from("manager_decisions").update({ status: newStatus, result }).eq("id", id);

    if (success) {
      await sb.from("changelog").insert({
        title: `[Gerente] ${decision.description}`.slice(0, 200),
        description: decision.reasoning,
        category: "manager",
        created_by: "MagoFlix Gerente",
      });
    }

    results.push({ id, success, result, decision_type: decision.decision_type });
  }

  return { executed: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length, results };
}

// ====== MAIN ======

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = getSupabase();
    let body: any = {};
    try { body = await req.json(); } catch {}

    const mode = body.mode || "analyze";

    if (mode === "analyze") {
      const result = await handleAnalyze(sb, body.instructions || "");
      return json(result);
    }

    if (mode === "execute") {
      if (!body.decision_ids?.length) return json({ error: "decision_ids obrigatórios" }, 400);
      const result = await handleExecute(sb, body.decision_ids);
      return json(result);
    }

    return json({ error: `Modo desconhecido: ${mode}` }, 400);
  } catch (e: any) {
    console.error("[MANAGER] Error:", e);
    return json({ error: e.message || "Erro interno" }, 500);
  }
});
