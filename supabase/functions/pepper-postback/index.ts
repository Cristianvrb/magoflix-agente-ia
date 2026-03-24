import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendMetaConversionEvent, getAdAttribution } from "../_shared/ai-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(raw: string): string {
  let phone = (raw || "").replace(/\D/g, "");
  // Keep country code 55 — DB stores phones WITH prefix
  if (!phone.startsWith("55") && phone.length >= 10) {
    phone = "55" + phone;
  }
  // Ensure 9-digit mobile (add 9 after country code + DDD if needed)
  // Format: 55 + DD(2) + 9 + number(8) = 13 digits
  if (phone.startsWith("55") && phone.length === 12) {
    // 55 + DD + 8 digits -> add 9 after DDD
    phone = phone.slice(0, 4) + "9" + phone.slice(4);
  }
  return phone;
}

// Strip 55 prefix for alternate lookup
function phoneWithout55(phone: string): string {
  if (phone.startsWith("55") && phone.length >= 12) {
    return phone.slice(2);
  }
  return phone;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("[PEPPER-POSTBACK] Received:", JSON.stringify(body).slice(0, 500));

  // --- Detect v1 vs v2 payload ---
  const isV2 = !!body.customer || !!body.transaction;
  const status = (body.status || "").toLowerCase();
  const rawPhone = isV2
    ? (body.customer?.phone || body.customer?.phone_number || "")
    : (body.phone_number || body.phone || "");
  const phone = normalizePhone(rawPhone);
  const phoneAlt = phoneWithout55(phone);
  const amountRaw = isV2
    ? (body.transaction?.amount || body.transaction?.price || 0)
    : (body.price || body.amount || 0);
  // Pepper sends amount as string like "19.90" (BRL), not cents
  const amountBRL = Number(amountRaw);
  const customerName = isV2
    ? (body.customer?.name || "")
    : (body.customer_name || body.name || "");
  const transactionCode = isV2
    ? (body.transaction?.code || body.transaction?.id || "")
    : (body.transaction_code || body.code || "");

  console.log(`[PEPPER-POSTBACK] status=${status} phone=${phone} phoneAlt=${phoneAlt} amount=${amountBRL} name=${customerName} tx=${transactionCode}`);

  // --- Log immediately ---
  const logEntry: any = {
    event_type: `pepper_${status || "unknown"}`,
    phone,
    payload: body,
    processed: false,
    error: null,
  };

  try {
    // --- Find conversation by phone (multi-format lookup) ---
    const conversation = await findConversation(supabase, phone, phoneAlt);

    console.log(`[PEPPER-POSTBACK] Conversation found: ${conversation?.id || "NONE"}`);

    // --- Actions based on status ---
    if (status === "paid" || status === "authorized" || status === "approved") {
      let conv = conversation;

      // Create conversation if missing (new customer who bought directly)
      if (!conv) {
        conv = await createConversation(supabase, phone, customerName);
        console.log(`[PEPPER-POSTBACK] Created new conversation: ${conv?.id}`);
      }

      if (conv) {
        // 0. Backfill ad_creative attribution if missing
        await backfillAdCreative(supabase, conv.id, phone, phoneAlt);
        // 1. Move lead to "fechado"
        await supabase
          .from("conversations")
          .update({ lead_stage: "fechado", updated_at: new Date().toISOString() })
          .eq("id", conv.id);

        // 2. Register conversion (skip if Purchase already exists for this conversation)
        const { data: existingPurchase } = await supabase
          .from("conversions")
          .select("id")
          .eq("conversation_id", conv.id)
          .eq("event_name", "Purchase")
          .limit(1)
          .maybeSingle();

        if (!existingPurchase) {
          const conversionData: any = {
            conversation_id: conv.id,
            event_name: "Purchase",
            value: amountBRL,
            currency: "BRL",
            sent_to_meta: false,
          };

          // 3. Send to Meta CAPI
          const META_PIXEL_ID = Deno.env.get("META_PIXEL_ID");
          const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN");
          if (META_PIXEL_ID && META_ACCESS_TOKEN) {
            const adAttr = conv ? await getAdAttribution(supabase, conv.id) : {};
            const metaEventId = await sendMetaConversionEvent({
              pixelId: META_PIXEL_ID,
              accessToken: META_ACCESS_TOKEN,
              eventName: "Purchase",
              value: amountBRL,
              currency: "BRL",
              phone,
              ...adAttr,
            });
            if (metaEventId) {
              conversionData.sent_to_meta = true;
              conversionData.meta_event_id = metaEventId;
            }
          }

          await supabase.from("conversions").insert(conversionData);
          console.log(`[PEPPER-POSTBACK] Purchase registered for ${conv.id}`);
        } else {
          console.log(`[PEPPER-POSTBACK] Purchase already exists for ${conv.id}, skipping duplicate`);
        }

        // 4. Increment A/B flow stats_converted
        const flowState = conv.flow_state as any;
        if (flowState?.flow_id) {
          const { data: flow } = await supabase.from("chatbot_flows")
            .select("stats_converted").eq("id", flowState.flow_id).maybeSingle();
          if (flow) {
            await supabase.from("chatbot_flows")
              .update({ stats_converted: (flow.stats_converted || 0) + 1 })
              .eq("id", flowState.flow_id);
            console.log(`[PEPPER-POSTBACK] Incremented stats_converted for flow ${flowState.flow_id}`);
          }
        }

        // 5. Send WhatsApp confirmation
        const deliveryMsg = `🚨MagoFlix Painel Liberado🚨\n\n1️⃣ Acesse o link oficial:\n\n👉 https://magoflixobrigadoonovo.vercel.app\n\n2️⃣ Assista à aula completa com atenção — cada minuto importa.`;
        await sendWhatsApp(supabase, conv, deliveryMsg, phone);
      }
      logEntry.processed = true;

    } else if (status === "refunded" || status === "chargeback") {
      if (conversation) {
        await supabase
          .from("conversations")
          .update({ lead_stage: "proposta", updated_at: new Date().toISOString() })
          .eq("id", conversation.id);

        await supabase.from("conversions").insert({
          conversation_id: conversation.id,
          event_name: "Refund",
          value: amountBRL,
          currency: "BRL",
        });

        await sendWhatsApp(
          supabase,
          conversation,
          `⚠️ Seu pagamento de R$ ${amountBRL.toFixed(2)} foi ${status === "refunded" ? "reembolsado" : "estornado"}. Entre em contato se precisar de ajuda.`,
          phone
        );
      }
      logEntry.processed = true;

    } else if (status === "waiting_payment" || status === "pending") {
      let conv = conversation;
      if (!conv) {
        conv = await createConversation(supabase, phone, customerName, "proposta");
        console.log(`[PEPPER-POSTBACK] Created conversation for waiting_payment: ${conv?.id}`);
      }

      if (conv) {
        // Backfill ad_creative attribution if missing
        await backfillAdCreative(supabase, conv.id, phone, phoneAlt);

        // Move lead to "proposta" (checkout initiated)
        await supabase
          .from("conversations")
          .update({ lead_stage: "proposta", updated_at: new Date().toISOString() })
          .eq("id", conv.id);

        // Register InitiateCheckout conversion (skip if already exists)
        const { data: existingCheckout } = await supabase
          .from("conversions")
          .select("id")
          .eq("conversation_id", conv.id)
          .eq("event_name", "InitiateCheckout")
          .limit(1)
          .maybeSingle();

        if (!existingCheckout) {
          const conversionData: any = {
            conversation_id: conv.id,
            event_name: "InitiateCheckout",
            value: amountBRL,
            currency: "BRL",
            sent_to_meta: false,
          };

          // Send to Meta CAPI
          const META_PIXEL_ID2 = Deno.env.get("META_PIXEL_ID");
          const META_ACCESS_TOKEN2 = Deno.env.get("META_ACCESS_TOKEN");
          if (META_PIXEL_ID2 && META_ACCESS_TOKEN2) {
            const adAttr2 = conv ? await getAdAttribution(supabase, conv.id) : {};
            const metaEventId = await sendMetaConversionEvent({
              pixelId: META_PIXEL_ID2,
              accessToken: META_ACCESS_TOKEN2,
              eventName: "InitiateCheckout",
              value: amountBRL,
              currency: "BRL",
              phone,
              ...adAttr2,
            });
            if (metaEventId) {
              conversionData.sent_to_meta = true;
              conversionData.meta_event_id = metaEventId;
            }
          }

          await supabase.from("conversions").insert(conversionData);
          console.log(`[PEPPER-POSTBACK] InitiateCheckout registered for ${conv.id}`);
        } else {
          console.log(`[PEPPER-POSTBACK] InitiateCheckout already exists for ${conv.id}, skipping`);
        }

        // Increment A/B flow stats_qualified
        const flowState2 = conv.flow_state as any;
        if (flowState2?.flow_id) {
          const { data: flow2 } = await supabase.from("chatbot_flows")
            .select("stats_qualified").eq("id", flowState2.flow_id).maybeSingle();
          if (flow2) {
            await supabase.from("chatbot_flows")
              .update({ stats_qualified: (flow2.stats_qualified || 0) + 1 })
              .eq("id", flowState2.flow_id);
            console.log(`[PEPPER-POSTBACK] Incremented stats_qualified for flow ${flowState2.flow_id}`);
          }
        }

        // NOTE: WhatsApp notification removed — PIX is now handled exclusively by generate_pix_manual via AI
        console.log(`[PEPPER-POSTBACK] waiting_payment: skipping WhatsApp auto-message (PIX manual mode)`);
      }
      logEntry.processed = true;

    } else if (status === "refused" || status === "cancelled" || status === "expired") {
      let conv = conversation;
      if (!conv) {
        conv = await createConversation(supabase, phone, customerName, "novo");
        console.log(`[PEPPER-POSTBACK] Created conversation for ${status}: ${conv?.id}`);
      }
      if (conv) {
        await sendWhatsApp(
          supabase,
          conv,
          `❌ Seu pagamento não foi aprovado (${status}). Posso gerar um novo link se quiser tentar novamente!`,
          phone
        );
      }
      logEntry.processed = true;

    } else {
      console.log(`[PEPPER-POSTBACK] Unknown status: ${status}`);
      logEntry.processed = true;
    }

  } catch (err) {
    console.error("[PEPPER-POSTBACK] Error:", err);
    logEntry.error = String(err);
  }

  // Save log
  await supabase.from("webhook_logs").insert(logEntry);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// --- Multi-format conversation lookup ---
async function findConversation(supabase: any, phone: string, phoneAlt: string): Promise<any> {
  if (!phone) return null;

  // 1. Exact match with 55 prefix
  const { data: exact1 } = await supabase
    .from("conversations")
    .select("*")
    .eq("contact_phone", phone)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  if (exact1) return exact1;

  // 2. Exact match without 55 prefix
  if (phoneAlt !== phone) {
    const { data: exact2 } = await supabase
      .from("conversations")
      .select("*")
      .eq("contact_phone", phoneAlt)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();
    if (exact2) return exact2;
  }

  // 3. Fuzzy match by last 8 digits
  const suffix = phone.slice(-8);
  const { data: fuzzy } = await supabase
    .from("conversations")
    .select("*")
    .like("contact_phone", `%${suffix}`)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (fuzzy && fuzzy.length > 0) return fuzzy[0];

  return null;
}

// --- Create conversation for new buyers ---
async function createConversation(supabase: any, phone: string, name: string, leadStage = "fechado"): Promise<any> {
  // Get first available instance
  const { data: instances } = await supabase
    .from("instances")
    .select("id")
    .eq("enabled", true)
    .limit(1);
  const instanceId = instances?.[0]?.id || null;

  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({
      contact_name: name || "Cliente Pepper",
      contact_phone: phone,
      lead_stage: leadStage,
      channel: "whatsapp",
      instance_id: instanceId,
    })
    .select()
    .single();

  if (error) {
    console.error("[PEPPER-POSTBACK] Error creating conversation:", error);
    return null;
  }
  return conv;
}

// --- Backfill ad_creative attribution for orphan conversations ---
async function backfillAdCreative(supabase: any, conversationId: string, phone: string, phoneAlt: string) {
  try {
    // 1. Check if this conversation already has an ad_creative
    const { data: existing } = await supabase
      .from("ad_creatives")
      .select("id")
      .eq("conversation_id", conversationId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      console.log(`[PEPPER-POSTBACK] ad_creative already exists for ${conversationId}, skip backfill`);
      return;
    }

    // 2. Find ad_creative from another conversation with the same phone
    const suffix = phone.slice(-8);
    const phonesToSearch = [phone];
    if (phoneAlt !== phone) phonesToSearch.push(phoneAlt);

    // Try exact phone matches first
    for (const p of phonesToSearch) {
      const { data: donor } = await supabase
        .from("ad_creatives")
        .select("source, track_id, track_source, raw_data, image_url, conversation_id")
        .in("conversation_id",
          supabase.from("conversations").select("id").eq("contact_phone", p)
        )
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (donor) {
        await insertBackfilledCreative(supabase, conversationId, donor);
        return;
      }
    }

    // 3. Fuzzy match by last 8 digits via raw query approach
    const { data: fuzzyConvs } = await supabase
      .from("conversations")
      .select("id")
      .like("contact_phone", `%${suffix}`)
      .neq("id", conversationId)
      .limit(10);

    if (fuzzyConvs && fuzzyConvs.length > 0) {
      const convIds = fuzzyConvs.map((c: any) => c.id);
      const { data: donor } = await supabase
        .from("ad_creatives")
        .select("source, track_id, track_source, raw_data, image_url, conversation_id")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (donor) {
        await insertBackfilledCreative(supabase, conversationId, donor);
        return;
      }
    }

    console.log(`[PEPPER-POSTBACK] No donor ad_creative found for backfill (phone=${phone})`);
  } catch (err) {
    console.error("[PEPPER-POSTBACK] backfillAdCreative error:", err);
  }
}

async function insertBackfilledCreative(supabase: any, conversationId: string, donor: any) {
  const { error } = await supabase.from("ad_creatives").insert({
    conversation_id: conversationId,
    source: donor.source,
    track_id: donor.track_id,
    track_source: donor.track_source,
    raw_data: { ...donor.raw_data, backfilled_from: donor.conversation_id },
    image_url: donor.image_url,
  });
  if (error) {
    console.error("[PEPPER-POSTBACK] backfill insert error:", error);
  } else {
    console.log(`[PEPPER-POSTBACK] ✅ Backfilled ad_creative from ${donor.conversation_id} → ${conversationId} (source=${donor.source})`);
  }
}

// --- Helper: send WhatsApp message via uazapi ---
async function sendWhatsApp(supabase: any, conversation: any, text: string, fallbackPhone?: string) {
  try {
    let subdomain = "";
    let token = "";

    // Try instance credentials first
    if (conversation?.instance_id) {
      const { data: inst } = await supabase
        .from("instances")
        .select("uazapi_subdomain, uazapi_token")
        .eq("id", conversation.instance_id)
        .single();
      if (inst) {
        subdomain = inst.uazapi_subdomain;
        token = inst.uazapi_token;
      }
    }

    // Fallback to agent_settings
    if (!subdomain || !token) {
      const { data: settings } = await supabase
        .from("agent_settings")
        .select("uazapi_subdomain, uazapi_token")
        .limit(1)
        .single();
      if (settings) {
        subdomain = settings.uazapi_subdomain;
        token = settings.uazapi_token;
      }
    }

    // Determine phone to send to
    const sendPhone = (conversation?.contact_phone || fallbackPhone || "").replace(/\D/g, "");

    if (subdomain && token && sendPhone) {
      const baseUrl = subdomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
      const resp = await fetch(`https://${baseUrl}/send/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify({ number: sendPhone, text }),
      });
      console.log(`[PEPPER-POSTBACK] WhatsApp sent to ${sendPhone}: ${resp.status}`);
    } else {
      console.log(`[PEPPER-POSTBACK] WhatsApp skip: subdomain=${!!subdomain} token=${!!token} phone=${sendPhone}`);
    }

    // Save as assistant message if conversation exists
    if (conversation?.id) {
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "assistant",
        content: text,
      });
    }
  } catch (err) {
    console.error("[PEPPER-POSTBACK] WhatsApp send error:", err);
  }
}
