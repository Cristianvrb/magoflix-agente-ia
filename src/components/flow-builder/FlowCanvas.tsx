import { useCallback, useRef, useState, useEffect } from "react";
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  type Connection,
  type Edge,
  type Node,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import TriggerNode from "./nodes/TriggerNode";
import TextNode from "./nodes/TextNode";
import AudioNode from "./nodes/AudioNode";
import ImageNode from "./nodes/ImageNode";
import DelayNode from "./nodes/DelayNode";
import ConditionNode from "./nodes/ConditionNode";
import TransferAINode from "./nodes/TransferAINode";
import TransferHumanNode from "./nodes/TransferHumanNode";
import RandomizerNode from "./nodes/RandomizerNode";
import WaitResponseNode from "./nodes/WaitResponseNode";
import ContactNode from "./nodes/ContactNode";
import DocumentNode from "./nodes/DocumentNode";
import VideoNode from "./nodes/VideoNode";
import DeletableEdge from "./edges/DeletableEdge";
import { NodePanel } from "./NodePanel";
import { NodeEditor } from "./NodeEditor";
import { Check, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const nodeTypes = {
  trigger: TriggerNode,
  text_message: TextNode,
  audio_ptt: AudioNode,
  image_message: ImageNode,
  delay: DelayNode,
  condition: ConditionNode,
  transfer_ai: TransferAINode,
  transfer_human: TransferHumanNode,
  randomizer: RandomizerNode,
  wait_response: WaitResponseNode,
  contact_message: ContactNode,
  document_message: DocumentNode,
  video_message: VideoNode,
};

const edgeTypes = {
  deletable: DeletableEdge,
};

const defaultNodeData: Record<string, Record<string, any>> = {
  trigger: { triggerType: "first_message", keywords: "" },
  text_message: { content: "" },
  audio_ptt: { audioUrl: "" },
  image_message: { imageUrl: "", caption: "" },
  delay: { seconds: 5 },
  condition: { options: ["Opção 1", "Opção 2"] },
  transfer_ai: {},
  transfer_human: { message: "" },
  randomizer: { outputs: 2 },
  wait_response: { timeoutSeconds: 0 },
  contact_message: { contactName: "", contactPhone: "" },
  document_message: { documentUrl: "", caption: "" },
  video_message: { videoUrl: "", caption: "" },
};

const defaultEdgeOptions: Partial<Edge> = {
  animated: true,
  style: { stroke: "hsl(152, 60%, 42%)", strokeWidth: 2 },
  type: "deletable",
  interactionWidth: 20,
};

const connectionLineStyle = {
  stroke: "hsl(152, 60%, 42%)",
  strokeWidth: 2,
  strokeDasharray: "5 5",
};

interface FlowCanvasProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  onSave: (nodes: Node[], edges: Edge[]) => void;
  isSaving: boolean;
}

let nodeId = 0;
const getNodeId = () => `node_${Date.now()}_${nodeId++}`;

function FlowCanvasInner({ initialNodes, initialEdges, onSave, isSaving }: FlowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<string | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedIndicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { getNode } = useReactFlow();

  // Auto-save with 3s debounce
  useEffect(() => {
    // Skip initial render
    if (!reactFlowInstance) return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      setAutoSaveStatus("saving");
      onSave(nodes, edges);
      // Show "saved" for 2s
      if (savedIndicatorTimer.current) clearTimeout(savedIndicatorTimer.current);
      savedIndicatorTimer.current = setTimeout(() => {
        setAutoSaveStatus("saved");
        savedIndicatorTimer.current = setTimeout(() => setAutoSaveStatus("idle"), 2000);
      }, 500);
    }, 3000);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [nodes, edges, reactFlowInstance]);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, ...defaultEdgeOptions }, eds));
  }, [setEdges]);

  const onReconnect = useCallback((oldEdge: Edge, newConnection: Connection) => {
    setEdges((eds) => {
      const filtered = eds.filter((e) => e.id !== oldEdge.id);
      return addEdge({ ...newConnection, ...defaultEdgeOptions }, filtered);
    });
  }, [setEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow");
      if (!type || !reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: getNodeId(),
        type,
        position,
        data: { ...defaultNodeData[type] },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [reactFlowInstance, setNodes]
  );

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onNodeDataChange = useCallback((id: string, data: Record<string, any>) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data } : n)));
    setSelectedNode((prev) => (prev?.id === id ? { ...prev, data } : prev));
  }, [setNodes]);

  const confirmDeleteNode = useCallback((id: string) => {
    setNodeToDelete(id);
    setDeleteDialogOpen(true);
  }, []);

  const executeDeleteNode = useCallback(() => {
    if (!nodeToDelete) return;
    setNodes((nds) => nds.filter((n) => n.id !== nodeToDelete));
    setEdges((eds) => eds.filter((e) => e.source !== nodeToDelete && e.target !== nodeToDelete));
    if (selectedNode?.id === nodeToDelete) setSelectedNode(null);
    setDeleteDialogOpen(false);
    setNodeToDelete(null);
  }, [nodeToDelete, selectedNode, setNodes, setEdges]);

  const duplicateNode = useCallback((id: string) => {
    const node = getNode(id);
    if (!node) return;
    const newNode: Node = {
      id: getNodeId(),
      type: node.type,
      position: { x: node.position.x + 50, y: node.position.y + 60 },
      data: { ...node.data },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNode(newNode);
  }, [getNode, setNodes]);

  return (
    <div className="flex h-full">
      <NodePanel />
      <div className="flex-1 relative" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          connectionLineStyle={connectionLineStyle}
          edgesReconnectable
          snapToGrid
          snapGrid={[15, 15]}
          fitView
          deleteKeyCode={["Backspace", "Delete"]}
          className="bg-background"
          proOptions={{ hideAttribution: true }}
        >
          <Controls className="!bg-card !border-border !shadow-md [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground" />
          <MiniMap
            className="!bg-card !border-border !shadow-md !rounded-lg"
            maskColor="hsl(var(--muted) / 0.7)"
            nodeColor="hsl(var(--primary))"
            pannable
            zoomable
          />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--muted-foreground) / 0.15)" />
        </ReactFlow>
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          {autoSaveStatus === "saving" && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-card/80 backdrop-blur px-2.5 py-1.5 rounded-lg border shadow-sm">
              <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
            </span>
          )}
          {autoSaveStatus === "saved" && !isSaving && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-card/80 backdrop-blur px-2.5 py-1.5 rounded-lg border shadow-sm">
              <Check className="h-3 w-3" /> Salvo
            </span>
          )}
          <button
            onClick={() => onSave(nodes, edges)}
            disabled={isSaving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? "Salvando..." : "💾 Salvar Fluxo"}
          </button>
        </div>
      </div>
      {selectedNode && (
        <NodeEditor
          node={selectedNode}
          onChange={onNodeDataChange}
          onClose={() => setSelectedNode(null)}
          onDelete={confirmDeleteNode}
          onDuplicate={duplicateNode}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir bloco?</AlertDialogTitle>
            <AlertDialogDescription>
              O bloco e todas as suas conexões serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteNode} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
