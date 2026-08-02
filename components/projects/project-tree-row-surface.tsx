import type { ReactNode } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { ProjectDescriptionPreview } from "@/components/project-description-preview";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProjectIcon } from "@/lib/icons";
import type { ProjectTreeItem } from "@/lib/project-tree";
import { cn } from "@/lib/utils";

export function ProjectActionTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ProjectTreeRowSurface({
  item,
  backlogCount,
  actions,
  dragHandle,
  dragging = false,
}: {
  item: ProjectTreeItem;
  backlogCount: number;
  actions?: ReactNode;
  dragHandle?: ReactNode;
  dragging?: boolean;
}) {
  const { project } = item;
  return (
    <div className={cn(
      "bg-card flex min-w-0 items-start gap-3 rounded-lg p-3 ring-1 ring-foreground/10 transition-[opacity,box-shadow,background-color] duration-200",
      dragging && "bg-accent opacity-70 shadow-lg",
    )}>
      {dragHandle}
      <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
        <ProjectIcon icon={project.icon} className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link href={`/app/projects/${project.id}`} className="min-w-0 truncate font-medium transition-colors duration-150 hover:text-primary" title={project.path}>
            {project.name}
          </Link>
          {project.archived && <Badge variant="outline">Archived</Badge>}
          {backlogCount > 0 && <Badge variant="outline" className="gap-1"><Inbox />{backlogCount}</Badge>}
        </div>
        <div className="mt-1.5"><ProjectDescriptionPreview description={project.description} /></div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}
