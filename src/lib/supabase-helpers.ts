import { supabase } from "@/integrations/supabase/client";

// Generic paginated fetch to bypass PostgREST 1000-row limit
async function fetchAllRows<T = any>(
  tableName: string,
  select: string,
  orderColumn: string,
  ascending = true,
  filter?: { column: string; op: "gte"; value: string }
): Promise<T[]> {
  const PAGE = 1000;
  let offset = 0;
  const all: T[] = [];
  while (true) {
    let q = supabase
      .from(tableName as any)
      .select(select)
      .order(orderColumn, { ascending })
      .range(offset, offset + PAGE - 1) as any;
    if (filter) {
      q = q.gte(filter.column, filter.value);
    }
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data || []) as T[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

export async function getConversations() {
  const { data, error } = await supabase
    .from("conversations")
    .select("*, instances(name)")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getMessages(conversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getAgentSettings() {
  const { data, error } = await supabase
    .from("agent_settings")
    .select("*")
    .limit(1)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function updateAgentSettings(settings: {
  agent_name: string;
  agent_prompt: string;
  openai_api_key?: string | null;
  product_info: string;
  faq: string;
  uazapi_subdomain: string;
  uazapi_token: string;
  response_delay_min: number;
  response_delay_max: number;
  simulate_typing: boolean;
  business_hours_enabled: boolean;
  business_hours_start: string;
  business_hours_end: string;
  business_hours_timezone: string;
  outside_hours_message: string;
  welcome_message: string;
  followup_enabled: boolean;
  followup_delay_hours: number;
  followup_message: string;
  pix_evp_key: string;
  card_payment_url: string;
  welcome_audio_url: string;
  welcome_audio_url_es: string;
  pix_evp_key_fallback: string;
  card_payment_url_fallback: string;
  payment_error_pix_message: string;
  payment_error_card_message: string;
}) {
  const { data: existing } = await supabase
    .from("agent_settings")
    .select("id")
    .limit(1)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("agent_settings")
      .update(settings)
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("agent_settings")
      .insert(settings);
    if (error) throw error;
  }
}

export async function updateLeadStage(conversationId: string, stage: string) {
  const { error } = await supabase
    .from("conversations")
    .update({ lead_stage: stage })
    .eq("id", conversationId);
  if (error) throw error;
}

export async function toggleConversationAI(conversationId: string, enabled: boolean) {
  const { error } = await supabase
    .from("conversations")
    .update({ ai_enabled: enabled } as any)
    .eq("id", conversationId);
  if (error) throw error;
}

// --- Instances CRUD ---

export async function getInstances() {
  const { data, error } = await supabase
    .from("instances" as any)
    .select("*")
    .order("created_at", { ascending: true }) as any;
  if (error) throw error;
  return data || [];
}

export async function createInstance(inst: { name: string; uazapi_subdomain: string; uazapi_token: string }) {
  // Auto-vincular ao primeiro agente disponível
  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .limit(1)
    .single();

  const { data, error } = await supabase
    .from("instances" as any)
    .insert({ ...inst, agent_id: agent?.id || null })
    .select()
    .single() as any;
  if (error) throw error;
  return data;
}

export async function updateInstance(id: string, inst: Partial<{ name: string; uazapi_subdomain: string; uazapi_token: string; enabled: boolean }>) {
  const { error } = await supabase
    .from("instances" as any)
    .update(inst)
    .eq("id", id) as any;
  if (error) throw error;
}

export async function deleteInstance(id: string) {
  const { error } = await supabase
    .from("instances" as any)
    .delete()
    .eq("id", id) as any;
  if (error) throw error;
}

export async function getLastMessage(conversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function getTokenUsageTotals() {
  const { data, error } = await supabase
    .from("token_usage" as any)
    .select("prompt_tokens, completion_tokens, total_tokens, cost_usd, usage_type") as any;
  if (error) throw error;
  const rows = (data || []) as any[];
  
  const byType: Record<string, { total_tokens: number; cost_usd: number }> = {
    chat: { total_tokens: 0, cost_usd: 0 },
    chat_retry: { total_tokens: 0, cost_usd: 0 },
    test: { total_tokens: 0, cost_usd: 0 },
    memory: { total_tokens: 0, cost_usd: 0 },
    summary: { total_tokens: 0, cost_usd: 0 },
  };
  
  const totals = rows.reduce(
    (acc, row) => {
      const t = row.usage_type || "chat";
      if (!byType[t]) byType[t] = { total_tokens: 0, cost_usd: 0 };
      byType[t].total_tokens += (row.total_tokens || 0);
      byType[t].cost_usd += Number(row.cost_usd || 0);
      
      return {
        prompt_tokens: acc.prompt_tokens + (row.prompt_tokens || 0),
        completion_tokens: acc.completion_tokens + (row.completion_tokens || 0),
        total_tokens: acc.total_tokens + (row.total_tokens || 0),
        cost_usd: acc.cost_usd + Number(row.cost_usd || 0),
      };
    },
    { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 }
  );
  return { ...totals, byType };
}

export async function getConversationCountByInstance() {
  const { data, error } = await supabase
    .from("conversations")
    .select("instance_id")
    .not("instance_id", "is", null);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data || []) {
    const id = row.instance_id!;
    counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

export async function getAdCreatives() {
  const { data, error } = await supabase
    .from("ad_creatives" as any)
    .select("*")
    .order("created_at", { ascending: false }) as any;
  if (error) throw error;

  // Also fetch conversations to join lead_stage data
  const convIds = (data || []).map((d: any) => d.conversation_id).filter(Boolean);
  let convMap: Record<string, any> = {};
  if (convIds.length > 0) {
    const { data: convs } = await supabase
      .from("conversations")
      .select("id, contact_name, contact_phone, lead_stage, created_at")
      .in("id", convIds);
    for (const c of convs || []) {
      convMap[c.id] = c;
    }
  }

  return (data || []).map((d: any) => ({
    ...d,
    conversation: convMap[d.conversation_id] || null,
  }));
}

export async function getTokenUsageTimeline() {
  return fetchAllRows<{ created_at: string; cost_usd: number; total_tokens: number; usage_type: string }>(
    "token_usage", "created_at, cost_usd, total_tokens, usage_type", "created_at", true
  );
}

export async function fetchAllTokenUsage(startDate?: string) {
  return fetchAllRows<any>(
    "token_usage",
    "id, conversation_id, prompt_tokens, completion_tokens, total_tokens, cost_usd, created_at, model, usage_type",
    "created_at",
    true,
    startDate ? { column: "created_at", op: "gte", value: startDate } : undefined
  );
}

export async function getTokenUsageByDay() {
  const rows = await fetchAllRows<{ created_at: string; cost_usd: number; total_tokens: number }>(
    "token_usage", "created_at, cost_usd, total_tokens", "created_at", true
  );
  const byDay: Record<string, { cost_usd: number; total_tokens: number }> = {};
  for (const row of rows) {
    const day = new Date(row.created_at).toISOString().split("T")[0];
    if (!byDay[day]) byDay[day] = { cost_usd: 0, total_tokens: 0 };
    byDay[day].cost_usd += Number(row.cost_usd || 0);
    byDay[day].total_tokens += (row.total_tokens || 0);
  }
  return byDay;
}

// --- Pepper Products CRUD ---

export async function getPepperProducts() {
  const { data, error } = await supabase
    .from("pepper_products" as any)
    .select("*")
    .order("created_at", { ascending: true }) as any;
  if (error) throw error;
  return data;
}

export async function createPepperProduct(product: {
  name: string;
  offer_hash: string;
  product_hash: string;
  price_cents: number;
}) {
  const { data, error } = await supabase
    .from("pepper_products" as any)
    .insert(product)
    .select()
    .single() as any;
  if (error) throw error;
  return data;
}

export async function updatePepperProduct(
  id: string,
  product: Partial<{ name: string; offer_hash: string; product_hash: string; price_cents: number; active: boolean }>
) {
  const { error } = await supabase
    .from("pepper_products" as any)
    .update(product)
    .eq("id", id) as any;
  if (error) throw error;
}

export async function deletePepperProduct(id: string) {
  const { error } = await supabase
    .from("pepper_products" as any)
    .delete()
    .eq("id", id) as any;
  if (error) throw error;
}

// --- Pepper Transactions ---

export async function getPepperTransactions() {
  const { data, error } = await supabase
    .from("pepper_transactions" as any)
    .select("*")
    .order("pepper_created_at", { ascending: false }) as any;
  if (error) throw error;
  return data;
}

export async function syncPepperTransactions() {
  // Fetch from Pepper API
  const { data, error } = await supabase.functions.invoke("pepper-sync", {
    body: { action: "list_transactions", params: { per_page: 100 } },
  });
  if (error) throw error;
  const transactions = data?.transactions || [];
  if (!Array.isArray(transactions) || transactions.length === 0) return [];

  // Upsert into local table
  const rows = transactions.map((t: any) => ({
    hash: t.hash || t.id || "",
    payment_status: t.status || t.payment_status || "unknown",
    payment_method: t.payment_method || t.method || "",
    amount: t.amount || t.price || 0,
    amount_liquid: t.amount_liquid || t.net_amount || 0,
    customer_name: t.customer?.name || t.buyer?.name || "",
    customer_phone: t.customer?.phone || t.buyer?.phone || "",
    customer_email: t.customer?.email || t.buyer?.email || "",
    offer_hash: t.offer?.hash || t.offer_hash || "",
    product_hash: t.product?.hash || t.product_hash || "",
    product_name: t.product?.name || t.product_name || "",
    offer_name: t.offer?.name || t.offer?.title || t.offer_name || "",
    utm_source: t.utm_source || t.tracking?.utm_source || "",
    utm_campaign: t.utm_campaign || t.tracking?.utm_campaign || "",
    pepper_created_at: t.created_at || t.date || null,
  }));

  const { error: upsertErr } = await supabase
    .from("pepper_transactions" as any)
    .upsert(rows, { onConflict: "hash" }) as any;
  if (upsertErr) throw upsertErr;

  return rows;
}

// --- Pepper API Actions (proxy through edge function) ---

export async function pepperCreateProduct(params: { name: string; description?: string; price?: number }) {
  const { data, error } = await supabase.functions.invoke("pepper-sync", {
    body: { action: "create_product", params },
  });
  if (error) throw error;
  return data;
}

export async function pepperCreateOffer(params: { product_hash: string; title: string; price: number }) {
  const { data, error } = await supabase.functions.invoke("pepper-sync", {
    body: { action: "create_offer", params },
  });
  if (error) throw error;
  return data;
}

export async function pepperUpdateOffer(params: { product_hash: string; offer_hash: string; title?: string; price?: number }) {
  const { data, error } = await supabase.functions.invoke("pepper-sync", {
    body: { action: "update_offer", params },
  });
  if (error) throw error;
  return data;
}

export async function pepperCreateTransaction(params: {
  offer_hash: string;
  customer: { name: string; email: string; phone: string };
  payment_method: string;
}) {
  const { data, error } = await supabase.functions.invoke("pepper-sync", {
    body: { action: "create_transaction", params },
  });
  if (error) throw error;
  return data;
}

export async function updateAdCreativeImage(id: string, imageUrl: string) {
  const { error } = await supabase
    .from("ad_creatives")
    .update({ image_url: imageUrl })
    .eq("id", id);
  if (error) throw error;
}

// --- Conversions Timeline ---

export async function getConversionsTimeline() {
  const { data, error } = await supabase
    .from("conversions")
    .select("created_at, event_name, value, currency")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as { created_at: string; event_name: string; value: number; currency: string }[];
}

// --- Last Payment ---

export async function getLastPayment() {
  const { data, error } = await supabase
    .from("conversions")
    .select("id, value, currency, created_at, event_name, conversation_id")
    .eq("event_name", "Purchase")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  if (!data) return null;

  let contact_name: string | null = null;
  let contact_phone: string | null = null;
  if (data.conversation_id) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("contact_name, contact_phone")
      .eq("id", data.conversation_id)
      .single();
    if (conv) {
      contact_name = conv.contact_name;
      contact_phone = conv.contact_phone;
    }
  }

  return { ...data, contact_name, contact_phone };
}

// --- Dashboard Stats ---

export async function getMessageStats() {
  const { count, error } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return { totalMessages: count || 0 };
}

export async function getDashboardTimeline() {
  // Get conversations with created_at for period comparison
  const { data: convs, error: convErr } = await supabase
    .from("conversations")
    .select("id, created_at, lead_stage, status");
  if (convErr) throw convErr;

  // Get messages with created_at and role for response time calc
  const { data: msgs, error: msgErr } = await supabase
    .from("messages")
    .select("conversation_id, created_at, role")
    .order("created_at", { ascending: true });
  if (msgErr) throw msgErr;

  return { conversations: convs || [], messages: msgs || [] };
}

// --- Cloud Usage Stats ---

export async function getAiMessageCount() {
  const { count, error } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("role", "assistant");
  if (error) throw error;
  return count || 0;
}

export async function getCampaignSnapshots() {
  const { data, error } = await supabase
    .from("campaign_snapshots")
    .select("spend, date, campaign_name")
    .order("date", { ascending: true });
  if (error) throw error;
  return (data || []) as { spend: number; date: string; campaign_name: string }[];
}

function extractMessagingActions(insights: any[]): number {
  let total = 0;
  for (const row of insights) {
    if (!row.actions) continue;
    for (const action of row.actions) {
      if (
        action.action_type === "onsite_conversion.messaging_conversation_started_7d" ||
        action.action_type === "messaging_conversation_started_7d" ||
        action.action_type === "onsite_conversion.messaging_first_reply"
      ) {
        total += parseInt(action.value || "0", 10);
      }
    }
  }
  return total;
}

export async function getAdsSpendFromMeta(): Promise<{
  totalSpend: number; spendPerDay: number; spendToday: number;
  days: number; hasDados: boolean;
  messagingActions30d: number; costPerMessage: number;
  messagingActionsToday: number; costPerMessageToday: number;
}> {
  const empty = { totalSpend: 0, spendPerDay: 0, spendToday: 0, days: 0, hasDados: false, messagingActions30d: 0, costPerMessage: 0, messagingActionsToday: 0, costPerMessageToday: 0 };
  try {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const base = `https://${projectId}.supabase.co/functions/v1/meta-ads`;
    const headers = { "Content-Type": "application/json" };

    const [res30d, resToday] = await Promise.all([
      fetch(`${base}?action=account_insights&date_preset=last_30d`, { headers }),
      fetch(`${base}?action=account_insights&date_preset=today`, { headers }),
    ]);

    const [json30d, jsonToday] = await Promise.all([res30d.json(), resToday.json()]);

    const insights30d = json30d.insights || [];
    const insightsToday = jsonToday.insights || [];
    const totalSpend = insights30d.reduce((sum: number, row: any) => sum + parseFloat(row.spend || "0"), 0);
    const spendPerDay = totalSpend / 30;
    const spendToday = insightsToday.reduce((sum: number, row: any) => sum + parseFloat(row.spend || "0"), 0);

    const messagingActions30d = extractMessagingActions(insights30d);
    const costPerMessage = messagingActions30d > 0 ? totalSpend / messagingActions30d : 0;

    const messagingActionsToday = extractMessagingActions(insightsToday);
    const costPerMessageToday = messagingActionsToday > 0 ? spendToday / messagingActionsToday : 0;

    return { totalSpend, spendPerDay, spendToday, days: 30, hasDados: totalSpend > 0 || spendToday > 0, messagingActions30d, costPerMessage, messagingActionsToday, costPerMessageToday };
  } catch {
    return empty;
  }
}

// --- Today Stats (sales/revenue from DB) ---

export async function getTodayStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const [salesRes, convsRes, tokensRes, aiMsgsRes, totalMsgsRes, closedConvsRes] = await Promise.all([
    supabase.from("conversions").select("value, event_name").gte("created_at", todayISO).eq("event_name", "Purchase"),
    supabase.from("conversations").select("id").gte("created_at", todayISO),
    supabase.from("token_usage").select("cost_usd, total_tokens").gte("created_at", todayISO),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("role", "assistant").gte("created_at", todayISO),
    supabase.from("messages").select("id", { count: "exact", head: true }).gte("created_at", todayISO),
    supabase.from("conversations").select("id").gte("created_at", todayISO).eq("lead_stage", "fechado"),
  ]);

  const purchases = salesRes.data || [];
  const salesToday = purchases.length;
  const revenueToday = purchases.reduce((sum, p) => sum + Number(p.value || 0), 0);
  const convsToday = (convsRes.data || []).length;
  const aiCostTodayUsd = (tokensRes.data || []).reduce((sum, t) => sum + Number(t.cost_usd || 0), 0);
  const aiMsgsToday = aiMsgsRes.count || 0;
  const totalMsgsToday = totalMsgsRes.count || 0;
  const closedConvsToday = (closedConvsRes.data || []).length;
  const convRateToday = convsToday > 0 ? (closedConvsToday / convsToday) * 100 : 0;
  const avgTicketToday = salesToday > 0 ? revenueToday / salesToday : 0;

  return { salesToday, revenueToday, convsToday, aiCostTodayUsd, aiMsgsToday, totalMsgsToday, convRateToday, avgTicketToday };
}

export async function getCloudUsageStats() {
  const [msgsRes, convsRes, tokensRes, memoriesRes, summariesRes, webhooksRes] = await Promise.all([
    supabase.from("messages").select("*", { count: "exact", head: true }),
    supabase.from("conversations").select("*", { count: "exact", head: true }),
    supabase.from("token_usage").select("*", { count: "exact", head: true }),
    supabase.from("contact_memories").select("*", { count: "exact", head: true }),
    supabase.from("conversation_summaries").select("*", { count: "exact", head: true }),
    supabase.from("webhook_logs").select("*", { count: "exact", head: true }),
  ]);

  const totalRows =
    (msgsRes.count || 0) +
    (convsRes.count || 0) +
    (tokensRes.count || 0) +
    (memoriesRes.count || 0) +
    (summariesRes.count || 0) +
    (webhooksRes.count || 0);

  // Estimate DB size: ~1KB per row average
  const estimatedDbMb = Math.max(totalRows * 0.001, 0.1);

  // Edge function calls = token_usage rows (each AI call logs a row)
  const edgeCalls = tokensRes.count || 0;

  return {
    totalRows,
    estimatedDbMb: Number(estimatedDbMb.toFixed(1)),
    edgeCalls,
    breakdown: {
      messages: msgsRes.count || 0,
      conversations: convsRes.count || 0,
      tokenUsage: tokensRes.count || 0,
      memories: memoriesRes.count || 0,
      summaries: summariesRes.count || 0,
      webhookLogs: webhooksRes.count || 0,
    },
  };
}

// --- Last 7 Days Stats (for Estimates page) ---

export async function getLast7DaysStats() {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  const sinceISO = sevenDaysAgo.toISOString();

  const [salesRes, convsRes, tokensRes, msgsRes] = await Promise.all([
    supabase.from("conversions").select("value, event_name").gte("created_at", sinceISO).eq("event_name", "Purchase"),
    supabase.from("conversations").select("id, lead_stage").gte("created_at", sinceISO),
    supabase.from("token_usage").select("cost_usd, total_tokens").gte("created_at", sinceISO).in("usage_type", ["chat", "chat_retry", "audio", "memory", "summary", "test"]),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("role", "assistant").gte("created_at", sinceISO),
  ]);

  const purchases = salesRes.data || [];
  const sales = purchases.length;
  const revenue = purchases.reduce((sum, p) => sum + Number(p.value || 0), 0);
  const conversations = (convsRes.data || []).length;
  const closedConvs = (convsRes.data || []).filter(c => c.lead_stage === "fechado").length;
  const aiCostUsd = (tokensRes.data || []).reduce((sum, t) => sum + Number(t.cost_usd || 0), 0);
  const aiMessages = msgsRes.count || 0;

  const convRate = conversations > 0 ? (sales / conversations) * 100 : 0;
  const avgTicket = sales > 0 ? revenue / sales : 0;
  const aiCostPerConv = conversations > 0 ? aiCostUsd / conversations : 0;

  return {
    sales,
    revenue,
    conversations,
    closedConvs,
    aiCostUsd,
    aiMessages,
    convRate,
    avgTicket,
    aiCostPerConv,
    // Daily averages
    salesPerDay: sales / 7,
    revenuePerDay: revenue / 7,
    convsPerDay: conversations / 7,
    aiCostUsdPerDay: aiCostUsd / 7,
  };
}
