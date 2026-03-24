import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ad_creative_id } = await req.json();
    if (!ad_creative_id) {
      return new Response(JSON.stringify({ error: "ad_creative_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load the ad_creative record
    const { data: creative, error: crErr } = await supabase
      .from("ad_creatives")
      .select("*")
      .eq("id", ad_creative_id)
      .single();

    if (crErr || !creative) {
      return new Response(JSON.stringify({ error: "Creative not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Strategy 1: Try Meta Ads API if we have a track_id that looks like an ad ID
    const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN");
    const rawData = (creative.raw_data || {}) as Record<string, any>;
    const trackId = creative.track_id || rawData.track_id || "";
    
    let imageUrl = "";

    if (META_ACCESS_TOKEN && trackId) {
      console.log("[FETCH-AD-IMAGE] Trying Meta API with track_id:", trackId);
      try {
        // Try as ad_id first
        const adResp = await fetch(
          `https://graph.facebook.com/v21.0/${trackId}?fields=creative{thumbnail_url,image_url,object_story_spec}&access_token=${META_ACCESS_TOKEN}`
        );
        if (adResp.ok) {
          const adData = await adResp.json();
          const cr = adData.creative || {};
          imageUrl = cr.image_url || cr.thumbnail_url || "";
          console.log("[FETCH-AD-IMAGE] Meta API creative response:", JSON.stringify(cr).slice(0, 300));
        } else {
          const errText = await adResp.text();
          console.log("[FETCH-AD-IMAGE] Meta API error:", adResp.status, errText.slice(0, 200));
        }
      } catch (metaErr) {
        console.warn("[FETCH-AD-IMAGE] Meta API call failed:", metaErr);
      }
    }

    // Strategy 2: Inherit from same track_source group
    if (!imageUrl && creative.track_source) {
      const { data: donor } = await supabase
        .from("ad_creatives")
        .select("image_url")
        .eq("track_source", creative.track_source)
        .neq("image_url", "")
        .not("image_url", "is", null)
        .neq("id", ad_creative_id)
        .limit(1)
        .single();
      if (donor?.image_url) {
        imageUrl = donor.image_url;
        console.log("[FETCH-AD-IMAGE] Inherited from group:", imageUrl.slice(0, 80));
      }
    }

    if (!imageUrl) {
      return new Response(JSON.stringify({ ok: false, message: "No image found via Meta API or group inheritance" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If image is an external URL, try to download and upload to storage
    let finalUrl = imageUrl;
    if (imageUrl.startsWith("http") && !imageUrl.includes("supabase")) {
      try {
        const resp = await fetch(imageUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          const arrayBuf = await blob.arrayBuffer();
          const bytes = new Uint8Array(arrayBuf);
          const chunkSize = 8192;
          let binary = "";
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
            for (let j = 0; j < chunk.length; j++) {
              binary += String.fromCharCode(chunk[j]);
            }
          }
          const contentType = resp.headers.get("content-type") || "image/jpeg";
          const ext = contentType.includes("png") ? "png" : "jpg";
          const path = `ad-images/${ad_creative_id}.${ext}`;
          
          const { error: upErr } = await supabase.storage
            .from("chat-media")
            .upload(path, bytes, { contentType, upsert: true });
          
          if (!upErr) {
            const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(path);
            if (urlData?.publicUrl) finalUrl = urlData.publicUrl;
          }
        }
      } catch (dlErr) {
        console.warn("[FETCH-AD-IMAGE] Download/upload failed, using direct URL:", dlErr);
      }
    }

    // Update the ad_creative record
    await supabase.from("ad_creatives")
      .update({ image_url: finalUrl })
      .eq("id", ad_creative_id);

    // Also propagate to all creatives with same track_source that have no image
    if (creative.track_source) {
      await supabase.from("ad_creatives")
        .update({ image_url: finalUrl })
        .eq("track_source", creative.track_source)
        .or("image_url.is.null,image_url.eq.");
      console.log("[FETCH-AD-IMAGE] Propagated image to group:", creative.track_source);
    }

    return new Response(JSON.stringify({ ok: true, image_url: finalUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[FETCH-AD-IMAGE] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
