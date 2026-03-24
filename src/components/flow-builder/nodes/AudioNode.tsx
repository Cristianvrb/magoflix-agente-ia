import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Mic, AlertCircle } from "lucide-react";

function AudioNode({ data, selected }: NodeProps) {
  const d = data as Record<string, any>;
  const isEmpty = !d.audioUrl?.trim();

  return (
    <div className={`rounded-xl border-2 bg-card shadow-md min-w-[200px] ${selected ? "border-primary ring-2 ring-primary/30" : isEmpty ? "border-destructive" : "border-border"}`}>
      <div className="flex items-center gap-2 rounded-t-[10px] bg-violet-600 px-3 py-2 text-white">
        <Mic className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">Áudio PTT</span>
        {isEmpty && <AlertCircle className="h-3.5 w-3.5 ml-auto text-yellow-200" />}
      </div>
      <div className="p-3">
        {d.audioUrl ? (
          <audio src={d.audioUrl} controls className="w-full h-8" />
        ) : (
          <p className="text-xs text-muted-foreground italic">Nenhum áudio selecionado</p>
        )}
      </div>
      <Handle type="target" position={Position.Top} className="!bg-violet-600 !w-3 !h-3 !border-2 !border-white" />
      <Handle type="source" position={Position.Bottom} className="!bg-violet-600 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

export default memo(AudioNode);
