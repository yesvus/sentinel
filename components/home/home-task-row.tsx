import { CircleCheck, CirclePlus, Unlink } from "lucide-react";
import type { Task } from "@/lib/api";
import { cn } from "@/lib/utils";
import { TaskEditorPopover } from "@/components/task-editor-popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type HomeTaskRowProps = {
  task: Task;
  checked: boolean;
  mode?: "select" | "complete";
  selected?: boolean;
  recent?: boolean;
  removing?: boolean;
  dragging?: boolean;
  onCheckedChange: () => void;
  onUpdated: (task: Task) => void;
  onRemove?: (task: Task) => void;
};

export function HomeTaskRow({
  task,
  checked,
  mode = "complete",
  selected = false,
  recent = false,
  removing = false,
  dragging = false,
  onCheckedChange,
  onUpdated,
  onRemove,
}: HomeTaskRowProps) {
  const completed = task.completed_at !== null;

  return (
    <div
      className={cn(
        "group/task flex min-h-6 min-w-0 items-start gap-0.5 rounded-md px-1 py-0 transition-[background-color,opacity,transform] duration-150",
        !dragging && "hover:bg-muted/50",
        selected && "bg-primary/10",
        recent && "animate-in fade-in slide-in-from-top-1 duration-300",
        removing && "animate-out fade-out slide-out-to-right-2 pointer-events-none fill-mode-forwards",
      )}
    >
      {mode === "complete" ? (
        <Checkbox
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="mt-[5px] size-3.5 shrink-0 cursor-pointer after:inset-0"
          aria-label={task.title}
        />
      ) : (
        <button
          type="button"
          aria-label={checked ? `Remove ${task.title} from session selection` : `Choose ${task.title} for the next session`}
          aria-pressed={checked}
          onClick={onCheckedChange}
          className={cn(
            "mt-1 flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-150",
            checked ? "text-primary" : "text-muted-foreground/60 hover:text-foreground",
          )}
        >
          {checked ? <CircleCheck className="size-3.5" /> : <CirclePlus className="size-3.5" />}
        </button>
      )}
      <button
        type="button"
        aria-pressed={selected || undefined}
        onClick={onCheckedChange}
        className="flex min-w-0 flex-1 flex-col text-left text-sm"
      >
        <span className={cn("leading-6", completed ? "text-muted-foreground line-through" : selected && "text-primary")}>
          {task.title}
        </span>
        {task.description && (
          <span className="text-muted-foreground pr-0.5 text-xs leading-4 whitespace-pre-wrap break-words">
            {task.description}
          </span>
        )}
      </button>
      <div className={cn(
        "flex items-center gap-0 transition-opacity duration-150",
        dragging ? "opacity-0" : "opacity-100 sm:opacity-0 sm:group-hover/task:opacity-100 sm:group-focus-within/task:opacity-100",
      )}>
        <TaskEditorPopover task={task} onUpdated={onUpdated} />
        {onRemove && (
          <TooltipProvider delay={2000}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${task.title} from session`}
                    onClick={() => onRemove(task)}
                    disabled={removing}
                  />
                }
              >
                <Unlink />
              </TooltipTrigger>
              <TooltipContent>Remove from this session without deleting the task</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
