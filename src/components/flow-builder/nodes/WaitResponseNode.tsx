import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageCircleQuestion } from "lucide-react";

function WaitResponseNode({ data, selected }: NodeProps) {
  const d = data as Record<string, any>;

  return (
    <div className={`rounded-xl border-2 bg-card shadow-md min-w-[180px] ${selected ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
      <div className="flex items-center gap-2 rounded-t-[10px] bg-orange-500 px-3 py-2 text-white">
        <MessageCircleQuestion className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">Aguardar Resposta</span>
      </div>
      <div className="p-3">
        <p className="text-xs text-muted-foreground">
          {d.timeoutSeconds ? `Timeout: ${d.timeoutSeconds}s` : "Sem timeout"}
        </p>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-orange-500 !w-3 !h-3 !border-2 !border-white" />
      <Handle type="source" position={Position.Bottom} className="!bg-orange-500 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

export default memo(WaitResponseNode);
