import { useState } from "react";
import { Check, Plus } from "lucide-react";
import type { Task } from "@/lib/api";
import { CompletedTaskCreateForm } from "@/components/sessions/completed-task-create-form";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

export function CompletedTaskPicker({
  sessionId,
  projectId,
  periodStart,
  availableTasks,
  selectedTaskIds,
  disabled,
  onSelectionChange,
  onTaskCreated,
  onError,
}: {
  sessionId: number;
  projectId: number | null;
  periodStart: string;
  availableTasks: Task[];
  selectedTaskIds: number[];
  disabled: boolean;
  onSelectionChange: (ids: number[]) => void;
  onTaskCreated: (task: Task) => void;
  onError: (message: string | null) => void;
}) {
  const [creating, setCreating] = useState(false);

  function toggleTask(taskId: number) {
    onSelectionChange(
      selectedTaskIds.includes(taskId)
        ? selectedTaskIds.filter((id) => id !== taskId)
        : [...selectedTaskIds, taskId],
    );
  }

  return (
    <Popover>
      <PopoverTrigger render={<Button type="button" variant="outline" size="sm" disabled={disabled} />}>
        <Plus data-icon="inline-start" />Add tasks
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0">
        <PopoverHeader className="border-b bg-muted/20 px-4 py-3">
          <PopoverTitle>{creating ? "New completed task" : "Add tasks to session"}</PopoverTitle>
        </PopoverHeader>
        {creating ? (
          <CompletedTaskCreateForm
            sessionId={sessionId}
            projectId={projectId}
            periodStart={periodStart}
            onCreated={(task) => {
              if (!selectedTaskIds.includes(task.id)) onSelectionChange([...selectedTaskIds, task.id]);
              onTaskCreated(task);
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
            onError={onError}
          />
        ) : (
          <div className="animate-in fade-in slide-in-from-left-1 max-h-64 overflow-y-auto p-2 duration-150">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="text-primary hover:bg-muted/60 mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium transition-colors duration-150"
            >
              <Plus className="size-4" />New completed task
            </button>
            {availableTasks.length === 0 ? (
              <p className="text-muted-foreground px-2 py-6 text-center text-sm">No completed or Backlog tasks available.</p>
            ) : ([
              { label: "Backlog", items: availableTasks.filter((task) => task.completed_at === null) },
              { label: "Completed", items: availableTasks.filter((task) => task.completed_at !== null) },
            ]).map((group) => group.items.length > 0 && (
              <div key={group.label} className="mb-2 last:mb-0">
                <p className="text-muted-foreground px-2 py-1 text-[11px] font-medium uppercase tracking-wide">{group.label}</p>
                {group.items.map((task) => {
                  const selected = selectedTaskIds.includes(task.id);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => toggleTask(task.id)}
                      className="hover:bg-muted/60 flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors duration-150"
                    >
                      <span className={selected ? "bg-primary text-primary-foreground mt-0.5 flex size-4 shrink-0 items-center justify-center rounded" : "border-border mt-0.5 size-4 shrink-0 rounded border"}>
                        {selected && <Check className="size-3" />}
                      </span>
                      <span className="min-w-0 text-sm break-words">{task.title}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
