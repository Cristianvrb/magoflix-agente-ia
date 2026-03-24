import { Bot, User, ExternalLink } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import React from "react";

interface PixData {
  checkout_url: string;
  transaction_id: string;
  qr_code_base64?: string;
}

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  image?: string;
  isStreaming?: boolean;
  isLast?: boolean;
  pixData?: PixData;
}

const URL_REGEX = /(https?:\/\/[^\s<]+)/g;

function renderContentWithLinks(content: string, isUser: boolean) {
  const parts = content.split(URL_REGEX);
  if (parts.length === 1) return content;

  return parts.map((part, i) => {
    if (URL_REGEX.test(part)) {
      // Reset lastIndex since we use global flag
      URL_REGEX.lastIndex = 0;
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline break-all ${isUser ? "text-primary-foreground/90 hover:text-primary-foreground" : "text-primary hover:text-primary/80"}`}
        >
          {part}
        </a>
      );
    }
    // Reset lastIndex for next iteration
    URL_REGEX.lastIndex = 0;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export default function ChatMessage({ role, content, image, isStreaming, isLast, pixData }: ChatMessageProps) {
  const isUser = role === "user";
  const isImage = image && !image.startsWith("data:application/pdf") && !image.startsWith("data:audio/");

  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={isUser ? "bg-primary text-primary-foreground" : "bg-muted"}>
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {isUser && isImage && (
          <img
            src={image}
            alt="Anexo"
            className="mb-1.5 max-h-48 rounded-lg object-cover"
          />
        )}
        {isUser && image && !isImage && (
          <div className="mb-1.5 rounded-md bg-background/20 px-2 py-1 text-xs opacity-80">
            📎 Arquivo anexado
          </div>
        )}
        {renderContentWithLinks(content, isUser)}
        {isStreaming && role === "assistant" && isLast && (
          <span className="inline-block w-[2px] h-[1em] bg-foreground ml-0.5 align-middle animate-pulse" />
        )}
        {pixData && !isUser && (
          <div className="mt-3 space-y-2">
            {pixData.qr_code_base64 && (
              <img
                src={`data:image/png;base64,${pixData.qr_code_base64}`}
                alt="QR Code PIX"
                className="mx-auto h-48 w-48 rounded-lg bg-white p-2"
              />
            )}
            {pixData.checkout_url && !pixData.qr_code_base64 && (
              <img
                src={pixData.checkout_url}
                alt="QR Code PIX"
                className="mx-auto h-48 w-48 rounded-lg bg-white p-2"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            {pixData.checkout_url && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                asChild
              >
                <a href={pixData.checkout_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-3 w-3" />
                  Abrir link de pagamento
                </a>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
