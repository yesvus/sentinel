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

describe("Focus Audio control", () => {
  beforeEach(() => {
    toggle.mockClear();
    setVolume.mockClear();
  });

  it("uses Focus Audio terminology and starts playback", () => {
    render(<NoiseControl />);
    fireEvent.click(screen.getByRole("button", { name: "Start Focus Audio" }));
    expect(screen.getByText("Focus Audio")).toBeInTheDocument();
    expect(toggle).toHaveBeenCalledOnce();
  });
});
