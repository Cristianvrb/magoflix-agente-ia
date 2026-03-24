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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const stats = { total: 0, backfilled_from_phone: 0, default_facebook: 0, already_has: 0, errors: 0 };

  try {
    // 1. Get all conversations from last 60 days
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { data: allConvs, error: convErr } = await supabase
      .from("conversations")
      .select("id, contact_phone")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false });

    if (convErr) throw convErr;
    if (!allConvs || allConvs.length === 0) {
      return new Response(JSON.stringify({ ok: true, stats, message: "No conversations found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Get all conversation IDs that already have ad_creatives
    const { data: existingCreatives } = await supabase
      .from("ad_creatives")
      .select("conversation_id")
      .gte("created_at", cutoff);

    const hasCreative = new Set((existingCreatives || []).map((c: any) => c.conversation_id));

    // 3. Filter to orphans
    const orphans = allConvs.filter((c: any) => !hasCreative.has(c.id) && c.contact_phone);
    stats.total = orphans.length;
    console.log(`[BACKFILL] Found ${orphans.length} orphan conversations out of ${allConvs.length} total`);

    // 4. Get all ad_creatives for phone-based lookup
    const { data: allCreatives } = await supabase
      .from("ad_creatives")
      .select("conversation_id, source, track_id, track_source, raw_data, image_url")
      .not("source", "eq", "facebook_default")
      .gte("created_at", cutoff);

    // Build phone→creative map
    const convPhoneMap = new Map<string, any>();
    for (const conv of allConvs) {
      if (conv.contact_phone) {
        convPhoneMap.set(conv.id, conv.contact_phone);
      }
    }

    const phoneToDonor = new Map<string, any>();
    for (const creative of (allCreatives || [])) {
      const phone = convPhoneMap.get(creative.conversation_id);
      if (phone) {
        const suffix = phone.slice(-8);
        if (!phoneToDonor.has(phone)) phoneToDonor.set(phone, creative);
        if (!phoneToDonor.has(suffix)) phoneToDonor.set(suffix, creative);
      }
    }

    // 5. Process each orphan
    for (const orphan of orphans) {
      try {
        const phone = orphan.contact_phone;
        const suffix = phone.slice(-8);

        // Try exact phone match first, then suffix
        const donor = phoneToDonor.get(phone) || phoneToDonor.get(suffix);

        if (donor) {
          await supabase.from("ad_creatives").insert({
            conversation_id: orphan.id,
            source: donor.source,
            track_id: donor.track_id,
            track_source: donor.track_source,
            image_url: donor.image_url,
            raw_data: {
              ...donor.raw_data,
              backfilled_from: donor.conversation_id,
              attribution_method: "retroactive_phone_match",
            },
          });
          stats.backfilled_from_phone++;
        } else {
          // Default Facebook attribution
          await supabase.from("ad_creatives").insert({
            conversation_id: orphan.id,
            source: "facebook_default",
            track_source: "facebook_ads_unattributed",
            track_id: "",
            image_url: "",
            raw_data: {
              attribution_method: "retroactive_default_facebook",
              reason: "no_donor_found",
            },
          });
          stats.default_facebook++;
        }
      } catch (err) {
        console.error(`[BACKFILL] Error processing ${orphan.id}:`, err);
        stats.errors++;
      }
    }

    console.log("[BACKFILL] Done:", JSON.stringify(stats));
    return new Response(JSON.stringify({ ok: true, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[BACKFILL] Fatal error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err), stats }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
