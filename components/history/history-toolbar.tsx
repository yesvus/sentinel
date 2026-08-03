import { Download, History, Plus, Search, X } from "lucide-react";
import type { Project } from "@/lib/api";
import type { HistoryStatusFilter } from "@/lib/history";
import { formatDuration } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function HistoryToolbar({
  canExport,
  mode,
  projects,
  query,
  projectFilter,
  statusFilter,
  visibleCount,
  totalCount,
  trackedSeconds,
  completedCount,
  ongoingCount,
  onExportAll,
  onAddSession,
  onQueryChange,
  onProjectFilterChange,
  onStatusFilterChange,
  onResetFilters,
}: {
  canExport: boolean;
  mode: "page" | "embedded";
  projects: Project[];
  query: string;
  projectFilter: string;
  statusFilter: HistoryStatusFilter;
  visibleCount: number;
  totalCount: number;
  trackedSeconds: number;
  completedCount: number;
  ongoingCount: number;
  onExportAll: () => void;
  onAddSession: () => void;
  onQueryChange: (value: string) => void;
  onProjectFilterChange: (value: string) => void;
  onStatusFilterChange: (value: HistoryStatusFilter) => void;
  onResetFilters: () => void;
}) {
  const filtersActive = Boolean(query.trim()) || projectFilter !== "all" || statusFilter !== "all";

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <History className="text-muted-foreground size-4" />
            {mode === "page" ? "History" : "Session history"}
          </CardTitle>
          {mode === "page" && <p className="text-muted-foreground mt-0.5 text-sm">Find, review, and export tracked work.</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={!canExport} onClick={onExportAll}>
            <Download data-icon="inline-start" />
            Export visible
          </Button>
          <Button variant="outline" size="sm" onClick={onAddSession}>
            <Plus data-icon="inline-start" />
            Add session
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Summary label="Sessions" value={filtersActive ? `${visibleCount} of ${totalCount}` : String(totalCount)} />
          <Summary label="Tracked" value={formatDuration(trackedSeconds)} mono />
          <Summary label="Completed" value={String(completedCount)} />
          <Summary label="Ongoing" value={String(ongoingCount)} />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search history</span>
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search description or project"
              className="pl-8"
            />
          </label>
          <select
            aria-label="Filter history by project"
            value={projectFilter}
            onChange={(event) => onProjectFilterChange(event.target.value)}
            className="border-input bg-background h-8 min-w-40 rounded-lg border px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="all">All projects</option>
            {projects.slice().sort((a, b) => a.path.localeCompare(b.path)).map((project) => (
              <option key={project.id} value={project.id}>{project.path}</option>
            ))}
            <option value="none">No project</option>
          </select>
          <select
            aria-label="Filter history by status"
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value as HistoryStatusFilter)}
            className="border-input bg-background h-8 min-w-32 rounded-lg border px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="all">All statuses</option>
            <option value="completed">Completed</option>
            <option value="ongoing">Ongoing</option>
          </select>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={onResetFilters}>
              <X data-icon="inline-start" />
              Reset
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Summary({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-muted/20 ring-foreground/10 rounded-lg px-3 py-2 ring-1">
      <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">{label}</p>
      <p className={`mt-0.5 text-base font-medium ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
