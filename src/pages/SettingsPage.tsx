import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Package, HelpCircle, Loader2, CreditCard, Clock, MessageSquare, Sliders, History } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAgentSettings, updateAgentSettings } from "@/lib/supabase-helpers";
import HumanBehaviorSection from "@/components/settings/HumanBehaviorSection";
import BusinessHoursSection from "@/components/settings/BusinessHoursSection";
import AutoMessagesSection from "@/components/settings/AutoMessagesSection";
import PepperProductsSection from "@/components/settings/PepperProductsSection";
import PepperTransactionsTab from "@/components/settings/PepperTransactionsTab";
import PepperOfferManager from "@/components/settings/PepperOfferManager";
import ChangelogTab from "@/components/settings/ChangelogTab";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [agentName, setAgentName] = useState("");
  const [agentPrompt, setAgentPrompt] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [productInfo, setProductInfo] = useState("");
  const [faq, setFaq] = useState("");
  const [delayMin, setDelayMin] = useState(3);
  const [delayMax, setDelayMax] = useState(12);
  const [simulateTyping, setSimulateTyping] = useState(true);
  const [bhEnabled, setBhEnabled] = useState(false);
  const [bhStart, setBhStart] = useState("08:00");
  const [bhEnd, setBhEnd] = useState("18:00");
  const [bhTimezone, setBhTimezone] = useState("America/Sao_Paulo");
  const [outsideMessage, setOutsideMessage] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [followupEnabled, setFollowupEnabled] = useState(false);
  const [followupDelayHours, setFollowupDelayHours] = useState(24);
  const [followupMessage, setFollowupMessage] = useState("");
  const [pixEvpKey, setPixEvpKey] = useState("");
  const [cardPaymentUrl, setCardPaymentUrl] = useState("");
  const [welcomeAudioUrl, setWelcomeAudioUrl] = useState("");
  const [welcomeAudioUrlEs, setWelcomeAudioUrlEs] = useState("");
  const [pixEvpKeyFallback, setPixEvpKeyFallback] = useState("");
  const [cardPaymentUrlFallback, setCardPaymentUrlFallback] = useState("");
  const [paymentErrorPixMessage, setPaymentErrorPixMessage] = useState("");
  const [paymentErrorCardMessage, setPaymentErrorCardMessage] = useState("");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["agent-settings"],
    queryFn: getAgentSettings,
  });

  useEffect(() => {
    if (settings) {
      setAgentName(settings.agent_name);
      setAgentPrompt(settings.agent_prompt);
      setOpenaiApiKey(settings.openai_api_key || "");
      setProductInfo(settings.product_info);
      setFaq(settings.faq);
      setDelayMin((settings as any).response_delay_min ?? 3);
      setDelayMax((settings as any).response_delay_max ?? 12);
      setSimulateTyping((settings as any).simulate_typing ?? true);
      setBhEnabled((settings as any).business_hours_enabled ?? false);
      setBhStart((settings as any).business_hours_start ?? "08:00");
      setBhEnd((settings as any).business_hours_end ?? "18:00");
      setBhTimezone((settings as any).business_hours_timezone ?? "America/Sao_Paulo");
      setOutsideMessage((settings as any).outside_hours_message ?? "");
      setWelcomeMessage((settings as any).welcome_message ?? "");
      setFollowupEnabled((settings as any).followup_enabled ?? false);
      setFollowupDelayHours((settings as any).followup_delay_hours ?? 24);
      setFollowupMessage((settings as any).followup_message ?? "");
      setPixEvpKey((settings as any).pix_evp_key ?? "");
      setCardPaymentUrl((settings as any).card_payment_url ?? "");
      setWelcomeAudioUrl((settings as any).welcome_audio_url ?? "");
      setWelcomeAudioUrlEs((settings as any).welcome_audio_url_es ?? "");
      setPixEvpKeyFallback((settings as any).pix_evp_key_fallback ?? "");
      setCardPaymentUrlFallback((settings as any).card_payment_url_fallback ?? "");
      setPaymentErrorPixMessage((settings as any).payment_error_pix_message ?? "");
      setPaymentErrorCardMessage((settings as any).payment_error_card_message ?? "");
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: () =>
      updateAgentSettings({
        agent_name: agentName,
        agent_prompt: agentPrompt,
        openai_api_key: openaiApiKey,
        product_info: productInfo,
        faq,
        uazapi_subdomain: "",
        uazapi_token: "",
        response_delay_min: delayMin,
        response_delay_max: delayMax,
        simulate_typing: simulateTyping,
        business_hours_enabled: bhEnabled,
        business_hours_start: bhStart,
        business_hours_end: bhEnd,
        business_hours_timezone: bhTimezone,
        outside_hours_message: outsideMessage,
        welcome_message: welcomeMessage,
        followup_enabled: followupEnabled,
        followup_delay_hours: followupDelayHours,
        followup_message: followupMessage,
        pix_evp_key: pixEvpKey,
        card_payment_url: cardPaymentUrl,
        welcome_audio_url: welcomeAudioUrl,
        welcome_audio_url_es: welcomeAudioUrlEs,
        pix_evp_key_fallback: pixEvpKeyFallback,
        card_payment_url_fallback: cardPaymentUrlFallback,
        payment_error_pix_message: paymentErrorPixMessage,
        payment_error_card_message: paymentErrorCardMessage,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-settings"] });
      toast.success("Configurações salvas com sucesso!");
    },
    onError: () => toast.error("Erro ao salvar configurações"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <Tabs defaultValue="agent" className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
          <TabsTrigger value="agent" className="text-xs">
            <Bot className="h-3.5 w-3.5 mr-1 hidden sm:inline" />Agente
          </TabsTrigger>
          <TabsTrigger value="product" className="text-xs">
            <Package className="h-3.5 w-3.5 mr-1 hidden sm:inline" />Produto
          </TabsTrigger>
          <TabsTrigger value="behavior" className="text-xs">
            <Sliders className="h-3.5 w-3.5 mr-1 hidden sm:inline" />Comportamento
          </TabsTrigger>
          <TabsTrigger value="hours" className="text-xs">
            <Clock className="h-3.5 w-3.5 mr-1 hidden sm:inline" />Horários
          </TabsTrigger>
          <TabsTrigger value="messages" className="text-xs">
            <MessageSquare className="h-3.5 w-3.5 mr-1 hidden sm:inline" />Mensagens
          </TabsTrigger>
          <TabsTrigger value="payments" className="text-xs">
            <CreditCard className="h-3.5 w-3.5 mr-1 hidden sm:inline" />Pagamentos
          </TabsTrigger>
          <TabsTrigger value="pepper" className="text-xs">
            <Package className="h-3.5 w-3.5 mr-1 hidden sm:inline" />Pepper
          </TabsTrigger>
          <TabsTrigger value="changelog" className="text-xs">
            <History className="h-3.5 w-3.5 mr-1 hidden sm:inline" />Changelog
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agent" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Personalidade do Agente</CardTitle>
              </div>
              <CardDescription>Defina como o agente se comporta nas conversas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="agent-name">Nome do Agente</Label>
                <Input id="agent-name" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-prompt">Prompt / Instruções</Label>
                <Textarea id="agent-prompt" value={agentPrompt} onChange={(e) => setAgentPrompt(e.target.value)} rows={6} />
              </div>
              <div className="space-y-2 mt-4 pt-4 border-t">
                <Label htmlFor="openai-api-key">Chave de API OpenAI</Label>
                <Input id="openai-api-key" type="password" placeholder="sk-..." value={openaiApiKey} onChange={(e) => setOpenaiApiKey(e.target.value)} />
                <p className="text-xs text-muted-foreground">Adicione aqui a sua chave de API para o Agente I.A operar. (Fica salva de forma segura no banco de dados).</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="product" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Informações do Produto</CardTitle>
              </div>
              <CardDescription>O que a IA deve saber sobre seu produto/serviço</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea value={productInfo} onChange={(e) => setProductInfo(e.target.value)} rows={6} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Perguntas Frequentes</CardTitle>
              </div>
              <CardDescription>Respostas pré-definidas para perguntas comuns</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea value={faq} onChange={(e) => setFaq(e.target.value)} rows={8} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="behavior" className="mt-4">
          <HumanBehaviorSection
            delayMin={delayMin}
            delayMax={delayMax}
            simulateTyping={simulateTyping}
            onDelayMinChange={setDelayMin}
            onDelayMaxChange={setDelayMax}
            onSimulateTypingChange={setSimulateTyping}
          />
        </TabsContent>

        <TabsContent value="hours" className="mt-4">
          <BusinessHoursSection
            enabled={bhEnabled}
            start={bhStart}
            end={bhEnd}
            timezone={bhTimezone}
            outsideMessage={outsideMessage}
            onEnabledChange={setBhEnabled}
            onStartChange={setBhStart}
            onEndChange={setBhEnd}
            onTimezoneChange={setBhTimezone}
            onOutsideMessageChange={setOutsideMessage}
          />
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          <AutoMessagesSection
            welcomeMessage={welcomeMessage}
            followupEnabled={followupEnabled}
            followupDelayHours={followupDelayHours}
            followupMessage={followupMessage}
            welcomeAudioUrl={welcomeAudioUrl}
            welcomeAudioUrlEs={welcomeAudioUrlEs}
            onWelcomeMessageChange={setWelcomeMessage}
            onFollowupEnabledChange={setFollowupEnabled}
            onFollowupDelayHoursChange={setFollowupDelayHours}
            onFollowupMessageChange={setFollowupMessage}
            onWelcomeAudioUrlChange={setWelcomeAudioUrl}
            onWelcomeAudioUrlEsChange={setWelcomeAudioUrlEs}
          />
        </TabsContent>

        <TabsContent value="payments" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Pagamentos</CardTitle>
              </div>
              <CardDescription>Configure as chaves e links de pagamento</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pix-evp-key">Chave PIX (EVP)</Label>
                <Input id="pix-evp-key" value={pixEvpKey} onChange={(e) => setPixEvpKey(e.target.value)} placeholder="Chave aleatória do PIX" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="card-payment-url">Link de Pagamento por Cartão</Label>
                <Input id="card-payment-url" value={cardPaymentUrl} onChange={(e) => setCardPaymentUrl(e.target.value)} placeholder="https://pay.infinitepay.io/..." />
              </div>
              <Separator className="my-4" />
              <p className="text-sm font-medium text-muted-foreground">Fallback (caso erro no principal)</p>
              <div className="space-y-2">
                <Label htmlFor="pix-fallback">Chave PIX Fallback</Label>
                <Input id="pix-fallback" value={pixEvpKeyFallback} onChange={(e) => setPixEvpKeyFallback(e.target.value)} placeholder="Chave PIX alternativa" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="card-fallback">Link de Cartão Fallback</Label>
                <Input id="card-fallback" value={cardPaymentUrlFallback} onChange={(e) => setCardPaymentUrlFallback(e.target.value)} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="error-pix-msg">Mensagem de erro PIX</Label>
                <Textarea id="error-pix-msg" value={paymentErrorPixMessage} onChange={(e) => setPaymentErrorPixMessage(e.target.value)} placeholder="Texto enviado ao cliente quando o PIX principal falha" rows={2} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="error-card-msg">Mensagem de erro Cartão</Label>
                <Textarea id="error-card-msg" value={paymentErrorCardMessage} onChange={(e) => setPaymentErrorCardMessage(e.target.value)} placeholder="Texto enviado ao cliente quando o link de cartão falha" rows={2} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pepper" className="mt-4 space-y-4">
          <Tabs defaultValue="pepper-products">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pepper-products" className="text-xs">Produtos</TabsTrigger>
              <TabsTrigger value="pepper-transactions" className="text-xs">Transações</TabsTrigger>
              <TabsTrigger value="pepper-offers" className="text-xs">Ofertas</TabsTrigger>
            </TabsList>
            <TabsContent value="pepper-products" className="mt-4">
              <PepperProductsSection />
            </TabsContent>
            <TabsContent value="pepper-transactions" className="mt-4">
              <PepperTransactionsTab />
            </TabsContent>
            <TabsContent value="pepper-offers" className="mt-4">
              <PepperOfferManager />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="changelog" className="mt-4">
          <ChangelogTab />
        </TabsContent>
      </Tabs>

      <div className="flex justify-end pt-2">
        <Button onClick={() => mutation.mutate()} size="lg" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
