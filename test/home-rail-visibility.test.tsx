import { act, fireEvent, render, screen } from "@testing-library/react";
import { useHomeRailVisibility } from "@/hooks/use-home-rail-visibility";
import { afterEach, describe, expect, it, vi } from "vitest";

const callbacks = {
  success: vi.fn(),
  failure: vi.fn(),
};

function Harness({ running = false }: { running?: boolean }) {
  const layout = useHomeRailVisibility({
    isRunning: running,
    isMobile: false,
    setSidebarOpen: vi.fn(),
    setMobileSidebarOpen: vi.fn(),
  });
  return (
    <div>
      <span data-testid="phase">{layout.phase}</span>
      {layout.showPlanning && <span>Planning layout</span>}
      {layout.showActive && <span>Active layout</span>}
      <button type="button" onClick={() => void layout.start(async () => true, { success: callbacks.success, failure: callbacks.failure })}>Successful start</button>
      <button type="button" onClick={() => void layout.start(async () => false, { success: callbacks.success, failure: callbacks.failure })}>Failed start</button>
    </div>
  );
}

describe("useHomeRailVisibility", () => {
  afterEach(() => {
    vi.useRealTimers();
    callbacks.success.mockReset();
    callbacks.failure.mockReset();
  });

  it("shows only the active phase on an initially running page without animating", () => {
    render(<Harness running />);
    expect(screen.getByTestId("phase")).toHaveTextContent("active");
    expect(screen.getByText("Active layout")).toBeInTheDocument();
    expect(screen.queryByText("Planning layout")).not.toBeInTheDocument();
  });

  it("uses mutually exclusive fallback phases and calls success", async () => {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Successful start" }));
    await act(async () => {});

    expect(screen.getByTestId("phase")).toHaveTextContent("planning-exit");
    expect(screen.getByText("Planning layout")).toBeInTheDocument();
    expect(screen.queryByText("Active layout")).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(120));
    expect(screen.getByTestId("phase")).toHaveTextContent("active");
    expect(callbacks.success).toHaveBeenCalledOnce();
    expect(callbacks.failure).not.toHaveBeenCalled();
  });

  it("returns to planning and calls failure when start fails", async () => {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Failed start" }));
    await act(() => vi.advanceTimersByTimeAsync(120));

    expect(screen.getByTestId("phase")).toHaveTextContent("planning");
    expect(screen.queryByText("Active layout")).not.toBeInTheDocument();
    expect(callbacks.failure).toHaveBeenCalledOnce();
    expect(callbacks.success).not.toHaveBeenCalled();
  });

  it("transitions an external start through the fallback exit phase", async () => {
    vi.useFakeTimers();
    const view = render(<Harness />);
    view.rerender(<Harness running />);
    await act(async () => {});
    expect(screen.getByTestId("phase")).toHaveTextContent("planning-exit");
    await act(() => vi.advanceTimersByTimeAsync(120));
    expect(screen.getByTestId("phase")).toHaveTextContent("active");
  });
});
