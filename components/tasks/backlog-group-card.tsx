"use client";

import { Trash2 } from "lucide-react";
import { LinkifiedText } from "@/components/linkified-text";
import { TaskCreatorPopover } from "@/components/task-creator-popover";
import { TaskEditorPopover } from "@/components/task-editor-popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { Project, Task } from "@/lib/api";
import { NoProjectIcon, ProjectIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type BacklogTaskGroup = {
  key: string;
  project: Project | null;
  tasks: Task[];
};

export function BacklogGroupCard({
  group,
  groupIndex,
  projects,
  togglingId,
  removingIds,
  recentIds,
  onCreated,
  onUpdated,
  onToggle,
  onRemove,
}: {
  group: BacklogTaskGroup;
  groupIndex: number;
  projects: Project[];
  togglingId: number | null;
  removingIds: number[];
  recentIds: number[];
  onCreated: (task: Task) => void;
  onUpdated: (task: Task) => void;
  onToggle: (task: Task) => void;
  onRemove: (task: Task) => void;
}) {
  const activeCount = group.tasks.filter((task) => task.completed_at === null).length;

  return (
    <Card
      className="animate-in fade-in slide-in-from-bottom-2 mb-4 w-full break-inside-avoid duration-300 fill-mode-both"
      style={{ animationDelay: `${Math.min(groupIndex * 50, 200)}ms` }}
    >
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          {group.project ? <ProjectIcon icon={group.project.icon} /> : <NoProjectIcon />}
          <span className="truncate" title={group.project?.path ?? "No project"}>
            {group.project?.name ?? "No project"}
          </span>
        </CardTitle>
        <CardDescription>
          {activeCount} open{group.project?.archived ? " · Archived project" : ""}
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <Badge variant="outline">{group.tasks.length}</Badge>
          {!group.project?.archived && (
            <TaskCreatorPopover
              periodStart={null}
              projects={projects}
              defaultProjectId={group.project?.id ?? null}
              projectLocked
              onCreated={onCreated}
            />
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {group.tasks.map((task) => {
          const removing = removingIds.includes(task.id);
          const recent = recentIds.includes(task.id);
          const completed = task.completed_at !== null;
          return (
            <div
              key={task.id}
              className={cn(
                "group/task flex min-w-0 items-start gap-2 rounded-lg px-2 py-2 transition-[background-color,opacity,transform] duration-200 hover:bg-muted/60",
                recent && "animate-in fade-in slide-in-from-top-2 duration-300",
                removing && "animate-out fade-out slide-out-to-right-2 pointer-events-none duration-150 fill-mode-forwards",
              )}
            >
              <Checkbox
                className="mt-0.5"
                checked={completed}
                onCheckedChange={() => onToggle(task)}
                disabled={togglingId === task.id}
                aria-label={completed ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn(
                  "text-sm break-words transition-[color,opacity,text-decoration-color] duration-200",
                  completed && "text-muted-foreground line-through",
                )}>
                  {task.title}
                </span>
                {task.description && (
                  <LinkifiedText text={task.description} as="p" className="text-muted-foreground line-clamp-2 text-xs leading-relaxed" />
                )}
              </div>
              <div className="flex shrink-0 gap-1 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover/task:opacity-100 sm:group-focus-within/task:opacity-100">
                <TaskEditorPopover task={task} onUpdated={onUpdated} />
                <AlertDialog>
                  <AlertDialogTrigger
                    render={<Button variant="ghost" size="icon-xs" aria-label={`Delete ${task.title}`} className="text-destructive hover:text-destructive" />}
                  >
                    <Trash2 />
                  </AlertDialogTrigger>
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this task?</AlertDialogTitle>
                      <AlertDialogDescription>
                        &ldquo;{task.title}&rdquo; will be permanently removed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => onRemove(task)}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
