"use client";

import { ReactNode, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlwaysOpenNote } from "@/components/always-open-note";
import { Note } from "@/lib/api";

/** A card that shows a note read-only; clicking it opens a centered dialog where it becomes editable. */
export function NoteFocusCard({
  icon,
  title,
  titleExtra,
  headerActions,
  scope,
  dateKey,
  note,
  emptyText,
  placeholder,
  dialogTitle,
  dialogDescription,
  dialogHeaderActions,
  noteClassName,
  onSaved,
  onDeleted,
}: {
  icon: ReactNode;
  title: ReactNode;
  titleExtra?: ReactNode;
  headerActions?: ReactNode;
  scope: "day" | "week" | "long-term";
  dateKey: string;
  note: Note | undefined;
  emptyText: string;
  placeholder: string;
  dialogTitle: string;
  dialogDescription: string;
  dialogHeaderActions?: ReactNode;
  noteClassName?: string;
  onSaved: (note: Note) => void;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex flex-wrap items-center gap-2">
            {icon}
            {title}
            {titleExtra}
          </CardTitle>
          <div className="flex items-center gap-1">
            {headerActions}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={collapsed ? "Expand" : "Collapse"}
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
            </Button>
          </div>
        </CardHeader>
        {!collapsed && (
          <CardContent>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="hover:bg-muted/40 -m-1 block w-[calc(100%+0.5rem)] rounded-md p-1 text-left"
            >
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                {note?.content?.trim() || emptyText}
              </p>
            </button>
          </CardContent>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 pr-8">
              <DialogTitle>{dialogTitle}</DialogTitle>
              {dialogHeaderActions}
            </div>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          <AlwaysOpenNote
            scope={scope}
            dateKey={dateKey}
            note={note}
            placeholder={placeholder}
            className={noteClassName ?? "min-h-48"}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
