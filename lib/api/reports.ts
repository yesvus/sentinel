import { api } from "./core";

export type WeeklyReport = {
  weekStart: string;
  weekEnd: string;
  timezone: string;
  totalSeconds: number;
  activeDays: number;
  medianSeconds: number | null;
  learningSeconds: number;
  producingSeconds: number;
  topProject: string | null;
  sessionCount: number;
  finalizedAt: string;
};

export const reports = {
  weekly: (timezone: string) =>
    api<WeeklyReport[]>(`/api/reports/weekly?timezone=${encodeURIComponent(timezone)}`),
};
