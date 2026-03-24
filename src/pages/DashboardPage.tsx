import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  MessageSquare, Users, TrendingUp, Zap, Loader2, Coins,
  FlaskConical, Brain, Mail, BarChart3, Target, ArrowUp, ArrowDown,
  CalendarIcon, Activity, DollarSign, ShoppingCart, Receipt, CreditCard,
  ChevronRight, Cloud, Database, HardDrive, Server, XCircle, Rocket, Megaphone,
} from "lucide-react";
import {
  Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip, Line, ComposedChart, LineChart, Area, AreaChart,
} from "recharts";
import { formatDistanceToNow, subDays, startOfDay, endOfDay, format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import {
  getConversations, getTokenUsageByDay,
  getMessageStats, getDashboardTimeline, getTokenUsageTimeline,
  getConversionsTimeline, getCloudUsageStats, getLastPayment,
} from "@/lib/supabase-helpers";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

const USD_TO_BRL = 6.0;

const META_ADS_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const META_ADS_FN_URL = `https://${META_ADS_PROJECT_ID}.supabase.co/functions/v1/meta-ads`;

function mapPresetToMeta(days: number): string {
  if (days <= 1) return "today";
  if (days <= 7) return "last_7d";
  if (days <= 14) return "last_14d";
  return "last_30d";
}

async function fetchMetaAdsInsights(datePreset: string) {
  const qs = new URLSearchParams({ action: "account_insights", date_preset: datePreset }).toString();
  const res = await fetch(`${META_ADS_FN_URL}?${qs}`);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  return payload;
}

function inRange(dateStr: string, from: Date, to: Date) {
  const t = new Date(dateStr).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function calcVariation(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function buildDailyBucketsRange(
  items: { created_at: string }[],
  from: Date,
  to: Date,
  filterFn?: (item: any) => boolean
) {
  const buckets: number[] = [];
  const days = differenceInDays(to, from) + 1;
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    const dayStr = d.toDateString();
    buckets.push(
      items.filter((it) => {
        if (filterFn && !filterFn(it)) return false;
        return new Date(it.created_at).toDateString() === dayStr;
      }).length
    );
  }
  return buckets;
}

function buildDailyValueBuckets(
  items: { created_at: string; value: number }[],
  from: Date,
  to: Date,
) {
  const buckets: number[] = [];
  const days = differenceInDays(to, from) + 1;
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    const dayStr = d.toDateString();
    buckets.push(
      items
        .filter((it) => new Date(it.created_at).toDateString() === dayStr)
        .reduce((sum, it) => sum + Number(it.value || 0), 0)
    );
  }
  return buckets;
}

function countInRange(
  items: { created_at: string }[],
  from: Date,
  to: Date,
  filterFn?: (item: any) => boolean
) {
  return items.filter((it) => {
    if (filterFn && !filterFn(it)) return false;
    return inRange(it.created_at, from, to);
  }).length;
}

function sumInRange(
  items: { created_at: string; value: number }[],
  from: Date,
  to: Date,
) {
  return items
    .filter((it) => inRange(it.created_at, from, to))
    .reduce((sum, it) => sum + Number(it.value || 0), 0);
}

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  variation: number;
  sparkData: number[];
  subtitle: string;
  delay: number;
  accent?: string;
}

