export type ConversationChannel = "whatsapp" | "web";
export type LeadStage = "novo" | "qualificado" | "proposta" | "fechado" | "perdido";

export interface Conversation {
  id: string;
  contactName: string;
  contactPhone?: string;
  channel: ConversationChannel;
  lastMessage: string;
  lastMessageAt: string;
  status: "active" | "closed";
  leadStage: LeadStage;
  messages: Message[];
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface Lead {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  channel: ConversationChannel;
  stage: LeadStage;
  lastInteraction: string;
  conversationId: string;
}

export interface DashboardMetrics {
  totalConversations: number;
  qualifiedLeads: number;
  conversions: number;
  responseRate: number;
}

export const mockMetrics: DashboardMetrics = {
  totalConversations: 147,
  qualifiedLeads: 43,
  conversions: 12,
  responseRate: 94,
};

export const mockChartData = [
  { day: "Seg", conversas: 18 },
  { day: "Ter", conversas: 24 },
  { day: "Qua", conversas: 20 },
  { day: "Qui", conversas: 31 },
  { day: "Sex", conversas: 27 },
  { day: "Sáb", conversas: 14 },
  { day: "Dom", conversas: 9 },
];

const now = new Date();
const fmt = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();

export const mockConversations: Conversation[] = [
  {
    id: "1",
    contactName: "Carlos Silva",
    contactPhone: "+55 11 99999-1234",
    channel: "whatsapp",
    lastMessage: "Qual o preço do plano premium?",
    lastMessageAt: fmt(0.5),
    status: "active",
    leadStage: "qualificado",
    messages: [
      { id: "m1", role: "user", content: "Olá, vi o anúncio de vocês", timestamp: fmt(2) },
      { id: "m2", role: "assistant", content: "Olá Carlos! Que bom ter você aqui. Nosso SaaS ajuda empresas a automatizar vendas. Posso te mostrar como funciona?", timestamp: fmt(1.9) },
      { id: "m3", role: "user", content: "Sim, me conta mais", timestamp: fmt(1.5) },
      { id: "m4", role: "assistant", content: "Temos 3 planos: Starter (R$97/mês), Pro (R$197/mês) e Premium (R$397/mês). O Pro é o mais popular!", timestamp: fmt(1.4) },
      { id: "m5", role: "user", content: "Qual o preço do plano premium?", timestamp: fmt(0.5) },
    ],
  },
  {
    id: "2",
    contactName: "Ana Oliveira",
    contactPhone: "+55 21 98888-5678",
    channel: "whatsapp",
    lastMessage: "Vou pensar e volto amanhã",
    lastMessageAt: fmt(3),
    status: "active",
    leadStage: "proposta",
    messages: [
      { id: "m6", role: "user", content: "Boa tarde!", timestamp: fmt(5) },
      { id: "m7", role: "assistant", content: "Boa tarde Ana! Como posso ajudar?", timestamp: fmt(4.9) },
      { id: "m8", role: "user", content: "Vou pensar e volto amanhã", timestamp: fmt(3) },
    ],
  },
  {
    id: "3",
    contactName: "Visitante Web #42",
    channel: "web",
    lastMessage: "Como funciona o trial?",
    lastMessageAt: fmt(1),
    status: "active",
    leadStage: "novo",
    messages: [
      { id: "m9", role: "user", content: "Como funciona o trial?", timestamp: fmt(1) },
      { id: "m10", role: "assistant", content: "Oferecemos 14 dias grátis com acesso completo ao plano Pro. Quer começar agora?", timestamp: fmt(0.9) },
    ],
  },
  {
    id: "4",
    contactName: "Roberto Mendes",
    contactPhone: "+55 31 97777-9012",
    channel: "whatsapp",
    lastMessage: "Fechado! Vou assinar o Pro",
    lastMessageAt: fmt(24),
    status: "closed",
    leadStage: "fechado",
    messages: [
      { id: "m11", role: "user", content: "Fechado! Vou assinar o Pro", timestamp: fmt(24) },
    ],
  },
  {
    id: "5",
    contactName: "Maria Santos",
    channel: "web",
    lastMessage: "Não é o que preciso agora",
    lastMessageAt: fmt(48),
    status: "closed",
    leadStage: "perdido",
    messages: [
      { id: "m12", role: "user", content: "Não é o que preciso agora", timestamp: fmt(48) },
    ],
  },
];

export const mockLeads: Lead[] = mockConversations.map((c) => ({
  id: `lead-${c.id}`,
  name: c.contactName,
  phone: c.contactPhone,
  channel: c.channel,
  stage: c.leadStage,
  lastInteraction: c.lastMessageAt,
  conversationId: c.id,
}));
