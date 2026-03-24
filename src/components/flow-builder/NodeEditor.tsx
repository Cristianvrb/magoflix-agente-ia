import { type Node } from "@xyflow/react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X, Plus, Trash2, Upload, Volume2, Copy, MessageSquare, ImageIcon, Mic, Timer, GitBranch, Bot, UserCheck, Shuffle, Clock, Contact, FileText, Film } from "lucide-react";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";

const nodeTypeMeta: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  trigger: { label: "Gatilho", icon: GitBranch, color: "bg-amber-600" },
  text_message: { label: "Texto", icon: MessageSquare, color: "bg-emerald-600" },
  audio_ptt: { label: "Áudio PTT", icon: Mic, color: "bg-violet-600" },
  image_message: { label: "Imagem", icon: ImageIcon, color: "bg-sky-600" },
  delay: { label: "Delay", icon: Timer, color: "bg-orange-500" },
  condition: { label: "Condição", icon: GitBranch, color: "bg-yellow-600" },
  transfer_ai: { label: "Transferir IA", icon: Bot, color: "bg-blue-600" },
  transfer_human: { label: "Transferir Humano", icon: UserCheck, color: "bg-pink-600" },
  randomizer: { label: "Randomizer", icon: Shuffle, color: "bg-fuchsia-600" },
  wait_response: { label: "Aguardar Resposta", icon: Clock, color: "bg-cyan-600" },
  contact_message: { label: "Contato", icon: Contact, color: "bg-purple-600" },
  document_message: { label: "Documento", icon: FileText, color: "bg-rose-500" },
  video_message: { label: "Vídeo", icon: Film, color: "bg-green-600" },
};

