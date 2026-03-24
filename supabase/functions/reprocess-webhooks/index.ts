import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendMetaConversionEvent } from "../_shared/ai-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(raw: string): string {
  let phone = (raw || "").replace(/\D/g, "");
  if (!phone.startsWith("55") && phone.length >= 10) {
    phone = "55" + phone;
  }
  if (phone.startsWith("55") && phone.length === 12) {
    phone = phone.slice(0, 4) + "9" + phone.slice(4);
  }
  return phone;
}

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

  const results: any[] = [];

  try {
    // 1. Fetch all pepper_paid webhook logs
    const { data: logs, error: logsErr } = await supabase
      .from("webhook_logs")
      .select("*")
      .in("event_type", ["pepper_paid", "pepper_approved", "pepper_authorized"])
      .order("created_at", { ascending: true });

    if (logsErr) throw logsErr;
    if (!logs || logs.length === 0) {
      return new Response(JSON.stringify({ message: "No pepper_paid logs found", results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[REPROCESS] Found ${logs.length} pepper_paid logs to check`);

    for (const log of logs) {
      const payload = log.payload as any;
      const isV2 = !!payload.customer || !!payload.transaction;

      const rawPhone = isV2
        ? (payload.customer?.phone || payload.customer?.phone_number || "")
        : (payload.phone_number || payload.phone || "");
      const phone = normalizePhone(rawPhone);
      const phoneAlt = phoneWithout55(phone);

      const amountRaw = isV2
        ? (payload.transaction?.amount || payload.transaction?.price || 0)
        : (payload.price || payload.amount || 0);
      const amountBRL = Number(amountRaw);

      const customerName = isV2
        ? (payload.customer?.name || "")
        : (payload.customer_name || payload.name || "");

      const transactionCode = isV2
        ? (payload.transaction?.code || payload.transaction?.id || "")
        : (payload.transaction_code || payload.code || "");

      // --- Filter out test data ---
      const isTest = amountBRL > 1000 
        || /^teste/i.test(customerName.trim())
        || /^cliente$/i.test(customerName.trim())
        || !phone || phone.length < 10;

      if (isTest) {
        results.push({ log_id: log.id, phone, status: "skipped", reason: "test_data", name: customerName, amount: amountBRL });
        console.log(`[REPROCESS] Skipping test: ${customerName} (${phone}) R$ ${amountBRL}`);
        continue;
      }

      console.log(`[REPROCESS] Checking log ${log.id}: phone=${phone} amount=${amountBRL} name=${customerName}`);

      // 2. Check if conversion already exists for this phone
      const existingConv = await findConversationWithConversion(supabase, phone, phoneAlt);
      if (existingConv) {
        results.push({ log_id: log.id, phone, status: "skipped", reason: "conversion_exists" });
        continue;
      }

      // 3. Find or create conversation
      let conversation = await findConversation(supabase, phone, phoneAlt);
      if (!conversation) {
        conversation = await createConversation(supabase, phone, customerName);
      }

      if (!conversation) {
        results.push({ log_id: log.id, phone, status: "error", reason: "could_not_create_conversation" });
        continue;
      }

      // 4. Update lead_stage to "fechado"
      await supabase
        .from("conversations")
        .update({ lead_stage: "fechado", updated_at: new Date().toISOString() })
        .eq("id", conversation.id);

      // 5. Insert Purchase conversion
      const conversionData: any = {
        conversation_id: conversation.id,
        event_name: "Purchase",
        value: amountBRL,
        currency: "BRL",
        sent_to_meta: false,
      };

      // 6. Send to Meta CAPI
      const META_PIXEL_ID = Deno.env.get("META_PIXEL_ID");
      const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN");
      if (META_PIXEL_ID && META_ACCESS_TOKEN) {
        const metaEventId = await sendMetaConversionEvent({
          pixelId: META_PIXEL_ID,
          accessToken: META_ACCESS_TOKEN,
          eventName: "Purchase",
          value: amountBRL,
          currency: "BRL",
          phone,
        });
        if (metaEventId) {
          conversionData.sent_to_meta = true;
          conversionData.meta_event_id = metaEventId;
        }
      }

      await supabase.from("conversions").insert(conversionData);

      // 7. Send WhatsApp delivery message
      const deliveryMsg = `🚨MagoFlix Painel Liberado🚨\n\n1️⃣ Acesse o link oficial:\n\n👉 https://magoflixobrigadoonovo.vercel.app\n\n2️⃣ Assista à aula completa com atenção — cada minuto importa.`;
      await sendWhatsApp(supabase, conversation, deliveryMsg, phone);

      // 8. Mark webhook_log as processed
      await supabase
        .from("webhook_logs")
        .update({ processed: true, error: null })
        .eq("id", log.id);

      results.push({
        log_id: log.id,
        phone,
        name: customerName,
        amount: amountBRL,
        conversation_id: conversation.id,
        status: "reprocessed",
      });

      console.log(`[REPROCESS] ✅ Reprocessed: ${customerName} (${phone}) R$ ${amountBRL}`);
    }

  } catch (err) {
    console.error("[REPROCESS] Error:", err);
    return new Response(JSON.stringify({ error: String(err), results }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    message: `Reprocessed ${results.filter(r => r.status === "reprocessed").length} of ${results.length} logs`,
    results,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// Check if a conversion already exists for this phone
async function findConversationWithConversion(supabase: any, phone: string, phoneAlt: string): Promise<boolean> {
  // Find conversations matching the phone
  const conv = await findConversation(supabase, phone, phoneAlt);
  if (!conv) return false;

  // Check if Purchase conversion exists for this conversation
  const { data: conversions } = await supabase
    .from("conversions")
    .select("id")
    .eq("conversation_id", conv.id)
    .eq("event_name", "Purchase")
    .limit(1);

  return conversions && conversions.length > 0;
}

async function findConversation(supabase: any, phone: string, phoneAlt: string): Promise<any> {
  if (!phone) return null;

  const { data: exact1 } = await supabase
    .from("conversations")
    .select("*")
    .eq("contact_phone", phone)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  if (exact1) return exact1;

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

async function createConversation(supabase: any, phone: string, name: string): Promise<any> {
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
      lead_stage: "fechado",
      channel: "whatsapp",
      instance_id: instanceId,
    })
    .select()
    .single();

  if (error) {
    console.error("[REPROCESS] Error creating conversation:", error);
    return null;
  }
  return conv;
}

async function sendWhatsApp(supabase: any, conversation: any, text: string, fallbackPhone?: string) {
  try {
    let subdomain = "";
    let token = "";

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

    const sendPhone = (conversation?.contact_phone || fallbackPhone || "").replace(/\D/g, "");

    if (subdomain && token && sendPhone) {
      const baseUrl = subdomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
      const resp = await fetch(`https://${baseUrl}/send/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify({ number: sendPhone, text }),
      });
      console.log(`[REPROCESS] WhatsApp sent to ${sendPhone}: ${resp.status}`);
    } else {
      console.log(`[REPROCESS] WhatsApp skip: subdomain=${!!subdomain} token=${!!token} phone=${sendPhone}`);
    }

    if (conversation?.id) {
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "assistant",
        content: text,
      });
    }
  } catch (err) {
    console.error("[REPROCESS] WhatsApp send error:", err);
  }
}
