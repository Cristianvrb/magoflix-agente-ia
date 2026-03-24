import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Flame, TrendingUp, Zap, Activity, Info } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export function ViralDetectorSection() {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState(40);

  const { data: settings } = useQuery({
    queryKey: ["social-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("social_settings").select("*");
      if (error) throw error;
      return data as { key: string; value: string }[];
    },
  });

  const prospectMode = settings?.find((s) => s.key === "prospect_mode")?.value || "own_timeline";

  useEffect(() => {
    if (settings) {
      const get = (k: string) => settings.find((s) => s.key === k)?.value;
      if (get("viral_detector_enabled")) setEnabled(get("viral_detector_enabled") === "true");
      if (get("viral_threshold")) setThreshold(parseInt(get("viral_threshold")!) || 40);
    }
  }, [settings]);

  const { data: trendingPosts } = useQuery({
    queryKey: ["threads-trending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("threads_trending_monitor")
        .select("*")
        .eq("is_trending", true)
        .order("viral_score", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 60000,
  });

  const { data: recentSnapshots } = useQuery({
    queryKey: ["threads-trending-recent"],
    queryFn: async () => {
      const since = new Date(Date.now() - 3600000).toISOString();
      const { count, error } = await supabase
        .from("threads_trending_monitor")
        .select("*", { count: "exact", head: true })
        .gte("snapshot_time", since);
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 30000,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const upserts = [
        { key: "viral_detector_enabled", value: String(enabled) },
        { key: "viral_threshold", value: String(threshold) },
      ];
      for (const row of upserts) {
        const { error } = await supabase.from("social_settings").upsert(row, { onConflict: "key" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-settings"] });
      toast.success("Configurações do detector viral salvas!");
    },
    onError: () => toast.error("Erro ao salvar"),
  });

  const detectMutation = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke("threads-viral-detector", {
        body: { force: true, viral_threshold: threshold },
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["threads-trending"] });
      queryClient.invalidateQueries({ queryKey: ["threads-trending-recent"] });
      const modeLabel = data.mode === "own_timeline_fallback" ? " (fallback timeline)" : data.mode === "own_timeline" ? " (timeline)" : "";
      toast.success(
        `Scan${modeLabel}: ${data.scanned} posts, ${data.trending} trending, ${data.replied} replies enviados`
      );

      if (data.mode === "own_timeline_fallback") {
        queryClient.invalidateQueries({ queryKey: ["social-settings"] });
      }
    },
    onError: (e: any) => toast.error(e.message || "Erro no detector"),
  });

  return (
    <Card className="border-orange-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" /> Detector de Posts Virais
        </CardTitle>
        <CardDescription>
          Monitora posts recentes e detecta os que estão viralizando para responder nos primeiros minutos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {prospectMode === "own_timeline" && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Modo Timeline</AlertTitle>
            <AlertDescription className="text-xs">
              Monitorando engajamento dos seus próprios posts (likes, replies, reposts). Posts com até 2h são analisados.
              Para monitorar posts de terceiros, ative o modo "Busca Global" na seção de Prospecção.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Habilitar Detector Viral</Label>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Snapshots (1h): <strong>{recentSnapshots ?? 0}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border">
            <TrendingUp className="h-4 w-4 text-orange-500" />
            <span className="text-sm text-muted-foreground">
              Trending detectados: <strong>{trendingPosts?.length ?? 0}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border">
            <Zap className="h-4 w-4 text-yellow-500" />
            <span className="text-sm text-muted-foreground">
              Auto-replied: <strong>{trendingPosts?.filter((p: any) => p.auto_replied).length ?? 0}</strong>
            </span>
          </div>
        </div>

        <div>
          <Label>Score Mínimo para Viral: {threshold}</Label>
          <Slider
            value={[threshold]}
            onValueChange={([v]) => setThreshold(v)}
            min={10}
            max={100}
            step={5}
            className="mt-2"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Score = likes×1 + replies×2 + reposts×3 + velocity×5 + growth_rate×10
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="flex-1">
            Salvar
          </Button>
          <Button
            variant="default"
            onClick={() => detectMutation.mutate()}
            disabled={detectMutation.isPending}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <Flame className="h-4 w-4 mr-1" /> Detectar Agora
          </Button>
        </div>

        {/* How it works */}
        <div className="text-xs text-muted-foreground p-2 rounded bg-muted/30 border space-y-1">
          <p><strong>Como funciona:</strong></p>
          <p>• {prospectMode === "own_timeline" ? "Analisa engajamento dos seus posts (até 2h)" : "Busca posts <30 min por keywords"} • Calcula velocidade de engajamento</p>
          <p>• Compara snapshots para detectar crescimento acelerado • Score acima do threshold = trending</p>
          <p>• Responde nos primeiros minutos para máxima visibilidade • Delay curto (30-60s) entre replies virais</p>
          <p>• Mesmas proteções anti-spam: blacklist CTA, classificação IA, diversidade, rate limit por autor</p>
        </div>

        {/* Trending Posts Table */}
        {trendingPosts && trendingPosts.length > 0 && (
          <div>
            <Label className="text-sm font-medium mb-2 block">🔥 Posts Trending</Label>
            <div className="rounded-md border max-h-[300px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Autor</TableHead>
                    <TableHead>Conteúdo</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Velocity</TableHead>
                    <TableHead>Engajamento</TableHead>
                    <TableHead>Replied</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trendingPosts.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">@{p.author_username}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs">{p.content}</TableCell>
                      <TableCell>
                        <Badge variant="default" className="bg-orange-600">
                          {Math.round(p.viral_score)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{p.velocity}/min</TableCell>
                      <TableCell className="text-xs">
                        ❤️{p.like_count} 💬{p.reply_count} 🔄{p.repost_count}
                      </TableCell>
                      <TableCell>
                        {p.auto_replied ? (
                          <Badge variant="default">✓</Badge>
                        ) : (
                          <Badge variant="outline">—</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
