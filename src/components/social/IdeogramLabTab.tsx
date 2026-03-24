import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FlaskConical, Play, Loader2, Clock, DollarSign, Zap } from "lucide-react";

const SPEEDS = ["DEFAULT", "QUALITY", "TURBO", "FLASH"] as const;
type Speed = typeof SPEEDS[number];

const SPEED_META: Record<Speed, { cost: string; color: string; desc: string }> = {
  DEFAULT: { cost: "$0.08", color: "bg-blue-500/10 text-blue-400 border-blue-500/30", desc: "Padrão" },
  QUALITY: { cost: "$0.10", color: "bg-purple-500/10 text-purple-400 border-purple-500/30", desc: "Alta qualidade" },
  TURBO: { cost: "$0.04", color: "bg-green-500/10 text-green-400 border-green-500/30", desc: "Rápido" },
  FLASH: { cost: "$0.02", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30", desc: "Ultra rápido" },
};

const DEFAULT_PROMPT = `Design a modern, dark-themed card for MagoFlix streaming platform. Title: "TOP 5 FILMES DE AÇÃO 2025". List numbered 1-5: "Operação Final", "Fúria Urbana", "Código Vermelho", "Impacto Zero", "Resgate Mortal". Style: neon purple and blue accents, cinematic feel, bold typography. Include MagoFlix logo text at the bottom. Brazilian Portuguese text.`;

interface TestResult {
  speed: Speed;
  imageUrl: string | null;
  elapsedMs: number | null;
  loading: boolean;
  error: string | null;
}

interface HistoryItem {
  id: string;
  image_url: string | null;
  prompt: string | null;
  created_at: string;
  status: string;
}

export function IdeogramLabTab() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [styleType, setStyleType] = useState("DESIGN");
  const [aspectRatio, setAspectRatio] = useState("1x1");
  const [results, setResults] = useState<Record<Speed, TestResult>>(
    Object.fromEntries(SPEEDS.map(s => [s, { speed: s, imageUrl: null, elapsedMs: null, loading: false, error: null }])) as Record<Speed, TestResult>
  );
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [generatingAll, setGeneratingAll] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const { data } = await supabase
      .from("social_posts")
      .select("id, image_url, prompt, created_at, status")
      .eq("status", "test")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setHistory(data);
  };

  const generate = async (speed: Speed) => {
    setResults(prev => ({ ...prev, [speed]: { ...prev[speed], loading: true, error: null, imageUrl: null, elapsedMs: null } }));

    try {
      const { data, error } = await supabase.functions.invoke("social-create-post", {
        body: {
          prompt,
          caption: `[LAB TEST] ${speed}`,
          platform: "both",
          aspect_ratio: aspectRatio,
          style_type: styleType,
          rendering_speed: speed,
          publish_now: false,
          test_mode: true,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResults(prev => ({
        ...prev,
        [speed]: { speed, imageUrl: data.image_url, elapsedMs: data.elapsed_ms || null, loading: false, error: null },
      }));
      loadHistory();
    } catch (e: any) {
      setResults(prev => ({ ...prev, [speed]: { ...prev[speed], loading: false, error: e.message } }));
      toast.error(`Erro ${speed}: ${e.message}`);
    }
  };

  const generateAll = async () => {
    setGeneratingAll(true);
    await Promise.all(SPEEDS.map(s => generate(s)));
    setGeneratingAll(false);
    toast.success("Todas as gerações concluídas!");
  };

  const extractSpeed = (prompt: string | null) => {
    const match = prompt?.match(/^\[(DEFAULT|QUALITY|TURBO|FLASH)\]/);
    return match ? match[1] as Speed : null;
  };

  return (
    <div className="space-y-6">
      {/* Prompt & Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FlaskConical className="h-5 w-5 text-primary" /> Laboratório Ideogram V3
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Prompt</Label>
            <Textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4} className="mt-1" />
          </div>
          <div className="flex gap-4 flex-wrap items-end">
            <div>
              <Label>Estilo</Label>
              <Select value={styleType} onValueChange={setStyleType}>
                <SelectTrigger className="w-36 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DESIGN">Design</SelectItem>
                  <SelectItem value="REALISTIC">Realistic</SelectItem>
                  <SelectItem value="GENERAL">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Aspect Ratio</Label>
              <Select value={aspectRatio} onValueChange={setAspectRatio}>
                <SelectTrigger className="w-28 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1x1">1:1</SelectItem>
                  <SelectItem value="4x5">4:5</SelectItem>
                  <SelectItem value="9x16">9:16</SelectItem>
                  <SelectItem value="16x9">16:9</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generateAll} disabled={generatingAll || !prompt.trim()} className="gap-2">
              {generatingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Gerar Todas (4x)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 4 Speed Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {SPEEDS.map(speed => {
          const r = results[speed];
          const meta = SPEED_META[speed];
          return (
            <Card key={speed} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={meta.color}>{speed}</Badge>
                  <span className="text-xs text-muted-foreground">{meta.cost}</span>
                </div>
                <p className="text-xs text-muted-foreground">{meta.desc}</p>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-3">
                {r.loading ? (
                  <Skeleton className="w-full aspect-square rounded-md" />
                ) : r.imageUrl ? (
                  <img src={r.imageUrl} alt={`Test ${speed}`} className="w-full aspect-square object-cover rounded-md border border-border" />
                ) : r.error ? (
                  <div className="w-full aspect-square rounded-md bg-destructive/10 flex items-center justify-center p-3">
                    <p className="text-xs text-destructive text-center">{r.error}</p>
                  </div>
                ) : (
                  <div className="w-full aspect-square rounded-md bg-muted flex items-center justify-center">
                    <p className="text-xs text-muted-foreground">Aguardando...</p>
                  </div>
                )}

                {r.elapsedMs && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {(r.elapsedMs / 1000).toFixed(1)}s
                  </div>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generate(speed)}
                  disabled={r.loading || !prompt.trim()}
                  className="mt-auto gap-1"
                >
                  {r.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                  Gerar
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* History */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Histórico de Testes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {history.map(item => {
                const speed = extractSpeed(item.prompt);
                return (
                  <div key={item.id} className="space-y-1">
                    {item.image_url ? (
                      <img src={item.image_url} alt="test" className="w-full aspect-square object-cover rounded-md border border-border" />
                    ) : (
                      <div className="w-full aspect-square bg-muted rounded-md" />
                    )}
                    <div className="flex items-center justify-between">
                      {speed && <Badge variant="outline" className={`text-[10px] ${SPEED_META[speed]?.color || ""}`}>{speed}</Badge>}
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(item.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
