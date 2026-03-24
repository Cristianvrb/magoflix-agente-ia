import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Trophy, Users, Target, TrendingUp, BarChart3, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import FlowCanvas from "@/components/flow-builder/FlowCanvas";
import type { Node, Edge } from "@xyflow/react";

interface FlowData {
  id: string;
  agent_id: string;
  name: string;
  is_active: boolean;
  nodes: any;
  edges: any;
  ab_weight: number;
  stats_sent: number;
  stats_qualified: number;
  stats_converted: number;
  created_at: string;
  updated_at: string;
}

export default function FlowBuilderPage() {
  const { id: agentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [flowName, setFlowName] = useState("Novo Fluxo");
  const [isActive, setIsActive] = useState(false);
  const [abWeight, setAbWeight] = useState(50);
  const [showABPanel, setShowABPanel] = useState(false);

  // Fetch ALL flows for this agent
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

  const selectedFlow = flows.find((f) => f.id === selectedFlowId) || null;

  // Auto-select first flow
  useEffect(() => {
    if (flows.length > 0 && !selectedFlowId) {
      setSelectedFlowId(flows[0].id);
    }
  }, [flows, selectedFlowId]);

  useEffect(() => {
    if (selectedFlow) {
      setFlowName(selectedFlow.name || "Novo Fluxo");
      setIsActive(selectedFlow.is_active || false);
      setAbWeight(selectedFlow.ab_weight ?? 50);
    }
  }, [selectedFlow]);

  const saveMutation = useMutation({
    mutationFn: async ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) => {
      const payload = {
        agent_id: agentId,
        name: flowName,
        is_active: isActive,
        ab_weight: abWeight,
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      };

      if (selectedFlow?.id) {
        const { error } = await supabase
          .from("chatbot_flows" as any)
          .update(payload)
          .eq("id", selectedFlow.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("chatbot_flows" as any)
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        if (data) setSelectedFlowId((data as any).id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbot-flows", agentId] });
      toast({ title: "Fluxo salvo!" });
    },
    onError: (e: any) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  const createFlowMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("chatbot_flows" as any)
        .insert({
          agent_id: agentId,
          name: `Fluxo ${String.fromCharCode(65 + flows.length)}`,
          is_active: false,
          ab_weight: 50,
          nodes: [{ id: "trigger-1", type: "trigger", position: { x: 250, y: 50 }, data: { triggerType: "first_message" } }],
          edges: [],
        })
        .select()
        .single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      setSelectedFlowId(data.id);
      queryClient.invalidateQueries({ queryKey: ["chatbot-flows", agentId] });
      toast({ title: "Novo fluxo criado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const handleSave = (nodes: Node[], edges: Edge[]) => {
    saveMutation.mutate({ nodes, edges });
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const initialNodes: Node[] = selectedFlow?.nodes
    ? (selectedFlow.nodes as any[]).map((n: any) => ({ ...n, data: n.data || {} }))
    : [{ id: "trigger-1", type: "trigger", position: { x: 250, y: 50 }, data: { triggerType: "first_message" } }];

  const initialEdges: Edge[] = selectedFlow?.edges
    ? (selectedFlow.edges as any[]).map((e: any) => ({ ...e, animated: true, style: { stroke: "hsl(152, 60%, 42%)" } }))
    : [];

  const activeFlows = flows.filter((f) => f.is_active);
  const hasMultipleActive = activeFlows.length > 1;

  // Determine winner
  const getWinner = () => {
    if (activeFlows.length < 2) return null;
    const withConversion = activeFlows.filter((f) => f.stats_sent > 0);
    if (withConversion.length < 2) return null;
    return withConversion.reduce((best, f) => {
      const bestRate = best.stats_sent > 0 ? best.stats_converted / best.stats_sent : 0;
      const fRate = f.stats_sent > 0 ? f.stats_converted / f.stats_sent : 0;
      return fRate > bestRate ? f : best;
    });
  };
  const winner = getWinner();

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 border-b bg-card px-4 py-2.5">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/agents/${agentId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* Flow tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {flows.map((f, i) => (
            <button
              key={f.id}
              onClick={() => setSelectedFlowId(f.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                f.id === selectedFlowId
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {f.name || `Fluxo ${String.fromCharCode(65 + i)}`}
              {f.is_active && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-green-400" />}
            </button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => createFlowMutation.mutate()}
            disabled={createFlowMutation.isPending}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          {/* Flow name */}
          <Input
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            className="max-w-[160px] h-8 text-sm font-medium"
          />

          {/* A/B Weight */}
          {hasMultipleActive && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Peso A/B</span>
              <Slider
                value={[abWeight]}
                onValueChange={([v]) => setAbWeight(v)}
                min={1}
                max={100}
                step={1}
                className="w-20"
              />
              <span className="text-xs font-mono w-8 text-right">{abWeight}%</span>
            </div>
          )}

          {/* Active toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Ativo</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* A/B Panel toggle */}
          {hasMultipleActive && (
            <>
              <Button
                variant={showABPanel ? "default" : "outline"}
                size="sm"
                className="h-8"
                onClick={() => setShowABPanel(!showABPanel)}
              >
                <BarChart3 className="h-3.5 w-3.5 mr-1" />
                A/B
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => navigate(`/agents/${agentId}/ab-dashboard`)}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Dashboard
              </Button>
            </>
          )}
        </div>
      </div>

      {/* A/B Comparison Panel */}
      {showABPanel && hasMultipleActive && (
        <div className="border-b bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Painel de Teste A/B</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {activeFlows.map((f) => {
              const qualRate = f.stats_sent > 0 ? ((f.stats_qualified / f.stats_sent) * 100).toFixed(1) : "0.0";
              const convRate = f.stats_sent > 0 ? ((f.stats_converted / f.stats_sent) * 100).toFixed(1) : "0.0";
              const isWinner = winner?.id === f.id && f.stats_sent > 0;

              return (
                <Card
                  key={f.id}
                  className={`cursor-pointer transition-all ${
                    f.id === selectedFlowId ? "ring-2 ring-primary" : ""
                  } ${isWinner ? "border-green-500/50 bg-green-500/5" : ""}`}
                  onClick={() => setSelectedFlowId(f.id)}
                >
                  <CardHeader className="p-3 pb-1">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs font-medium truncate">{f.name}</CardTitle>
                      {isWinner && (
                        <Badge variant="default" className="bg-green-600 text-[10px] px-1.5 py-0">
                          <Trophy className="h-2.5 w-2.5 mr-0.5" />
                          Vencedor
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-1">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                          <Users className="h-3 w-3" />
                        </div>
                        <div className="text-lg font-bold">{f.stats_sent}</div>
                        <div className="text-[10px] text-muted-foreground">Enviados</div>
                      </div>
                      <div>
                        <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                          <Target className="h-3 w-3" />
                        </div>
                        <div className="text-lg font-bold">{qualRate}%</div>
                        <div className="text-[10px] text-muted-foreground">Qualificados</div>
                      </div>
                      <div>
                        <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                          <TrendingUp className="h-3 w-3" />
                        </div>
                        <div className="text-lg font-bold">{convRate}%</div>
                        <div className="text-[10px] text-muted-foreground">Convertidos</div>
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] text-muted-foreground text-center">
                      Peso: {f.ab_weight}%
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Flow Canvas */}
      <div className="flex-1 min-h-0">
        <FlowCanvas
          key={selectedFlow?.id || "new"}
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          onSave={handleSave}
          isSaving={saveMutation.isPending}
        />
      </div>
    </div>
  );
}
