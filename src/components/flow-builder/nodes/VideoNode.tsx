import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Film, AlertCircle } from "lucide-react";

function VideoNode({ data, selected }: NodeProps) {
  const d = data as Record<string, any>;
  const isEmpty = !d.videoUrl?.trim();

  return (
    <div className={`rounded-xl border-2 bg-card shadow-md min-w-[200px] max-w-[260px] ${selected ? "border-primary ring-2 ring-primary/30" : isEmpty ? "border-destructive" : "border-border"}`}>
      <div className="flex items-center gap-2 rounded-t-[10px] bg-green-600 px-3 py-2 text-white">
        <Film className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">Vídeo</span>
        {isEmpty && <AlertCircle className="h-3.5 w-3.5 ml-auto text-yellow-200" />}
      </div>
      <div className="p-3 space-y-1">
        <p className="text-xs text-muted-foreground">{d.videoUrl ? "Vídeo anexado" : "Sem vídeo"}</p>
        {d.caption && <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{d.caption}</p>}
      </div>
      <Handle type="target" position={Position.Top} className="!bg-green-600 !w-3 !h-3 !border-2 !border-white" />
      <Handle type="source" position={Position.Bottom} className="!bg-green-600 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

export default memo(VideoNode);
