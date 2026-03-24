import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Rocket, DollarSign, Eye, MousePointerClick, Target,
  TrendingUp, Users, BarChart3, Pause, Play, Edit2,
  Sparkles, Loader2, RefreshCw, AlertTriangle, ArrowUp, ArrowDown,
  Settings, CheckCircle2, XCircle,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar,
} from "recharts";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const FN_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/meta-ads`;

async function fetchMetaAds(action: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`${FN_URL}?${qs}`);
  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorMessage = payload?.error || "Failed to fetch Meta Ads data";
    const hint = payload?.hint ? ` ${payload.hint}` : "";
    throw new Error(`${errorMessage}${hint}`.trim());
  }

  return payload;
}

async function postMetaAds(action: string, body: Record<string, unknown>) {
  const res = await fetch(`${FN_URL}?action=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMessage = payload?.error || "Action failed";
    const hint = payload?.hint ? ` ${payload.hint}` : "";
    throw new Error(`${errorMessage}${hint}`.trim());
  }

  return payload;
}

function formatCurrency(val: number | string, prefix = "R$") {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return `${prefix} 0,00`;
  return `${prefix} ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(val: number | string) {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "0";
  return n.toLocaleString("pt-BR");
}

// ============ KPI Card ============
function KpiCard({ label, value, icon: Icon, accent = "primary", subtitle }: {
  label: string; value: string; icon: React.ElementType; accent?: string; subtitle?: string;
}) {
  const colorMap: Record<string, string> = {
    primary: "hsl(var(--primary))",
    info: "hsl(var(--info))",
    warning: "hsl(var(--warning))",
    success: "hsl(var(--success))",
    destructive: "hsl(var(--destructive))",
  };
  const c = colorMap[accent] || colorMap.primary;

  return (
    <Card
      className="relative overflow-hidden border border-border/50 bg-card/80 backdrop-blur-sm shadow-md hover:shadow-xl transition-all duration-500 hover:-translate-y-1 animate-fade-in-up"
      style={{ borderLeft: `3px solid ${c}`, background: `linear-gradient(135deg, ${c}10 0%, transparent 60%)` }}
    >
      <div className="absolute -top-16 -right-16 h-32 w-32 rounded-full opacity-[0.06]" style={{ background: `radial-gradient(circle, ${c}, transparent)` }} />
      <CardContent className="p-5 relative z-10">
        <div className="flex items-start justify-between mb-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl shadow-lg" style={{ background: `linear-gradient(135deg, ${c}, ${c}cc)`, boxShadow: `0 4px 14px -3px ${c}50` }}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
        <div className="text-3xl font-black tracking-tighter mb-1 font-mono">{value}</div>
        <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">{label}</p>
        {subtitle && <p className="text-[9px] text-muted-foreground/60 mt-1 uppercase tracking-widest">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

// ============ Main Page ============
export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const [budgetDialog, setBudgetDialog] = useState<{ id: string; name: string; current: string } | null>(null);
  const [newBudget, setNewBudget] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [configToken, setConfigToken] = useState("");
  const [configAccountId, setConfigAccountId] = useState("");
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [datePreset, setDatePreset] = useState("last_30d");

  const datePresetLabels: Record<string, string> = {
    today: "Hoje",
    yesterday: "Ontem",
    last_7d: "Últimos 7 dias",
    last_14d: "Últimos 14 dias",
    last_30d: "Últimos 30 dias",
    last_90d: "Últimos 90 dias",
  };

  // Fetch campaigns from Meta
  const campaignsQuery = useQuery({
    queryKey: ["meta-campaigns"],
    queryFn: () => fetchMetaAds("campaigns"),
    staleTime: 60_000,
    retry: false,
  });

  // Fetch account insights
  const accountInsightsQuery = useQuery({
    queryKey: ["meta-account-insights", datePreset],
    queryFn: () => fetchMetaAds("account_insights", { date_preset: datePreset }),
    staleTime: 60_000,
    retry: false,
  });

  // Fetch daily insights for chart
  const dailyInsightsQuery = useQuery({
    queryKey: ["meta-daily-insights", datePreset],
    queryFn: () => fetchMetaAds("insights", { time_increment: "1", date_preset: datePreset }),
    staleTime: 120_000,
    retry: false,
  });

  // Internal data
  const { data: adCreatives = [] } = useQuery({
    queryKey: ["ad-creatives-campaigns"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_creatives").select("*");
      return data || [];
    },
  });

  const { data: conversions = [] } = useQuery({
    queryKey: ["conversions-campaigns"],
    queryFn: async () => {
      const { data } = await supabase.from("conversions").select("*");
      return data || [];
    },
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations-campaigns"],
    queryFn: async () => {
      const { data } = await supabase.from("conversations").select("id, lead_stage, created_at");
      return data || [];
    },
  });

  // Pause/Activate mutation
  const toggleMutation = useMutation({
    mutationFn: ({ campaignId, action }: { campaignId: string; action: "pause" | "activate" }) =>
      postMetaAds(action, { campaign_id: campaignId }),
    onSuccess: (_, vars) => {
      toast.success(`Campanha ${vars.action === "pause" ? "pausada" : "ativada"} com sucesso`);
      queryClient.invalidateQueries({ queryKey: ["meta-campaigns"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Budget mutation
  const budgetMutation = useMutation({
    mutationFn: ({ campaignId, dailyBudget }: { campaignId: string; dailyBudget: number }) =>
      postMetaAds("budget", { campaign_id: campaignId, daily_budget: dailyBudget }),
    onSuccess: () => {
      toast.success("Orçamento atualizado com sucesso");
      setBudgetDialog(null);
      queryClient.invalidateQueries({ queryKey: ["meta-campaigns"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // AI Insights
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const generateAiInsights = async () => {
    setAiLoading(true);
    try {
      const result = await postMetaAds("ai_insights", {
        campaigns_data: {
          campaigns: campaignsQuery.data?.campaigns || [],
          account_insights: accountInsightsQuery.data?.insights || [],
        },
        internal_data: {
          total_leads: conversations.length,
          leads_by_stage: {
            novo: conversations.filter(c => c.lead_stage === "novo").length,
            qualificado: conversations.filter(c => c.lead_stage === "qualificado").length,
            proposta: conversations.filter(c => c.lead_stage === "proposta").length,
            fechado: conversations.filter(c => c.lead_stage === "fechado").length,
            perdido: conversations.filter(c => c.lead_stage === "perdido").length,
          },
          total_conversions: conversions.filter(c => c.event_name === "Purchase").length,
          total_revenue: conversions.filter(c => c.event_name === "Purchase").reduce((s, c) => s + Number(c.value || 0), 0),
          total_checkouts: conversions.filter(c => c.event_name === "InitiateCheckout").length,
          ad_creatives_count: adCreatives.length,
        },
      });
      setAiAnalysis(result.analysis);
    } catch (err: any) {
      toast.error("Erro ao gerar insights: " + err.message);
    } finally {
      setAiLoading(false);
    }
  };

  // Derived data
  const campaigns = campaignsQuery.data?.campaigns || [];
  const insights = accountInsightsQuery.data?.insights?.[0] || {};
  const dailyData = dailyInsightsQuery.data?.insights || [];

  const totalSpend = parseFloat(insights.spend || "0");
  const totalImpressions = parseInt(insights.impressions || "0");
  const totalClicks = parseInt(insights.clicks || "0");
  const avgCPC = parseFloat(insights.cpc || "0");
  const avgCPM = parseFloat(insights.cpm || "0");
  const avgCTR = parseFloat(insights.ctr || "0");
  const totalReach = parseInt(insights.reach || "0");

  // Internal KPIs
  const internalLeads = conversations.length;
  const internalConversions = conversions.filter(c => c.event_name === "Purchase").length;
  const internalRevenue = conversions.filter(c => c.event_name === "Purchase").reduce((s, c) => s + Number(c.value || 0), 0);
  const realCPA = internalConversions > 0 ? totalSpend / internalConversions : 0;
  const roi = totalSpend > 0 ? ((internalRevenue - totalSpend) / totalSpend * 100) : 0;

  // Chart data
  const chartData = dailyData.map((d: any) => ({
    date: d.date_start?.slice(5) || "",
    gasto: parseFloat(d.spend || "0"),
    impressoes: parseInt(d.impressions || "0"),
    cliques: parseInt(d.clicks || "0"),
  }));

  const handleTestConnection = async () => {
    if (!configToken.trim() || !configAccountId.trim()) {
      setTestResult({ success: false, message: "Preencha ambos os campos." });
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    try {
      const result = await postMetaAds("test_connection", {
        access_token: configToken.trim(),
        ad_account_id: configAccountId.trim(),
      });
      setTestResult({
        success: true,
        message: `✅ Conectado! Conta: ${result.account_name} (${result.account_id})`,
      });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTestLoading(false);
    }
  };

  const handleSaveCredentials = async () => {
    if (!configToken.trim() || !configAccountId.trim()) {
      toast.error("Preencha ambos os campos.");
      return;
    }
    setSaveLoading(true);
    try {
      // Upsert access_token
      await supabase.from("meta_settings" as any).upsert(
        { key: "access_token", value: configToken.trim(), updated_at: new Date().toISOString() } as any,
        { onConflict: "key" }
      );
      // Upsert ad_account_id
      await supabase.from("meta_settings" as any).upsert(
        { key: "ad_account_id", value: configAccountId.trim(), updated_at: new Date().toISOString() } as any,
        { onConflict: "key" }
      );
      toast.success("Credenciais salvas com sucesso!");
      setConfigOpen(false);
      queryClient.invalidateQueries({ queryKey: ["meta-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["meta-account-insights"] });
      queryClient.invalidateQueries({ queryKey: ["meta-daily-insights"] });
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const isLoading = campaignsQuery.isLoading || accountInsightsQuery.isLoading;
  const metaError = campaignsQuery.error || accountInsightsQuery.error || dailyInsightsQuery.error;
  const metaErrorMessage = metaError instanceof Error ? metaError.message : null;
  const isPermissionError = !!metaErrorMessage && (metaErrorMessage.includes("ads_management") || metaErrorMessage.includes("ads_read"));

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Rocket className="h-6 w-6 text-primary" />
            Otimizador de Campanhas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Integração Meta Ads + dados internos da plataforma
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={datePreset} onValueChange={setDatePreset}>
            <SelectTrigger className="w-[170px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(datePresetLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => { setConfigOpen(true); setTestResult(null); }}>
            <Settings className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => campaignsQuery.refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {metaErrorMessage && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-destructive">Falha ao conectar com Meta Ads</p>
                <p className="text-sm text-muted-foreground">{metaErrorMessage}</p>
                {isPermissionError && (
                  <ol className="list-decimal pl-5 text-xs text-muted-foreground space-y-1">
                    <li>Abra o app no Meta for Developers e revise o token usado.</li>
                    <li>Garanta as permissões <strong>ads_read</strong> ou <strong>ads_management</strong>.</li>
                    <li>Conceda acesso da conta de anúncios para o mesmo app/token.</li>
                    <li>Gere um novo token e atualize o secret <strong>META_ACCESS_TOKEN</strong>.</li>
                  </ol>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="campaigns">Campanhas</TabsTrigger>
          <TabsTrigger value="ai">Insights IA</TabsTrigger>
        </TabsList>

        {/* ====== TAB: OVERVIEW ====== */}
        <TabsContent value="overview" className="space-y-6">
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              {/* Meta Ads KPIs */}
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Meta Ads — {datePresetLabels[datePreset]}</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KpiCard label="Gasto Total" value={formatCurrency(totalSpend)} icon={DollarSign} accent="destructive" />
                  <KpiCard label="Impressões" value={formatNumber(totalImpressions)} icon={Eye} accent="info" />
                  <KpiCard label="Cliques" value={formatNumber(totalClicks)} icon={MousePointerClick} accent="primary" />
                  <KpiCard label="CTR" value={`${avgCTR.toFixed(2)}%`} icon={Target} accent="warning" />
                  <KpiCard label="CPC Médio" value={formatCurrency(avgCPC)} icon={MousePointerClick} accent="info" subtitle="Custo por clique" />
                  <KpiCard label="CPM" value={formatCurrency(avgCPM)} icon={BarChart3} accent="warning" subtitle="Custo por mil" />
                  <KpiCard label="Alcance" value={formatNumber(totalReach)} icon={Users} accent="success" />
                  <KpiCard label="Campanhas" value={String(campaigns.length)} icon={Rocket} accent="primary" />
                </div>
              </div>

              {/* Internal KPIs */}
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Resultados Internos</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KpiCard label="Leads Gerados" value={formatNumber(internalLeads)} icon={Users} accent="info" />
                  <KpiCard label="Conversões" value={formatNumber(internalConversions)} icon={TrendingUp} accent="success" />
                  <KpiCard label="Receita Total" value={formatCurrency(internalRevenue)} icon={DollarSign} accent="success" />
                  <KpiCard label="CPA Real" value={formatCurrency(realCPA)} icon={Target} accent="warning" subtitle="Custo por aquisição" />
                </div>
              </div>

              {/* ROI Card */}
              <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground font-semibold uppercase tracking-wider">ROI Real (Meta Ads vs Receita)</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className={`text-5xl font-black font-mono ${roi >= 0 ? "text-success" : "text-destructive"}`}>
                          {roi >= 0 ? "+" : ""}{roi.toFixed(1)}%
                        </span>
                        {roi >= 0 ? <ArrowUp className="h-8 w-8 text-success" /> : <ArrowDown className="h-8 w-8 text-destructive" />}
                      </div>
                    </div>
                    <div className="text-right text-sm text-muted-foreground space-y-1">
                      <p>Investido: <span className="font-mono font-bold text-foreground">{formatCurrency(totalSpend)}</span></p>
                      <p>Receita: <span className="font-mono font-bold text-success">{formatCurrency(internalRevenue)}</span></p>
                      <p>Lucro: <span className={`font-mono font-bold ${internalRevenue - totalSpend >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(internalRevenue - totalSpend)}
                      </span></p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Chart */}
              {chartData.length > 0 && (
                <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">Gasto Diário</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <Tooltip
                            contentStyle={{
                              background: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                              fontSize: 12,
                            }}
                            formatter={(value: number) => [formatCurrency(value), "Gasto"]}
                          />
                          <Area type="monotone" dataKey="gasto" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#spendGradient)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ====== TAB: CAMPAIGNS LIST ====== */}
        <TabsContent value="campaigns" className="space-y-4">
          {campaignsQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : campaigns.length === 0 ? (
            <Card className="border border-border/50 bg-card/80">
              <CardContent className="p-12 text-center">
                <AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">Nenhuma campanha encontrada</h3>
                <p className="text-muted-foreground text-sm">Verifique se o META_AD_ACCOUNT_ID está correto e se há campanhas na conta.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campanha</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Objetivo</TableHead>
                    <TableHead className="text-right">Orçamento Diário</TableHead>
                    <TableHead className="text-right">Leads Internos</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c: any) => {
                    const isActive = c.status === "ACTIVE";
                    const budget = c.daily_budget ? (parseInt(c.daily_budget) / 100) : null;
                    // Match internal leads by track_source
                    const matchedLeads = adCreatives.filter(
                      (ac: any) => ac.track_source?.toLowerCase().includes(c.name?.toLowerCase()?.slice(0, 15))
                    ).length;

                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium max-w-[200px] truncate">{c.name}</TableCell>
                        <TableCell>
                          <Badge variant={isActive ? "default" : "secondary"} className={isActive ? "bg-success text-success-foreground" : ""}>
                            {c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.objective || "—"}</TableCell>
                        <TableCell className="text-right font-mono">
                          {budget ? formatCurrency(budget) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">{matchedLeads}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => toggleMutation.mutate({ campaignId: c.id, action: isActive ? "pause" : "activate" })}
                              disabled={toggleMutation.isPending}
                            >
                              {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            </Button>
                            {budget !== null && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  setBudgetDialog({ id: c.id, name: c.name, current: String(budget) });
                                  setNewBudget(String(budget));
                                }}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* ====== TAB: AI INSIGHTS ====== */}
        <TabsContent value="ai" className="space-y-4">
          <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Insights com IA
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Análise automática cruzando dados Meta Ads com resultados internos
                  </p>
                </div>
                <Button onClick={generateAiInsights} disabled={aiLoading || isLoading}>
                  {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  {aiLoading ? "Analisando..." : "Gerar Análise"}
                </Button>
              </div>

              {!aiAnalysis && !aiLoading && (
                <div className="text-center py-12 text-muted-foreground">
                  <Sparkles className="h-16 w-16 mx-auto mb-4 opacity-20" />
                  <p>Clique em "Gerar Análise" para obter insights de otimização</p>
                  <p className="text-xs mt-2">A IA vai comparar seus dados Meta com os resultados internos da plataforma</p>
                </div>
              )}

              {aiAnalysis && (
                <div className="space-y-4">
                  {/* Summary */}
                  <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="p-4">
                      <p className="text-sm font-medium">{aiAnalysis.summary}</p>
                    </CardContent>
                  </Card>

                  {/* Top Action */}
                  {aiAnalysis.top_action && (
                    <Card className="bg-warning/5 border-warning/20">
                      <CardContent className="p-4 flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-warning mb-1">Ação Prioritária</p>
                          <p className="text-sm">{aiAnalysis.top_action}</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Insights */}
                  {aiAnalysis.insights?.map((insight: any, i: number) => (
                    <Card key={i} className={`border-l-4 ${
                      insight.type === "positive" ? "border-l-success" :
                      insight.type === "negative" ? "border-l-destructive" :
                      "border-l-info"
                    }`}>
                      <CardContent className="p-4">
                        <h4 className="font-semibold text-sm mb-1">{insight.title}</h4>
                        <p className="text-sm text-muted-foreground mb-2">{insight.description}</p>
                        {insight.action && (
                          <p className="text-xs bg-muted px-3 py-1.5 rounded-md inline-block">
                            💡 {insight.action}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Budget Dialog */}
      <Dialog open={!!budgetDialog} onOpenChange={() => setBudgetDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar Orçamento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            Campanha: <span className="font-medium text-foreground">{budgetDialog?.name}</span>
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            Orçamento atual: <span className="font-mono font-bold">{formatCurrency(budgetDialog?.current || "0")}</span>
          </p>
          <Input
            type="number"
            step="0.01"
            placeholder="Novo orçamento diário (R$)"
            value={newBudget}
            onChange={(e) => setNewBudget(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">O valor será enviado em centavos para a API do Meta.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetDialog(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (budgetDialog && newBudget) {
                  budgetMutation.mutate({
                    campaignId: budgetDialog.id,
                    dailyBudget: Math.round(parseFloat(newBudget) * 100),
                  });
                }
              }}
              disabled={budgetMutation.isPending}
            >
              {budgetMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Config Dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configurar Credenciais Meta
            </DialogTitle>
            <DialogDescription>
              Insira seu Access Token e Ad Account ID para conectar com o Meta Ads.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="meta-token">Access Token</Label>
              <Textarea
                id="meta-token"
                placeholder="Cole seu Meta Access Token aqui..."
                value={configToken}
                onChange={(e) => setConfigToken(e.target.value)}
                className="min-h-[80px] font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta-account">Ad Account ID</Label>
              <Input
                id="meta-account"
                placeholder="act_123456789"
                value={configAccountId}
                onChange={(e) => setConfigAccountId(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Com ou sem o prefixo act_</p>
            </div>

            {testResult && (
              <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                testResult.success
                  ? "bg-success/10 text-success border border-success/20"
                  : "bg-destructive/10 text-destructive border border-destructive/20"
              }`}>
                {testResult.success ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleTestConnection} disabled={testLoading} className="w-full sm:w-auto">
              {testLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Testar Conexão
            </Button>
            <Button onClick={handleSaveCredentials} disabled={saveLoading} className="w-full sm:w-auto">
              {saveLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
