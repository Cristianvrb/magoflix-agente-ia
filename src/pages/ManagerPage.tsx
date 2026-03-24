import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, Play, Loader2, CheckCircle, XCircle, Clock, Zap, TrendingUp, AlertTriangle, ThumbsDown, CheckCheck, Rocket } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Decision {
  id: string;
  decision_type: string;
  description: string;
  reasoning: string;
  priority: string;
  status: string;
  action_payload: any;
  data: any;
  result: string;
  rejected_reason: string;
  created_at: string;
}

const priorityColors: Record<string, string> = {
  high: "bg-destructive/20 text-destructive border-destructive/30",
  medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  low: "bg-muted text-muted-foreground border-border",
};

const typeLabels: Record<string, string> = {
  update_offer_price: "💰 Preço",
  create_offer: "🎁 Oferta",
  send_group_message: "💬 Grupo",
  update_agent_prompt: "🤖 Prompt",
  log_decision: "📝 Insight",
};

const statusColors: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-400",
  approved: "bg-blue-500/20 text-blue-400",
  rejected: "bg-muted text-muted-foreground",
  executed: "bg-emerald-500/20 text-emerald-400",
  failed: "bg-destructive/20 text-destructive",
};

export default function ManagerPage() {
  const queryClient = useQueryClient();
  const [instructions, setInstructions] = useState("");
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: decisions = [], isLoading } = useQuery({
    queryKey: ["manager-decisions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manager_decisions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as Decision[];
    },
  });

  const pending = decisions.filter(d => d.status === "pending");
  const approved = decisions.filter(d => d.status === "approved");
  const history = decisions.filter(d => ["executed", "failed", "rejected"].includes(d.status));

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("manager-agent", {
        body: { mode: "analyze", instructions: instructions || undefined },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setLastSummary(data.summary || null);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["manager-decisions"] });
      toast.success(`Análise concluída! ${data.total || 0} tarefas propostas.`);
    },
    onError: (err: any) => toast.error(`Erro: ${err.message}`),
  });

  const executeMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.functions.invoke("manager-agent", {
        body: { mode: "execute", decision_ids: ids },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["manager-decisions"] });
      toast.success(`${data.executed} executadas, ${data.failed} falharam.`);
      setSelectedIds(new Set());
    },
    onError: (err: any) => toast.error(`Erro: ${err.message}`),
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const approveSelected = async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await supabase.from("manager_decisions").update({ status: "approved" }).eq("id", id);
    }
    queryClient.invalidateQueries({ queryKey: ["manager-decisions"] });
    toast.success(`${ids.length} tarefas aprovadas!`);
  };

  const approveAll = async () => {
    for (const d of pending) {
      await supabase.from("manager_decisions").update({ status: "approved" }).eq("id", d.id);
    }
    queryClient.invalidateQueries({ queryKey: ["manager-decisions"] });
    toast.success("Todas aprovadas!");
  };

  const rejectDecision = async (id: string) => {
    await supabase.from("manager_decisions").update({ status: "rejected", rejected_reason: rejectReason }).eq("id", id);
    setRejectingId(null);
    setRejectReason("");
    queryClient.invalidateQueries({ queryKey: ["manager-decisions"] });
    toast.info("Tarefa rejeitada.");
  };

  const executeApproved = () => {
    const ids = approved.map(d => d.id);
    if (!ids.length) return toast.error("Nenhuma tarefa aprovada.");
    executeMutation.mutate(ids);
  };

  const todayExecuted = history.filter(d => d.status === "executed" && new Date(d.created_at).toDateString() === new Date().toDateString());
  const approvalRate = history.length > 0
    ? Math.round(history.filter(d => d.status !== "rejected").length / history.length * 100)
    : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-7 w-7 text-primary" />
            MagoFlix Gerente
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            IA que analisa a operação e propõe ações — você aprova antes de executar
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><Zap className="h-4 w-4 text-primary" />{todayExecuted.length} executadas hoje</span>
          <span className="flex items-center gap-1"><TrendingUp className="h-4 w-4 text-emerald-400" />{approvalRate}% aprovação</span>
        </div>
      </div>

      {/* Analyze Card */}
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Rodar Análise</CardTitle>
          </div>
          <CardDescription>
            Coleta dados completos (vendas, ads, funil, custos, grupos) e propõe ações otimizadas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Instruções (opcional). Ex: 'Foque em upsell do Kit Revendedor' ou 'Analise por que a conversão caiu'"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
          />
          <Button onClick={() => analyzeMutation.mutate()} disabled={analyzeMutation.isPending} size="lg" className="w-full">
            {analyzeMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Coletando dados e analisando...</> : <><Play className="mr-2 h-4 w-4" />Rodar Análise</>}
          </Button>
          {lastSummary && (
            <div className="rounded-lg bg-muted/50 p-4 border">
              <p className="text-sm font-medium mb-2 text-primary">Resumo:</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lastSummary}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tasks Tabs */}
      <Tabs defaultValue="pending">
        <TabsList className="w-full">
          <TabsTrigger value="pending" className="flex-1">Pendentes ({pending.length})</TabsTrigger>
          <TabsTrigger value="approved" className="flex-1">Aprovadas ({approved.length})</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">Histórico ({history.length})</TabsTrigger>
        </TabsList>

        {/* Pending */}
        <TabsContent value="pending">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Tarefas Pendentes</CardTitle>
              {pending.length > 0 && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={approveAll} disabled={!pending.length}>
                    <CheckCheck className="mr-1 h-4 w-4" />Aprovar Todas
                  </Button>
                  <Button size="sm" onClick={approveSelected} disabled={selectedIds.size === 0}>
                    Aprovar Selecionadas ({selectedIds.size})
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : pending.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tarefa pendente. Rode uma análise!</p>
              ) : (
                <div className="space-y-3">
                  {pending.map((d, i) => (
                    <div key={d.id}>
                      {i > 0 && <Separator className="mb-3" />}
                      <div className="flex items-start gap-3">
                        <Checkbox checked={selectedIds.has(d.id)} onCheckedChange={() => toggleSelect(d.id)} className="mt-1" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge variant="outline" className={priorityColors[d.priority] || ""}>{d.priority}</Badge>
                            <Badge variant="outline">{typeLabels[d.decision_type] || d.decision_type}</Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />{new Date(d.created_at).toLocaleString("pt-BR")}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-foreground">{d.description}</p>
                          {d.reasoning && <p className="text-xs text-muted-foreground mt-1 italic">💡 {d.reasoning}</p>}
                          <div className="mt-2 flex gap-2">
                            {rejectingId === d.id ? (
                              <div className="flex gap-2 items-center w-full">
                                <Textarea
                                  value={rejectReason}
                                  onChange={(e) => setRejectReason(e.target.value)}
                                  placeholder="Motivo da rejeição (ajuda a treinar a IA)"
                                  rows={1}
                                  className="text-xs flex-1"
                                />
                                <Button size="sm" variant="destructive" onClick={() => rejectDecision(d.id)}>Rejeitar</Button>
                                <Button size="sm" variant="ghost" onClick={() => setRejectingId(null)}>Cancelar</Button>
                              </div>
                            ) : (
                              <Button size="sm" variant="ghost" onClick={() => setRejectingId(d.id)}>
                                <ThumbsDown className="mr-1 h-3 w-3" />Rejeitar
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Approved */}
        <TabsContent value="approved">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Aprovadas (Aguardando Execução)</CardTitle>
              {approved.length > 0 && (
                <Button onClick={executeApproved} disabled={executeMutation.isPending}>
                  {executeMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Executando...</> : <><Rocket className="mr-1 h-4 w-4" />Executar Todas ({approved.length})</>}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {approved.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tarefa aprovada pendente de execução.</p>
              ) : (
                <div className="space-y-3">
                  {approved.map((d, i) => (
                    <div key={d.id}>
                      {i > 0 && <Separator className="mb-3" />}
                      <div className="flex items-start gap-3">
                        <CheckCircle className="h-4 w-4 text-blue-400 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge variant="outline" className={priorityColors[d.priority] || ""}>{d.priority}</Badge>
                            <Badge variant="outline">{typeLabels[d.decision_type] || d.decision_type}</Badge>
                          </div>
                          <p className="text-sm text-foreground">{d.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Histórico</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tarefa no histórico.</p>
              ) : (
                <div className="space-y-3">
                  {history.map((d, i) => (
                    <div key={d.id}>
                      {i > 0 && <Separator className="mb-3" />}
                      <div className="flex items-start gap-3">
                        {d.status === "executed" && <CheckCircle className="h-4 w-4 text-emerald-400 mt-0.5" />}
                        {d.status === "failed" && <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />}
                        {d.status === "rejected" && <XCircle className="h-4 w-4 text-muted-foreground mt-0.5" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge className={statusColors[d.status] || ""}>{d.status}</Badge>
                            <Badge variant="outline">{typeLabels[d.decision_type] || d.decision_type}</Badge>
                            <span className="text-xs text-muted-foreground"><Clock className="h-3 w-3 inline mr-1" />{new Date(d.created_at).toLocaleString("pt-BR")}</span>
                          </div>
                          <p className="text-sm text-foreground">{d.description}</p>
                          {d.result && d.result !== "" && <p className="text-xs text-muted-foreground mt-1">Resultado: {d.result}</p>}
                          {d.rejected_reason && <p className="text-xs text-muted-foreground mt-1 italic">Motivo: {d.rejected_reason}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
