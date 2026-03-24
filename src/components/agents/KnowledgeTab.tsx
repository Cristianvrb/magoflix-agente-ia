import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Pencil, X, Check, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface KnowledgeTabProps {
  agentId: string;
}

export function KnowledgeTab({ agentId }: KnowledgeTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");
  const [newCat, setNewCat] = useState("Geral");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQ, setEditQ] = useState("");
  const [editA, setEditA] = useState("");

  const { data: entries = [] } = useQuery({
    queryKey: ["knowledge", agentId],
    queryFn: async () => {
      const { data: links } = await supabase
        .from("agent_knowledge")
        .select("knowledge_entry_id")
        .eq("agent_id", agentId);
      if (!links?.length) return [];
      const ids = links.map((l: any) => l.knowledge_entry_id);
      const { data, error } = await supabase
        .from("knowledge_entries")
        .select("*")
        .in("id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const addEntry = useMutation({
    mutationFn: async () => {
      const { data: entry, error: e1 } = await supabase
        .from("knowledge_entries")
        .insert({ user_id: user!.id, question: newQ, answer: newA, category: newCat })
        .select()
        .single();
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("agent_knowledge")
        .insert({ agent_id: agentId, knowledge_entry_id: entry.id });
      if (e2) throw e2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge", agentId] });
      setNewQ(""); setNewA(""); setNewCat("Geral");
      toast({ title: "Conhecimento adicionado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("knowledge_entries").update({ question: editQ, answer: editA }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge", agentId] });
      setEditingId(null);
    },
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("agent_knowledge").delete().eq("knowledge_entry_id", id).eq("agent_id", agentId);
      await supabase.from("knowledge_entries").delete().eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["knowledge", agentId] }),
  });

  const filtered = entries.filter((e: any) =>
    !search || e.question.toLowerCase().includes(search.toLowerCase()) || e.answer.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Adicionar Conhecimento</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Pergunta</Label><Input value={newQ} onChange={(e) => setNewQ(e.target.value)} placeholder="Ex: Quanto custa?" /></div>
          <div><Label>Resposta</Label><Textarea value={newA} onChange={(e) => setNewA(e.target.value)} rows={3} placeholder="Resposta completa..." /></div>
          <div className="flex gap-3 items-end">
            <div className="flex-1"><Label>Categoria</Label><Input value={newCat} onChange={(e) => setNewCat(e.target.value)} /></div>
            <Button onClick={() => addEntry.mutate()} disabled={!newQ || !newA || addEntry.isPending}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar conhecimento..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="space-y-2">
        {filtered.map((entry: any) => (
          <Card key={entry.id}>
            <CardContent className="p-4">
              {editingId === entry.id ? (
                <div className="space-y-2">
                  <Input value={editQ} onChange={(e) => setEditQ(e.target.value)} />
                  <Textarea value={editA} onChange={(e) => setEditA(e.target.value)} rows={2} />
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => updateEntry.mutate(entry.id)}><Check className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{entry.question}</p>
                    <p className="text-sm text-muted-foreground mt-1">{entry.answer}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => { setEditingId(entry.id); setEditQ(entry.question); setEditA(entry.answer); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir conhecimento?</AlertDialogTitle>
                          <AlertDialogDescription>Esta entrada será removida permanentemente.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteEntry.mutate(entry.id)}>Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum conhecimento adicionado</p>
        )}
      </div>
    </div>
  );
}
