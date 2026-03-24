import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Trash2, Bot, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import ChatMessage from "@/components/test-agent/ChatMessage";
import FilePreview from "@/components/test-agent/FilePreview";

interface PixData {
  checkout_url: string;
  transaction_id: string;
  qr_code_base64?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  image?: string;
  pixData?: PixData;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function TestAgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<"pt" | "es">("pt");
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (attachedFile && attachedFile.type.startsWith("image/")) {
      const url = URL.createObjectURL(attachedFile);
      setFilePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setFilePreviewUrl(null);
  }, [attachedFile]);

  const handleFileSelect = (file: File) => {
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("Arquivo muito grande. Máximo 20MB.");
      return;
    }
    setAttachedFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if ((!text && !attachedFile) || isStreaming) return;

    let imageData: string | undefined;
    if (attachedFile) {
      try {
        imageData = await fileToBase64(attachedFile);
      } catch {
        toast.error("Erro ao ler o arquivo.");
        return;
      }
    }

    const userMsg: Message = {
      role: "user",
      content: text || (attachedFile ? `Analise este arquivo: ${attachedFile.name}` : ""),
      image: imageData,
    };

    const updatedMessages = [...messages, userMsg];
    setMessages([...updatedMessages, { role: "assistant", content: "" }]);
    setInput("");
    setAttachedFile(null);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/test-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ messages: updatedMessages, language }),
        signal: controller.signal,
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let pixData: PixData | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const json = JSON.parse(data);
              // Check for pix_data event
              if (json.pix_data) {
                pixData = json.pix_data;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...updated[updated.length - 1], pixData };
                  return updated;
                });
                continue;
              }
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                accumulated += delta;
                const content = accumulated;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content, pixData };
                  return updated;
                });
              }
            } catch {
              // partial JSON
            }
          }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("Test agent error:", e);
        toast.error("Erro ao chamar o agente. Verifique as configurações.");
        setMessages(updatedMessages);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setAttachedFile(null);
    setIsStreaming(false);
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col">
      <div className="flex items-center justify-between border-b pb-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Testar IA</h1>
          <p className="text-sm text-muted-foreground">
            Converse com o agente usando as configurações salvas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={language} onValueChange={(v) => setLanguage(v as "pt" | "es")}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pt">🇧🇷 Português</SelectItem>
              <SelectItem value="es">🇪🇸 Español</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={clearChat} disabled={messages.length === 0 && !isStreaming}>
            <Trash2 className="mr-2 h-4 w-4" />
            Limpar
          </Button>
        </div>
      </div>

      <Card
        className="flex flex-1 flex-col overflow-hidden"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Bot className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p className="text-sm">Envie uma mensagem para testar o agente</p>
                <p className="text-xs mt-1 opacity-60">Você pode arrastar arquivos para cá</p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {messages.map((msg, i) => (
              <ChatMessage
                key={i}
                role={msg.role}
                content={msg.content}
                image={msg.image}
                isStreaming={isStreaming}
                isLast={i === messages.length - 1}
                pixData={msg.pixData}
              />
            ))}
          </div>
        </div>

        <div className="border-t p-4">
          {attachedFile && (
            <div className="mb-2">
              <FilePreview
                file={attachedFile}
                previewUrl={filePreviewUrl}
                onRemove={() => setAttachedFile(null)}
              />
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,audio/*,video/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua mensagem..."
              disabled={isStreaming}
              className="flex-1"
            />
            <Button onClick={sendMessage} disabled={(!input.trim() && !attachedFile) || isStreaming} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
