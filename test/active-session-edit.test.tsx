import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistorySection } from "@/components/history-section";
import type { StudySession } from "@/lib/api";

const { update } = vi.hoisted(() => ({ update: vi.fn().mockResolvedValue({}) }));

vi.mock("@/lib/api", () => {
  class ApiError extends Error {}
  return {
    ApiError,
    sessions: {
      update,
      remove: vi.fn(),
      createManual: vi.fn(),
    },
  };
});

describe("active session editing", () => {
  it("does not show or submit an end time", async () => {
    const now = Date.now();
    const active: StudySession = {
      id: 42,
      started_at: new Date(now - 30 * 60 * 1000).toISOString(),
      ended_at: null,
      duration_seconds: null,
      description: "Running work",
      project_id: null,
      project_name: null,
      project_icon: null,
    };

    render(
      <HistorySection
        sessions={[active]}
        projects={[]}
        notes={[]}
        now={now}
        onSessionsChange={vi.fn()}
        onNoteSaved={vi.fn()}
        onNoteDeleted={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit session" }));
    expect(await screen.findByText("Update the running session without stopping it.")).toBeInTheDocument();
    expect(screen.queryByLabelText("End time")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0][1]).not.toHaveProperty("endedAt");
  });
});
