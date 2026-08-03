import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "@/app/app/settings/page";

const { refresh, updateSessionSettings } = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateSessionSettings: vi.fn(),
}));

const user = {
  id: 1,
  email: "person@example.test",
  name: null,
  avatar: null,
  shareSessionDescriptions: false,
  autoStartNoise: false,
  focusAudioType: "speech-blocker" as const,
  defaultSessionType: "learning" as const,
  trackProductionSplit: true,
  sessionPauseTimeoutMinutes: 30,
  planReminderHour: 19,
  planWeeklyReminderDay: 0,
  planWeeklyReminderHour: 19,
  planContext: null,
  timezone: null,
};

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user, refresh, loading: false }),
}));

vi.mock("@/lib/theme-context", () => ({
  useTheme: () => ({ mode: "system", setMode: vi.fn() }),
}));

vi.mock("@/lib/api", () => {
  class ApiError extends Error {}
  return {
    ApiError,
    auth: {
      updateSessionSettings,
      updatePrivacy: vi.fn(),
    },
    calendar: {
      token: vi.fn(),
      revoke: vi.fn(),
    },
  };
});

describe("Settings time zone", () => {
  beforeEach(() => {
    refresh.mockReset().mockResolvedValue(undefined);
    updateSessionSettings.mockReset().mockResolvedValue({ timezone: "Asia/Tokyo" });
  });

  it("defaults to Auto, shows the detected zone, and saves a fixed override", async () => {
    render(<SettingsPage />);

    const select = screen.getByLabelText("Time zone");
    expect(select).toHaveValue("");
    expect(screen.getByText(/Detected browser time zone:/)).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "Asia/Tokyo" } });
    fireEvent.click(screen.getByRole("button", { name: "Save time zone" }));

    await waitFor(() => expect(updateSessionSettings).toHaveBeenCalledWith({ timezone: "Asia/Tokyo" }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent("Time zone saved.");
  });
});
