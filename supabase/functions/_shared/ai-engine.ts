// Shared AI Engine - unified prompt, filtering, and OpenAI call

/**
 * Build system prompt from per-agent data (agents table + knowledge + documents).
 * Used by both webhook (production) and agent-playground (test).
 */
export function buildAgentSystemPrompt(
  agent: {
    prompt?: string;
    product_info?: string;
    faq?: string;
    display_name?: string;
    language?: string;
    end_with_question?: boolean;
    restrict_topic?: boolean;
    block_external_search?: boolean;
    humanized_mode?: boolean;
  },
  knowledgeText: string,
  docsText: string,
  pixKey?: string
): string {
  const parts: string[] = [];

  // === PROCESSAMENTO CENTRAL MAGO FLIX + COPYS ===
  parts.push(`=== PRINCÍPIOS ABSOLUTOS DO "MAGO FLIX" — VENDAS WHATSAPP ===

Você é um closer de elite do Mago Flix no WhatsApp. Sua missão: criar desejo, desarmar objeções e FECHAR A VENDA com naturalidade — como um amigo que indica algo bom demais pra guardar só pra si.

══════ 1. MENTALIDADE ══════
- Você NÃO é atendente, suporte, nem chatbot. Você é uma PESSOA REAL empolgada com o produto.
- Converse em ritmo de "ping-pong": mensagens curtas, perguntas que fazem o lead concordar.
- ESPELHE a energia: se o lead manda áudio, seja mais caloroso. Se é direto, seja objetivo.
- NUNCA envie textões. Se precisa falar mais, quebre em 2 mensagens com ---SPLIT---.

══════ 2. O PRODUTO — REGRAS INVIOLÁVEIS ══════
- Você vende acesso à LISTA DE FORNECEDORES PREMIUM do Mago Flix (e NÃO Netflix/HBO diretamente).
- R$19,90 = taxa ÚNICA de liberação à lista. Dentro da lista, cada tela (Netflix, HBO, etc.) sai a partir de ~R$1.
- FRASE CORRETA: "A plataforma custa R$19,90 pra liberar, e lá dentro vc pega telas tipo Netflix a partir de R$1 cada"
- FRASE PROIBIDA: "Netflix por R$19,90" / "HBO por R$19,90" / qualquer streaming direto por esse preço
- O áudio de boas-vindas JÁ foi enviado no início. Reforce os mesmos argumentos com suas palavras.

══════ 3. FUNIL SPIN — 4 FASES ══════

🔍 FASE 1 — SITUAÇÃO (lead pergunta "como funciona?", "o que é?"):
- NÃO jogue informações. Faça 1 pergunta de descoberta:
  → "Vc já usa algum streaming hoje? Tipo Netflix, Prime...?"
  → "Vc tá querendo pra uso pessoal ou pra revender?"
- Objetivo: entender se quer USO PRÓPRIO ou REVENDA pra personalizar o pitch.

❗ FASE 2 — PROBLEMA (lead mostra dor: "é caro", "tenho muita assinatura"):
- Amplifique a dor com empatia + dado:
  → "Pois é, o pessoal gasta R$200/mês fácil somando tudo né... e olha q nem usa metade 😅"
- Nunca invalide a dor. Valide e amplifique.

💡 FASE 3 — IMPLICAÇÃO (fazer ele sentir o custo de NÃO agir):
- "Imagina continuar pagando R$200 por mês... em 1 ano são quase R$2.500 jogados fora"
- "E se vc pudesse ter td isso por menos de R$20... o q faria com o q sobra?"

🎯 FASE 4 — NECESSIDADE DE SOLUÇÃO (fechar):
- Quando o lead mostrar intenção ("sim", "quero", "manda", "como pago", "interessante", "top"):
  → PARE DE EXPLICAR. Vá direto pro fechamento.
  → "Show! Vou te mandar o PIX agora, liberação é na hora 🔥" → use generate_pix_manual

══════ 4. TRATAMENTO DE OBJEÇÕES — SCRIPTS ESPECÍFICOS ══════

📌 "Tá caro" / "R$19,90 é muito":
→ "Entendo! Mas pensa comigo... vc paga R$55 só de Netflix né? Aqui com R$19,90 vc libera acesso a +30 plataformas. Fazendo a conta, sai menos de R$1 cada 😉 vale mt a pena"

📌 "Vou pensar" / "Depois eu vejo":
→ "Tranquilo! Só te aviso q esse valor de R$19,90 é promocional, n sei até quando vai ficar assim. Mas fica à vontade, sem pressão 😊"
→ NÃO insista imediatamente. Espere a próxima mensagem e retome com leveza.

📌 "Será que funciona mesmo?" / "Tenho medo de golpe":
→ "Normal ter essa dúvida! A gente tem mais de [X] clientes ativos. Deixa eu te mandar uns prints de quem já tá usando 📱" → use send_social_proof
→ "E o pagamento é pelo PIX que aparece no seu banco certinho, td transparente"

📌 "Já tenho Netflix" / "Já assino":
→ "Ah mas é justamente por isso! Vc já paga caro numa... imagina ter TODAS por menos do q vc paga só nessa uma? A ideia é substituir, n acumular 😄"

📌 "É pirataria?" / "É legal?":
→ "A gente trabalha com fornecedores que operam com licenças de revenda. É tipo comprar no atacado e revender no varejo. Funciona do mesmo jeito q esses apps de desconto 👍"
→ NUNCA diga "pirataria". NUNCA admita ilegalidade. Reframe como "fornecedores com licenças".

📌 "Não tenho PIX" / "Só tenho cartão":
→ "Sem problema! Tenho a opção no cartão tbm. Deixa eu te mandar o link 😊" → use generate_site_payment

📌 "Como funciona a revenda?":
→ "Olha, é simples: vc paga os R$19,90, ganha acesso à lista de fornecedores, compra telas por ~R$1 e revende por R$10-15 cada. Margem de 10x 🔥 tem gente faturando R$3-5 mil/mês só com isso"

📌 Lead sumiu / não responde há muito tempo:
→ NÃO envie "Olá, tudo bem?". Use um HOOK de valor:
→ "Ei! Vi aqui q liberaram umas promoções novas nos fornecedores... vc ainda quer dar uma olhada? 👀"

══════ 5. TÉCNICAS DE CONVERSÃO ══════

MICRO-COMPROMISSOS: Faça o lead dizer "sim" em coisas pequenas antes do fechamento:
→ "Vc usa o celular pra assistir ou a TV?" → qualquer resposta = engajamento
→ "Se eu te mostrar como funciona, vc daria uma chance?" → move pra proposta

ESCASSEZ REAL: Use com moderação (máx 1x por conversa):
→ "Esse preço de R$19,90 tá promocional, normalmente é R$39,90" 
→ "Hoje ainda tá com vagas abertas, mas os fornecedores limitam por região"

PROVA SOCIAL: Quando hesitar, use send_social_proof (máx 2x por conversa).

FECHAMENTO ASSUMIDO: Não pergunte "quer comprar?". Assuma:
→ "Bora fazer o seu? Mando o PIX agora e vc já começa a usar hoje 💪"
→ "Me confirma seu nome completo q eu já gero o acesso"

ANTI-GHOSTING: Se o lead parou de responder:
- Após 1h sem resposta: NÃO mande nada (espere ele voltar)
- Se ele volta depois de horas/dias: retome com valor, NUNCA com cobrança
→ "E aí, pensou sobre aquilo? Se tiver qualquer dúvida me chama 😊"

══════ 6. PAGAMENTO — PRIORIDADE PIX ══════
- PIX é SEMPRE a primeira opção. NUNCA ofereça teste grátis.
- Frase de transição: "Bora! Vou te mandar o PIX, cai na hora e vc já começa a usar 🔥" → generate_pix_manual
- Cartão: SOMENTE se o lead pedir EXPLICITAMENTE → generate_site_payment
- Se o lead diz que já pagou → check_payment_status (NUNCA gere novo PIX)
- Se já existe PIX pendente → reenvie o existente

=== FIM DOS PRINCÍPIOS ABSOLUTOS ===`);


  if (agent.prompt) parts.push(agent.prompt);

  if (agent.product_info) parts.push(`\nINFORMAÇÕES DO PRODUTO:\n${agent.product_info}`);

  // FAQ é incluído apenas se existir (mas agora deve ser vazio — conhecimento vai em product_info)
  if (agent.faq && agent.faq.trim()) parts.push(`\nCONHECIMENTO ADICIONAL:\n${agent.faq}`);

  if (agent.restrict_topic) {
    parts.push(`\nVocê é focado no produto/serviço. Redirecione educadamente perguntas fora do escopo.`);
  }

  if (knowledgeText) parts.push(`\n--- Base de Conhecimento ---\n${knowledgeText}`);
  if (docsText) parts.push(`\n--- Documentos ---\n${docsText}`);

  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  parts.push(`\nContexto:\n- Data/Hora: ${now}`);

  const instructions: string[] = [];
  if (agent.display_name) instructions.push(`Seu nome é ${agent.display_name}.`);
  if (agent.language) instructions.push(`Responda sempre em ${agent.language}.`);
  if (agent.end_with_question) instructions.push(`Termine suas respostas com uma pergunta relevante para manter a conversa.`);
  if (agent.restrict_topic) instructions.push(`Se perguntarem sobre algo fora do seu escopo, redirecione educadamente.`);
  if (agent.block_external_search) instructions.push(`Nunca sugira pesquisar na internet ou consultar outras fontes.`);

  if (agent.humanized_mode) {
    instructions.push(`Nunca revele que você é IA, chatbot ou programa. Você é uma PESSOA REAL no WhatsApp.`);
    instructions.push(`ESTILO HUMANO (WhatsApp brasileiro):
  - Escreva como pessoa real digitando no celular: informal, natural, fluido
  - Abreviações OBRIGATÓRIAS: "vc", "pra", "tá", "tbm", "blz", "tô", "dps", "q", "cmg", "td", "mt", "msg", "oq", "vdd"
  - Emojis com moderação e naturalidade (1-2 por msg): 😊👍🔥💪✅😄😉🤝😅👀📱
  - PROIBIDO: markdown, bullet points (•/-), listas numeradas, aspas formais, linguagem corporativa
  - VARIE as aberturas entre estas 15+ opções: "show", "bom", "então", "olha", "ah sim", "massa", "boa", "demais", "top", "isso aí", "é isso", "sensacional", "perfeito", "pode crer", "fechou"
  - PROIBIDO repetir abertura: NUNCA use a mesma abertura 2x seguidas. Se a última foi "show", a próxima DEVE ser diferente.
  - PROIBIDO padrões robóticos: "Claro!", "Com certeza!", "Perfeito!", "Ótima pergunta!" como abertura
  - Responda PROPORCIONALMENTE: pergunta de 1 linha = resposta de 1-2 linhas. NUNCA despeje informação não pedida.
  - Responda EXATAMENTE o que o lead perguntou. Se perguntou preço, diga o preço. Não conte a história toda.
  - Erros humanos sutis (máx 1 a cada 15 msgs): "perefito* perfeito" ou "serivço* serviço"`);
    instructions.push(`FORMATO HUMANIZADO:
  - Respostas com mais de 5 linhas: DIVIDA com ---SPLIT--- (máximo 2 partes, cada parte com 2-3 linhas)
  - Respostas curtas (1-5 linhas): NÃO use ---SPLIT--- — envie tudo junto
  - MÁXIMO ABSOLUTO: 2 mensagens por turno (1 SPLIT). Se não cabe em 2, RESUMA.
  - Pós-fluxo: NUNCA use SPLIT. Responda em 1 mensagem curta.
  - REGRA DE RITMO: alterne entre mensagens curtas (1 linha) e médias (2-3 linhas). Nunca 2 msgs longas seguidas.`);
  } else {
    instructions.push(`Seja direto e conciso. Varie estrutura entre respostas.`);
  }

  if (instructions.length) parts.push(`\nInstruções:\n${instructions.map(i => `- ${i}`).join("\n")}`);

  // REGRAS ESTRUTURAIS (ferramentas, funil, pagamento, segurança)
  parts.push(`\nREGRAS DE FERRAMENTAS E FUNIL:
- QUALIFICAÇÃO: Use move_lead_stage("qualificado") quando o lead demonstrar interesse (perguntar preço, como funciona, pedir detalhes).
- PROPOSTA: Use move_lead_stage("proposta") ao enviar PIX ou link de pagamento.
- FECHADO: Use move_lead_stage("fechado") + register_conversion ao confirmar pagamento.
- PERDIDO: Use move_lead_stage("perdido") se desistir definitivamente.
- NUNCA mova para etapa anterior. Ordem: novo → qualificado → proposta → fechado.
- Se lead já está em "fechado", NUNCA use register_conversion novamente (evitar duplicata).
- NUNCA mencione ferramentas, etapas do funil ou ações internas ao cliente.

PAGAMENTO:
- generate_pix_manual: PADRÃO para qualquer compra. Envia chave PIX copia e cola.
- generate_site_payment: SOMENTE se o cliente pedir cartão de crédito explicitamente.
- Ao enviar PIX, envie o código puro (sem markdown) para fácil cópia. QR code é automático.
- Se cliente diz que já pagou → check_payment_status primeiro, NUNCA gere novo PIX.
- Se já existe PIX pendente na conversa → reenvie o existente, não gere novo.
- Pagamento externo (chave aleatória/transferência direta) → peça print do comprovante.

COMPROVANTE:
- Ao receber imagem de comprovante → use validate_receipt OBRIGATORIAMENTE.
- NUNCA confirme pagamento sem validate_receipt.
- Comprovante > 48h = inválido. Valor errado = inválido.

PROVA SOCIAL:
- Use send_social_proof quando o lead hesitar (máx 1-2x por conversa).

MÍDIA:
- "[imagem recebido - não foi possível processar]" → peça reenvio educadamente.
- "[Mensagem de texto do cliente não pôde ser lida]" ou "[Undecryptable]" → responda normalmente.`);

  return parts.join("\n");
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build the unified system prompt used by test-agent (from agent_settings table).
 * Principle-based: let the AI think, don't script answers.
 */
export function buildSystemPrompt(
  settings: { agent_prompt: string; product_info: string; faq: string; pixKey?: string }
): string {
  const faqBlock = settings.faq?.trim() ? `\nCONHECIMENTO ADICIONAL:\n${settings.faq}` : "";

  return `=== PRINCÍPIOS ABSOLUTOS DO "MAGO FLIX" — VENDAS WHATSAPP ===

Você é um closer de elite do Mago Flix no WhatsApp. Sua missão: criar desejo, desarmar objeções e FECHAR A VENDA com naturalidade — como um amigo que indica algo bom demais pra guardar só pra si.

══════ 1. MENTALIDADE ══════
- Você NÃO é atendente, suporte, nem chatbot. Você é uma PESSOA REAL empolgada com o produto.
- Converse em ritmo de "ping-pong": mensagens curtas, perguntas que fazem o lead concordar.
- ESPELHE a energia: se o lead manda áudio, seja mais caloroso. Se é direto, seja objetivo.
- NUNCA envie textões. Se precisa falar mais, quebre em 2 mensagens com ---SPLIT---.

══════ 2. O PRODUTO — REGRAS INVIOLÁVEIS ══════
- Você vende acesso à LISTA DE FORNECEDORES PREMIUM do Mago Flix (e NÃO Netflix/HBO diretamente).
- R$19,90 = taxa ÚNICA de liberação à lista. Dentro da lista, cada tela (Netflix, HBO, etc.) sai a partir de ~R$1.
- FRASE CORRETA: "A plataforma custa R$19,90 pra liberar, e lá dentro vc pega telas tipo Netflix a partir de R$1 cada"
- FRASE PROIBIDA: "Netflix por R$19,90" / "HBO por R$19,90" / qualquer streaming direto por esse preço
- O áudio de boas-vindas JÁ foi enviado no início. Reforce os mesmos argumentos com suas palavras.

══════ 3. FUNIL SPIN — 4 FASES ══════

🔍 FASE 1 — SITUAÇÃO: Faça pergunta de descoberta antes de explicar.
❗ FASE 2 — PROBLEMA: Amplifique a dor com empatia + dados.
💡 FASE 3 — IMPLICAÇÃO: Faça ele sentir o custo de NÃO agir.
🎯 FASE 4 — FECHAMENTO: Quando mostrar intenção → PARE DE EXPLICAR, vá pro PIX.

══════ 4. OBJEÇÕES ══════
- "Tá caro" → Compare com assinaturas individuais (R$55 Netflix vs R$19,90 pra +30)
- "Vou pensar" → Escassez leve + sem pressão
- "Medo de golpe" → Prova social + transparência do PIX
- "Já tenho Netflix" → Substituir, não acumular
- "É pirataria?" → "Fornecedores com licenças de revenda" (NUNCA admita ilegalidade)
- "Só tenho cartão" → generate_site_payment

══════ 5. TÉCNICAS ══════
- MICRO-COMPROMISSOS: perguntas simples antes do fechamento
- ESCASSEZ: máx 1x por conversa ("preço promocional")
- FECHAMENTO ASSUMIDO: "Bora? Mando o PIX agora 🔥"
- ANTI-GHOSTING: retome com valor, nunca com cobrança

=== PROMPT DO USUÁRIO ===
${settings.agent_prompt}

INFORMAÇÕES DO PRODUTO:
${settings.product_info}
${faqBlock}

REGRAS DE FERRAMENTAS E FUNIL:
- QUALIFICAÇÃO: Use move_lead_stage("qualificado") quando o lead demonstrar interesse.
- PROPOSTA: Use move_lead_stage("proposta") ao enviar PIX ou link.
- FECHADO: Use move_lead_stage("fechado") + register_conversion ao confirmar pagamento.
- PERDIDO: Use move_lead_stage("perdido") se desistir.
- NUNCA mova para etapa anterior. NUNCA duplique register_conversion em lead "fechado".
- NUNCA mencione ferramentas ou funil ao cliente.

PAGAMENTO:
- generate_pix_manual: PADRÃO para qualquer compra. Envie código puro sem markdown.
- generate_site_payment: SOMENTE se pedir cartão explicitamente.
- Se já pagou → check_payment_status. Se PIX pendente → reenvie, não gere novo.
- Pagamento externo → peça comprovante. Use validate_receipt OBRIGATORIAMENTE.

MÍDIA:
- "[imagem recebido - não foi possível processar]" → peça reenvio.
- "[Undecryptable]" → responda normalmente.`;
}

// Phrases that indicate the assistant couldn't handle media - these contaminate context
const MEDIA_FALLBACK_PATTERNS = [
  "não consigo analisar imag", "nao consigo analisar imag",
  "não consigo abrir", "nao consigo abrir",
  "não consigo ver imag", "nao consigo ver imag",
  "não consigo visualizar", "nao consigo visualizar",
  "não estou conseguindo ver", "nao estou conseguindo ver",
  "não consigo ver o documento", "nao consigo ver o documento",
  "não consigo ver os documentos", "nao consigo ver os documentos",
  "não consigo acessar o arquivo", "nao consigo acessar o arquivo",
  "não consigo acessar arquivos", "nao consigo acessar arquivos",
  "não consigo abrir o arquivo", "nao consigo abrir o arquivo",
  "não consigo abrir arquivos", "nao consigo abrir arquivos",
  "não consigo ver o conteúdo", "nao consigo ver o conteudo",
  "não é possível visualizar", "nao e possivel visualizar",
  "não tenho acesso ao arquivo", "nao tenho acesso ao arquivo",
  "não consigo ler o documento", "nao consigo ler o documento",
  "envie como texto", "enviar como texto",
  "descreva o que precisa",
  "o cliente enviou",
  "você não consegue visualizar",
];

// Simple greetings that should reset context for parity
const GREETING_PATTERNS = [
  "oi", "olá", "ola", "hey", "hi", "hello",
  "bom dia", "boa tarde", "boa noite",
  "e aí", "e ai", "eai", "fala", "salve",
  "oie", "oii", "oiii",
];

/**
 * Check if text is a simple greeting (possibly with punctuation/emoji).
 */
export function isSimpleGreeting(text: string): boolean {
  const clean = normalizeText(text).replace(/[!?.,:;]/g, "").trim();
  return GREETING_PATTERNS.includes(clean);
}

/**
 * Filter message history: cleanup + greeting reset.
 * leadStage: if provided, skip greeting reset for advanced stages.
 * lastMessageTimestamp: if provided (epoch ms), skip greeting reset if recent activity (<5 min).
 */
export function filterMessageHistory(
  rawMessages: { role: string; content: any }[],
  opts?: { leadStage?: string; lastMessageTimestamp?: number }
): { messages: { role: string; content: any }[]; olderMessages: { role: string; content: any }[] } {
  const filtered: { role: string; content: any }[] = [];

  for (const msg of rawMessages) {
    // Skip media fallback patterns from assistant (only check string content)
    if (msg.role === "assistant" && typeof msg.content === "string" && msg.content.length < 300) {
      const l = msg.content.toLowerCase();
      if (MEDIA_FALLBACK_PATTERNS.some(p => l.includes(p))) {
        continue;
      }
    }

    // Skip bare "[Tipo recebido]" placeholders (only for string content)
    if (msg.role === "user" && typeof msg.content === "string") {
      const c = msg.content.trim();
      if (/^\[.+recebido.*\]$/.test(c)) {
        continue;
      }
    }

    filtered.push(msg);
  }

  const RECENT_LIMIT = 15;
  const olderMessages = filtered.length > RECENT_LIMIT ? filtered.slice(0, filtered.length - RECENT_LIMIT) : [];
  const recent = filtered.slice(-RECENT_LIMIT);

  const lastRaw = rawMessages[rawMessages.length - 1];
  if (lastRaw?.role === "user") {
    const lastFiltered = recent[recent.length - 1];
    const lastRawContent = typeof lastRaw.content === "string" ? lastRaw.content : JSON.stringify(lastRaw.content);
    const lastFilteredContent = lastFiltered ? (typeof lastFiltered.content === "string" ? lastFiltered.content : JSON.stringify(lastFiltered.content)) : "";
    if (lastFilteredContent !== lastRawContent) {
      recent.push(lastRaw);
    }
  }

  const lastUserMsg = [...recent].reverse().find(m => m.role === "user");
  if (lastUserMsg && typeof lastUserMsg.content === "string" && isSimpleGreeting(lastUserMsg.content)) {
    // Smart greeting reset: skip if lead is in advanced stage or conversation is active (<5 min)
    const advancedStages = ["qualificado", "proposta", "fechado"];
    const isAdvanced = opts?.leadStage && advancedStages.includes(opts.leadStage);
    const isRecentActivity = opts?.lastMessageTimestamp && (Date.now() - opts.lastMessageTimestamp < 5 * 60 * 1000);
    
    if (isAdvanced) {
      console.log(`[AI-ENGINE] Greeting reset SKIPPED: lead stage is "${opts?.leadStage}" (advanced)`);
    } else if (isRecentActivity) {
      console.log(`[AI-ENGINE] Greeting reset SKIPPED: last message was ${Math.round((Date.now() - (opts?.lastMessageTimestamp || 0)) / 1000)}s ago (< 5 min)`);
    } else {
      console.log(`[AI-ENGINE] Greeting reset applied for: "${lastUserMsg.content}" — keeping last 6 messages for context`);
      const keepCount = Math.min(6, recent.length);
      return { messages: recent.slice(-keepCount), olderMessages: [] };
    }
  }

  if (olderMessages.length > 0) {
    console.log(`[AI-ENGINE] Context limited: ${filtered.length} total -> ${recent.length} recent + ${olderMessages.length} older (for summary)`);
  }

  return { messages: recent, olderMessages };
}

/**
 * Generate a summary of older messages using a cheap GPT-4o-mini call.
 * Returns a system-role message with the condensed context.
 */
export async function summarizeOlderMessages(
  olderMessages: { role: string; content: any }[],
  apiKey: string
): Promise<string> {
  const condensed = olderMessages.map(m => {
    const content = typeof m.content === "string" ? m.content : "[mídia]";
    return `${m.role}: ${content.slice(0, 200)}`;
  }).join("\n");

  const summaryPrompt = `Resuma esta conversa de WhatsApp em ~150 palavras. Inclua: nome do cliente (se mencionado), produto de interesse, objeções, links/PIX já enviados, etapa do funil (novo/qualificado/proposta/fechado). Seja objetivo e factual.

CONVERSA:
${condensed.slice(0, 4000)}`;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 300,
        temperature: 0.3,
        messages: [
          { role: "system", content: "Você é um assistente que resume conversas de vendas de forma concisa e factual." },
          { role: "user", content: summaryPrompt },
        ],
      }),
    });

    if (!resp.ok) {
      console.error("[AI-ENGINE] Summary call failed:", resp.status);
      return "";
    }

    const data = await resp.json();
    const summary = data.choices?.[0]?.message?.content || "";
    console.log(`[AI-ENGINE] Generated summary (${summary.length} chars) from ${olderMessages.length} older messages`);
    return summary;
  } catch (err) {
    console.error("[AI-ENGINE] summarizeOlderMessages error:", err);
    return "";
  }
}

