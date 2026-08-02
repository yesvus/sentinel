import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type FinishSessionDialogProps = {
  open: boolean;
  busy: boolean;
  error: string | null;
  trackProductionSplit: boolean;
  productionPercentage: number;
  onOpenChange: (open: boolean) => void;
  onProductionPercentageChange: (value: number) => void;
  onFinish: () => void;
};

export function FinishSessionDialog({ open, busy, error, trackProductionSplit, productionPercentage, onOpenChange, onProductionPercentageChange, onFinish }: FinishSessionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !busy && onOpenChange(nextOpen)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Finish session</DialogTitle>
            {trackProductionSplit && (
              <Tooltip>
                <TooltipTrigger render={<Button type="button" size="icon-sm" variant="ghost" aria-label="About Learning and Producing" />}><Info /></TooltipTrigger>
                <TooltipContent className="max-w-72">Learning builds capability for later. Producing creates or delivers something usable now. This is your estimate, not a productivity score.</TooltipContent>
              </Tooltip>
            )}
          </div>
          <DialogDescription>{trackProductionSplit ? "Adjust the split, then finish." : "Finish this session."}</DialogDescription>
        </DialogHeader>
        {trackProductionSplit && (
          <div className="space-y-4">
            <div className="flex justify-between text-sm font-medium"><span>Learning</span><span>Producing</span></div>
            <input
              type="range"
              min="0"
              max="100"
              step="10"
              value={productionPercentage}
              onChange={(event) => onProductionPercentageChange(Number(event.target.value))}
              aria-label="Learning and Producing allocation"
              aria-valuetext={`Learning ${100 - productionPercentage} percent, Producing ${productionPercentage} percent`}
              className="accent-primary w-full cursor-pointer"
            />
            <p className="text-center text-sm font-medium" aria-live="polite">Learning {100 - productionPercentage}% · Producing {productionPercentage}%</p>
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
        )}
        {!trackProductionSplit && error && <p className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Keep running</Button>
          <Button type="button" onClick={onFinish} disabled={busy}>{busy ? "Saving..." : "Finish session"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
