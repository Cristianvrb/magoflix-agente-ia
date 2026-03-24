import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { ImagePlus, Send, Loader2, Sparkles, CalendarDays, Sun, Sunset, Moon } from "lucide-react";
import { presetPrompts, type PresetPrompt } from "@/lib/social-prompts";

const aspectRatios = [
  { value: "ASPECT_1_1", label: "1:1 (Feed)" },
  { value: "ASPECT_4_5", label: "4:5 (Feed vertical)" },
  { value: "ASPECT_9_16", label: "9:16 (Stories/Reels)" },
  { value: "ASPECT_16_9", label: "16:9 (Landscape)" },
];

const styleTypes = [
  { value: "DESIGN", label: "Design" },
  { value: "REALISTIC", label: "Realista" },
  { value: "GENERAL", label: "Geral" },
  { value: "FICTION", label: "Ficção" },
  { value: "AUTO", label: "Automático" },
];

const renderingSpeeds = [
  { value: "DEFAULT", label: "Padrão" },
  { value: "QUALITY", label: "Qualidade máxima" },
  { value: "TURBO", label: "Turbo (rápido)" },
  { value: "FLASH", label: "Flash (ultra rápido)" },
];

const slotIcons = { manhã: Sun, tarde: Sunset, noite: Moon };
const slotColors = { manhã: "text-amber-500", tarde: "text-orange-500", noite: "text-indigo-500" };

const totalDays = 60;

export function PostCreatorTab() {
  const [prompt, setPrompt] = useState("");
  const [caption, setCaption] = useState("");
  const [aspectRatio, setAspectRatio] = useState("ASPECT_1_1");
  const [platform, setPlatform] = useState("both");
  const [styleType, setStyleType] = useState("DESIGN");
  const [renderingSpeed, setRenderingSpeed] = useState("TURBO");
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selectPreset = (preset: PresetPrompt) => {
    setPrompt(preset.prompt);
    setCaption(preset.caption);
    setAspectRatio(preset.aspectRatio);
    setSelectedKey(`${preset.day}-${preset.slot}`);
  };

  const generateImage = async () => {
    if (!prompt) return toast.error("Descreva a imagem que deseja gerar");
    setLoading(true);
    setGeneratedImage(null);
    try {
      const { data, error } = await supabase.functions.invoke("social-create-post", {
        body: { prompt, caption, platform, aspect_ratio: aspectRatio, publish_now: false, style_type: styleType, rendering_speed: renderingSpeed },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setGeneratedImage(data.image_url);
      toast.success("Imagem gerada! Revise e publique.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar imagem");
    } finally {
      setLoading(false);
    }
  };

  const publishPost = async () => {
    if (!prompt) return;
    setPublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke("social-create-post", {
        body: { prompt, caption, platform, aspect_ratio: aspectRatio, publish_now: true, style_type: styleType, rendering_speed: renderingSpeed },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setGeneratedImage(data.image_url);
      toast.success("Post criado e enviado para publicação!");
      setPrompt("");
      setCaption("");
      setGeneratedImage(null);
      setSelectedKey(null);
    } catch (e: any) {
      toast.error(e.message || "Erro ao publicar");
    } finally {
      setPublishing(false);
    }
  };

  const isProcessing = loading || publishing;

  // Group by day
  const days = Array.from({ length: totalDays }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      {/* Calendário 60 Dias */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5 text-primary" /> Calendário {totalDays} Dias — 3 posts/dia
          </CardTitle>
          <p className="text-xs text-muted-foreground">Clique em um slot para preencher automaticamente o prompt e legenda</p>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-2 pb-3">
              {days.map((day) => {
                const dayPrompts = presetPrompts.filter((p) => p.day === day);
                return (
                  <div key={day} className="flex-shrink-0 flex flex-col gap-1 border rounded-lg p-2 bg-card" style={{ minWidth: 110 }}>
                    <span className="text-xs font-bold text-primary text-center">Dia {day}</span>
                    {dayPrompts.map((preset) => {
                      const key = `${preset.day}-${preset.slot}`;
                      const Icon = slotIcons[preset.slot];
                      return (
                        <button
                          key={key}
                          onClick={() => selectPreset(preset)}
                          disabled={isProcessing}
                          className={`flex items-center gap-1 rounded px-2 py-1 text-left transition-all hover:bg-primary/10 disabled:opacity-50 ${
                            selectedKey === key ? "bg-primary/20 ring-1 ring-primary" : ""
                          }`}
                        >
                          <Icon className={`h-3 w-3 ${slotColors[preset.slot]}`} />
                          <span className="text-[10px] text-muted-foreground whitespace-normal leading-tight" style={{ maxWidth: 80 }}>
                            {preset.theme}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" /> Criar Post com IA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Prompt da Imagem</Label>
              <Textarea
                value={prompt}
                onChange={(e) => { setPrompt(e.target.value); setSelectedKey(null); }}
                placeholder="Descreva a imagem ou selecione um slot do calendário..."
                rows={4}
                disabled={isProcessing}
              />
            </div>
            <div>
              <Label>Legenda do Post</Label>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Texto que será publicado junto com a imagem..."
                rows={3}
                disabled={isProcessing}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Proporção</Label>
                <Select value={aspectRatio} onValueChange={setAspectRatio} disabled={isProcessing}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {aspectRatios.map((ar) => (
                      <SelectItem key={ar.value} value={ar.value}>{ar.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Plataforma</Label>
                <Select value={platform} onValueChange={setPlatform} disabled={isProcessing}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Instagram + Threads</SelectItem>
                    <SelectItem value="instagram">Apenas Instagram</SelectItem>
                    <SelectItem value="threads">Apenas Threads</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Estilo</Label>
                <Select value={styleType} onValueChange={setStyleType} disabled={isProcessing}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {styleTypes.map((st) => (
                      <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Velocidade</Label>
                <Select value={renderingSpeed} onValueChange={setRenderingSpeed} disabled={isProcessing}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {renderingSpeeds.map((rs) => (
                      <SelectItem key={rs.value} value={rs.value}>{rs.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={generateImage} disabled={!prompt || isProcessing} variant="outline" className="flex-1">
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ImagePlus className="h-4 w-4 mr-1" />}
                {loading ? "Gerando..." : "Gerar Preview"}
              </Button>
              <Button onClick={publishPost} disabled={!prompt || isProcessing} className="flex-1">
                {publishing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                {publishing ? "Publicando..." : "Gerar e Publicar"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm">Gerando imagem com Ideogram V3...</p>
              </div>
            ) : generatedImage ? (
              <div className="space-y-3">
                <img src={generatedImage} alt="Imagem gerada" className="w-full rounded-lg border border-border" />
                {caption && <p className="text-sm text-foreground whitespace-pre-wrap">{caption}</p>}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
                <ImagePlus className="h-12 w-12 opacity-30" />
                <p className="text-sm">A imagem gerada aparecerá aqui</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
