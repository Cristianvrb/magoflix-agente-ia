import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Trash2, UserPlus, UserMinus, Plus, ChevronDown, Send } from "lucide-react";
import ScheduledMessageItem, { GroupMessage } from "./ScheduledMessageItem";
import { GroupTemplate } from "./TemplatesTab";
import { useState } from "react";

interface Group {
  id: string;
  wa_group_id: string;
  name: string;
  instance_id: string | null;
  agent_id: string | null;
  enabled: boolean;
  respond_mode: string;
  members_joined: number;
  members_left: number;
}

interface Instance { id: string; name: string; }
interface Agent { id: string; name: string; }

const RESPOND_MODES = [
  { value: "send_only", label: "Apenas envio" },
  { value: "all", label: "Responder tudo" },
  { value: "mention", label: "Só quando mencionado" },
  { value: "none", label: "Apenas monitorar" },
];

interface GroupCardProps {
  group: Group;
  messages: GroupMessage[];
  instances: Instance[];
  agents: Agent[];
  templates: GroupTemplate[];
  sendingMap: Record<string, boolean>;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onUpdate: (id: string, field: string, value: string | null) => void;
  onDelete: (id: string) => void;
  onAddMessage: (groupId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onMessageContentChange: (messageId: string, content: string) => void;
  onMessageImageChange: (messageId: string, url: string | null) => void;
  onMessageAudioChange: (messageId: string, url: string | null) => void;
  onSendNow: (messageId: string) => void;
  onScheduleToggle: (messageId: string, enabled: boolean) => void;
  onIntervalChange: (messageId: string, hours: string) => void;
}

export default function GroupCard({
  group: g, messages, instances, agents, templates,
  sendingMap, selected,
  onToggleSelect, onToggle, onUpdate, onDelete,
  onAddMessage, onDeleteMessage,
  onMessageContentChange, onMessageImageChange, onMessageAudioChange,
  onSendNow, onScheduleToggle, onIntervalChange,
}: GroupCardProps) {
  const [open, setOpen] = useState(true);
  const instanceName = instances.find(i => i.id === g.instance_id)?.name;
  const activeCount = messages.filter(m => m.schedule_enabled).length;

  return (
    <Card className={!g.enabled ? "opacity-60" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Checkbox checked={selected} onCheckedChange={() => onToggleSelect(g.id)} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base truncate">{g.name || g.wa_group_id}</CardTitle>
              {instanceName && (
                <Badge variant="outline" className="text-[10px] shrink-0">{instanceName}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{g.wa_group_id}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch checked={g.enabled} onCheckedChange={v => onToggle(g.id, v)} />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(g.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Modo de resposta</Label>
            <Select value={g.respond_mode} onValueChange={v => onUpdate(g.id, "respond_mode", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESPOND_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Instância</Label>
            <Select value={g.instance_id || "__none__"} onValueChange={v => onUpdate(g.id, "instance_id", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhuma</SelectItem>
                {instances.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Agente IA</Label>
            <Select value={g.agent_id || "__none__"} onValueChange={v => onUpdate(g.id, "agent_id", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nenhum" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhum</SelectItem>
                {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-3">
          <Badge variant="secondary" className="gap-1">
            <UserPlus className="h-3 w-3" />+{g.members_joined}
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <UserMinus className="h-3 w-3" />-{g.members_left}
          </Badge>
        </div>

        <Separator />

        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between px-2 h-8">
              <span className="text-sm font-medium flex items-center gap-2">
                <Send className="h-4 w-4" />
                Envios ({messages.length})
                {activeCount > 0 && (
                  <Badge variant="default" className="text-[10px] h-5">{activeCount} ativo(s)</Badge>
                )}
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-2">
            {messages.map(m => (
              <ScheduledMessageItem
                key={m.id}
                message={m}
                templates={templates}
                hasInstance={!!g.instance_id}
                sending={sendingMap[m.id] || false}
                onContentChange={onMessageContentChange}
                onImageChange={onMessageImageChange}
                onAudioChange={onMessageAudioChange}
                onSendNow={onSendNow}
                onScheduleToggle={onScheduleToggle}
                onIntervalChange={onIntervalChange}
                onDelete={onDeleteMessage}
              />
            ))}
            {!g.instance_id && messages.length === 0 && (
              <p className="text-xs text-destructive">Vincule uma instância para enviar.</p>
            )}
            <Button variant="outline" size="sm" className="w-full" onClick={() => onAddMessage(g.id)}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar envio
            </Button>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
