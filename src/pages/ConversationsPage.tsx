import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, Phone, Globe, Send, Loader2, Bot, User, ArrowLeft, MessageSquare } from "lucide-react";
import MessageBubble from "@/components/conversations/MessageBubble";
import ConversationFiltersBar, { type ConversationFilters } from "@/components/conversations/ConversationFilters";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getConversations, getMessages, toggleConversationAI } from "@/lib/supabase-helpers";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";
}

const stageColors: Record<string, string> = {
  novo: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  qualificado: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  proposta: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  fechado: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  perdido: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export default function ConversationsPage() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [filters, setFilters] = useState<ConversationFilters>({ status: "all", channel: "all", stage: "all" });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const channel = supabase
      .channel("messages-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const newMsg = payload.new as { conversation_id: string };
        queryClient.invalidateQueries({ queryKey: ["messages", newMsg.conversation_id] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: conversations = [], isLoading: loadingConvs } = useQuery({
    queryKey: ["conversations"],
    queryFn: getConversations,
  });

  const { data: messages = [], isLoading: loadingMsgs } = useQuery({
    queryKey: ["messages", selectedId],
    queryFn: () => getMessages(selectedId!),
    enabled: !!selectedId,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selected = conversations.find((c) => c.id === selectedId);

  const filtered = conversations.filter((c) => {
    const matchSearch =
      c.contact_name.toLowerCase().includes(search.toLowerCase()) ||
      c.contact_phone?.includes(search);
    const matchStatus =
      filters.status === "all" ||
      (filters.status === "active" && c.status === "active") ||
      (filters.status === "closed" && c.status !== "active");
    const matchChannel = filters.channel === "all" || c.channel === filters.channel;
    const matchStage = filters.stage === "all" || (c as any).lead_stage === filters.stage;
    return matchSearch && matchStatus && matchChannel && matchStage;
  });

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const { data, error } = await supabase.functions.invoke("send-message", {
        body: { conversation_id: selectedId, content },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: () => toast.error("Erro ao enviar mensagem"),
  });

  const toggleAIMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => toggleConversationAI(id, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Status da IA atualizado");
    },
    onError: () => toast.error("Erro ao alterar status da IA"),
  });

  const handleSend = () => {
    if (!newMessage.trim() || !selectedId) return;
    sendMutation.mutate(newMessage.trim());
  };

  const aiEnabled = (selected as any)?.ai_enabled !== false;

  const showList = !isMobile || !selectedId;
  const showDetail = !isMobile || !!selectedId;

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-0">
      {/* Conversation List */}
      {showList && (
        <div className={cn(
          "flex flex-col border-r border-border/60 bg-card",
          isMobile ? "w-full" : "w-[360px] shrink-0"
        )}>
          {/* Header */}
          <div className="px-4 pt-4 pb-3 space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold tracking-tight">Conversas</h1>
              <Badge variant="secondary" className="text-xs font-mono tabular-nums">
                {filtered.length}
              </Badge>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                className="pl-9 h-9 text-sm bg-muted/50 border-transparent focus:border-primary/30 focus:bg-background transition-colors"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ConversationFiltersBar filters={filters} onFiltersChange={setFilters} />
          </div>

          {/* List */}
          <ScrollArea className="flex-1">
            {loadingConvs ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="px-2 pb-2">
                {filtered.map((c) => {
                  const stage = (c as any).lead_stage || "novo";
                  const isSelected = selectedId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-all",
                        "hover:bg-accent/60",
                        isSelected
                          ? "bg-accent shadow-sm ring-1 ring-primary/20"
                          : "bg-transparent"
                      )}
                    >
                      {/* Avatar */}
                      <Avatar className={cn(
                        "h-10 w-10 shrink-0 text-xs font-semibold",
                        c.channel === "whatsapp"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                      )}>
                        <AvatarFallback className={cn(
                          c.channel === "whatsapp"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        )}>
                          {getInitials(c.contact_name)}
                        </AvatarFallback>
                      </Avatar>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{c.contact_name}</span>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(c.updated_at), { addSuffix: false, locale: ptBR })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {c.channel === "whatsapp" ? (
                            <Phone className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Globe className="h-3 w-3 text-blue-500" />
                          )}
                          <span className={cn(
                            "text-[10px] font-medium px-1.5 py-0.5 rounded-md",
                            stageColors[stage] || stageColors.novo
                          )}>
                            {stage}
                          </span>
                          {(c as any).instances?.name && (
                            <span className="text-[10px] text-muted-foreground truncate">
                              {(c as any).instances.name}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status dot */}
                      <div className={cn(
                        "h-2 w-2 rounded-full shrink-0",
                        c.status === "active" ? "bg-emerald-500" : "bg-muted-foreground/30"
                      )} />
                    </button>
                  );
                })}
                {filtered.length === 0 && !loadingConvs && (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                    <MessageSquare className="h-8 w-8 opacity-40" />
                    <p className="text-sm">Nenhuma conversa encontrada</p>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      )}

      {/* Chat Detail */}
      {showDetail && (
        <div className="flex flex-1 flex-col bg-background">
          {selected ? (
            <>
              {/* Chat header */}
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 bg-card/80 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  {isMobile && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2" onClick={() => setSelectedId(null)}>
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  )}
                  <Avatar className={cn(
                    "h-9 w-9 text-xs font-semibold",
                    selected.channel === "whatsapp"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                  )}>
                    <AvatarFallback className={cn(
                      selected.channel === "whatsapp"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                    )}>
                      {getInitials(selected.contact_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold leading-tight">{selected.contact_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {selected.contact_phone && (
                        <span className="text-xs text-muted-foreground">{selected.contact_phone}</span>
                      )}
                      {(selected as any).instances?.name && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {(selected as any).instances.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-muted/60 rounded-full pl-3 pr-1.5 py-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {aiEnabled ? "IA" : "Manual"}
                    </span>
                    <div className={cn(
                      "flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full",
                      aiEnabled
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                    )}>
                      {aiEnabled ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    </div>
                    <Switch
                      checked={aiEnabled}
                      onCheckedChange={(checked) => toggleAIMutation.mutate({ id: selected.id, enabled: checked })}
                      disabled={toggleAIMutation.isPending}
                      className="scale-90"
                    />
                  </div>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 px-4 py-4">
                {loadingMsgs ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-3 max-w-3xl mx-auto">
                    {messages.map((msg: any) => (
                      <MessageBubble
                        key={msg.id}
                        role={msg.role}
                        content={msg.content}
                        created_at={msg.created_at}
                        media_url={msg.media_url}
                        media_type={msg.media_type}
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Input */}
              <div className="border-t border-border/60 p-4 bg-card/80 backdrop-blur-sm">
                <div className="flex gap-2 max-w-3xl mx-auto">
                  <Input
                    placeholder="Digitar mensagem..."
                    className="flex-1 h-10 bg-muted/50 border-transparent focus:border-primary/30 focus:bg-background transition-colors"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  />
                  <Button
                    size="icon"
                    className="h-10 w-10 rounded-xl shrink-0"
                    onClick={handleSend}
                    disabled={sendMutation.isPending || !newMessage.trim()}
                  >
                    {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground gap-3">
              <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center">
                <MessageSquare className="h-7 w-7 opacity-50" />
              </div>
              <p className="text-sm font-medium">Selecione uma conversa</p>
              <p className="text-xs">Escolha um contato ao lado para começar</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
