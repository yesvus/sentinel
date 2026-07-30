import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectIconPicker } from "@/components/project-icon-picker";

describe("ProjectIconPicker", () => {
  it("exposes the selected icon and supports choosing another", () => {
    const onChange = vi.fn();
    render(<ProjectIconPicker value="book" onChange={onChange} />);

    expect(screen.getByRole("radio", { name: "book icon" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "code icon" }));
    expect(onChange).toHaveBeenCalledWith("code");
  });
});
