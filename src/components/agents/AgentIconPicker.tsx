import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bot, Sparkles, Rocket, Crown, Heart, Star, Shield, Zap, Brain, MessageSquare, Target, Lightbulb, Coffee, Flame, Globe, Music, Camera, BookOpen, Award, Gem, Headphones, Smile, Sun, Moon, Cloud, Compass, Feather, Gift, Key, Anchor, Bell, type LucideIcon } from "lucide-react";

const ICONS: { name: string; icon: LucideIcon }[] = [
  { name: "bot", icon: Bot },
  { name: "sparkles", icon: Sparkles },
  { name: "rocket", icon: Rocket },
  { name: "crown", icon: Crown },
  { name: "heart", icon: Heart },
  { name: "star", icon: Star },
  { name: "shield", icon: Shield },
  { name: "zap", icon: Zap },
  { name: "brain", icon: Brain },
  { name: "message-square", icon: MessageSquare },
  { name: "target", icon: Target },
  { name: "lightbulb", icon: Lightbulb },
  { name: "coffee", icon: Coffee },
  { name: "flame", icon: Flame },
  { name: "globe", icon: Globe },
  { name: "music", icon: Music },
  { name: "camera", icon: Camera },
  { name: "book-open", icon: BookOpen },
  { name: "award", icon: Award },
  { name: "gem", icon: Gem },
  { name: "headphones", icon: Headphones },
  { name: "smile", icon: Smile },
  { name: "sun", icon: Sun },
  { name: "moon", icon: Moon },
  { name: "cloud", icon: Cloud },
  { name: "compass", icon: Compass },
  { name: "feather", icon: Feather },
  { name: "gift", icon: Gift },
  { name: "key", icon: Key },
  { name: "anchor", icon: Anchor },
  { name: "bell", icon: Bell },
];

interface AgentIconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export function AgentIconPicker({ value, onChange }: AgentIconPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = ICONS.find((i) => i.name === value) ?? ICONS[0];
  const SelectedIcon = selected.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl">
          <SelectedIcon className="h-6 w-6" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-3">
        <div className="grid grid-cols-8 gap-1">
          {ICONS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.name}
                onClick={() => { onChange(item.name); setOpen(false); }}
                className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent ${
                  value === item.name ? "bg-primary/10 text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
