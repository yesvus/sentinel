"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Pin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { Project } from "@/lib/api";
import { ProjectIcon, NoProjectIcon } from "@/lib/icons";
import { projectTreeWithMatches } from "@/lib/project-tree";
import { ProjectCreatorPopover } from "@/components/project-creator-popover";

export function ProjectSelector({
  projects,
  value,
  onChange,
  onProjectCreated,
  disabled,
}: {
  projects: Project[];
  value: number | null;
  onChange: (id: number | null) => void;
  onProjectCreated?: (project: Project) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdProjects, setCreatedProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const availableProjects = useMemo(() => {
    const projectIds = new Set(projects.map((project) => project.id));
    return [...projects, ...createdProjects.filter((project) => !projectIds.has(project.id))];
  }, [createdProjects, projects]);
  const selected = availableProjects.find((project) => project.id === value) ?? null;
  const active = useMemo(
    () => availableProjects.filter((project) => !project.archived || project.id === value),
    [availableProjects, value],
  );
  const hierarchy = useMemo(() => projectTreeWithMatches(active, search), [active, search]);

  const choose = (id: number | null) => {
    onChange(id);
    setOpen(false);
    setSearch("");
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
      <div className={disabled ? "cursor-not-allowed" : undefined}>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-label="Choose project"
              disabled={disabled}
              className="w-full justify-between font-normal"
            />
          }
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected ? (
              <ProjectIcon icon={selected.icon} className="size-4 shrink-0" />
            ) : (
              <NoProjectIcon className="text-muted-foreground size-4 shrink-0" />
            )}
            <span className="truncate" title={selected?.path}>{selected?.name ?? "No project"}</span>
          </span>
          <ChevronsUpDown className="text-muted-foreground" />
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent align="start" className="w-[min(24rem,calc(100vw-2rem))]">
        <div className="p-2">
          <Input
            autoFocus
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Search name or full path"
            aria-label="Search projects"
          />
        </div>
        <DropdownMenuSeparator />
        {!search && (
          <DropdownMenuItem onClick={() => choose(null)}>
            <NoProjectIcon />
            No project
          </DropdownMenuItem>
        )}
        {hierarchy.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Project tree</DropdownMenuLabel>
            {hierarchy.map(({ project, treeDepth }) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => choose(project.id)}
                style={{ paddingInlineStart: `${0.5 + treeDepth * 1.15}rem` }}
              >
                {treeDepth > 0 && <span className="text-border shrink-0" aria-hidden="true">└</span>}
                <ProjectIcon icon={project.icon} className="size-4" />
                <span className="min-w-0 flex-1 truncate" title={project.path}>{project.name}</span>
                {project.pinned && <Pin className="text-muted-foreground" aria-label="Pinned" />}
                <span className="sr-only">Level {treeDepth + 1}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
        {hierarchy.length === 0 && (
          <p className="text-muted-foreground px-3 py-5 text-center text-sm" role="status">
            No matching projects.
          </p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => { setOpen(false); setCreateOpen(true); }}>
          <Plus />
          New project
        </DropdownMenuItem>
      </DropdownMenuContent>
      </DropdownMenu>
      <ProjectCreatorPopover
        open={createOpen}
        onOpenChange={setCreateOpen}
        hideTrigger
        onCreated={(project) => {
          setCreatedProjects((current) => [...current.filter((item) => item.id !== project.id), project]);
          onProjectCreated?.(project);
          choose(project.id);
        }}
      />
    </>
  );
}
