import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Trash2, Clock } from "lucide-react";
import GroupMediaUpload from "./GroupMediaUpload";
import { GroupTemplate } from "./TemplatesTab";
import { toast } from "sonner";

export interface GroupMessage {
  id: string;
  group_id: string;
  content: string;
  image_url: string | null;
  audio_url: string | null;
  schedule_enabled: boolean;
  schedule_interval_hours: number;
  last_sent_at: string | null;
  next_send_at: string | null;
}

const SCHEDULE_INTERVALS = [
  { value: "6", label: "A cada 6 horas" },
  { value: "12", label: "A cada 12 horas" },
  { value: "24", label: "A cada 24 horas" },
  { value: "48", label: "A cada 48 horas" },
  { value: "168", label: "Semanal" },
];

interface ScheduledMessageItemProps {
  message: GroupMessage;
  templates: GroupTemplate[];
  hasInstance: boolean;
  sending: boolean;
  onContentChange: (messageId: string, content: string) => void;
  onImageChange: (messageId: string, url: string | null) => void;
  onAudioChange: (messageId: string, url: string | null) => void;
  onSendNow: (messageId: string) => void;
  onScheduleToggle: (messageId: string, enabled: boolean) => void;
  onIntervalChange: (messageId: string, hours: string) => void;
  onDelete: (messageId: string) => void;
}

export default function ScheduledMessageItem({
  message: m, templates, hasInstance, sending,
  onContentChange, onImageChange, onAudioChange,
  onSendNow, onScheduleToggle, onIntervalChange, onDelete,
}: ScheduledMessageItemProps) {
  const applyTemplate = (templateId: string) => {
    const t = templates.find(tp => tp.id === templateId);
    if (!t) return;
    onContentChange(m.id, t.content);
    onImageChange(m.id, t.image_url);
    onAudioChange(m.id, t.audio_url);
    toast.success(`Template "${t.name}" aplicado`);
  };

  return (
    <div className="border rounded-md p-3 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Envio</span>
        </div>
        <div className="flex items-center gap-1">
          {templates.length > 0 && (
            <Select onValueChange={applyTemplate}>
              <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue placeholder="Template..." /></SelectTrigger>
              <SelectContent>
                {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(m.id)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      <Textarea
        placeholder="Digite a mensagem..."
        value={m.content}
        onChange={e => onContentChange(m.id, e.target.value)}
        rows={2}
        className="min-h-[60px]"
      />

      <GroupMediaUpload
        imageUrl={m.image_url}
        audioUrl={m.audio_url}
        onImageChange={url => onImageChange(m.id, url)}
        onAudioChange={url => onAudioChange(m.id, url)}
      />

      <Button onClick={() => onSendNow(m.id)} disabled={sending || !hasInstance} className="w-full" size="sm">
        <Send className="mr-2 h-4 w-4" />
        {sending ? "Enviando..." : "Enviar Agora"}
      </Button>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Agendamento</span>
          <Switch checked={m.schedule_enabled} onCheckedChange={v => onScheduleToggle(m.id, v)} />
        </div>
        <Select value={String(m.schedule_interval_hours)} onValueChange={v => onIntervalChange(m.id, v)}>
          <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SCHEDULE_INTERVALS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {m.next_send_at && m.schedule_enabled && (
        <p className="text-xs text-muted-foreground">Próximo: {new Date(m.next_send_at).toLocaleString("pt-BR")}</p>
      )}
      {m.last_sent_at && (
        <p className="text-xs text-muted-foreground">Último: {new Date(m.last_sent_at).toLocaleString("pt-BR")}</p>
      )}
    </div>
  );
}
