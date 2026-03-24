import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend } from "recharts";
import { RefreshCw, FileText, MessageCircle, Mail, Users, Eye, TrendingUp, ImagePlus, Type, DollarSign, Target, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";

const USD_TO_BRL = 5.50;
const FOLLOWER_GOAL = 1000;

export function SocialDashboardTab() {
  const [refreshing, setRefreshing] = useState(false);

  const { data: posts } = useQuery({
    queryKey: ["social-posts-count"],
    queryFn: async () => {
      const { count } = await supabase.from("social_posts").select("*", { count: "exact", head: true });
      return count || 0;
    },
  });

  const { data: publishedPosts } = useQuery({
    queryKey: ["social-posts-published"],
    queryFn: async () => {
      const { count } = await supabase.from("social_posts").select("*", { count: "exact", head: true }).eq("status", "published");
      return count || 0;
    },
  });

  const { data: commentsCount } = useQuery({
    queryKey: ["social-comments-count"],
    queryFn: async () => {
      const { count } = await supabase.from("social_comments").select("*", { count: "exact", head: true });
      return count || 0;
    },
  });

  const { data: dmsCount } = useQuery({
    queryKey: ["social-dms-count"],
    queryFn: async () => {
      const { count } = await supabase.from("social_dms").select("*", { count: "exact", head: true });
      return count || 0;
    },
  });

  const { data: metrics } = useQuery({
    queryKey: ["social-metrics"],
    queryFn: async () => {
      const { data } = await supabase.from("social_metrics").select("*").order("date", { ascending: true }).limit(30);
      return data || [];
    },
  });

  const { data: recentPosts } = useQuery({
    queryKey: ["social-posts-chart"],
    queryFn: async () => {
      const { data } = await supabase.from("social_posts").select("created_at, status").order("created_at", { ascending: true }).limit(100);
      const byDay: Record<string, number> = {};
      (data || []).forEach((p) => { const day = p.created_at.split("T")[0]; byDay[day] = (byDay[day] || 0) + 1; });
      return Object.entries(byDay).map(([date, count]) => ({ date, posts: count }));
    },
  });

  const { data: aiCosts } = useQuery({
    queryKey: ["social-ai-costs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("token_usage")
        .select("cost_usd, usage_type, model, created_at, prompt_tokens, completion_tokens, total_tokens")
        .in("usage_type", ["social_image", "social_caption"])
        .order("created_at", { ascending: false });

      let ideogramTotal = 0, openaiTotal = 0, ideogramCount = 0, openaiCount = 0;
      const dailyCosts: Record<string, { date: string; ideogram: number; openai: number }> = {};

      (data || []).forEach((row) => {
        const day = row.created_at.split("T")[0];
        if (!dailyCosts[day]) dailyCosts[day] = { date: day, ideogram: 0, openai: 0 };
        if (row.usage_type === "social_image") {
          ideogramTotal += Number(row.cost_usd); ideogramCount++;
          dailyCosts[day].ideogram += Number(row.cost_usd) * USD_TO_BRL;
        } else {
          openaiTotal += Number(row.cost_usd); openaiCount++;
          dailyCosts[day].openai += Number(row.cost_usd) * USD_TO_BRL;
        }
      });

      return {
        ideogramTotalBrl: ideogramTotal * USD_TO_BRL,
        openaiTotalBrl: openaiTotal * USD_TO_BRL,
        totalBrl: (ideogramTotal + openaiTotal) * USD_TO_BRL,
        ideogramCount, openaiCount,
        avgCostBrl: (ideogramCount + openaiCount) > 0 ? ((ideogramTotal + openaiTotal) * USD_TO_BRL) / (ideogramCount + openaiCount) : 0,
        dailyCosts: Object.values(dailyCosts).sort((a, b) => a.date.localeCompare(b.date)),
        recentRows: (data || []).slice(0, 20),
      };
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await supabase.functions.invoke("social-fetch-metrics");
      if (res.error) throw res.error;
      toast.success("Métricas atualizadas!");
    } catch { toast.error("Erro ao atualizar métricas"); }
    finally { setRefreshing(false); }
  };

  const latestMetric = metrics?.[metrics.length - 1];
  const currentFollowers = latestMetric?.followers ?? 0;
  const goalProgress = Math.min((currentFollowers / FOLLOWER_GOAL) * 100, 100);

  const growthData = (() => {
    if (!metrics || metrics.length < 2) return { dailyRate: 0, projection: null };
    const recent = metrics.slice(-7);
    if (recent.length < 2) return { dailyRate: 0, projection: null };
    const dailyRate = (recent[recent.length - 1].followers - recent[0].followers) / (recent.length - 1);
    const remaining = FOLLOWER_GOAL - currentFollowers;
    const daysToGoal = dailyRate > 0 ? Math.ceil(remaining / dailyRate) : null;
    return { dailyRate, projection: daysToGoal ? new Date(Date.now() + daysToGoal * 86400000) : null };
  })();

  const kpis = [
    { label: "Total Posts", value: posts ?? 0, icon: FileText, color: "text-primary" },
    { label: "Publicados", value: publishedPosts ?? 0, icon: FileText, color: "text-green-500" },
    { label: "Comentários", value: commentsCount ?? 0, icon: MessageCircle, color: "text-blue-500" },
    { label: "DMs", value: dmsCount ?? 0, icon: Mail, color: "text-purple-500" },
    { label: "Alcance", value: latestMetric?.reach ?? 0, icon: Eye, color: "text-amber-500" },
    { label: "Impressões", value: latestMetric?.impressions ?? 0, icon: TrendingUp, color: "text-rose-500" },
  ];

  const formatBrl = (v: number) => `R$ ${v.toFixed(2)}`;

  const { data: failedCount } = useQuery({
    queryKey: ["social-failed-posts-24h-dashboard"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase.from("social_posts").select("*", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since);
      return count || 0;
    },
    refetchInterval: 60000,
  });

  return (
    <div className="space-y-6">
      {(failedCount || 0) > 3 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            ⚠️ <strong>{failedCount} posts falharam nas últimas 24h.</strong> Seus tokens podem estar expirados. Vá em <strong>Config</strong> e renove os tokens do Instagram/Threads.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Dashboard</h2>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} /> Atualizar Métricas
        </Button>
      </div>

      {/* Growth Goal Card */}
      <Card className="border-primary/40 bg-gradient-to-r from-primary/5 to-primary/10">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-4">
            <Target className="h-8 w-8 text-primary" />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-foreground">Meta: {FOLLOWER_GOAL.toLocaleString()} Seguidores</h3>
                <span className="text-lg font-bold text-primary">{currentFollowers.toLocaleString()} / {FOLLOWER_GOAL.toLocaleString()}</span>
              </div>
              <Progress value={goalProgress} className="h-3" />
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>{goalProgress.toFixed(1)}% concluído</span>
                <div className="flex gap-4">
                  <span>📈 {growthData.dailyRate > 0 ? `+${growthData.dailyRate.toFixed(1)}` : "0"} /dia</span>
                  {growthData.projection && <span>🎯 Previsão: {growthData.projection.toLocaleDateString("pt-BR")}</span>}
                  {!growthData.projection && currentFollowers < FOLLOWER_GOAL && <span>🔄 Dados insuficientes</span>}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <kpi.icon className={`h-8 w-8 ${kpi.color}`} />
                <div>
                  <p className="text-2xl font-bold text-foreground">{kpi.value.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Custos IA */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ImagePlus className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-2xl font-bold text-foreground">{formatBrl(aiCosts?.ideogramTotalBrl ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Imagens • {aiCosts?.ideogramCount ?? 0} gerações</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Type className="h-8 w-8 text-emerald-500" />
              <div>
                <p className="text-2xl font-bold text-foreground">{formatBrl(aiCosts?.openaiTotalBrl ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Legendas • {aiCosts?.openaiCount ?? 0} gerações</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{formatBrl(aiCosts?.totalBrl ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Gasto Total Social IA</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-cyan-500/30 bg-cyan-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-cyan-500" />
              <div>
                <p className="text-2xl font-bold text-foreground">{formatBrl(aiCosts?.avgCostBrl ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Custo Médio / Geração</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela Últimas Gerações */}
      {(aiCosts?.recentRows?.length || 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Últimas Gerações (Custos)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead className="text-right">Custo (R$)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aiCosts!.recentRows.map((row: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">{new Date(row.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${row.usage_type === "social_image" ? "bg-orange-500/20 text-orange-500" : "bg-emerald-500/20 text-emerald-500"}`}>
                        {row.usage_type === "social_image" ? "Imagem" : "Legenda"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{row.model}</TableCell>
                    <TableCell className="text-xs">{row.total_tokens?.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-xs font-mono">{formatBrl(Number(row.cost_usd) * USD_TO_BRL)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Gráfico de custos por dia */}
      {(aiCosts?.dailyCosts?.length || 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Custos IA por Dia (R$)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={aiCosts!.dailyCosts}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `R$${v.toFixed(2)}`} />
                <Tooltip formatter={(v: number) => [`R$ ${v.toFixed(4)}`, ""]} />
                <Legend />
                <Bar dataKey="ideogram" name="Imagens" fill="#f97316" radius={[4, 4, 0, 0]} stackId="costs" />
                <Bar dataKey="openai" name="Legendas" fill="#10b981" radius={[4, 4, 0, 0]} stackId="costs" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {latestMetric && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Seguidores Instagram</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div><p className="text-xl font-bold text-foreground">{latestMetric.followers.toLocaleString()}</p><p className="text-xs text-muted-foreground">Seguidores</p></div>
              <div><p className="text-xl font-bold text-foreground">{latestMetric.impressions.toLocaleString()}</p><p className="text-xs text-muted-foreground">Impressões</p></div>
              <div><p className="text-xl font-bold text-foreground">{latestMetric.reach.toLocaleString()}</p><p className="text-xs text-muted-foreground">Alcance</p></div>
              <div><p className="text-xl font-bold text-foreground">{latestMetric.profile_views.toLocaleString()}</p><p className="text-xs text-muted-foreground">Visitas Perfil</p></div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Alcance e Impressões por Dia</CardTitle></CardHeader>
          <CardContent>
            {(metrics?.length || 0) > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={metrics}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip /><Legend />
                  <Bar dataKey="reach" name="Alcance" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="impressions" name="Impressões" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground text-center py-8">Nenhuma métrica ainda</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Evolução de Seguidores</CardTitle></CardHeader>
          <CardContent>
            {(metrics?.length || 0) > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={metrics}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip /><Legend />
                  <Line type="monotone" dataKey="followers" name="Seguidores" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground text-center py-8">Nenhuma métrica ainda</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Posts por Dia</CardTitle></CardHeader>
        <CardContent>
          {(recentPosts?.length || 0) > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={recentPosts}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip />
                <Bar dataKey="posts" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground text-center py-8">Nenhum post ainda</p>}
        </CardContent>
      </Card>
    </div>
  );
}
