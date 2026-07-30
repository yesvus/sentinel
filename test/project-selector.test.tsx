import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectSelector } from "@/components/project-selector";
import type { Project } from "@/lib/api";

const projects: Project[] = [
  {
    id: 1, name: "Erasmus", path: "Erasmus", depth: 1, parentId: null,
    icon: null, description: null, pinned: true, archived: false, lastUsedAt: null,
  },
  {
    id: 2, name: "Authentication", path: "Erasmus / Authentication", depth: 2, parentId: 1,
    icon: null, description: null, pinned: false, archived: false,
    lastUsedAt: "2026-07-30T08:00:00.000Z",
  },
];

describe("ProjectSelector", () => {
  it("searches full paths and selects nested projects", () => {
    const onChange = vi.fn();
    render(<ProjectSelector projects={projects} value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Choose project" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search projects" }), {
      target: { value: "auth" },
    });
    fireEvent.click(screen.getByText("Erasmus / Authentication"));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
