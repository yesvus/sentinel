"use client";

import { useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { notes as notesApi, Note } from "@/lib/api";

/** A persistently-visible, auto-saving text area — unlike NoteEditor, it's never collapsed. */
export function AlwaysOpenNote({
  scope,
  dateKey,
  note,
  placeholder,
  className,
  onSaved,
  onDeleted,
}: {
  scope: "day" | "week" | "long-term";
  dateKey: string;
  note: Note | undefined;
  placeholder: string;
  className?: string;
  onSaved: (note: Note) => void;
  onDeleted: () => void;
}) {
  const [value, setValue] = useState(note?.content ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleSave(nextValue: string) {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setStatus("saving");
      try {
        const saved = await notesApi.upsert(scope, dateKey, nextValue);
        if (saved) onSaved(saved);
        else onDeleted();
        setStatus("saved");
        setTimeout(() => setStatus((current) => (current === "saved" ? "idle" : current)), 1500);
      } catch {
        setStatus("idle");
      }
    }, 600);
  }

  return (
    <div className="space-y-1">
      <Textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          scheduleSave(e.target.value);
        }}
        placeholder={placeholder}
        className={className ?? "min-h-20"}
      />
      <p className={`text-muted-foreground h-4 text-xs ${status === "idle" ? "invisible" : "visible"}`}>
        {status === "saving" ? "Saving..." : "Saved"}
      </p>
    </div>
  );
}
