import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Copy, FileText } from "lucide-react";
import GroupMediaUpload from "./GroupMediaUpload";

export interface GroupTemplate {
  id: string;
  name: string;
  content: string;
  image_url: string | null;
  audio_url: string | null;
  created_at: string;
}

interface TemplatesTabProps {
  templates: GroupTemplate[];
  onRefresh: () => void;
}

export default function TemplatesTab({ templates, onRefresh }: TemplatesTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", content: "", image_url: null as string | null, audio_url: null as string | null });

  const resetForm = () => {
    setForm({ name: "", content: "", image_url: null, audio_url: null });
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Informe o nome do template"); return; }
    if (!form.content.trim() && !form.image_url && !form.audio_url) { toast.error("Adicione conteúdo ao template"); return; }

    if (editingId) {
      const { error } = await (supabase.from("group_templates" as any).update({
        name: form.name.trim(),
        content: form.content,
        image_url: form.image_url,
        audio_url: form.audio_url,
      }).eq("id", editingId) as any);
      if (error) { toast.error(error.message); return; }
      toast.success("Template atualizado!");
    } else {
      const { error } = await (supabase.from("group_templates" as any).insert({
        name: form.name.trim(),
        content: form.content,
        image_url: form.image_url,
        audio_url: form.audio_url,
      }) as any);
      if (error) { toast.error(error.message); return; }
      toast.success("Template criado!");
    }
    resetForm();
    setDialogOpen(false);
    onRefresh();
  };

  const handleEdit = (t: GroupTemplate) => {
    setForm({ name: t.name, content: t.content, image_url: t.image_url, audio_url: t.audio_url });
    setEditingId(t.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este template?")) return;
    await (supabase.from("group_templates" as any).delete().eq("id", id) as any);
    toast.success("Template excluído");
    onRefresh();
  };

  const handleDuplicate = async (t: GroupTemplate) => {
    await (supabase.from("group_templates" as any).insert({
      name: `${t.name} (cópia)`,
      content: t.content,
      image_url: t.image_url,
      audio_url: t.audio_url,
    }) as any);
    toast.success("Template duplicado!");
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{templates.length} template(s)</p>
        <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" />Novo Template</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? "Editar Template" : "Novo Template"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Promoção Semanal" />
              </div>
              <div>
                <Label>Mensagem</Label>
                <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="Texto da mensagem..." rows={5} />
              </div>
              <GroupMediaUpload
                imageUrl={form.image_url}
                audioUrl={form.audio_url}
                onImageChange={url => setForm(f => ({ ...f, image_url: url }))}
                onAudioChange={url => setForm(f => ({ ...f, audio_url: url }))}
              />
              <Button onClick={handleSave} className="w-full">{editingId ? "Salvar Alterações" : "Criar Template"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhum template criado.</p>
            <p className="text-sm text-muted-foreground">Crie templates para reutilizar mensagens em múltiplos grupos.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map(t => (
            <Card key={t.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <h3 className="font-medium text-sm">{t.name}</h3>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDuplicate(t)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(t.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3">{t.content || "(sem texto)"}</p>
                <div className="flex gap-2">
                  {t.image_url && <img src={t.image_url} alt="" className="h-12 w-12 rounded object-cover border" />}
                  {t.audio_url && <span className="text-xs bg-muted px-2 py-1 rounded">🎵 Áudio</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
