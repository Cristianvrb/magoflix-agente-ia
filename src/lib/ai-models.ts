export const AI_MODEL_GROUPS = [
  {
    provider: "OpenAI",
    models: [
      { value: "gpt-4o-mini", label: "GPT-4o Mini (econômico)" },
      { value: "gpt-4o", label: "GPT-4o (avançado)" },
      { value: "gpt-4o-2024-11-20", label: "GPT-4o Latest (mais inteligente)" },
    ],
  },
];

export const DEFAULT_MODEL = "gpt-4o-mini";

export function getModelLabel(value: string | null): string {
  if (!value) return "Modelo Padrão";
  for (const group of AI_MODEL_GROUPS) {
    const model = group.models.find((m) => m.value === value);
    if (model) return model.label;
  }
  return value;
}
