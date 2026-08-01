"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Folder, Pin, Plus } from "lucide-react";
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
import { ProjectIcon } from "@/lib/icons";

export function ProjectSelector({
  projects,
  value,
  onChange,
  onCreate,
  disabled,
}: {
  projects: Project[];
  value: number | null;
  onChange: (id: number | null) => void;
  onCreate?: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = projects.find((project) => project.id === value) ?? null;
  const active = useMemo(
    () => projects.filter((project) => !project.archived || project.id === value),
    [projects, value],
  );
  const matches = (project: Project) =>
    project.path.toLowerCase().includes(search.trim().toLowerCase());
  const pinned = active.filter((project) => project.pinned && matches(project));
  const recent = active
    .filter((project) => !project.pinned && project.lastUsedAt && matches(project))
    .sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""))
    .slice(0, 5);
  const promoted = new Set([...pinned, ...recent].map((project) => project.id));
  const hierarchy = active
    .filter((project) => !promoted.has(project.id) && matches(project))
    .sort((a, b) => a.path.localeCompare(b.path));

  const choose = (id: number | null) => {
    onChange(id);
    setOpen(false);
    setSearch("");
  };

  const renderProject = (project: Project) => (
    <DropdownMenuItem key={project.id} onClick={() => choose(project.id)}>
      <ProjectIcon icon={project.icon} className="size-4" />
      <span className="min-w-0 flex-1 truncate" title={project.path}>{project.path}</span>
      <span className="sr-only">Level {project.depth}</span>
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
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
          <ProjectIcon icon={selected?.icon ?? null} className="size-4 shrink-0" />
          <span className="truncate">{selected?.path ?? "No project"}</span>
        </span>
        <ChevronsUpDown className="text-muted-foreground" />
      </DropdownMenuTrigger>
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
            <Folder />
            No project
          </DropdownMenuItem>
        )}
        {pinned.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-1.5"><Pin className="size-3" />Pinned</DropdownMenuLabel>
            {pinned.map(renderProject)}
          </DropdownMenuGroup>
        )}
        {recent.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Recent</DropdownMenuLabel>
            {recent.map(renderProject)}
          </DropdownMenuGroup>
        )}
        {hierarchy.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>All projects</DropdownMenuLabel>
            {hierarchy.map(renderProject)}
          </DropdownMenuGroup>
        )}
        {pinned.length + recent.length + hierarchy.length === 0 && (
          <p className="text-muted-foreground px-3 py-5 text-center text-sm" role="status">
            No matching projects.
          </p>
        )}
        {onCreate && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { setOpen(false); onCreate(); }}>
              <Plus />
              New project
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
