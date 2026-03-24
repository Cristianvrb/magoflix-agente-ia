import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Power, PowerOff, Pencil, Brain, Bot, Sparkles, Rocket, Crown, Heart, Star, Shield, Zap, MessageSquare, Target, Lightbulb, Coffee, Flame, Globe, Music, Camera, BookOpen, Award, Gem, Headphones } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getModelLabel } from "@/lib/ai-models";
import type { LucideIcon } from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  bot: Bot, sparkles: Sparkles, rocket: Rocket, crown: Crown, heart: Heart,
  star: Star, shield: Shield, zap: Zap, brain: Brain, "message-square": MessageSquare,
  target: Target, lightbulb: Lightbulb, coffee: Coffee, flame: Flame, globe: Globe,
  music: Music, camera: Camera, "book-open": BookOpen, award: Award, gem: Gem, headphones: Headphones,
};

export default function AgentsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const createAgent = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .insert({ user_id: user!.id, name: "Novo Agente" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      navigate(`/agents/${data.id}`);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteAgent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast({ title: "Agente excluído" });
    },
  });

  const toggleAgent = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("agents").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agents"] }),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agentes</h1>
          <p className="text-muted-foreground text-sm">Crie e gerencie seus agentes de IA</p>
        </div>
        <Button onClick={() => createAgent.mutate()} disabled={createAgent.isPending}>
          <Plus className="h-4 w-4" /> Novo Agente
        </Button>
      </div>

      {agents.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Bot className="h-12 w-12 text-muted-foreground mb-4" />
          <CardTitle className="text-lg">Nenhum agente</CardTitle>
          <CardDescription className="mb-4">Crie seu primeiro agente de IA</CardDescription>
          <Button onClick={() => createAgent.mutate()}>
            <Plus className="h-4 w-4" /> Criar Agente
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent: any) => {
            const IconComp = ICON_MAP[agent.icon] || Bot;
            return (
              <Card key={agent.id} className="group relative shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <IconComp className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base truncate">{agent.name}</CardTitle>
                        {agent.description && (
                          <CardDescription className="text-xs line-clamp-1">{agent.description}</CardDescription>
                        )}
                      </div>
                    </div>
                    <Badge variant={agent.is_active ? "default" : "secondary"} className="text-[10px] shrink-0">
                      {agent.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-4">
                    <span>Temp: {Number(agent.temperature).toFixed(1)}</span>
                    <span>•</span>
                    <span>{getModelLabel(agent.ai_model)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/agents/${agent.id}`)}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleAgent.mutate({ id: agent.id, is_active: !agent.is_active })}
                    >
                      {agent.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir agente?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Isso excluirá permanentemente "{agent.name}" e todo o conhecimento vinculado.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteAgent.mutate(agent.id)}>Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
