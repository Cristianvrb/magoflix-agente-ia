import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PostsTab } from "@/components/social/PostsTab";
import { AutoPilotTab } from "@/components/social/AutoPilotTab";
import { SettingsTab } from "@/components/social/SettingsTab";
import { SocialDashboardTab } from "@/components/social/SocialDashboardTab";
import { CommentsTab } from "@/components/social/CommentsTab";
import { DMsTab } from "@/components/social/DMsTab";
import { PostCreatorTab } from "@/components/social/PostCreatorTab";
import { IdeogramLabTab } from "@/components/social/IdeogramLabTab";
import { Share2, FileText, Bot, Settings, BarChart3, MessageCircle, Mail, ImagePlus, FlaskConical } from "lucide-react";

export default function SocialMediaPage() {
  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Share2 className="h-6 w-6 text-primary" /> Social Media
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie posts, comentários, DMs e métricas do Instagram e Threads.
        </p>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList className="flex-wrap">
          <TabsTrigger value="dashboard" className="gap-1"><BarChart3 className="h-4 w-4" /> Dashboard</TabsTrigger>
          <TabsTrigger value="posts" className="gap-1"><FileText className="h-4 w-4" /> Posts</TabsTrigger>
          <TabsTrigger value="comments" className="gap-1"><MessageCircle className="h-4 w-4" /> Comentários</TabsTrigger>
          <TabsTrigger value="dms" className="gap-1"><Mail className="h-4 w-4" /> DMs</TabsTrigger>
          <TabsTrigger value="auto" className="gap-1"><Bot className="h-4 w-4" /> Auto Piloto</TabsTrigger>
          <TabsTrigger value="create" className="gap-1"><ImagePlus className="h-4 w-4" /> Criar Post</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1"><Settings className="h-4 w-4" /> Config</TabsTrigger>
          <TabsTrigger value="lab" className="gap-1"><FlaskConical className="h-4 w-4" /> Lab</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard"><SocialDashboardTab /></TabsContent>
        <TabsContent value="posts"><PostsTab /></TabsContent>
        <TabsContent value="comments"><CommentsTab /></TabsContent>
        <TabsContent value="dms"><DMsTab /></TabsContent>
        <TabsContent value="auto"><AutoPilotTab /></TabsContent>
        <TabsContent value="create"><PostCreatorTab /></TabsContent>
        <TabsContent value="settings"><SettingsTab /></TabsContent>
        <TabsContent value="lab"><IdeogramLabTab /></TabsContent>
      </Tabs>
    </div>
  );
}
