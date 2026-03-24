import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import DashboardPage from "@/pages/DashboardPage";
import ConversationsPage from "@/pages/ConversationsPage";
import FunnelPage from "@/pages/FunnelPage";
import TestAgentPage from "@/pages/TestAgentPage";
import InstancesPage from "@/pages/InstancesPage";
import GroupsPage from "@/pages/GroupsPage";
import SettingsPage from "@/pages/SettingsPage";
import AuthPage from "@/pages/AuthPage";
import AgentsPage from "@/pages/AgentsPage";
import AgentDetailPage from "@/pages/AgentDetailPage";
import CreativesPage from "@/pages/CreativesPage";
import FlowBuilderPage from "@/pages/FlowBuilderPage";
import ABDashboardPage from "@/pages/ABDashboardPage";
import EstimatesPage from "@/pages/EstimatesPage";
import CampaignsPage from "@/pages/CampaignsPage";
import FunnelAnalyticsPage from "@/pages/FunnelAnalyticsPage";
import SocialMediaPage from "@/pages/SocialMediaPage";
import CostsPage from "@/pages/CostsPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import ManagerPage from "@/pages/ManagerPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/conversas" element={<ConversationsPage />} />
              <Route path="/funil" element={<FunnelPage />} />
              <Route path="/analise-funil" element={<FunnelAnalyticsPage />} />
              <Route path="/testar-ia" element={<TestAgentPage />} />
              <Route path="/instancias" element={<InstancesPage />} />
              <Route path="/grupos" element={<GroupsPage />} />
              <Route path="/configuracoes" element={<SettingsPage />} />
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/agents/:id" element={<AgentDetailPage />} />
              <Route path="/agents/:id/flow" element={<FlowBuilderPage />} />
              <Route path="/agents/:id/ab-dashboard" element={<ABDashboardPage />} />
              <Route path="/criativos" element={<CreativesPage />} />
              <Route path="/campanhas" element={<CampaignsPage />} />
              <Route path="/estimativas" element={<EstimatesPage />} />
              <Route path="/social-media" element={<SocialMediaPage />} />
              <Route path="/custos" element={<CostsPage />} />
              <Route path="/gerente" element={<ManagerPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
