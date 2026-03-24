import { useState } from "react";
import { cn } from "@/lib/utils";
import { FileDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface MessageBubbleProps {
  role: string;
  content: string;
  created_at: string;
  media_url?: string | null;
  media_type?: string | null;
}

export default function MessageBubble({ role, content, created_at, media_url, media_type }: MessageBubbleProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isUser = role === "user";

  // Strip "[Imagem recebido]" prefix from content when we have the actual media
  const caption = media_url
    ? content.replace(/^\[(?:Imagem|Áudio|Vídeo|Documento) recebido(?:\s*\([^)]*\))?\]\s*/i, "").trim()
    : content;

  return (
    <>
      <div
        className={cn(
          "max-w-[75%] rounded-xl px-4 py-2.5",
          isUser
            ? "bg-muted text-foreground"
            : "ml-auto bg-primary text-primary-foreground"
        )}
      >
        {/* Media rendering */}
        {media_url && media_type === "image" && (
          <img
            src={media_url}
            alt="Imagem enviada"
            className="mb-1.5 max-h-64 w-full cursor-pointer rounded-lg object-cover"
            onClick={() => setLightboxOpen(true)}
            loading="lazy"
          />
        )}

        {media_url && media_type === "audio" && (
          <audio controls className="mb-1.5 w-full" preload="none">
            <source src={media_url} />
          </audio>
        )}

        {media_url && media_type === "video" && (
          <video controls className="mb-1.5 max-h-64 w-full rounded-lg" preload="none">
            <source src={media_url} />
          </video>
        )}

        {media_url && media_type === "document" && (
          <a
            href={media_url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "mb-1.5 flex items-center gap-2 rounded-lg border p-2 text-sm underline",
              isUser ? "border-border" : "border-primary-foreground/30 text-primary-foreground"
            )}
          >
            <FileDown className="h-4 w-4 shrink-0" />
            Abrir documento
          </a>
        )}

        {/* Caption / text */}
        {caption && <p className="text-sm">{caption}</p>}

        <p className={cn("mt-1 text-[10px]", isUser ? "text-muted-foreground" : "text-primary-foreground/70")}>
          {new Date(created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      {/* Lightbox for images */}
      {media_url && media_type === "image" && (
        <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
          <DialogContent className="max-w-3xl p-2">
            <DialogTitle className="sr-only">Imagem ampliada</DialogTitle>
            <img src={media_url} alt="Imagem ampliada" className="w-full rounded-lg" />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
