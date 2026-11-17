import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ComboInput } from "./ComboInput";
import { SentenceForm } from "./SentenceForm";
import { emptyForm, formToTree, treeToForm, type SearchForm } from "./queryModel";

// Expose popover contents during SSR, so callbacks exercise the actual sentence
// wiring without browser layout, focus timing or animation dependencies.
vi.mock("radix-ui", () => {
  const Content = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return { Popover: { Root: Content, Trigger: Content, Portal: Content, Content } };
});
const combos = vi.hoisted(() => [] as ComponentProps<typeof ComboInput>[]);
vi.mock("./ComboInput", async (importOriginal) => ({
  ...await importOriginal<typeof import("./ComboInput")>(),
  ComboInput: (props: ComponentProps<typeof ComboInput>) => {
    combos.push(props);
    return <input role="combobox" value={props.text} disabled={props.disabled} readOnly />;
  },
}));

beforeEach(() => { combos.length = 0; });

describe("sentence encounter modifiers", () => {
  it.each([
    ["difficulty", "heroic", "nor"],
    ["variant", "hard", "har"],
  ] as const)("edits suggested and partial custom %s on the named killed pull", (key, suggested, custom) => {
    let form: SearchForm = { ...emptyForm(), killed: ["Hodir", "Thorim"] };
    const render = () => {
      combos.length = 0;
      renderToStaticMarkup(<SentenceForm form={form} onChange={(next) => { form = next; }} zones={[]} bosses={[]} realms={[]} classes={[]} capabilities={[]} loggedIn honored revered />);
      return combos.filter((c) => c.placeholder === (key === "difficulty" ? "Any difficulty" : "Any mode"));
    };
    let [hodir, thorim] = render();
    expect(hodir.disabled).toBe(false);
    expect(hodir.options.find((o) => o.value === "normal")?.label).toBe("Normal");
    hodir.onPick(hodir.options.find((o) => o.value === suggested)!);
    expect(form.killedModifiers).toEqual({ Hodir: { [key]: suggested } });
    [hodir, thorim] = render();
    thorim.onTextChange(custom);
    [hodir, thorim] = render();
    expect(thorim.text).toBe(custom);
    // SuggestInput commits typing immediately; blur never selects a matching
    // built-in suggestion. In particular "nor" and "har" remain custom values.
    thorim.onBlurText?.(thorim.text);
    expect(form.killedModifiers).toEqual({ Hodir: { [key]: suggested }, Thorim: { [key]: custom } });
    expect(treeToForm(formToTree(form))).toEqual(form);
    hodir.onTextChange("");
    expect(form.killedModifiers.Hodir).toBeUndefined();
    expect(form.killedModifiers.Thorim).toEqual({ [key]: custom });
  });
});


it.each([false, undefined])("locks only modifiers when Revered access is %s", (revered) => {
  const form = { ...emptyForm(), killed: ["Hodir"], killedModifiers: { Hodir: { difficulty: "custom-difficulty", variant: "custom-mode" } } };
  const markup = renderToStaticMarkup(<SentenceForm form={form} onChange={vi.fn()} zones={[]} bosses={[]} realms={[]} classes={[]} capabilities={[]} loggedIn honored revered={revered} />);
  const modifiers = combos.filter((c) => c.placeholder === "Any difficulty" || c.placeholder === "Any mode");
  expect(modifiers).toHaveLength(2);
  expect(modifiers.every((c) => c.disabled)).toBe(true);
  expect(markup).toContain("Revered supporters can search by encounter difficulty and mode");
  expect(markup).toContain("custom-difficulty");
  expect(markup).toContain("custom-mode");
  // The basic killed-boss picker is still usable without a supporter tier.
  expect(markup).toMatch(/<button[^>]*>Hodir<\/button>/);
});
