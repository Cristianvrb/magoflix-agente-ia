import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Globe, Filter, X } from "lucide-react";

export type ConversationFilters = {
  status: "all" | "active" | "closed";
  channel: "all" | "whatsapp" | "web";
  stage: string;
};

interface ConversationFiltersBarProps {
  filters: ConversationFilters;
  onFiltersChange: (filters: ConversationFilters) => void;
}

const stages = [
  { value: "all", label: "Todos" },
  { value: "novo", label: "Novo" },
  { value: "qualificado", label: "Qualificado" },
  { value: "proposta", label: "Proposta" },
  { value: "fechado", label: "Fechado" },
  { value: "perdido", label: "Perdido" },
];

export default function ConversationFiltersBar({ filters, onFiltersChange }: ConversationFiltersBarProps) {
  const hasFilters = filters.status !== "all" || filters.channel !== "all" || filters.stage !== "all";

  const clearFilters = () => onFiltersChange({ status: "all", channel: "all", stage: "all" });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {/* Status */}
        <Button
          variant={filters.status === "active" ? "default" : "outline"}
          size="sm"
          className="h-6 text-[11px] px-2"
          onClick={() => onFiltersChange({ ...filters, status: filters.status === "active" ? "all" : "active" })}
        >
          Ativo
        </Button>
        <Button
          variant={filters.status === "closed" ? "default" : "outline"}
          size="sm"
          className="h-6 text-[11px] px-2"
          onClick={() => onFiltersChange({ ...filters, status: filters.status === "closed" ? "all" : "closed" })}
        >
          Encerrado
        </Button>
        {/* Channel */}
        <Button
          variant={filters.channel === "whatsapp" ? "default" : "outline"}
          size="sm"
          className="h-6 text-[11px] px-2"
          onClick={() => onFiltersChange({ ...filters, channel: filters.channel === "whatsapp" ? "all" : "whatsapp" })}
        >
          <Phone className="h-3 w-3 mr-1" />
          WhatsApp
        </Button>
        <Button
          variant={filters.channel === "web" ? "default" : "outline"}
          size="sm"
          className="h-6 text-[11px] px-2"
          onClick={() => onFiltersChange({ ...filters, channel: filters.channel === "web" ? "all" : "web" })}
        >
          <Globe className="h-3 w-3 mr-1" />
          Web
        </Button>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-1.5" onClick={clearFilters}>
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      {/* Stage filter */}
      <div className="flex items-center gap-1 flex-wrap">
        {stages.map((s) => (
          <Badge
            key={s.value}
            variant={filters.stage === s.value ? "default" : "outline"}
            className="cursor-pointer text-[10px] px-2 py-0"
            onClick={() => onFiltersChange({ ...filters, stage: s.value })}
          >
            {s.label}
          </Badge>
        ))}
      </div>
    </div>
  );
}
