import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Users, Search, Loader2 } from "lucide-react";
import GroupCard from "@/components/groups/GroupCard";
import { GroupMessage } from "@/components/groups/ScheduledMessageItem";
import TemplatesTab, { GroupTemplate } from "@/components/groups/TemplatesTab";
import FeedbacksTab from "@/components/groups/FeedbacksTab";

interface Group {
  id: string;
  wa_group_id: string;
  name: string;
  instance_id: string | null;
  agent_id: string | null;
  enabled: boolean;
  respond_mode: string;
  members_joined: number;
  members_left: number;
  created_at: string;
}

interface Instance { id: string; name: string; }
interface Agent { id: string; name: string; }

const RESPOND_MODES = [
  { value: "send_only", label: "Apenas envio" },
  { value: "all", label: "Responder tudo" },
  { value: "mention", label: "Só quando mencionado" },
  { value: "none", label: "Apenas monitorar" },
];

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupMessages, setGroupMessages] = useState<Record<string, GroupMessage[]>>({});
  const [templates, setTemplates] = useState<GroupTemplate[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sendingMap, setSendingMap] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({ name: "", wa_group_id: "", instance_id: "__none__", agent_id: "__none__", respond_mode: "send_only" });
  const [filterInstance, setFilterInstance] = useState<string>("__all__");
  const [fetching, setFetching] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [bulkSending, setBulkSending] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [gRes, iRes, aRes, gmRes, tRes] = await Promise.all([
      supabase.from("groups" as any).select("*").order("created_at", { ascending: true }),
      supabase.from("instances" as any).select("id, name"),
      supabase.from("agents").select("id, name"),
      supabase.from("group_messages" as any).select("*"),
      supabase.from("group_templates" as any).select("*").order("created_at", { ascending: false }),
    ]);
    setGroups((gRes.data || []) as any);
    setInstances((iRes.data || []) as any);
    setAgents((aRes.data || []) as any);
    setTemplates((tRes.data || []) as any);

    // Build 1:N map
    const msgMap: Record<string, GroupMessage[]> = {};
    ((gmRes.data || []) as any[]).forEach((m: GroupMessage) => {
      if (!msgMap[m.group_id]) msgMap[m.group_id] = [];
      msgMap[m.group_id].push(m);
    });
    setGroupMessages(msgMap);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Fetch groups from ALL instances at once
  const handleFetchAllGroups = async () => {
    if (instances.length === 0) { toast.error("Nenhuma instância cadastrada"); return; }
    setFetching(true);
    let totalImported = 0;
    let totalFound = 0;
    let errors: string[] = [];

    for (const inst of instances) {
      try {
        const { data, error } = await supabase.functions.invoke("fetch-groups", {
          body: { instance_id: inst.id },
        });
        if (error) { errors.push(`${inst.name}: ${error.message}`); continue; }
        if (data?.error) { errors.push(`${inst.name}: ${data.error}`); continue; }
        totalFound += data.total || 0;
        totalImported += data.imported || 0;
      } catch (err: any) {
        errors.push(`${inst.name}: ${err.message}`);
      }
    }

    if (totalImported > 0) {
      toast.success(`${totalFound} grupos encontrados, ${totalImported} importados (apenas onde sou admin)`);
    } else if (errors.length > 0) {
      toast.error(`Erros: ${errors.join("; ")}`);
    } else {
      toast.info(`${totalFound} grupos encontrados, nenhum novo importado`);
    }
    fetchData();
    setFetching(false);
  };

  const handleFetchGroups = async () => {
    if (filterInstance === "__all__") { handleFetchAllGroups(); return; }
    setFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-groups", {
        body: { instance_id: filterInstance },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const { total, imported } = data;
      if (imported > 0) toast.success(`${total} encontrados, ${imported} importados (admin)`);
      else toast.info(`${total} encontrados, nenhum novo (admin)`);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao buscar grupos");
    } finally {
      setFetching(false);
    }
  };

  const handleAdd = async () => {
    if (!form.wa_group_id.trim()) { toast.error("Informe o ID do grupo"); return; }
    const { error } = await (supabase.from("groups" as any).insert({
      wa_group_id: form.wa_group_id.trim(),
      name: form.name.trim() || form.wa_group_id.trim(),
      instance_id: form.instance_id === "__none__" ? null : form.instance_id,
      agent_id: form.agent_id === "__none__" ? null : form.agent_id,
      respond_mode: form.respond_mode,
    }) as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Grupo adicionado!");
    setForm({ name: "", wa_group_id: "", instance_id: "__none__", agent_id: "__none__", respond_mode: "send_only" });
    setDialogOpen(false);
    fetchData();
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await (supabase.from("groups" as any).update({ enabled }).eq("id", id) as any);
    setGroups(prev => prev.map(g => g.id === id ? { ...g, enabled } : g));
  };

  const handleUpdate = async (id: string, field: string, value: string | null) => {
    const dbValue = value === "__none__" ? null : value || null;
    await (supabase.from("groups" as any).update({ [field]: dbValue }).eq("id", id) as any);
    setGroups(prev => prev.map(g => g.id === id ? { ...g, [field]: dbValue } : g));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este grupo?")) return;
    await (supabase.from("groups" as any).delete().eq("id", id) as any);
    toast.success("Grupo excluído");
    setGroups(prev => prev.filter(g => g.id !== id));
  };

  // --- Message-level handlers (1:N) ---

  const handleAddMessage = async (groupId: string) => {
    const { data, error } = await (supabase.from("group_messages" as any).insert({ group_id: groupId }).select().single() as any);
    if (error) { toast.error(error.message); return; }
    setGroupMessages(prev => ({
      ...prev,
      [groupId]: [...(prev[groupId] || []), data as GroupMessage],
    }));
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm("Excluir este envio?")) return;
    await (supabase.from("group_messages" as any).delete().eq("id", messageId) as any);
    setGroupMessages(prev => {
      const next = { ...prev };
      for (const gid in next) {
        next[gid] = next[gid].filter(m => m.id !== messageId);
      }
      return next;
    });
    toast.success("Envio excluído");
  };

  const updateMessageLocal = (messageId: string, updates: Partial<GroupMessage>) => {
    setGroupMessages(prev => {
      const next = { ...prev };
      for (const gid in next) {
        next[gid] = next[gid].map(m => m.id === messageId ? { ...m, ...updates } : m);
      }
      return next;
    });
  };

  const handleMessageContentChange = (messageId: string, content: string) => {
    updateMessageLocal(messageId, { content });
  };

  const handleMessageImageChange = (messageId: string, url: string | null) => {
    updateMessageLocal(messageId, { image_url: url });
  };

  const handleMessageAudioChange = (messageId: string, url: string | null) => {
    updateMessageLocal(messageId, { audio_url: url });
  };

  const findMessage = (messageId: string): GroupMessage | undefined => {
    for (const gid in groupMessages) {
      const m = groupMessages[gid].find(msg => msg.id === messageId);
      if (m) return m;
    }
    return undefined;
  };

  const handleSendNow = async (messageId: string) => {
    const m = findMessage(messageId);
    if (!m) return;
    if (!m.content && !m.image_url && !m.audio_url) { toast.error("Adicione conteúdo antes de enviar"); return; }

    setSendingMap(prev => ({ ...prev, [messageId]: true }));
    try {
      // Save content to DB first
      await (supabase.from("group_messages" as any).update({
        content: m.content, image_url: m.image_url, audio_url: m.audio_url,
      }).eq("id", messageId) as any);

      const { error } = await supabase.functions.invoke("send-group-message", {
        body: { group_id: m.group_id, content: m.content, image_url: m.image_url, audio_url: m.audio_url },
      });
      if (error) throw error;

      const now = new Date().toISOString();
      await (supabase.from("group_messages" as any).update({ last_sent_at: now }).eq("id", messageId) as any);
      updateMessageLocal(messageId, { last_sent_at: now });
      toast.success("Mensagem enviada!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar");
    } finally {
      setSendingMap(prev => ({ ...prev, [messageId]: false }));
    }
  };

  const handleScheduleToggle = async (messageId: string, enabled: boolean) => {
    const m = findMessage(messageId);
    if (!m) return;
    const nextSend = enabled ? new Date(Date.now() + m.schedule_interval_hours * 3600000).toISOString() : null;

    await (supabase.from("group_messages" as any).update({
      schedule_enabled: enabled, content: m.content, image_url: m.image_url, audio_url: m.audio_url, next_send_at: nextSend,
    }).eq("id", messageId) as any);
    updateMessageLocal(messageId, { schedule_enabled: enabled, next_send_at: nextSend });
  };

  const handleIntervalChange = async (messageId: string, hours: string) => {
    const m = findMessage(messageId);
    if (!m) return;
    const interval = parseInt(hours);
    const nextSend = m.schedule_enabled ? new Date(Date.now() + interval * 3600000).toISOString() : null;

    await (supabase.from("group_messages" as any).update({
      schedule_interval_hours: interval, next_send_at: nextSend,
    }).eq("id", messageId) as any);
    updateMessageLocal(messageId, { schedule_interval_hours: interval, next_send_at: nextSend });
  };

  const toggleSelect = (id: string) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkSend = async (templateId: string) => {
    const t = templates.find(tp => tp.id === templateId);
    if (!t) return;
    const targetGroups = groups.filter(g => selectedGroups.has(g.id) && g.instance_id);
    if (targetGroups.length === 0) { toast.error("Selecione grupos com instância vinculada"); return; }

    setBulkSending(true);
    let sent = 0;
    for (const g of targetGroups) {
      try {
        await supabase.functions.invoke("send-group-message", {
          body: { group_id: g.id, content: t.content, image_url: t.image_url, audio_url: t.audio_url },
        });
        sent++;
      } catch { /* continue */ }
    }
    toast.success(`Template enviado para ${sent}/${targetGroups.length} grupos`);
    setSelectedGroups(new Set());
    setBulkSending(false);
    fetchData();
  };

  const filteredGroups = groups.filter(g => filterInstance === "__all__" || g.instance_id === filterInstance);
  const groupCountByInstance = instances.map(i => ({
    ...i,
    count: groups.filter(g => g.instance_id === i.id).length,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Grupos WhatsApp</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={fetching} onClick={handleFetchGroups}>
            {fetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            {filterInstance === "__all__" ? "Buscar Todos" : "Buscar Grupos"}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Adicionar</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Adicionar Grupo</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome do grupo</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Promoções" />
                </div>
                <div>
                  <Label>ID do grupo (WhatsApp)</Label>
                  <Input value={form.wa_group_id} onChange={e => setForm(f => ({ ...f, wa_group_id: e.target.value }))} placeholder="Ex: 120363...@g.us" />
                </div>
                <div>
                  <Label>Instância</Label>
                  <Select value={form.instance_id} onValueChange={v => setForm(f => ({ ...f, instance_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhuma</SelectItem>
                      {instances.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Agente IA</Label>
                  <Select value={form.agent_id} onValueChange={v => setForm(f => ({ ...f, agent_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhum</SelectItem>
                      {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Modo de resposta</Label>
                  <Select value={form.respond_mode} onValueChange={v => setForm(f => ({ ...f, respond_mode: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RESPOND_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleAdd} className="w-full">Salvar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="groups">
        <TabsList>
          <TabsTrigger value="groups">Grupos ({groups.length})</TabsTrigger>
          <TabsTrigger value="templates">Templates ({templates.length})</TabsTrigger>
          <TabsTrigger value="feedbacks">Feedbacks</TabsTrigger>
        </TabsList>

        <TabsContent value="groups" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={filterInstance} onValueChange={setFilterInstance}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Filtrar instância" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas ({groups.length})</SelectItem>
                {groupCountByInstance.map(i => (
                  <SelectItem key={i.id} value={i.id}>{i.name} ({i.count})</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedGroups.size > 0 && templates.length > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{selectedGroups.size} selecionado(s)</Badge>
                <Select onValueChange={handleBulkSend} disabled={bulkSending}>
                  <SelectTrigger className="h-8 w-[180px] text-xs">
                    <SelectValue placeholder={bulkSending ? "Enviando..." : "Enviar template..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : filteredGroups.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum grupo encontrado.</p>
                <p className="text-sm text-muted-foreground">Use "Buscar Todos" para importar grupos das instâncias.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredGroups.map(g => (
                <GroupCard
                  key={g.id}
                  group={g}
                  messages={groupMessages[g.id] || []}
                  instances={instances}
                  agents={agents}
                  templates={templates}
                  sendingMap={sendingMap}
                  selected={selectedGroups.has(g.id)}
                  onToggleSelect={toggleSelect}
                  onToggle={handleToggle}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onAddMessage={handleAddMessage}
                  onDeleteMessage={handleDeleteMessage}
                  onMessageContentChange={handleMessageContentChange}
                  onMessageImageChange={handleMessageImageChange}
                  onMessageAudioChange={handleMessageAudioChange}
                  onSendNow={handleSendNow}
                  onScheduleToggle={handleScheduleToggle}
                  onIntervalChange={handleIntervalChange}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates">
          <TemplatesTab templates={templates} onRefresh={fetchData} />
        </TabsContent>

        <TabsContent value="feedbacks">
          <FeedbacksTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
