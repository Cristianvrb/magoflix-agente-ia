import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";

function ConditionNode({ data, selected }: NodeProps) {
  const options: string[] = (data as any).options || ["Opção 1", "Opção 2"];
  return (
    <div className={`rounded-xl border-2 bg-card shadow-md min-w-[220px] ${selected ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
      <div className="flex items-center gap-2 rounded-t-[10px] bg-orange-500 px-3 py-2 text-white">
        <GitBranch className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">Condição</span>
      </div>
      <div className="p-3 space-y-1">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-4 h-4 rounded-full bg-orange-500/20 text-orange-600 flex items-center justify-center font-bold text-[10px]">{i + 1}</span>
            <span className="truncate">{opt}</span>
          </div>
        ))}
      </div>
      <Handle type="target" position={Position.Top} className="!bg-orange-500 !w-3 !h-3 !border-2 !border-white" />
      {options.map((_, i) => (
        <Handle
          key={i}
          type="source"
          position={Position.Bottom}
          id={`option-${i}`}
          className="!bg-orange-500 !w-3 !h-3 !border-2 !border-white"
          style={{ left: `${((i + 1) / (options.length + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
}

export default memo(ConditionNode);
