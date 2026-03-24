import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Clock } from "lucide-react";

interface Props {
  delayMin: number;
  delayMax: number;
  simulateTyping: boolean;
  onDelayMinChange: (v: number) => void;
  onDelayMaxChange: (v: number) => void;
  onSimulateTypingChange: (v: boolean) => void;
}

export default function HumanBehaviorSection({
  delayMin, delayMax, simulateTyping,
  onDelayMinChange, onDelayMaxChange, onSimulateTypingChange,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Comportamento Humano</CardTitle>
        </div>
        <CardDescription>Simule o tempo de resposta de um atendente real</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Delay mínimo</Label>
            <span className="text-sm text-muted-foreground">{delayMin}s</span>
          </div>
          <Slider
            value={[delayMin]}
            onValueChange={([v]) => onDelayMinChange(v)}
            min={1} max={30} step={1}
          />
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Delay máximo</Label>
            <span className="text-sm text-muted-foreground">{delayMax}s</span>
          </div>
          <Slider
            value={[delayMax]}
            onValueChange={([v]) => onDelayMaxChange(v)}
            min={1} max={60} step={1}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label>Simular digitação</Label>
            <p className="text-xs text-muted-foreground">Envia status "digitando..." antes de responder</p>
          </div>
          <Switch checked={simulateTyping} onCheckedChange={onSimulateTypingChange} />
        </div>
      </CardContent>
    </Card>
  );
}
