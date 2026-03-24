import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { UserRound } from "lucide-react";

function TransferHumanNode({ data, selected }: NodeProps) {
  return (
    <div className={`rounded-xl border-2 bg-card shadow-md min-w-[180px] ${selected ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
      <div className="flex items-center gap-2 rounded-t-[10px] bg-rose-600 px-3 py-2 text-white">
        <UserRound className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">Transferir Humano</span>
      </div>
      <div className="p-3">
        <p className="text-xs text-muted-foreground">{(data as any).message || "Desativa IA e notifica operador"}</p>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-rose-600 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

export default memo(TransferHumanNode);
