import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { buildAgentSystemPrompt } from "../_shared/ai-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { agent_id, messages } = await req.json();
    if (!agent_id || !messages) throw new Error("agent_id and messages required");

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Fetch agent (RLS ensures ownership)
    const { data: agent, error: agentErr } = await supabase.from("agents").select("*").eq("id", agent_id).single();
    if (agentErr || !agent) {
      return new Response(JSON.stringify({ error: "Agent not found" }), { status: 404, headers: corsHeaders });
    }

    // Fetch knowledge
    const { data: links } = await supabase.from("agent_knowledge").select("knowledge_entry_id").eq("agent_id", agent_id);
    let knowledgeText = "";
    if (links?.length) {
      const ids = links.map((l: any) => l.knowledge_entry_id);
      const { data: entries } = await supabase.from("knowledge_entries").select("question, answer").in("id", ids);
      if (entries?.length) {
        knowledgeText = entries.map((e: any) => `P: ${e.question}\nR: ${e.answer}`).join("\n\n");
      }
    }

    // Fetch documents
    const { data: docs } = await supabase
      .from("knowledge_documents")
      .select("file_name, extracted_text")
      .eq("agent_id", agent_id)
      .eq("status", "completed");
    let docsText = "";
    if (docs?.length) {
      docsText = docs.map((d: any) => `[Documento: ${d.file_name}]\n${d.extracted_text}`).join("\n\n");
    }

    // Use the SHARED prompt builder from ai-engine.ts
    const systemPrompt = buildAgentSystemPrompt(agent, knowledgeText, docsText);

    // Determine model — all models go through OpenAI directly
    const MODEL_MAP: Record<string, string> = {
      "google/gemini-3-flash-preview": "gpt-4o-mini",
      "google/gemini-2.5-pro": "gpt-4o",
      "google/gemini-2.5-flash": "gpt-4o-mini",
      "openai/gpt-5-mini": "gpt-4o-mini",
      "openai/gpt-5": "gpt-4o",
      "openai-direct/gpt-4o-mini": "gpt-4o-mini",
      "openai-direct/gpt-4o": "gpt-4o",
    };

    const rawModel = agent.ai_model || "gpt-4o-mini";
    const modelName = MODEL_MAP[rawModel] || rawModel;
    const apiUrl = "https://api.openai.com/v1/chat/completions";
    const apiKey = Deno.env.get("OPENAI_API_KEY") || "";

    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

    const contextLimit = agent.context_limit || 20;
    const recentMessages = messages.slice(-contextLimit);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "system", content: systemPrompt },
          ...recentMessages,
        ],
        stream: true,
        temperature: Number(agent.temperature ?? 0.7),
        max_tokens: agent.max_tokens || 4096,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI API error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Add credits to continue." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "AI error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("agent-playground error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
