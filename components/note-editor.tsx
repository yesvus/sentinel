"use client";

import { useState } from "react";
import { NotebookPen, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkifiedText } from "@/components/linkified-text";
import { Textarea } from "@/components/ui/textarea";
import { notes as notesApi, ApiError, Note } from "@/lib/api";

export function NoteEditor({
  scope,
  dateKey,
  note,
  label,
  onSaved,
  onDeleted,
}: {
  scope: "day" | "week";
  dateKey: string;
  note: Note | undefined;
  label: string;
  onSaved: (note: Note) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note?.content ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setValue(note?.content ?? "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const trimmed = value.trim();
      const saved = await notesApi.upsert(scope, dateKey, trimmed);
      if (saved) onSaved(saved);
      else onDeleted();
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save note");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await notesApi.upsert(scope, dateKey, "");
      onDeleted();
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete note");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="bg-muted/40 space-y-2 rounded-md p-2" onClick={(e) => e.stopPropagation()}>
        <Textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Add a note for ${label}...`}
          className="bg-background min-h-16 text-sm"
        />
        {error && <p className="text-destructive text-xs">{error}</p>}
        <div className="flex items-center gap-2">
          <Button size="sm" type="button" onClick={save} disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </Button>
          {note && (
            <Button
              size="sm"
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive ml-auto"
              onClick={remove}
              disabled={busy}
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (note) {
    return (
      <div className="group text-muted-foreground hover:bg-muted/50 flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-sm transition-colors duration-150">
        <NotebookPen className="mt-0.5 size-3.5 shrink-0" />
        <LinkifiedText text={note.content} className="min-w-0 flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
          aria-label="Edit note"
          title="Edit note"
          onClick={(event) => { event.stopPropagation(); startEdit(); }}
        >
          <Pencil />
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        startEdit();
      }}
      className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
    >
      <NotebookPen className="size-3" />
      Add note
    </button>
  );
}
