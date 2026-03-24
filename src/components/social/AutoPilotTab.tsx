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
import { toast } from "sonner";
import { Bot, Sparkles, Save, Clock, Key, Trash2, Plus, Instagram, CalendarDays } from "lucide-react";
import { ThreadsProspectingSection } from "./ThreadsProspectingSection";
import { ViralDetectorSection } from "./ViralDetectorSection";

// Threads icon placeholder
const ThreadsIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.083.718 5.496 2.057 7.164 1.432 1.784 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.187.408-2.26 1.33-3.02.858-.706 2.027-1.095 3.387-1.127 1.004-.024 1.925.083 2.748.318-.07-.846-.296-1.502-.678-1.965-.442-.536-1.108-.81-1.98-.813h-.05c-.667.003-1.47.202-1.947.534l-1.022-1.705c.753-.488 1.86-.766 2.953-.772h.074c1.354.007 2.437.456 3.217 1.335.67.754 1.09 1.756 1.248 2.973.52.2 1.004.442 1.45.731 1.2.776 2.063 1.79 2.555 3.006.755 1.87.795 4.537-1.333 6.636-1.77 1.746-3.993 2.497-7.164 2.52zM12.7 14.856c-.937.022-1.678.194-2.203.51-.462.28-.69.648-.668 1.073.03.534.343.95.932 1.234.525.252 1.19.383 1.917.345 1.107-.06 1.954-.458 2.518-1.182.348-.447.601-1.015.753-1.691-.71-.227-1.51-.321-2.343-.321-.3 0-.604.01-.906.032z" />
  </svg>
);

