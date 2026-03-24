import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCloudUsageStats, fetchAllTokenUsage } from "@/lib/supabase-helpers";
import { formatCostBRL, formatCostUSD } from "@/lib/ai-costs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";
import { Coins, Brain, Cloud, TrendingUp, Zap, MessageSquare, Database, Server, Activity } from "lucide-react";

const BRL_RATE = 5.20;

const PERIOD_OPTIONS = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "15d", label: "15 dias" },
  { value: "30d", label: "30 dias" },
  { value: "all", label: "Tudo" },
];

function getStartDate(period: string): Date | null {
  if (period === "all") return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (period === "today") return now;
  const days = parseInt(period);
  now.setDate(now.getDate() - days);
  return now;
}

const TYPE_LABELS: Record<string, string> = {
  chat: "Chat",
  chat_retry: "Chat",
  test: "Teste",
  memory: "Memória",
  summary: "Resumo",
};

const TYPE_ICONS: Record<string, typeof MessageSquare> = {
  Chat: MessageSquare,
  Teste: Zap,
  Memória: Brain,
  Resumo: Activity,
};

export default function CostsPage() {
  const [period, setPeriod] = useState("30d");

  // Fetch token_usage rows filtered by period (server-side)
  const { data: filteredRows = [] } = useQuery({
    queryKey: ["costs-token-usage", period],
    queryFn: async () => {
      const start = getStartDate(period);
      return fetchAllTokenUsage(start ? start.toISOString() : undefined);
    },
  });

  // Fetch conversations for top-cost mapping
  const { data: conversations = [] } = useQuery({
    queryKey: ["costs-conversations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, contact_name, contact_phone");
      if (error) throw error;
      return data || [];
    },
  });

  // Cloud usage
  const { data: cloudStats } = useQuery({
    queryKey: ["costs-cloud"],
    queryFn: getCloudUsageStats,
  });


  const totalCostUsd = filteredRows.reduce((s, r) => s + Number(r.cost_usd || 0), 0);
  const totalTokens = filteredRows.reduce((s, r) => s + (r.total_tokens || 0), 0);
  const uniqueConvs = new Set(filteredRows.filter((r) => r.conversation_id).map((r) => r.conversation_id)).size;
  const avgCostPerConv = uniqueConvs > 0 ? totalCostUsd / uniqueConvs : 0;

  // Breakdown by type (merge chat + chat_retry)
  const byType = useMemo(() => {
    const map: Record<string, { tokens: number; cost: number; count: number }> = {};
    for (const r of filteredRows) {
      const label = TYPE_LABELS[r.usage_type || "chat"] || "Chat";
      if (!map[label]) map[label] = { tokens: 0, cost: 0, count: 0 };
      map[label].tokens += r.total_tokens || 0;
      map[label].cost += Number(r.cost_usd || 0);
      map[label].count += 1;
    }
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.cost - a.cost);
  }, [filteredRows]);

  // Breakdown by model
  const byModel = useMemo(() => {
    const map: Record<string, { tokens: number; cost: number; count: number }> = {};
    for (const r of filteredRows) {
      const m = r.model || "gpt-4o-mini";
      if (!map[m]) map[m] = { tokens: 0, cost: 0, count: 0 };
      map[m].tokens += r.total_tokens || 0;
      map[m].cost += Number(r.cost_usd || 0);
      map[m].count += 1;
    }
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.cost - a.cost);
  }, [filteredRows]);

  // Top 5 conversations by cost
  const topConversations = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of filteredRows) {
      if (!r.conversation_id) continue;
      map[r.conversation_id] = (map[r.conversation_id] || 0) + Number(r.cost_usd || 0);
    }
    const convMap = new Map(conversations.map((c) => [c.id, c]));
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, cost]) => {
        const conv = convMap.get(id);
        return { id, cost, name: conv?.contact_name || conv?.contact_phone || id.slice(0, 8) };
      });
  }, [filteredRows, conversations]);

  // Daily chart data
  const dailyData = useMemo(() => {
    const map: Record<string, { cost: number; tokens: number }> = {};
    for (const r of filteredRows) {
      const day = new Date(r.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      if (!map[day]) map[day] = { cost: 0, tokens: 0 };
      map[day].cost += Number(r.cost_usd || 0);
      map[day].tokens += r.total_tokens || 0;
    }
    return Object.entries(map).map(([day, v]) => ({ day, cost_brl: v.cost * BRL_RATE, tokens: v.tokens }));
  }, [filteredRows]);

  const maxTypeCost = Math.max(...byType.map((t) => t.cost), 0.001);

  // Cloud stats
  const dbUsedMb = cloudStats?.estimatedDbMb || 0;
  const dbLimitMb = 500;
  const dbPercent = Math.min((dbUsedMb / dbLimitMb) * 100, 100);
  const edgeCalls = cloudStats?.edgeCalls || 0;
  const edgeLimit = 500_000;
  const edgePercent = Math.min((edgeCalls / edgeLimit) * 100, 100);

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Coins className="h-6 w-6 text-primary" />
            Custos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Monitoramento de gastos com IA e infraestrutura</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="ai" className="space-y-6">
        <TabsList>
          <TabsTrigger value="ai" className="flex items-center gap-2">
            <Brain className="h-4 w-4" /> Gastos IA
          </TabsTrigger>
          <TabsTrigger value="cloud" className="flex items-center gap-2">
            <Cloud className="h-4 w-4" /> Gastos Cloud
          </TabsTrigger>
        </TabsList>

        {/* ===== AI TAB ===== */}
        <TabsContent value="ai" className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Coins className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Custo Total</p>
                    <p className="text-xl font-bold text-foreground">{formatCostBRL(totalCostUsd)}</p>
                    <p className="text-[10px] text-muted-foreground">{formatCostUSD(totalCostUsd)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10">
                    <Zap className="h-5 w-5 text-info" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Tokens</p>
                    <p className="text-xl font-bold text-foreground">{(totalTokens / 1000).toFixed(1)}K</p>
                    <p className="text-[10px] text-muted-foreground">{filteredRows.length} chamadas</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                    <MessageSquare className="h-5 w-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Custo/Conversa</p>
                    <p className="text-xl font-bold text-foreground">{formatCostBRL(avgCostPerConv)}</p>
                    <p className="text-[10px] text-muted-foreground">{uniqueConvs} conversas</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                    <TrendingUp className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Custo/Dia (média)</p>
                    <p className="text-xl font-bold text-foreground">
                      {dailyData.length > 0 ? formatCostBRL(totalCostUsd / dailyData.length) : "R$ 0,00"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{dailyData.length} dias</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chart + Breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Daily chart */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Custo Diário (R$)</CardTitle>
              </CardHeader>
              <CardContent>
                {dailyData.length > 0 ? (
                  <ChartContainer config={{ cost_brl: { label: "Custo R$", color: "hsl(var(--primary))" } }} className="h-[260px] w-full">
                    <AreaChart data={dailyData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                      <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `R$${v.toFixed(2)}`} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area type="monotone" dataKey="cost_brl" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} />
                    </AreaChart>
                  </ChartContainer>
                ) : (
                  <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">Sem dados no período</div>
                )}
              </CardContent>
            </Card>

            {/* Breakdown by type */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Por Tipo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {byType.map((t) => {
                  const Icon = TYPE_ICONS[t.name] || MessageSquare;
                  return (
                    <div key={t.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-foreground font-medium">{t.name}</span>
                        </div>
                        <span className="text-muted-foreground">{formatCostBRL(t.cost)}</span>
                      </div>
                      <Progress value={(t.cost / maxTypeCost) * 100} className="h-2" />
                      <p className="text-[10px] text-muted-foreground">{t.count} chamadas · {(t.tokens / 1000).toFixed(1)}K tokens</p>
                    </div>
                  );
                })}
                {byType.length === 0 && <p className="text-sm text-muted-foreground">Sem dados</p>}
              </CardContent>
            </Card>
          </div>

          {/* Model breakdown + Top conversations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By model */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Por Modelo</CardTitle>
              </CardHeader>
              <CardContent>
                {byModel.length > 0 ? (
                  <ChartContainer config={Object.fromEntries(byModel.map((m, i) => [m.name, { label: m.name, color: `hsl(var(--chart-${i + 1}))` }]))} className="h-[220px] w-full">
                    <BarChart data={byModel} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v * BRL_RATE).toFixed(2)}`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
                )}
                <div className="mt-3 space-y-2">
                  {byModel.map((m) => (
                    <div key={m.name} className="flex items-center justify-between text-xs">
                      <span className="text-foreground font-medium">{m.name}</span>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <span>{m.count} calls</span>
                        <span>{formatCostBRL(m.cost)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top conversations */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top 5 Conversas Mais Caras</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topConversations.map((c, i) => (
                    <div key={c.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="w-6 h-6 flex items-center justify-center text-xs p-0">
                          {i + 1}
                        </Badge>
                        <span className="text-sm text-foreground font-medium truncate max-w-[200px]">{c.name}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-foreground">{formatCostBRL(c.cost)}</p>
                        <p className="text-[10px] text-muted-foreground">{formatCostUSD(c.cost)}</p>
                      </div>
                    </div>
                  ))}
                  {topConversations.length === 0 && <p className="text-sm text-muted-foreground">Sem dados no período</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== CLOUD TAB ===== */}
        <TabsContent value="cloud" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* DB Size */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary" /> Banco de Dados
                </CardTitle>
                <CardDescription>Uso estimado vs Free Tier (500 MB)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tamanho estimado</span>
                    <span className="text-foreground font-bold">{dbUsedMb} MB / {dbLimitMb} MB</span>
                  </div>
                  <Progress value={dbPercent} className="h-3" />
                  <p className="text-xs text-muted-foreground">{dbPercent.toFixed(1)}% utilizado</p>
                </div>

                <div className="space-y-2 pt-2 border-t border-border/50">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Registros por Tabela</p>
                  {cloudStats && Object.entries(cloudStats.breakdown).map(([table, count]) => (
                    <div key={table} className="flex justify-between text-xs">
                      <span className="text-muted-foreground capitalize">{table.replace(/([A-Z])/g, " $1")}</span>
                      <span className="text-foreground font-medium">{(count as number).toLocaleString("pt-BR")}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Edge Functions */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Server className="h-5 w-5 text-info" /> Edge Functions
                </CardTitle>
                <CardDescription>Chamadas de backend vs Free Tier (500K)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Chamadas registradas</span>
                    <span className="text-foreground font-bold">{edgeCalls.toLocaleString("pt-BR")} / 500K</span>
                  </div>
                  <Progress value={edgePercent} className="h-3" />
                  <p className="text-xs text-muted-foreground">{edgePercent.toFixed(2)}% utilizado</p>
                </div>

                <div className="space-y-3 pt-2 border-t border-border/50">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Custo Excedente Estimado</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">DB (excedente)</span>
                    <span className="text-foreground font-medium">
                      {dbUsedMb > dbLimitMb
                        ? `$${((dbUsedMb - dbLimitMb) * 0.125 / 1024).toFixed(2)}/mês`
                        : "Dentro do free tier"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Edge Fn (excedente)</span>
                    <span className="text-foreground font-medium">
                      {edgeCalls > edgeLimit
                        ? `$${((edgeCalls - edgeLimit) * 0.000002).toFixed(2)}/mês`
                        : "Dentro do free tier"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Total rows card */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Database className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total de Registros (todas as tabelas)</p>
                  <p className="text-2xl font-bold text-foreground">{(cloudStats?.totalRows || 0).toLocaleString("pt-BR")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
