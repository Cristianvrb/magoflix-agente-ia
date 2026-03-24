import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, Plus, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const CATEGORIES = [
  { value: "payment", label: "Pagamento", color: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  { value: "strategy", label: "Estratégia", color: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
  { value: "feature", label: "Feature", color: "bg-violet-500/15 text-violet-700 border-violet-500/30" },
  { value: "bugfix", label: "Bugfix", color: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
];

function getCategoryStyle(cat: string) {
  return CATEGORIES.find((c) => c.value === cat)?.color ?? "bg-muted text-muted-foreground";
}

function getCategoryLabel(cat: string) {
  return CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}

export default function ChangelogTab() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("strategy");
  const [showForm, setShowForm] = useState(false);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["changelog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("changelog" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("changelog" as any).insert({
        title,
        description,
        category,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["changelog"] });
      setTitle("");
      setDescription("");
      setCategory("strategy");
      setShowForm(false);
      toast.success("Registro adicionado!");
    },
    onError: () => toast.error("Erro ao adicionar registro"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Log de Mudanças</CardTitle>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
              <Plus className="h-4 w-4 mr-1" />
              Nova entrada
            </Button>
          </div>
          <CardDescription>Registre mudanças estratégicas para acompanhar impacto nas métricas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {showForm && (
            <Card className="border-dashed">
              <CardContent className="pt-4 space-y-3">
                <div className="space-y-1">
                  <Label>Título</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Mudança na lógica de pagamento" />
                </div>
                <div className="space-y-1">
                  <Label>Descrição</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhe o que mudou e por quê" rows={3} />
                </div>
                <div className="space-y-1">
                  <Label>Categoria</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => addMutation.mutate()} disabled={!title.trim() || addMutation.isPending} size="sm">
                  {addMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  Salvar
                </Button>
              </CardContent>
            </Card>
          )}

          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum registro ainda.</p>
          ) : (
            <div className="relative pl-6 space-y-6">
              <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
              {entries.map((entry: any) => (
                <div key={entry.id} className="relative">
                  <div className="absolute -left-[18px] top-1 h-3 w-3 rounded-full bg-primary border-2 border-background" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(entry.created_at), "dd MMM yyyy, HH:mm", { locale: ptBR })}
                      </span>
                      <Badge variant="outline" className={getCategoryStyle(entry.category)}>
                        {getCategoryLabel(entry.category)}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium">{entry.title}</p>
                    {entry.description && (
                      <p className="text-xs text-muted-foreground">{entry.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
