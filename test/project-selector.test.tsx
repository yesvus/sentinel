import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectSelector } from "@/components/project-selector";
import type { Project } from "@/lib/api";

vi.mock("@/components/project-creator-popover", () => ({
  ProjectCreatorPopover: ({ open, onCreated }: { open?: boolean; onCreated: (project: Project) => void }) => open ? (
    <button
      type="button"
      onClick={() => onCreated({ ...projects[0], id: 3, name: "New project", path: "New project" })}
    >
      Create test project
    </button>
  ) : null,
}));

const projects: Project[] = [
  {
    id: 1, name: "Erasmus", path: "Erasmus", depth: 1, parentId: null,
    icon: null, description: null, resources: null, pinned: true, archived: false, sortOrder: 0, lastUsedAt: null,
  },
  {
    id: 2, name: "Authentication", path: "Erasmus / Authentication", depth: 2, parentId: 1,
    icon: null, description: null, resources: null, pinned: false, archived: false, sortOrder: 0,
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
    fireEvent.click(screen.getByText("Authentication"));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("creates a project from the final dropdown option and selects it", () => {
    const onChange = vi.fn();
    const onProjectCreated = vi.fn();
    render(
      <ProjectSelector
        projects={projects}
        value={null}
        onChange={onChange}
        onProjectCreated={onProjectCreated}
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Choose project" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New project" }));
    fireEvent.click(screen.getByRole("button", { name: "Create test project" }));

    expect(onProjectCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 3, name: "New project" }));
    expect(onChange).toHaveBeenCalledWith(3);
  });
});
