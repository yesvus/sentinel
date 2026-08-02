"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LinkifiedText } from "@/components/linkified-text";
import { cn } from "@/lib/utils";

export function ProjectDescriptionPreview({ description }: { description: string | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!description) {
    return <p className="text-muted-foreground text-sm">No description yet.</p>;
  }

  const canExpand = description.length > 150 || description.includes("\n");
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <LinkifiedText
        text={description}
        as="p"
        className={cn(
          "text-muted-foreground w-full text-sm whitespace-pre-wrap break-words transition-[max-height] duration-300",
          expanded ? "max-h-40 overflow-y-auto pr-2" : "line-clamp-2",
        )}
      />
      {canExpand && (
        <Button
          type="button"
          variant="link"
          size="xs"
          className="h-auto px-0"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      )}
    </div>
  );
}
