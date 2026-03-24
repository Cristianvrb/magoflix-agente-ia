import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";

function TriggerNode({ data, selected }: NodeProps) {
  return (
    <div className={`rounded-xl border-2 bg-card shadow-md min-w-[200px] ${selected ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
      <div className="flex items-center gap-2 rounded-t-[10px] bg-primary px-3 py-2 text-primary-foreground">
        <Zap className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">Gatilho</span>
      </div>
      <div className="p-3">
        <p className="text-xs text-muted-foreground">{(data as any).triggerType === "keyword" ? "Palavra-chave" : "Primeira mensagem"}</p>
        {(data as any).keywords && (
          <p className="mt-1 text-sm font-medium truncate max-w-[180px]">{(data as any).keywords}</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-3 !h-3 !border-2 !border-primary-foreground" />
    </div>
  );
}

export default memo(TriggerNode);
