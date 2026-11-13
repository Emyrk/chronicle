import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InstanceSearchField } from "@/api/typesGenerated";
import { BlockEditor } from "./BlockEditor";
import type { Node } from "./queryModel";
import fields from "./fixtures/searchFields.json";

type NumberProps = { value: number | null; step?: number; onChange: (value: number | null) => void };
const inputs = vi.hoisted(() => [] as NumberProps[]);
vi.mock("./controls", async (importOriginal) => ({
  ...await importOriginal<typeof import("./controls")>(),
  NumberInput: (props: NumberProps) => {
    inputs.push(props);
    return <input type="number" value={props.value ?? ""} step={props.step} readOnly />;
  },
}));

beforeEach(() => { inputs.length = 0; });

describe("block duration inputs", () => {
  function render(tree: Node) {
    const onChange = vi.fn();
    const markup = renderToStaticMarkup(<BlockEditor tree={tree} onChange={onChange} ctx={{
      fields: fields.fields as InstanceSearchField[], zones: [], bosses: [], loggedIn: true, honored: true,
    }} />);
    return { markup, onChange };
  }

  it.each(["instance.kill_time_ms", "instance.ranked_kill_time_ms", "instance.clear_time_ms"])("edits %s in seconds", (field) => {
    const { markup, onChange } = render({ field, op: "<=", value: 60000 });
    expect(markup).toContain("seconds");
    expect(inputs[0].value).toBe(60);
    expect(inputs[0].step).toBe(1);
    inputs[0].onChange(60);
    expect(onChange).toHaveBeenLastCalledWith({ and: [{ field, op: "<=", value: 60000 }] });
    inputs[0].onChange(1.234);
    expect(onChange).toHaveBeenLastCalledWith({ and: [{ field, op: "<=", value: 1234 }] });
    inputs[0].onChange(null);
    expect(onChange).toHaveBeenLastCalledWith({ and: [{ field, op: "<=", value: null }] });
  });

  it("converts both bounds of a duration range", () => {
    const field = "instance.ranked_kill_time_ms";
    const { onChange } = render({ field, op: "between", value: [60000, 90000] });
    expect(inputs.map((input) => input.value)).toEqual([60, 90]);
    inputs[1].onChange(120);
    expect(onChange).toHaveBeenLastCalledWith({ and: [{ field, op: "between", value: [60000, 120000] }] });
  });
});
