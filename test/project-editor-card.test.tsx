import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectEditorCard } from "@/components/projects/project-editor-card";
import type { Project } from "@/lib/api";

vi.mock("@/components/project-icon-selector-popover", () => ({
  ProjectIconSelectorPopover: () => null,
}));

vi.mock("@/components/project-name-editor-popover", () => ({
  ProjectNameEditorPopover: () => null,
}));

const project: Project = {
  id: 12,
  name: "Compiler",
  path: "Compiler",
  depth: 1,
  parentId: null,
  icon: null,
  description: "Existing description",
  resources: "https://example.test/docs",
  pinned: false,
  archived: false,
  sortOrder: 0,
  lastUsedAt: null,
};

function editorProps(overrides: Partial<Parameters<typeof ProjectEditorCard>[0]> = {}) {
  return {
    project,
    byId: new Map<number, Project>(),
    parentCandidates: [],
    name: project.name,
    description: project.description ?? "",
    resources: project.resources ?? "",
    icon: project.icon,
    editingField: null,
    saving: false,
    saveStatus: "idle" as const,
    onNameChange: vi.fn(),
    onDescriptionChange: vi.fn(),
    onResourcesChange: vi.fn(),
    onIconChange: vi.fn(),
    onBeginTextEdit: vi.fn(),
    onCancelTextEdit: vi.fn(),
    onSaveTextEdit: vi.fn().mockResolvedValue(undefined),
    onParentChange: vi.fn().mockResolvedValue(undefined),
    onArchiveChange: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("ProjectEditorCard", () => {
  it("opens text fields with pointer and keyboard actions without intercepting resource links", () => {
    const onBeginTextEdit = vi.fn();
    const props = editorProps({ onBeginTextEdit });
    render(<ProjectEditorCard {...props} />);

    fireEvent.click(screen.getByTestId("project-description-surface"));
    expect(props.onBeginTextEdit).toHaveBeenCalledWith("description");

    fireEvent.keyDown(screen.getByTestId("project-resources-surface"), { key: "Enter" });
    expect(props.onBeginTextEdit).toHaveBeenCalledWith("resources");

    onBeginTextEdit.mockClear();
    fireEvent.click(screen.getByRole("link", { name: "https://example.test/docs" }));
    expect(props.onBeginTextEdit).not.toHaveBeenCalled();
  });

  it("forwards edited text and the save and cancel actions", () => {
    const props = editorProps({ editingField: "description" });
    render(<ProjectEditorCard {...props} />);

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Revised project scope" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onDescriptionChange).toHaveBeenCalledWith("Revised project scope");
    expect(props.onSaveTextEdit).toHaveBeenCalledOnce();
    expect(props.onCancelTextEdit).toHaveBeenCalledOnce();
  });
});
