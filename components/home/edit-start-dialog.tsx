import { Info } from "lucide-react";
import { combineLocalDateAndTime } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type EditStartDialogProps = {
  open: boolean;
  busy: boolean;
  error: string | null;
  time: string;
  startedAt: number | null;
  now: number;
  onOpenChange: (open: boolean) => void;
  onTimeChange: (time: string) => void;
  onSave: () => void;
};

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function EditStartDialog({ open, busy, error, time, startedAt, now, onOpenChange, onTimeChange, onSave }: EditStartDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !busy && onOpenChange(nextOpen)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Edit start time</DialogTitle>
            <Tooltip>
              <TooltipTrigger render={<Button type="button" size="icon-sm" variant="ghost" aria-label="About editing start time" />}><Info /></TooltipTrigger>
              <TooltipContent className="max-w-72">Use this when you forgot to start the timer, or started it partway through your work. It&apos;s an estimate — the elapsed time updates to match.</TooltipContent>
            </Tooltip>
          </div>
          <DialogDescription>Adjust when this session actually began.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-start-time">Start time</Label>
            <Input id="edit-start-time" type="time" value={time} onChange={(event) => onTimeChange(event.target.value)} />
          </div>
          {time && startedAt !== null && (
            <p className="text-center text-sm font-medium" aria-live="polite">New elapsed time: {formatElapsed(Math.max(0, now - combineLocalDateAndTime(startedAt, time).getTime()))}</p>
          )}
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button type="button" onClick={onSave} disabled={busy}>{busy ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