export function AutoPilotTab() {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  
  // Instagram settings
  const [igFrequency, setIgFrequency] = useState("3");
  const [igPeakHours, setIgPeakHours] = useState("9,13,19");
  const [igStyle, setIgStyle] = useState("Informal e persuasivo, focado em streaming e entretenimento. Mencionar MagoFlix.");
  
  // Threads settings
  const [thFrequency, setThFrequency] = useState("6");
  const [thPeakHours, setThPeakHours] = useState("8,10,12,14,17,20");
  const [thStyle, setThStyle] = useState("Curto, direto, provocativo. Perguntas, opinões polêmicas sobre filmes/séries. Tom conversacional.");
  const [thTextRatio, setThTextRatio] = useState(70);

  // Keyword state
  const [newKeyword, setNewKeyword] = useState("");
  const [newReply, setNewReply] = useState("");

  const { data: settings } = useQuery({
    queryKey: ["social-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("social_settings").select("*");
      if (error) throw error;
      return data as { key: string; value: string }[];
    },
  });

  const { data: keywords, refetch: refetchKeywords } = useQuery({
    queryKey: ["social-keyword-replies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_keyword_replies" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  useEffect(() => {
    if (settings) {
      const get = (k: string) => settings.find((s) => s.key === k)?.value;
      if (get("auto_post_enabled")) setEnabled(get("auto_post_enabled") === "true");
      // IG
      if (get("auto_post_ig_frequency")) setIgFrequency(get("auto_post_ig_frequency")!);
      else if (get("auto_post_frequency")) setIgFrequency(get("auto_post_frequency")!);
      if (get("auto_post_ig_peak_hours")) setIgPeakHours(get("auto_post_ig_peak_hours")!);
      else if (get("auto_post_peak_hours")) setIgPeakHours(get("auto_post_peak_hours")!);
      if (get("auto_post_ig_style")) setIgStyle(get("auto_post_ig_style")!);
      else if (get("auto_post_style")) setIgStyle(get("auto_post_style")!);
      // Threads
      if (get("auto_post_threads_frequency")) setThFrequency(get("auto_post_threads_frequency")!);
      if (get("auto_post_threads_peak_hours")) setThPeakHours(get("auto_post_threads_peak_hours")!);
      if (get("auto_post_threads_style")) setThStyle(get("auto_post_threads_style")!);
      if (get("auto_post_threads_text_ratio")) setThTextRatio(parseInt(get("auto_post_threads_text_ratio")!) || 70);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const upserts = [
        { key: "auto_post_enabled", value: String(enabled) },
        // IG
        { key: "auto_post_ig_frequency", value: igFrequency },
        { key: "auto_post_ig_peak_hours", value: igPeakHours },
        { key: "auto_post_ig_style", value: igStyle },
        // Threads
        { key: "auto_post_threads_frequency", value: thFrequency },
        { key: "auto_post_threads_peak_hours", value: thPeakHours },
        { key: "auto_post_threads_style", value: thStyle },
        { key: "auto_post_threads_text_ratio", value: String(thTextRatio) },
        // Legacy compat
        { key: "auto_post_frequency", value: igFrequency },
        { key: "auto_post_peak_hours", value: igPeakHours },
        { key: "auto_post_style", value: igStyle },
      ];
      for (const row of upserts) {
        const { error } = await supabase.from("social_settings").upsert(row, { onConflict: "key" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-settings"] });
      toast.success("Configurações salvas!");
    },
    onError: () => toast.error("Erro ao salvar"),
  });

  const addKeywordMutation = useMutation({
    mutationFn: async () => {
      if (!newKeyword.trim()) throw new Error("Keyword vazia");
      const { error } = await supabase.from("social_keyword_replies" as any).insert({
        keyword: newKeyword.toUpperCase().trim(),
        reply_text: newReply || `🎬 Oi! Você comentou ${newKeyword.toUpperCase()} e aqui vai!\n\nAcesse MagoFlix: https://magoflix.com`,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewKeyword("");
      setNewReply("");
      refetchKeywords();
      toast.success("Palavra-chave adicionada!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteKeywordMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("social_keyword_replies" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchKeywords();
      toast.success("Keyword removida");
    },
  });

  const toggleKeywordMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("social_keyword_replies" as any).update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => refetchKeywords(),
  });

  return (
    <div className="space-y-4">
      {/* Master Toggle */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bot className="h-6 w-6 text-primary" />
              <div>
                <Label className="text-base font-bold">Auto Piloto</Label>
                <p className="text-sm text-muted-foreground">Posts automáticos com IA no Instagram e Threads</p>
              </div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Instagram Config */}
        <Card className="border-pink-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Instagram className="h-5 w-5 text-pink-500" /> Instagram
            </CardTitle>
            <CardDescription>Segue o calendário de 60 dias (180 posts) sequencialmente com imagem via Ideogram</CardDescription>
            {(() => {
              const idx = parseInt(settings?.find(s => s.key === "auto_post_ig_calendar_index")?.value || "0");
              const day = Math.floor(idx / 3) + 1;
              const slots = ["manhã", "tarde", "noite"];
              const slot = slots[idx % 3];
              return (
                <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/20">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-primary">
                    Próximo: Dia {day} / {slot} — Post {idx + 1} de 180
                  </span>
                </div>
              );
            })()}
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="flex items-center gap-1"><Clock className="h-3 w-3" /> Posts por dia</Label>
              <Select value={igFrequency} onValueChange={setIgFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n} post{n>1?"s":""}/dia</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Horários de Pico (BRT)</Label>
              <Input value={igPeakHours} onChange={(e) => setIgPeakHours(e.target.value)} placeholder="9,13,19" />
              <p className="text-xs text-muted-foreground mt-1">Horas separadas por vírgula</p>
            </div>
            <div>
              <Label>Tom e Estilo</Label>
              <Textarea value={igStyle} onChange={(e) => setIgStyle(e.target.value)} rows={2} />
            </div>
          </CardContent>
        </Card>

        {/* Threads Config */}
        <Card className="border-foreground/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ThreadsIcon /> Threads
            </CardTitle>
            <CardDescription>Maior frequência, mix de texto puro e imagem</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="flex items-center gap-1"><Clock className="h-3 w-3" /> Posts por dia</Label>
              <Select value={thFrequency} onValueChange={setThFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5,6,7,8,9,10].map(n => <SelectItem key={n} value={String(n)}>{n} post{n>1?"s":""}/dia</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Horários de Pico (BRT)</Label>
              <Input value={thPeakHours} onChange={(e) => setThPeakHours(e.target.value)} placeholder="8,10,12,14,17,20" />
            </div>
            <div>
              <Label>% Texto Puro (sem imagem): {thTextRatio}%</Label>
              <Slider value={[thTextRatio]} onValueChange={([v]) => setThTextRatio(v)} min={0} max={100} step={10} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-1">{thTextRatio}% texto puro, {100 - thTextRatio}% com imagem</p>
            </div>
            <div>
              <Label>Tom e Estilo</Label>
              <Textarea value={thStyle} onChange={(e) => setThStyle(e.target.value)} rows={2} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
        <Save className="h-4 w-4 mr-1" /> Salvar Configurações
      </Button>

      {/* Threads Prospecting */}
      <ThreadsProspectingSection />

      {/* Viral Detector */}
      <ViralDetectorSection />

      {/* Keyword Auto-Reply */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" /> Auto-Resposta por Palavra-Chave
          </CardTitle>
          <CardDescription>Quando alguém comenta a palavra-chave, o bot envia DM automaticamente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Palavra-chave</Label>
              <Input value={newKeyword} onChange={(e) => setNewKeyword(e.target.value.toUpperCase())} placeholder="TERROR" />
            </div>
            <div className="md:col-span-2">
              <Label>Resposta (DM)</Label>
              <Input value={newReply} onChange={(e) => setNewReply(e.target.value)} placeholder="Mensagem automática enviada por DM..." />
            </div>
          </div>
          <Button size="sm" onClick={() => addKeywordMutation.mutate()} disabled={addKeywordMutation.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar Keyword
          </Button>

          {keywords && keywords.length > 0 && (
            <div className="space-y-2 mt-4">
              {keywords.map((kw: any) => (
                <div key={kw.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                  <Switch checked={kw.active} onCheckedChange={(active) => toggleKeywordMutation.mutate({ id: kw.id, active })} />
                  <div className="flex-1 min-w-0">
                    <span className="font-mono font-bold text-primary">{kw.keyword}</span>
                    <p className="text-xs text-muted-foreground truncate">{kw.reply_text}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteKeywordMutation.mutate(kw.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