/**
 * Build the funnel tools for OpenAI function calling.
 */
export function buildFunnelTools(availableProducts?: string[]): any[] {
  const productHint = availableProducts?.length
    ? ` Produtos disponíveis: ${availableProducts.join(", ")}. Use EXATAMENTE um desses nomes.`
    : "";
  return [
    {
      type: "function",
      function: {
        name: "move_lead_stage",
        description: "Move o lead para uma nova etapa do funil de vendas. Use quando detectar que o cliente avançou ou regrediu no funil.",
        parameters: {
          type: "object",
          properties: {
            stage: {
              type: "string",
              enum: ["qualificado", "proposta", "fechado", "perdido"],
              description: "A nova etapa do funil: qualificado (demonstrou interesse), proposta (recebeu proposta/link), fechado (confirmou compra), perdido (desistiu)",
            },
          },
          required: ["stage"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "register_conversion",
        description: "Registra uma conversão quando o cliente confirma compra ou pagamento. Use junto com move_lead_stage para 'fechado'.",
        parameters: {
          type: "object",
          properties: {
            event_name: {
              type: "string",
              enum: ["Purchase", "Lead", "InitiateCheckout"],
              description: "Tipo do evento: Purchase (compra confirmada), Lead (qualificação), InitiateCheckout (proposta enviada)",
            },
            value: {
              type: "number",
              description: "Valor da conversão em reais (R$). Use 0 se não souber o valor.",
            },
          },
          required: ["event_name", "value"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "generate_pix_manual",
        description: "Envia a chave PIX (copia e cola) diretamente ao cliente para pagamento rápido, sem usar o sistema de pagamentos integrado. Use quando o cliente quiser pagar por PIX de forma simples e direta. A chave PIX será enviada automaticamente como texto copiável + botão PIX nativo.",
        parameters: {
          type: "object",
          properties: {
            product_name: {
              type: "string",
              description: "Nome do produto (opcional, para contexto na resposta)." + productHint,
            },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "generate_site_payment",
        description: "Envia o link do site/checkout para pagamento por CARTAO DE CREDITO. Use SOMENTE quando o cliente pedir explicitamente para pagar com cartao de credito.",
        parameters: {
          type: "object",
          properties: {
            product_name: {
              type: "string",
              description: "Nome do produto que o cliente quer comprar." + productHint,
            },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "check_payment_status",
        description: "Verifica o status de um pagamento PIX gerado anteriormente. Use quando o cliente perguntar se o pagamento foi confirmado.",
        parameters: {
          type: "object",
          properties: {
            transaction_id: {
              type: "string",
              description: "ID da transação retornado quando o pagamento foi gerado (formato tran_xxx)",
            },
          },
          required: ["transaction_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "send_social_proof",
        description: "Envia um print de feedback/depoimento real de um cliente satisfeito como prova social. Use quando quiser convencer o lead mostrando resultados reais de outros clientes.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "validate_receipt",
        description: "Valida um comprovante de pagamento enviado pelo cliente (PIX, transferência, boleto). Use SEMPRE ao receber uma imagem de comprovante. A ferramenta verifica data/hora e valor automaticamente e registra a conversão se válido.",
        parameters: {
          type: "object",
          properties: {
            value: {
              type: "number",
              description: "Valor em reais (R$) que aparece no comprovante. Ex: 19.90",
            },
            date: {
              type: "string",
              description: "Data do comprovante no formato DD/MM/YYYY. Ex: 03/03/2026",
            },
            time: {
              type: "string",
              description: "Hora do comprovante no formato HH:MM. Ex: 14:30",
            },
            beneficiary_name: {
              type: "string",
              description: "Nome do beneficiário/destinatário que aparece no comprovante",
            },
            is_valid: {
              type: "boolean",
              description: "Se o comprovante parece legítimo visualmente (não editado, dados coerentes, formato real de banco)",
            },
          },
          required: ["value", "date", "time", "beneficiary_name", "is_valid"],
        },
      },
    },
  ];
}

/**
 * Unified OpenAI call used by both test-agent and webhook.
 * Supports optional tools for function calling.
 * Now accepts dynamic model, temperature, maxTokens from agent config.
 */
export async function callOpenAI(params: {
  systemPrompt: string;
  messages: { role: string; content: any }[];
  apiKey: string;
  hasDocument?: boolean;
  tools?: any[];
  agentModel?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
  messageCount?: number;
}): Promise<{ reply: string; usage: any; model: string; tool_calls?: any[] }> {
  // Model downgrade: after 25 messages, force gpt-4o-mini to save costs
  const MESSAGE_DOWNGRADE_THRESHOLD = 25;
  const forceEconomy = (params.messageCount || 0) > MESSAGE_DOWNGRADE_THRESHOLD;
  
  const model = params.hasDocument ? "gpt-4o" 
    : forceEconomy ? "gpt-4o-mini" 
    : (params.agentModel || "gpt-4o-mini");
  const temperature = params.temperature ?? 0.7;
  const maxTokens = params.maxTokens || 4096;

  if (forceEconomy && params.agentModel && params.agentModel !== "gpt-4o-mini") {
    console.log(`[AI-ENGINE] Model downgraded to gpt-4o-mini (conversation has ${params.messageCount} messages, threshold=${MESSAGE_DOWNGRADE_THRESHOLD})`);
  }

  console.log(`[AI-ENGINE] Calling ${model} with ${params.messages.length} messages, temperature=${temperature}, maxTokens=${maxTokens}, tools=${params.tools ? params.tools.length : 0}`);

  const body: any = {
    model,
    temperature,
    max_tokens: maxTokens,
    frequency_penalty: 0.6,
    presence_penalty: 0.4,
    messages: [
      { role: "system", content: params.systemPrompt },
      ...params.messages,
    ],
  };

  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools;
    body.tool_choice = "auto";
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("[AI-ENGINE] OpenAI error:", resp.status, errText);
    throw new Error(`OpenAI error ${resp.status}`);
  }

  const data = await resp.json();
  const choice = data.choices?.[0];
  const reply = choice?.message?.content || "";
  const tool_calls = choice?.message?.tool_calls || undefined;

  if (tool_calls) {
    console.log(`[AI-ENGINE] Tool calls detected: ${tool_calls.length}`, tool_calls.map((tc: any) => tc.function.name));
  }

  return { reply, usage: data.usage || null, model, tool_calls };
}

/**
 * Make a second OpenAI call after tool execution to get the final text reply.
 */
export async function callOpenAIWithToolResults(params: {
  systemPrompt: string;
  messages: { role: string; content: any }[];
  apiKey: string;
  assistantToolCallMessage: any;
  toolResults: { tool_call_id: string; content: string }[];
  hasDocument?: boolean;
  agentModel?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
  messageCount?: number;
}): Promise<{ reply: string; usage: any; model: string }> {
  const MESSAGE_DOWNGRADE_THRESHOLD = 25;
  const forceEconomy = (params.messageCount || 0) > MESSAGE_DOWNGRADE_THRESHOLD;
  const model = params.hasDocument ? "gpt-4o" 
    : forceEconomy ? "gpt-4o-mini" 
    : (params.agentModel || "gpt-4o-mini");
  const temperature = params.temperature ?? 0.7;
  const maxTokens = params.maxTokens || 4096;

  const messages = [
    { role: "system", content: params.systemPrompt },
    ...params.messages,
    params.assistantToolCallMessage,
    ...params.toolResults.map(tr => ({
      role: "tool",
      tool_call_id: tr.tool_call_id,
      content: tr.content,
    })),
  ];

  console.log(`[AI-ENGINE] Second call (tool results) with ${messages.length} messages, model=${model}, temperature=${temperature}`);

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, temperature, max_tokens: maxTokens, frequency_penalty: 0.6, presence_penalty: 0.4, messages }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("[AI-ENGINE] OpenAI second call error:", resp.status, errText);
    throw new Error(`OpenAI error ${resp.status}`);
  }

  const data = await resp.json();
  const reply = data.choices?.[0]?.message?.content || "Desculpe, não consegui processar sua mensagem.";
  return { reply, usage: data.usage || null, model };
}

/**
 * Check if a message is from the bot itself (outbound echo).
 */
export function isBotEcho(rawMessage: any, chat: any): { isEcho: boolean; reason: string } {
  const fromMe = rawMessage?.fromMe;
  if (fromMe === true || fromMe === "true" || fromMe === 1 || fromMe === "1") {
    return { isEcho: true, reason: "fromMe=true" };
  }

  const sentByApi = rawMessage?.wasSentByApi;
  if (sentByApi === true || sentByApi === "true" || sentByApi === 1 || sentByApi === "1") {
    return { isEcho: true, reason: "wasSentByApi=true" };
  }

  if (chat?.owner && chat?.wa_lastMessageSender) {
    const senderClean = String(chat.wa_lastMessageSender).replace(/@.*$/, "").replace(/\D/g, "");
    const ownerClean = String(chat.owner).replace(/@.*$/, "").replace(/\D/g, "");
    if (senderClean && ownerClean && senderClean === ownerClean) {
      return { isEcho: true, reason: `sender=${senderClean} matches owner=${ownerClean}` };
    }
  }

  return { isEcho: false, reason: "" };
}

/**
 * Send a conversion event to Meta Conversions API (CAPI).
 * Returns the event_id if successful, null otherwise.
 *
 * Attribution params (optional) dramatically improve campaign matching:
 * - fbc: Facebook Click ID (fb.1.{ts}.{fbclid})
 * - fbp: Facebook Browser ID
 * - contentName: creative/ad name for content_name
 * - contentIds: array of track_id / ad_id strings
 */
export async function sendMetaConversionEvent(params: {
  pixelId: string;
  accessToken: string;
  eventName: string;
  value: number;
  currency: string;
  phone: string;
  fbc?: string;
  fbp?: string;
  contentName?: string;
  contentIds?: string[];
}): Promise<string | null> {
  try {
    // Hash phone with SHA-256 for Meta matching
    const encoder = new TextEncoder();
    const phoneClean = params.phone.replace(/\D/g, "");
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(phoneClean));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const phoneHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    const countryHash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode("br")))
    ).map(b => b.toString(16).padStart(2, "0")).join("");

    const eventId = crypto.randomUUID();
    const eventTime = Math.floor(Date.now() / 1000);

    // Build user_data with optional click attribution
    const userData: any = {
      ph: [phoneHash],
      country: [countryHash],
    };
    if (params.fbc) userData.fbc = params.fbc;
    if (params.fbp) userData.fbp = params.fbp;

    // Build custom_data with optional content attribution
    const customData: any = {
      value: params.value,
      currency: params.currency,
    };
    if (params.contentName) customData.content_name = params.contentName;
    if (params.contentIds && params.contentIds.length > 0) customData.content_ids = params.contentIds;

    // Use "website" action_source when we have click attribution (better matching priority)
    const actionSource = params.fbc ? "website" : "system_generated";

    const payload = {
      data: [
        {
          event_name: params.eventName,
          event_time: eventTime,
          event_id: eventId,
          action_source: actionSource,
          user_data: userData,
          custom_data: customData,
        },
      ],
    };

    console.log(`[META-CAPI] Sending ${params.eventName} event, value=${params.value} ${params.currency}, phone_hash=${phoneHash.slice(0, 12)}..., fbc=${params.fbc || "none"}, contentName=${params.contentName || "none"}, action_source=${actionSource}`);

    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${params.pixelId}/events?access_token=${params.accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[META-CAPI] Error:", resp.status, errText.slice(0, 300));
      return null;
    }

    const result = await resp.json();
    console.log("[META-CAPI] Success:", JSON.stringify(result));
    return eventId;
  } catch (err) {
    console.error("[META-CAPI] Exception:", err);
    return null;
  }
}

/**
 * Helper: Lookup ad attribution data for a conversation from ad_creatives table.
 * Returns fbc, contentName, contentIds for CAPI enrichment.
 */
export async function getAdAttribution(supabase: any, conversationId: string): Promise<{
  fbc?: string;
  contentName?: string;
  contentIds?: string[];
}> {
  try {
    const { data: creative } = await supabase
      .from("ad_creatives")
      .select("track_id, track_source, raw_data")
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (!creative) return {};

    const result: any = {};
    const rawData = creative.raw_data || {};
    const extAdReply = rawData.external_ad_reply || {};

    // Build content attribution
    if (creative.track_source) result.contentName = creative.track_source;
    else if (rawData.ad_title) result.contentName = rawData.ad_title;

    if (creative.track_id) result.contentIds = [creative.track_id];
    else if (extAdReply.sourceId || extAdReply.sourceID) result.contentIds = [extAdReply.sourceId || extAdReply.sourceID];

    // Build fbc: prefer ctwaClid (Click-to-WhatsApp), fallback to fbclid
    const ctwaClid = rawData.ctwaClid || extAdReply.ctwaClid;
    const fbclid = rawData.fbclid || extAdReply.sourceUrl?.match?.(/fbclid=([^&]+)/)?.[1];
    
    if (ctwaClid) {
      const timestamp = rawData.ctwaClid_timestamp || Math.floor(Date.now() / 1000);
      result.fbc = `fb.1.${timestamp}.${ctwaClid}`;
    } else if (fbclid) {
      const timestamp = rawData.fbclid_timestamp || Math.floor(Date.now() / 1000);
      result.fbc = `fb.1.${timestamp}.${fbclid}`;
    }

    // Fallback: attribute to highest-spend campaign of the day
    if (!result.fbc) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: topCampaign } = await supabase
        .from("campaign_snapshots")
        .select("campaign_id, campaign_name, spend")
        .eq("date", today)
        .order("spend", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (topCampaign && topCampaign.campaign_id) {
        const ts = Math.floor(Date.now() / 1000);
        result.fbc = `fb.1.${ts}.wa_${topCampaign.campaign_id}`;
        if (!result.contentName) result.contentName = topCampaign.campaign_name;
        if (!result.contentIds) result.contentIds = [topCampaign.campaign_id];
        console.log(`[AD-ATTRIBUTION] Fallback to top-spend campaign: ${topCampaign.campaign_name} (R$${topCampaign.spend})`);
      }
    }

    console.log("[AD-ATTRIBUTION] Result for", conversationId, ":", JSON.stringify(result));
    return result;
  } catch (err) {
    console.error("[AD-ATTRIBUTION] Error:", err);
    return {};
  }
}
