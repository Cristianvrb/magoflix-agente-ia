import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, caption, platform, aspect_ratio, publish_now, style_type, rendering_speed, test_mode } = await req.json();

    if (!prompt) throw new Error("Prompt é obrigatório");

    const ideogramKey = Deno.env.get("IDEOGRAM_API_KEY");
    if (!ideogramKey) throw new Error("IDEOGRAM_API_KEY não configurada");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Map aspect ratio to Ideogram V3 format
    const arMap: Record<string, string> = {
      "ASPECT_1_1": "1x1", "ASPECT_4_5": "4x5", "ASPECT_9_16": "9x16", "ASPECT_16_9": "16x9",
      "1x1": "1x1", "4x5": "4x5", "9x16": "9x16", "16x9": "16x9",
    };
    const mappedAR = arMap[aspect_ratio] || "1x1";

    // Build FormData for Ideogram V3 API (multipart/form-data)
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("aspect_ratio", mappedAR);
    formData.append("rendering_speed", rendering_speed || "TURBO");
    formData.append("style_type", style_type || "DESIGN");
    formData.append("magic_prompt", "ON");
    formData.append("negative_prompt", "watermarks, signatures, blurry, low quality, distorted text, misspelled words");

    console.log("Generating image with Ideogram V3...", { prompt: prompt.substring(0, 100), aspect_ratio: mappedAR, style_type: style_type || "DESIGN", rendering_speed: rendering_speed || "TURBO" });

    const genStart = Date.now();
    const ideogramRes = await fetch("https://api.ideogram.ai/v1/ideogram-v3/generate", {
      method: "POST",
      headers: {
        "Api-Key": ideogramKey,
      },
      body: formData,
    });
    const elapsed_ms = Date.now() - genStart;

    if (!ideogramRes.ok) {
      const errText = await ideogramRes.text();
      console.error("Ideogram error:", errText);
      throw new Error(`Ideogram API error: ${ideogramRes.status} - ${errText}`);
    }

    const ideogramData = await ideogramRes.json();
    console.log("Ideogram response keys:", Object.keys(ideogramData));

    const tempImageUrl = ideogramData?.data?.[0]?.url;
    if (!tempImageUrl) throw new Error("Nenhuma imagem gerada pelo Ideogram");

    // Download image from temporary Ideogram URL
    console.log("Downloading image from Ideogram temporary URL...");
    const imageRes = await fetch(tempImageUrl);
    if (!imageRes.ok) throw new Error("Falha ao baixar imagem do Ideogram");
    const imageArrayBuffer = await imageRes.arrayBuffer();
    const imageBytes = new Uint8Array(imageArrayBuffer);

    // Upload to permanent storage
    const fileName = `social-posts/${crypto.randomUUID()}.png`;
    console.log("Uploading to storage:", fileName);
    const { error: uploadErr } = await supabase.storage
      .from("chat-media")
      .upload(fileName, imageBytes, {
        contentType: "image/png",
        upsert: false,
      });
    if (uploadErr) {
      console.error("Storage upload error:", uploadErr);
      throw new Error(`Erro ao salvar imagem: ${uploadErr.message}`);
    }

    // Get permanent public URL
    const { data: publicUrlData } = supabase.storage
      .from("chat-media")
      .getPublicUrl(fileName);
    const permanentImageUrl = publicUrlData.publicUrl;
    console.log("Permanent image URL:", permanentImageUrl);

    // Calculate Ideogram cost based on rendering speed
    const ideogramCosts: Record<string, number> = {
      "DEFAULT": 0.08,
      "QUALITY": 0.10,
      "TURBO": 0.04,
      "FLASH": 0.02,
    };
    const ideogramCostUsd = ideogramCosts[rendering_speed || "TURBO"] || 0.04;

    // Log Ideogram cost to token_usage
    await supabase.from("token_usage").insert({
      model: "ideogram-v3",
      usage_type: "social_image",
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost_usd: ideogramCostUsd,
    });

    const postStatus = test_mode ? "test" : (publish_now ? "scheduled" : "draft");
    const postPrompt = test_mode ? `[${rendering_speed || "TURBO"}] ${prompt}` : (prompt || "");
    const postData: any = {
      content: caption || "",
      image_url: permanentImageUrl,
      platform: platform || "both",
      ai_generated: true,
      status: postStatus,
      prompt: postPrompt,
    };
    if (publish_now) postData.scheduled_at = new Date().toISOString();

    const { data: post, error: insertErr } = await supabase
      .from("social_posts")
      .insert(postData)
      .select()
      .single();
    if (insertErr) throw insertErr;

    // Publish immediately if requested
    let publishResult = null;
    if (publish_now) {
      const publishUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/social-publish`;
      const pubRes = await fetch(publishUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({ post_id: post.id }),
      });
      publishResult = await pubRes.json();
    }

    return new Response(
      JSON.stringify({ success: true, post, image_url: permanentImageUrl, publishResult, elapsed_ms }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("social-create-post error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
