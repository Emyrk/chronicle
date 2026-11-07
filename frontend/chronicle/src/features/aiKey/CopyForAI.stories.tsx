import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import { suggestionsFor } from "./aiLinks";
import type { AITargetId } from "./aiPrompts";
import { CopyForAIControl, type CopyForAIControlProps } from "./CopyForAI";

const raidSuggestions = suggestionsFor("raid", { guild: "Nightfall", raid: "Molten Core", boss: "Ragnaros", realm: "Nordanaar" });
const searchSuggestions = suggestionsFor("search", { realm: "Nordanaar", class: "Druid" });

function Stateful(props: Partial<CopyForAIControlProps> & { initialTarget?: AITargetId }) {
  const [target, setTarget] = useState<AITargetId>(props.initialTarget ?? "other");
  const [last, setLast] = useState<string | null>(null);
  return (
    <div className="flex min-h-[28rem] flex-col items-end gap-4 p-6">
      <CopyForAIControl
        target={target}
        onTargetChange={setTarget}
        suggestions={props.suggestions ?? raidSuggestions}
        onRun={(q) => setLast(q ?? "(link only)")}
        {...props}
      />
      {last && <p className="text-xs text-muted-foreground">Ran with: {last}</p>}
    </div>
  );
}

const meta: Meta<typeof Stateful> = {
  title: "Features/AI key/Copy for AI",
  component: Stateful,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <TooltipProvider>
          <Story />
        </TooltipProvider>
      </MemoryRouter>
    ),
  ],
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof Stateful>;

/** Default: "Other" copies only the link. */
export const Default: Story = {};

/** "Add a question" expanded with the raid page's suggestions. */
export const SuggestionsOpen: Story = { args: { defaultOptionsOpen: true, defaultQuestionsOpen: true } };

export const SearchSuggestions: Story = { args: { suggestions: searchSuggestions, defaultOptionsOpen: true, defaultQuestionsOpen: true } };

export const NoSuggestions: Story = { args: { suggestions: [], defaultOptionsOpen: true, defaultQuestionsOpen: true } };

export const PickerOther: Story = { args: { initialTarget: "other", defaultOptionsOpen: true } };
export const PickerChatGPT: Story = { args: { initialTarget: "chatgpt", defaultOptionsOpen: true } };
export const PickerClaude: Story = { args: { initialTarget: "claude", defaultOptionsOpen: true } };
export const PickerGrok: Story = { args: { initialTarget: "grok", defaultOptionsOpen: true } };
export const PickerPerplexity: Story = { args: { initialTarget: "perplexity", defaultOptionsOpen: true } };
/** Gemini has no prefill URL: copy only. */
export const PickerGemini: Story = { args: { initialTarget: "gemini", defaultOptionsOpen: true } };

/** A question and an AI together: opens Claude with the question and link. */
export const ClaudeWithQuestions: Story = { args: { initialTarget: "claude", defaultOptionsOpen: true, defaultQuestionsOpen: true } };

export const Busy: Story = { args: { busy: true } };

export const LoggedOut: Story = { args: { disabledReason: "Log in to copy a link your chat AI can read" } };
