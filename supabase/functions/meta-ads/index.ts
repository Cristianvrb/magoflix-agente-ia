import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mapMetaError(metaError: any) {
  const code = Number(metaError?.code ?? 0);
  const status = code === 200 ? 403 : 400;
  const hint =
    code === 200
      ? "Grant ads_read or ads_management permission to this ad account and regenerate the access token."
      : code === 100
      ? "Check META_AD_ACCOUNT_ID format (act_<digits>) and campaign_id values."
      : "Check credentials, account access, and requested resources in Meta Graph API.";

  return {
    status,
    body: {
      error: metaError?.message || "Meta API request failed",
      meta_code: code || null,
      meta_type: metaError?.type || null,
      meta_subcode: metaError?.error_subcode || null,
      hint,
    },
  };
}

function normalizeAccountId(id: string): string {
  let normalized = id.trim();
  if (!normalized.startsWith("act_")) {
    normalized = `act_${normalized}`;
  }
  return normalized;
}

async function getCredentials(): Promise<{ accessToken: string; adAccountId: string } | null> {
  // Try meta_settings table first
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const { data } = await sb.from("meta_settings").select("key, value");
    if (data && data.length > 0) {
      const map: Record<string, string> = {};
      for (const row of data) {
        map[row.key] = row.value;
      }
      if (map["access_token"] && map["ad_account_id"]) {
        return {
          accessToken: map["access_token"],
          adAccountId: normalizeAccountId(map["ad_account_id"]),
        };
      }
    }
  } catch {
    // fallback to env
  }

  // Fallback to env vars
  const accessToken = Deno.env.get("META_ACCESS_TOKEN");
  let adAccountId = Deno.env.get("META_AD_ACCOUNT_ID");
  if (!accessToken || !adAccountId) return null;

  return { accessToken, adAccountId: normalizeAccountId(adAccountId) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "campaigns";

    // ========== TEST CONNECTION ==========
    if (action === "test_connection") {
      const body = await req.json();
      const { access_token, ad_account_id } = body;
      if (!access_token || !ad_account_id) {
        return json({ error: "access_token e ad_account_id são obrigatórios" }, 400);
      }
      const normalized = normalizeAccountId(ad_account_id);
      if (!/^act_\d+$/.test(normalized)) {
        return json({ error: "Formato inválido. Use act_<digits> ou apenas os dígitos.", hint: "Exemplo: act_1234567890" }, 400);
      }

      const res = await fetch(
        `${GRAPH_API}/${normalized}?fields=name,account_status&access_token=${access_token}`
      );
      const data = await res.json();
      if (data.error) {
        const mapped = mapMetaError(data.error);
        return json(mapped.body, mapped.status);
      }
      return json({
        success: true,
        account_name: data.name,
        account_status: data.account_status,
        account_id: normalized,
      });
    }

    // Get credentials for all other actions
    const creds = await getCredentials();
    if (!creds) {
      return json({
        error: "Credenciais Meta não configuradas. Use o botão Configurar para adicionar seu Access Token e Ad Account ID.",
        hint: "Clique no ícone de engrenagem na página de Campanhas.",
      }, 500);
    }

    const { accessToken, adAccountId } = creds;

    if (!/^act_\d+$/.test(adAccountId)) {
      return json(
        {
          error: "Invalid META_AD_ACCOUNT_ID format. Expected act_<digits>.",
          hint: "Use a value like act_1234567890 (or only digits, which will be prefixed automatically).",
        },
        400,
      );
    }

    // GET campaigns list
    if (action === "campaigns") {
      const fields = "name,status,daily_budget,lifetime_budget,objective,created_time,updated_time";
      const res = await fetch(
        `${GRAPH_API}/${adAccountId}/campaigns?fields=${fields}&limit=100&access_token=${accessToken}`
      );
      const data = await res.json();
      if (data.error) {
        const mapped = mapMetaError(data.error);
        return json(mapped.body, mapped.status);
      }
      return json({ campaigns: data.data || [] });
    }

    // GET insights for a campaign or account
    if (action === "insights") {
      const campaignId = url.searchParams.get("campaign_id");
      const datePreset = url.searchParams.get("date_preset") || "last_30d";
      const timeIncrement = url.searchParams.get("time_increment") || "1";
      
      const target = campaignId || adAccountId;
      const fields = "spend,impressions,clicks,cpc,cpm,ctr,reach,actions";
      const res = await fetch(
        `${GRAPH_API}/${target}/insights?fields=${fields}&date_preset=${datePreset}&time_increment=${timeIncrement}&access_token=${accessToken}`
      );
      const data = await res.json();
      if (data.error) {
        const mapped = mapMetaError(data.error);
        return json(mapped.body, mapped.status);
      }
      return json({ insights: data.data || [] });
    }

    // GET account-level insights (aggregated)
    if (action === "account_insights") {
      const datePreset = url.searchParams.get("date_preset") || "last_30d";
      const fields = "spend,impressions,clicks,cpc,cpm,ctr,reach,actions";
      const res = await fetch(
        `${GRAPH_API}/${adAccountId}/insights?fields=${fields}&date_preset=${datePreset}&access_token=${accessToken}`
      );
      const data = await res.json();
      if (data.error) {
        const mapped = mapMetaError(data.error);
        return json(mapped.body, mapped.status);
      }
      return json({ insights: data.data || [] });
    }

    // POST pause campaign
    if (action === "pause") {
      const body = await req.json();
      const campaignId = body.campaign_id;
      if (!campaignId) return json({ error: "campaign_id required" }, 400);

      const res = await fetch(
        `${GRAPH_API}/${campaignId}?access_token=${accessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "PAUSED" }),
        }
      );
      const data = await res.json();
      if (data.error) {
        const mapped = mapMetaError(data.error);
        return json(mapped.body, mapped.status);
      }
      return json({ success: true, status: "PAUSED" });
    }

    // POST activate campaign
    if (action === "activate") {
      const body = await req.json();
      const campaignId = body.campaign_id;
      if (!campaignId) return json({ error: "campaign_id required" }, 400);

      const res = await fetch(
        `${GRAPH_API}/${campaignId}?access_token=${accessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ACTIVE" }),
        }
      );
      const data = await res.json();
      if (data.error) {
        const mapped = mapMetaError(data.error);
        return json(mapped.body, mapped.status);
      }
      return json({ success: true, status: "ACTIVE" });
    }

    // POST update budget
    if (action === "budget") {
      const body = await req.json();
      const campaignId = body.campaign_id;
      const dailyBudget = body.daily_budget;
      if (!campaignId || dailyBudget === undefined) {
        return json({ error: "campaign_id and daily_budget required" }, 400);
      }

      const res = await fetch(
        `${GRAPH_API}/${campaignId}?access_token=${accessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ daily_budget: String(dailyBudget) }),
        }
      );
      const data = await res.json();
      if (data.error) {
        const mapped = mapMetaError(data.error);
        return json(mapped.body, mapped.status);
      }
      return json({ success: true, daily_budget: dailyBudget });
    }

    // POST AI analysis
    if (action === "ai_insights") {
      const body = await req.json();
      const { campaigns_data, internal_data } = body;

      const prompt = `Você é um especialista em otimização de campanhas Meta Ads. Analise os dados abaixo e forneça insights acionáveis em português.

DADOS DAS CAMPANHAS META:
${JSON.stringify(campaigns_data, null, 2)}

DADOS INTERNOS DA PLATAFORMA (leads, conversões, receita):
${JSON.stringify(internal_data, null, 2)}

Forneça sua análise no seguinte formato JSON:
{
  "summary": "Resumo executivo em 2-3 frases",
  "insights": [
    {
      "type": "positive" | "negative" | "suggestion",
      "title": "Título curto",
      "description": "Descrição detalhada da análise",
      "action": "Ação recomendada específica"
    }
  ],
  "top_action": "A ação mais importante que deve ser feita agora"
}

Foque em:
1. Campanhas com bom CPC mas baixa conversão interna
2. Campanhas com alto gasto e baixo ROI
3. Oportunidades de escalar campanhas eficientes
4. Comparação entre custo Meta e receita real`;

      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
        }),
      });

      const aiContentType = aiRes.headers.get("content-type") || "";
      if (!aiContentType.includes("application/json")) {
        const textBody = await aiRes.text();
        console.error("AI API returned non-JSON:", aiRes.status, textBody.substring(0, 200));
        return json({ analysis: { summary: `Erro ao consultar IA (status ${aiRes.status}). Tente novamente.`, insights: [], top_action: "" } });
      }

      const aiData = await aiRes.json();
      const content = aiData.choices?.[0]?.message?.content || "";

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return json({ analysis: parsed });
        }
      } catch {
        // fallback
      }

      return json({ analysis: { summary: content, insights: [], top_action: "" } });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return json({ error: error.message }, 500);
  }
});
