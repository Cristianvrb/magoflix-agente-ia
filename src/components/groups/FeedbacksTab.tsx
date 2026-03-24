import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Image, Copy } from "lucide-react";

export interface Feedback {
  id: string;
  user_id: string;
  image_url: string;
  description: string;
  active: boolean;
  created_at: string;
}

interface FeedbacksTabProps {
  onSelectImage?: (url: string) => void;
}

export default function FeedbacksTab({ onSelectImage }: FeedbacksTabProps) {
  const { user } = useAuth();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState("");

  const fetchFeedbacks = async () => {
    const { data } = await supabase
      .from("customer_feedbacks")
      .select("*")
      .order("created_at", { ascending: false });
    setFeedbacks((data || []) as Feedback[]);
    setLoading(false);
  };

  useEffect(() => { fetchFeedbacks(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("feedbacks")
        .upload(path, file);
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from("feedbacks")
        .getPublicUrl(path);

      const { error: insertErr } = await supabase
        .from("customer_feedbacks")
        .insert({
          user_id: user.id,
          image_url: urlData.publicUrl,
          description: description.trim(),
        });
      if (insertErr) throw insertErr;

      toast.success("Feedback adicionado!");
      setDescription("");
      fetchFeedbacks();
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    await supabase.from("customer_feedbacks").update({ active }).eq("id", id);
    setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, active } : f));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este feedback?")) return;
    await supabase.from("customer_feedbacks").delete().eq("id", id);
    setFeedbacks(prev => prev.filter(f => f.id !== id));
    toast.success("Feedback excluído");
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copiada!");
  };

  if (loading) return <p className="text-muted-foreground p-4">Carregando...</p>;

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardContent className="pt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Faça upload de prints de feedback de clientes. Eles podem ser usados em envios de grupo e como prova social pela IA nas conversas.
          </p>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Descrição (opcional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="flex-1"
            />
            <Button asChild disabled={uploading} size="sm">
              <label className="cursor-pointer">
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Upload
                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
              </label>
            </Button>
          </div>
        </CardContent>
      </Card>

      {feedbacks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Image className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhum feedback cadastrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {feedbacks.map(f => (
            <Card key={f.id} className={!f.active ? "opacity-50" : ""}>
              <CardContent className="p-3 space-y-2">
                <img
                  src={f.image_url}
                  alt={f.description || "Feedback"}
                  className="w-full rounded-md object-cover max-h-64"
                />
                {f.description && (
                  <p className="text-xs text-muted-foreground">{f.description}</p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={f.active}
                      onCheckedChange={v => handleToggle(f.id, v)}
                    />
                    <span className="text-xs">{f.active ? "Ativo" : "Inativo"}</span>
                  </div>
                  <div className="flex gap-1">
                    {onSelectImage && (
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => onSelectImage(f.image_url)} title="Usar em envio">
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => handleCopyUrl(f.image_url)} title="Copiar URL">
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="destructive" className="h-7 w-7" onClick={() => handleDelete(f.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
