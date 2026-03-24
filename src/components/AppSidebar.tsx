import { LayoutDashboard, MessageSquare, Kanban, Settings, Zap, TestTube, Plug, Bot, Megaphone, Sparkles, Users, Calculator, BarChart3, Rocket, Share2, Coins, Brain } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Conversas", url: "/conversas", icon: MessageSquare },
  { title: "Funil de Vendas", url: "/funil", icon: Kanban },
  { title: "Análise Funil", url: "/analise-funil", icon: BarChart3 },
  { title: "Agentes", url: "/agents", icon: Bot },
  { title: "Criativos", url: "/criativos", icon: Megaphone },
  { title: "Campanhas", url: "/campanhas", icon: Rocket },
  { title: "Estimativas", url: "/estimativas", icon: Calculator },
  { title: "Social Media", url: "/social-media", icon: Share2 },
  { title: "Custos", url: "/custos", icon: Coins },
  { title: "Gerente IA", url: "/gerente", icon: Brain },
  { title: "Testar IA", url: "/testar-ia", icon: TestTube },
  { title: "Instâncias", url: "/instancias", icon: Plug },
  { title: "Grupos", url: "/grupos", icon: Users },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  const isActive = (url: string) => {
    if (url === "/") return location.pathname === "/";
    return location.pathname.startsWith(url);
  };

  return (
    <Sidebar collapsible="icon" className="sidebar-gradient">
      <SidebarHeader className="p-4 pb-0">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground sidebar-logo-glow">
            <Zap className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-sidebar-accent-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                Magoflix
              </span>
              <span className="text-[10px] uppercase tracking-widest text-sidebar-primary">
                Agente IA
              </span>
            </div>
          )}
        </div>
        {/* Gradient separator */}
        <div className="mt-4 h-px sidebar-separator" />
      </SidebarHeader>

      <SidebarContent className="pt-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1 px-2">
              {items.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title} className="relative">
                    {/* Active indicator bar */}
                    {active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-sidebar-primary sidebar-active-glow" />
                    )}
                    <SidebarMenuButton asChild tooltip={item.title}>
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className="sidebar-menu-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sidebar-foreground transition-all duration-200"
                        activeClassName="sidebar-menu-item-active bg-sidebar-accent text-sidebar-primary font-semibold"
                      >
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
                          active 
                            ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-lg' 
                            : 'text-sidebar-foreground'
                        }`}>
                          <item.icon className="h-[18px] w-[18px]" />
                        </div>
                        <span className="text-sm">{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 pt-0">
        <div className="h-px sidebar-separator mb-3" />
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-sidebar-primary shrink-0" />
          {!collapsed && (
            <div className="flex items-center justify-between w-full">
              <span className="text-[11px] text-sidebar-foreground">v1.0</span>
              <Badge className="bg-sidebar-primary/20 text-sidebar-primary border-sidebar-primary/30 text-[10px] px-2 py-0 hover:bg-sidebar-primary/30">
                Pro
              </Badge>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
