"use client";

import { useEffect, useState } from "react";
import { CalendarRange } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { reports, WeeklyReport } from "@/lib/api";
import { formatDuration } from "@/lib/date";

export function WeeklyReportHistory() {
  const [items, setItems] = useState<WeeklyReport[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    reports.weekly(timezone).then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const report = items[selected];
  return (
    <Card className="break-inside-avoid">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <CalendarRange className="text-muted-foreground size-4" />
          Weekly reports
        </CardTitle>
        {items.length > 0 && (
          <select
            value={selected}
            onChange={(event) => setSelected(Number(event.target.value))}
            aria-label="Choose weekly report"
            className="border-input bg-background h-9 rounded-md border px-3 text-sm print:hidden"
          >
            {items.map((item, index) => (
              <option key={item.weekStart} value={index}>{item.weekStart} – {item.weekEnd}</option>
            ))}
          </select>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading reports…</p>
        ) : !report ? (
          <p className="text-muted-foreground text-sm">No completed weekly reports yet.</p>
        ) : (
          <article className="space-y-5">
            <div>
              <p className="font-medium">{report.weekStart} – {report.weekEnd}</p>
              <p className="text-muted-foreground text-xs">
                Finalized {new Date(report.finalizedAt).toLocaleDateString()} · {report.timezone}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><p className="text-muted-foreground text-xs">Total</p><p className="text-xl font-semibold">{formatDuration(report.totalSeconds)}</p></div>
              <div><p className="text-muted-foreground text-xs">Active days</p><p className="text-xl font-semibold">{report.activeDays}</p></div>
              <div><p className="text-muted-foreground text-xs">Median session</p><p className="text-xl font-semibold">{report.medianSeconds === null ? "—" : formatDuration(report.medianSeconds)}</p></div>
              <div><p className="text-muted-foreground text-xs">Sessions</p><p className="text-xl font-semibold">{report.sessionCount}</p></div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>Learning {report.totalSeconds ? Math.round(report.learningSeconds / report.totalSeconds * 100) : 0}% · {formatDuration(report.learningSeconds)}</span>
                <span>Producing {report.totalSeconds ? Math.round(report.producingSeconds / report.totalSeconds * 100) : 0}% · {formatDuration(report.producingSeconds)}</span>
              </div>
              <div className="bg-muted flex h-3 overflow-hidden rounded-full" role="img" aria-label="Weekly Learning and Producing allocation">
                <span style={{ width: `${report.totalSeconds ? report.learningSeconds / report.totalSeconds * 100 : 0}%`, backgroundColor: "#0e7490" }} />
                <span style={{ width: `${report.totalSeconds ? report.producingSeconds / report.totalSeconds * 100 : 0}%`, backgroundColor: "#f59e0b" }} />
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              {report.topProject
                ? `Most tracked time belonged to ${report.topProject}.`
                : report.activeDays
                  ? `You were active on ${report.activeDays} day${report.activeDays === 1 ? "" : "s"}.`
                  : "No activity was recorded. A fresh week is ready when you are."}
            </p>
          </article>
        )}
      </CardContent>
    </Card>
  );
}
