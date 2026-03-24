import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { host, token } = await req.json();

    if (!host || !token) {
      return new Response(JSON.stringify({ error: "Host and token are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanHost = host.replace(/^https?:\/\//, "").replace(/\/+$/, "");

    // Let's print out what we're trying
    console.log(`[UAZAPI-QR] Attempting to connect to host: ${cleanHost}`);

    let instanceName = "";

    // Method 1: Try /instance/fetchInstances
    try {
      const fetchResp = await fetch(`https://${cleanHost}/instance/fetchInstances`, {
        headers: { apikey: token, "Content-Type": "application/json" }
      });
      console.log(`[UAZAPI-QR] fetchInstances status: ${fetchResp.status}`);
      
      if (fetchResp.ok) {
        const data = await fetchResp.json();
        if (Array.isArray(data) && data.length > 0) {
          instanceName = data[0].instance?.instanceName || data[0].name || data[0].instanceName;
          console.log(`[UAZAPI-QR] Found instanceName via fetchInstances: ${instanceName}`);
        }
      } else {
        console.error(`[UAZAPI-QR] fetchInstances ERROR: ${await fetchResp.text()}`);
      }
    } catch(e) {
      console.error(`[UAZAPI-QR] fetchInstances EXCEPTION:`, e);
    }

    // Fallback: If fetchInstances failed or didn't give a name, assume the subdomain prefix is the instance name.
    if (!instanceName) {
      instanceName = cleanHost.split(".")[0];
      console.log(`[UAZAPI-QR] Using fallback instanceName: ${instanceName}`);
    }

    // Now try to fetch the QR
    const url = `https://${cleanHost}/instance/connect/${instanceName}`;
    console.log(`[UAZAPI-QR] Fetching QR from: ${url}`);
    
    // We try apikey and Bearer token just in case
    const qrResp = await fetch(url, {
      method: 'GET',
      headers: { 
        apikey: token, 
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json" 
      }
    });

    console.log(`[UAZAPI-QR] Connect status: ${qrResp.status}`);

    const connectData = await qrResp.json();
    console.log(`[UAZAPI-QR] Connect response keys:`, Object.keys(connectData));

    return new Response(JSON.stringify({
      success: true,
      data: connectData,
      instanceName
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[UAZAPI-QR] Fatal error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
