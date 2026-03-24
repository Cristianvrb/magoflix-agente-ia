import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageSquare, AlertCircle } from "lucide-react";

function TextNode({ data, selected }: NodeProps) {
  const d = data as Record<string, any>;
  const isEmpty = !d.content?.trim();

  return (
    <div className={`rounded-xl border-2 bg-card shadow-md min-w-[220px] max-w-[280px] ${selected ? "border-primary ring-2 ring-primary/30" : isEmpty ? "border-destructive" : "border-border"}`}>
      <div className="flex items-center gap-2 rounded-t-[10px] bg-emerald-600 px-3 py-2 text-white">
        <MessageSquare className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">Texto</span>
        {isEmpty && <AlertCircle className="h-3.5 w-3.5 ml-auto text-yellow-200" />}
      </div>
      <div className="p-3">
        <p className="text-sm line-clamp-4 leading-relaxed">{d.content || <span className="text-muted-foreground italic text-xs">Mensagem vazia</span>}</p>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-emerald-600 !w-3 !h-3 !border-2 !border-white" />
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-600 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

export default memo(TextNode);
