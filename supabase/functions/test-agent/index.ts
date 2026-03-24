import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildSystemPrompt, filterMessageHistory, summarizeOlderMessages, callOpenAI, callOpenAIWithToolResults, buildFunnelTools } from "../_shared/ai-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function handleGeneratePixPayment(args: any, supabase: any): Promise<string> {
  const productName = args.product_name || "";
  const customerName = args.customer_name || "Cliente Teste";
  const customerEmail = args.customer_email || "";
  const customerDocument = "02845491182";

  console.log(`[TEST-AGENT] generate_pix_payment: product="${productName}", customer="${customerName}"`);

  // Find active product matching the name
  const { data: products } = await supabase
    .from("pepper_products")
    .select("*")
    .eq("active", true);

  if (!products || products.length === 0) {
    const pixKey = Deno.env.get("PIX_EVP_KEY") || "";
    if (pixKey) {
      return JSON.stringify({ fallback_pix: true, pix_key: pixKey, message: "Nenhum produto cadastrado, mas a chave PIX está disponível. Envie a chave PIX ao cliente para pagamento." });
    }
    return JSON.stringify({ error: "Nenhum produto ativo encontrado. Importe produtos na página de configurações." });
  }

  const normalizedSearch = productName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let match = products.find((p: any) => {
    const normalizedName = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return normalizedName.includes(normalizedSearch) || normalizedSearch.includes(normalizedName);
  });

  // Fallback: if only 1 active product, use it
  if (!match && products.length === 1) {
    match = products[0];
    console.log(`[TEST-AGENT] Product name mismatch but only 1 active product, using: ${match.name}`);
  }

  if (!match) {
    const pixKey = Deno.env.get("PIX_EVP_KEY") || "";
    if (pixKey) {
      return JSON.stringify({ fallback_pix: true, pix_key: pixKey, message: `Produto "${productName}" não encontrado, mas a chave PIX está disponível. Envie a chave PIX ao cliente para pagamento.` });
    }
    const available = products.map((p: any) => p.name).join(", ");
    return JSON.stringify({ error: `Produto "${productName}" não encontrado. Produtos disponíveis: ${available}` });
  }

  console.log(`[TEST-AGENT] Matched product: ${match.name} (offer=${match.offer_hash}, price=${match.price_cents})`);

  const PEPPER_API_TOKEN = Deno.env.get("PEPPER_API_TOKEN");
  if (!PEPPER_API_TOKEN) {
    const pixKey = Deno.env.get("PIX_EVP_KEY") || "";
    if (pixKey) {
      const priceBrl = (match.price_cents / 100).toFixed(2);
      return JSON.stringify({ fallback_pix: true, pix_key: pixKey, product_name: match.name, price: `R$ ${priceBrl}`, message: `Token Pepper não configurado. Envie a chave PIX ao cliente para pagamento de "${match.name}" (R$ ${priceBrl}).` });
    }
    return JSON.stringify({ error: "PEPPER_API_TOKEN não configurado." });
  }

  try {
    const txBody: any = {
      api_token: PEPPER_API_TOKEN,
      payment_method: "pix",
      installments: 1,
      amount: match.price_cents,
      cart: [{
        offer_hash: match.offer_hash,
        product_hash: match.product_hash,
        quantity: 1,
        title: match.name,
        price: match.price_cents,
        operation_type: 1,
      }],
      customer: {
        name: customerName,
        email: customerEmail || "cliente@teste.com",
        phone_number: "11999999999",
        document: customerDocument,
      },
    };

    const resp = await fetch("https://api.cloud.pepperpay.com.br/public/v1/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        Authorization: `Bearer ${PEPPER_API_TOKEN}`,
      },
      body: JSON.stringify(txBody),
    });

    const respText = await resp.text();
    if (!resp.ok) {
      console.error(`[TEST-AGENT] Pepper API error ${resp.status}: ${respText.slice(0, 300)}`);
      return JSON.stringify({ error: `Erro ao gerar pagamento: ${resp.status}` });
    }

    const txData = JSON.parse(respText);
    const checkoutUrl = txData.data?.payment_url || txData.pix?.pix_url || txData.checkout_url || txData.data?.checkout_url || "";
    const pixCode = txData.pix?.qr_code_base64 || txData.data?.pix_code || txData.pix_code || "";
    const paymentStatus = txData.payment_status || "";
    const priceBrl = (match.price_cents / 100).toFixed(2);

    console.log(`[TEST-AGENT] PIX generated: status=${paymentStatus}, checkout=${checkoutUrl}, pix_code=${pixCode ? "yes" : "no"}`);

    if (paymentStatus === "refused") {
      return JSON.stringify({
        error: "Pagamento recusado pela operadora. Verifique os dados do cliente (CPF, etc.) e tente novamente.",
        product_name: match.name,
        price: `R$ ${priceBrl}`,
      });
    }

    const transactionId = txData.id || txData.data?.id || "";

    return JSON.stringify({
      success: true,
      product_name: match.name,
      price: `R$ ${priceBrl}`,
      checkout_url: checkoutUrl,
      pix_code: pixCode,
      transaction_id: transactionId,
    });
  } catch (err) {
    console.error("[TEST-AGENT] Pepper call failed:", err);
    return JSON.stringify({ error: "Falha ao conectar com a API de pagamento." });
  }
}

