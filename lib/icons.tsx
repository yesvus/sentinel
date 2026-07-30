import {
  BookOpen,
  Code2,
  Calculator,
  FlaskConical,
  Music,
  Dumbbell,
  Globe,
  PenTool,
  Briefcase,
  Palette,
  Languages,
  Atom,
  Cat,
  Dog,
  Bird,
  Fish,
  Rabbit,
  Rocket,
  Star,
  Ghost,
  Bot,
  Coffee,
  Gamepad2,
  Sparkles,
  Folder,
} from "lucide-react";

export const PROJECT_ICONS = {
  book: BookOpen,
  code: Code2,
  calculator: Calculator,
  flask: FlaskConical,
  music: Music,
  dumbbell: Dumbbell,
  globe: Globe,
  pen: PenTool,
  briefcase: Briefcase,
  palette: Palette,
  languages: Languages,
  atom: Atom,
} as const;

export type ProjectIconKey = keyof typeof PROJECT_ICONS;

export function ProjectIcon({
  icon,
  className,
}: {
  icon: string | null;
  className?: string;
}) {
  const Icon = icon && icon in PROJECT_ICONS ? PROJECT_ICONS[icon as ProjectIconKey] : Folder;
  return <Icon className={className} />;
}

export const AVATAR_ICONS = {
  cat: Cat,
  dog: Dog,
  bird: Bird,
  fish: Fish,
  rabbit: Rabbit,
  rocket: Rocket,
  star: Star,
  ghost: Ghost,
  bot: Bot,
  coffee: Coffee,
  gamepad: Gamepad2,
  sparkles: Sparkles,
} as const;

export type AvatarIconKey = keyof typeof AVATAR_ICONS;

const AVATAR_COLORS: Record<AvatarIconKey, string> = {
  cat: "#f59e0b",
  dog: "#0e7490",
  bird: "#22d3ee",
  fish: "#0891b2",
  rabbit: "#a78bfa",
  rocket: "#f43f5e",
  star: "#eab308",
  ghost: "#94a3b8",
  bot: "#64748b",
  coffee: "#78350f",
  gamepad: "#7c3aed",
  sparkles: "#ec4899",
};

export function Avatar({ avatar, className }: { avatar: string | null; className?: string }) {
  const key = avatar && avatar in AVATAR_ICONS ? (avatar as AvatarIconKey) : null;
  const Icon = key ? AVATAR_ICONS[key] : Bot;
  const color = key ? AVATAR_COLORS[key] : "#94a3b8";

  return (
    <div
      className={className}
      style={{ backgroundColor: color }}
    >
      <Icon className="!size-full p-1.5 text-white" />
    </div>
  );
}
