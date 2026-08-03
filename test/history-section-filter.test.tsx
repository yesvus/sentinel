import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistorySection } from "@/components/history-section";
import type { Project, StudySession } from "@/lib/api";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { trackProductionSplit: true } }),
}));

vi.mock("@/lib/active-session-context", () => ({
  useActiveSession: () => ({ deleteSession: vi.fn() }),
}));

const project: Project = {
  id: 7,
  name: "Sentinel",
  icon: null,
  description: null,
  resources: null,
  parentId: null,
  pinned: false,
  archived: false,
  path: "Work / Sentinel",
  depth: 1,
  sortOrder: 0,
  lastUsedAt: null,
};

const sessions: StudySession[] = [
  {
    id: 1,
    started_at: "2026-08-03T10:00:00",
    ended_at: "2026-08-03T10:30:00",
    duration_seconds: 1800,
    description: "Prepare launch notes",
    project_id: 7,
    project_name: "Sentinel",
    project_path: "Work / Sentinel",
    project_icon: null,
  },
  {
    id: 2,
    started_at: "2026-08-03T11:00:00",
    ended_at: null,
    duration_seconds: null,
    description: "Read research paper",
    project_id: null,
    project_name: null,
    project_icon: null,
  },
];

describe("HistorySection filters", () => {
  it("filters the visible list and resets from an empty result", () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(
      <HistorySection
        sessions={sessions}
        projects={[project]}
        notes={[]}
        tasks={[]}
        now={new Date("2026-08-03T11:15:00").getTime()}
        hasMore={false}
        loadingMore={false}
        loadMoreError={null}
        onLoadMore={vi.fn()}
        onSessionsChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Search history"), { target: { value: "launch" } });
    expect(screen.getByText("Prepare launch notes")).toBeInTheDocument();
    expect(screen.queryByText("Read research paper")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter history by project"), { target: { value: "none" } });
    expect(screen.getByText("No sessions match these filters")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Prepare launch notes")).toBeInTheDocument();
    expect(screen.getByText("Read research paper")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter history by status"), { target: { value: "ongoing" } });
    expect(screen.queryByText("Prepare launch notes")).not.toBeInTheDocument();
    expect(screen.getByText("Read research paper")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("Prepare launch notes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Copy AI prompt for .*2026/ }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("<current_week>"));
  });
});
