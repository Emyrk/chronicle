import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SpellSearchBlockEditor, type SpellSearchDraft } from "./SpellSearchBlockEditor";

const EXAMPLE: SpellSearchDraft = {
  context: { level: 60, difficulty: 0 },
  where: {
    and: [
      { field: "spell.name", op: "contains", value: "frost" },
      { field: "spell.school", op: "has", value: "Frost" },
      { field: "spell.attributes", op: "has", value: "Channeled" },
      {
        any_effect: {
          and: [
            { field: "effect.type", op: "=", value: "Apply aura" },
            { field: "effect.aura", op: "=", value: "Mod stat" },
            { field: "effect.value", op: ">=", value: 100 },
          ],
        },
      },
      {
        any_power: {
          and: [
            { field: "power.type", op: "=", value: "Mana" },
            { field: "power.cost", op: "<=", value: 250 },
          ],
        },
      },
    ],
  },
};

const EMPTY: SpellSearchDraft = { context: { level: null, difficulty: 0 }, where: { and: [] } };

const meta: Meta<typeof SpellSearchBlockEditor> = {
  title: "pages/WoWDB/SpellSearchBlockEditor",
  component: SpellSearchBlockEditor,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">WoW database prototype</p>
          <div className="mb-5 mt-1">
            <h1 className="text-2xl font-semibold">Spell search</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Compose base spell conditions with nested effect and power-cost blocks. The same spell predicate can later be nested inside item search.
            </p>
          </div>
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SpellSearchBlockEditor>;

function Interactive({ initial }: { initial: SpellSearchDraft }) {
  const [draft, setDraft] = useState(initial);
  return <SpellSearchBlockEditor draft={draft} onChange={setDraft} />;
}

export const EffectsAndAttributes: Story = { render: () => <Interactive initial={EXAMPLE} /> };
export const BlankSlate: Story = { render: () => <Interactive initial={EMPTY} /> };
export const ReveredPerkPreview: Story = {
  render: () => <SpellSearchBlockEditor draft={EXAMPLE} onChange={() => undefined} disabled />,
};
