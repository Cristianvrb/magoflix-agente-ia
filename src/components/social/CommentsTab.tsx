import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { MessageCircle, Send, User } from "lucide-react";

export function CommentsTab() {
  const queryClient = useQueryClient();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const { data: comments, isLoading } = useQuery({
    queryKey: ["social-comments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_comments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const replyMutation = useMutation({
    mutationFn: async ({ commentId, platform }: { commentId: string; platform: string }) => {
      const res = await supabase.functions.invoke("social-reply-comment", {
        body: { comment_id: commentId, reply_text: replyText, platform },
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: () => {
      toast.success("Resposta enviada!");
      setReplyingTo(null);
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["social-comments"] });
    },
    onError: () => toast.error("Erro ao responder comentário"),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Carregando...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" /> Comentários
        </h2>
        <Badge variant="secondary">{comments?.length || 0} total</Badge>
      </div>

      {(!comments || comments.length === 0) ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhum comentário recebido ainda</p>
            <p className="text-xs text-muted-foreground mt-1">Os comentários aparecerão aqui quando o webhook estiver ativo</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <Card key={comment.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm text-foreground">{comment.author_name}</span>
                    <Badge variant="outline" className="text-xs">{comment.platform}</Badge>
                  </div>
                  <Badge variant={comment.reply_content ? "default" : "secondary"}>
                    {comment.reply_content ? "Respondido" : "Pendente"}
                  </Badge>
                </div>

                <p className="text-sm text-foreground">{comment.content}</p>

                {comment.reply_content && (
                  <div className="bg-muted rounded-md p-2 text-sm text-muted-foreground">
                    <span className="font-medium">Resposta:</span> {comment.reply_content}
                  </div>
                )}

                {!comment.reply_content && (
                  <>
                    {replyingTo === comment.id ? (
                      <div className="flex gap-2">
                        <Input
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Escreva sua resposta..."
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={() => replyMutation.mutate({ commentId: comment.author_id || comment.id, platform: comment.platform })}
                          disabled={!replyText || replyMutation.isPending}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setReplyingTo(null)}>
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setReplyingTo(comment.id)}>
                        Responder
                      </Button>
                    )}
                  </>
                )}

                <p className="text-xs text-muted-foreground">
                  {new Date(comment.created_at).toLocaleString("pt-BR")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
