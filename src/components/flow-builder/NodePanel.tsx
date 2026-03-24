import { Zap, MessageSquare, Mic, ImageIcon, Clock, GitBranch, Bot, UserRound, Shuffle, MessageCircleQuestion, Contact, FileText, Film } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NodeType {
  type: string;
  label: string;
  icon: LucideIcon;
  color: string;
}

interface NodeCategory {
  title: string;
  nodes: NodeType[];
}

const NODE_CATEGORIES: NodeCategory[] = [
  {
    title: "Controle",
    nodes: [
      { type: "delay", label: "Delay", icon: Clock, color: "bg-amber-500" },
      { type: "randomizer", label: "Randomizer", icon: Shuffle, color: "bg-cyan-600" },
      { type: "wait_response", label: "Aguardar Resposta", icon: MessageCircleQuestion, color: "bg-orange-500" },
      { type: "condition", label: "Condição", icon: GitBranch, color: "bg-orange-600" },
    ],
  },
  {
    title: "Envio de Itens",
    nodes: [
      { type: "audio_ptt", label: "Áudio", icon: Mic, color: "bg-violet-600" },
      { type: "contact_message", label: "Contato", icon: Contact, color: "bg-purple-600" },
      { type: "document_message", label: "Documento", icon: FileText, color: "bg-rose-500" },
      { type: "video_message", label: "Mídia", icon: Film, color: "bg-green-600" },
      { type: "text_message", label: "Texto", icon: MessageSquare, color: "bg-emerald-600" },
      { type: "image_message", label: "Imagem", icon: ImageIcon, color: "bg-sky-600" },
    ],
  },
  {
    title: "Ações",
    nodes: [
      { type: "transfer_ai", label: "Transferir IA", icon: Bot, color: "bg-indigo-600" },
      { type: "transfer_human", label: "Transferir Humano", icon: UserRound, color: "bg-rose-600" },
      { type: "trigger", label: "Gatilho", icon: Zap, color: "bg-primary" },
    ],
  },
];

export function NodePanel() {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-60 border-r bg-card p-3 space-y-4 overflow-y-auto">
      <p className="text-[10px] text-muted-foreground text-center">Arraste para adicionar novos nós</p>

      {NODE_CATEGORIES.map((category) => (
        <div key={category.title}>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {category.title}
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            {category.nodes.map((node) => (
              <div
                key={node.type}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-border/50 bg-muted/40 p-2.5 cursor-grab hover:border-primary/50 hover:bg-accent/50 transition-colors active:cursor-grabbing"
                draggable
                onDragStart={(e) => onDragStart(e, node.type)}
              >
                <div className={`${node.color} rounded-md p-1.5 text-white`}>
                  <node.icon className="h-4 w-4" />
                </div>
                <p className="text-[10px] font-medium leading-tight text-center">{node.label}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
