import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ImageIcon, AlertCircle } from "lucide-react";

function ImageNode({ data, selected }: NodeProps) {
  const d = data as Record<string, any>;
  const isEmpty = !d.imageUrl?.trim();

  return (
    <div className={`rounded-xl border-2 bg-card shadow-md min-w-[220px] max-w-[280px] ${selected ? "border-primary ring-2 ring-primary/30" : isEmpty ? "border-destructive" : "border-border"}`}>
      <div className="flex items-center gap-2 rounded-t-[10px] bg-sky-600 px-3 py-2 text-white">
        <ImageIcon className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">Imagem</span>
        {isEmpty && <AlertCircle className="h-3.5 w-3.5 ml-auto text-yellow-200" />}
      </div>
      <div className="p-3 space-y-2">
        {d.imageUrl ? (
          <img src={d.imageUrl} alt="Preview" className="w-full h-32 object-cover rounded" />
        ) : (
          <div className="w-full h-20 bg-muted rounded flex items-center justify-center">
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        {d.caption && <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{d.caption}</p>}
      </div>
      <Handle type="target" position={Position.Top} className="!bg-sky-600 !w-3 !h-3 !border-2 !border-white" />
      <Handle type="source" position={Position.Bottom} className="!bg-sky-600 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

export default memo(ImageNode);
