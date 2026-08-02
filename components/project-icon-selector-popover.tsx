"use client";

import { Pencil } from "lucide-react";
import { ProjectIconPicker } from "@/components/project-icon-picker";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ProjectIcon } from "@/lib/icons";

export function ProjectIconSelectorPopover({
  value,
  onChange,
  disabled = false,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="group/icon relative size-11 shrink-0 rounded-lg bg-muted p-0"
            aria-label="Change project icon"
            title="Change project icon"
            disabled={disabled}
          />
        }
      >
        <ProjectIcon icon={value} className="size-5" />
        <span className="bg-background absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full ring-1 ring-foreground/10 transition-transform duration-150 group-hover/icon:scale-105">
          <Pencil className="size-3" />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(25rem,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0">
        <PopoverHeader className="border-b bg-muted/20 px-4 py-3">
          <PopoverTitle>Project icon</PopoverTitle>
        </PopoverHeader>
        <div className="p-4">
          <ProjectIconPicker value={value} onChange={onChange} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
