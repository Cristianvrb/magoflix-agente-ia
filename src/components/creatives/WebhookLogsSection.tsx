import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, FileText, AlertCircle, CheckCircle2, Search } from "lucide-react";
import { format } from "date-fns";

export default function WebhookLogsSection() {
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data: logs = [] } = useQuery({
    queryKey: ["webhook-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const filtered = search
    ? logs.filter((l) => l.phone.includes(search) || l.event_type.includes(search))
    : logs;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full py-2">
        <FileText className="h-4 w-4" />
        <span>Webhook Logs</span>
        {open && <Badge variant="secondary" className="text-[10px]">{filtered.length}</Badge>}
        {open ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filtrar por telefone ou evento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhum log encontrado.</p>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filtered.map((log) => {
              const isExpanded = expandedIds.has(log.id);
              const hasError = !!log.error;
              return (
                <div
                  key={log.id}
                  className={`border rounded-lg text-sm ${hasError ? "border-destructive/50 bg-destructive/5" : "border-border"}`}
                >
                  <button
                    onClick={() => toggleExpand(log.id)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left"
                  >
                    {hasError ? (
                      <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                    <span className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(log.created_at), "dd/MM HH:mm:ss")}
                    </span>
                    <span className="font-mono text-xs truncate">{log.phone || "—"}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0 ml-auto">
                      {log.event_type || "unknown"}
                    </Badge>
                    {isExpanded ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2">
                      {log.error && (
                        <p className="text-xs text-destructive font-medium">Erro: {log.error}</p>
                      )}
                      <pre className="bg-muted rounded p-3 text-xs overflow-auto max-h-96 whitespace-pre-wrap break-all">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
