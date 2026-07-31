import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoisePlayerProvider, useNoisePlayer } from "@/lib/noise-player";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { autoStartNoise: false, focusAudioType: "speech-blocker" } }),
}));

function VolumeProbe() {
  const { volume } = useNoisePlayer();
  return <output aria-label="volume">{volume}</output>;
}

describe("Focus Audio default volume", () => {
  beforeEach(() => localStorage.clear());

  it("starts at 75% when no preference has been saved", async () => {
    render(
      <NoisePlayerProvider>
        <VolumeProbe />
      </NoisePlayerProvider>
    );

    await waitFor(() => expect(screen.getByLabelText("volume")).toHaveTextContent("0.75"));
  });

  it("preserves an explicitly saved muted volume", async () => {
    localStorage.setItem("sentinel-noise-volume", "0");
    render(
      <NoisePlayerProvider>
        <VolumeProbe />
      </NoisePlayerProvider>
    );

    await waitFor(() => expect(screen.getByLabelText("volume")).toHaveTextContent("0"));
  });
});
