import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, Globe, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getConversations, updateLeadStage } from "@/lib/supabase-helpers";
import { useState } from "react";
import { toast } from "sonner";

type LeadStage = "novo" | "qualificado" | "proposta" | "fechado" | "perdido";

const stages: { key: LeadStage; label: string; color: string }[] = [
  { key: "novo", label: "Novo Lead", color: "bg-info/10 border-info/30" },
  { key: "qualificado", label: "Qualificado", color: "bg-primary/10 border-primary/30" },
  { key: "proposta", label: "Proposta", color: "bg-warning/10 border-warning/30" },
  { key: "fechado", label: "Fechado ✓", color: "bg-success/10 border-success/30" },
  { key: "perdido", label: "Perdido", color: "bg-destructive/10 border-destructive/30" },
];

export default function FunnelPage() {
  const queryClient = useQueryClient();
  const [dragging, setDragging] = useState<string | null>(null);

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: getConversations,
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => updateLeadStage(id, stage),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
    onError: () => toast.error("Erro ao mover lead"),
  });

  const onDragStart = (id: string) => setDragging(id);

  const onDrop = (stage: LeadStage) => {
    if (!dragging) return;
    moveMutation.mutate({ id: dragging, stage });
    setDragging(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Funil de Vendas</h1>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((s) => {
          const stageConvs = conversations.filter((c) => c.lead_stage === s.key);
          return (
            <div
              key={s.key}
              className={cn("flex w-64 shrink-0 flex-col rounded-xl border-2 border-dashed p-3", s.color)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(s.key)}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{s.label}</h3>
                <Badge variant="secondary" className="text-xs">
                  {stageConvs.length}
                </Badge>
              </div>

              <div className="space-y-2">
                {stageConvs.map((conv) => (
                  <Card
                    key={conv.id}
                    draggable
                    onDragStart={() => onDragStart(conv.id)}
                    className="cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow"
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        {conv.channel === "whatsapp" ? (
                          <Phone className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Globe className="h-3.5 w-3.5 text-info" />
                        )}
                        <span className="text-sm font-medium">{conv.contact_name}</span>
                      </div>
                      {conv.contact_phone && (
                        <p className="mt-1 text-xs text-muted-foreground">{conv.contact_phone}</p>
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </CardContent>
                  </Card>
                ))}
                {stageConvs.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">Nenhum lead</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
