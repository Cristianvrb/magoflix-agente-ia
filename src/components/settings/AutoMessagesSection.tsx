import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { MessageSquare, Upload, Trash2, Volume2 } from "lucide-react";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  welcomeMessage: string;
  followupEnabled: boolean;
  followupDelayHours: number;
  followupMessage: string;
  welcomeAudioUrl: string;
  welcomeAudioUrlEs: string;
  onWelcomeMessageChange: (v: string) => void;
  onFollowupEnabledChange: (v: boolean) => void;
  onFollowupDelayHoursChange: (v: number) => void;
  onFollowupMessageChange: (v: string) => void;
  onWelcomeAudioUrlChange: (v: string) => void;
  onWelcomeAudioUrlEsChange: (v: string) => void;
}

const ACCEPTED_AUDIO = ".mp3,.ogg,.m4a,.wav,.opus";

export default function AutoMessagesSection({
  welcomeMessage, followupEnabled, followupDelayHours, followupMessage, welcomeAudioUrl, welcomeAudioUrlEs,
  onWelcomeMessageChange, onFollowupEnabledChange, onFollowupDelayHoursChange, onFollowupMessageChange, onWelcomeAudioUrlChange, onWelcomeAudioUrlEsChange,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRefEs = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingEs, setUploadingEs] = useState(false);

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast.error("Arquivo muito grande. Máximo 10MB.");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "ogg";
      const path = `welcome-audio/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;

      const { error } = await supabase.storage
        .from("chat-media")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from("chat-media")
        .getPublicUrl(path);

      onWelcomeAudioUrlChange(urlData.publicUrl);
      toast.success("Áudio enviado com sucesso!");
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Erro ao enviar áudio: " + (err.message || ""));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveAudio = () => {
    onWelcomeAudioUrlChange("");
    toast.info("Áudio removido. Salve para confirmar.");
  };

  const handleAudioUploadEs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Archivo muy grande. Máximo 10MB.");
      return;
    }
    setUploadingEs(true);
    try {
      const ext = file.name.split(".").pop() || "ogg";
      const path = `welcome-audio/${Date.now()}_es_${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error } = await supabase.storage.from("chat-media").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(path);
      onWelcomeAudioUrlEsChange(urlData.publicUrl);
      toast.success("Audio en español enviado con éxito!");
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Error al enviar audio: " + (err.message || ""));
    } finally {
      setUploadingEs(false);
      if (fileInputRefEs.current) fileInputRefEs.current.value = "";
    }
  };

  const handleRemoveAudioEs = () => {
    onWelcomeAudioUrlEsChange("");
    toast.info("Audio español removido. Salve para confirmar.");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Mensagens Automáticas</CardTitle>
        </div>
        <CardDescription>Configure boas-vindas e follow-up automático</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Welcome Audio PTT */}
        <div className="space-y-2 rounded-lg border p-4 bg-muted/30">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-primary" />
            <Label className="font-medium">Áudio de Boas-Vindas (PTT)</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Envie um áudio gravado como mensagem de boas-vindas. Aparece no WhatsApp como se fosse gravado na hora.
          </p>

          {welcomeAudioUrl ? (
            <div className="flex items-center gap-3">
              <audio controls src={welcomeAudioUrl} className="flex-1 h-10" />
              <Button variant="destructive" size="icon" onClick={handleRemoveAudio} title="Remover áudio">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_AUDIO}
                onChange={handleAudioUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? "Enviando..." : "Fazer upload do áudio"}
              </Button>
              <p className="text-xs text-muted-foreground mt-1">MP3, OGG, M4A, WAV — máx 10MB</p>
            </div>
          )}
        </div>
        {/* Spanish Welcome Audio */}
        <div className="space-y-2 rounded-lg border p-4 bg-muted/30">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-orange-500" />
            <Label className="font-medium">Audio de Bienvenida — Español (PTT)</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Audio enviado automáticamente a leads hispanos (DDI +57, +52, +34, etc.)
          </p>

          {welcomeAudioUrlEs ? (
            <div className="flex items-center gap-3">
              <audio controls src={welcomeAudioUrlEs} className="flex-1 h-10" />
              <Button variant="destructive" size="icon" onClick={handleRemoveAudioEs} title="Remover audio">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRefEs}
                type="file"
                accept={ACCEPTED_AUDIO}
                onChange={handleAudioUploadEs}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRefEs.current?.click()}
                disabled={uploadingEs}
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploadingEs ? "Enviando..." : "Upload audio español"}
              </Button>
              <p className="text-xs text-muted-foreground mt-1">MP3, OGG, M4A, WAV — máx 10MB</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Mensagem de boas-vindas (texto)</Label>
          <Textarea
            value={welcomeMessage}
            onChange={(e) => onWelcomeMessageChange(e.target.value)}
            rows={3}
            placeholder="Enviada automaticamente para novos leads..."
          />
          <p className="text-xs text-muted-foreground">Deixe vazio para desativar. Pode usar áudio + texto juntos.</p>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label>Follow-up automático</Label>
            <p className="text-xs text-muted-foreground">Lembrete se o lead não responder</p>
          </div>
          <Switch checked={followupEnabled} onCheckedChange={onFollowupEnabledChange} />
        </div>
        {followupEnabled && (
          <>
            <div className="space-y-2">
              <Label>Delay do follow-up (horas)</Label>
              <Input
                type="number"
                min={1}
                max={168}
                value={followupDelayHours}
                onChange={(e) => onFollowupDelayHoursChange(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Mensagem de follow-up</Label>
              <Textarea
                value={followupMessage}
                onChange={(e) => onFollowupMessageChange(e.target.value)}
                rows={3}
                placeholder="Oi, tudo bem? Vi que ficou interessado..."
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
