import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isBotEcho,
  buildSystemPrompt, buildAgentSystemPrompt, filterMessageHistory, summarizeOlderMessages, callOpenAI, callOpenAIWithToolResults,
  buildFunnelTools, sendMetaConversionEvent, getAdAttribution,
} from "../_shared/ai-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- FAQ/Intent/Evasive logic imported from _shared/ai-engine.ts ---

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isWithinBusinessHours(settings: any): boolean {
  if (!settings.business_hours_enabled) return true;
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: settings.business_hours_timezone || "America/Sao_Paulo",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parts.find((p: any) => p.type === "hour")?.value || "00";
    const minute = parts.find((p: any) => p.type === "minute")?.value || "00";
    const currentTime = `${hour}:${minute}`;
    return currentTime >= settings.business_hours_start && currentTime <= settings.business_hours_end;
  } catch {
    return true;
  }
}

// --- Media helpers ---

interface MediaInfo {
  url: string;
  mimetype: string;
  caption: string;
  filename: string;
}

function deriveMimeType(waMessageType: string): string {
  switch (waMessageType) {
    case "ImageMessage": return "image/jpeg";
    case "AudioMessage":
    case "PttMessage": return "audio/ogg";
    case "VideoMessage": return "video/mp4";
    case "DocumentMessage": return "application/pdf";
    default: return "";
  }
}

function extractMedia(message: any, chat?: any): MediaInfo | null {
  const contentUrl = (typeof message?.content === "object" && message?.content?.URL) ? message.content.URL : "";
  const url = message?.media || message?.mediaUrl || message?.mediaurl || contentUrl;
  let mimetype = message?.mimetype || message?.mediaType || "";
  if (chat?.wa_lastMessageType) {
    const derived = deriveMimeType(chat.wa_lastMessageType);
    if (derived && (!mimetype || getMediaCategory(mimetype) !== getMediaCategory(derived))) {
      mimetype = derived;
    }
  }
  if (!url && !mimetype) return null;
  return {
    url,
    mimetype,
    caption: message?.caption || "",
    filename: message?.filename || "",
  };
}

function getMediaCategory(mimetype: string): "image" | "audio" | "video" | "document" {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("audio/")) return "audio";
  if (mimetype.startsWith("video/")) return "video";
  return "document";
}

function buildReadableDescription(media: MediaInfo, text: string): string {
  const cat = getMediaCategory(media.mimetype);
  const labels: Record<string, string> = {
    image: "Imagem",
    audio: "Áudio",
    video: "Vídeo",
    document: "Documento",
  };
  const label = labels[cat] || "Arquivo";
  const fname = media.filename ? ` (${media.filename})` : "";
  const caption = media.caption || text;
  return caption
    ? `[${label} recebido${fname}] ${caption}`
    : `[${label} recebido${fname}]`;
}

async function transcribeAudio(base64: string, mimetype: string): Promise<string> {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set for transcription");

  const byteCharacters = atob(base64);
  const byteNumbers = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const blob = new Blob([byteNumbers], { type: mimetype });
  const ext = mimetype.includes("ogg") ? "ogg" : mimetype.split("/")[1] || "mp3";
  const file = new File([blob], `audio.${ext}`, { type: mimetype });

  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", "whisper-1");
  formData.append("language", "pt");

  console.log("[WEBHOOK] Transcribing audio via Whisper, size:", base64.length, "mimetype:", mimetype);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[WEBHOOK] Whisper API Error:", response.status, errorBody.slice(0, 300));
    throw new Error(`Whisper API error ${response.status}`);
  }

  const data = await response.json();
  const transcribedText = data.text || "";
  console.log("[WEBHOOK] Whisper transcription:", transcribedText?.slice(0, 100));
  
  // Estimate Whisper cost: ~$0.006/min, estimate ~15sec per audio avg
  // We'll track it in token_usage with usage_type 'audio' later
  return transcribedText;
}

async function fetchAsBase64(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch media: ${resp.status}`);

  // Validate response is actually media, not an HTML error page
  const contentType = resp.headers.get("content-type") || "";
  if (contentType.includes("text/html") || contentType.includes("text/plain")) {
    throw new Error(`Got ${contentType} instead of media`);
  }

  const buf = await resp.arrayBuffer();
  // Validate minimum size (real media > 1KB)
  if (buf.byteLength < 1024) {
    throw new Error(`Response too small (${buf.byteLength} bytes), likely not real media`);
  }

  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function downloadMediaViaUazapi(
  uazapiBase: string,
  token: string,
  messageId: string
): Promise<string> {
  console.log("[WEBHOOK] Trying uazapi /message/download, messageId:", messageId);

  const resp = await fetch(`https://${uazapiBase}/message/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({ id: messageId, return_base64: true }),
  });

  console.log("[WEBHOOK] /message/download status:", resp.status);

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("[WEBHOOK] /message/download error:", resp.status, errText.slice(0, 300));
    throw new Error(`/message/download error: ${resp.status}`);
  }

  const data = await resp.json();
  console.log("[WEBHOOK] /message/download response keys:", Object.keys(data));
  const b64 = data.base64Data || "";

  if (!b64) {
    console.log("[WEBHOOK] /message/download returned empty base64Data");
    throw new Error("Empty base64Data from /message/download");
  }

  // Validate base64 is not HTML
  try {
    const decoded = atob(b64.slice(0, 100));
    if (decoded.includes("<html") || decoded.includes("<!DOCTYPE")) {
      throw new Error("Downloaded content is HTML, not media");
    }
  } catch (_) { /* ignore decode errors */ }

  console.log("[WEBHOOK] Download success, base64 length:", b64.length);
  return b64;
}

// Download media: try uazapi first, then direct URL
async function downloadMediaBase64(
  media: MediaInfo,
  uazapiBase?: string | null,
  token?: string | null,
  messageId?: string | null
): Promise<string> {
  let b64 = "";
  if (uazapiBase && token && messageId) {
    try {
      b64 = await downloadMediaViaUazapi(uazapiBase, token, messageId);
    } catch (e) {
      console.warn("[WEBHOOK] uazapi getMedia failed, trying direct URL:", e);
    }
  }
  if (!b64 && media.url) {
    try {
      b64 = await fetchAsBase64(media.url);
    } catch (e) {
      console.warn("[WEBHOOK] Direct download also failed:", e);
    }
  }
  return b64;
}

