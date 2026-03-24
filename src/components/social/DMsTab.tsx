import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Mail, Send, User } from "lucide-react";

export function DMsTab() {
  const queryClient = useQueryClient();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const { data: dms, isLoading } = useQuery({
    queryKey: ["social-dms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_dms")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const replyMutation = useMutation({
    mutationFn: async ({ dmId, recipientId, platform }: { dmId: string; recipientId: string; platform: string }) => {
      const res = await supabase.functions.invoke("social-reply-dm", {
        body: { dm_id: dmId, recipient_id: recipientId, message: replyText, platform },
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: () => {
      toast.success("Resposta enviada!");
      setReplyingTo(null);
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["social-dms"] });
    },
    onError: () => toast.error("Erro ao responder DM"),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Carregando...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" /> Mensagens Diretas
        </h2>
        <Badge variant="secondary">{dms?.length || 0} total</Badge>
      </div>

      {(!dms || dms.length === 0) ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhuma DM recebida ainda</p>
            <p className="text-xs text-muted-foreground mt-1">As mensagens diretas aparecerão aqui quando o webhook estiver ativo</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {dms.map((dm) => (
            <Card key={dm.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm text-foreground">{dm.sender_name}</span>
                    <Badge variant="outline" className="text-xs">{dm.platform}</Badge>
                  </div>
                  <Badge variant={dm.reply_content ? "default" : "secondary"}>
                    {dm.reply_content ? "Respondido" : "Pendente"}
                  </Badge>
                </div>

                <p className="text-sm text-foreground">{dm.content}</p>

                {dm.reply_content && (
                  <div className="bg-muted rounded-md p-2 text-sm text-muted-foreground">
                    <span className="font-medium">Resposta:</span> {dm.reply_content}
                  </div>
                )}

                {!dm.reply_content && (
                  <>
                    {replyingTo === dm.id ? (
                      <div className="flex gap-2">
                        <Input
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Escreva sua resposta..."
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={() => replyMutation.mutate({ dmId: dm.id, recipientId: dm.sender_id || "", platform: dm.platform })}
                          disabled={!replyText || replyMutation.isPending}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setReplyingTo(null)}>
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setReplyingTo(dm.id)}>
                        Responder
                      </Button>
                    )}
                  </>
                )}

                <p className="text-xs text-muted-foreground">
                  {new Date(dm.created_at).toLocaleString("pt-BR")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
