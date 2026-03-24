import { X, FileText, Music, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface FilePreviewProps {
  file: File;
  previewUrl: string | null;
  onRemove: () => void;
}

export default function FilePreview({ file, previewUrl, onRemove }: FilePreviewProps) {
  const isImage = file.type.startsWith("image/");
  const isAudio = file.type.startsWith("audio/");
  const isVideo = file.type.startsWith("video/");

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-2">
      {isImage && previewUrl ? (
        <img
          src={previewUrl}
          alt="Preview"
          className="h-20 max-w-[150px] rounded-md object-cover"
        />
      ) : (
        <Badge variant="secondary" className="gap-1.5 py-1.5">
          {isAudio && <Music className="h-3.5 w-3.5" />}
          {isVideo && <Film className="h-3.5 w-3.5" />}
          {!isAudio && !isVideo && <FileText className="h-3.5 w-3.5" />}
          <span className="max-w-[200px] truncate text-xs">{file.name}</span>
        </Badge>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