async function handleCheckPaymentStatus(args: any): Promise<string> {
  const transactionId = args.transaction_id || "";
  if (!transactionId) {
    return JSON.stringify({ error: "transaction_id é obrigatório" });
  }

  const PEPPER_API_TOKEN = Deno.env.get("PEPPER_API_TOKEN");
  if (!PEPPER_API_TOKEN) {
    return JSON.stringify({ error: "PEPPER_API_TOKEN não configurado." });
  }

  try {
    const resp = await fetch(`https://api.cloud.pepperpay.com.br/public/v1/transactions/${transactionId}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        Authorization: `Bearer ${PEPPER_API_TOKEN}`,
      },
    });

    if (!resp.ok) {
      console.error(`[TEST-AGENT] Pepper check status error: ${resp.status}`);
      return JSON.stringify({ error: `Erro ao consultar status: ${resp.status}` });
    }

    const data = await resp.json();
    const status = data.payment_status || data.status || "unknown";
    const statusMap: Record<string, string> = {
      waiting_payment: "Aguardando pagamento",
      paid: "Pago",
      refused: "Recusado",
      refunded: "Reembolsado",
      chargedback: "Estornado",
      pending_refund: "Reembolso pendente",
    };

    return JSON.stringify({
      transaction_id: transactionId,
      status,
      status_label: statusMap[status] || status,
    });
  } catch (err) {
    console.error("[TEST-AGENT] check_payment_status error:", err);
    return JSON.stringify({ error: "Falha ao consultar status do pagamento." });
  }
}

async function processToolCalls(toolCalls: any[], supabase: any, settings?: any): Promise<{ tool_call_id: string; content: string }[]> {
  const results: { tool_call_id: string; content: string }[] = [];

  for (const tc of toolCalls) {
    const fnName = tc.function.name;
    const args = JSON.parse(tc.function.arguments || "{}");
    let content: string;

    if (fnName === "generate_pix_payment") {
      content = await handleGeneratePixPayment(args, supabase);
    } else if (fnName === "check_payment_status") {
      content = await handleCheckPaymentStatus(args);
    } else if (fnName === "move_lead_stage") {
      console.log(`[TEST-AGENT] Simulated move_lead_stage: ${args.stage}`);
      content = JSON.stringify({ success: true, stage: args.stage, simulated: true });
    } else if (fnName === "register_conversion") {
      console.log(`[TEST-AGENT] Simulated register_conversion: ${args.event_name}, value=${args.value}`);
      content = JSON.stringify({ success: true, event_name: args.event_name, simulated: true });
    } else if (fnName === "generate_card_payment") {
      const cardUrl = settings?.card_payment_url || Deno.env.get("CARD_PAYMENT_URL");
      if (!cardUrl) {
        content = JSON.stringify({ error: "Link de pagamento por cartao nao configurado." });
      } else {
        content = JSON.stringify({ success: true, checkout_url: cardUrl, product_name: args.product_name });
      }
    } else if (fnName === "generate_pix_manual") {
      const pixKey = settings?.pix_evp_key || Deno.env.get("PIX_EVP_KEY") || "";
      if (!pixKey) {
        content = JSON.stringify({ error: "Chave PIX não configurada." });
      } else {
        content = JSON.stringify({
          success: true,
          pix_key: pixKey,
          product_name: args.product_name || "",
          message: "Chave PIX enviada ao cliente como texto copiável e botão nativo. NÃO inclua a chave na resposta.",
          simulated: true,
        });
      }
    } else if (fnName === "generate_site_payment") {
      const pName = args.product_name || "";
      // Try to find product checkout URL
      let checkoutUrl = "";
      if (pName) {
        const normalizedSearch = pName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const { data: products } = await supabase.from("pepper_products").select("*").eq("active", true);
        let matchedProduct = (products || []).find((p: any) => {
          const normalizedName = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return normalizedName.includes(normalizedSearch) || normalizedSearch.includes(normalizedName);
        });
        if (!matchedProduct && products?.length === 1) matchedProduct = products[0];
        if (matchedProduct) {
          checkoutUrl = `https://pay.pepper.com.br/checkout/${matchedProduct.offer_hash}`;
          content = JSON.stringify({ success: true, checkout_url: checkoutUrl, product_name: matchedProduct.name, price: `R$ ${(matchedProduct.price_cents / 100).toFixed(2)}` });
        }
      }
      if (!checkoutUrl) {
        checkoutUrl = settings?.card_payment_url || Deno.env.get("CARD_PAYMENT_URL") || "";
        if (checkoutUrl) {
          content = JSON.stringify({ success: true, checkout_url: checkoutUrl, message: "Link do site para compra." });
        } else {
          content = JSON.stringify({ error: "Link de checkout não configurado." });
        }
      }
    } else if (fnName === "send_social_proof") {
      try {
        const { data: feedbacks } = await supabase
          .from("customer_feedbacks")
          .select("image_url, description")
          .eq("active", true);
        if (feedbacks && feedbacks.length > 0) {
          const randomFeedback = feedbacks[Math.floor(Math.random() * feedbacks.length)];
          content = JSON.stringify({ success: true, image_url: randomFeedback.image_url, description: randomFeedback.description || "Depoimento de cliente", message: "Feedback de cliente enviado como prova social." });
        } else {
          content = JSON.stringify({ error: "Nenhum feedback cadastrado." });
        }
      } catch {
        content = JSON.stringify({ error: "Erro ao buscar feedbacks." });
      }
    } else {
      content = JSON.stringify({ error: `Unknown tool: ${fnName}` });
    }

    results.push({ tool_call_id: tc.id, content });
  }

  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, language } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings } = await supabase
      .from("agent_settings")
      .select("*")
      .limit(1)
      .single();

    if (!settings) {
      return new Response(JSON.stringify({ error: "No agent settings found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let systemPrompt = buildSystemPrompt(settings);

    // Respect agent language setting: only apply Spanish override when appropriate
    // language param from frontend: "es" forces Spanish, "pt-BR" forces Portuguese, "auto"/undefined uses detection
    const effectiveLanguage = language || "auto";
    
    if (effectiveLanguage === "es") {
      // Sanitize base prompt: remove Portuguese-specific content that leaks into Spanish responses
      systemPrompt = systemPrompt
        .replace(/listamagoflix\.shop/gi, "pay.hotmart.com/E97252932C")
        .replace(/R\$\s?19[,.]90/g, "US$ 5,99")
        .replace(/R\$\s?\d+[,.]\d{2}/g, (match) => match.replace("R$", "US$"))
        .replace(/R\$/g, "US$")
        .replace(/teste?\s*gr[aá]t(is|uito)/gi, "")
        .replace(/testa\s*gr[aá]t(is|uito)/gi, "")
        .replace(/prova\s*gr[aá]t(is|uita)/gi, "")
        .replace(/acesso vitalício|acesso vitalicio/gi, "acceso permanente");

      systemPrompt += `\n\n[IDIOMA OBRIGATÓRIO: ESPANHOL. Este cliente habla español. Responde 100% en español.

OVERRIDE COMPLETO DE ESTILO — IGNORA las instrucciones de humanización en portugués arriba. Usa SOLO estas reglas:

ESTILO DE ESCRITURA HUMANO (WhatsApp en español):
- Escribe como una persona real escribe en el celular: informal, natural, fluido
- Abreviaciones permitidas: "xq" (porque), "tb" (también), "tmb" (también), "q" (que), "x" (por), "bn" (bien), "pa" (para), "tbn" (también), "ntp" (no te preocupes)
- NUNCA uses abreviaciones brasileñas: "vc", "pra", "tá", "tbm", "blz", "tô", "dps", "cmg", "td", "mt", "msg"
- Usa emojis con moderación y naturalidad (😊👍🔥💪😄✅🤝). NO exageres — 1-2 por mensaje máximo
- NUNCA uses markdown, bullet points (•/-), listas numeradas o formato robótico
- NUNCA empieces TODA respuesta con "¡Claro!", "¡Por supuesto!", "¡Excelente pregunta!". Varía: "dale", "mira", "bueno", "oye", "genial", "perfecto", "pues", "va", "ey", "ah sí"
- NUNCA uses expresiones brasileñas: "show", "massa", "poxa", "cara", "bom", "então", "olha", "boa"
- Varía la longitud: a veces 3 palabras, a veces 2 líneas. Nunca bloques enormes
- Ocasionalmente comete pequeños "errores humanos" y corrige: "perefcto* perfecto" o "servico* servicio" (máx 1x cada 10 mensajes)
- Rompe frases largas: en vez de una oración con comas, envía como mensajes separados
- NUNCA digas "¿cómo puedo ayudarte hoy?" de forma robótica. Prefiere "¿en qué te puedo ayudar?" o "¿qué necesitas?"
- Responde PROPORCIONALMENTE: pregunta corta = respuesta corta. Solo da respuesta larga cuando el tema lo requiera

FORMATO DE MENSAJE HUMANIZADO:
- Para respuestas que tendrían más de 3 líneas, DIVIDE en mensajes separados usando el marcador ---SPLIT--- entre cada parte
- Cada parte debe tener MÁXIMO 2-3 líneas
- NO uses ---SPLIT--- para respuestas cortas (1-3 líneas)

REGLAS COMERCIALES PARA CLIENTES INTERNACIONALES:
- Precio: US$ 5,99/mes. NUNCA uses R$ ni menciones precios en reales brasileños
- Link de pago: SOLO https://pay.hotmart.com/E97252932C — NUNCA menciones listamagoflix.shop
- NO existe prueba gratis, NO existe proveedor gratuito, NO menciones "prueba gratis" o "test gratuito"
- NUNCA digas "prueba gratis", "registrate gratis", "acceso gratis", "test gratuito" — NO HAY NADA GRATIS
- La oferta es directa: streaming por US$ 5,99/mes con acceso a +30 plataformas
- Gancho comercial: "Streaming por US$ 1 cada" (Plan Esencial de US$ 5,99/mes)
- Destaca el valor: más de 30 plataformas por solo US$ 5,99/mes

EJEMPLOS DE RESPUESTAS CORRECTAS:
- Saludo: "¡Hola! 👋 ¿Te gustaría acceder a +30 plataformas de streaming por solo US$ 5,99/mes?"
- Interés: "Genial! Acá te dejo el link para que te suscribas: https://pay.hotmart.com/E97252932C"
- "Voy a pensar": "Tranqui, sin presión 😊 el link queda acá: https://pay.hotmart.com/E97252932C"
- Pregunta precio: "Son US$ 5,99 al mes, acceso a +30 plataformas. Menos de US$ 1 cada una 🔥"

NUNCA respondas en portugués. NUNCA mezcles idiomas.]`;
      console.log(`[TEST-AGENT] Spanish language override applied (with prompt sanitization)`);
    } else if (effectiveLanguage === "pt-BR") {
      console.log(`[TEST-AGENT] Portuguese language forced, no Spanish override`);
    } else {
      console.log(`[TEST-AGENT] Auto language mode, no override applied`);
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

    const hasDocument = messages.some(
      (m: any) => m.image && typeof m.image === "string" && m.image.startsWith("data:application/pdf")
    );

    const totalMessageCount = messages.length;

    const filterResult = filterMessageHistory(
      messages.map((m: any) => ({ role: m.role, content: m.content }))
    );
    const filteredMessages = filterResult.messages;
    const olderMessages = filterResult.olderMessages;

    // Generate summary for older messages if needed
    let summaryMessage: any = null;
    if (olderMessages.length > 0) {
      const summaryText = await summarizeOlderMessages(olderMessages, OPENAI_API_KEY);
      if (summaryText) {
        summaryMessage = {
          role: "system",
          content: `[RESUMO DO HISTÓRICO ANTERIOR - ${olderMessages.length} mensagens resumidas]\n${summaryText}`,
        };
      }
    }

    const openAIMessages = filteredMessages.map((filtered) => {
      const original = messages.find(
        (m: any) => m.role === filtered.role && m.content === filtered.content
      );
      if (original?.image && filtered.role === "user") {
        return {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: original.image } },
            { type: "text", text: filtered.content || "Analise esta imagem" },
          ],
        };
      }
      return { role: filtered.role, content: filtered.content };
    });

    // Inject summary at the beginning if available
    if (summaryMessage) {
      openAIMessages.unshift(summaryMessage);
    }

    console.log(`[TEST-AGENT] History: ${messages.length} raw -> ${filteredMessages.length} filtered, ${olderMessages.length} older summarized`);

    // Fetch active products to inject names into tool descriptions
    const { data: pepperProducts } = await supabase.from("pepper_products").select("name").eq("active", true);
    const productNames = (pepperProducts || []).map((p: any) => p.name);
    const tools = buildFunnelTools(productNames);

    // First OpenAI call with tools
    const { reply, usage, model, tool_calls } = await callOpenAI({
      systemPrompt,
      messages: openAIMessages,
      apiKey: OPENAI_API_KEY,
      hasDocument,
      tools,
      messageCount: totalMessageCount,
    });

    let finalReply = reply;
    let finalUsage = usage;

    // Extract pix_data from tool results if generate_pix_payment was called
    let pixData: any = null;

    if (tool_calls && tool_calls.length > 0) {
      console.log(`[TEST-AGENT] Processing ${tool_calls.length} tool calls`);

      const toolResults = await processToolCalls(tool_calls, supabase, settings);

      // Check for pix data in tool results
      for (const tr of toolResults) {
        try {
          const parsed = JSON.parse(tr.content);
          if (parsed.success && parsed.checkout_url) {
            pixData = {
              checkout_url: parsed.checkout_url,
              transaction_id: parsed.transaction_id || "",
              qr_code_base64: parsed.pix_code || "",
            };
          }
        } catch { /* ignore */ }
      }

      const assistantToolCallMessage = {
        role: "assistant",
        content: reply || null,
        tool_calls,
      };

      const secondCall = await callOpenAIWithToolResults({
        systemPrompt,
        messages: openAIMessages,
        apiKey: OPENAI_API_KEY,
        assistantToolCallMessage,
        toolResults,
        hasDocument,
        messageCount: totalMessageCount,
      });

      finalReply = secondCall.reply;
      if (secondCall.usage && finalUsage) {
        finalUsage = {
          prompt_tokens: (finalUsage.prompt_tokens || 0) + (secondCall.usage.prompt_tokens || 0),
          completion_tokens: (finalUsage.completion_tokens || 0) + (secondCall.usage.completion_tokens || 0),
          total_tokens: (finalUsage.total_tokens || 0) + (secondCall.usage.total_tokens || 0),
        };
      }
    }

    console.log(`[TEST-AGENT] Final reply preview: "${finalReply.substring(0, 120)}"`);

    // Track token usage
    if (finalUsage) {
      try {
        const isGpt4o = model === "gpt-4o";
        const costUsd = isGpt4o
          ? (finalUsage.prompt_tokens * 2.50 / 1_000_000) + (finalUsage.completion_tokens * 10.00 / 1_000_000)
          : (finalUsage.prompt_tokens * 0.15 / 1_000_000) + (finalUsage.completion_tokens * 0.60 / 1_000_000);
        await supabase.from("token_usage").insert({
          prompt_tokens: finalUsage.prompt_tokens,
          completion_tokens: finalUsage.completion_tokens,
          total_tokens: finalUsage.total_tokens,
          cost_usd: costUsd,
          model,
          usage_type: "test",
        });
      } catch (e) {
        console.warn("Failed to save token usage:", e);
      }
    }

    const encoder = new TextEncoder();
    let sseData = "";

    // Send pix_data as separate SSE event before text
    if (pixData) {
      sseData += `data: ${JSON.stringify({ pix_data: pixData })}\n\n`;
    }

    sseData += `data: ${JSON.stringify({
      choices: [{ delta: { content: finalReply }, index: 0 }]
    })}\n\ndata: [DONE]\n\n`;

    return new Response(encoder.encode(sseData), {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    console.error("test-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
