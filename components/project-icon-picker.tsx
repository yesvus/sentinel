"use client";

import { PROJECT_ICONS, ProjectIcon, ProjectIconKey } from "@/lib/icons";

export function ProjectIconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Project icon">
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        aria-label="Default folder icon"
        onClick={() => onChange(null)}
        className={`text-muted-foreground flex size-8 items-center justify-center rounded-md ring-1 ${
          value === null ? "ring-primary bg-primary/10" : "ring-border"
        }`}
      >
        <ProjectIcon icon={null} className="size-4" />
      </button>
      {(Object.keys(PROJECT_ICONS) as ProjectIconKey[]).map((key) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          aria-label={`${key} icon`}
          onClick={() => onChange(key)}
          className={`flex size-8 items-center justify-center rounded-md ring-1 ${
            value === key ? "ring-primary bg-primary/10" : "ring-border"
          }`}
        >
          <ProjectIcon icon={key} className="size-4" />
        </button>
      ))}
    </div>
  );
}
