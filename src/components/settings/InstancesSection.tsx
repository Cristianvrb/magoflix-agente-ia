import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plug, Plus, Trash2, Copy, Webhook, CheckCircle, TestTube, Loader2, Pencil, X, Save, AlertTriangle, MessageSquare, QrCode } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getInstances, createInstance, updateInstance, deleteInstance, getConversationCountByInstance } from "@/lib/supabase-helpers";
import { supabase } from "@/integrations/supabase/client";

const WEBHOOK_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/uazapi-webhook`;

type WebhookStatus = "loading" | "ok" | "outdated" | "missing" | "error";

export default function InstancesSection() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSubdomain, setNewSubdomain] = useState("");
  const [newToken, setNewToken] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{ name: string; uazapi_subdomain: string; uazapi_token: string }>({ name: "", uazapi_subdomain: "", uazapi_token: "" });
  const [webhookStatuses, setWebhookStatuses] = useState<Record<string, WebhookStatus>>({});

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ["instances"],
    queryFn: getInstances,
  });

  const { data: convCounts = {} } = useQuery({
    queryKey: ["conversation-counts"],
    queryFn: getConversationCountByInstance,
  });

  // Auto-verify webhook status on load
  useEffect(() => {
    if (!instances.length) return;
    (instances as any[]).forEach((inst: any) => {
      if (!webhookStatuses[inst.id] || webhookStatuses[inst.id] === "error") {
        checkWebhookStatus(inst.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances]);

  const checkWebhookStatus = async (id: string) => {
    setWebhookStatuses((prev) => ({ ...prev, [id]: "loading" }));
    try {
      const { data, error } = await supabase.functions.invoke("register-webhook", {
        body: { action: "verify", instance_id: id },
      });
      if (error) throw error;
      const config = data?.current_config;
      const registeredUrl = Array.isArray(config) ? config[0]?.url : config?.url;
      const expectedUrl = webhookUrl(id);
      if (!registeredUrl) {
        setWebhookStatuses((prev) => ({ ...prev, [id]: "missing" }));
      } else if (registeredUrl === expectedUrl) {
        setWebhookStatuses((prev) => ({ ...prev, [id]: "ok" }));
      } else {
        setWebhookStatuses((prev) => ({ ...prev, [id]: "outdated" }));
      }
    } catch {
      setWebhookStatuses((prev) => ({ ...prev, [id]: "error" }));
    }
  };

  const createMut = useMutation({
    mutationFn: () => createInstance({ name: newName, uazapi_subdomain: newSubdomain, uazapi_token: newToken }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances"] });
      toast.success("Instância criada!");
      setShowForm(false);
      setNewName("");
      setNewSubdomain("");
      setNewToken("");
    },
    onError: () => toast.error("Erro ao criar instância"),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => updateInstance(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["instances"] }),
  });

  const saveMut = useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Partial<{ name: string; uazapi_subdomain: string; uazapi_token: string }> }) => updateInstance(id, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances"] });
      toast.success("Instância atualizada!");
      setEditingId(null);
    },
    onError: () => toast.error("Erro ao salvar"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteInstance(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances"] });
      toast.success("Instância removida!");
    },
    onError: () => toast.error("Erro ao remover instância"),
  });

  const webhookUrl = (id: string) => `${WEBHOOK_BASE}?instance_id=${id}`;

  const copyUrl = (id: string) => {
    navigator.clipboard.writeText(webhookUrl(id));
    toast.success("URL copiada!");
  };

  const registerWebhook = async (id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("register-webhook", { body: { action: "register", instance_id: id } });
      if (error) throw error;
      if (data?.ok) {
        toast.success("Webhook registrado!");
        checkWebhookStatus(id);
      } else toast.error(`Erro: ${JSON.stringify(data?.result)}`);
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    }
  };

  const testWebhook = async (id: string) => {
    try {
      const resp = await fetch(webhookUrl(id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "messages", data: { fromMe: false, sender: "5511988776655@s.whatsapp.net", senderName: "Teste Interno", text: "Mensagem de teste automático" } }),
      });
      const result = await resp.json();
      if (result.ok) toast.success("Teste enviado! Verifique as Conversas.");
      else toast.error(`Erro: ${JSON.stringify(result)}`);
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    }
  };

  const startEditing = (inst: any) => {
    setEditingId(inst.id);
    setEditFields({ name: inst.name || "", uazapi_subdomain: inst.uazapi_subdomain || "", uazapi_token: inst.uazapi_token || "" });
  };

  const [qrOpen, setQrOpen] = useState(false);
  const [qrData, setQrData] = useState<{base64?: string, state?: string, loading: boolean}>({ loading: false });
  const [activeInstanceForQr, setActiveInstanceForQr] = useState<any>(null);

  const fetchQrCode = async (inst: any) => {
    setActiveInstanceForQr(inst);
    setQrOpen(true);
    setQrData({ loading: true });
    try {
      const host = inst.uazapi_subdomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
      const token = inst.uazapi_token;

      // Chama a edge function que ignora CORS e tenta várias rotas nativas da UAZAPI
      const { data, error } = await supabase.functions.invoke("uazapi-qr", {
        body: { host, token }
      });

      if (error) {
         throw new Error("Erro na função na nuvem: " + error.message);
      }

      const resData = data || {};
      
      if (resData.error) {
         throw new Error(resData.error);
      }

      // connectData is inside resData.data
      const connectData = resData.data || {};

      if (connectData.base64) {
        setQrData({ loading: false, base64: connectData.base64 });
      } else if (connectData.instance?.state === "open" || connectData.state === "open" || connectData.status === "connected") {
        setQrData({ loading: false, state: "Já conectado!" });
      } else {
        setQrData({ loading: false, state: "Aguardando leitura ou retorne após 1 min para tentar recarregar." });
      }

    } catch (err: any) {
      console.error("QR Code Error:", err);
      // Fallback amigável
      setQrData({ loading: false, state: "A UAZAPI requer que a primeira conexão seja feita no painel deles. Escaneie seu QR lá para essa instância que este painel funcionará automaticamente." });
      toast.error("Erro ao puxar QR. Recomendamos conectar direto no painel da UAZAPI por enquanto.");
    }
  };

  const renderStatusBadge = (id: string) => {
    const status = webhookStatuses[id];
    if (status === "loading") return <Badge variant="secondary" className="text-xs"><Loader2 className="h-3 w-3 animate-spin mr-1" />Verificando</Badge>;
    if (status === "ok") return <Badge className="bg-emerald-600 text-white text-xs">Webhook OK</Badge>;
    if (status === "outdated") return <Badge className="bg-yellow-500 text-white text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Desatualizado</Badge>;
    if (status === "missing") return <Badge variant="destructive" className="text-xs">Sem webhook</Badge>;
    if (status === "error") return <Badge variant="outline" className="text-xs">Erro ao verificar</Badge>;
    return null;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Instâncias WhatsApp (uazapi)</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-1" />Adicionar
          </Button>
        </div>
        <CardDescription>Gerencie suas conexões WhatsApp. Todas usam o mesmo agente IA.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input placeholder="Ex: Número principal" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Subdomínio</Label>
              <Input placeholder="sua-instancia.uazapi.com" value={newSubdomain} onChange={(e) => setNewSubdomain(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Token</Label>
              <Input type="password" placeholder="Token de acesso" value={newToken} onChange={(e) => setNewToken(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending || !newSubdomain}>
                {createMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Criar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </div>
        )}

        {instances.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma instância cadastrada. Clique em "Adicionar" para criar.</p>
        )}

        {(instances as any[]).map((inst: any) => {
          const isEditing = editingId === inst.id;
          const count = convCounts[inst.id] || 0;
          const status = webhookStatuses[inst.id];

          return (
            <div key={inst.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Switch checked={inst.enabled} onCheckedChange={(v) => toggleMut.mutate({ id: inst.id, enabled: v })} />
                  <div>
                    {isEditing ? (
                      <Input className="h-7 text-sm" value={editFields.name} onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))} />
                    ) : (
                      <p className="font-medium text-sm">{inst.name || "Sem nome"}</p>
                    )}
                    {!isEditing && <p className="text-xs text-muted-foreground">{inst.uazapi_subdomain}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => fetchQrCode(inst)}>
                    <QrCode className="h-4 w-4 mr-1" /> Conectar QR
                  </Button>
                  {renderStatusBadge(inst.id)}
                  {count > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      <MessageSquare className="h-3 w-3 mr-1" />{count}
                    </Badge>
                  )}
                  {isEditing ? (
                    <>
                      <Button variant="outline" size="icon" onClick={() => saveMut.mutate({ id: inst.id, fields: editFields })} disabled={saveMut.isPending}>
                        <Save className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => startEditing(inst)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMut.mutate(inst.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {isEditing && (
                <div className="space-y-2 pl-10">
                  <div className="space-y-1">
                    <Label className="text-xs">Subdomínio</Label>
                    <Input className="h-8 text-sm" value={editFields.uazapi_subdomain} onChange={(e) => setEditFields((f) => ({ ...f, uazapi_subdomain: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Token</Label>
                    <Input className="h-8 text-sm" type="password" value={editFields.uazapi_token} onChange={(e) => setEditFields((f) => ({ ...f, uazapi_token: e.target.value }))} />
                  </div>
                </div>
              )}

              {status === "outdated" && (
                <Alert className="border-yellow-500/50 bg-yellow-500/10">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-sm">
                    O webhook registrado está desatualizado. Clique em <strong>Registrar</strong> para corrigir.
                  </AlertDescription>
                </Alert>
              )}
              {status === "missing" && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    Nenhum webhook registrado. Clique em <strong>Registrar</strong> para configurar.
                  </AlertDescription>
                </Alert>
              )}

              <Separator />
              <div className="space-y-2">
                <Label className="text-xs">URL do Webhook</Label>
                <div className="flex gap-2">
                  <Input value={webhookUrl(inst.id)} readOnly className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={() => copyUrl(inst.id)}><Copy className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => registerWebhook(inst.id)}>
                  <Webhook className="h-4 w-4 mr-1" />Registrar
                </Button>
                <Button variant="outline" size="sm" onClick={() => checkWebhookStatus(inst.id)}>
                  <CheckCircle className="h-4 w-4 mr-1" />Verificar
                </Button>
                <Button variant="outline" size="sm" onClick={() => testWebhook(inst.id)}>
                  <TestTube className="h-4 w-4 mr-1" />Testar
                </Button>
              </div>
            </div>
          );
        })}

        <Dialog open={qrOpen} onOpenChange={setQrOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Conexão WhatsApp (QR Code)</DialogTitle>
              <DialogDescription>
                Leia o QR code abaixo com o WhatsApp do seu celular no modo Aparelhos Conectados.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center p-6 space-y-4">
              {qrData.loading ? (
                <div className="flex flex-col items-center text-muted-foreground gap-2">
                  <Loader2 className="h-10 w-10 animate-spin" />
                  <p className="text-sm">Buscando QR Code na UAZAPI...</p>
                </div>
              ) : qrData.base64 ? (
                <div className="space-y-4 flex flex-col items-center">
                  <div className="bg-white p-2 border rounded shadow-sm">
                    <img src={qrData.base64} alt="QR Code" className="w-64 h-64 object-contain" />
                  </div>
                  <Button variant="outline" size="sm" onClick={() => fetchQrCode(activeInstanceForQr)}>
                    Gerar Novo QR
                  </Button>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <Alert>
                    <AlertDescription>{qrData.state}</AlertDescription>
                  </Alert>
                  <Button variant="outline" size="sm" onClick={() => fetchQrCode(activeInstanceForQr)}>
                    Tentar Novamente
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
