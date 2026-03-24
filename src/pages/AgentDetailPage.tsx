import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Save, Loader2, ChevronDown, Settings2, Workflow } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AgentIconPicker } from "@/components/agents/AgentIconPicker";
import { KnowledgeTab } from "@/components/agents/KnowledgeTab";
import { DocumentsTab } from "@/components/agents/DocumentsTab";
import { AI_MODEL_GROUPS } from "@/lib/ai-models";

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const { data: agent, isLoading } = useQuery({
    queryKey: ["agent", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!user,
  });

  const [form, setForm] = useState<Record<string, any>>({});

  useEffect(() => {
    if (agent) setForm({ ...agent });
  }, [agent]);

  const updateAgent = useMutation({
    mutationFn: async () => {
      const { id: _id, created_at: _c, user_id: _u, ...updates } = form;
      const { error } = await supabase.from("agents").update(updates).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", id] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast({ title: "Agente salvo!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const set = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));

  if (isLoading || !form.id) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/agents")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold flex-1">{form.name || "Agente"}</h1>
        <Button variant="outline" onClick={() => navigate(`/agents/${id}/flow`)}>
          <Workflow className="h-4 w-4" />
          Construtor de Fluxo
        </Button>
        <Button onClick={() => updateAgent.mutate()} disabled={updateAgent.isPending}>
          {updateAgent.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </Button>
      </div>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">Configuração</TabsTrigger>
          <TabsTrigger value="knowledge">Conhecimento</TabsTrigger>
          <TabsTrigger value="documents">Documentos</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Informações Básicas</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-4">
                <AgentIconPicker value={form.icon || "bot"} onChange={(v) => set("icon", v)} />
                <div className="flex-1 space-y-3">
                  <div>
                    <Label>Nome</Label>
                    <Input value={form.name || ""} onChange={(e) => set("name", e.target.value)} />
                  </div>
                  <div>
                    <Label>Descrição</Label>
                    <Input value={form.description || ""} onChange={(e) => set("description", e.target.value)} placeholder="Breve descrição do agente" />
                  </div>
                </div>
              </div>
              <div>
                <Label>Prompt / Instruções</Label>
                <Textarea value={form.prompt || ""} onChange={(e) => set("prompt", e.target.value)} rows={6} placeholder="Instruções para o agente..." />
              </div>
              <div>
                <Label>Informações do Produto</Label>
                <Textarea value={form.product_info || ""} onChange={(e) => set("product_info", e.target.value)} rows={4} placeholder="Descreva seu produto/serviço, planos, preços..." />
              </div>
              <div>
                <Label>FAQ</Label>
                <Textarea value={form.faq || ""} onChange={(e) => set("faq", e.target.value)} rows={4} placeholder="Pergunta: ...&#10;Resposta: ..." />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Mensagem de Boas-vindas</Label>
                  <Textarea value={form.welcome_message || ""} onChange={(e) => set("welcome_message", e.target.value)} rows={3} placeholder="Primeira mensagem ao contato" />
                </div>
                <div>
                  <Label>Mensagem de Ausência</Label>
                  <Textarea value={form.away_message || ""} onChange={(e) => set("away_message", e.target.value)} rows={3} placeholder="Resposta fora do horário" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2"><Settings2 className="h-4 w-4" /> Configurações Avançadas</CardTitle>
                    <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-6">
                  {/* Guardrails */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Guardrails</h4>
                    <div className="space-y-3">
                      {[
                        { key: "restrict_topic", label: "Restringir ao assunto treinado", desc: "Redireciona perguntas fora de escopo" },
                        { key: "block_external_search", label: "Bloquear busca externa", desc: "Nunca sugere pesquisar na internet" },
                        { key: "humanized_mode", label: "Modo humanizado", desc: "Nunca revela que é IA" },
                      ].map((item) => (
                        <div key={item.key} className="flex items-center justify-between rounded-lg border p-3">
                          <div>
                            <p className="text-sm font-medium">{item.label}</p>
                            <p className="text-xs text-muted-foreground">{item.desc}</p>
                          </div>
                          <Switch checked={form[item.key] ?? true} onCheckedChange={(v) => set(item.key, v)} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Model */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Modelo de IA</h4>
                    <Select value={form.ai_model || "__global__"} onValueChange={(v) => set("ai_model", v === "__global__" ? null : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__global__">Usar modelo global</SelectItem>
                        {AI_MODEL_GROUPS.map((group) => (
                          <SelectGroup key={group.provider}>
                            <SelectLabel>{group.provider}</SelectLabel>
                            {group.models.map((m) => (
                              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Parameters */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Parâmetros</h4>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <Label>Temperatura</Label>
                        <span className="text-muted-foreground">{Number(form.temperature ?? 0.7).toFixed(1)}</span>
                      </div>
                      <Slider value={[Number(form.temperature ?? 0.7)]} min={0} max={1} step={0.1} onValueChange={([v]) => set("temperature", v)} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div><Label>Max Tokens</Label><Input type="number" value={form.max_tokens ?? 4096} onChange={(e) => set("max_tokens", parseInt(e.target.value))} /></div>
                      <div><Label>Contexto (msgs)</Label><Input type="number" value={form.context_limit ?? 20} onChange={(e) => set("context_limit", parseInt(e.target.value))} /></div>
                      <div><Label>Idioma</Label><Input value={form.language ?? "pt-BR"} onChange={(e) => set("language", e.target.value)} /></div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><Label>Nome de exibição</Label><Input value={form.display_name ?? ""} onChange={(e) => set("display_name", e.target.value)} placeholder="Nome que o agente usa" /></div>
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div><p className="text-sm font-medium">Terminar com pergunta</p></div>
                        <Switch checked={form.end_with_question ?? false} onCheckedChange={(v) => set("end_with_question", v)} />
                      </div>
                    </div>
                  </div>

                  {/* Timing */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Timing</h4>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div><Label>Delay (seg)</Label><Input type="number" value={form.response_delay_seconds ?? 0} onChange={(e) => set("response_delay_seconds", parseInt(e.target.value))} /></div>
                      <div><Label>Buffer (seg)</Label><Input type="number" value={form.message_buffer_seconds ?? 0} onChange={(e) => set("message_buffer_seconds", parseInt(e.target.value))} /></div>
                      <div><Label>Rate limit/min</Label><Input type="number" value={form.rate_limit_per_minute ?? 5} onChange={(e) => set("rate_limit_per_minute", parseInt(e.target.value))} /></div>
                    </div>
                  </div>

                  {/* Business Hours */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Horário de Funcionamento</h4>
                      <Switch checked={!!(form.business_hours_start && form.business_hours_end)} onCheckedChange={(v) => { if (!v) { set("business_hours_start", null); set("business_hours_end", null); } else { set("business_hours_start", "08:00"); set("business_hours_end", "18:00"); } }} />
                    </div>
                    {form.business_hours_start && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div><Label>Início</Label><Input type="time" value={form.business_hours_start} onChange={(e) => set("business_hours_start", e.target.value)} /></div>
                        <div><Label>Fim</Label><Input type="time" value={form.business_hours_end} onChange={(e) => set("business_hours_end", e.target.value)} /></div>
                      </div>
                    )}
                  </div>

                  {/* Follow-up */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Follow-up</h4>
                      <Switch checked={form.followup_enabled ?? false} onCheckedChange={(v) => set("followup_enabled", v)} />
                    </div>
                    {form.followup_enabled && (
                      <div><Label>Delay (minutos)</Label><Input type="number" value={form.followup_delay_minutes ?? 30} onChange={(e) => set("followup_delay_minutes", parseInt(e.target.value))} /></div>
                    )}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </TabsContent>

        <TabsContent value="knowledge" className="mt-4">
          <KnowledgeTab agentId={id!} />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <DocumentsTab agentId={id!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
