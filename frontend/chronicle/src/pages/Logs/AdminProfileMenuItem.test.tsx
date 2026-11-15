import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ onSelect: undefined as (() => void) | undefined }));
vi.mock("@/components/ui/DropdownMenu/DropdownMenu", () => ({
  DropdownMenuItem: ({ disabled, onSelect, children }: { disabled?: boolean; onSelect?: () => void; children: ReactNode }) => {
    captured.onSelect = onSelect;
    return <button disabled={disabled}>{children}</button>;
  },
}));
import { AdminProfileMenuItem } from "./AdminReparseControls";

describe("CPU profile engine eligibility", () => {
  it("keeps Legacy profiling available", () => {
    const profile = vi.fn();
    const html = renderToStaticMarkup(<AdminProfileMenuItem parserEngine="legacy" onSelect={profile} />);
    expect(html).toContain("Reparse (CPU Profile)");
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("requires Legacy");
    captured.onSelect?.();
    expect(profile).toHaveBeenCalledOnce();
  });

  it("disables parsernext profiling with a visible explanation and no action handler", () => {
    const profile = vi.fn();
    const html = renderToStaticMarkup(<AdminProfileMenuItem parserEngine="parsernext" onSelect={profile} />);
    expect(html).toContain('disabled=""');
    expect(html).toContain("CPU profiling currently requires Legacy");
    expect(captured.onSelect).toBeUndefined();
    expect(profile).not.toHaveBeenCalled();
  });
});