// Upload base64 media to storage bucket, returns public URL or null
async function uploadMediaToStorage(
  supabaseClient: any,
  base64: string,
  conversationId: string,
  mimetype: string
): Promise<string | null> {
  try {
    const byteCharacters = atob(base64);
    const byteNumbers = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const extMap: Record<string, string> = {
      "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
      "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
      "video/mp4": "mp4", "application/pdf": "pdf",
    };
    const ext = extMap[mimetype] || mimetype.split("/")[1] || "bin";
    const path = `${conversationId}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;

    const { error } = await supabaseClient.storage
      .from("chat-media")
      .upload(path, byteNumbers, { contentType: mimetype, upsert: false });

    if (error) {
      console.error("[WEBHOOK] Storage upload error:", error);
      return null;
    }

    const { data: urlData } = supabaseClient.storage
      .from("chat-media")
      .getPublicUrl(path);

    console.log("[WEBHOOK] Media uploaded to storage:", urlData?.publicUrl?.slice(0, 100));
    return urlData?.publicUrl || null;
  } catch (err) {
    console.error("[WEBHOOK] uploadMediaToStorage error:", err);
    return null;
  }
}

async function buildMultimodalContent(
  media: MediaInfo,
  text: string,
  preDownloadedBase64?: string
): Promise<any[]> {
  const cat = getMediaCategory(media.mimetype);
  const parts: any[] = [];

  const catLabels: Record<string, string> = {
    image: "uma imagem",
    audio: "um áudio",
    video: "um vídeo",
    document: "um documento",
  };

  const fallbackText = `[O cliente enviou ${catLabels[cat]}. Você não consegue visualizar este tipo de conteúdo. Responda de forma natural, informe que não pode ver ${catLabels[cat]} e peça para o cliente descrever o que precisa ou enviar como texto.]`;

  if (cat === "document") {
    const b64Doc = preDownloadedBase64 || "";
    if (b64Doc) {
      const dataUri = `data:${media.mimetype};base64,${b64Doc}`;
      parts.push({ type: "image_url", image_url: { url: dataUri } });
    } else {
      parts.push({ type: "text", text: fallbackText });
    }
  } else {
    const b64 = preDownloadedBase64 || "";
    if (b64) {
      if (cat === "image") {
        const dataUri = `data:${media.mimetype};base64,${b64}`;
        parts.push({ type: "image_url", image_url: { url: dataUri } });
      } else if (cat === "audio") {
        try {
          const transcription = await transcribeAudio(b64, media.mimetype);
          if (transcription) {
            parts.push({ type: "text", text: `[Áudio transcrito do cliente]: ${transcription}` });
          } else {
            parts.push({ type: "text", text: "[O cliente enviou um áudio que não foi possível transcrever. Peça para ele enviar como texto.]" });
          }
        } catch (err) {
          console.error("[WEBHOOK] Audio transcription failed:", err);
          parts.push({ type: "text", text: "[O cliente enviou um áudio que não foi possível transcrever. Peça para ele enviar como texto.]" });
        }
      } else if (cat === "video") {
        const dataUri = `data:${media.mimetype};base64,${b64}`;
        parts.push({ type: "image_url", image_url: { url: dataUri } });
      }
    } else {
      console.log("[WEBHOOK] Media download failed for", cat, "- using text fallback");
      parts.push({ type: "text", text: fallbackText });
      const userText = media.caption || text;
      if (userText) parts.push({ type: "text", text: userText });
      return parts;
    }
  }

  const userText = media.caption || text;
  const defaultPrompts: Record<string, string> = {
    image: "O cliente enviou esta imagem. Analise e responda de acordo com o contexto da conversa.",
    audio: "O cliente enviou este áudio. Escute e responda de acordo com o contexto da conversa.",
    video: "O cliente enviou este vídeo. Analise e responda de acordo com o contexto da conversa.",
    document: "",
  };
  parts.push({ type: "text", text: userText || defaultPrompts[cat] });

  return parts;
}

// --- Deduplication cache ---
const processedIds = new Set<string>();
const MAX_CACHE = 500;

// --- Main handler ---

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let webhookLogId: string | null = null;
  let logSupabase: any = null;

  try {
    const body = await req.json();
    console.log("[WEBHOOK] Received:", JSON.stringify(body).slice(0, 2000));

    // --- Save raw payload to webhook_logs BEFORE any processing ---
    try {
      logSupabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const url = new URL(req.url);
      const instId = url.searchParams.get("instance_id");
      const rawPhone = body?.message?.chatid || body?.data?.sender || body?.sender || "";
      const evtType = (body?.EventType || body?.event || "messages").toString().toLowerCase();
      const { data: logRow } = await logSupabase.from("webhook_logs").insert({
        instance_id: instId || null,
        event_type: evtType,
        phone: rawPhone.replace(/@.*$/, "").replace(/\D/g, ""),
        payload: body,
      }).select("id").single();
      if (logRow) webhookLogId = logRow.id;
      console.log("[WEBHOOK] Payload saved to webhook_logs:", webhookLogId);
    } catch (logErr) {
      console.warn("[WEBHOOK] Failed to save webhook_log:", logErr);
    }

    // Flexible parsing
    let eventType: string | undefined;
    let data: any;
    let rawMessage: any = null;

    if (body.EventType) {
      eventType = body.EventType.toLowerCase();
      rawMessage = body.message;
      // Robust text extraction with full fallback chain
      const rawContent = body.message?.content;
      let textContent = "";
      if (typeof rawContent === "string") {
        textContent = rawContent;
      } else if (rawContent && typeof rawContent === "object" && typeof rawContent.text === "string") {
        textContent = rawContent.text;
      }
      if (!textContent && typeof body.message?.text === "string") {
        textContent = body.message.text;
      }
      if (!textContent && typeof body.message?.caption === "string") {
        textContent = body.message.caption;
      }
      // Detect Undecryptable messages and replace with a clearer marker for the AI
      if (textContent && /\[?\s*Undecryptable\s*\]?/i.test(textContent)) {
        console.log(`[WEBHOOK] Undecryptable message detected, replacing with clear marker`);
        textContent = "[Mensagem de texto do cliente não pôde ser lida (criptografia). Responda normalmente perguntando o que ele precisa.]";
      }

      const textSource = textContent ? (typeof rawContent === "string" ? "content_string" : rawContent?.text ? "content.text" : body.message?.text ? "message.text" : "caption") : "none";
      console.log(`[WEBHOOK] Text extraction: source=${textSource} text="${textContent.substring(0, 80)}"`);
      data = {
        fromMe: body.message?.fromMe,
        sender: body.message?.chatid || "",
        senderName: body.chat?.name || body.chat?.wa_name || "",
        text: textContent,
      };
    } else if (body.event) {
      eventType = body.event;
      data = body.data;
      rawMessage = body.data;
    } else if (body.fromMe !== undefined || body.sender || body.text) {
      eventType = "messages";
      data = body;
      rawMessage = body;
    } else {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "unknown format" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Handle group participant events (join/leave) ---
    const isGroupEvent =
      eventType === "groupparticipantsupdate" ||
      eventType === "group-participants.update" ||
      eventType === "group.participant_update";

    if (isGroupEvent) {
      const groupJid = data?.chatid || data?.id || rawMessage?.chatid || rawMessage?.id || "";
      const action = data?.action || rawMessage?.action || "";
      const participants = data?.participants || rawMessage?.participants || [];
      const count = Array.isArray(participants) ? participants.length : 1;
      const isJoin = ["add", "join"].includes(action);
      const isLeave = ["remove", "leave"].includes(action);

      console.log("[WEBHOOK] Group event detected:", { groupJid, action, participants, isJoin, isLeave });

      if (groupJid && (isJoin || isLeave)) {
        const supa = logSupabase || createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        const { data: group } = await supa
          .from("groups")
          .select("id, members_joined, members_left")
          .eq("wa_group_id", groupJid)
          .maybeSingle();

        if (group) {
          const updateField = isJoin ? "members_joined" : "members_left";
          const currentVal = (group as any)[updateField] || 0;
          await supa
            .from("groups")
            .update({ [updateField]: currentVal + count })
            .eq("id", group.id);

          const eventRows = (Array.isArray(participants) ? participants : [participants])
            .map((p: any) => ({
              group_id: group.id,
              phone: String(p).replace(/@.*$/, "").replace(/\D/g, ""),
              event_type: isJoin ? "join" : "leave",
            }));
          await supa.from("group_events").insert(eventRows);

          console.log("[WEBHOOK] Group counters updated:", updateField, "+", count, "for group", group.id);
        } else {
          console.log("[WEBHOOK] Group not found for JID:", groupJid);
        }
      }

      if (webhookLogId && logSupabase) {
        await logSupabase.from("webhook_logs").update({ processed: true }).eq("id", webhookLogId);
      }

      return new Response(JSON.stringify({ ok: true, group_event: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (eventType !== "messages") {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "not a messages event" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Robust bot echo detection ---
    const echoCheck = isBotEcho(rawMessage, body.chat);
    if (!data || echoCheck.isEcho) {
      const skipReason = !data ? "no data" : echoCheck.reason;
      console.log(`[WEBHOOK] Skipped: ${skipReason}, messageId: ${rawMessage?.id || rawMessage?.messageid || "unknown"}`);
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: skipReason }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract core fields from parsed data
    const text = data?.text || "";
    const senderName = data?.senderName || "";
    const senderRaw = data?.sender || rawMessage?.chatid || rawMessage?.from || "";
    const cleanPhone = senderRaw.replace(/@.*$/, "").replace(/\D/g, "");

    // --- GROUP MESSAGE HANDLING ---
    if (senderRaw.endsWith("@g.us")) {
      const groupJid = senderRaw;
      const participantJid = rawMessage?.participant || "";
      const participantPhone = participantJid.replace(/@.*$/, "").replace(/\D/g, "");

      console.log("[WEBHOOK] Group message detected:", { groupJid, participantPhone, text: text?.slice(0, 80) });

      // Skip if no participant info (system messages)
      if (!participantPhone) {
        console.log("[WEBHOOK] Skipping group message: no participant phone");
        if (webhookLogId && logSupabase) {
          await logSupabase.from("webhook_logs").update({ processed: true }).eq("id", webhookLogId);
        }
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "group_no_participant" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if message is from the bot itself (participant is one of our instances)
      const BOT_JIDS = ["553284201914", "553287060092", "551151993041"];
      if (BOT_JIDS.some(bj => participantPhone.includes(bj))) {
        console.log("[WEBHOOK] Skipping group message: from bot itself");
        if (webhookLogId && logSupabase) {
          await logSupabase.from("webhook_logs").update({ processed: true }).eq("id", webhookLogId);
        }
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "group_bot_echo" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseGroup = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Lookup group with instance
      const { data: group } = await supabaseGroup
        .from("groups")
        .select("*, instances(*)")
        .eq("wa_group_id", groupJid)
        .eq("enabled", true)
        .maybeSingle();

      if (!group || !group.agent_id) {
        console.log("[WEBHOOK] Skipping group message: group not found, not enabled, or no agent_id");
        if (webhookLogId && logSupabase) {
          await logSupabase.from("webhook_logs").update({ processed: true }).eq("id", webhookLogId);
        }
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "group_not_configured" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check respond_mode
      const respondMode = group.respond_mode || "all";
      if (respondMode === "send_only" || respondMode === "none") {
        console.log("[WEBHOOK] Skipping group message: respond_mode =", respondMode);
        if (webhookLogId && logSupabase) {
          await logSupabase.from("webhook_logs").update({ processed: true }).eq("id", webhookLogId);
        }
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "group_respond_mode" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If respond_mode = "mention", check if bot was mentioned
      if (respondMode === "mention") {
        const mentionedJids = rawMessage?.mentionedJids || rawMessage?.contextInfo?.mentionedJid || [];
        const textLower = (text || "").toLowerCase();
        const isMentioned = Array.isArray(mentionedJids) && mentionedJids.some((jid: string) =>
          BOT_JIDS.some(ij => jid.includes(ij))
        );

        if (!isMentioned) {
          console.log("[WEBHOOK] Skipping group message: mention mode but bot not mentioned");
          if (webhookLogId && logSupabase) {
            await logSupabase.from("webhook_logs").update({ processed: true }).eq("id", webhookLogId);
          }
          return new Response(JSON.stringify({ ok: true, skipped: true, reason: "group_not_mentioned" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Skip if no text and no media
      const groupMedia = extractMedia(rawMessage, body.chat);
      if (!text && !groupMedia) {
        console.log("[WEBHOOK] Skipping group message: no content");
        if (webhookLogId && logSupabase) {
          await logSupabase.from("webhook_logs").update({ processed: true }).eq("id", webhookLogId);
        }
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "group_no_content" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Dedup by messageId
      const groupMessageId = rawMessage?.id || rawMessage?.messageid || rawMessage?.Id || "";
      if (groupMessageId) {
        if (processedIds.has(groupMessageId)) {
          return new Response(JSON.stringify({ ok: true, skipped: true, reason: "group_duplicate_inmemory" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        processedIds.add(groupMessageId);
        if (processedIds.size > MAX_CACHE) {
          const first = processedIds.values().next().value;
          if (first) processedIds.delete(first);
        }
      }

      // Get instance credentials
      const groupInstance = group.instances;
      if (!groupInstance) {
        console.log("[WEBHOOK] Skipping group message: no instance linked");
        if (webhookLogId && logSupabase) {
          await logSupabase.from("webhook_logs").update({ processed: true }).eq("id", webhookLogId);
        }
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "group_no_instance" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const groupUazapiBase = (groupInstance.uazapi_subdomain || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
      const groupToken = groupInstance.uazapi_token || "";

      // Find or create conversation for this group
      let { data: groupConv } = await supabaseGroup
        .from("conversations")
        .select("*")
        .eq("contact_phone", groupJid)
        .eq("channel", "whatsapp_group")
        .maybeSingle();

      if (!groupConv) {
        const { data: newGroupConv, error: gcErr } = await supabaseGroup
          .from("conversations")
          .insert({
            contact_name: group.name || groupJid,
            contact_phone: groupJid,
            channel: "whatsapp_group",
            status: "active",
            lead_stage: "novo",
            instance_id: groupInstance.id,
            ai_enabled: true,
          })
          .select()
          .single();
        if (gcErr) {
          console.error("[WEBHOOK] Failed to create group conversation:", gcErr);
          return new Response(JSON.stringify({ error: gcErr.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        groupConv = newGroupConv;
      }

      // Process media (audio transcription)
      let groupSavedContent = text || "";
      let groupMediaBase64: string | null = null;

      if (groupMedia) {
        if (groupUazapiBase && groupToken && groupMessageId) {
          try {
            groupMediaBase64 = await downloadMediaViaUazapi(groupUazapiBase, groupToken, groupMessageId);
          } catch (e) {
            console.warn("[WEBHOOK] Group media download failed:", e);
          }
        }

        // Transcribe audio
        if (getMediaCategory(groupMedia.mimetype) === "audio" && groupMediaBase64) {
          try {
            const transcription = await transcribeAudio(groupMediaBase64, groupMedia.mimetype);
            if (transcription) {
              groupSavedContent = `[Áudio transcrito]: ${transcription}`;
            }
          } catch (e) {
            console.warn("[WEBHOOK] Group audio transcription failed:", e);
          }
        }

        if (!groupSavedContent) {
          groupSavedContent = buildReadableDescription(groupMedia, text);
        }
      }

      if (!groupSavedContent) {
        groupSavedContent = "[mensagem sem conteúdo]";
      }

      // DB-level dedup
      if (groupMessageId) {
        const { data: existingByExtId } = await supabaseGroup
          .from("messages")
          .select("id")
          .eq("external_id", groupMessageId)
          .limit(1);
        if (existingByExtId && existingByExtId.length > 0) {
          return new Response(JSON.stringify({ ok: true, skipped: true, reason: "group_duplicate_external_id" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Save user message (include participant name for context)
      const participantName = rawMessage?.pushName || rawMessage?.verifiedBizName || senderName || participantPhone;
      const contentWithSender = `[${participantName}]: ${groupSavedContent}`;

      const { data: insertedGroupMsg } = await supabaseGroup.from("messages").insert({
        conversation_id: groupConv.id,
        role: "user",
        content: contentWithSender,
        external_id: groupMessageId || null,
      }).select("id, created_at").single();

      // Debounce (8 seconds)
      const GROUP_DEBOUNCE = 8;
      if (insertedGroupMsg) {
        console.log(`[WEBHOOK] Group debounce: waiting ${GROUP_DEBOUNCE}s`);
        await sleep(GROUP_DEBOUNCE * 1000);

        const { data: newerGroupMsgs } = await supabaseGroup
          .from("messages")
          .select("id")
          .eq("conversation_id", groupConv.id)
          .eq("role", "user")
          .gt("created_at", insertedGroupMsg.created_at)
          .limit(1);

        if (newerGroupMsgs && newerGroupMsgs.length > 0) {
          console.log("[WEBHOOK] Group debounce: newer message found, skipping AI");
          return new Response(JSON.stringify({ ok: true, skipped: true, reason: "group_debounce" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Check if AI is enabled for this group conversation
      if (groupConv.ai_enabled === false) {
        console.log("[WEBHOOK] AI disabled for group conversation", groupConv.id);
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "group_ai_disabled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Load agent
      const { data: groupAgent } = await supabaseGroup
        .from("agents")
        .select("*")
        .eq("id", group.agent_id)
        .single();

      if (!groupAgent) {
        console.error("[WEBHOOK] Group agent not found:", group.agent_id);
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "group_agent_not_found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Load knowledge + documents for agent
      let groupKnowledge = "";
      let groupDocs = "";

      const { data: knowledgeLinks } = await supabaseGroup
        .from("agent_knowledge")
        .select("knowledge_entry_id")
        .eq("agent_id", group.agent_id);

      if (knowledgeLinks?.length) {
        const entryIds = knowledgeLinks.map((l: any) => l.knowledge_entry_id);
        const { data: entries } = await supabaseGroup
          .from("knowledge_entries")
          .select("question, answer")
          .in("id", entryIds);
        if (entries?.length) {
          groupKnowledge = entries.map((e: any) => `P: ${e.question}\nR: ${e.answer}`).join("\n\n");
        }
      }

      const { data: agentDocs } = await supabaseGroup
        .from("knowledge_documents")
        .select("file_name, extracted_text")
        .eq("agent_id", group.agent_id)
        .eq("status", "processed");

      if (agentDocs?.length) {
        groupDocs = agentDocs
          .filter((d: any) => d.extracted_text)
          .map((d: any) => `[${d.file_name}]\n${d.extracted_text}`)
          .join("\n\n");
      }

      // Build system prompt (NO payment tools for groups)
      const groupSystemPrompt = buildAgentSystemPrompt(groupAgent, groupKnowledge, groupDocs) +
        "\n\nREGRA DE GRUPO: Você está respondendo em um grupo do WhatsApp. NUNCA gere pagamentos, PIX, links de compra ou qualquer informação financeira sensível em grupo. Se o cliente pedir para comprar, oriente-o a chamar no privado. As mensagens dos usuários vêm no formato [Nome]: mensagem. Responda naturalmente sem repetir o nome do remetente.";

      // Get message history
      const contextLimit = groupAgent.context_limit || 20;
      const { data: groupHistory } = await supabaseGroup
        .from("messages")
        .select("role, content")
        .eq("conversation_id", groupConv.id)
        .order("created_at", { ascending: false })
        .limit(contextLimit);

      const groupChatMessages: any[] = (groupHistory || []).reverse().map((m: any) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
      }));

      // Inject multimodal content for images
      if (groupMedia && groupMediaBase64 && getMediaCategory(groupMedia.mimetype) === "image") {
        const multimodalContent = await buildMultimodalContent(groupMedia, text, groupMediaBase64);
        const lastUserIdx = groupChatMessages.map((m: any) => m.role).lastIndexOf("user");
        if (lastUserIdx >= 0) {
          groupChatMessages[lastUserIdx].content = multimodalContent;
        }
      }

      // Call AI (NO tools - no payment functions in groups)
      const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
      if (!OPENAI_API_KEY) {
        console.error("[WEBHOOK] OPENAI_API_KEY not set for group response");
        return new Response(JSON.stringify({ error: "OPENAI_API_KEY not set" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const hasGroupDocument = !!(groupMedia && (getMediaCategory(groupMedia.mimetype) === "document" || getMediaCategory(groupMedia.mimetype) === "image"));

      let { reply: groupReply, usage: groupUsage, model: groupModel } = await callOpenAI({
        systemPrompt: groupSystemPrompt,
        messages: groupChatMessages,
        apiKey: OPENAI_API_KEY,
        hasDocument: hasGroupDocument,
        tools: [], // NO tools in group context
        agentModel: groupAgent.ai_model || null,
        temperature: groupAgent.temperature ?? null,
        maxTokens: groupAgent.max_tokens || null,
      });

      if (!groupReply || groupReply.trim() === "") {
        groupReply = "Desculpe, não consegui processar sua mensagem. Pode repetir?";
      }

      console.log(`[WEBHOOK] Group AI reply: "${groupReply.slice(0, 120)}"`);

      // Save AI response
      await supabaseGroup.from("messages").insert({
        conversation_id: groupConv.id,
        role: "assistant",
        content: groupReply,
      });

      // Update conversation timestamp
      await supabaseGroup
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", groupConv.id);

      // Save token usage
      try {
        if (groupUsage) {
          const isGpt4o = groupModel === "gpt-4o";
          const costUsd = isGpt4o
            ? (groupUsage.prompt_tokens * 2.50 / 1_000_000) + (groupUsage.completion_tokens * 10.00 / 1_000_000)
            : (groupUsage.prompt_tokens * 0.15 / 1_000_000) + (groupUsage.completion_tokens * 0.60 / 1_000_000);
          await supabaseGroup.from("token_usage").insert({
            conversation_id: groupConv.id,
            prompt_tokens: groupUsage.prompt_tokens,
            completion_tokens: groupUsage.completion_tokens,
            total_tokens: groupUsage.total_tokens,
            cost_usd: costUsd,
            model: groupModel,
            usage_type: "group",
          });
        }
      } catch (e) {
        console.warn("[WEBHOOK] Failed to save group token usage:", e);
      }

      // Send response to GROUP (not individual)
      if (groupUazapiBase && groupToken) {
        // Send composing
        try {
          await fetch(`https://${groupUazapiBase}/send/composing`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: groupToken },
            body: JSON.stringify({ number: groupJid }),
          });
        } catch (_e) { /* ignore */ }

        // Typing delay
        const chars = groupReply.length;
        const typingDelay = Math.max(1500, Math.min(chars * 30, 8000));
        await sleep(typingDelay);

        // Send to group JID
        const sendResp = await fetch(`https://${groupUazapiBase}/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: groupToken },
          body: JSON.stringify({ number: groupJid, text: groupReply }),
        });
        if (!sendResp.ok) {
          console.error("[WEBHOOK] Group send error:", sendResp.status, await sendResp.text());
        } else {
          console.log("[WEBHOOK] Group reply sent successfully to:", groupJid);
        }
      }

      // Mark webhook as processed
      if (webhookLogId && logSupabase) {
        await logSupabase.from("webhook_logs").update({ processed: true }).eq("id", webhookLogId);
      }

      return new Response(JSON.stringify({ ok: true, group_reply: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const messageId = rawMessage?.id || rawMessage?.messageid || rawMessage?.Id || "";
    const media = extractMedia(rawMessage, body.chat);

    // In-memory dedup by messageId
    if (messageId) {
      if (processedIds.has(messageId)) {
        console.log("[WEBHOOK] Duplicate skipped (in-memory):", messageId);
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "duplicate_inmemory" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      processedIds.add(messageId);
      if (processedIds.size > MAX_CACHE) {
        const first = processedIds.values().next().value;
        if (first) processedIds.delete(first);
      }
    }

    // Debug logs for media troubleshooting
    console.log("[WEBHOOK] rawMessage keys:", Object.keys(rawMessage || {}));
    console.log("[WEBHOOK] messageId:", messageId, "| media:", !!media, "| mediaUrl:", media?.url?.slice(0, 80));

    // Skip only if there's no phone, AND no text AND no media
    if (!cleanPhone || (!text && !media)) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no phone or content" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 0. Extract instance_id from query string
    const url = new URL(req.url);
    const instanceId = url.searchParams.get("instance_id");

    // 1. Load instance credentials (if instance_id provided)
    let instanceCreds: { uazapi_subdomain: string; uazapi_token: string; agent_id?: string } | null = null;
    if (instanceId) {
      const { data: inst } = await supabase
        .from("instances")
        .select("uazapi_subdomain, uazapi_token, enabled, agent_id")
        .eq("id", instanceId)
        .single();
      if (!inst) {
        return new Response(JSON.stringify({ error: "Instance not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!inst.enabled) {
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "instance_disabled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      instanceCreds = { uazapi_subdomain: inst.uazapi_subdomain, uazapi_token: inst.uazapi_token, agent_id: inst.agent_id };
    }

    // 1b. Load agent settings
    const { data: settings } = await supabase
      .from("agent_settings")
      .select("*")
      .limit(1)
      .single();

    if (!settings) {
      console.error("No agent_settings found");
      return new Response(JSON.stringify({ error: "No settings" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use instance credentials if available, otherwise fall back to agent_settings
    const effectiveSubdomain = instanceCreds?.uazapi_subdomain || settings.uazapi_subdomain;
    const effectiveToken = instanceCreds?.uazapi_token || settings.uazapi_token;

    // 2. Find or create conversation
    let isNewConversation = false;
    let { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("contact_phone", cleanPhone)
      .limit(1)
      .single();

    if (!conversation) {
      isNewConversation = true;
      const insertData: any = {
        contact_name: senderName,
        contact_phone: cleanPhone,
        channel: "whatsapp",
        status: "active",
        lead_stage: "novo",
      };
      if (instanceId) insertData.instance_id = instanceId;
      const { data: newConv, error: convErr } = await supabase
        .from("conversations")
        .insert(insertData)
        .select()
        .single();
      if (convErr) throw convErr;
      conversation = newConv;
    }

    // 2a. Download and upload media if present
    let storageMediaUrl: string | null = null;
    let mediaCategory = "";
    let mediaBase64: string | null = null;

    // Clean subdomain for URL construction (remove protocol and trailing slashes)
    const uazapiBase = effectiveSubdomain
      ? effectiveSubdomain.replace(/^https?:\/\//, "").replace(/\/+$/, "")
      : null;

    if (media) {
      mediaCategory = media.mimetype?.split("/")[0] || "file";
      
      // Use the correct POST endpoint via downloadMediaViaUazapi
      if (uazapiBase && effectiveToken) {
        try {
          const base64 = await downloadMediaViaUazapi(uazapiBase, effectiveToken, messageId);
          mediaBase64 = base64;
          storageMediaUrl = await uploadMediaToStorage(
            supabase, base64, conversation.id, media.mimetype || "application/octet-stream"
          );
        } catch (e) {
          console.warn("[WEBHOOK] downloadMediaViaUazapi failed:", e);
        }
      }

      // Fallback: try direct fetch for non-encrypted URLs
      if (!mediaBase64 && media.url) {
        const urlLower = (media.url || "").toLowerCase();
        const isEncryptedUrl = urlLower.includes("mmg.whatsapp.net") || urlLower.includes(".enc");
        if (!isEncryptedUrl) {
          try {
            const base64 = await fetchAsBase64(media.url);
            mediaBase64 = base64;
            storageMediaUrl = await uploadMediaToStorage(
              supabase, base64, conversation.id, media.mimetype || "application/octet-stream"
            );
          } catch (e2) {
            console.warn("[WEBHOOK] fetchAsBase64 fallback failed:", e2);
            storageMediaUrl = media.url;
          }
        } else {
          console.warn("[WEBHOOK] Skipping encrypted WhatsApp URL as fallback:", media.url?.slice(0, 80));
        }
      }

      if (!mediaBase64 && !storageMediaUrl) {
        console.warn("[WEBHOOK] Media download failed completely, saving failure marker: [áudio recebido - não foi possível processar. Pedir ao cliente para reenviar]");
      }
      console.log("[WEBHOOK] Media processed:", { mediaCategory, hasStorageUrl: !!storageMediaUrl, hasBase64: !!mediaBase64 });
    }

    // Pre-transcribe audio before saving to DB so the transcription is persisted
    let audioTranscription = "";
    if (media && getMediaCategory(media.mimetype) === "audio" && mediaBase64) {
      try {
        audioTranscription = await transcribeAudio(mediaBase64, media.mimetype);
        console.log("[WEBHOOK] Audio pre-transcribed for DB:", audioTranscription?.slice(0, 100));
      } catch (e) {
        console.warn("[WEBHOOK] Audio pre-transcription failed, falling back to placeholder:", e);
      }
    }

    // Build savedContent: readable text for DB storage
    // For audio: use transcription if available instead of generic placeholder
    let savedContent = media ? buildReadableDescription(media, text) : text;
    if (audioTranscription) {
      savedContent = `[Áudio transcrito]: ${audioTranscription}`;
    }
    
    // When media was present but download failed completely, save a clear message
    // so the AI knows to ask the client to resend
    const mediaDownloadFailed = media && !storageMediaUrl && !mediaBase64;
    if (mediaDownloadFailed) {
      const cat = getMediaCategory(media.mimetype);
      const catLabels: Record<string, string> = { image: "imagem", audio: "áudio", video: "vídeo", document: "documento" };
      savedContent = `[${catLabels[cat] || "arquivo"} recebido - não foi possível processar. Pedir ao cliente para reenviar]`;
      console.log("[WEBHOOK] Media download failed completely, saving failure marker:", savedContent);
    }

    // 2b. Normalized ad attribution extraction
    // Extract ad signals from message content/context (must be before trackId)
    const msgContent = (typeof rawMessage?.content === "object") ? rawMessage.content : {};
    const contextInfo = msgContent?.contextInfo || {};
    const externalAdReply = contextInfo?.externalAdReply || {};
    
    const deviceSource = rawMessage?.source || ""; // android/ios/web - NOT an ad identifier
    const trackId = rawMessage?.track_id || externalAdReply?.sourceId || externalAdReply?.sourceID || "";
    const trackSource = rawMessage?.track_source || "";
    const entryPointSource = contextInfo?.entryPointConversionSource || "";
    const conversionSource = contextInfo?.conversionSource || "";
    const ctwaPayload = contextInfo?.ctwaPayload || null;
    const adTitle = msgContent?.title || externalAdReply?.title || "";
    const adBody = externalAdReply?.body || "";
    const jpegThumbnail = msgContent?.JPEGThumbnail || externalAdReply?.thumbnail || "";
    const adThumbnailUrl = externalAdReply?.originalImageURL || externalAdReply?.thumbnailUrl || externalAdReply?.mediaUrl || "";
    
    // Determine if this message has real ad signals (not just device type)
    const hasAdSignal = !!(
      trackId || trackSource ||
      entryPointSource ||
      conversionSource ||
      ctwaPayload ||
      adTitle ||
      adBody ||
      adThumbnailUrl ||
      jpegThumbnail ||
      externalAdReply?.sourceUrl
    );
    
    // Build normalized ad source (priority: entryPointSource > conversionSource > externalAdReply > trackSource)
    const normalizedAdSource = entryPointSource || conversionSource || (Object.keys(externalAdReply).length > 0 ? "externalAdReply" : "") || (trackSource ? "tracked" : "") || (ctwaPayload ? "ctwa" : "");
    // Build creative name (priority: trackSource > adTitle > entryPointSource > conversionSource > fallback)
    const creativeName = trackSource || adTitle || entryPointSource || conversionSource || "";
    
    console.log("[WEBHOOK] Ad attribution:", { deviceSource, hasAdSignal, normalizedAdSource, creativeName, trackId, trackSource, adTitle, entryPointSource, conversionSource, ctwaPayload: !!ctwaPayload });

    // 2b-upsert. Track ad creative origin (AFTER media upload)
    if (hasAdSignal) {
      let adImageUrl = "";
      if (storageMediaUrl && media?.mimetype?.startsWith("image/")) {
        adImageUrl = storageMediaUrl;
      }
      if (!adImageUrl && adThumbnailUrl) {
        adImageUrl = adThumbnailUrl;
      }
      if (!adImageUrl && jpegThumbnail) {
        try {
          const thumbUrl = await uploadMediaToStorage(supabase, jpegThumbnail, conversation.id, "image/jpeg");
          if (thumbUrl) adImageUrl = thumbUrl;
        } catch (e) {
          console.warn("[WEBHOOK] Failed to upload JPEGThumbnail:", e);
        }
      }

      await supabase.from("ad_creatives").upsert({
        conversation_id: conversation.id,
        source: normalizedAdSource || deviceSource,
        track_id: trackId,
        track_source: creativeName,
        image_url: adImageUrl || undefined,
        raw_data: {
          device_source: deviceSource,
          entry_point: entryPointSource,
          conversion_source: conversionSource || undefined,
          ctwa_payload: ctwaPayload || undefined,
          ad_title: adTitle,
          ad_body: adBody,
          track_id: trackId,
          track_source: trackSource,
          has_thumbnail: !!jpegThumbnail,
          external_ad_reply: Object.keys(externalAdReply).length > 0 ? externalAdReply : undefined,
          // Capture ctwaClid (Click-to-WhatsApp Click ID) for CAPI attribution
          ctwaClid: externalAdReply?.ctwaClid || ctwaPayload?.ctwaClid || undefined,
          ctwaClid_timestamp: (externalAdReply?.ctwaClid || ctwaPayload?.ctwaClid) ? Math.floor(Date.now() / 1000) : undefined,
          // Also capture fbclid if present in source URL
          fbclid: externalAdReply?.sourceUrl?.match?.(/fbclid=([^&]+)/)?.[1] || undefined,
          fbclid_timestamp: externalAdReply?.sourceUrl?.match?.(/fbclid=/) ? Math.floor(Date.now() / 1000) : undefined,
        },
      }, { onConflict: "conversation_id" }).then(async ({ error: adErr }) => {
        if (adErr) {
          console.error("[WEBHOOK] ad_creatives upsert error:", adErr.message);
          return;
        }
        console.log("[WEBHOOK] ad_creatives tracked:", { source: normalizedAdSource, creativeName, adImageUrl: adImageUrl?.slice(0, 80) });

        // --- Image inheritance: if no image, try to inherit from same track_source group ---
        if (!adImageUrl && creativeName) {
          try {
            const { data: donor } = await supabase
              .from("ad_creatives")
              .select("image_url")
              .eq("track_source", creativeName)
              .neq("image_url", "")
              .not("image_url", "is", null)
              .neq("conversation_id", conversation.id)
              .limit(1)
              .single();
            if (donor?.image_url) {
              await supabase.from("ad_creatives")
                .update({ image_url: donor.image_url })
                .eq("conversation_id", conversation.id);
              console.log("[WEBHOOK] Image inherited from same track_source group:", donor.image_url?.slice(0, 80));
            }
          } catch (inheritErr) {
            console.log("[WEBHOOK] No image to inherit for track_source:", creativeName);
          }
        }
      });
    }

    // 2c. Retroactive: update ad_creative image if missing (regardless of ad signal)
    if (storageMediaUrl && media?.mimetype?.startsWith("image/")) {
      const { data: existingCreative } = await supabase
        .from("ad_creatives")
        .select("id, image_url")
        .eq("conversation_id", conversation.id)
        .limit(1)
        .single();
      if (existingCreative && (!existingCreative.image_url || existingCreative.image_url === "")) {
        await supabase.from("ad_creatives")
          .update({ image_url: storageMediaUrl })
          .eq("id", existingCreative.id);
        console.log("[WEBHOOK] ad_creative image updated retroactively:", existingCreative.id);
      }
    }

    // 2d. Default Facebook attribution for new conversations without ad signals
    if (isNewConversation && !hasAdSignal) {
      const { data: existingDefault } = await supabase
        .from("ad_creatives")
        .select("id")
        .eq("conversation_id", conversation.id)
        .limit(1)
        .maybeSingle();
      
      if (!existingDefault) {
        await supabase.from("ad_creatives").insert({
          conversation_id: conversation.id,
          source: "facebook_default",
          track_source: "facebook_ads_unattributed",
          track_id: "",
          image_url: "",
          raw_data: {
            attribution_method: "default_facebook",
            reason: "encrypted_or_missing_context",
            device_source: deviceSource,
          },
        });
        console.log("[WEBHOOK] Default Facebook attribution created for new conversation:", conversation.id);
      }
    }

    // DB-level dedup: check by external_id first (most reliable)
    if (messageId) {
      const { data: existingByExtId } = await supabase
        .from("messages")
        .select("id")
        .eq("external_id", messageId)
        .limit(1);
      if (existingByExtId && existingByExtId.length > 0) {
        console.log("[WEBHOOK] Duplicate skipped (external_id):", messageId);
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "duplicate_external_id" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fallback dedup: check for identical recent message content
    const { data: recentDup } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversation.id)
      .eq("role", "user")
      .eq("content", savedContent)
      .gte("created_at", new Date(Date.now() - 30000).toISOString())
      .limit(1);

    if (recentDup && recentDup.length > 0) {
      console.log("[WEBHOOK] Duplicate skipped (db check):", messageId, "content:", savedContent.slice(0, 50));
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "duplicate_db" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: insertedMsg } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: savedContent,
      external_id: messageId || null,
      ...(storageMediaUrl ? { media_url: storageMediaUrl, media_type: mediaCategory } : {}),
    } as any).select("id, created_at").single();

    // --- PRE-LOAD agent config for debounce + context_limit ---
    let agentContextLimit = 20;
    let agentBufferSeconds = 0;
    let agentDataPreload: any = null;
    if (instanceCreds?.agent_id) {
      const { data: agentPre } = await supabase.from("agents").select("context_limit, message_buffer_seconds").eq("id", instanceCreds.agent_id).single();
      if (agentPre) {
        agentDataPreload = agentPre;
        if (agentPre.context_limit) agentContextLimit = agentPre.context_limit;
        if (agentPre.message_buffer_seconds && agentPre.message_buffer_seconds > 0) agentBufferSeconds = agentPre.message_buffer_seconds;
      }
    }

    // --- DEBOUNCE: wait before calling AI to group rapid messages ---
    const DEBOUNCE_SECONDS = agentBufferSeconds > 0 ? agentBufferSeconds : 8;
    const myMessageId = insertedMsg?.id;
    const myCreatedAt = insertedMsg?.created_at;

    if (myMessageId && myCreatedAt) {
      console.log(`[WEBHOOK] Debounce: waiting ${DEBOUNCE_SECONDS}s before AI call for message ${myMessageId}`);
      await sleep(DEBOUNCE_SECONDS * 1000);

      // Check if a newer user message arrived in this conversation
      const { data: newerMessages } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversation.id)
        .eq("role", "user")
        .gt("created_at", myCreatedAt)
        .limit(1);

      if (newerMessages && newerMessages.length > 0) {
        console.log(`[WEBHOOK] Debounce: newer message found (${newerMessages[0].id}), skipping AI for ${myMessageId}`);
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "debounce_newer_message" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log(`[WEBHOOK] Debounce: no newer message, proceeding with AI for ${myMessageId}`);
    }

    // 4. Check if AI is enabled for this conversation
    if (conversation.ai_enabled === false) {
      console.log("[WEBHOOK] AI disabled for conversation", conversation.id);
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "ai_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // uazapiBase already defined above (before media download)

    console.log("[WEBHOOK] uazapiBase:", uazapiBase, "| hasToken:", !!effectiveToken, "| messageId:", messageId, "| instanceId:", instanceId);

    // Helper to send message via uazapi
    async function sendUazapi(msgText: string) {
      if (!uazapiBase || !effectiveToken) {
        console.warn("uazapi not configured, skipping send");
        return;
      }
      const sendResp = await fetch(`https://${uazapiBase}/send/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: effectiveToken },
        body: JSON.stringify({ number: cleanPhone, text: msgText }),
      });
      if (!sendResp.ok) {
        console.error("uazapi send error:", sendResp.status, await sendResp.text());
      }
    }

    // Helper to send image via uazapi
    async function sendUazapiImage(imageUrl: string, caption?: string) {
      if (!uazapiBase || !effectiveToken) {
        console.warn("uazapi not configured, skipping image send");
        return;
      }
      try {
        const sendResp = await fetch(`https://${uazapiBase}/send/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: effectiveToken },
          body: JSON.stringify({ number: cleanPhone, type: "image", file: imageUrl, text: caption || "" }),
        });
        if (!sendResp.ok) {
          console.error("uazapi image send error:", sendResp.status, await sendResp.text());
        } else {
          console.log("[WEBHOOK] QR code image sent successfully");
        }
      } catch (e) {
        console.error("uazapi image send exception:", e);
      }
    }

    // Helper to send native PIX button via uazapi
    async function sendUazapiPixButton(brcode?: string) {
      if (!uazapiBase || !effectiveToken) {
        console.warn("uazapi not configured, skipping pix button send");
        return;
      }
      const pixKey = brcode || settings.pix_evp_key || Deno.env.get("PIX_EVP_KEY");
      if (!pixKey) {
        console.warn("[WEBHOOK] PIX key/brcode not configured, skipping pix-button");
        return;
      }
      const pixType = brcode ? "BRCODE" : "EVP";
      try {
        console.log(`[WEBHOOK] Sending PIX button: type=${pixType}, key=${pixKey.slice(0, 30)}...`);
        const sendResp = await fetch(`https://${uazapiBase}/send/pix-button`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: effectiveToken },
          body: JSON.stringify({
            number: cleanPhone,
            pixType,
            pixKey,
            pixName: "Pagamento PIX"
          }),
        });
        if (!sendResp.ok) {
          console.error("uazapi pix-button send error:", sendResp.status, await sendResp.text());
        } else {
          console.log("[WEBHOOK] PIX button sent successfully");
        }
      } catch (e) {
        console.error("uazapi pix-button send exception:", e);
      }
    }

    // Helper to send composing status
    async function sendComposing() {
      if (!uazapiBase || !effectiveToken || !settings.simulate_typing) return;
      try {
        await fetch(`https://${uazapiBase}/send/composing`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: effectiveToken },
          body: JSON.stringify({ number: cleanPhone }),
        });
      } catch (e) {
        console.warn("composing error:", e);
      }
    }

    // Helper to send read receipt (mark as "seen") before responding
    async function sendReadReceipt() {
      if (!uazapiBase || !effectiveToken) return;
      try {
        await fetch(`https://${uazapiBase}/send/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: effectiveToken },
          body: JSON.stringify({ number: cleanPhone }),
        });
      } catch (e) {
        console.warn("read receipt error:", e);
      }
    }

    // Helper: calculate proportional typing delay based on text length (human typing ~35 chars/s on mobile)
    function calcTypingDelay(text: string): number {
      const chars = text.length;
      const baseMs = Math.max(1500, Math.min(chars * 30, 8000)); // 1.5s min, 8s max
      const jitter = Math.floor(Math.random() * 1500) - 750; // ±750ms
      return baseMs + jitter;
    }

    // 5. Check business hours
    if (!isWithinBusinessHours(settings)) {
      const outsideMsg = settings.outside_hours_message || "Estamos fora do horario de atendimento. Retornaremos em breve!";
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "assistant",
        content: outsideMsg,
      });
      await sendUazapi(outsideMsg);
      return new Response(JSON.stringify({ ok: true, outside_hours: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============ FLOW BUILDER EXECUTION (BEFORE welcome messages) ============
    const agentIdForFlow = instanceCreds?.agent_id || null;
    let flowHandled = false;
    let flowExecuted = false;

    // ---- CHECK: Resume from wait_response ----
    if (agentIdForFlow && !isNewConversation) {
      const pendingState = conversation.flow_state as any;
      if (pendingState?.waiting_for_response && pendingState?.resume_node_id && pendingState?.flow_id) {
        // Check 24h expiry
        const waitedAt = pendingState.waited_at ? new Date(pendingState.waited_at).getTime() : 0;
        const hoursElapsed = (Date.now() - waitedAt) / (1000 * 60 * 60);
        
        if (hoursElapsed < 24) {
          console.log(`[WEBHOOK] Resuming flow from wait_response, node: ${pendingState.resume_node_id}, waited ${hoursElapsed.toFixed(1)}h`);
          
          // Fetch the flow
          const { data: resumeFlowData } = await supabase
            .from("chatbot_flows")
            .select("*")
            .eq("id", pendingState.flow_id)
            .single();
          
          if (resumeFlowData) {
            const resumeNodes = resumeFlowData.nodes as any[];
            const resumeEdges = resumeFlowData.edges as any[];
            
            // Clear waiting state immediately
            const previousNodesReached = pendingState.nodes_reached || [];
            await supabase.from("conversations").update({
              flow_state: {
                executed: true,
                flow_id: pendingState.flow_id,
                waiting_for_response: false,
                resumed_at: new Date().toISOString(),
                nodes_reached: [...previousNodesReached, { node_type: "user_responded", node_id: "wait_response", reached_at: new Date().toISOString() }],
              },
            }).eq("id", conversation.id);
            
            // Rebuild execution context
            let shouldContinueToAI = false;
            let flowContentMessagesSent = pendingState.flow_content_sent || 0;
            const resumeNodesReached = [...previousNodesReached, { node_type: "user_responded", node_id: "wait_response", reached_at: new Date().toISOString() }];
            
            const getResumeNextNodes = (nodeId: string): any[] => {
              return resumeEdges
                .filter((e: any) => e.source === nodeId)
                .map((e: any) => resumeNodes.find((n: any) => n.id === e.target))
                .filter(Boolean);
            };
            
            const executeResumeFromNode = async (nodeId: string, visited: Set<string>) => {
              if (visited.has(nodeId)) return;
              visited.add(nodeId);
              const node = resumeNodes.find((n: any) => n.id === nodeId);
              if (!node) return;
              
              console.log(`[WEBHOOK] Flow RESUME executing node: type=${node.type}, id=${node.id}`);
              resumeNodesReached.push({ node_type: node.type, node_id: node.id, reached_at: new Date().toISOString() });
              
              switch (node.type) {
                case "text_message": {
                  const msgContent = node.data?.content || "";
                  if (msgContent) {
                    await sendComposing();
                    await sleep(Math.floor(Math.random() * 2000) + 500);
                    await sendUazapi(msgContent);
                    await supabase.from("messages").insert({
                      conversation_id: conversation.id,
                      role: "assistant",
                      content: `[FLUXO AUTOMÁTICO] ${msgContent}`,
                    });
                    flowContentMessagesSent++;
                  }
                  break;
                }
                case "audio_ptt": {
                  const audioUrl = node.data?.audioUrl || "";
                  if (audioUrl && uazapiBase) {
                    try {
                      await fetch(`https://${uazapiBase}/send/media`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", token: effectiveToken },
                        body: JSON.stringify({ number: cleanPhone, type: "ptt", file: audioUrl }),
                      });
                      await supabase.from("messages").insert({
                        conversation_id: conversation.id,
                        role: "assistant",
                        content: "[FLUXO AUTOMÁTICO] [Áudio enviado pelo fluxo]",
                        media_type: "audio",
                        media_url: audioUrl,
                      });
                      flowContentMessagesSent++;
                    } catch (e) {
                      console.error("[WEBHOOK] Flow resume audio error:", e);
                    }
                  }
                  break;
                }
                case "image_message": {
                  const imgUrl = node.data?.imageUrl || "";
                  const imgCaption = node.data?.caption || "";
                  if (imgUrl) {
                    await sendUazapiImage(imgUrl, imgCaption);
                    await supabase.from("messages").insert({
                      conversation_id: conversation.id,
                      role: "assistant",
                      content: `[FLUXO AUTOMÁTICO] ${imgCaption || "[Imagem enviada pelo fluxo]"}`,
                      media_type: "image",
                      media_url: imgUrl,
                    });
                    flowContentMessagesSent++;
                  }
                  break;
                }
                case "delay": {
                  const delaySecs = node.data?.seconds || 5;
                  console.log(`[WEBHOOK] Flow resume delay: ${delaySecs}s`);
                  await sleep(delaySecs * 1000);
                  break;
                }
                case "transfer_ai":
                  console.log(`[WEBHOOK] Flow resume: transfer_ai reached (${flowContentMessagesSent} content msgs sent), continuing to AI`);
                  shouldContinueToAI = true;
                  return;
                case "transfer_human": {
                  const transferMsg = node.data?.message || "Transferindo para um atendente humano...";
                  await sendComposing();
                  await sleep(1000);
                  await sendUazapi(transferMsg);
                  await supabase.from("messages").insert({
                    conversation_id: conversation.id,
                    role: "assistant",
                    content: transferMsg,
                  });
                  await supabase.from("conversations").update({ ai_enabled: false }).eq("id", conversation.id);
                  return;
                }
                case "wait_response": {
                  // Another wait_response in sequence
                  const waitEdge2 = resumeEdges.find((e: any) => e.source === nodeId);
                  const resumeNodeId2 = waitEdge2?.target || null;
                  await supabase.from("conversations").update({
                    flow_state: {
                      executed: true,
                      flow_id: pendingState.flow_id,
                      waiting_for_response: true,
                      resume_node_id: resumeNodeId2,
                      waited_at: new Date().toISOString(),
                      flow_content_sent: flowContentMessagesSent,
                      nodes_reached: resumeNodesReached,
                    },
                  }).eq("id", conversation.id);
                  console.log(`[WEBHOOK] Flow resume: hit another wait_response, pausing at ${resumeNodeId2}`);
                  shouldContinueToAI = false;
                  return;
                }
                default:
                  break;
              }
              
              const nextNodes = getResumeNextNodes(nodeId);
              for (const next of nextNodes) {
                await executeResumeFromNode(next.id, visited);
              }
            };
            
            await executeResumeFromNode(pendingState.resume_node_id, new Set());
            flowExecuted = true;
            
            // Save final nodes_reached after resume
            await supabase.from("conversations").update({
              flow_state: {
                executed: true,
                flow_id: pendingState.flow_id,
                waiting_for_response: false,
                resumed_at: new Date().toISOString(),
                nodes_reached: resumeNodesReached,
              },
            }).eq("id", conversation.id);
            
            if (!shouldContinueToAI) {
              console.log("[WEBHOOK] Flow resume completed without transfer_ai, skipping AI");
              if (webhookLogId && logSupabase) {
                await logSupabase.from("webhook_logs").update({ processed: true }).eq("id", webhookLogId);
              }
              return new Response(JSON.stringify({ ok: true, flow_resumed: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
            
            console.log("[WEBHOOK] Flow resume completed with transfer_ai, continuing to AI");
            flowHandled = true;
          }
        } else {
          console.log(`[WEBHOOK] wait_response expired (${hoursElapsed.toFixed(1)}h > 24h), clearing state`);
          await supabase.from("conversations").update({
            flow_state: { executed: true, flow_id: pendingState.flow_id, waiting_for_response: false, expired: true },
          }).eq("id", conversation.id);
        }
      }
    }

    let isSpanishLead = false;
    if (agentIdForFlow && !flowExecuted) {
      try {
        // A/B: fetch ALL active flows for weighted distribution
        const { data: activeFlows } = await supabase
          .from("chatbot_flows")
          .select("*")
          .eq("agent_id", agentIdForFlow)
          .eq("is_active", true)
          .order("created_at", { ascending: false });

        // Detect Spanish lead based on phone country code or message content
        const SPANISH_COUNTRY_CODES = [
          "57", "52", "54", "56", "51", "593", "58", "34",
          "507", "506", "502", "503", "504", "505", "591",
          "595", "598", "809", "829", "849"
        ];
        const isSpanishByPhone = SPANISH_COUNTRY_CODES.some(code => cleanPhone.startsWith(code));
        const SPANISH_INDICATORS = ["hablo español", "información", "interesado", "me gustaría", "buenos días", "buenas tardes", "buenas noches", "¿", "estoy interesado"];
        const lowerTextForLang = (text || "").toLowerCase();
        // Phone-based detection takes absolute priority
        isSpanishLead = isSpanishByPhone ? true : SPANISH_INDICATORS.some(kw => lowerTextForLang.includes(kw));

        if (isSpanishLead) {
          console.log(`[WEBHOOK] Spanish lead detected: "${text.slice(0, 80)}"`);
        }

        // Weighted random selection among active flows
        let activeFlow: any = null;
        if (activeFlows && activeFlows.length > 0) {
          // If Spanish lead, force-select Spanish flow
          if (isSpanishLead) {
            const spanishFlow = activeFlows.find((f: any) => f.name.toLowerCase().includes("español"));
            if (spanishFlow) {
              activeFlow = spanishFlow;
              console.log(`[WEBHOOK] Spanish flow selected: "${spanishFlow.name}" (id=${spanishFlow.id})`);
              
              // Save language memory for AI agent context
              if (conversation?.id) {
                await supabase.from("contact_memories").insert({
                  conversation_id: conversation.id,
                  memory_type: "language",
                  content: "language:es",
                });
                console.log(`[WEBHOOK] Saved language memory: es for conversation ${conversation.id}`);
              }
            }
          }

          if (!activeFlow) {
            if (activeFlows.length === 1) {
              activeFlow = activeFlows[0];
            } else {
              // Check if conversation already has a flow assigned
              const existingFlowState = conversation.flow_state as any;
              const existingFlowId = existingFlowState?.flow_id;
              const existingFlow = existingFlowId ? activeFlows.find((f: any) => f.id === existingFlowId) : null;
              
              if (existingFlow) {
                activeFlow = existingFlow;
              } else {
                // Weighted random distribution (exclude Spanish flow for non-Spanish leads)
                const eligibleFlows = activeFlows.filter((f: any) => !f.name.toLowerCase().includes("español"));
                const flowsForAB = eligibleFlows.length > 0 ? eligibleFlows : activeFlows;
                
                const totalWeight = flowsForAB.reduce((sum: number, f: any) => sum + (f.ab_weight || 50), 0);
                let rand = Math.random() * totalWeight;
                for (const f of flowsForAB) {
                  rand -= (f.ab_weight || 50);
                  if (rand <= 0) { activeFlow = f; break; }
                }
                if (!activeFlow) activeFlow = flowsForAB[0];
                
                // Increment stats_sent for the selected flow
                await supabase.from("chatbot_flows").update({
                  stats_sent: (activeFlow.stats_sent || 0) + 1
                }).eq("id", activeFlow.id);
                
                console.log(`[WEBHOOK] A/B: selected flow "${activeFlow.name}" (id=${activeFlow.id}) from ${flowsForAB.length} eligible flows`);
              }
            }
          }
        }

        if (activeFlow && activeFlow.nodes && activeFlow.edges) {
          const flowNodes = activeFlow.nodes as any[];
          const flowEdges = activeFlow.edges as any[];

          // Find trigger node
          const triggerNode = flowNodes.find((n: any) => n.type === "trigger");

          if (triggerNode) {
            const triggerType = triggerNode.data?.triggerType || "first_message";
            let triggerMatches = false;

            // Intelligent trigger: use flow_state to determine if flow already ran
            const flowState = conversation.flow_state as any;
            const flowAlreadyExecuted = flowState?.executed === true && flowState?.flow_id === activeFlow.id;

            // Support intent keywords — skip pitch flow and let AI handle
            const SUPPORT_KEYWORDS = [
              "não consigo", "nao consigo", "erro", "problema", "não funciona",
              "nao funciona", "ajuda", "bug", "travou", "não abre", "nao abre",
              "não carrega", "nao carrega", "não pagar", "nao pagar",
              "não consegui", "nao consegui", "cancelar", "reembolso",
              "não acessa", "nao acessa", "expirou", "bloqueado",
              "não entra", "nao entra", "suporte", "reclamação", "reclamacao",
              "já comprei", "ja comprei", "já paguei", "ja paguei",
              "perdi o link", "perdi acesso", "esqueci a senha", "esqueci senha",
              "já assinei", "ja assinei", "já sou cliente", "ja sou cliente",
              "cadê meu acesso", "cade meu acesso", "como acesso",
              "não lembro a senha", "nao lembro a senha", "formatei"
            ];

            if (triggerType === "first_message") {
              // Trigger on new conversations OR conversations created very recently (within 60s)
              // This handles race conditions where multiple rapid messages create the conversation
              // before subsequent webhook calls arrive
              if (isNewConversation) {
                triggerMatches = true;
              } else if (conversation.created_at) {
                const convAge = Date.now() - new Date(conversation.created_at).getTime();
                const hasNoAssistantMessages = await (async () => {
                  const { count } = await supabase
                    .from("messages")
                    .select("id", { count: "exact", head: true })
                    .eq("conversation_id", conversation.id)
                    .eq("role", "assistant");
                  return !count || count === 0;
                })();
                if (convAge < 60_000 && hasNoAssistantMessages) {
                  triggerMatches = true;
                  console.log(`[WEBHOOK] Conversation is ${Math.round(convAge/1000)}s old with no AI replies — treating as new for flow trigger`);
                }
              }

              // Safety: verify no prior user messages beyond the current batch
              if (triggerMatches) {
                const { count } = await supabase
                  .from("messages")
                  .select("id", { count: "exact", head: true })
                  .eq("conversation_id", conversation.id)
                  .eq("role", "user");
                if (count && count > 4) {
                  triggerMatches = false;
                  console.log("[WEBHOOK] Flow skipped: conversation has too many prior user messages");
                }
              }

              // Detect support intent — skip pitch to let AI handle directly
              if (triggerMatches && text) {
                const lowerText = text.toLowerCase();
                const hasSupportIntent = SUPPORT_KEYWORDS.some((kw) => lowerText.includes(kw));
                if (hasSupportIntent) {
                  triggerMatches = false;
                  console.log(`[WEBHOOK] First message has support intent ("${text.slice(0, 60)}"), skipping flow to let AI handle`);
                }
              }

              // Skip flow builder entirely for Spanish leads — go straight to AI with Spanish override
              if (triggerMatches && isSpanishLead) {
                triggerMatches = false;
                console.log(`[WEBHOOK] Spanish lead detected (phone: ${cleanPhone}), skipping flow builder to use AI with Spanish override`);
                
                // Persist language memory immediately so AI knows to use Spanish
                if (conversation?.id) {
                  try {
                    await supabase.from("contact_memories").insert({
                      conversation_id: conversation.id,
                      memory_type: "language",
                      content: "language:es",
                    });
                    console.log(`[WEBHOOK] Saved language memory: es for conversation ${conversation.id}`);
                  } catch (memErr) {
                    console.warn("[WEBHOOK] Failed to save language memory (may already exist):", memErr);
                  }
                }
              }
            } else if (triggerType === "keyword") {
              const keywords = (triggerNode.data?.keywords || "").split(",").map((k: string) => k.trim().toLowerCase()).filter(Boolean);
              const lowerText = text.toLowerCase();
              triggerMatches = keywords.some((kw: string) => lowerText.includes(kw));
            }

            console.log(`[WEBHOOK] Flow check: trigger=${triggerType}, matches=${triggerMatches}, isNew=${isNewConversation}, flowAlreadyExecuted=${flowAlreadyExecuted}, flowId=${activeFlow.id}`);

            if (triggerMatches) {
              // ATOMIC: Save flow_state BEFORE executing to prevent race conditions
              const executionTimestamp = new Date().toISOString();
              await supabase.from("conversations").update({
                flow_state: { executed: true, flow_id: activeFlow.id, executed_at: executionTimestamp, nodes_reached: [] },
              }).eq("id", conversation.id);

              // Re-check: verify we won the race (another instance may have saved first)
              const { data: freshConv } = await supabase
                .from("conversations")
                .select("flow_state")
                .eq("id", conversation.id)
                .single();

              const freshState = freshConv?.flow_state as any;
              if (freshState?.executed_at && freshState.executed_at !== executionTimestamp) {
                console.log(`[WEBHOOK] Flow race condition detected: another instance already executed. Skipping.`);
                return new Response(JSON.stringify({ ok: true, skipped: true, reason: "flow_race_condition" }), {
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
              }

              console.log(`[WEBHOOK] Flow race check passed, proceeding with execution`);
              flowExecuted = true;

              // Execute flow: traverse nodes via edges starting from trigger
              const getNextNodes = (nodeId: string): any[] => {
                const outEdges = flowEdges.filter((e: any) => e.source === nodeId);
                return outEdges
                  .map((e: any) => flowNodes.find((n: any) => n.id === e.target))
                  .filter(Boolean);
              };

              let shouldContinueToAI = false;
              let flowContentMessagesSent = 0;
              const nodesReached: { node_type: string; node_id: string; reached_at: string }[] = [];
              const executeFromNode = async (nodeId: string, visited: Set<string>) => {
                if (visited.has(nodeId)) return;
                visited.add(nodeId);

                const node = flowNodes.find((n: any) => n.id === nodeId);
                if (!node) return;

                console.log(`[WEBHOOK] Flow executing node: type=${node.type}, id=${node.id}`);
                nodesReached.push({ node_type: node.type, node_id: node.id, reached_at: new Date().toISOString() });

                switch (node.type) {
                  case "trigger":
                    break;

                  case "text_message": {
                    const msgContent = node.data?.content || "";
                    if (msgContent) {
                      await sendComposing();
                      await sleep(Math.floor(Math.random() * 2000) + 500);
                      await sendUazapi(msgContent);
                      await supabase.from("messages").insert({
                        conversation_id: conversation.id,
                        role: "assistant",
                        content: `[FLUXO AUTOMÁTICO] ${msgContent}`,
                      });
                      flowContentMessagesSent++;
                    }
                    break;
                  }

                  case "audio_ptt": {
                    const audioUrl = node.data?.audioUrl || "";
                    if (audioUrl && uazapiBase) {
                      try {
                        await fetch(`https://${uazapiBase}/send/media`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", token: effectiveToken },
                          body: JSON.stringify({ number: cleanPhone, type: "ptt", file: audioUrl }),
                        });
                        await supabase.from("messages").insert({
                          conversation_id: conversation.id,
                          role: "assistant",
                          content: "[FLUXO AUTOMÁTICO] [Áudio enviado pelo fluxo]",
                          media_type: "audio",
                          media_url: audioUrl,
                        });
                        flowContentMessagesSent++;
                      } catch (e) {
                        console.error("[WEBHOOK] Flow audio send error:", e);
                      }
                    }
                    break;
                  }

                  case "image_message": {
                    const imgUrl = node.data?.imageUrl || "";
                    const imgCaption = node.data?.caption || "";
                    if (imgUrl) {
                      await sendUazapiImage(imgUrl, imgCaption);
                      await supabase.from("messages").insert({
                        conversation_id: conversation.id,
                        role: "assistant",
                        content: `[FLUXO AUTOMÁTICO] ${imgCaption || "[Imagem enviada pelo fluxo]"}`,
                        media_type: "image",
                        media_url: imgUrl,
                      });
                      flowContentMessagesSent++;
                    }
                    break;
                  }

                  case "delay": {
                    const delaySecs = node.data?.seconds || 5;
                    console.log(`[WEBHOOK] Flow delay: ${delaySecs}s`);
                    await sleep(delaySecs * 1000);
                    break;
                  }

                  case "condition": {
                    const options = node.data?.options || [];
                    if (options.length > 0) {
                      const optionsText = options.map((opt: string, i: number) => `${i + 1}️⃣ ${opt}`).join("\n");
                      await sendComposing();
                      await sleep(1000);
                      await sendUazapi(optionsText);
                      await supabase.from("messages").insert({
                        conversation_id: conversation.id,
                        role: "assistant",
                        content: `[FLUXO AUTOMÁTICO] ${optionsText}`,
                      });
                    }
                    break;
                  }

                  case "transfer_ai":
                    console.log(`[WEBHOOK] Flow: transfer_ai reached after ${flowContentMessagesSent} content messages, activating AI`);
                    shouldContinueToAI = true;
                    return;

                  case "transfer_human": {
                    const transferMsg = node.data?.message || "Transferindo para um atendente humano...";
                    await sendComposing();
                    await sleep(1000);
                    await sendUazapi(transferMsg);
                    await supabase.from("messages").insert({
                      conversation_id: conversation.id,
                      role: "assistant",
                      content: transferMsg,
                    });
                    await supabase.from("conversations").update({ ai_enabled: false }).eq("id", conversation.id);
                    console.log("[WEBHOOK] Flow: transfer_human - AI disabled");
                    return;
                  }

                  case "randomizer": {
                    const outputs = node.data?.outputs || 2;
                    const outEdges = flowEdges
                      .filter((e: any) => e.source === nodeId)
                      .sort((a: any, b: any) => {
                        const aHandle = a.sourceHandle || "";
                        const bHandle = b.sourceHandle || "";
                        return aHandle.localeCompare(bHandle);
                      });
                    if (outEdges.length > 0) {
                      const randomIndex = Math.floor(Math.random() * Math.min(outputs, outEdges.length));
                      const chosenEdge = outEdges[randomIndex];
                      const nextNode = flowNodes.find((n: any) => n.id === chosenEdge.target);
                      if (nextNode) {
                        console.log(`[WEBHOOK] Flow randomizer: chose path ${randomIndex + 1}/${outEdges.length}`);
                        await executeFromNode(nextNode.id, visited);
                      }
                    }
                    return;
                  }

                  case "wait_response": {
                    // Find the next node after wait_response
                    const waitEdge = flowEdges.find((e: any) => e.source === nodeId);
                    const resumeNodeId = waitEdge?.target || null;
                    
                     // Save state: pause flow, store resume point
                    await supabase.from("conversations").update({
                      flow_state: {
                        executed: true,
                        flow_id: activeFlow.id,
                        waiting_for_response: true,
                        resume_node_id: resumeNodeId,
                        waited_at: new Date().toISOString(),
                        flow_content_sent: flowContentMessagesSent,
                        nodes_reached: nodesReached,
                      },
                    }).eq("id", conversation.id);
                    
                    console.log(`[WEBHOOK] Flow: wait_response - PAUSED, will resume at node: ${resumeNodeId}`);
                    shouldContinueToAI = false;
                    return; // STOP execution entirely
                  }

                  case "contact_message": {
                    const contactName = node.data?.contactName || "";
                    const contactPhone = node.data?.contactPhone || "";
                    if (contactName && contactPhone && uazapiBase) {
                      try {
                        await fetch(`https://${uazapiBase}/send/contact`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", token: effectiveToken },
                          body: JSON.stringify({
                            number: cleanPhone,
                            contactName: contactName,
                            contactNumber: contactPhone,
                          }),
                        });
                        await supabase.from("messages").insert({
                          conversation_id: conversation.id,
                          role: "assistant",
                          content: `[FLUXO AUTOMÁTICO] [Contato enviado: ${contactName} - ${contactPhone}]`,
                        });
                        flowContentMessagesSent++;
                      } catch (e) {
                        console.error("[WEBHOOK] Flow contact send error:", e);
                      }
                    }
                    break;
                  }

                  case "document_message": {
                    const docUrl = node.data?.documentUrl || "";
                    const docCaption = node.data?.caption || "";
                    if (docUrl && uazapiBase) {
                      try {
                        await fetch(`https://${uazapiBase}/send/media`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", token: effectiveToken },
                          body: JSON.stringify({ number: cleanPhone, type: "document", file: docUrl, caption: docCaption }),
                        });
                        await supabase.from("messages").insert({
                          conversation_id: conversation.id,
                          role: "assistant",
                          content: `[FLUXO AUTOMÁTICO] ${docCaption || "[Documento enviado pelo fluxo]"}`,
                          media_type: "document",
                          media_url: docUrl,
                        });
                        flowContentMessagesSent++;
                      } catch (e) {
                        console.error("[WEBHOOK] Flow document send error:", e);
                      }
                    }
                    break;
                  }

                  case "video_message": {
                    const vidUrl = node.data?.videoUrl || "";
                    const vidCaption = node.data?.caption || "";
                    if (vidUrl && uazapiBase) {
                      try {
                        await fetch(`https://${uazapiBase}/send/media`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", token: effectiveToken },
                          body: JSON.stringify({ number: cleanPhone, type: "video", file: vidUrl, caption: vidCaption }),
                        });
                        await supabase.from("messages").insert({
                          conversation_id: conversation.id,
                          role: "assistant",
                          content: `[FLUXO AUTOMÁTICO] ${vidCaption || "[Vídeo enviado pelo fluxo]"}`,
                          media_type: "video",
                          media_url: vidUrl,
                        });
                        flowContentMessagesSent++;
                      } catch (e) {
                        console.error("[WEBHOOK] Flow video send error:", e);
                      }
                    }
                    break;
                  }
                }

                const nextNodes = getNextNodes(nodeId);
                for (const next of nextNodes) {
                  await executeFromNode(next.id, visited);
                }
              };

              await executeFromNode(triggerNode.id, new Set());

              // Save final nodes_reached to flow_state (unless wait_response already saved it)
              const currentFlowState = (await supabase.from("conversations").select("flow_state").eq("id", conversation.id).single()).data?.flow_state as any;
              if (currentFlowState && !currentFlowState.waiting_for_response) {
                await supabase.from("conversations").update({
                  flow_state: { ...currentFlowState, nodes_reached: nodesReached },
                }).eq("id", conversation.id);
              }

              if (!shouldContinueToAI) {
                console.log("[WEBHOOK] Flow completed without transfer_ai, skipping AI");
                if (webhookLogId && logSupabase) {
                  await logSupabase.from("webhook_logs").update({ processed: true }).eq("id", webhookLogId);
                }
                return new Response(JSON.stringify({ ok: true, flow_executed: true }), {
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
              }

              console.log("[WEBHOOK] Flow completed with transfer_ai, continuing to AI");
              flowHandled = true;
            }
          }
        }
      } catch (flowErr) {
        console.error("[WEBHOOK] Flow execution error:", flowErr);
        // Continue to AI on flow error
      }
    }

    // 6. Welcome audio PTT + text for new conversations (ONLY if no flow was executed)
    if (isNewConversation && (!flowExecuted || isSpanishLead)) {
      // Determine which audio URL to use based on language
      const welcomeAudioUrl = isSpanishLead
        ? (settings as any).welcome_audio_url_es
        : (settings as any).welcome_audio_url;

      // Send welcome audio PTT if configured
      if (welcomeAudioUrl) {
        try {
          console.log(`[WEBHOOK] Sending welcome audio PTT (${isSpanishLead ? 'ES' : 'PT'}):`, welcomeAudioUrl.slice(0, 80));
          const audioResp = await fetch(`https://${uazapiBase}/send/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: effectiveToken },
            body: JSON.stringify({
              number: cleanPhone,
              type: "ptt",
              file: welcomeAudioUrl,
            }),
          });
          console.log("[WEBHOOK] Welcome audio PTT response:", audioResp.status);
          await supabase.from("messages").insert({
            conversation_id: conversation.id,
            role: "assistant",
            content: isSpanishLead ? "[Audio de bienvenida enviado]" : "[Áudio de boas-vindas enviado]",
            media_type: "audio",
            media_url: welcomeAudioUrl,
          });
          await sleep(1500);
        } catch (audioErr) {
          console.error("[WEBHOOK] Welcome audio PTT error:", audioErr);
        }
      }

      // Send welcome text message if configured (only for non-Spanish leads)
      if (!isSpanishLead && settings.welcome_message) {
        await sendComposing();
        const welcomeDelay = Math.floor(Math.random() * 3000) + 1000;
        await sleep(welcomeDelay);
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          role: "assistant",
          content: settings.welcome_message,
        });
        await sendUazapi(settings.welcome_message);
        await sleep(1000);
      }
    }

    // 7. Get messages for context (use pre-loaded agent context_limit)
    // agentContextLimit already set from preload above
    const { data: history } = await supabase
      .from("messages")
      .select("role, content, media_url, media_type")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(agentContextLimit);

    // Reverse to chronological order (we fetched desc to get latest)
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const rawMessages: any[] = (history || []).reverse().map((m: any) => {
      const role = m.role === "user" ? "user" : "assistant";
      // For historical messages with images, build multimodal content
      if (m.media_type === "image" && m.media_url && role === "user") {
        // Convert storage path to public URL if needed
        let imageUrl = m.media_url;
        if (!imageUrl.startsWith("http")) {
          imageUrl = `${SUPABASE_URL}/storage/v1/object/public/${imageUrl}`;
        }
        // Filter out inaccessible WhatsApp encrypted URLs that crash OpenAI
        const urlLower = imageUrl.toLowerCase();
        const isInaccessible = urlLower.includes("mmg.whatsapp.net") || urlLower.includes(".enc?") || urlLower.endsWith(".enc");
        if (isInaccessible) {
          console.warn("[WEBHOOK] Skipping inaccessible image URL in history:", imageUrl.slice(0, 80));
          return {
            role,
            content: m.content || "[O cliente enviou uma imagem que não pôde ser processada]",
          };
        }
        return {
          role,
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            { type: "text", text: m.content || "O cliente enviou esta imagem." },
          ],
        };
      }
      return { role, content: m.content };
    });

    // Use shared filtering logic with smart greeting reset
    // Get timestamp of second-to-last message to check recent activity
    const lastNonCurrentMsg = (history || []).length > 1 ? history![1] : null; // history is desc, [0]=current, [1]=previous
    const lastMsgTimestamp = lastNonCurrentMsg?.created_at ? new Date(lastNonCurrentMsg.created_at).getTime() : undefined;
    const filterResult = filterMessageHistory(rawMessages, {
      leadStage: conversation.lead_stage,
      lastMessageTimestamp: lastMsgTimestamp,
    });
    const chatMessages = filterResult.messages;
    const olderMessages = filterResult.olderMessages;
    const totalRawCount = (history || []).length;
    console.log(`[WEBHOOK] History: ${totalRawCount} raw -> ${chatMessages.length} filtered, ${olderMessages.length} older for summary`);

    // Generate or retrieve cached summary for older messages
    if (olderMessages.length > 0) {
      let summaryText = "";
      // Check cache in conversation_summaries
      const { data: cachedSummary } = await supabase
        .from("conversation_summaries")
        .select("summary, message_count")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Regenerate if message count changed significantly (>5 new messages since last summary)
      if (cachedSummary && cachedSummary.summary && Math.abs(totalRawCount - cachedSummary.message_count) < 5) {
        summaryText = cachedSummary.summary;
        console.log(`[WEBHOOK] Using cached summary (${summaryText.length} chars, cached at ${cachedSummary.message_count} msgs, now ${totalRawCount})`);
      } else {
        summaryText = await summarizeOlderMessages(olderMessages, OPENAI_API_KEY);
        if (summaryText) {
          // Save/update cache — delete old then insert new
          await supabase.from("conversation_summaries").delete().eq("conversation_id", conversation.id);
          await supabase.from("conversation_summaries").insert({
            conversation_id: conversation.id,
            summary: summaryText,
            message_count: totalRawCount,
          });
          console.log(`[WEBHOOK] Saved new summary to cache (${summaryText.length} chars)`);
        }
      }

      if (summaryText) {
        chatMessages.unshift({
          role: "system" as any,
          content: `[RESUMO DO HISTÓRICO ANTERIOR - ${olderMessages.length} mensagens resumidas]\n${summaryText}`,
        });
      }
    }

    // 8.1 CONTINUITY HINT: prevent AI from repeating intro when conversation has history
    if (chatMessages.length > 3) {
      chatMessages.unshift({
        role: "system" as any,
        content: "CONTINUIDADE: Esta conversa já tem histórico. Continue naturalmente sem repetir a apresentação inicial. Se o cliente mandou uma saudação, responda brevemente e pergunte como pode ajudar — NÃO repita o pitch de vendas inicial.",
      });
      console.log(`[WEBHOOK] Injected continuity hint (${chatMessages.length} messages in context)`);
    }

    // 8.5 Anti-repetition: extract recent assistant messages to inject context
    const recentAssistantMsgs = rawMessages
      .filter((m: any) => m.role === "assistant")
      .slice(-5)
      .map((m: any) => typeof m.content === "string" ? m.content : "")
      .filter(Boolean);

    // Extract links from recent assistant messages
    const recentLinks = recentAssistantMsgs
      .join(" ")
      .match(/https?:\/\/[^\s]+/g) || [];
    const uniqueRecentLinks = [...new Set(recentLinks)];

    if (uniqueRecentLinks.length > 0) {
      // Anti-repetition for links — applies to ALL scenarios (flow or not)
      const antiRepCtx = `[SISTEMA: Você já enviou estes links recentemente: ${uniqueRecentLinks.join(", ")}. NÃO reenvie o mesmo link a menos que o cliente peça explicitamente. Varie suas respostas.]`;
      chatMessages.push({ role: "user", content: antiRepCtx });
      chatMessages.push({ role: "assistant", content: "Entendido, vou variar minhas respostas." });
    }

    // 9. Build system prompt — prefer per-agent data if agent_id exists
    const pixKey = settings.pix_evp_key_fallback || settings.pix_evp_key || "";
    let systemPrompt: string;

    // Store agentData reference for passing to callOpenAI later
    let agentDataRef: any = null;

    if (instanceCreds?.agent_id) {
      // Load agent + knowledge + documents for per-agent prompt
      const { data: agentData } = await supabase
        .from("agents")
        .select("*")
        .eq("id", instanceCreds.agent_id)
        .single();

      agentDataRef = agentData;
      let knowledgeText = "";
      let docsText = "";

      if (agentData) {
        // Fetch knowledge entries linked to this agent
        const { data: knowledgeLinks } = await supabase
          .from("agent_knowledge")
          .select("knowledge_entry_id")
          .eq("agent_id", instanceCreds.agent_id);

        if (knowledgeLinks?.length) {
          const entryIds = knowledgeLinks.map((l: any) => l.knowledge_entry_id);
          const { data: entries } = await supabase
            .from("knowledge_entries")
            .select("question, answer")
            .in("id", entryIds);
          if (entries?.length) {
            knowledgeText = entries.map((e: any) => `P: ${e.question}\nR: ${e.answer}`).join("\n\n");
          }
        }

        // Fetch extracted documents
        const { data: docs } = await supabase
          .from("knowledge_documents")
          .select("file_name, extracted_text")
          .eq("agent_id", instanceCreds.agent_id)
          .eq("status", "processed");

        if (docs?.length) {
          docsText = docs
            .filter((d: any) => d.extracted_text)
            .map((d: any) => `[${d.file_name}]\n${d.extracted_text}`)
            .join("\n\n");
        }

        // Check for language memory to inject into system prompt
        const { data: langMemory } = await supabase
          .from("contact_memories")
          .select("content")
          .eq("conversation_id", conversation.id)
          .eq("memory_type", "language")
          .limit(1);
        
        let languageHint = langMemory?.length ? langMemory[0].content : null;
        
        // Respect agent.language configuration before auto-detecting
        const agentLanguage = agentData?.language || "auto";
        
        if (agentLanguage === "pt-BR") {
          // Agent is configured for Portuguese — NEVER apply Spanish override
          languageHint = null;
          console.log(`[WEBHOOK] Agent language is pt-BR, skipping Spanish detection for conversation ${conversation.id}`);
        } else if (agentLanguage === "es") {
          // Agent is configured for Spanish — ALWAYS apply Spanish override
          languageHint = "language:es";
          console.log(`[WEBHOOK] Agent language is es, forcing Spanish for conversation ${conversation.id}`);
        } else {
          // Auto mode: use existing detection logic as fallback
          if (!languageHint) {
            const SPANISH_COUNTRY_CODES_AI = [
              "57", "52", "54", "56", "51", "593", "58", "34",
              "507", "506", "502", "503", "504", "505", "591",
              "595", "598", "809", "829", "849"
            ];
            const isSpanishByPhoneAI = SPANISH_COUNTRY_CODES_AI.some(code => cleanPhone.startsWith(code));
            const isSpanish = isSpanishByPhoneAI;
            if (isSpanish) {
              languageHint = "language:es";
              console.log(`[WEBHOOK] Auto-detected Spanish in conversation ${conversation.id}`);
              await supabase.from("contact_memories").insert({
                conversation_id: conversation.id,
                memory_type: "language",
                content: "language:es",
              });
            }
          }
        }
        
        systemPrompt = buildAgentSystemPrompt(agentData, knowledgeText, docsText, pixKey || undefined);
        
        // Inject language override into system prompt
        if (languageHint === "language:es") {
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
          console.log(`[WEBHOOK] Injected Spanish language override (with prompt sanitization) for conversation ${conversation.id}`);
        }
        
        console.log(`[WEBHOOK] Using per-agent prompt for agent ${instanceCreds.agent_id}, model=${agentData.ai_model || "default"}, temp=${agentData.temperature ?? 0.7}, knowledge=${knowledgeLinks?.length || 0} entries, docs=${docs?.length || 0}, lang=${languageHint || "pt"}`);
      } else {
        console.warn(`[WEBHOOK] Agent ${instanceCreds.agent_id} not found, falling back to agent_settings`);
        systemPrompt = buildSystemPrompt({ ...settings, pixKey: pixKey || undefined });
      }
    } else {
      // Fallback: no agent linked, use legacy agent_settings
      systemPrompt = buildSystemPrompt({ ...settings, pixKey: pixKey || undefined });
    }

    // 10. Call OpenAI GPT with function calling tools
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

    let hasDocument = !!(media && getMediaCategory(media.mimetype) === "document");

    // Inject multimodal content for current image message
    if (media && mediaBase64 && getMediaCategory(media.mimetype) === "image") {
      const multimodalContent = await buildMultimodalContent(media, text, mediaBase64);
      // Replace the last user message content with multimodal array
      const lastUserIdx = chatMessages.map((m: any) => m.role).lastIndexOf("user");
      if (lastUserIdx >= 0) {
        chatMessages[lastUserIdx].content = multimodalContent;
        console.log(`[WEBHOOK] Injected multimodal image into message index ${lastUserIdx}`);
      }
      hasDocument = true; // Force gpt-4o (vision model)
    }

    // Inject audio transcription into AI context (use pre-transcribed text, no re-transcription)
    if (media && getMediaCategory(media.mimetype) === "audio" && audioTranscription) {
      const lastUserIdx = chatMessages.map((m: any) => m.role).lastIndexOf("user");
      if (lastUserIdx >= 0) {
        chatMessages[lastUserIdx].content = `[Áudio transcrito do cliente]: ${audioTranscription}`;
        console.log(`[WEBHOOK] Injected audio transcription into message index ${lastUserIdx}`);
      }
    }

    // Inject PDF/document content for GPT-4o native PDF analysis
    if (media && mediaBase64 && getMediaCategory(media.mimetype) === "document") {
      const lastUserIdx = chatMessages.map((m: any) => m.role).lastIndexOf("user");
      if (lastUserIdx >= 0) {
        const mimeType = media.mimetype || "application/pdf";
        chatMessages[lastUserIdx].content = [
          { type: "file", file: { filename: media.filename || "documento.pdf", file_data: `data:${mimeType};base64,${mediaBase64}` } },
          { type: "text", text: text || "O cliente enviou este documento. Analise o conteúdo." },
        ];
        console.log(`[WEBHOOK] Injected PDF/document into message index ${lastUserIdx}, mime=${mimeType}, size=${mediaBase64.length}`);
      }
      hasDocument = true; // Force gpt-4o for document analysis
    }

    // Also check if any historical message has images (force vision model)
    const hasHistoricalImages = chatMessages.some((m: any) => Array.isArray(m.content));
    if (hasHistoricalImages) {
      hasDocument = true;
    }

    // Fetch active products to inject names into tool descriptions
    const { data: pepperProducts } = await supabase.from("pepper_products").select("name").eq("active", true);
    const productNames = (pepperProducts || []).map((p: any) => p.name);
    const funnelTools = buildFunnelTools(productNames);
    let pendingQrCodeUrl: string | null = null;
    let pendingPixBrcode: string | null = null;

    // Inject pending PIX context so the AI knows not to generate a new one
    const flowState = conversation.flow_state as any;
    if (flowState?.pending_pix) {
      const pp = flowState.pending_pix;
      const pixAge = (Date.now() - new Date(pp.created_at).getTime()) / (1000 * 60 * 60);
      if (pixAge < 24) { // Only inject if PIX is less than 24h old
        const priceStr = pp.amount ? `R$ ${(pp.amount / 100).toFixed(2)}` : "";
        const pixCtx = `[SISTEMA: Existe um PIX pendente para este cliente. Produto: ${pp.product_name || ""}. Valor: ${priceStr}. Código copia e cola: ${pp.pix_code || ""}. Link: ${pp.pix_url || ""}. transaction_id: ${pp.transaction_id || ""}. NÃO gere novo PIX. Se o cliente pedir o PIX de novo, PRIORIZE enviar o código copia e cola PRIMEIRO como texto puro (sem formatação) para facilitar a cópia no WhatsApp. O link é secundário.]`;
        chatMessages.unshift({ role: "user", content: pixCtx });
        chatMessages.unshift({ role: "assistant", content: "Entendido. Vou usar os dados do PIX já existente." });
        console.log(`[WEBHOOK] Injected pending_pix context: txn=${pp.transaction_id}, age=${pixAge.toFixed(1)}h`);
      }
    }
    
    // Call OpenAI with retry on 429
    let aiResult: any;
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        aiResult = await callOpenAI({
          systemPrompt,
          messages: chatMessages,
          apiKey: OPENAI_API_KEY,
          hasDocument,
          tools: funnelTools,
          agentModel: agentDataRef?.ai_model || null,
          temperature: agentDataRef?.temperature ?? null,
          maxTokens: agentDataRef?.max_tokens || null,
          messageCount: totalRawCount,
        });
        break; // Success, exit retry loop
      } catch (err: any) {
        const status = err?.status || err?.response?.status;
        if (status === 429 && attempt < MAX_RETRIES) {
          const delay = (attempt + 1) * 2000; // 2s, 4s
          console.warn(`[WEBHOOK] OpenAI 429 rate limit, retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw err; // Non-429 or exhausted retries
      }
    }
    let { reply, usage: aiUsage, model: modelUsed, tool_calls } = aiResult;

    // 10a. Process tool calls if any
    if (tool_calls && tool_calls.length > 0) {
      console.log(`[WEBHOOK] Processing ${tool_calls.length} tool calls`);
      const toolResults: { tool_call_id: string; content: string }[] = [];

      for (const tc of tool_calls) {
        const fnName = tc.function.name;
        const args = JSON.parse(tc.function.arguments || "{}");
        console.log(`[WEBHOOK] Tool call: ${fnName}`, args);

        if (fnName === "move_lead_stage") {
          const newStage = args.stage;
          // Guard: prevent funnel regression (only allow forward moves or "perdido")
          const STAGE_ORDER: Record<string, number> = { novo: 0, qualificado: 1, proposta: 2, fechado: 3, perdido: 4 };
          const currentIdx = STAGE_ORDER[conversation.lead_stage] ?? 0;
          const newIdx = STAGE_ORDER[newStage] ?? 0;
          const isRegression = newStage !== "perdido" && newIdx < currentIdx;

          if (isRegression) {
            console.log(`[WEBHOOK] BLOCKED funnel regression: ${conversation.lead_stage}(${currentIdx}) -> ${newStage}(${newIdx})`);
            toolResults.push({ tool_call_id: tc.id, content: `Não é possível mover o lead de "${conversation.lead_stage}" para "${newStage}". O lead já está em uma etapa mais avançada do funil. Apenas avanços são permitidos.` });
          } else if (conversation.lead_stage !== newStage) {
            await supabase
              .from("conversations")
              .update({ lead_stage: newStage })
              .eq("id", conversation.id);
            console.log(`[WEBHOOK] Lead stage moved: ${conversation.lead_stage} -> ${newStage}`);
            conversation.lead_stage = newStage;
            toolResults.push({ tool_call_id: tc.id, content: `Lead movido para etapa "${newStage}" com sucesso.` });

            // A/B stats: increment stats_qualified or stats_converted
            try {
              const convFlowState = conversation.flow_state as any;
              const convFlowId = convFlowState?.flow_id;
              if (convFlowId) {
                if (newStage === "qualificado") {
                  const { data: currentFlow } = await supabase.from("chatbot_flows").select("stats_qualified").eq("id", convFlowId).maybeSingle();
                  if (currentFlow) {
                    await supabase.from("chatbot_flows").update({ stats_qualified: (currentFlow.stats_qualified || 0) + 1 }).eq("id", convFlowId);
                    console.log(`[WEBHOOK] A/B stats: incremented stats_qualified for flow ${convFlowId}`);
                  }
                } else if (newStage === "fechado") {
                  const { data: currentFlow } = await supabase.from("chatbot_flows").select("stats_converted").eq("id", convFlowId).maybeSingle();
                  if (currentFlow) {
                    await supabase.from("chatbot_flows").update({ stats_converted: (currentFlow.stats_converted || 0) + 1 }).eq("id", convFlowId);
                    console.log(`[WEBHOOK] A/B stats: incremented stats_converted for flow ${convFlowId}`);
                  }
                }
              }
            } catch (abErr) {
              console.warn("[WEBHOOK] A/B stats update error:", abErr);
            }

            // Auto-register meta events for stage changes
            const META_PIXEL_ID = Deno.env.get("META_PIXEL_ID");
            const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN");
            console.log(`[WEBHOOK] Meta CAPI config: pixelId=${META_PIXEL_ID ? "SET" : "MISSING"}, token=${META_ACCESS_TOKEN ? "SET" : "MISSING"}`);
            if (META_PIXEL_ID && META_ACCESS_TOKEN) {
              const stageEventMap: Record<string, string> = {
                qualificado: "Lead",
                proposta: "InitiateCheckout",
              };
              const autoEvent = stageEventMap[newStage];
              if (autoEvent) {
                const adAttr = await getAdAttribution(supabase, conversation.id);
                const metaEventId = await sendMetaConversionEvent({
                  pixelId: META_PIXEL_ID,
                  accessToken: META_ACCESS_TOKEN,
                  eventName: autoEvent,
                  value: 0,
                  currency: "BRL",
                  phone: cleanPhone,
                  ...adAttr,
                });
                await supabase.from("conversions").insert({
                  conversation_id: conversation.id,
                  event_name: autoEvent,
                  value: 0,
                  sent_to_meta: !!metaEventId,
                  meta_event_id: metaEventId,
                });
              }
            }
          } else {
            toolResults.push({ tool_call_id: tc.id, content: `Lead já está na etapa "${newStage}".` });
          }
        } else if (fnName === "register_conversion") {
          const eventName = args.event_name || "Purchase";
          const value = args.value || 0;

          // Check for duplicate: skip if same event already exists for this conversation
          const { data: existingConversion } = await supabase
            .from("conversions")
            .select("id")
            .eq("conversation_id", conversation.id)
            .eq("event_name", eventName)
            .limit(1)
            .maybeSingle();

          // Also check if lead_stage is already "fechado" — means purchase was already processed
          const isAlreadyClosed = conversation.lead_stage === "fechado";

          if (existingConversion || isAlreadyClosed) {
            console.log(`[WEBHOOK] Duplicate conversion blocked: ${eventName} for ${conversation.id} (existing=${!!existingConversion}, closed=${isAlreadyClosed})`);
            toolResults.push({ tool_call_id: tc.id, content: `Conversão "${eventName}" já foi registrada anteriormente para este cliente. Não foi duplicada.` });
          } else {
            // Save conversion
            const conversionData: any = {
              conversation_id: conversation.id,
              event_name: eventName,
              value,
              currency: "BRL",
              sent_to_meta: false,
            };

            // Send to Meta if configured
            const META_PIXEL_ID = Deno.env.get("META_PIXEL_ID");
            const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN");
            if (META_PIXEL_ID && META_ACCESS_TOKEN) {
              const adAttr2 = await getAdAttribution(supabase, conversation.id);
              const metaEventId = await sendMetaConversionEvent({
                pixelId: META_PIXEL_ID,
                accessToken: META_ACCESS_TOKEN,
                eventName,
                value,
                currency: "BRL",
                phone: cleanPhone,
                ...adAttr2,
              });
              conversionData.sent_to_meta = !!metaEventId;
              conversionData.meta_event_id = metaEventId;
            }

            await supabase.from("conversions").insert(conversionData);
            console.log(`[WEBHOOK] Conversion registered: ${eventName} R$${value}`);
            toolResults.push({ tool_call_id: tc.id, content: `Conversão "${eventName}" de R$${value} registrada com sucesso.` });
          }
        } else if (fnName === "check_payment_status") {
          const transactionId = args.transaction_id || "";
          if (!transactionId) {
            toolResults.push({ tool_call_id: tc.id, content: JSON.stringify({ error: "transaction_id é obrigatório" }) });
          } else {
            const PEPPER_API_TOKEN = Deno.env.get("PEPPER_API_TOKEN");
            if (!PEPPER_API_TOKEN) {
              toolResults.push({ tool_call_id: tc.id, content: JSON.stringify({ error: "PEPPER_API_TOKEN não configurado." }) });
            } else {
              try {
                const statusResp = await fetch(`https://api.cloud.pepperpay.com.br/public/v1/transactions/${transactionId}`, {
                  method: "GET",
                  headers: {
                    "Accept": "application/json",
                    Authorization: `Bearer ${PEPPER_API_TOKEN}`,
                  },
                });
                if (!statusResp.ok) {
                  toolResults.push({ tool_call_id: tc.id, content: JSON.stringify({ error: `Erro ao consultar: ${statusResp.status}` }) });
                } else {
                  const statusData = await statusResp.json();
                  const payStatus = statusData.payment_status || statusData.status || "unknown";
                  const statusMap: Record<string, string> = {
                    waiting_payment: "Aguardando pagamento",
                    paid: "Pago",
                    refused: "Recusado",
                    refunded: "Reembolsado",
                  };
                  toolResults.push({ tool_call_id: tc.id, content: JSON.stringify({ transaction_id: transactionId, status: payStatus, status_label: statusMap[payStatus] || payStatus }) });
                }
              } catch (checkErr) {
                console.error("[WEBHOOK] check_payment_status error:", checkErr);
                toolResults.push({ tool_call_id: tc.id, content: JSON.stringify({ error: "Falha ao consultar status." }) });
              }
            }
        }
      } else if (fnName === "generate_pix_manual") {
          // PIX manual: send EVP key directly
          const pixKey = settings.pix_evp_key || Deno.env.get("PIX_EVP_KEY") || "";
          if (!pixKey) {
            toolResults.push({ tool_call_id: tc.id, content: "Erro: Chave PIX não configurada. Configure na página de configurações." });
          } else {
            const pName = args.product_name || "";
            // Set pendingPixBrcode so it gets sent as copyable text + PIX button after AI reply
            pendingPixBrcode = pixKey;
            console.log(`[WEBHOOK] generate_pix_manual: sending EVP key as text + PIX button`);

            // Find product price if product_name given
            let priceInfo = "";
            if (pName) {
              const normalizedSearch = pName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              const matchedProduct = (pepperProducts || []).find((p: any) => {
                const normalizedName = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return normalizedName.includes(normalizedSearch) || normalizedSearch.includes(normalizedName);
              });
              // We only have name from pepperProducts query, need price from full query
              if (matchedProduct) {
                const { data: fullProduct } = await supabase.from("pepper_products").select("price_cents").eq("name", matchedProduct.name).eq("active", true).maybeSingle();
                if (fullProduct) {
                  priceInfo = ` Valor: R$ ${(fullProduct.price_cents / 100).toFixed(2)}.`;
                }
              }
            }

            toolResults.push({ tool_call_id: tc.id, content: `Chave PIX enviada diretamente ao cliente como texto copiável e botão nativo.${priceInfo} O cliente pode copiar a chave e pagar. NÃO inclua a chave PIX na sua resposta — ela já foi enviada automaticamente. Apenas confirme que o PIX foi enviado e peça para o cliente efetuar o pagamento.` });
          }
        } else if (fnName === "generate_site_payment") {
          // Site payment: send checkout URL
          const pName = args.product_name || "";
          let checkoutUrl = "";

          // Try to build checkout URL from pepper_products offer_hash
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
              const priceFormatted = (matchedProduct.price_cents / 100).toFixed(2);
              toolResults.push({ tool_call_id: tc.id, content: `Link do site para "${matchedProduct.name}" (R$ ${priceFormatted}): ${checkoutUrl}` });
            }
          }

          // Fallback: use card_payment_url from settings
          if (!checkoutUrl) {
            checkoutUrl = settings.card_payment_url || Deno.env.get("CARD_PAYMENT_URL") || "";
            if (checkoutUrl) {
              toolResults.push({ tool_call_id: tc.id, content: `Link do site para compra: ${checkoutUrl}` });
            } else {
              toolResults.push({ tool_call_id: tc.id, content: "Erro: Link de checkout não configurado. Configure na página de configurações." });
            }
          }
        } else if (fnName === "generate_card_payment") {
          const cardUrl = settings.card_payment_url || Deno.env.get("CARD_PAYMENT_URL");
          if (!cardUrl) {
            toolResults.push({ tool_call_id: tc.id, content: "Erro: link de pagamento por cartao nao configurado." });
          } else {
            const pName = args.product_name || "produto";
            toolResults.push({
              tool_call_id: tc.id,
              content: `Link de pagamento por cartao para "${pName}": ${cardUrl}`,
            });
          }
        } else if (fnName === "send_social_proof") {
          try {
            const { data: feedbacks } = await supabase
              .from("customer_feedbacks")
              .select("image_url, description")
              .eq("active", true);
            if (feedbacks && feedbacks.length > 0) {
              const randomFeedback = feedbacks[Math.floor(Math.random() * feedbacks.length)];
              await sendUazapiImage(randomFeedback.image_url, randomFeedback.description || "Depoimento de cliente");
              toolResults.push({ tool_call_id: tc.id, content: "Print de feedback de cliente enviado com sucesso como prova social. NÃO mencione que enviou uma imagem, apenas continue a conversa naturalmente." });
            } else {
              toolResults.push({ tool_call_id: tc.id, content: "Nenhum feedback de cliente cadastrado. Continue a conversa sem prova social." });
            }
          } catch (spErr) {
            console.error("[WEBHOOK] send_social_proof error:", spErr);
            toolResults.push({ tool_call_id: tc.id, content: "Erro ao buscar feedback. Continue normalmente." });
          }
        } else if (fnName === "validate_receipt") {
          const receiptValue = args.value || 0;
          const receiptDate = args.date || "";
          const receiptTime = args.time || "";
          const beneficiaryName = args.beneficiary_name || "";
          const isVisuallyValid = args.is_valid !== false;

          console.log(`[WEBHOOK] validate_receipt: value=${receiptValue}, date=${receiptDate}, time=${receiptTime}, beneficiary=${beneficiaryName}, visually_valid=${isVisuallyValid}`);

          if (!isVisuallyValid) {
            toolResults.push({ tool_call_id: tc.id, content: JSON.stringify({ valid: false, reason: "O comprovante não parece legítimo. Peça ao cliente enviar novamente com melhor qualidade." }) });
          } else if (!receiptDate || !receiptTime) {
            toolResults.push({ tool_call_id: tc.id, content: JSON.stringify({ valid: false, reason: "Não foi possível extrair data e hora do comprovante. Peça ao cliente enviar novamente." }) });
          } else {
            // Parse receipt date/time (DD/MM/YYYY HH:MM)
            const dateParts = receiptDate.split("/");
            let receiptTimestamp: number | null = null;
            if (dateParts.length === 3) {
              const [day, month, year] = dateParts;
              const timeParts = receiptTime.split(":");
              const hour = timeParts[0] || "00";
              const minute = timeParts[1] || "00";
              const dateStr = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:00-03:00`;
              const parsed = new Date(dateStr);
              if (!isNaN(parsed.getTime())) {
                receiptTimestamp = parsed.getTime();
              }
            }

            if (!receiptTimestamp) {
              toolResults.push({ tool_call_id: tc.id, content: JSON.stringify({ valid: false, reason: "Data/hora do comprovante não pôde ser interpretada. Peça ao cliente enviar novamente." }) });
            } else {
              const now = Date.now();
              const hoursDiff = (now - receiptTimestamp) / (1000 * 60 * 60);

              if (hoursDiff > 48) {
                toolResults.push({ tool_call_id: tc.id, content: JSON.stringify({ valid: false, reason: `Comprovante com mais de 48 horas (${Math.round(hoursDiff)}h atrás). Comprovantes antigos não são aceitos. Peça um comprovante recente.` }) });
              } else if (receiptTimestamp > now + 60 * 60 * 1000) {
                toolResults.push({ tool_call_id: tc.id, content: JSON.stringify({ valid: false, reason: "A data do comprovante é no futuro. Comprovante inválido." }) });
              } else {
                // Check value against products
                const { data: products } = await supabase.from("pepper_products").select("*").eq("active", true);
                const matchingProduct = (products || []).find((p: any) => {
                  const productValue = p.price_cents / 100;
                  return Math.abs(productValue - receiptValue) < 1; // tolerance R$1
                });

                if (!matchingProduct) {
                  const expectedValues = (products || []).map((p: any) => `R$ ${(p.price_cents / 100).toFixed(2)} (${p.name})`).join(", ");
                  toolResults.push({ tool_call_id: tc.id, content: JSON.stringify({ valid: false, reason: `Valor do comprovante (R$ ${receiptValue.toFixed(2)}) não corresponde a nenhum produto. Valores esperados: ${expectedValues || "nenhum produto cadastrado"}.` }) });
                } else {
                  // VALID! Auto-register everything
                  const productValue = matchingProduct.price_cents / 100;
                  console.log(`[WEBHOOK] validate_receipt: VALID! product=${matchingProduct.name}, value=${productValue}, hours_ago=${hoursDiff.toFixed(1)}`);

                  // 1. Move lead to "fechado"
                  const STAGE_ORDER_VR: Record<string, number> = { novo: 0, qualificado: 1, proposta: 2, fechado: 3, perdido: 4 };
                  const currentIdx = STAGE_ORDER_VR[conversation.lead_stage] ?? 0;
                  if (currentIdx < 3) {
                    await supabase.from("conversations").update({ lead_stage: "fechado" }).eq("id", conversation.id);
                    conversation.lead_stage = "fechado";
                    console.log(`[WEBHOOK] validate_receipt: lead moved to fechado`);
                  }

                  // 2. Register conversion + Meta CAPI
                  const conversionData: any = {
                    conversation_id: conversation.id,
                    event_name: "Purchase",
                    value: productValue,
                    currency: "BRL",
                    sent_to_meta: false,
                  };

                  const META_PIXEL_ID_VR = Deno.env.get("META_PIXEL_ID");
                  const META_ACCESS_TOKEN_VR = Deno.env.get("META_ACCESS_TOKEN");
                  if (META_PIXEL_ID_VR && META_ACCESS_TOKEN_VR) {
                    const adAttrVR = await getAdAttribution(supabase, conversation.id);
                    const metaEvtId = await sendMetaConversionEvent({
                      pixelId: META_PIXEL_ID_VR,
                      accessToken: META_ACCESS_TOKEN_VR,
                      eventName: "Purchase",
                      value: productValue,
                      currency: "BRL",
                      phone: cleanPhone,
                      ...adAttrVR,
                    });
                    conversionData.sent_to_meta = !!metaEvtId;
                    conversionData.meta_event_id = metaEvtId;
                    console.log(`[WEBHOOK] validate_receipt: Meta CAPI sent, eventId=${metaEvtId}`);
                  }

                  await supabase.from("conversions").insert(conversionData);

                  // 3. A/B stats
                  try {
                    const convFlowState = conversation.flow_state as any;
                    const convFlowId = convFlowState?.flow_id;
                    if (convFlowId) {
                      const { data: currentFlow } = await supabase.from("chatbot_flows").select("stats_converted").eq("id", convFlowId).maybeSingle();
                      if (currentFlow) {
                        await supabase.from("chatbot_flows").update({ stats_converted: (currentFlow.stats_converted || 0) + 1 }).eq("id", convFlowId);
                      }
                    }
                  } catch (abErr) {
                    console.warn("[WEBHOOK] validate_receipt A/B stats error:", abErr);
                  }

                  toolResults.push({ tool_call_id: tc.id, content: JSON.stringify({ valid: true, product: matchingProduct.name, value: productValue, message: `Comprovante validado com sucesso! Pagamento de R$ ${productValue.toFixed(2)} para "${matchingProduct.name}" confirmado. Lead movido para fechado e conversão registrada.` }) });
                }
              }
            }
          }
        }
      }

      // Second call to get final text reply after tool execution
      const assistantToolCallMessage = {
        role: "assistant",
        content: reply || null,
        tool_calls: tool_calls,
      };

      const secondResult = await callOpenAIWithToolResults({
        systemPrompt,
        messages: chatMessages,
        apiKey: OPENAI_API_KEY,
        assistantToolCallMessage,
        toolResults,
        hasDocument,
        agentModel: agentDataRef?.ai_model || null,
        temperature: agentDataRef?.temperature ?? null,
        maxTokens: agentDataRef?.max_tokens || null,
        messageCount: totalRawCount,
      });

      reply = secondResult.reply;
      // Accumulate usage
      if (secondResult.usage && aiUsage) {
        aiUsage.prompt_tokens += secondResult.usage.prompt_tokens;
        aiUsage.completion_tokens += secondResult.usage.completion_tokens;
        aiUsage.total_tokens += secondResult.usage.total_tokens;
      } else if (secondResult.usage) {
        aiUsage = secondResult.usage;
      }
    }

    if (!reply || reply.trim() === "") {
      console.error(`[WEBHOOK] WARNING: AI generated empty reply! media=${!!media}, mediaCategory=${media ? getMediaCategory(media.mimetype) : "none"}, text="${text?.substring(0, 50)}"`);
      reply = "Desculpe, não consegui processar sua mensagem. Pode repetir?";
    }
    console.log(`[WEBHOOK] AI reply preview: "${reply.substring(0, 120)}"`);

    // (Loop guard removed - simplified architecture)

    // 10b. Save token usage
    try {
      if (aiUsage) {
        const isGpt4o = modelUsed === "gpt-4o";
        const costUsd = isGpt4o
          ? (aiUsage.prompt_tokens * 2.50 / 1_000_000) + (aiUsage.completion_tokens * 10.00 / 1_000_000)
          : (aiUsage.prompt_tokens * 0.15 / 1_000_000) + (aiUsage.completion_tokens * 0.60 / 1_000_000);
        await supabase.from("token_usage").insert({
          conversation_id: conversation.id,
          prompt_tokens: aiUsage.prompt_tokens,
          completion_tokens: aiUsage.completion_tokens,
          total_tokens: aiUsage.total_tokens,
          cost_usd: costUsd,
          model: modelUsed,
          usage_type: media ? getMediaCategory(media.mimetype) === "audio" ? "audio" : "chat" : "chat",
        });
      }
    } catch (e) {
      console.warn("[WEBHOOK] Failed to save token usage:", e);
    }

    // 11. Save AI response (full reply, even if split)
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: reply,
    });

    // 12. Update conversation timestamp
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString(), status: "active" })
      .eq("id", conversation.id);

    // 13. Send "read" receipt first (human reads before typing)
    await sendReadReceipt();
    // Small delay between "read" and "typing" (human reads the message first)
    const readDelay = Math.floor(Math.random() * 2000) + 500; // 0.5-2.5s
    await sleep(readDelay);

    // 14. Split reply if ---SPLIT--- marker present (humanized mode)
    const splitParts = reply.split(/---SPLIT---/i).map((p: string) => p.trim()).filter(Boolean);

    if (splitParts.length > 1) {
      // Humanized multi-message send
      console.log(`[WEBHOOK] Sending ${splitParts.length} split messages (humanized mode)`);
      for (let i = 0; i < splitParts.length; i++) {
        const part = splitParts[i];
        await sendComposing();
        const typingDelay = calcTypingDelay(part);
        console.log(`[WEBHOOK] Split ${i + 1}/${splitParts.length}: ${part.length} chars, delay=${typingDelay}ms`);
        await sleep(typingDelay);
        await sendUazapi(part);
        // Small pause between messages (human doesn't send instantly)
        if (i < splitParts.length - 1) {
          await sleep(Math.floor(Math.random() * 1000) + 300);
        }
      }
    } else {
      // Single message: composing + proportional delay
      await sendComposing();
      const delayMin = (settings.response_delay_min || 3) * 1000;
      const delayMax = (settings.response_delay_max || 12) * 1000;
      // Use proportional delay: blend random range with text-based calculation
      const textDelay = calcTypingDelay(reply);
      const randomDelay = Math.floor(Math.random() * (delayMax - delayMin)) + delayMin;
      const finalDelay = Math.min(Math.max(textDelay, delayMin), delayMax);
      console.log(`[WEBHOOK] Single message: ${reply.length} chars, delay=${finalDelay}ms (text=${textDelay}, range=${delayMin}-${delayMax})`);
      await sleep(finalDelay);
      await sendUazapi(reply);
    }

    // 15. Send PIX copia e cola as plain text (copyable)
    if (pendingPixBrcode) {
      console.log(`[WEBHOOK] Sending PIX copia e cola as text: ${pendingPixBrcode.slice(0, 30)}...`);
      await sleep(1000);
      await sendUazapi(pendingPixBrcode);
    }

    // 15.5. Send QR code image if available
    if (pendingQrCodeUrl) {
      console.log(`[WEBHOOK] Sending QR code image: ${pendingQrCodeUrl.slice(0, 80)}`);
      await sleep(500);
      await sendUazapiImage(pendingQrCodeUrl, "QR Code PIX");
    }

    // 16. Send native PIX button if brcode available
    if (pendingPixBrcode) {
      console.log(`[WEBHOOK] Sending PIX button (EVP default)...`);
      await sleep(500);
      await sendUazapiPixButton();
    }

    // Mark webhook_log as processed
    if (webhookLogId && logSupabase) {
      await logSupabase.from("webhook_logs").update({ processed: true }).eq("id", webhookLogId);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    // Save error to webhook_log
    if (webhookLogId && logSupabase) {
      try {
        await logSupabase.from("webhook_logs").update({ error: String(err) }).eq("id", webhookLogId);
      } catch (_e) {
        console.error("[WEBHOOK] Failed to save error to webhook_log:", _e);
      }
    }
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
