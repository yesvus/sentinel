"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

export function ProjectNameEditorPopover({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Edit project name"
            title="Edit project name"
            disabled={disabled}
          />
        }
      >
        <Pencil />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0">
        <PopoverHeader className="border-b bg-muted/20 px-4 py-3">
          <PopoverTitle>Project name</PopoverTitle>
        </PopoverHeader>
        <div className="p-4">
          <Field>
            <FieldLabel htmlFor="project-name-popover">Name</FieldLabel>
            <Input
              id="project-name-popover"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              maxLength={100}
              autoFocus
            />
          </Field>
        </div>
      </PopoverContent>
    </Popover>
  );
}
