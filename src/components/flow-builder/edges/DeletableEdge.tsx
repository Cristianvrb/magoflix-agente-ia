import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { X } from "lucide-react";

export default function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  selected,
  markerEnd,
}: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: selected ? 3 : 2,
          stroke: selected ? "hsl(0, 70%, 55%)" : style?.stroke,
        }}
      />
      <EdgeLabelRenderer>
        <button
          className={`absolute flex items-center justify-center w-5 h-5 rounded-full border bg-card text-destructive shadow-md hover:bg-destructive hover:text-white transition-all ${selected ? "opacity-100 scale-100" : "opacity-0 scale-75 group-hover:opacity-100"}`}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
            opacity: selected ? 1 : undefined,
          }}
          onClick={(e) => {
            e.stopPropagation();
            setEdges((eds) => eds.filter((edge) => edge.id !== id));
          }}
          title="Remover conexão"
        >
          <X className="h-3 w-3" />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
