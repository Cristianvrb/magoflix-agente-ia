import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Save, Target, ShieldAlert, X, Eye, Zap, Clock, Info } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export function ThreadsProspectingSection() {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [maxReplies, setMaxReplies] = useState(3);
  const [dailyLimit, setDailyLimit] = useState(15);
  const [hourlyLimit, setHourlyLimit] = useState(5);
  const [humanWindow, setHumanWindow] = useState(true);
  const [interval, setInterval] = useState("10");
  const [prospectMode, setProspectMode] = useState("own_timeline");
  const [replyPrompt, setReplyPrompt] = useState(
    "Responda de forma natural e útil, mencionando MagoFlix como solução de streaming acessível. Máx 200 chars."
  );

  const { data: settings } = useQuery({
    queryKey: ["social-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("social_settings").select("*");
      if (error) throw error;
      return data as { key: string; value: string }[];
    },
  });

  const { data: prospects, refetch: refetchProspects } = useQuery({
    queryKey: ["threads-prospects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("threads_prospects")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: dailyCount } = useQuery({
    queryKey: ["threads-prospects-daily"],
    queryFn: async () => {
      const since = new Date(Date.now() - 86400000).toISOString();
      const { count, error } = await supabase
        .from("threads_prospects")
        .select("*", { count: "exact", head: true })
        .eq("status", "replied")
        .gte("replied_at", since);
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 30000,
  });

  const { data: hourlyCount } = useQuery({
    queryKey: ["threads-prospects-hourly"],
    queryFn: async () => {
      const since = new Date(Date.now() - 3600000).toISOString();
      const { count, error } = await supabase
        .from("threads_prospects")
        .select("*", { count: "exact", head: true })
        .eq("status", "replied")
        .gte("replied_at", since);
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (settings) {
      const get = (k: string) => settings.find((s) => s.key === k)?.value;
      if (get("prospect_enabled")) setEnabled(get("prospect_enabled") === "true");
      if (get("prospect_keywords")) setKeywords(get("prospect_keywords")!.split(",").filter(Boolean));
      if (get("prospect_max_replies")) setMaxReplies(parseInt(get("prospect_max_replies")!) || 3);
      if (get("prospect_daily_limit")) setDailyLimit(parseInt(get("prospect_daily_limit")!) || 15);
      if (get("prospect_hourly_limit")) setHourlyLimit(parseInt(get("prospect_hourly_limit")!) || 5);
      if (get("prospect_human_window")) setHumanWindow(get("prospect_human_window") !== "false");
      if (get("prospect_interval")) setInterval(get("prospect_interval")!);
      if (get("prospect_mode")) setProspectMode(get("prospect_mode")!);
      if (get("prospect_reply_prompt")) setReplyPrompt(get("prospect_reply_prompt")!);
    }
  }, [settings]);

  const addKeyword = () => {
    const kw = newKeyword.trim().toLowerCase();
    if (kw && !keywords.includes(kw)) {
      setKeywords([...keywords, kw]);
      setNewKeyword("");
    }
  };

  const removeKeyword = (kw: string) => {
    setKeywords(keywords.filter((k) => k !== kw));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const upserts = [
        { key: "prospect_enabled", value: String(enabled) },
        { key: "prospect_keywords", value: keywords.join(",") },
        { key: "prospect_max_replies", value: String(maxReplies) },
        { key: "prospect_daily_limit", value: String(dailyLimit) },
        { key: "prospect_hourly_limit", value: String(hourlyLimit) },
        { key: "prospect_human_window", value: String(humanWindow) },
        { key: "prospect_interval", value: interval },
        { key: "prospect_mode", value: prospectMode },
        { key: "prospect_reply_prompt", value: replyPrompt },
      ];
      for (const row of upserts) {
        const { error } = await supabase.from("social_settings").upsert(row, { onConflict: "key" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-settings"] });
      toast.success("Configurações de prospecção salvas!");
    },
    onError: () => toast.error("Erro ao salvar"),
  });

  const prospectMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const res = await supabase.functions.invoke("threads-prospect", {
        body: { force: true, dry_run: dryRun },
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: (data, dryRun) => {
      refetchProspects();
      queryClient.invalidateQueries({ queryKey: ["threads-prospects-daily"] });
      queryClient.invalidateQueries({ queryKey: ["threads-prospects-hourly"] });

      const modeLabel = data.mode === "own_timeline_fallback" ? " (fallback timeline)" : data.mode === "own_timeline" ? " (timeline)" : data.mode === "google_search" ? " (Google Search)" : "";

      if (dryRun) {
        toast.success(`Busca concluída${modeLabel}: ${data.found} posts encontrados`);
      } else {
        const extra = data.circuitBroken ? " ⚠️ Circuit breaker ativado" : "";
        toast.success(`Prospecção${modeLabel}: ${data.replied} replies enviados, ${data.skipped} ignorados${extra}`);
      }

      // If mode was auto-changed to fallback, update local state
      if (data.mode === "own_timeline_fallback") {
        setProspectMode("own_timeline");
        queryClient.invalidateQueries({ queryKey: ["social-settings"] });
      }
    },
    onError: (e: any) => toast.error(e.message || "Erro na prospecção"),
  });

  const statusColor = (status: string) => {
    switch (status) {
      case "replied": return "default";
      case "found": return "secondary";
      case "skipped": return "outline";
      case "error": return "destructive";
      default: return "secondary";
    }
  };

  return (
    <Card className="border-purple-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-purple-500" /> Prospecção Threads
        </CardTitle>
        <CardDescription>
          Busca posts por palavras-chave e responde automaticamente com IA para captar leads.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {prospectMode === "own_timeline" && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Modo Timeline Ativa</AlertTitle>
            <AlertDescription className="text-xs">
              A prospecção monitora replies nos seus próprios posts do Threads, filtrando por palavras-chave.
            </AlertDescription>
          </Alert>
        )}

        {prospectMode === "google_search" && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Modo Google Search (Firecrawl)</AlertTitle>
            <AlertDescription className="text-xs">
              Busca posts do Threads indexados pelo Google usando <code className="bg-muted px-1 rounded">site:threads.net "keyword"</code>.
              Não depende de permissões da Meta. Suas keywords são automaticamente combinadas com frases de intenção
              ("alguém indica", "vale a pena", "recomendam") para encontrar leads de maior qualidade.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Habilitar Prospecção</Label>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {/* Mode selector */}
        <div>
          <Label>Modo de Prospecção</Label>
          <Select value={prospectMode} onValueChange={setProspectMode}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="own_timeline">📱 Minha Timeline (sempre funciona)</SelectItem>
              <SelectItem value="google_search">🔎 Google Search (via Firecrawl)</SelectItem>
              <SelectItem value="keyword_search">🔍 Busca Global (requer permissão Meta)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            {prospectMode === "own_timeline"
              ? "Monitora replies nos seus posts e filtra por keywords. Não requer permissão especial."
              : prospectMode === "google_search"
                ? "Busca posts indexados pelo Google via Firecrawl. Keywords são expandidas com frases de intenção automaticamente. 💡 Dica: use palavras genéricas (filme, streaming) — as frases de busca são geradas automaticamente."
                : "Busca posts públicos por keyword. Requer threads_keyword_search (aprovação Meta)."}
          </p>
        </div>

        {/* Counters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Replies hoje: <strong className={dailyCount && dailyCount >= dailyLimit ? "text-destructive" : ""}>{dailyCount ?? 0}</strong> / {dailyLimit}
            </span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Replies hora: <strong className={hourlyCount && hourlyCount >= hourlyLimit ? "text-destructive" : ""}>{hourlyCount ?? 0}</strong> / {hourlyLimit}
            </span>
          </div>
        </div>

        {/* Keywords */}
        <div>
          <Label>Palavras-chave de Busca</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="Ex: streaming barato"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
            />
            <Button size="sm" variant="outline" onClick={addKeyword}>+</Button>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {keywords.map((kw) => (
              <Badge key={kw} variant="secondary" className="gap-1">
                {kw}
                <X className="h-3 w-3 cursor-pointer" onClick={() => removeKeyword(kw)} />
              </Badge>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label>Max Replies/Ciclo: {maxReplies}</Label>
            <Slider value={[maxReplies]} onValueChange={([v]) => setMaxReplies(v)} min={1} max={5} step={1} className="mt-2" />
          </div>
          <div>
            <Label>Max Replies/Dia: {dailyLimit}</Label>
            <Slider value={[dailyLimit]} onValueChange={([v]) => setDailyLimit(v)} min={5} max={30} step={1} className="mt-2" />
          </div>
          <div>
            <Label>Max Replies/Hora: {hourlyLimit}</Label>
            <Slider value={[hourlyLimit]} onValueChange={([v]) => setHourlyLimit(v)} min={1} max={10} step={1} className="mt-2" />
          </div>
          <div>
            <Label>Intervalo entre Ciclos</Label>
            <Select value={interval} onValueChange={setInterval}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 minutos</SelectItem>
                <SelectItem value="10">10 minutos</SelectItem>
                <SelectItem value="15">15 minutos</SelectItem>
                <SelectItem value="30">30 minutos</SelectItem>
                <SelectItem value="60">1 hora</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Human window toggle */}
        <div className="flex items-center justify-between p-2 rounded-md bg-muted/50 border">
          <div>
            <Label className="text-sm font-medium">Janela Humana</Label>
            <p className="text-xs text-muted-foreground">Só responde em horários comerciais (09-12, 14-18, 20-22 BRT)</p>
          </div>
          <Switch checked={humanWindow} onCheckedChange={setHumanWindow} />
        </div>

        <div>
          <Label>Prompt de Resposta (como a IA deve responder)</Label>
          <Textarea value={replyPrompt} onChange={(e) => setReplyPrompt(e.target.value)} rows={3} />
        </div>

        <div className="flex gap-2">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="flex-1">
            <Save className="h-4 w-4 mr-1" /> Salvar
          </Button>
          <Button variant="outline" onClick={() => prospectMutation.mutate(true)} disabled={prospectMutation.isPending}>
            <Eye className="h-4 w-4 mr-1" /> Apenas Buscar
          </Button>
          <Button variant="default" onClick={() => prospectMutation.mutate(false)} disabled={prospectMutation.isPending} className="bg-purple-600 hover:bg-purple-700">
            <Zap className="h-4 w-4 mr-1" /> Prospectar Agora
          </Button>
        </div>

        {/* Anti-spam info */}
        <div className="text-xs text-muted-foreground p-2 rounded bg-muted/30 border space-y-1">
          <p><strong>Proteções ativas (9.5/10):</strong></p>
          <p>• Delay gaussiano 60-180s • Limite diário + horário • 1 reply/autor/7 dias • Posts &lt;24h priorizados por idade</p>
          <p>• Blacklist CTA (regex + IA SAFE/PROMOTIONAL) • Circuit breaker (3 erros) • Diversidade 10 replies</p>
          <p>• Detecção de intenção (question/complaint/recommendation → responde, discussion → ignora)</p>
          <p>• Randomização de estilo (educacional/empático/pergunta) • Janela humana (horários comerciais)</p>
        </div>

        {/* History Table */}
        {prospects && prospects.length > 0 && (
          <div>
            <Label className="text-sm font-medium mb-2 block">Histórico de Prospecção</Label>
            <div className="rounded-md border max-h-[300px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Autor</TableHead>
                    <TableHead>Conteúdo</TableHead>
                    <TableHead>Keyword</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prospects.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">@{p.author_username}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs">{p.content}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{p.keyword_matched}</Badge></TableCell>
                      <TableCell><Badge variant={statusColor(p.status)}>{p.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString("pt-BR")}
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
