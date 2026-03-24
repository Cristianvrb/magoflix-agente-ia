import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock } from "lucide-react";

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Bahia",
  "America/Fortaleza",
  "America/Recife",
  "America/Belem",
  "America/Cuiaba",
  "America/Porto_Velho",
  "America/Rio_Branco",
];

interface Props {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
  outsideMessage: string;
  onEnabledChange: (v: boolean) => void;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onTimezoneChange: (v: string) => void;
  onOutsideMessageChange: (v: string) => void;
}

export default function BusinessHoursSection({
  enabled, start, end, timezone, outsideMessage,
  onEnabledChange, onStartChange, onEndChange, onTimezoneChange, onOutsideMessageChange,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Horário de Atendimento</CardTitle>
          </div>
          <Switch checked={enabled} onCheckedChange={onEnabledChange} />
        </div>
        <CardDescription>Defina quando o agente responde automaticamente</CardDescription>
      </CardHeader>
      {enabled && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Início</Label>
              <Input type="time" value={start} onChange={(e) => onStartChange(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fim</Label>
              <Input type="time" value={end} onChange={(e) => onEndChange(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Fuso horário</Label>
            <Select value={timezone} onValueChange={onTimezoneChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz.replace("America/", "").replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Mensagem fora do horário</Label>
            <Textarea
              value={outsideMessage}
              onChange={(e) => onOutsideMessageChange(e.target.value)}
              rows={3}
              placeholder="Estamos fora do horário de atendimento..."
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
