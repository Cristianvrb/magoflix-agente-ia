import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ImagePlus, Music, X, Loader2 } from "lucide-react";

interface GroupMediaUploadProps {
  imageUrl: string | null;
  audioUrl: string | null;
  onImageChange: (url: string | null) => void;
  onAudioChange: (url: string | null) => void;
}

export default function GroupMediaUpload({ imageUrl, audioUrl, onImageChange, onAudioChange }: GroupMediaUploadProps) {
  const [uploading, setUploading] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File, type: "image" | "audio") => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `groups/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("chat-media").upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("chat-media").getPublicUrl(path);
      if (type === "image") onImageChange(publicUrl);
      else onAudioChange(publicUrl);
    } catch (err: any) {
      toast.error(err.message || "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => imageRef.current?.click()}>
          {uploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="mr-1 h-3.5 w-3.5" />}
          Imagem
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => audioRef.current?.click()}>
          {uploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Music className="mr-1 h-3.5 w-3.5" />}
          Áudio
        </Button>
        <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, "image"); e.target.value = ""; }} />
        <input ref={audioRef} type="file" accept="audio/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, "audio"); e.target.value = ""; }} />
      </div>

      {imageUrl && (
        <div className="relative inline-block">
          <img src={imageUrl} alt="Preview" className="h-24 max-w-[200px] rounded-md object-cover border" />
          <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-5 w-5" onClick={() => onImageChange(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {audioUrl && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-2">
          <audio controls src={audioUrl} className="h-8 max-w-[250px]" />
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => onAudioChange(null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
