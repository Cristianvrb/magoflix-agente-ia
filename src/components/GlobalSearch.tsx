import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  MessageSquare,
  Kanban,
  Settings,
  Bot,
  Megaphone,
  Calculator,
  TestTube,
  Plug,
  Users,
  BarChart3,
  Search,
  Rocket,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const pages = [
  { name: "Dashboard", url: "/", icon: LayoutDashboard },
  { name: "Conversas", url: "/conversas", icon: MessageSquare },
  { name: "Funil de Vendas", url: "/funil", icon: Kanban },
  { name: "Análise Funil", url: "/analise-funil", icon: BarChart3 },
  { name: "Agentes", url: "/agents", icon: Bot },
  { name: "Criativos", url: "/criativos", icon: Megaphone },
  { name: "Campanhas", url: "/campanhas", icon: Rocket },
  { name: "Estimativas", url: "/estimativas", icon: Calculator },
  { name: "Testar IA", url: "/testar-ia", icon: TestTube },
  { name: "Instâncias", url: "/instancias", icon: Plug },
  { name: "Grupos", url: "/grupos", icon: Users },
  { name: "Configurações", url: "/configuracoes", icon: Settings },
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations-search"],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations")
        .select("id, contact_name, contact_phone, status")
        .order("updated_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    staleTime: 30_000,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents-search"],
    queryFn: async () => {
      const { data } = await supabase
        .from("agents")
        .select("id, name, description")
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    staleTime: 60_000,
  });

  const go = useCallback(
    (url: string) => {
      setOpen(false);
      navigate(url);
    },
    [navigate]
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Buscar...</span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar páginas, conversas, agentes..." />
        <CommandList>
          <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
          <CommandGroup heading="Páginas">
            {pages.map((page) => (
              <CommandItem key={page.url} onSelect={() => go(page.url)}>
                <page.icon className="mr-2 h-4 w-4" />
                {page.name}
              </CommandItem>
            ))}
          </CommandGroup>
          {conversations.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Conversas recentes">
                {conversations.slice(0, 8).map((c) => (
                  <CommandItem key={c.id} onSelect={() => go("/conversas")}>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    <span>{c.contact_name}</span>
                    {c.contact_phone && (
                      <span className="ml-2 text-xs text-muted-foreground">{c.contact_phone}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {agents.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Agentes">
                {agents.map((a) => (
                  <CommandItem key={a.id} onSelect={() => go(`/agents/${a.id}`)}>
                    <Bot className="mr-2 h-4 w-4" />
                    <span>{a.name}</span>
                    {a.description && (
                      <span className="ml-2 text-xs text-muted-foreground truncate max-w-[200px]">{a.description}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
