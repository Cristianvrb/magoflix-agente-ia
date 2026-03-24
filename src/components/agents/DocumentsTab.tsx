import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, Trash2, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const ACCEPTED = ".pdf,.docx,.txt,.csv,.md";
const MAX_SIZE = 10 * 1024 * 1024;

interface DocumentsTabProps {
  agentId: string;
}

export function DocumentsTab({ agentId }: DocumentsTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["documents", agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_documents")
        .select("*")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const uploadDoc = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_SIZE) throw new Error("Arquivo maior que 10MB");
      const path = `${user!.id}/${agentId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("knowledge-documents").upload(path, file);
      if (uploadErr) throw uploadErr;

      const { data: doc, error: insertErr } = await supabase
        .from("knowledge_documents")
        .insert({
          agent_id: agentId,
          user_id: user!.id,
          file_name: file.name,
          file_url: path,
          file_size: file.size,
          status: "pending",
        })
        .select()
        .single();
      if (insertErr) throw insertErr;

      // Call parse-document edge function
      supabase.functions.invoke("parse-document", { body: { document_id: doc.id } }).catch(console.error);

      return doc;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", agentId] });
      toast({ title: "Documento enviado", description: "A extração de texto começará em breve." });
    },
    onError: (e: any) => toast({ title: "Erro no upload", description: e.message, variant: "destructive" }),
  });

  const deleteDoc = useMutation({
    mutationFn: async (doc: any) => {
      if (doc.file_url) {
        await supabase.storage.from("knowledge-documents").remove([doc.file_url]);
      }
      const { error } = await supabase.from("knowledge_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", agentId] });
      toast({ title: "Documento excluído" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadDoc.mutate(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Documentos de Treinamento</CardTitle>
            <Button onClick={() => fileRef.current?.click()} disabled={uploadDoc.isPending}>
              {uploadDoc.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload
            </Button>
            <input ref={fileRef} type="file" accept={ACCEPTED} onChange={handleFileChange} className="hidden" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : docs.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">Nenhum documento enviado. Suporta PDF, DOCX, TXT, CSV, MD até 10MB.</p>
          ) : (
            <div className="space-y-2">
              {docs.map((doc: any) => (
                <div key={doc.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{doc.file_name}</p>
                    <p className="text-xs text-muted-foreground">{formatSize(doc.file_size || 0)}</p>
                  </div>
                  <Badge variant={doc.status === "completed" ? "default" : doc.status === "error" ? "destructive" : "secondary"} className="text-[10px]">
                    {doc.status === "completed" ? "Extraído" : doc.status === "error" ? "Erro" : "Processando"}
                  </Badge>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
                        <AlertDialogDescription>O arquivo e o texto extraído serão removidos permanentemente.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteDoc.mutate(doc)}>Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
