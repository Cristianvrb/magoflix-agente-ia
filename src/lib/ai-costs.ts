interface ModelCost {
  input: number;  // USD per 1M tokens
  output: number; // USD per 1M tokens
}

const MODEL_COSTS: Record<string, ModelCost> = {
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o": { input: 2.50, output: 10.00 },
};

const BRL_RATE = 5.20;

export function getModelCost(model: string): ModelCost {
  return MODEL_COSTS[model] ?? { input: 0.15, output: 0.60 };
}

export function calculateCostUSD(model: string, promptTokens: number, completionTokens: number): number {
  const cost = getModelCost(model);
  return (promptTokens / 1_000_000) * cost.input + (completionTokens / 1_000_000) * cost.output;
}

export function formatCostBRL(usd: number): string {
  const brl = usd * BRL_RATE;
  return `R$ ${brl.toFixed(4)}`;
}

export function formatCostUSD(usd: number): string {
  return `$ ${usd.toFixed(6)}`;
}
