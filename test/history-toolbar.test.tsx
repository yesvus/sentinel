import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryToolbar } from "@/components/history/history-toolbar";

describe("HistoryToolbar", () => {
  it("disables empty exports and delegates add-session actions", () => {
    const onExportAll = vi.fn();
    const onAddSession = vi.fn();
    const props = {
      mode: "page" as const,
      projects: [],
      query: "",
      projectFilter: "all",
      statusFilter: "all" as const,
      visibleCount: 0,
      totalCount: 0,
      trackedSeconds: 0,
      completedCount: 0,
      ongoingCount: 0,
      onQueryChange: vi.fn(),
      onProjectFilterChange: vi.fn(),
      onStatusFilterChange: vi.fn(),
      onResetFilters: vi.fn(),
    };
    const { rerender } = render(
      <HistoryToolbar {...props} canExport={false} onExportAll={onExportAll} onAddSession={onAddSession} />,
    );

    expect(screen.getByRole("button", { name: "Export visible" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add session" }));
    expect(onAddSession).toHaveBeenCalledOnce();

    rerender(<HistoryToolbar {...props} canExport onExportAll={onExportAll} onAddSession={onAddSession} />);
    fireEvent.click(screen.getByRole("button", { name: "Export visible" }));
    expect(onExportAll).toHaveBeenCalledOnce();
  });
});
