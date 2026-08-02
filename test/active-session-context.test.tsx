import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveSessionProvider, useActiveSession } from "@/lib/active-session-context";
import type { StudySession } from "@/lib/api";

const { getActive, expirePause, toastAdd } = vi.hoisted(() => ({
  getActive: vi.fn(),
  expirePause: vi.fn(),
  toastAdd: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  sessions: {
    getActive,
    expirePause,
    start: vi.fn(),
    update: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  },
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { sessionPauseTimeoutMinutes: 1 } }),
}));

vi.mock("@/components/ui/toast", () => ({ toast: { add: toastAdd } }));
vi.mock("@/lib/noise-player", () => ({ NOISE_SESSION_EVENT: "sentinel-noise-session" }));

class ControlledBroadcastChannel {
  static instances: ControlledBroadcastChannel[] = [];
  listener: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();

  constructor(public name: string) {
    ControlledBroadcastChannel.instances.push(this);
  }

  addEventListener(_type: string, listener: (event: MessageEvent) => void) {
    this.listener = listener;
  }

  removeEventListener() {
    this.listener = null;
  }

  close() {}

  receive(data: unknown) {
    this.listener?.({ data } as MessageEvent);
  }
}

function Probe() {
  const { activeSession, elapsedMs, loading } = useActiveSession();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="session">{activeSession?.id ?? "none"}</span>
      <span data-testid="elapsed">{elapsedMs}</span>
    </div>
  );
}

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: 42,
    started_at: "2026-08-02T11:00:00.000Z",
    ended_at: null,
    duration_seconds: null,
    description: "Focused work",
    project_id: null,
    project_name: null,
    project_icon: null,
    paused_at: null,
    paused_seconds: 0,
    ...overrides,
  };
}

describe("ActiveSessionProvider", () => {
  beforeEach(() => {
    ControlledBroadcastChannel.instances = [];
    vi.stubGlobal("BroadcastChannel", ControlledBroadcastChannel);
    getActive.mockReset();
    expirePause.mockReset();
    toastAdd.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("authoritatively reconciles the active session after a cross-tab message", async () => {
    const remote = session();
    getActive.mockResolvedValueOnce(null).mockResolvedValueOnce(remote);

    render(<ActiveSessionProvider><Probe /></ActiveSessionProvider>);

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("session")).toHaveTextContent("none");
    expect(ControlledBroadcastChannel.instances).toHaveLength(1);

    await act(async () => {
      ControlledBroadcastChannel.instances[0].receive({ type: "started" });
    });

    await waitFor(() => expect(screen.getByTestId("session")).toHaveTextContent("42"));
    expect(getActive).toHaveBeenCalledTimes(2);
  });

  it("expires a pause at the configured deadline and clears every consumer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T12:00:00.000Z"));
    const paused = session({
      started_at: "2026-08-02T11:30:00.000Z",
      paused_at: "2026-08-02T11:59:00.000Z",
      paused_seconds: 120,
    });
    getActive.mockResolvedValue(paused);
    expirePause.mockResolvedValue({ ended: true, durationSeconds: 1680 });

    render(<ActiveSessionProvider><Probe /></ActiveSessionProvider>);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("session")).toHaveTextContent("42");
    expect(screen.getByTestId("elapsed")).toHaveTextContent(String(27 * 60 * 1000));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(expirePause).toHaveBeenCalledWith(42);
    expect(screen.getByTestId("session")).toHaveTextContent("none");
    expect(screen.getByTestId("elapsed")).toHaveTextContent("0");
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: "Session ended after a long pause" }));
  });
});
