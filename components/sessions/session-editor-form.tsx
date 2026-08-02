import type { Task } from "@/lib/api";
import { TaskEditorPopover } from "@/components/task-editor-popover";
import { LinkifiedText } from "@/components/linkified-text";
import { CompletedTaskPicker } from "@/components/sessions/completed-task-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function SessionEditorForm({
  sessionId,
  projectId,
  tasks,
  availableTasks,
  date,
  startTime,
  endTime,
  ongoing,
  description,
  selectedTaskIds,
  busy,
  error,
  onDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onOngoingChange,
  onDescriptionChange,
  onSelectionChange,
  onTaskUpdated,
  onTaskCreated,
  onError,
}: {
  sessionId: number;
  projectId: number | null;
  tasks: Task[];
  availableTasks: Task[];
  date: string;
  startTime: string;
  endTime: string;
  ongoing: boolean;
  description: string;
  selectedTaskIds: number[];
  busy: boolean;
  error: string | null;
  onDateChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  onOngoingChange: (value: boolean) => void;
  onDescriptionChange: (value: string) => void;
  onSelectionChange: (ids: number[]) => void;
  onTaskUpdated: (task: Task) => void;
  onTaskCreated: (task: Task) => void;
  onError: (message: string | null) => void;
}) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`session-date-${sessionId}`}>Date</FieldLabel>
        <Input id={`session-date-${sessionId}`} type="date" value={date} onChange={(event) => onDateChange(event.target.value)} disabled={busy} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor={`session-start-${sessionId}`}>Start time</FieldLabel>
          <Input id={`session-start-${sessionId}`} type="time" value={startTime} onChange={(event) => onStartTimeChange(event.target.value)} disabled={busy} required />
        </Field>
        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor={`session-end-${sessionId}`}>End time</FieldLabel>
            <label htmlFor={`session-ongoing-${sessionId}`} className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs">
              <Checkbox
                id={`session-ongoing-${sessionId}`}
                className="size-3.5"
                checked={ongoing}
                onCheckedChange={(checked) => onOngoingChange(Boolean(checked))}
                disabled={busy}
              />
              Ongoing
            </label>
          </div>
          <Input id={`session-end-${sessionId}`} type="time" value={endTime} onChange={(event) => onEndTimeChange(event.target.value)} disabled={busy || ongoing} required={!ongoing} />
        </Field>
      </div>
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={`session-description-${sessionId}`}>Description</FieldLabel>
        <Textarea
          id={`session-description-${sessionId}`}
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="What happened during this session?"
          className="min-h-32 resize-y"
          maxLength={4000}
          aria-invalid={Boolean(error)}
          disabled={busy}
        />
      </Field>
      {!ongoing && (
        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldTitle>Completed tasks</FieldTitle>
            <CompletedTaskPicker
              sessionId={sessionId}
              projectId={projectId}
              periodStart={date}
              availableTasks={availableTasks}
              selectedTaskIds={selectedTaskIds}
              disabled={busy}
              onSelectionChange={onSelectionChange}
              onTaskCreated={onTaskCreated}
              onError={onError}
            />
          </div>
          {selectedTaskIds.length > 0 ? (
            <div className="animate-in fade-in flex flex-col gap-1 rounded-lg border p-2 duration-150">
              {selectedTaskIds.map((taskId) => {
                const task = [...availableTasks, ...tasks].find((item) => item.id === taskId);
                if (!task) return null;
                return (
                  <div key={task.id} className="group/task flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-muted/60">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm break-words">{task.title}</span>
                      {task.description && <LinkifiedText text={task.description} className="text-muted-foreground line-clamp-2 text-xs" />}
                    </div>
                    <div className="opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover/task:opacity-100 sm:group-focus-within/task:opacity-100">
                      <TaskEditorPopover task={task} onUpdated={onTaskUpdated} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground py-3 text-sm">No completed tasks attached.</p>
          )}
        </Field>
      )}
      <FieldError>{error}</FieldError>
    </FieldGroup>
  );
}
