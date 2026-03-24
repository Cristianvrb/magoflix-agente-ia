import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot } from "lucide-react";

function TransferAINode({ selected }: NodeProps) {
  return (
    <div className={`rounded-xl border-2 bg-card shadow-md min-w-[180px] ${selected ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
      <div className="flex items-center gap-2 rounded-t-[10px] bg-indigo-600 px-3 py-2 text-white">
        <Bot className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">Transferir IA</span>
      </div>
      <div className="p-3">
        <p className="text-xs text-muted-foreground">A IA assume a conversa</p>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-indigo-600 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

export default memo(TransferAINode);
