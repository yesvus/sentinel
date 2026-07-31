import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FriendsPage from "@/app/app/friends/page";

const { connections, activity, remove } = vi.hoisted(() => ({
  connections: vi.fn(),
  activity: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/api", () => {
  class ApiError extends Error {}
  return {
    ApiError,
    social: {
      connections,
      activity,
      remove,
      request: vi.fn(),
      respond: vi.fn(),
      nudge: vi.fn(),
    },
  };
});

const friend = {
  friendshipId: 7,
  status: "accepted" as const,
  direction: "friend" as const,
  user: {
    id: 12,
    name: "Ada",
    email: "ada@example.test",
    avatar: null,
  },
};

describe("Friends page", () => {
  beforeEach(() => {
    connections.mockReset().mockResolvedValue([friend]);
    activity.mockReset().mockResolvedValue([]);
    remove.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => vi.useRealTimers());

  it("refreshes connections while the page stays open", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<FriendsPage />);

    await waitFor(() => expect(connections).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(10_000);
    await waitFor(() => expect(connections).toHaveBeenCalledTimes(2));
  });

  it("asks for confirmation before removing a friend", async () => {
    render(<FriendsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));

    expect(await screen.findByText("Remove this friend?")).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove friend" }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith(friend.friendshipId));
  });
});
