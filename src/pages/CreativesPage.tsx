import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAdCreatives, updateAdCreativeImage } from "@/lib/supabase-helpers";
import WebhookLogsSection from "@/components/creatives/WebhookLogsSection";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Megaphone, TrendingUp, Users, Target, ImageOff, Calendar, Upload, XCircle, Smartphone, Globe, ChevronDown, ChevronUp, Search, Loader2 } from "lucide-react";
import { format, subDays, subMonths } from "date-fns";
import { useRef } from "react";
import { toast } from "sonner";

interface CreativeGroup {
  key: string;
  ids: string[];
  source: string;
  trackSource: string;
  imageUrl: string;
  total: number;
  qualified: number;
  closed: number;
  lost: number;
  conversionRate: number;
  lastLead: string;
  adBody: string;
  entryPoint: string;
  deviceSource: string;
  contacts: { name: string; phone: string; stage: string }[];
}

const PERIOD_OPTIONS = [
  { value: "all", label: "Todo período" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
];

function getPeriodCutoff(period: string): Date | null {
  const now = new Date();
  if (period === "7d") return subDays(now, 7);
  if (period === "30d") return subMonths(now, 1);
  if (period === "90d") return subMonths(now, 3);
  return null;
}

function CreativeCard({ g, isBest, showBest, onUpload, onFetchImage }: {
  g: CreativeGroup; isBest: boolean; showBest: boolean;
  onUpload: (g: CreativeGroup) => void;
  onFetchImage: (g: CreativeGroup) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [fetching, setFetching] = useState(false);

  const handleFetch = async () => {
    setFetching(true);
    try {
      await onFetchImage(g);
    } finally {
      setFetching(false);
    }
  };

  return (
    <Card className="overflow-hidden relative group shadow-md hover:shadow-lg transition-shadow">
      {isBest && showBest && (
        <Badge variant="default" className="absolute top-3 right-3 z-10 text-xs">🏆 Top</Badge>
      )}

      <div className="relative h-44 bg-muted overflow-hidden">
        {g.imageUrl ? (
          <img src={g.imageUrl} alt={`Criativo: ${g.key}`}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
            }}
          />
        ) : null}
        <div className={`absolute inset-0 flex flex-col items-center justify-center text-muted-foreground ${g.imageUrl ? "hidden" : ""}`}>
          <ImageOff className="h-10 w-10 mb-2 opacity-40" />
          <span className="text-xs opacity-60">Sem imagem</span>
          {!g.imageUrl && (
            <button onClick={handleFetch} disabled={fetching}
              className="mt-2 flex items-center gap-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-full px-3 py-1 transition-colors disabled:opacity-50"
              title="Buscar imagem via Meta API">
              {fetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              {fetching ? "Buscando..." : "Buscar imagem"}
            </button>
          )}
        </div>
        <button onClick={() => onUpload(g)}
          className="absolute bottom-2 right-2 z-10 bg-background/80 hover:bg-background text-foreground rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity shadow"
          title="Enviar imagem do criativo">
          <Upload className="h-4 w-4" />
        </button>
      </div>

      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-sm truncate">{g.key}</h3>
          {g.source && g.source !== g.key && (
            <span className="text-xs text-muted-foreground">{g.source}</span>
          )}
        </div>

        {/* Ad details */}
        {(g.adBody || g.entryPoint || g.deviceSource) && (
          <div className="space-y-1">
            {g.adBody && (
              <p className="text-xs text-muted-foreground line-clamp-2" title={g.adBody}>
                📝 {g.adBody}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {g.entryPoint && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Globe className="h-2.5 w-2.5" />{g.entryPoint}
                </Badge>
              )}
              {g.deviceSource && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Smartphone className="h-2.5 w-2.5" />{g.deviceSource}
                </Badge>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-5 gap-1 text-center">
          <div>
            <p className="text-lg font-bold">{g.total}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Leads</p>
          </div>
          <div>
            <p className="text-lg font-bold">{g.qualified}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Qualif.</p>
          </div>
          <div>
            <p className="text-lg font-bold">{g.closed}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Fechados</p>
          </div>
          <div>
            <p className="text-lg font-bold text-destructive">{g.lost}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Perdidos</p>
          </div>
          <div>
            <Badge variant={g.conversionRate > 10 ? "default" : "secondary"} className="text-xs">
              {g.conversionRate.toFixed(1)}%
            </Badge>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Conv.</p>
          </div>
        </div>

        {/* Contacts list (expandable) */}
        {g.contacts.length > 0 && (
          <div className="border-t border-border pt-2">
            <button onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full">
              <Users className="h-3 w-3" />
              <span>{g.contacts.length} contato{g.contacts.length > 1 ? "s" : ""}</span>
              {expanded ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
            </button>
            {expanded && (
              <div className="mt-1.5 space-y-1 max-h-32 overflow-y-auto">
                {g.contacts.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="truncate">{c.name || c.phone}</span>
                    <Badge variant="outline" className="text-[10px] ml-1 shrink-0">{c.stage}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t border-border">
          <Calendar className="h-3 w-3" />
          <span>Último lead: {format(new Date(g.lastLead), "dd/MM/yyyy HH:mm")}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CreativesPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadGroupRef = useRef<CreativeGroup | null>(null);
  const [period, setPeriod] = useState("all");

  const { data: creatives = [], isLoading } = useQuery({
    queryKey: ["ad-creatives"],
    queryFn: getAdCreatives,
  });

  const cutoff = getPeriodCutoff(period);
  const filtered = cutoff
    ? creatives.filter((c: any) => new Date(c.created_at) >= cutoff)
    : creatives;

  // Group by track_source + image_url to separate different creatives
  const grouped: Record<string, CreativeGroup> = {};
  for (const c of filtered) {
    const rawData = (c.raw_data && typeof c.raw_data === "object") ? c.raw_data as Record<string, any> : {};
    const deviceSources = ["android", "ios", "web", ""];
    const isDeviceOnly = deviceSources.includes((c.source || "").toLowerCase());
    const baseName = c.track_source || rawData?.ad_title || rawData?.entry_point || (!isDeviceOnly ? c.source : "") || "Desconhecido";
    
    // Extract image identifier to differentiate creatives with same track_source
    let imageId = "";
    if (c.image_url) {
      try {
        const url = new URL(c.image_url);
        imageId = url.searchParams.get("d") || c.image_url;
      } catch {
        imageId = c.image_url;
      }
    }
    
    const key = imageId ? `${baseName}|${imageId}` : baseName;
    if (!grouped[key]) {
      grouped[key] = {
        key: baseName, ids: [], source: c.source || "", trackSource: c.track_source || "",
        imageUrl: c.image_url || "", total: 0, qualified: 0, closed: 0, lost: 0,
        conversionRate: 0, lastLead: c.created_at,
        adBody: rawData?.ad_body || "", entryPoint: rawData?.entry_point || "",
        deviceSource: rawData?.device_source || "", contacts: [],
      };
    }
    grouped[key].ids.push(c.id);
    const g = grouped[key];
    g.total++;
    if (!g.imageUrl && c.image_url) g.imageUrl = c.image_url;
    if (!g.adBody && rawData?.ad_body) g.adBody = rawData.ad_body;
    if (!g.entryPoint && rawData?.entry_point) g.entryPoint = rawData.entry_point;
    if (!g.deviceSource && rawData?.device_source) g.deviceSource = rawData.device_source;

    const conv = c.conversation;
    const stage = conv?.lead_stage || "novo";
    if (stage === "qualificado" || stage === "proposta") g.qualified++;
    if (stage === "fechado") g.closed++;
    if (stage === "perdido") g.lost++;
    if (c.created_at > g.lastLead) g.lastLead = c.created_at;
    if (conv) {
      g.contacts.push({ name: conv.contact_name, phone: conv.contact_phone || "", stage });
    }
  }

  const groups = Object.values(grouped).sort((a, b) => b.total - a.total);
  
  // Add visual suffix (#1, #2) when multiple groups share the same display name
  const nameCount: Record<string, number> = {};
  const nameIndex: Record<string, number> = {};
  for (const g of groups) {
    nameCount[g.key] = (nameCount[g.key] || 0) + 1;
  }
  for (const g of groups) {
    if (nameCount[g.key] > 1) {
      nameIndex[g.key] = (nameIndex[g.key] || 0) + 1;
      g.key = `${g.key} #${nameIndex[g.key]}`;
    }
  }
  
  for (const g of groups) {
    g.conversionRate = g.total > 0 ? (g.closed / g.total) * 100 : 0;
  }

  const totalCreatives = groups.length;
  const totalLeads = filtered.length;
  const totalClosed = groups.reduce((s, g) => s + g.closed, 0);
  const totalLost = groups.reduce((s, g) => s + g.lost, 0);
  const bestCreative = groups[0];

  const handleFetchImage = async (group: CreativeGroup) => {
    if (group.ids.length === 0) return;
    try {
      const { data, error } = await supabase.functions.invoke("fetch-ad-image", {
        body: { ad_creative_id: group.ids[0] },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success("Imagem encontrada!");
        queryClient.invalidateQueries({ queryKey: ["ad-creatives"] });
      } else {
        toast.info(data?.message || "Nenhuma imagem encontrada. Tente upload manual.");
      }
    } catch {
      toast.error("Erro ao buscar imagem");
    }
  };

  const handleUploadClick = (group: CreativeGroup) => {
    uploadGroupRef.current = group;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const group = uploadGroupRef.current;
    if (!file || !group || group.ids.length === 0) return;
    e.target.value = "";
    const ext = file.name.split(".").pop() || "png";
    const path = `creatives/${group.ids[0]}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("chat-media").upload(path, file, { upsert: true });
    if (uploadErr) { toast.error("Erro ao enviar imagem"); return; }
    const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(path);
    try {
      for (const id of group.ids) await updateAdCreativeImage(id, urlData.publicUrl);
      toast.success("Imagem atualizada!");
      queryClient.invalidateQueries({ queryKey: ["ad-creatives"] });
    } catch { toast.error("Erro ao salvar imagem"); }
  };

  return (
    <div className="space-y-6">
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Criativos Escalados</h1>
          <p className="text-muted-foreground">Rastreie a origem dos seus leads por anúncio/criativo</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Criativos Ativos</CardTitle>
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalCreatives}</div></CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalLeads}</div></CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversões</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalClosed}</div></CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Perdidos</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{totalLost}</div></CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Melhor Criativo</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">{bestCreative?.key || "—"}</div>
            {bestCreative && <p className="text-xs text-muted-foreground">{bestCreative.total} leads</p>}
          </CardContent>
        </Card>
      </div>

      {/* Creative Cards Grid */}
      {isLoading ? (
        <p className="text-muted-foreground text-sm py-8 text-center">Carregando...</p>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <p className="text-muted-foreground text-sm text-center">
              Nenhum criativo rastreado ainda. Os dados aparecem quando leads chegarem via anúncios.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <CreativeCard key={g.key} g={g} isBest={g === bestCreative}
              showBest={groups.length > 1} onUpload={handleUploadClick} onFetchImage={handleFetchImage} />
          ))}
        </div>
      )}

      <WebhookLogsSection />
    </div>
  );
}
