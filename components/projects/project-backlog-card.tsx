"use client";

import { Inbox, Trash2 } from "lucide-react";
import { LinkifiedText } from "@/components/linkified-text";
import { TaskCreatorPopover } from "@/components/task-creator-popover";
import { TaskEditorPopover } from "@/components/task-editor-popover";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Project, Task } from "@/lib/api";

export function ProjectBacklogCard({ project, projects, tasks, deletingTaskId, onCreated, onUpdated, onDelete }: {
  project: Project;
  projects: Project[];
  tasks: Task[];
  deletingTaskId: number | null;
  onCreated: (task: Task) => void;
  onUpdated: (task: Task) => void;
  onDelete: (task: Task) => Promise<void>;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Inbox className="text-muted-foreground size-4" />Backlog</CardTitle>
        <CardAction>{!project.archived && <TaskCreatorPopover periodStart={null} projects={projects} defaultProjectId={project.id} projectLocked trigger="chip" onCreated={onCreated} />}</CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {tasks.length === 0 ? <p className="text-muted-foreground py-8 text-center text-sm">No backlog tasks for this project.</p> : tasks.map((task) => (
          <div key={task.id} className={deletingTaskId === task.id
            ? "animate-out fade-out slide-out-to-right-2 flex min-w-0 items-start gap-2 rounded-lg p-3 ring-1 ring-foreground/10 duration-200"
            : "animate-in fade-in slide-in-from-bottom-1 flex min-w-0 items-start gap-2 rounded-lg p-3 ring-1 ring-foreground/10 duration-200"}>
            <div className="min-w-0 flex-1"><p className="font-medium break-words">{task.title}</p>{task.description && <LinkifiedText text={task.description} as="p" className="text-muted-foreground mt-1 text-sm" />}</div>
            <TaskEditorPopover task={task} onUpdated={onUpdated} />
            <Button type="button" size="icon-xs" variant="ghost" aria-label={`Delete ${task.title}`} onClick={() => void onDelete(task)} disabled={deletingTaskId === task.id}><Trash2 className="text-destructive" /></Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
