import { FormEvent, useState } from "react";
import type { Project, StudySession } from "@/lib/api";
import { ApiError, sessions as sessionsApi } from "@/lib/api";
import { dateInputValue, timeInputValue } from "@/lib/date";
import { sessionFormDates, validateSessionFormDates } from "@/lib/session-form";
import { orderProjectsAsTree } from "@/lib/project-tree";
import { NoProjectIcon, ProjectIcon } from "@/lib/icons";
import { useActiveSession } from "@/lib/active-session-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const NO_PROJECT_VALUE = "__none__";

export function HistorySessionDialog({
  session,
  projects,
  trackProductionSplit,
  onClose,
  onSaved,
}: {
  session: StudySession | null;
  projects: Project[];
  trackProductionSplit: boolean;
  onClose: () => void;
  onSaved: (updater: (list: StudySession[]) => StudySession[]) => void;
}) {
  const { notifySessionChanged } = useActiveSession();
  const [initial] = useState(() => {
    const now = new Date();
    return {
      start: session ? new Date(session.started_at) : new Date(now.getTime() - 60 * 60 * 1000),
      end: session?.ended_at ? new Date(session.ended_at) : now,
    };
  });
  const [date, setDate] = useState(() => dateInputValue(initial.start));
  const [startTime, setStartTime] = useState(() => timeInputValue(initial.start));
  const [endTime, setEndTime] = useState(() => timeInputValue(initial.end));
  const [ongoing, setOngoing] = useState(session?.ended_at === null);
  const [projectId, setProjectId] = useState<number | null>(session?.project_id ?? null);
  const [description, setDescription] = useState(session?.description ?? "");
  const [productionPercentage, setProductionPercentage] = useState(session?.production_percentage ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const { startedAt, endedAt } = sessionFormDates(date, startTime, endTime, ongoing);
    const validationError = validateSessionFormDates(startedAt, endedAt);
    if (validationError) {
      setError(validationError);
      return;
    }

    const project = projects.find((item) => item.id === projectId) ?? null;
    const allocation = trackProductionSplit ? productionPercentage : null;
    setBusy(true);
    try {
      if (session) {
        const updated = await sessionsApi.update(session.id, {
          startedAt: startedAt.toISOString(),
          endedAt: endedAt?.toISOString() ?? null,
          projectId,
          description: description || null,
          productionPercentage: ongoing ? null : allocation,
        });
        onSaved((list) =>
          list
            .map((item) =>
              item.id === session.id
                ? {
                    ...item,
                    started_at: updated.startedAt,
                    ended_at: updated.endedAt,
                    duration_seconds: updated.durationSeconds,
                    description: updated.description,
                    project_id: updated.projectId,
                    project_name: project?.name ?? null,
                    project_icon: project?.icon ?? null,
                    production_percentage: ongoing ? null : allocation,
                  }
                : item,
            )
            .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()),
        );
        await notifySessionChanged().catch(() => {});
      } else {
        const created = await sessionsApi.createManual({
          startedAt: startedAt.toISOString(),
          endedAt: endedAt!.toISOString(),
          projectId,
          description: description || null,
          productionPercentage: allocation,
        });
        onSaved((list) =>
          [
            {
              id: created.id,
              started_at: created.startedAt,
              ended_at: created.endedAt,
              duration_seconds: created.durationSeconds,
              description: description || null,
              project_id: projectId,
              project_name: project?.name ?? null,
              project_icon: project?.icon ?? null,
              production_percentage: allocation,
            },
            ...list,
          ].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()),
        );
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{session ? "Edit session" : "Add a session"}</DialogTitle>
          <DialogDescription>
            {session
              ? ongoing
                ? "Update the running session without stopping it."
                : "Fix a session that ran long, or update its details."
              : "For time you forgot to track live. It's added as an already-finished session."}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={save}>
          {session && (
            <label htmlFor="edit-ongoing" className="border-border flex cursor-pointer items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
              <span>
                <span className="block text-sm font-medium">Ongoing session</span>
                <span className="text-muted-foreground block text-xs">Keep this session running without an end time.</span>
              </span>
              <input
                id="edit-ongoing"
                type="checkbox"
                checked={ongoing}
                onChange={(event) => setOngoing(event.target.checked)}
                className="accent-primary size-4"
              />
            </label>
          )}
          <div className="space-y-2">
            <Label htmlFor="add-date">Date</Label>
            <Input id="add-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="add-start">Start time</Label>
              <Input id="add-start" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-end">End time</Label>
              <Input id="add-end" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} disabled={ongoing} required={!ongoing} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Project</Label>
            <Select value={projectId !== null ? String(projectId) : NO_PROJECT_VALUE} onValueChange={(value) => setProjectId(value === NO_PROJECT_VALUE ? null : Number(value))}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: string) => {
                    const selected = projects.find((project) => String(project.id) === value);
                    return (
                      <span className="flex items-center gap-2">
                        {selected ? <ProjectIcon icon={selected.icon} className="size-4" /> : <NoProjectIcon className="size-4" />}
                        {selected?.name ?? "No project"}
                      </span>
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT_VALUE}><NoProjectIcon className="size-4" />No project</SelectItem>
                {orderProjectsAsTree(projects.filter((project) => !project.archived || project.id === projectId)).map(({ project, treeDepth }) => (
                  <SelectItem key={project.id} value={String(project.id)}>
                    {treeDepth > 0 && <span className="text-border" aria-hidden="true">└</span>}
                    <ProjectIcon icon={project.icon} className="size-4" />
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-description">Description (optional)</Label>
            <Textarea id="add-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What were you working on?" />
          </div>
          {!ongoing && trackProductionSplit && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="add-production">Session allocation</Label>
                <span className="text-muted-foreground text-xs">Producing {productionPercentage}%</span>
              </div>
              <input
                id="add-production"
                type="range"
                min="0"
                max="100"
                step="10"
                value={productionPercentage}
                onChange={(event) => setProductionPercentage(Number(event.target.value))}
                aria-valuetext={`Learning ${100 - productionPercentage} percent, Producing ${productionPercentage} percent`}
                className="accent-primary w-full"
              />
              <p className="text-muted-foreground text-center text-xs">Learning {100 - productionPercentage}% · Producing {productionPercentage}%</p>
            </div>
          )}
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? "Saving..." : session ? "Save changes" : "Add session"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
