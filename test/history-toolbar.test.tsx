import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryToolbar } from "@/components/history/history-toolbar";

describe("HistoryToolbar", () => {
  it("disables empty exports and delegates add-session actions", () => {
    const onExportAll = vi.fn();
    const onAddSession = vi.fn();
    const { rerender } = render(
      <HistoryToolbar canExport={false} onExportAll={onExportAll} onAddSession={onAddSession} />,
    );

    expect(screen.getByRole("button", { name: "Export all" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add session" }));
    expect(onAddSession).toHaveBeenCalledOnce();

    rerender(<HistoryToolbar canExport onExportAll={onExportAll} onAddSession={onAddSession} />);
    fireEvent.click(screen.getByRole("button", { name: "Export all" }));
    expect(onExportAll).toHaveBeenCalledOnce();
  });
});
