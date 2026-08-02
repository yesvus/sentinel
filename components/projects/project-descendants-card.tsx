import Link from "next/link";
import { FolderTree } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectIcon } from "@/lib/icons";
import type { ProjectTreeItem } from "@/lib/project-tree";

export function ProjectDescendantsCard({ descendants }: { descendants: ProjectTreeItem[] }) {
  return (
    <Card className="min-w-0">
      <CardHeader><CardTitle className="flex items-center gap-2"><FolderTree className="text-muted-foreground size-4" />Below this project</CardTitle><CardDescription>{descendants.length} nested project{descendants.length === 1 ? "" : "s"}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-1">
        {descendants.length === 0 ? <p className="text-muted-foreground py-8 text-center text-sm">No child projects.</p> : descendants.map(({ project, treeDepth }) => (
          <Link key={project.id} href={`/app/projects/${project.id}`} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors duration-150 hover:bg-accent" style={{ paddingInlineStart: `${0.5 + treeDepth * 1.15}rem` }}>
            {treeDepth > 0 && <span className="text-border" aria-hidden="true">└</span>}<ProjectIcon icon={project.icon} className="size-4 shrink-0" /><span className="truncate" title={project.path}>{project.name}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
