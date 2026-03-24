import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Users, TrendingUp, TrendingDown, CalendarIcon, Clock, BarChart3,
  ArrowRight, Loader2,
} from "lucide-react";
import {
  Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip, Line, LineChart, BarChart, Legend,
} from "recharts";
import { subDays, startOfDay, endOfDay, format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { getConversations } from "@/lib/supabase-helpers";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

const STAGES = [
  { key: "novo", label: "Novo", color: "#64748b" },
  { key: "qualificado", label: "Qualificado", color: "hsl(var(--info))" },
  { key: "proposta", label: "Proposta", color: "hsl(var(--warning))" },
  { key: "fechado", label: "Fechado", color: "hsl(var(--success))" },
  { key: "perdido", label: "Perdido", color: "hsl(var(--destructive))" },
] as const;

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "15d", days: 15 },
  { label: "30d", days: 30 },
] as const;

function inRange(dateStr: string, from: Date, to: Date) {
  const t = new Date(dateStr).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

export default function FunnelAnalyticsPage() {
  const now = useMemo(() => new Date(), []);
  const [selectedPreset, setSelectedPreset] = useState<number>(30);
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [popoverOpen, setPopoverOpen] = useState(false);

  const dateRange = useMemo(() => {
    if (customRange?.from && customRange?.to) {
      return { from: startOfDay(customRange.from), to: endOfDay(customRange.to) };
    }
    return { from: startOfDay(subDays(now, selectedPreset - 1)), to: endOfDay(now) };
  }, [selectedPreset, customRange, now]);

  const periodDays = differenceInDays(dateRange.to, dateRange.from) + 1;

  const handlePreset = (days: number) => {
    setSelectedPreset(days);
    setCustomRange(undefined);
  };

  const handleCustomSelect = (range: DateRange | undefined) => {
    setCustomRange(range);
    if (range?.from && range?.to) {
      setSelectedPreset(0);
      setPopoverOpen(false);
    }
  };

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: getConversations,
  });

  const filtered = useMemo(
    () => conversations.filter((c) => inRange(c.created_at, dateRange.from, dateRange.to)),
    [conversations, dateRange]
  );

  // KPIs
  const totalLeads = filtered.length;
  const closedCount = filtered.filter((c) => c.lead_stage === "fechado").length;
  const lostCount = filtered.filter((c) => c.lead_stage === "perdido").length;
  const convRate = totalLeads > 0 ? ((closedCount / totalLeads) * 100).toFixed(1) : "0";
  const lossRate = totalLeads > 0 ? ((lostCount / totalLeads) * 100).toFixed(1) : "0";

  // Avg time in funnel for closed leads (days between created_at and updated_at)
  const avgFunnelTime = useMemo(() => {
    const closed = filtered.filter((c) => c.lead_stage === "fechado");
    if (closed.length === 0) return "—";
    const totalDays = closed.reduce((sum, c) => {
      const created = new Date(c.created_at).getTime();
      const updated = new Date(c.updated_at).getTime();
      return sum + Math.max((updated - created) / (1000 * 60 * 60 * 24), 0);
    }, 0);
    return (totalDays / closed.length).toFixed(1);
  }, [filtered]);

  // Daily stacked bar data
  const dailyData = useMemo(() => {
    const days: Record<string, Record<string, number>> = {};
    for (let i = 0; i < periodDays; i++) {
      const d = new Date(dateRange.from);
      d.setDate(d.getDate() + i);
      const key = format(d, "dd/MM");
      days[key] = {};
      for (const s of STAGES) days[key][s.key] = 0;
    }
    for (const c of filtered) {
      const key = format(new Date(c.created_at), "dd/MM");
      const stage = c.lead_stage || "novo";
      if (days[key] && days[key][stage] !== undefined) {
        days[key][stage]++;
      }
    }
    return Object.entries(days).map(([date, stages]) => ({ date, ...stages }));
  }, [filtered, periodDays, dateRange]);

  // Trend line data (cumulative conversion & loss rate by day)
  const trendData = useMemo(() => {
    let cumTotal = 0;
    let cumClosed = 0;
    let cumLost = 0;
    return dailyData.map((d) => {
      const dayTotal = STAGES.reduce((s, st) => s + ((d as any)[st.key] || 0), 0);
      cumTotal += dayTotal;
      cumClosed += (d as any).fechado || 0;
      cumLost += (d as any).perdido || 0;
      return {
        date: d.date,
        convRate: cumTotal > 0 ? Number(((cumClosed / cumTotal) * 100).toFixed(1)) : 0,
        lossRate: cumTotal > 0 ? Number(((cumLost / cumTotal) * 100).toFixed(1)) : 0,
      };
    });
  }, [dailyData]);

  // Transition table
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of STAGES) counts[s.key] = 0;
    for (const c of filtered) {
      const stage = c.lead_stage || "novo";
      if (counts[stage] !== undefined) counts[stage]++;
    }
    return counts;
  }, [filtered]);

  const transitions = useMemo(() => {
    const pairs = [
      { from: "novo", to: "qualificado" },
      { from: "qualificado", to: "proposta" },
      { from: "proposta", to: "fechado" },
    ];
    return pairs.map((p) => ({
      ...p,
      fromLabel: STAGES.find((s) => s.key === p.from)!.label,
      toLabel: STAGES.find((s) => s.key === p.to)!.label,
      rate: stageCounts[p.from] > 0
        ? ((stageCounts[p.to] / stageCounts[p.from]) * 100).toFixed(1)
        : "0",
    }));
  }, [stageCounts]);

  const kpis = [
    { label: "Total de Leads", value: totalLeads, icon: Users, accent: "primary" },
    { label: "Taxa de Conversão", value: `${convRate}%`, icon: TrendingUp, accent: "success" },
    { label: "Taxa de Perda", value: `${lossRate}%`, icon: TrendingDown, accent: "destructive" },
    { label: "Tempo Médio (dias)", value: avgFunnelTime, icon: Clock, accent: "info" },
  ];

  const accentColorMap: Record<string, string> = {
    primary: "hsl(var(--primary))",
    success: "hsl(var(--success))",
    destructive: "hsl(var(--destructive))",
    info: "hsl(var(--info))",
    warning: "hsl(var(--warning))",
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Análise do Funil</h1>
          <p className="text-sm text-muted-foreground">Performance do funil dia após dia</p>
        </div>
        <div className="flex items-center gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.days}
              size="sm"
              variant={selectedPreset === p.days && !customRange ? "default" : "outline"}
              onClick={() => handlePreset(p.days)}
              className="text-xs h-8"
            >
              {p.label}
            </Button>
          ))}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant={customRange ? "default" : "outline"} className="text-xs h-8 gap-1">
                <CalendarIcon className="h-3.5 w-3.5" />
                {customRange?.from && customRange?.to
                  ? `${format(customRange.from, "dd/MM")} – ${format(customRange.to, "dd/MM")}`
                  : "Período"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={customRange}
                onSelect={handleCustomSelect}
                locale={ptBR}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const color = accentColorMap[kpi.accent];
          return (
            <Card
              key={kpi.label}
              className="relative overflow-hidden border border-border/40 bg-card/80 backdrop-blur-sm shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 animate-fade-in-up"
              style={{
                animationDelay: `${i * 80}ms`,
                animationFillMode: "backwards",
                borderLeft: `3px solid ${color}`,
                borderTop: `1px solid ${color}30`,
                background: `linear-gradient(135deg, ${color}12 0%, transparent 60%)`,
              }}
            >
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl shadow-lg"
                    style={{
                      background: `linear-gradient(135deg, ${color}, ${color}cc)`,
                      boxShadow: `0 4px 14px -3px ${color}50`,
                    }}
                  >
                    <kpi.icon className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
                    {kpi.label}
                  </p>
                </div>
                <div className="text-3xl font-black tracking-tighter font-mono">{kpi.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Stacked Bar Chart */}
      <Card className="border border-border/40 bg-card/80 backdrop-blur-sm shadow-md animate-fade-in-up" style={{ animationDelay: "320ms", animationFillMode: "backwards" }}>
        <CardHeader className="pb-2 bg-accent/30 rounded-t-lg">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Distribuição Diária por Etapa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                 <Tooltip
                   contentStyle={{
                     background: "hsl(var(--card))",
                     border: "1px solid hsl(var(--border))",
                     borderRadius: "10px",
                     fontSize: 12,
                     padding: "10px 14px",
                     boxShadow: "0 4px 20px -4px rgba(0,0,0,0.15)",
                   }}
                 />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value) => STAGES.find((s) => s.key === value)?.label || value}
                />
                {STAGES.map((s) => (
                  <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} radius={0} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Trend + Transitions side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Trend Chart */}
        <Card className="lg:col-span-2 border border-border/40 bg-card/80 backdrop-blur-sm shadow-md animate-fade-in-up" style={{ animationDelay: "400ms", animationFillMode: "backwards" }}>
          <CardHeader className="pb-2 bg-accent/30 rounded-t-lg">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-success" />
              Tendência de Conversão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => `${v}%`}
                  />
                   <Tooltip
                     contentStyle={{
                       background: "hsl(var(--card))",
                       border: "1px solid hsl(var(--border))",
                       borderRadius: "10px",
                       fontSize: 12,
                       padding: "10px 14px",
                       boxShadow: "0 4px 20px -4px rgba(0,0,0,0.15)",
                     }}
                    formatter={(value: number, name: string) => [
                      `${value}%`,
                      name === "convRate" ? "Conversão" : "Perda",
                    ]}
                  />
                  <Legend formatter={(v) => (v === "convRate" ? "Conversão" : "Perda")} wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="convRate" stroke="hsl(var(--success))" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="lossRate" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Transitions Table */}
        <Card className="border border-border/40 bg-card/80 backdrop-blur-sm shadow-md animate-fade-in-up" style={{ animationDelay: "480ms", animationFillMode: "backwards" }}>
          <CardHeader className="pb-2 bg-accent/30 rounded-t-lg">
            <CardTitle className="text-base">Transições</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stage counts */}
            <div className="space-y-2.5">
              {STAGES.map((s) => {
                const maxCount = Math.max(...Object.values(stageCounts), 1);
                const pct = (stageCounts[s.key] / maxCount) * 100;
                return (
                  <div key={s.key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                        <span className="text-xs text-muted-foreground">{s.label}</span>
                      </div>
                      <span className="text-sm font-bold font-mono">{stageCounts[s.key]}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: s.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="h-px bg-border/60" />

            {/* Transition rates */}
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Taxa de Passagem</p>
              {transitions.map((t) => (
                <div key={`${t.from}-${t.to}`} className="flex items-center gap-2 p-1.5 rounded-md bg-accent/40">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{t.fromLabel}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{t.toLabel}</span>
                  <Badge variant="outline" className="ml-auto text-[10px] font-bold px-2 py-0.5 bg-background/80">
                    {t.rate}%
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
