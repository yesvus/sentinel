import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoiseControl } from "@/components/noise-control";

const toggle = vi.fn();
const setVolume = vi.fn();

vi.mock("@/lib/noise-player", () => ({
  useNoisePlayer: vi.fn(() => ({
    playing: false,
    volume: 0.55,
    toggle,
    setVolume,
  })),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(() => ({
    user: {
      autoStartNoise: false,
      focusAudioType: "speech-blocker",
    },
    refresh: vi.fn(),
  })),
}));

describe("Focus Audio control", () => {
  beforeEach(() => {
    toggle.mockClear();
    setVolume.mockClear();
  });

  it("uses Focus Audio terminology and starts playback", () => {
    render(<NoiseControl />);
    fireEvent.click(screen.getByRole("button", { name: "Open Focus Audio controls" }));
    fireEvent.click(screen.getByRole("button", { name: "Start audio" }));
    expect(screen.getAllByText("Focus Audio").length).toBeGreaterThan(0);
    expect(toggle).toHaveBeenCalledOnce();
  });
});
