import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppHomePage from "@/app/app/page";

const { start, stop } = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: 1, email: "user@example.test", name: null, avatar: null },
  }),
}));

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ isMobile: false, setOpen: vi.fn(), setOpenMobile: vi.fn() }),
}));

vi.mock("@/lib/active-session-context", () => ({
  useInitialActiveSession: () => null,
}));

vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    constructor(public status: number, message: string, public body?: unknown) {
      super(message);
    }
  }
  return {
    ApiError,
    projects: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    tasks: {
      list: vi.fn().mockResolvedValue([]),
    },
    sessions: {
      getActive: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      page: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      start,
      stop,
      update: vi.fn().mockResolvedValue({}),
    },
  };
});

describe("stopping a session with a description", () => {
  beforeEach(() => {
    start.mockReset().mockResolvedValue({
      id: 9,
      startedAt: "2026-07-30T08:00:00.000Z",
    });
    stop.mockReset();
  });

  async function startWithDescription(description: string) {
    render(<AppHomePage />);
    const textarea = screen.getByPlaceholderText("Include more details about your session (optional)");
    fireEvent.change(textarea, { target: { value: description } });
    const startButton = await screen.findByRole("button", { name: "Start session" });
    await waitFor(() => expect(startButton).toBeEnabled());
    fireEvent.click(startButton);
    await screen.findByRole("button", { name: "Stop session" });
    return textarea;
  }

  it("sends the final text and clears it after a successful stop", async () => {
    stop.mockResolvedValue({
      id: 9,
      endedAt: "2026-07-30T09:00:00.000Z",
      durationSeconds: 3600,
      description: "Final output",
    });
    const textarea = await startWithDescription("Final output");
    fireEvent.click(screen.getByRole("button", { name: "Stop session" }));
    fireEvent.change(screen.getByRole("slider", { name: "Learning and Producing allocation" }), {
      target: { value: "70" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Finish session" }));

    await waitFor(() => expect(stop).toHaveBeenCalledWith(9, "Final output", 70));
    await waitFor(() => expect(textarea).toHaveValue(""));
  });

  it("keeps the text when stopping fails", async () => {
    stop.mockRejectedValue(new Error("network failed"));
    const textarea = await startWithDescription("Do not lose this");
    fireEvent.click(screen.getByRole("button", { name: "Stop session" }));
    fireEvent.change(screen.getByRole("slider", { name: "Learning and Producing allocation" }), {
      target: { value: "40" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Finish session" }));

    await screen.findByText("Something went wrong");
    expect(textarea).toHaveValue("Do not lose this");
    expect(screen.getByText("Learning 60% · Producing 40%")).toBeInTheDocument();
  });
});
