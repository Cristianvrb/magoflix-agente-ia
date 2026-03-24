import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clock } from "lucide-react";

function DelayNode({ data, selected }: NodeProps) {
  return (
    <div className={`rounded-xl border-2 bg-card shadow-md min-w-[160px] ${selected ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
      <div className="flex items-center gap-2 rounded-t-[10px] bg-amber-500 px-3 py-2 text-white">
        <Clock className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">Delay</span>
      </div>
      <div className="p-3 text-center">
        <p className="text-lg font-bold">{(data as any).seconds || 5}s</p>
        <p className="text-xs text-muted-foreground">aguardar</p>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !w-3 !h-3 !border-2 !border-white" />
      <Handle type="source" position={Position.Bottom} className="!bg-amber-500 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

export default memo(DelayNode);
