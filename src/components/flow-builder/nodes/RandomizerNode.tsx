import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Shuffle } from "lucide-react";

function RandomizerNode({ data, selected }: NodeProps) {
  const d = data as Record<string, any>;
  const outputs = d.outputs || 2;

  return (
    <div className={`rounded-xl border-2 bg-card shadow-md min-w-[180px] ${selected ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
      <div className="flex items-center gap-2 rounded-t-[10px] bg-cyan-600 px-3 py-2 text-white">
        <Shuffle className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">Randomizer</span>
      </div>
      <div className="p-3">
        <p className="text-xs text-muted-foreground">{outputs} saídas aleatórias</p>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-cyan-600 !w-3 !h-3 !border-2 !border-white" />
      {Array.from({ length: outputs }).map((_, i) => (
        <Handle
          key={i}
          type="source"
          position={Position.Bottom}
          id={`out-${i}`}
          className="!bg-cyan-600 !w-3 !h-3 !border-2 !border-white"
          style={{ left: `${((i + 1) / (outputs + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
}

export default memo(RandomizerNode);
