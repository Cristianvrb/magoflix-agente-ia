import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Calculator, TrendingUp, DollarSign, Loader2, ShoppingCart,
  Zap, Megaphone, MessageSquare, Target, BarChart3,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getAdsSpendFromMeta, getLast7DaysStats } from "@/lib/supabase-helpers";

const USD_TO_BRL = 6.0;
const PERIODS = [7, 15, 30, 60, 90] as const;

function Metric({ label, value, sub, negative }: { label: string; value: string; sub?: string; negative?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{label}</p>
      <p className={`text-lg font-black font-mono tracking-tight leading-tight ${negative ? "text-destructive" : ""}`}>{value}</p>
      {sub && <p className="text-[9px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function EstimatesPage() {
  const { data: metaSpend, isLoading: loadingMeta } = useQuery({
    queryKey: ["adsSpendFromMeta"], queryFn: getAdsSpendFromMeta,
  });
  const { data: stats7d, isLoading: loading7d } = useQuery({
    queryKey: ["last7DaysStats"], queryFn: getLast7DaysStats,
  });

  const isLoading = loadingMeta || loading7d;

  // Derived real data
  const real = useMemo(() => {
    const s = stats7d;
    const m = metaSpend;
    const adsSpend7d = (m?.spendPerDay ?? 0) * 7; // Meta gives 30d avg
    const adsPerDay = m?.spendPerDay ?? 0;
    const convsPerDay = s?.convsPerDay ?? 0;
    const costPerConvAds = convsPerDay > 0 && adsPerDay > 0 ? adsPerDay / convsPerDay : 0;
    const aiCostBrl7d = (s?.aiCostUsd ?? 0) * USD_TO_BRL;
    const aiCostPerConvBrl = (s?.aiCostPerConv ?? 0) * USD_TO_BRL;
    const revenue = s?.revenue ?? 0;
    const roas = adsSpend7d > 0 ? revenue / adsSpend7d : 0;
    const profit = revenue - adsSpend7d - aiCostBrl7d;

    return {
      adsSpend7d,
      adsPerDay,
      costPerConvAds,
      conversations: s?.conversations ?? 0,
      convsPerDay,
      sales: s?.sales ?? 0,
      revenue,
      aiCostBrl7d,
      aiCostPerConvBrl,
      convRate: s?.convRate ?? 0,
      avgTicket: s?.avgTicket ?? 0,
      roas,
      profit,
    };
  }, [metaSpend, stats7d]);

  // Simulator
  const [adsPerDay, setAdsPerDay] = useState<string>("");
  const [period, setPeriod] = useState<number>(30);

  const effAdsPerDay = adsPerDay !== "" ? parseFloat(adsPerDay) || 0 : real.adsPerDay;

  const proj = useMemo(() => {
    const costPerConv = real.costPerConvAds;
    const convsPerDay = costPerConv > 0 ? effAdsPerDay / costPerConv : real.convsPerDay;
    const totalConvs = Math.round(convsPerDay * period);
    const sales = Math.round(totalConvs * (real.convRate / 100));
    const revenue = sales * real.avgTicket;
    const costAds = effAdsPerDay * period;
    const costIA = totalConvs * real.aiCostPerConvBrl;
    const costTotal = costAds + costIA;
    const profit = revenue - costTotal;
    const roas = costAds > 0 ? revenue / costAds : 0;

    // Break-even: min convs/day to profit = 0
    const revenuePerConv = real.convRate > 0 && real.avgTicket > 0
      ? (real.convRate / 100) * real.avgTicket : 0;
    const costPerConvTotal = costPerConv + real.aiCostPerConvBrl;
    const breakEvenConvsPerDay = revenuePerConv > costPerConvTotal && costPerConvTotal > 0
      ? 0 // already profitable per conv
      : costPerConvTotal > 0 ? Math.ceil(effAdsPerDay / (revenuePerConv - real.aiCostPerConvBrl)) : 0;

    return { convsPerDay: Math.round(convsPerDay * 10) / 10, totalConvs, sales, revenue, costAds, costIA, costTotal, profit, roas, breakEvenConvsPerDay, revenuePerConv, costPerConvTotal };
  }, [effAdsPerDay, period, real]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Calculator className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Estimativas</h1>
          <p className="text-xs text-muted-foreground">Baseado nos dados reais dos últimos 7 dias</p>
        </div>
      </div>

      {/* ① RESUMO REAL — últimos 7 dias */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Resumo Real — Últimos 7 Dias
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <Metric label="Gasto Ads" value={`R$ ${real.adsSpend7d.toFixed(2)}`} sub={`R$ ${real.adsPerDay.toFixed(2)}/dia`} />
            <Metric label="Conversas" value={String(real.conversations)} sub={`${real.convsPerDay.toFixed(1)}/dia`} />
            <Metric label="Custo/Conversa (Ads)" value={real.costPerConvAds > 0 ? `R$ ${real.costPerConvAds.toFixed(2)}` : "—"} />
            <Metric label="Vendas" value={String(real.sales)} sub={`de ${real.conversations} conversas`} />
            <Metric label="Receita" value={`R$ ${real.revenue.toFixed(2)}`} />
            <Metric label="Ticket Médio" value={real.avgTicket > 0 ? `R$ ${real.avgTicket.toFixed(2)}` : "—"} />
            <Metric label="Taxa Conversão" value={`${real.convRate.toFixed(1)}%`} />
            <Metric label="Custo IA (7d)" value={`R$ ${real.aiCostBrl7d.toFixed(2)}`} sub={`R$ ${real.aiCostPerConvBrl.toFixed(4)}/conv`} />
            <Metric label="ROAS Real" value={real.roas > 0 ? `${real.roas.toFixed(2)}x` : "—"} />
            <Metric label="Lucro Real (7d)" value={`R$ ${real.profit.toFixed(2)}`} negative={real.profit < 0} />
          </div>
          {real.conversations === 0 && (
            <p className="text-xs text-muted-foreground mt-3">Sem dados nos últimos 7 dias. As projeções usarão valores zerados.</p>
          )}
        </CardContent>
      </Card>

      {/* ② PROJEÇÃO */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Projeção
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Inputs */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="space-y-1.5 flex-1 max-w-xs">
              <label className="text-xs font-medium flex items-center gap-1.5">
                <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
                Gasto Ads / dia (R$)
              </label>
              <Input
                type="number"
                placeholder={real.adsPerDay > 0 ? real.adsPerDay.toFixed(2) : "0"}
                value={adsPerDay}
                onChange={(e) => setAdsPerDay(e.target.value)}
                className="font-mono h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Período</label>
              <div className="flex gap-1.5">
                {PERIODS.map((p) => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${
                      period === p
                        ? "bg-primary text-primary-foreground shadow"
                        : "bg-secondary text-secondary-foreground hover:bg-accent"
                    }`}>
                    {p}d
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Separator />

          {/* Results */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            <Metric label="Conversas" value={String(proj.totalConvs)} sub={`${proj.convsPerDay}/dia`} />
            <Metric label="Vendas" value={String(proj.sales)} />
            <Metric label="Receita" value={`R$ ${proj.revenue.toFixed(2)}`} />
            <Metric label="Custo Ads" value={`R$ ${proj.costAds.toFixed(2)}`} />
            <Metric label="Custo IA" value={`R$ ${proj.costIA.toFixed(2)}`} />
            <Metric label="Custo Total" value={`R$ ${proj.costTotal.toFixed(2)}`} sub="Ads + IA" />
            <Metric label="Lucro" value={`R$ ${proj.profit.toFixed(2)}`} negative={proj.profit < 0} />
            <Metric label="ROAS" value={proj.roas > 0 ? `${proj.roas.toFixed(2)}x` : "—"} />
          </div>
        </CardContent>
      </Card>

      {/* ③ BREAK-EVEN */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            Break-even
          </CardTitle>
        </CardHeader>
        <CardContent>
          {proj.revenuePerConv > 0 && proj.costPerConvTotal > 0 ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-6">
                <Metric
                  label="Receita/conversa"
                  value={`R$ ${proj.revenuePerConv.toFixed(2)}`}
                  sub={`ticket ${real.avgTicket.toFixed(2)} × conv ${real.convRate.toFixed(1)}%`}
                />
                <Metric
                  label="Custo/conversa total"
                  value={`R$ ${proj.costPerConvTotal.toFixed(2)}`}
                  sub={`ads ${real.costPerConvAds.toFixed(2)} + IA ${real.aiCostPerConvBrl.toFixed(4)}`}
                />
                <Metric
                  label="Margem/conversa"
                  value={`R$ ${(proj.revenuePerConv - proj.costPerConvTotal).toFixed(2)}`}
                  negative={proj.revenuePerConv < proj.costPerConvTotal}
                />
              </div>
              {proj.revenuePerConv > proj.costPerConvTotal ? (
                <p className="text-xs text-muted-foreground mt-2">
                  ✅ Cada conversa gera <span className="font-bold text-foreground">R$ {(proj.revenuePerConv - proj.costPerConvTotal).toFixed(2)}</span> de lucro. Operação lucrativa.
                </p>
              ) : (
                <p className="text-xs text-destructive mt-2">
                  ⚠️ Custo por conversa maior que receita. Revise taxa de conversão ou ticket médio.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Dados insuficientes para calcular break-even. Precisa de vendas e conversas nos últimos 7 dias.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