interface NodeEditorProps {
  node: Node;
  onChange: (id: string, data: Record<string, any>) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export function NodeEditor({ node, onChange, onClose, onDelete, onDuplicate }: NodeEditorProps) {
  const d = node.data as Record<string, any>;
  const update = (key: string, value: any) => onChange(node.id, { ...d, [key]: value });
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const meta = nodeTypeMeta[node.type || ""] || { label: "Bloco", icon: GitBranch, color: "bg-muted" };
  const IconComp = meta.icon;

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 10MB.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "ogg";
      const path = `flow-audio/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error } = await supabase.storage.from("chat-media").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(path);
      update("audioUrl", urlData.publicUrl);
      toast.success("Áudio enviado!");
    } catch (err: any) {
      toast.error("Erro ao enviar: " + (err.message || ""));
    } finally {
      setUploading(false);
      if (audioInputRef.current) audioInputRef.current.value = "";
    }
  };

  return (
    <div className="w-72 border-l bg-card p-4 space-y-4 overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`${meta.color} rounded-md p-1.5`}>
            <IconComp className="h-3.5 w-3.5 text-white" />
          </div>
          <h3 className="text-sm font-semibold">{meta.label}</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <div className="flex-1 space-y-4">
        {node.type === "trigger" && (
          <>
            <div>
              <Label className="text-xs">Tipo de Gatilho</Label>
              <select
                className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm"
                value={d.triggerType || "first_message"}
                onChange={(e) => update("triggerType", e.target.value)}
              >
                <option value="first_message">Primeira mensagem</option>
                <option value="keyword">Palavra-chave</option>
              </select>
            </div>
            {d.triggerType === "keyword" && (
              <div>
                <Label className="text-xs">Palavras-chave (separadas por vírgula)</Label>
                <Input value={d.keywords || ""} onChange={(e) => update("keywords", e.target.value)} placeholder="oi, olá, hello" />
              </div>
            )}
          </>
        )}

        {node.type === "text_message" && (
          <div>
            <Label className="text-xs">Mensagem</Label>
            <Textarea value={d.content || ""} onChange={(e) => update("content", e.target.value)} rows={4} placeholder="Digite a mensagem..." />
          </div>
        )}

        {node.type === "audio_ptt" && (
          <div className="space-y-3">
            <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-primary" />
                <Label className="text-xs font-medium">Upload de Áudio</Label>
              </div>
              {d.audioUrl ? (
                <div className="flex items-center gap-2">
                  <audio controls src={d.audioUrl} className="flex-1 h-8" />
                  <Button variant="destructive" size="icon" className="h-8 w-8 shrink-0" onClick={() => update("audioUrl", "")} title="Remover áudio">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div>
                  <input ref={audioInputRef} type="file" accept=".mp3,.ogg,.m4a,.wav,.opus" onChange={handleAudioUpload} className="hidden" />
                  <Button variant="outline" size="sm" onClick={() => audioInputRef.current?.click()} disabled={uploading} className="w-full">
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {uploading ? "Enviando..." : "Fazer upload do áudio"}
                  </Button>
                  <p className="text-[10px] text-muted-foreground mt-1">MP3, OGG, M4A, WAV, OPUS — máx 10MB</p>
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">Ou cole a URL do áudio</Label>
              <Input value={d.audioUrl || ""} onChange={(e) => update("audioUrl", e.target.value)} placeholder="https://..." className="mt-1" />
            </div>
          </div>
        )}

        {node.type === "image_message" && (
          <div className="space-y-3">
            <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-primary" />
                <Label className="text-xs font-medium">Imagem</Label>
              </div>
              {d.imageUrl ? (
                <div className="space-y-2">
                  <img src={d.imageUrl} alt="Preview" className="w-full h-24 object-cover rounded" />
                  <Button variant="destructive" size="sm" className="w-full" onClick={() => update("imageUrl", "")}> 
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Remover imagem
                  </Button>
                </div>
              ) : (
                <div>
                  <input ref={audioInputRef} type="file" accept="image/*" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande. Máximo 10MB."); return; }
                    setUploading(true);
                    try {
                      const ext = file.name.split(".").pop() || "jpg";
                      const path = `flow-images/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
                      const { error } = await supabase.storage.from("chat-media").upload(path, file, { contentType: file.type, upsert: false });
                      if (error) throw error;
                      const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(path);
                      update("imageUrl", urlData.publicUrl);
                      toast.success("Imagem enviada!");
                    } catch (err: any) { toast.error("Erro ao enviar: " + (err.message || "")); }
                    finally { setUploading(false); if (audioInputRef.current) audioInputRef.current.value = ""; }
                  }} className="hidden" />
                  <Button variant="outline" size="sm" onClick={() => audioInputRef.current?.click()} disabled={uploading} className="w-full">
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {uploading ? "Enviando..." : "Fazer upload da imagem"}
                  </Button>
                  <p className="text-[10px] text-muted-foreground mt-1">JPG, PNG, WEBP — máx 10MB</p>
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">Ou cole a URL da imagem</Label>
              <Input value={d.imageUrl || ""} onChange={(e) => update("imageUrl", e.target.value)} placeholder="https://..." className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Legenda</Label>
              <Textarea value={d.caption || ""} onChange={(e) => update("caption", e.target.value)} rows={2} placeholder="Legenda opcional" className="mt-1" />
            </div>
          </div>
        )}

        {node.type === "delay" && (
          <div>
            <Label className="text-xs">Segundos</Label>
            <Input type="number" min={1} max={300} value={d.seconds || 5} onChange={(e) => update("seconds", parseInt(e.target.value) || 5)} />
          </div>
        )}

        {node.type === "condition" && (
          <div className="space-y-2">
            <Label className="text-xs">Opções</Label>
            {(d.options || ["Opção 1", "Opção 2"]).map((opt: string, i: number) => (
              <div key={i} className="flex gap-1">
                <Input
                  value={opt}
                  onChange={(e) => {
                    const opts = [...(d.options || ["Opção 1", "Opção 2"])];
                    opts[i] = e.target.value;
                    update("options", opts);
                  }}
                  className="text-sm"
                />
                {(d.options || []).length > 2 && (
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => {
                    const opts = [...(d.options || [])];
                    opts.splice(i, 1);
                    update("options", opts);
                  }}><Trash2 className="h-3 w-3" /></Button>
                )}
              </div>
            ))}
            {(d.options || []).length < 5 && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => update("options", [...(d.options || ["Opção 1", "Opção 2"]), `Opção ${(d.options || []).length + 1}`])}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar
              </Button>
            )}
          </div>
        )}

        {node.type === "transfer_human" && (
          <div>
            <Label className="text-xs">Mensagem de Transferência</Label>
            <Textarea value={d.message || ""} onChange={(e) => update("message", e.target.value)} rows={3} placeholder="Um atendente irá te ajudar..." />
          </div>
        )}

        {node.type === "transfer_ai" && (
          <p className="text-xs text-muted-foreground">Este bloco transfere o controle para a IA do agente. Sem configuração adicional.</p>
        )}

        {node.type === "randomizer" && (
          <div>
            <Label className="text-xs">Número de Saídas</Label>
            <Input type="number" min={2} max={4} value={d.outputs || 2} onChange={(e) => update("outputs", Math.min(4, Math.max(2, parseInt(e.target.value) || 2)))} />
            <p className="text-[10px] text-muted-foreground mt-1">O fluxo seguirá aleatoriamente por uma das saídas (2-4)</p>
          </div>
        )}

        {node.type === "wait_response" && (
          <div>
            <Label className="text-xs">Timeout (segundos)</Label>
            <Input type="number" min={0} max={3600} value={d.timeoutSeconds || 0} onChange={(e) => update("timeoutSeconds", parseInt(e.target.value) || 0)} />
            <p className="text-[10px] text-muted-foreground mt-1">0 = sem timeout (espera indefinidamente)</p>
          </div>
        )}

        {node.type === "contact_message" && (
          <>
            <div>
              <Label className="text-xs">Nome do Contato</Label>
              <Input value={d.contactName || ""} onChange={(e) => update("contactName", e.target.value)} placeholder="João Silva" />
            </div>
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input value={d.contactPhone || ""} onChange={(e) => update("contactPhone", e.target.value)} placeholder="5511999999999" />
            </div>
          </>
        )}

        {node.type === "document_message" && (
          <>
            <div>
              <Label className="text-xs">URL do Documento</Label>
              <Input value={d.documentUrl || ""} onChange={(e) => update("documentUrl", e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <Label className="text-xs">Legenda</Label>
              <Textarea value={d.caption || ""} onChange={(e) => update("caption", e.target.value)} rows={2} placeholder="Legenda opcional" className="mt-1" />
            </div>
          </>
        )}

        {node.type === "video_message" && (
          <>
            <div>
              <Label className="text-xs">URL do Vídeo</Label>
              <Input value={d.videoUrl || ""} onChange={(e) => update("videoUrl", e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <Label className="text-xs">Legenda</Label>
              <Textarea value={d.caption || ""} onChange={(e) => update("caption", e.target.value)} rows={2} placeholder="Legenda opcional" className="mt-1" />
            </div>
          </>
        )}
      </div>

      <Separator />
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={() => onDuplicate(node.id)}>
          <Copy className="h-3.5 w-3.5 mr-1.5" />
          Duplicar
        </Button>
        <Button variant="destructive" size="sm" className="flex-1" onClick={() => onDelete(node.id)}>
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          Excluir
        </Button>
      </div>
    </div>
  );
}
