import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { document_id } = await req.json();
    if (!document_id) throw new Error("document_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: doc, error: docErr } = await supabase
      .from("knowledge_documents")
      .select("*")
      .eq("id", document_id)
      .single();
    if (docErr || !doc) throw new Error("Document not found");

    await supabase.from("knowledge_documents").update({ status: "processing" }).eq("id", document_id);

    const { data: fileData, error: dlErr } = await supabase.storage
      .from("knowledge-documents")
      .download(doc.file_url);
    if (dlErr || !fileData) throw new Error("File download failed");

    let extractedText = "";
    const fileName = (doc.file_name || "").toLowerCase();

    if (fileName.endsWith(".txt") || fileName.endsWith(".csv") || fileName.endsWith(".md")) {
      extractedText = await fileData.text();
    } else if (fileName.endsWith(".pdf")) {
      // Basic text extraction - read as text (works for text-based PDFs)
      const raw = await fileData.text();
      // Extract readable text between stream markers
      const lines = raw.split(/\r?\n/).filter((l: string) => /[a-zA-ZÀ-ú]{3,}/.test(l) && !l.startsWith("%") && !l.startsWith("/"));
      extractedText = lines.join("\n").substring(0, 50000);
      if (!extractedText.trim()) extractedText = "[PDF sem texto extraível - conteúdo pode ser imagem]";
    } else if (fileName.endsWith(".docx")) {
      // Basic DOCX: extract from XML
      const raw = await fileData.text();
      const textMatches = raw.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
      if (textMatches) {
        extractedText = textMatches.map((m: string) => m.replace(/<[^>]+>/g, "")).join(" ").substring(0, 50000);
      } else {
        extractedText = "[DOCX sem texto extraível]";
      }
    } else {
      extractedText = await fileData.text();
    }

    await supabase.from("knowledge_documents").update({
      extracted_text: extractedText.substring(0, 100000),
      status: "completed",
    }).eq("id", document_id);

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("parse-document error:", e);
    // Try to mark as error
    try {
      const { document_id } = await new Response(req.body).json().catch(() => ({})) as any;
      if (document_id) {
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await supabase.from("knowledge_documents").update({ status: "error" }).eq("id", document_id);
      }
    } catch {}
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
