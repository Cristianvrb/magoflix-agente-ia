import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Trophy,
  Users,
  Target,
  TrendingUp,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  MessageCircleQuestion,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface FlowData {
  id: string;
  agent_id: string;
  name: string;
  is_active: boolean;
  ab_weight: number;
  stats_sent: number;
  stats_qualified: number;
  stats_converted: number;
}

interface NodeReached {
  node_type: string;
  node_id: string;
  reached_at: string;
}

interface FlowState {
  flow_id?: string;
  nodes_reached?: NodeReached[];
  waiting_for_response?: boolean;
  [key: string]: any;
}

const FLOW_COLORS = [
  "hsl(152, 60%, 42%)",
  "hsl(217, 91%, 60%)",
  "hsl(47, 100%, 50%)",
  "hsl(340, 82%, 52%)",
];

const NODE_TYPE_LABELS: Record<string, string> = {
  trigger: "Trigger",
  text_message: "Texto",
  audio_ptt: "Áudio",
  image_message: "Imagem",
  video_message: "Vídeo",
  delay: "Delay",
  wait_response: "Aguardar Resposta",
  user_responded: "Respondeu ✓",
  transfer_ai: "Transfer IA",
  transfer_human: "Transfer Humano",
  condition: "Condição",
  randomizer: "Randomizador",
  contact_message: "Contato",
  document_message: "Documento",
};

