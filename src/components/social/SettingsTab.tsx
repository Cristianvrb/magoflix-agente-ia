import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Save, Instagram, AtSign, CheckCircle, XCircle, Loader2, Copy, Globe, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

function CopyField({ label, value }: { label: string; value: string }) {
  const copy = () => {
    navigator.clipboard.writeText(value);
    toast.success("URL copiada!");
  };
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2 mt-1">
        <Input value={value} readOnly className="text-xs font-mono bg-muted" />
        <Button variant="outline" size="icon" onClick={copy} className="shrink-0">
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
export function SettingsTab() {
  const queryClient = useQueryClient();
  const [igUserId, setIgUserId] = useState("");
  const [igToken, setIgToken] = useState("");
  const [threadsUserId, setThreadsUserId] = useState("");
  const [threadsToken, setThreadsToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [testingIg, setTestingIg] = useState(false);
  const [testingThreads, setTestingThreads] = useState(false);
  const [fetchingThreadsId, setFetchingThreadsId] = useState(false);
  const [igStatus, setIgStatus] = useState<"idle" | "ok" | "error">("idle");
  const [threadsStatus, setThreadsStatus] = useState<"idle" | "ok" | "error">("idle");

  const { data: settings } = useQuery({
    queryKey: ["social-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("social_settings").select("*");
      if (error) throw error;
      return data as { key: string; value: string }[];
    },
  });

  useEffect(() => {
    if (settings) {
      const get = (k: string) => settings.find((s) => s.key === k)?.value || "";
      setIgUserId(get("ig_user_id"));
      setIgToken(get("ig_access_token"));
      setThreadsUserId(get("threads_user_id"));
      setThreadsToken(get("threads_access_token"));
      const storedVerify = get("webhook_verify_token");
      if (storedVerify) {
        setVerifyToken(storedVerify);
      } else {
        const generated = crypto.randomUUID().replace(/-/g, "");
        setVerifyToken(generated);
        (async () => {
          const { error } = await supabase.from("social_settings").upsert(
            { key: "webhook_verify_token", value: generated },
            { onConflict: "key" }
          );
          if (error) {
            console.error("Failed to save verify token:", error);
            toast.error("Erro ao salvar verify token");
          } else {
            queryClient.invalidateQueries({ queryKey: ["social-settings"] });
          }
        })();
      }
    }
  }, [settings, queryClient]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const upserts = [
        { key: "ig_user_id", value: igUserId },
        { key: "ig_access_token", value: igToken },
        { key: "threads_user_id", value: threadsUserId },
        { key: "threads_access_token", value: threadsToken },
        { key: "webhook_verify_token", value: verifyToken },
      ];
      for (const row of upserts) {
        const { error } = await supabase.from("social_settings").upsert(row, { onConflict: "key" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-settings"] });
      toast.success("Credenciais salvas!");
    },
    onError: () => toast.error("Erro ao salvar"),
  });

  const testConnection = async (type: "ig" | "threads") => {
    const userId = (type === "ig" ? igUserId : threadsUserId).trim();
    const token = (type === "ig" ? igToken : threadsToken).trim();
    if (!userId || !token) {
      toast.error("Preencha User ID e Token");
      return;
    }
    type === "ig" ? setTestingIg(true) : setTestingThreads(true);
    try {
      const baseUrl = type === "threads"
        ? `https://graph.threads.net/v1.0/${userId}?fields=id,username&access_token=${encodeURIComponent(token)}`
        : `https://graph.instagram.com/v21.0/${userId}?fields=id,username&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(baseUrl);
      const data = await res.json();
      if (res.ok && !data.error) {
        type === "ig" ? setIgStatus("ok") : setThreadsStatus("ok");
        toast.success(`${type === "ig" ? "Instagram" : "Threads"} conectado!`);
      } else {
        type === "ig" ? setIgStatus("error") : setThreadsStatus("error");
        const msg = data?.error?.message || "Token inválido ou sem permissão";
        toast.error(msg);
      }
    } catch {
      type === "ig" ? setIgStatus("error") : setThreadsStatus("error");
      toast.error("Erro na conexão");
    } finally {
      type === "ig" ? setTestingIg(false) : setTestingThreads(false);
    }
  };

  const StatusIcon = ({ status }: { status: "idle" | "ok" | "error" }) => {
    if (status === "ok") return <CheckCircle className="h-4 w-4 text-primary" />;
    if (status === "error") return <XCircle className="h-4 w-4 text-destructive" />;
    return null;
  };

  const { data: failedCount } = useQuery({
    queryKey: ["social-failed-posts-24h"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase.from("social_posts").select("*", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since);
      return count || 0;
    },
    refetchInterval: 60000,
  });

  return (
    <div className="space-y-4">
      {(failedCount || 0) > 3 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            ⚠️ <strong>{failedCount} posts falharam nas últimas 24h.</strong> Seus tokens do Instagram/Threads podem estar expirados. Renove no painel da Meta for Developers e atualize abaixo.
          </AlertDescription>
        </Alert>
      )}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="h-5 w-5 text-primary" /> Configuração do App Meta
          </CardTitle>
          <CardDescription>
            Use estas URLs no painel do <strong>Meta for Developers</strong> → seu App → Configurações do Instagram/Threads.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CopyField label="Callback URL / Redirect URI" value={`${supabaseUrl}/functions/v1/instagram-callback`} />
          <CopyField label="Deauthorize Callback URL" value={`${supabaseUrl}/functions/v1/instagram-callback?type=deauthorize`} />
          <CopyField label="Data Deletion Request URL" value={`${supabaseUrl}/functions/v1/instagram-callback?type=delete`} />

          <div className="border-t border-primary/20 pt-3 mt-3">
            <p className="text-sm font-medium mb-2">Verificar Token (compartilhado)</p>
            <p className="text-xs text-muted-foreground mb-2">
              Use este token na configuração de webhooks do Instagram e do Threads.
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                className="text-xs font-mono bg-muted"
                placeholder="Gerando..."
              />
              <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(verifyToken); toast.success("Token copiado!"); }} className="shrink-0">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="border-t border-primary/20 pt-3 mt-3">
            <p className="text-sm font-medium mb-2 flex items-center gap-1"><Instagram className="h-4 w-4" /> Webhooks — Instagram</p>
            <p className="text-xs text-muted-foreground mb-3">
              Cole na seção <strong>Webhooks → Instagram</strong> do seu App Meta.
            </p>
            <CopyField label="URL de callback (Webhook)" value={`${supabaseUrl}/functions/v1/instagram-callback`} />
          </div>

          <div className="border-t border-primary/20 pt-3 mt-3">
            <p className="text-sm font-medium mb-2 flex items-center gap-1"><AtSign className="h-4 w-4" /> Webhooks — Threads</p>
            <p className="text-xs text-muted-foreground mb-3">
              Cole na seção <strong>Webhooks → Threads</strong> do seu App Meta.
            </p>
            <CopyField label="URL de callback (Webhook)" value={`${supabaseUrl}/functions/v1/threads-callback`} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Instagram className="h-5 w-5 text-primary" /> Instagram
          </CardTitle>
          <CardDescription>
            Configure o acesso à API do Instagram Business. Você precisa de um token do Meta Graph API com permissão
            <code className="text-xs bg-muted px-1 mx-1 rounded">instagram_business_basic</code> e
            <code className="text-xs bg-muted px-1 mx-1 rounded">instagram_business_content_publish</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Instagram User ID</Label>
            <Input value={igUserId} onChange={(e) => setIgUserId(e.target.value)} placeholder="Ex: 17841400..." />
          </div>
          <div>
            <Label>Access Token</Label>
            <Input value={igToken} onChange={(e) => setIgToken(e.target.value)} placeholder="Token do Meta Graph API" type="password" />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => testConnection("ig")} disabled={testingIg}>
              {testingIg ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Testar Conexão
            </Button>
            <StatusIcon status={igStatus} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AtSign className="h-5 w-5 text-primary" /> Threads
          </CardTitle>
          <CardDescription>
            Configure o acesso à API do Threads. Use o mesmo token do Meta com permissão
            <code className="text-xs bg-muted px-1 mx-1 rounded">threads_basic</code> e
            <code className="text-xs bg-muted px-1 mx-1 rounded">threads_content_publish</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Threads User ID</Label>
            <div className="flex items-center gap-2">
              <Input value={threadsUserId} onChange={(e) => setThreadsUserId(e.target.value)} placeholder="Ex: 17841400..." />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={fetchingThreadsId || !threadsToken.trim()}
                onClick={async () => {
                  setFetchingThreadsId(true);
                  try {
                    const res = await fetch(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(threadsToken.trim())}`);
                    const data = await res.json();
                    if (res.ok && data.id) {
                      setThreadsUserId(data.id);
                      toast.success(`ID encontrado: @${data.username || data.id}`);
                    } else {
                      toast.error(data?.error?.message || "Não foi possível obter o ID. Verifique o token.");
                    }
                  } catch {
                    toast.error("Erro na conexão com a API do Threads");
                  } finally {
                    setFetchingThreadsId(false);
                  }
                }}
              >
                {fetchingThreadsId ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Descobrir meu ID
              </Button>
            </div>
          </div>
          <div>
            <Label>Access Token</Label>
            <Input value={threadsToken} onChange={(e) => setThreadsToken(e.target.value)} placeholder="Token do Meta Graph API" type="password" />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => testConnection("threads")} disabled={testingThreads}>
              {testingThreads ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Testar Conexão
            </Button>
            <StatusIcon status={threadsStatus} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
        <Save className="h-4 w-4 mr-1" /> Salvar Credenciais
      </Button>
    </div>
  );
}
