import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PEPPER_BASE = "https://api.cloud.pepperpay.com.br/public/v1";

async function pepperFetch(path: string, method: string, token: string, body?: any) {
  const opts: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${token}`,
    },
  };
  if (body && (method === "POST" || method === "PUT")) {
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(`${PEPPER_BASE}${path}`, opts);
  const text = await resp.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!resp.ok) {
    console.error(`[PEPPER] ${method} ${path} -> ${resp.status}`, text.slice(0, 500));
    throw { status: resp.status, body: json };
  }
  return json;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const PEPPER_API_TOKEN = Deno.env.get("PEPPER_API_TOKEN");
    if (!PEPPER_API_TOKEN) {
      return new Response(
        JSON.stringify({ error: "PEPPER_API_TOKEN não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse action from body (POST) or default to list_products (GET)
    let action = "list_products";
    let params: any = {};
    
    if (req.method === "POST") {
      const body = await req.json();
      action = body.action || "list_products";
      params = body.params || {};
    }

    let result: any;

    switch (action) {
      // ========== PRODUCTS ==========
      case "list_products": {
        const resp = await pepperFetch("/products", "GET", PEPPER_API_TOKEN);
        const products = resp.data || resp || [];
        const formatted = (Array.isArray(products) ? products : []).map((p: any) => ({
          product_hash: p.hash || p.id || "",
          product_name: p.name || p.title || "",
          offers: (p.offers || []).map((o: any) => ({
            offer_hash: o.hash || o.id || "",
            offer_name: o.title || o.name || p.name || "",
            price_cents: o.price || o.amount || 0,
          })),
        }));
        result = { products: formatted };
        break;
      }

      case "create_product": {
        // params: { name, description?, price?, ... }
        const resp = await pepperFetch("/products", "POST", PEPPER_API_TOKEN, params);
        result = { product: resp.data || resp };
        break;
      }

      // ========== OFFERS ==========
      case "create_offer": {
        // params: { product_hash, title, price, ... }
        const { product_hash, ...offerData } = params;
        if (!product_hash) throw { status: 400, body: { error: "product_hash obrigatório" } };
        const resp = await pepperFetch(`/products/${product_hash}/offers`, "POST", PEPPER_API_TOKEN, offerData);
        result = { offer: resp.data || resp };
        break;
      }

      case "update_offer": {
        // params: { product_hash, offer_hash, title?, price?, ... }
        const { product_hash: ph, ...offerUpdate } = params;
        if (!ph) throw { status: 400, body: { error: "product_hash obrigatório" } };
        const resp = await pepperFetch(`/products/${ph}/offers`, "PUT", PEPPER_API_TOKEN, offerUpdate);
        result = { offer: resp.data || resp };
        break;
      }

      // ========== TRANSACTIONS ==========
      case "list_transactions": {
        // params: { page?, per_page?, status?, ... }
        const query = new URLSearchParams();
        if (params.page) query.set("page", String(params.page));
        if (params.per_page) query.set("per_page", String(params.per_page));
        if (params.status) query.set("status", params.status);
        if (params.start_date) query.set("start_date", params.start_date);
        if (params.end_date) query.set("end_date", params.end_date);
        const qs = query.toString();
        const resp = await pepperFetch(`/transactions${qs ? `?${qs}` : ""}`, "GET", PEPPER_API_TOKEN);
        result = { transactions: resp.data || resp, meta: resp.meta || null };
        break;
      }

      case "create_transaction": {
        // params: { offer_hash, customer: { name, email, phone }, payment_method: "pix", ... }
        const resp = await pepperFetch("/transactions", "POST", PEPPER_API_TOKEN, params);
        result = { transaction: resp.data || resp };
        break;
      }

      // ========== CHECKOUT ==========
      case "get_checkout": {
        // params: { hash }
        if (!params.hash) throw { status: 400, body: { error: "hash obrigatório" } };
        const resp = await pepperFetch(`/checkout/${params.hash}`, "GET", PEPPER_API_TOKEN);
        result = { checkout: resp.data || resp };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Action desconhecida: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[PEPPER-SYNC] Error:", err);
    const status = err?.status || 500;
    const body = err?.body || { error: String(err) };
    return new Response(
      JSON.stringify(body),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