export default function ABDashboardPage() {
  const { id: agentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ["chatbot-flows", agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chatbot_flows" as any)
        .select("*")
        .eq("agent_id", agentId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as FlowData[];
    },
    enabled: !!agentId && !!user,
  });

  // Fetch conversations with flow_state for funnel analysis
  const { data: flowConversations = [] } = useQuery({
    queryKey: ["flow-conversations", agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, flow_state")
        .not("flow_state", "is", null);
      if (error) throw error;
      return (data || []) as { id: string; flow_state: FlowState }[];
    },
    enabled: !!agentId && !!user,
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const ids = flows.map((f) => f.id);
      for (const id of ids) {
        const { error } = await supabase
          .from("chatbot_flows" as any)
          .update({ stats_sent: 0, stats_qualified: 0, stats_converted: 0 })
          .eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbot-flows", agentId] });
      toast({ title: "Estatísticas resetadas!" });
    },
    onError: (e: any) =>
      toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const activeFlows = flows.filter((f) => f.is_active);
  const displayFlows = activeFlows.length >= 2 ? activeFlows : flows;

  // Stats helpers
  const rate = (num: number, den: number) =>
    den > 0 ? ((num / den) * 100).toFixed(1) : "0.0";

  const totalSent = displayFlows.reduce((s, f) => s + f.stats_sent, 0);

  // Winner
  const winner =
    displayFlows.length >= 2 && displayFlows.some((f) => f.stats_sent > 0)
      ? displayFlows.reduce((best, f) => {
          const bRate = best.stats_sent > 0 ? best.stats_converted / best.stats_sent : 0;
          const fRate = f.stats_sent > 0 ? f.stats_converted / f.stats_sent : 0;
          return fRate > bRate ? f : best;
        })
      : null;

  // Statistical confidence (simple z-test approximation)
  const getConfidence = () => {
    if (displayFlows.length < 2) return null;
    const [a, b] = displayFlows;
    if (a.stats_sent < 30 || b.stats_sent < 30)
      return { level: "low", label: "Dados insuficientes", minNeeded: 30 };
    const pA = a.stats_sent > 0 ? a.stats_converted / a.stats_sent : 0;
    const pB = b.stats_sent > 0 ? b.stats_converted / b.stats_sent : 0;
    const seA = Math.sqrt((pA * (1 - pA)) / a.stats_sent);
    const seB = Math.sqrt((pB * (1 - pB)) / b.stats_sent);
    const se = Math.sqrt(seA * seA + seB * seB);
    if (se === 0) return { level: "low", label: "Sem variação", minNeeded: 0 };
    const z = Math.abs(pA - pB) / se;
    if (z >= 2.58) return { level: "high", label: "99% de confiança", minNeeded: 0 };
    if (z >= 1.96) return { level: "medium", label: "95% de confiança", minNeeded: 0 };
    if (z >= 1.645) return { level: "medium", label: "90% de confiança", minNeeded: 0 };
    const needed = Math.ceil(Math.pow(2.58 / (Math.abs(pA - pB) || 0.01), 2) * 0.25);
    return { level: "low", label: `~${needed} leads p/ significância`, minNeeded: needed };
  };
  const confidence = getConfidence();

  // Chart data
  const barData = displayFlows.map((f, i) => ({
    name: f.name,
    Enviados: f.stats_sent,
    Qualificados: f.stats_qualified,
    Convertidos: f.stats_converted,
    color: FLOW_COLORS[i % FLOW_COLORS.length],
  }));

  const rateData = displayFlows.map((f, i) => ({
    name: f.name,
    "Taxa Qualificação (%)": parseFloat(rate(f.stats_qualified, f.stats_sent)),
    "Taxa Conversão (%)": parseFloat(rate(f.stats_converted, f.stats_sent)),
    color: FLOW_COLORS[i % FLOW_COLORS.length],
  }));

  // Build per-flow node funnel data
  const buildFlowFunnel = (flowId: string) => {
    const convs = flowConversations.filter(
      (c) => c.flow_state?.flow_id === flowId && c.flow_state?.nodes_reached
    );
    if (convs.length === 0) return null;

    // Aggregate: count how many conversations reached each node type (in order of first appearance)
    const nodeOrder: string[] = [];
    const nodeCounts: Record<string, number> = {};

    for (const conv of convs) {
      const reached = conv.flow_state.nodes_reached || [];
      const seenTypes = new Set<string>();
      for (const nr of reached) {
        const t = nr.node_type;
        if (t === "delay" || t === "trigger") continue; // skip non-meaningful nodes
        if (!seenTypes.has(t)) {
          seenTypes.add(t);
          nodeCounts[t] = (nodeCounts[t] || 0) + 1;
          if (!nodeOrder.includes(t)) nodeOrder.push(t);
        }
      }
    }

    return nodeOrder.map((t) => ({
      nodeType: t,
      label: NODE_TYPE_LABELS[t] || t,
      count: nodeCounts[t] || 0,
      total: convs.length,
    }));
  };

  // Summary text
  const getSummary = () => {
    if (displayFlows.length < 2 || totalSent === 0) return "Aguardando dados dos fluxos...";
    const sorted = [...displayFlows].sort((a, b) => {
      const rA = a.stats_sent > 0 ? a.stats_converted / a.stats_sent : 0;
      const rB = b.stats_sent > 0 ? b.stats_converted / b.stats_sent : 0;
      return rB - rA;
    });
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const bestRate = best.stats_sent > 0 ? (best.stats_converted / best.stats_sent) * 100 : 0;
    const worstRate = worst.stats_sent > 0 ? (worst.stats_converted / worst.stats_sent) * 100 : 0;
    const diff = bestRate - worstRate;
    if (diff === 0) return `${best.name} e ${worst.name} têm a mesma taxa de conversão.`;
    return `${best.name} está convertendo ${diff.toFixed(1)}pp a mais que ${worst.name} (${bestRate.toFixed(1)}% vs ${worstRate.toFixed(1)}%).`;
  };

  // Response rate KPI per flow
  const getResponseRate = (flowId: string) => {
    const convs = flowConversations.filter(
      (c) => c.flow_state?.flow_id === flowId && c.flow_state?.nodes_reached
    );
    if (convs.length === 0) return null;
    const responded = convs.filter((c) =>
      (c.flow_state.nodes_reached || []).some((n) => n.node_type === "user_responded")
    ).length;
    return { total: convs.length, responded, rate: convs.length > 0 ? ((responded / convs.length) * 100).toFixed(1) : "0.0" };
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/agents/${agentId}/flow`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Dashboard A/B
            </h1>
            <p className="text-sm text-muted-foreground">{displayFlows.length} fluxos · {totalSent} leads totais</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => resetMutation.mutate()}
          disabled={resetMutation.isPending}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Resetar Stats
        </Button>
      </div>

      {/* Summary + Confidence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium text-muted-foreground mb-1">Resumo</p>
            <p className="text-base font-semibold">{getSummary()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            {confidence?.level === "high" ? (
              <CheckCircle2 className="h-8 w-8 text-green-500 shrink-0" />
            ) : confidence?.level === "medium" ? (
              <AlertTriangle className="h-8 w-8 text-yellow-500 shrink-0" />
            ) : (
              <AlertTriangle className="h-8 w-8 text-muted-foreground shrink-0" />
            )}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Confiança Estatística</p>
              <p className="text-base font-semibold">{confidence?.label || "Sem dados"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {displayFlows.map((f, i) => {
          const isWinner = winner?.id === f.id && f.stats_sent > 0;
          const responseRate = getResponseRate(f.id);
          return (
            <Card
              key={f.id}
              className={`relative overflow-hidden ${isWinner ? "ring-2 ring-green-500/60" : ""}`}
            >
              <div
                className="absolute top-0 left-0 w-full h-1"
                style={{ backgroundColor: FLOW_COLORS[i % FLOW_COLORS.length] }}
              />
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold truncate">{f.name}</CardTitle>
                  <div className="flex items-center gap-1.5">
                    {isWinner && (
                      <Badge className="bg-green-600 text-[10px] px-1.5 py-0">
                        <Trophy className="h-2.5 w-2.5 mr-0.5" />
                        Líder
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {f.ab_weight}%
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0 grid grid-cols-4 gap-2 text-center">
                <div>
                  <Users className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <div className="text-2xl font-bold">{f.stats_sent}</div>
                  <div className="text-[10px] text-muted-foreground">Enviados</div>
                </div>
                <div>
                  <MessageCircleQuestion className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <div className="text-2xl font-bold">{responseRate?.rate || "—"}%</div>
                  <div className="text-[10px] text-muted-foreground">Responderam</div>
                </div>
                <div>
                  <Target className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <div className="text-2xl font-bold">{rate(f.stats_qualified, f.stats_sent)}%</div>
                  <div className="text-[10px] text-muted-foreground">Qualificados</div>
                </div>
                <div>
                  <TrendingUp className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <div className="text-2xl font-bold">{rate(f.stats_converted, f.stats_sent)}%</div>
                  <div className="text-[10px] text-muted-foreground">Convertidos</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Flow Node Funnel */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageCircleQuestion className="h-4 w-4" />
            Funil de Progresso por Fluxo
          </CardTitle>
          <p className="text-xs text-muted-foreground">Quantos leads chegaram em cada etapa do fluxo</p>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayFlows.map((f, i) => {
              const funnel = buildFlowFunnel(f.id);
              const color = FLOW_COLORS[i % FLOW_COLORS.length];
              if (!funnel || funnel.length === 0) {
                return (
                  <div key={f.id} className="space-y-2">
                    <p className="text-sm font-semibold" style={{ color }}>{f.name}</p>
                    <p className="text-xs text-muted-foreground">Sem dados de progresso ainda</p>
                  </div>
                );
              }
              const maxVal = Math.max(funnel[0]?.count || 1, 1);
              return (
                <div key={f.id} className="space-y-2">
                  <p className="text-sm font-semibold" style={{ color }}>{f.name}</p>
                  {funnel.map((step, si) => {
                    const width = Math.max((step.count / maxVal) * 100, 8);
                    const passRate =
                      si > 0 && funnel[si - 1].count > 0
                        ? ((step.count / funnel[si - 1].count) * 100).toFixed(1)
                        : null;
                    return (
                      <div key={step.nodeType}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{step.label}</span>
                          <span className="font-mono font-semibold">
                            {step.count}
                            {passRate && (
                              <span className="text-muted-foreground ml-1">({passRate}%)</span>
                            )}
                          </span>
                        </div>
                        <div className="h-5 rounded-md bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-md transition-all duration-700"
                            style={{ width: `${width}%`, backgroundColor: color, opacity: 1 - si * 0.12 }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Absolute numbers */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Números Absolutos</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Enviados" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Qualificados" fill="hsl(47, 100%, 50%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Convertidos" fill="hsl(152, 60%, 42%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Rates */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Taxas Comparativas (%)</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rateData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" unit="%" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Taxa Qualificação (%)" fill="hsl(47, 100%, 50%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Taxa Conversão (%)" fill="hsl(152, 60%, 42%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Funnel Comparison */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Funil Comparativo</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {displayFlows.map((f, i) => {
              const color = FLOW_COLORS[i % FLOW_COLORS.length];
              const stages = [
                { label: "Enviados", value: f.stats_sent },
                { label: "Qualificados", value: f.stats_qualified },
                { label: "Convertidos", value: f.stats_converted },
              ];
              const maxVal = Math.max(f.stats_sent, 1);
              return (
                <div key={f.id} className="space-y-2">
                  <p className="text-sm font-semibold" style={{ color }}>
                    {f.name}
                  </p>
                  {stages.map((stage, si) => {
                    const width = Math.max((stage.value / maxVal) * 100, 8);
                    const passRate =
                      si > 0 && stages[si - 1].value > 0
                        ? ((stage.value / stages[si - 1].value) * 100).toFixed(1)
                        : null;
                    return (
                      <div key={stage.label}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{stage.label}</span>
                          <span className="font-mono font-semibold">
                            {stage.value}
                            {passRate && (
                              <span className="text-muted-foreground ml-1">({passRate}%)</span>
                            )}
                          </span>
                        </div>
                        <div className="h-6 rounded-md bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-md transition-all duration-700"
                            style={{ width: `${width}%`, backgroundColor: color, opacity: 1 - si * 0.2 }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}