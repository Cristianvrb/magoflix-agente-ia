import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Send, Clock, Instagram, AtSign, Trash2, AlertCircle, CheckCircle2, FileEdit } from "lucide-react";
import { format } from "date-fns";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  draft: { label: "Rascunho", variant: "secondary", icon: FileEdit },
  scheduled: { label: "Agendado", variant: "outline", icon: Clock },
  published: { label: "Publicado", variant: "default", icon: CheckCircle2 },
  failed: { label: "Falhou", variant: "destructive", icon: AlertCircle },
};

const platformIcon = (p: string) => {
  if (p === "instagram") return <Instagram className="h-4 w-4" />;
  if (p === "threads") return <AtSign className="h-4 w-4" />;
  return (
    <div className="flex gap-1">
      <Instagram className="h-3.5 w-3.5" />
      <AtSign className="h-3.5 w-3.5" />
    </div>
  );
};

export function PostsTab() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [platform, setPlatform] = useState("both");
  const [scheduledAt, setScheduledAt] = useState("");

  const { data: posts, isLoading } = useQuery({
    queryKey: ["social-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_posts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createPost = useMutation({
    mutationFn: async (publishNow: boolean) => {
      const post: any = { content, platform, image_url: imageUrl || null };
      if (publishNow) {
        post.status = "scheduled";
        post.scheduled_at = new Date().toISOString();
        const { data, error } = await supabase.from("social_posts").insert(post).select().single();
        if (error) throw error;
        const { error: publishError } = await supabase.functions.invoke("social-publish", { body: { post_id: data.id } });
        if (publishError) throw publishError;
      } else {
        if (scheduledAt) {
          post.status = "scheduled";
          post.scheduled_at = scheduledAt;
        } else {
          post.status = "draft";
        }
        const { error } = await supabase.from("social_posts").insert(post);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      toast.success("Post criado!");
      setOpen(false);
      setContent("");
      setImageUrl("");
      setScheduledAt("");
    },
    onError: () => toast.error("Erro ao criar post"),
  });

  const deletePost = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("social_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      toast.success("Post removido");
    },
  });

  const publishPost = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke("social-publish", { body: { post_id: id } });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      toast.success("Post enviado para publicação!");
    },
    onError: () => toast.error("Erro ao publicar"),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-foreground">Posts</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Post</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Criar Post</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Conteúdo</Label>
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Texto do post..." rows={4} />
              </div>
              <div>
                <Label>URL da Imagem (opcional)</Label>
                <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <Label>Plataforma</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Instagram + Threads</SelectItem>
                    <SelectItem value="instagram">Apenas Instagram</SelectItem>
                    <SelectItem value="threads">Apenas Threads</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Agendar para (opcional)</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => createPost.mutate(false)} disabled={!content}>
                  <Clock className="h-4 w-4 mr-1" /> {scheduledAt ? "Agendar" : "Salvar Rascunho"}
                </Button>
                <Button onClick={() => createPost.mutate(true)} disabled={!content}>
                  <Send className="h-4 w-4 mr-1" /> Publicar Agora
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : !posts?.length ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum post ainda. Crie o primeiro!</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const sc = statusConfig[post.status] || statusConfig.draft;
            const Icon = sc.icon;
            return (
              <Card key={post.id} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {platformIcon(post.platform)}
                        <Badge variant={sc.variant} className="gap-1">
                          <Icon className="h-3 w-3" /> {sc.label}
                        </Badge>
                        {post.ai_generated && <Badge variant="outline" className="text-xs">IA</Badge>}
                      </div>
                      <p className="text-sm text-foreground line-clamp-2">{post.content}</p>
                      {(post as any).prompt && <p className="text-xs text-muted-foreground italic line-clamp-1">🎨 {(post as any).prompt}</p>}
                      <p className="text-xs text-muted-foreground">
                        {post.scheduled_at ? `Agendado: ${format(new Date(post.scheduled_at), "dd/MM/yyyy HH:mm")}` : format(new Date(post.created_at), "dd/MM/yyyy HH:mm")}
                      </p>
                      {post.error && <p className="text-xs text-destructive">{post.error}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {(post.status === "draft" || post.status === "failed") && (
                        <Button size="icon" variant="ghost" onClick={() => publishPost.mutate(post.id)}>
                          <Send className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => deletePost.mutate(post.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
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
