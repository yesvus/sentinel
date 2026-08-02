import { Download, History, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle } from "@/components/ui/card";

export function HistoryToolbar({
  canExport,
  onExportAll,
  onAddSession,
}: {
  canExport: boolean;
  onExportAll: () => void;
  onAddSession: () => void;
}) {
  return (
    <CardHeader className="flex flex-wrap items-center justify-between gap-2">
      <CardTitle className="flex items-center gap-2">
        <History className="text-muted-foreground size-4" />
        History
      </CardTitle>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1" disabled={!canExport} onClick={onExportAll}>
          <Download className="size-4" />
          Export all
        </Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={onAddSession}>
          <Plus className="size-4" />
          Add session
        </Button>
      </div>
    </CardHeader>
  );
}