function KpiCard({ label, value, icon: Icon, variation, sparkData, subtitle, delay, accent = "primary" }: KpiCardProps) {
  const isPositive = variation >= 0;
  const sparkChartData = sparkData.map((v, i) => ({ v, i }));

  const colorMap: Record<string, string> = {
    primary: "hsl(var(--primary))",
    info: "hsl(var(--info))",
    warning: "hsl(var(--warning))",
    success: "hsl(var(--success))",
    destructive: "hsl(var(--destructive))",
  };
  const accentColor = colorMap[accent] || colorMap.primary;

  return (
    <Card
      className="group relative overflow-hidden border border-border/40 bg-white/60 dark:bg-card/80 backdrop-blur-md shadow-md hover:shadow-xl transition-all duration-500 hover:-translate-y-1 hover:scale-[1.02] animate-fade-in-up light-card-glow"
      style={{
        animationDelay: `${delay}ms`,
        animationFillMode: "backwards",
        borderLeft: `3px solid ${accentColor}`,
        background: `linear-gradient(135deg, ${accentColor}10 0%, transparent 60%)`,
      }}
    >
      {/* Glow on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-lg"
        style={{ boxShadow: `inset 0 0 30px -10px ${accentColor}20, 0 4px 25px -5px ${accentColor}30` }}
      />
      {/* Accent orb */}
      <div
        className="absolute -top-16 -right-16 h-32 w-32 rounded-full opacity-[0.06] group-hover:opacity-[0.12] transition-opacity duration-500"
        style={{ background: `radial-gradient(circle, ${accentColor}, transparent)` }}
      />
      <CardContent className="p-5 relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
              boxShadow: `0 4px 14px -3px ${accentColor}50`,
            }}
          >
            <Icon className="h-5 w-5 text-white" />
          </div>
          {variation !== 0 && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] font-bold gap-0.5 px-2.5 py-1 rounded-full border-0 shadow-sm",
                isPositive
                  ? "text-success bg-success/15"
                  : "text-destructive bg-destructive/15"
              )}
            >
              {isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(variation)}%
            </Badge>
          )}
        </div>
        <div className="text-4xl font-black tracking-tighter mb-1 font-mono gradient-text">{value}</div>
        <p className="text-[11px] text-muted-foreground font-semibold mb-3 uppercase tracking-wide">
          {label}
        </p>
        {sparkData.length > 1 && (
          <div className="h-10 -mx-2 mt-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkChartData}>
                <defs>
                  <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accentColor} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={accentColor} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={accentColor}
                  strokeWidth={2}
                  fill={`url(#spark-${label})`}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-[9px] text-muted-foreground/60 mt-1 uppercase tracking-widest">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

const PRESETS = [
  { label: "Hoje", days: 1 },
  { label: "7d", days: 7 },
  { label: "15d", days: 15 },
  { label: "30d", days: 30 },
] as const;

const FUNNEL_STAGES = [
  { key: "novo", label: "Novo Lead", color: "hsl(var(--muted-foreground))", bgClass: "bg-muted-foreground", gradient: "linear-gradient(180deg, hsl(var(--muted-foreground) / 0.8) 0%, hsl(var(--muted-foreground)) 100%)", shadowColor: "var(--muted-foreground)" },
  { key: "qualificado", label: "Qualificado", color: "hsl(var(--info))", bgClass: "bg-info", gradient: "linear-gradient(180deg, hsl(var(--info) / 0.85) 0%, hsl(var(--info)) 100%)", shadowColor: "var(--info)" },
  { key: "proposta", label: "Proposta", color: "hsl(var(--warning))", bgClass: "bg-warning", gradient: "linear-gradient(180deg, hsl(var(--warning) / 0.85) 0%, hsl(var(--warning)) 100%)", shadowColor: "var(--warning)" },
  { key: "fechado", label: "Fechado", color: "hsl(var(--success))", bgClass: "bg-success", gradient: "linear-gradient(180deg, hsl(var(--success) / 0.85) 0%, hsl(var(--success)) 100%)", shadowColor: "var(--success)" },
  { key: "perdido", label: "Perdido", color: "hsl(var(--destructive))", bgClass: "bg-destructive", gradient: "linear-gradient(180deg, hsl(var(--destructive) / 0.15) 0%, hsl(var(--destructive) / 0.25) 100%)", shadowColor: "var(--destructive)" },
] as const;

export default function DashboardPage() {
  const now = useMemo(() => new Date(), []);
  const [selectedPreset, setSelectedPreset] = useState<number>(7);
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [popoverOpen, setPopoverOpen] = useState(false);

  const dateRange = useMemo(() => {
    if (customRange?.from && customRange?.to) {
      return { from: startOfDay(customRange.from), to: endOfDay(customRange.to) };
    }
    return { from: startOfDay(subDays(now, selectedPreset - 1)), to: endOfDay(now) };
  }, [selectedPreset, customRange, now]);

  const periodDays = differenceInDays(dateRange.to, dateRange.from) + 1;
  const prevRange = useMemo(() => ({
    from: startOfDay(subDays(dateRange.from, periodDays)),
    to: endOfDay(subDays(dateRange.from, 1)),
  }), [dateRange, periodDays]);

  const periodLabel = customRange?.from && customRange?.to
    ? `${format(customRange.from, "dd/MM")} – ${format(customRange.to, "dd/MM")}`
    : selectedPreset === 1 ? "hoje" : `últimos ${selectedPreset} dias`;

  const handlePreset = (days: number) => {
    setSelectedPreset(days);
    setCustomRange(undefined);
  };

  const handleCustomSelect = (range: DateRange | undefined) => {
    setCustomRange(range);
    if (range?.from && range?.to) {
      setSelectedPreset(0);
      setPopoverOpen(false);
    }
  };

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: getConversations,
  });

  const { data: tokenTimeline = [] } = useQuery({
    queryKey: ["tokenUsageTimeline"],
    queryFn: getTokenUsageTimeline,
  });

  const { data: tokenByDay } = useQuery({
    queryKey: ["tokenUsageByDay"],
    queryFn: getTokenUsageByDay,
  });

  const { data: messageStats } = useQuery({
    queryKey: ["messageStats"],
    queryFn: getMessageStats,
  });

  const { data: timeline } = useQuery({
    queryKey: ["dashboardTimeline"],
    queryFn: getDashboardTimeline,
  });

  const { data: conversionsData = [] } = useQuery({
    queryKey: ["conversionsTimeline"],
    queryFn: getConversionsTimeline,
  });

  const metaDatePreset = useMemo(() => {
    if (customRange?.from && customRange?.to) {
      const days = differenceInDays(customRange.to, customRange.from) + 1;
      return mapPresetToMeta(days);
    }
    return mapPresetToMeta(selectedPreset);
  }, [selectedPreset, customRange]);

  const { data: metaAdsData } = useQuery({
    queryKey: ["metaAdsInsights", metaDatePreset],
    queryFn: () => fetchMetaAdsInsights(metaDatePreset),
    retry: false,
    staleTime: 60_000,
  });

  const totalAdSpend = useMemo(() => {
    if (!metaAdsData?.insights) return 0;
    const insights = Array.isArray(metaAdsData.insights) ? metaAdsData.insights : [metaAdsData.insights];
    return insights.reduce((sum: number, i: any) => sum + Number(i.spend || 0), 0);
  }, [metaAdsData]);

  const { data: cloudUsage } = useQuery({
    queryKey: ["cloudUsageStats"],
    queryFn: getCloudUsageStats,
  });

  const { data: lastPayment } = useQuery({
    queryKey: ["lastPayment"],
    queryFn: getLastPayment,
  });

  const allConvs = timeline?.conversations || [];
  const allMsgs = timeline?.messages || [];

  const filteredConvs = useMemo(() =>
    conversations.filter((c) => inRange(c.created_at, dateRange.from, dateRange.to)),
    [conversations, dateRange]
  );
  const filteredAllConvs = useMemo(() =>
    allConvs.filter((c: any) => inRange(c.created_at, dateRange.from, dateRange.to)),
    [allConvs, dateRange]
  );
  const filteredAllMsgs = useMemo(() =>
    allMsgs.filter((m: any) => inRange(m.created_at, dateRange.from, dateRange.to)),
    [allMsgs, dateRange]
  );

  // Conversions filtered by period
  const filteredConversions = useMemo(() =>
    conversionsData.filter((c) => inRange(c.created_at, dateRange.from, dateRange.to)),
    [conversionsData, dateRange]
  );
  const prevConversions = useMemo(() =>
    conversionsData.filter((c) => inRange(c.created_at, prevRange.from, prevRange.to)),
    [conversionsData, prevRange]
  );

  const totalConversations = filteredConvs.length;
  const qualifiedLeads = filteredConvs.filter((c) => c.lead_stage === "qualificado").length;
  const lostLeads = filteredConvs.filter((c) => c.lead_stage === "perdido").length;

  // Revenue from Purchase events
  const purchases = filteredConversions.filter((c) => c.event_name === "Purchase");
  // closedLeads synced with purchases count so conversion rate matches sales KPI
  const closedLeads = purchases.length;
  const conversionRate = totalConversations > 0 ? ((closedLeads / totalConversations) * 100).toFixed(1) : "0";
  const totalRevenue = purchases.reduce((sum, c) => sum + Number(c.value || 0), 0);
  const prevPurchases = prevConversions.filter((c) => c.event_name === "Purchase");
  const prevRevenue = prevPurchases.reduce((sum, c) => sum + Number(c.value || 0), 0);

  // Checkout metrics
  const checkouts = filteredConversions.filter((c) => c.event_name === "InitiateCheckout");
  const checkoutCount = checkouts.length;
  const prevCheckoutCount = prevConversions.filter((c) => c.event_name === "InitiateCheckout").length;
  const purchaseCount = purchases.length;
  const checkoutToSaleRate = checkoutCount > 0 ? ((purchaseCount / checkoutCount) * 100).toFixed(1) : "0";
  const avgTicket = purchaseCount > 0 ? (totalRevenue / purchaseCount).toFixed(2) : "0.00";

  const totalMessages = filteredAllMsgs.length || (messageStats?.totalMessages || 0);

  const filteredTokens = useMemo(() =>
    tokenTimeline.filter((t) => inRange(t.created_at, dateRange.from, dateRange.to)),
    [tokenTimeline, dateRange]
  );

  const prevTokens = useMemo(() =>
    tokenTimeline.filter((t) => inRange(t.created_at, prevRange.from, prevRange.to)),
    [tokenTimeline, prevRange]
  );

  const { costBrl, totalTokensFiltered, byType } = useMemo(() => {
    const bt: Record<string, { cost_usd: number }> = {
      chat: { cost_usd: 0 }, chat_retry: { cost_usd: 0 }, test: { cost_usd: 0 },
      memory: { cost_usd: 0 }, summary: { cost_usd: 0 },
    };
    let costUsd = 0;
    let tokens = 0;
    for (const row of filteredTokens) {
      const t = row.usage_type || "chat";
      if (!bt[t]) bt[t] = { cost_usd: 0 };
      bt[t].cost_usd += Number(row.cost_usd || 0);
      costUsd += Number(row.cost_usd || 0);
      tokens += (row.total_tokens || 0);
    }
    return { costBrl: costUsd * USD_TO_BRL, totalTokensFiltered: tokens, byType: bt };
  }, [filteredTokens]);

  const prevCostBrl = useMemo(() =>
    prevTokens.reduce((sum, r) => sum + Number(r.cost_usd || 0), 0) * USD_TO_BRL,
    [prevTokens]
  );

  const costPerAcquisition = purchaseCount > 0 ? (costBrl / purchaseCount).toFixed(2) : "—";

  // Meta Ads KPIs
  const costPerCheckoutAds = totalAdSpend > 0 && checkoutCount > 0 ? (totalAdSpend / checkoutCount).toFixed(2) : "—";
  const costPerConversationAds = totalAdSpend > 0 && totalConversations > 0 ? (totalAdSpend / totalConversations).toFixed(2) : "—";
  const cpaAds = totalAdSpend > 0 && purchaseCount > 0 ? (totalAdSpend / purchaseCount).toFixed(2) : "—";

  // Variations
  const convCurr = countInRange(allConvs, dateRange.from, dateRange.to);
  const convPrev = countInRange(allConvs, prevRange.from, prevRange.to);
  const qualCurr = countInRange(allConvs, dateRange.from, dateRange.to, (c) => c.lead_stage === "qualificado");
  const qualPrev = countInRange(allConvs, prevRange.from, prevRange.to, (c) => c.lead_stage === "qualificado");
  const closedCurr = countInRange(allConvs, dateRange.from, dateRange.to, (c) => c.lead_stage === "fechado");
  const closedPrev = countInRange(allConvs, prevRange.from, prevRange.to, (c) => c.lead_stage === "fechado");

  // Sparklines
  const convSpark = buildDailyBucketsRange(allConvs, dateRange.from, dateRange.to);
  const qualSpark = buildDailyBucketsRange(allConvs, dateRange.from, dateRange.to, (c) => c.lead_stage === "qualificado");
  const closedSpark = buildDailyBucketsRange(allConvs, dateRange.from, dateRange.to, (c) => c.lead_stage === "fechado");
  const revenueSpark = buildDailyValueBuckets(purchases, dateRange.from, dateRange.to);
  const purchaseSpark = buildDailyBucketsRange(purchases as any, dateRange.from, dateRange.to);

  // Profit calculation: Revenue - Ads - AI Cost
  const profit = totalRevenue - totalAdSpend - costBrl;
  const prevProfit = prevRevenue - prevCostBrl;
  const profitVariation = calcVariation(profit, prevProfit);

  // Profit sparkline (revenue per day - cost IA per day - ads rateado per day)
  const costSpark = useMemo(() => {
    const days = differenceInDays(dateRange.to, dateRange.from) + 1;
    const buckets: number[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(dateRange.from);
      d.setDate(d.getDate() + i);
      const dayStr = d.toDateString();
      buckets.push(
        filteredTokens
          .filter((t) => new Date(t.created_at).toDateString() === dayStr)
          .reduce((sum, t) => sum + Number(t.cost_usd || 0), 0) * USD_TO_BRL
      );
    }
    return buckets;
  }, [filteredTokens, dateRange]);

  const adSparkDaily = periodDays > 0 ? totalAdSpend / periodDays : 0;
  const profitSpark = revenueSpark.map((rev, i) => rev - (costSpark[i] || 0) - adSparkDaily);

  // Funnel data from all conversations (not just filtered, to show overall pipeline state)
  const funnelData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of FUNNEL_STAGES) counts[s.key] = 0;
    for (const c of filteredConvs) {
      const stage = c.lead_stage || "novo";
      if (counts[stage] !== undefined) counts[stage]++;
      else counts["novo"]++;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return FUNNEL_STAGES.map((s) => ({
      ...s,
      count: counts[s.key],
      pct: total > 0 ? ((counts[s.key] / total) * 100).toFixed(1) : "0",
    }));
  }, [filteredConvs]);

  const primaryKpis = [
    { label: "Conversas", value: totalConversations, icon: MessageSquare, variation: calcVariation(convCurr, convPrev), sparkData: convSpark, accent: "primary" },
    { label: "Qualificados", value: qualifiedLeads, icon: Users, variation: calcVariation(qualCurr, qualPrev), sparkData: qualSpark, accent: "info" },
    { label: "Taxa de Conversão", value: `${conversionRate}%`, icon: TrendingUp, variation: calcVariation(closedCurr, closedPrev), sparkData: closedSpark, accent: "success" },
    { label: "Vendas", value: purchaseCount, icon: ShoppingCart, variation: calcVariation(purchaseCount, prevPurchases.length), sparkData: purchaseSpark, accent: "success" },
    { label: "Receita Total", value: `R$ ${totalRevenue.toFixed(2)}`, icon: DollarSign, variation: calcVariation(totalRevenue, prevRevenue), sparkData: revenueSpark, accent: "warning" },
    { label: "Lucro", value: `R$ ${profit.toFixed(2)}`, icon: Coins, variation: profitVariation, sparkData: profitSpark, accent: profit >= 0 ? "success" : "destructive" },
  ];

  const msgSpark = buildDailyBucketsRange(allMsgs, dateRange.from, dateRange.to);
  const lostSpark = buildDailyBucketsRange(allConvs, dateRange.from, dateRange.to, (c) => c.lead_stage === "perdido");
  const prevMsgs = countInRange(allMsgs, prevRange.from, prevRange.to);
  const currMsgs = countInRange(allMsgs, dateRange.from, dateRange.to);
  const lostCurr = countInRange(allConvs, dateRange.from, dateRange.to, (c) => c.lead_stage === "perdido");
  const lostPrev = countInRange(allConvs, prevRange.from, prevRange.to, (c) => c.lead_stage === "perdido");

  const secondaryKpis = [
    { label: "Mensagens", value: totalMessages, icon: MessageSquare, variation: calcVariation(currMsgs, prevMsgs), sparkData: msgSpark, accent: "primary" },
    { label: "Fechados", value: closedLeads, icon: Target, variation: calcVariation(closedCurr, closedPrev), sparkData: closedSpark, accent: "success" },
    { label: "Perdidos", value: lostLeads, icon: XCircle, variation: calcVariation(lostCurr, lostPrev), sparkData: lostSpark, accent: "destructive" },
    { label: "Checkouts Iniciados", value: checkoutCount, icon: ShoppingCart, variation: calcVariation(checkoutCount, prevCheckoutCount), sparkData: [] as number[], accent: "primary" },
    { label: "Checkout → Compra", value: `${checkoutToSaleRate}%`, icon: CreditCard, variation: 0, sparkData: [] as number[], accent: "info" },
    { label: "Ticket Médio", value: `R$ ${avgTicket}`, icon: Receipt, variation: 0, sparkData: [] as number[], accent: "success" },
    { label: "Gasto em Ads", value: totalAdSpend > 0 ? `R$ ${totalAdSpend.toFixed(2)}` : "—", icon: Megaphone, variation: 0, sparkData: [] as number[], accent: "warning" },
    { label: "Custo/Checkout (Ads)", value: costPerCheckoutAds !== "—" ? `R$ ${costPerCheckoutAds}` : "—", icon: ShoppingCart, variation: 0, sparkData: [] as number[], accent: "warning" },
    { label: "Custo/Conversa (Ads)", value: costPerConversationAds !== "—" ? `R$ ${costPerConversationAds}` : "—", icon: MessageSquare, variation: 0, sparkData: [] as number[], accent: "info" },
    { label: "CPA Geral (Ads)", value: cpaAds !== "—" ? `R$ ${cpaAds}` : "—", icon: Rocket, variation: 0, sparkData: [] as number[], accent: "destructive" },
    { label: "CPA (Custo IA)", value: `R$ ${costPerAcquisition}`, icon: Brain, variation: 0, sparkData: [] as number[], accent: "primary" },
  ];

  const costBreakdown = [
    { label: "Chat", cost: (byType.chat?.cost_usd || 0) + (byType.chat_retry?.cost_usd || 0), icon: Brain, accent: "primary" },
    { label: "Teste", cost: byType.test?.cost_usd || 0, icon: FlaskConical, accent: "info" },
    { label: "Memória", cost: byType.memory?.cost_usd || 0, icon: Brain, accent: "warning" },
    { label: "Resumo", cost: byType.summary?.cost_usd || 0, icon: Brain, accent: "muted-foreground" },
  ];

  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const chartData = Array.from({ length: periodDays }, (_, i) => {
    const d = new Date(dateRange.from);
    d.setDate(d.getDate() + i);
    const dayStr = periodDays <= 7
      ? dayNames[d.getDay()]
      : format(d, "dd/MM");
    const dateKey = d.toISOString().split("T")[0];
    const count = filteredConvs.filter(
      (c) => new Date(c.created_at).toDateString() === d.toDateString()
    ).length;
    const dayCost = tokenByDay?.[dateKey]?.cost_usd
      ? Number((tokenByDay[dateKey].cost_usd * USD_TO_BRL).toFixed(2))
      : 0;
    return { day: dayStr, conversas: count, custo: dayCost };
  });

  const stageColors: Record<string, string> = {
    novo: "bg-muted text-muted-foreground",
    qualificado: "bg-info/10 text-info border-info/20",
    proposta: "bg-warning/10 text-warning border-warning/20",
    fechado: "bg-success/10 text-success border-success/20",
    perdido: "bg-destructive/10 text-destructive border-destructive/20",
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
            <Loader2 className="h-8 w-8 animate-spin text-primary relative" />
          </div>
          <p className="text-sm text-muted-foreground animate-pulse">Carregando dados...</p>
        </div>
      </div>
    );
  }

  const maxFunnelCount = Math.max(...funnelData.map((f) => f.count), 1);

  return (
    <div className="space-y-6">
      {/* Header + Date Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          </div>
          <div className="flex h-2 w-2 rounded-full bg-success animate-pulse" />
          <Badge variant="outline" className="border-success/30 text-success text-[10px] font-medium bg-success/5 rounded-full px-2.5">
            Live
          </Badge>
        </div>
        <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1 backdrop-blur-sm">
          {PRESETS.map((p) => (
            <Button
              key={p.days}
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 px-4 text-xs rounded-lg transition-all",
                selectedPreset === p.days && !customRange
                  ? "bg-background shadow-sm text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => handlePreset(p.days)}
            >
              {p.label}
            </Button>
          ))}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 px-3 text-xs gap-1.5 rounded-lg transition-all",
                  customRange?.from && customRange?.to
                    ? "bg-background shadow-sm text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {customRange?.from && customRange?.to
                  ? `${format(customRange.from, "dd/MM")} – ${format(customRange.to, "dd/MM")}`
                  : "Personalizado"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={customRange}
                onSelect={handleCustomSelect}
                numberOfMonths={2}
                disabled={(date) => date > new Date()}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Primary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {primaryKpis.map((m, i) => (
          <KpiCard key={m.label} {...m} subtitle={periodLabel} delay={i * 80} />
        ))}
      </div>

      {/* Last Payment */}
      {lastPayment && (
        <Card className="relative overflow-hidden border border-border/40 bg-card/80 backdrop-blur-sm shadow-md hover:shadow-xl transition-all duration-500 animate-fade-in-up" style={{ borderLeft: "3px solid hsl(var(--success))", background: "linear-gradient(135deg, hsl(var(--success) / 0.06) 0%, transparent 60%)", animationDelay: "320ms", animationFillMode: "backwards" }}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg" style={{ background: "linear-gradient(135deg, hsl(var(--success)), hsl(var(--success) / 0.8))", boxShadow: "0 4px 14px -3px hsl(var(--success) / 0.5)" }}>
              <DollarSign className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-0.5">Último pagamento</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-xl font-bold" style={{ color: "hsl(var(--success))" }}>
                  R$ {Number(lastPayment.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
                <span className="text-sm font-medium truncate">{lastPayment.contact_name || "—"}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                {lastPayment.contact_phone && <span>{lastPayment.contact_phone}</span>}
                <span>{formatDistanceToNow(new Date(lastPayment.created_at), { addSuffix: true, locale: ptBR })}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Secondary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {secondaryKpis.map((m, i) => (
          <KpiCard key={m.label} {...m} subtitle={periodLabel} delay={(i + 4) * 80} />
        ))}
      </div>

      {/* Sales Funnel */}
      <Card className="relative overflow-hidden border border-border/40 bg-card/80 backdrop-blur-sm shadow-md hover:shadow-xl transition-all duration-500 animate-fade-in-up" style={{ borderLeft: "3px solid hsl(var(--success))", background: "linear-gradient(135deg, hsl(var(--success) / 0.08) 0%, transparent 60%)", animationDelay: "400ms", animationFillMode: "backwards" }}>
        <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ boxShadow: "0 4px 25px -5px hsl(var(--success) / 0.2)" }} />
        <CardContent className="p-6">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="h-11 w-11 rounded-xl flex items-center justify-center shadow-lg" style={{ background: "linear-gradient(135deg, hsl(var(--success)), hsl(var(--success) / 0.8))", boxShadow: "0 4px 14px -3px hsl(var(--success) / 0.5)" }}>
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold">Funil de Vendas</p>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">{periodLabel}</p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-[3px]">
            {(() => {
              const mainStages = funnelData.filter(s => s.key !== "perdido");
              const lostStage = funnelData.find(s => s.key === "perdido");
              const widths = [100, 80, 60, 42];

              return (
                <>
                  {mainStages.map((stage, i) => {
                    const topW = widths[i] ?? 30;
                    const botW = widths[i + 1] ?? topW * 0.7;
                    const topLeft = (100 - topW) / 2;
                    const topRight = topLeft + topW;
                    const botLeft = (100 - botW) / 2;
                    const botRight = botLeft + botW;
                    const clipPath = `polygon(${topLeft}% 0%, ${topRight}% 0%, ${botRight}% 100%, ${botLeft}% 100%)`;

                    const nextStage = i < mainStages.length - 1 ? mainStages[i + 1] : null;
                    const passRate = nextStage && stage.count > 0
                      ? ((nextStage.count / stage.count) * 100).toFixed(0)
                      : null;

                    return (
                      <div key={stage.key} className="w-full flex flex-col items-center">
                        <div
                          className="group/funnel-item w-full flex items-center justify-center cursor-pointer transition-all duration-300 hover:brightness-110 hover:scale-x-[1.02]"
                          style={{
                            clipPath,
                            height: "54px",
                            background: stage.gradient,
                            boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.15), inset 0 -2px 4px -2px rgba(0,0,0,0.2)`,
                          }}
                        >
                          <div className="flex items-center gap-2" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>
                            <span className="font-mono text-base font-bold text-white">{stage.count}</span>
                            <span className="text-xs font-semibold text-white">{stage.label}</span>
                            <span className="text-[10px] text-white/60 font-mono">({stage.pct}%)</span>
                          </div>
                        </div>
                        {passRate && (
                          <div className="flex items-center gap-1.5 py-1">
                            <div className="h-5 w-5 rounded-full bg-muted/80 flex items-center justify-center">
                              <ArrowDown className="h-3 w-3 text-muted-foreground" />
                            </div>
                            <span className="text-[10px] font-semibold text-muted-foreground/80 bg-muted/50 px-2 py-0.5 rounded-full">{passRate}% avançam</span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {lostStage && lostStage.count > 0 && (
                    <div
                      className="mt-4 px-4 py-2.5 rounded-lg border border-dashed border-destructive/40 flex items-center gap-2.5 animate-pulse"
                      style={{
                        background: lostStage.gradient,
                        animationDuration: "3s",
                      }}
                    >
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span className="text-xs font-semibold text-destructive">{lostStage.count} {lostStage.label}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">({lostStage.pct}%)</span>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      {/* Revenue Daily Chart */}
      <Card className="border border-border/40 bg-card/80 backdrop-blur-sm shadow-md hover:shadow-xl transition-all duration-500 animate-fade-in-up" style={{ borderLeft: "3px solid hsl(var(--warning))", background: "linear-gradient(135deg, hsl(var(--warning) / 0.08) 0%, transparent 60%)", animationDelay: "450ms", animationFillMode: "backwards" }}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="h-11 w-11 rounded-xl flex items-center justify-center shadow-lg" style={{ background: "linear-gradient(135deg, hsl(var(--warning)), hsl(var(--warning) / 0.8))", boxShadow: "0 4px 14px -3px hsl(var(--warning) / 0.5)" }}>
                <DollarSign className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold">Receita Diária</p>
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">{periodLabel}</p>
              </div>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueSpark.map((v, i) => {
                const d = new Date(dateRange.from);
                d.setDate(d.getDate() + i);
                return { day: periodDays <= 7 ? dayNames[d.getDay()] : format(d, "dd/MM"), receita: v };
              })}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--warning))" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="hsl(var(--warning))" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "12px",
                    color: "hsl(var(--foreground))",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "12px",
                    boxShadow: "0 8px 32px -8px hsl(var(--foreground) / 0.1)",
                  }}
                  formatter={(value: number) => [`R$ ${value.toFixed(2)}`, "Receita"]}
                />
                <Area type="monotone" dataKey="receita" stroke="hsl(var(--warning))" strokeWidth={2.5} fill="url(#revenueGrad)" dot={{ r: 3, fill: "hsl(var(--warning))", strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Bottom row: Cost card + Chart */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Cost card */}
        <Card className="relative overflow-hidden border border-border/40 bg-card/80 backdrop-blur-sm shadow-md hover:shadow-xl transition-all duration-500 lg:col-span-3 animate-fade-in-up" style={{ borderLeft: "3px solid hsl(var(--primary))", background: "linear-gradient(135deg, hsl(var(--primary) / 0.08) 0%, transparent 60%)", animationDelay: "500ms", animationFillMode: "backwards" }}>
          <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full opacity-[0.06]" style={{ background: "radial-gradient(circle, hsl(var(--primary)), transparent)" }} />
          <CardContent className="p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="h-11 w-11 rounded-xl flex items-center justify-center shadow-lg" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8))", boxShadow: "0 4px 14px -3px hsl(var(--primary) / 0.5)" }}>
                <Coins className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold">Custo IA Total</p>
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">{periodLabel}</p>
              </div>
            </div>

            <div className="mb-6">
              <div className="text-4xl font-bold font-mono tracking-tight text-primary">
                R$ {costBrl.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {totalTokensFiltered.toLocaleString("pt-BR")} tokens
              </p>
            </div>

            <div className="space-y-2.5">
              {costBreakdown.map((item) => {
                const pct = costBrl > 0 ? ((item.cost * USD_TO_BRL) / costBrl) * 100 : 0;
                return (
                  <div key={item.label} className="group">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <item.icon className={`h-3.5 w-3.5 text-${item.accent}`} />
                        <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                      </div>
                      <span className="text-xs font-bold font-mono">R$ {(item.cost * USD_TO_BRL).toFixed(2)}</span>
                    </div>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-${item.accent} transition-all duration-700`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Chart */}
        <Card className="border border-border/40 bg-card/80 backdrop-blur-sm shadow-md hover:shadow-xl transition-all duration-500 lg:col-span-5 animate-fade-in-up" style={{ borderLeft: "3px solid hsl(var(--info))", background: "linear-gradient(135deg, hsl(var(--info) / 0.08) 0%, transparent 60%)", animationDelay: "600ms", animationFillMode: "backwards" }}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center shadow-lg" style={{ background: "linear-gradient(135deg, hsl(var(--info)), hsl(var(--info) / 0.8))", boxShadow: "0 4px 14px -3px hsl(var(--info) / 0.5)" }}>
                  <BarChart3 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Conversas & Custo</p>
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">{periodLabel}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-sm bg-primary" />
                  Conversas
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-[2px] w-3 bg-destructive rounded-full" />
                  Custo IA
                </div>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "12px",
                      color: "hsl(var(--foreground))",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "12px",
                      boxShadow: "0 8px 32px -8px hsl(var(--foreground) / 0.1)",
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === "custo") return [`R$ ${value.toFixed(2)}`, "Custo IA"];
                      return [value, "Conversas"];
                    }}
                  />
                  <Bar yAxisId="left" dataKey="conversas" fill="url(#barGrad)" radius={[8, 8, 0, 0]} barSize={periodDays > 15 ? 12 : 28} />
                  <Line yAxisId="right" type="monotone" dataKey="custo" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3, fill: "hsl(var(--destructive))", strokeWidth: 0 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Cloud Usage Card */}
        <Card className="relative overflow-hidden border border-border/40 bg-card/80 backdrop-blur-sm shadow-md hover:shadow-xl transition-all duration-500 lg:col-span-4 animate-fade-in-up" style={{ borderLeft: "3px solid hsl(var(--info))", background: "linear-gradient(135deg, hsl(var(--info) / 0.08) 0%, transparent 60%)", animationDelay: "700ms", animationFillMode: "backwards" }}>
          <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full opacity-[0.06]" style={{ background: "radial-gradient(circle, hsl(var(--info)), transparent)" }} />
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center shadow-lg" style={{ background: "linear-gradient(135deg, hsl(var(--info)), hsl(var(--info) / 0.8))", boxShadow: "0 4px 14px -3px hsl(var(--info) / 0.5)" }}>
                  <Cloud className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Uso Cloud</p>
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">Lovable Cloud</p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-semibold px-2.5 py-0.5 rounded-full border-0",
                  (cloudUsage?.estimatedDbMb || 0) < 400
                    ? "text-success bg-success/10"
                    : "text-warning bg-warning/10"
                )}
              >
              {(() => {
                const dbCost = Math.max(0, ((cloudUsage?.estimatedDbMb || 0) - 500) / 1024) * 0.125;
                const edgeCost = Math.max(0, ((cloudUsage?.edgeCalls || 0) - 500000) / 1000000) * 2.00;
                const totalCost = dbCost + edgeCost;
                return totalCost > 0 ? `$ ${totalCost.toFixed(2)}` : "Free Tier";
              })()}
              </Badge>
            </div>

            {cloudUsage ? (
              (() => {
                const dbCostUsd = Math.max(0, (cloudUsage.estimatedDbMb - 500) / 1024) * 0.125;
                const edgeCostUsd = Math.max(0, (cloudUsage.edgeCalls - 500000) / 1000000) * 2.00;
                const totalCostUsd = dbCostUsd + edgeCostUsd;
                return (
              <div className="space-y-4">
                {/* DB Size */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Database className="h-3.5 w-3.5 text-info" />
                      <span className="text-xs font-medium text-muted-foreground">Banco de Dados</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono">
                        {cloudUsage.estimatedDbMb < 1
                          ? `${(cloudUsage.estimatedDbMb * 1024).toFixed(0)} KB`
                          : `${cloudUsage.estimatedDbMb} MB`}
                      </span>
                      <span className={`text-[10px] font-mono ${dbCostUsd > 0 ? "text-warning font-bold" : "text-muted-foreground/60"}`}>
                        $ {dbCostUsd.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <Progress value={Math.min((cloudUsage.estimatedDbMb / 500) * 100, 100)} className="h-1.5" />
                  <p className="text-[9px] text-muted-foreground/50 mt-0.5">de 500 MB (Free Tier)</p>
                </div>

                {/* Total Rows */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-medium text-muted-foreground">Total de Registros</span>
                    </div>
                    <span className="text-xs font-bold font-mono">
                      {cloudUsage.totalRows.toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 rounded-full">
                      💬 {cloudUsage.breakdown.messages.toLocaleString("pt-BR")} msgs
                    </Badge>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 rounded-full">
                      👥 {cloudUsage.breakdown.conversations} convs
                    </Badge>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 rounded-full">
                      🧠 {cloudUsage.breakdown.memories} memórias
                    </Badge>
                  </div>
                </div>

                {/* Edge Function Calls */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Server className="h-3.5 w-3.5 text-warning" />
                      <span className="text-xs font-medium text-muted-foreground">Chamadas IA</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono">
                        {cloudUsage.edgeCalls.toLocaleString("pt-BR")}
                      </span>
                      <span className={`text-[10px] font-mono ${edgeCostUsd > 0 ? "text-warning font-bold" : "text-muted-foreground/60"}`}>
                        $ {edgeCostUsd.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <Progress value={Math.min((cloudUsage.edgeCalls / 500000) * 100, 100)} className="h-1.5" />
                  <p className="text-[9px] text-muted-foreground/50 mt-0.5">de 500K (Free Tier)</p>
                </div>

                {/* Total Cost */}
                <div className="border-t border-border/50 pt-3 mt-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-3.5 w-3.5 text-success" />
                      <span className="text-xs font-semibold">Custo Estimado</span>
                    </div>
                    <span className={`text-sm font-bold font-mono ${totalCostUsd > 0 ? "text-warning" : "text-success"}`}>
                      $ {totalCostUsd.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[9px] text-muted-foreground/50 mt-0.5 text-right">
                    {totalCostUsd === 0 ? "Dentro do Free Tier ✅" : "Custo excedente mensal"}
                  </p>
                </div>
              </div>
                );
              })()
            ) : (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent conversations */}
      <Card className="border-0 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-xl transition-all duration-500 animate-fade-in-up" style={{ borderLeft: "3px solid hsl(var(--primary))", background: "linear-gradient(135deg, hsl(var(--primary) / 0.05) 0%, transparent 60%)", animationDelay: "800ms", animationFillMode: "backwards" }}>
        <CardContent className="p-6">
          <div className="flex items-center gap-2.5 mb-4">
              <div className="h-11 w-11 rounded-xl flex items-center justify-center shadow-lg" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8))", boxShadow: "0 4px 14px -3px hsl(var(--primary) / 0.5)" }}>
                <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold">Conversas Recentes</p>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">{periodLabel}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {filteredConvs.slice(0, 5).map((c, i) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl p-3.5 transition-all hover:bg-accent/50 group cursor-default"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-xs font-bold ring-1 ring-primary/10">
                    {c.contact_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium group-hover:text-primary transition-colors">{c.contact_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        {c.channel === "whatsapp" ? "WhatsApp" : "Web"}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] px-1.5 py-0 rounded-full font-medium h-4",
                          stageColors[c.lead_stage] || stageColors.novo
                        )}
                      >
                        {c.lead_stage}
                      </Badge>
                    </div>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">
                  {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
            ))}
            {filteredConvs.length === 0 && (
              <div className="py-10 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma conversa no período</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
