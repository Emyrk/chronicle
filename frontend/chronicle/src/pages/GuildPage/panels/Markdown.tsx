import { FileText } from "lucide-react";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";

interface MarkdownConfig {
  content: string;
}

function MarkdownContent({ config, isEditing }: GuildPanelRenderProps<MarkdownConfig>) {
  const content = config.content || "# Welcome to our Guild!\n\nEdit this panel to add your own content.";

  if (isEditing && !config.content) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Click to edit this text block
      </div>
    );
  }

  // Simple markdown-like rendering (for real implementation, use a markdown library)
  const renderContent = () => {
    const lines = content.split("\n");
    return lines.map((line, i) => {
      if (line.startsWith("# ")) {
        return (
          <h1 key={i} className="text-xl font-bold mb-2">
            {line.slice(2)}
          </h1>
        );
      }
      if (line.startsWith("## ")) {
        return (
          <h2 key={i} className="text-lg font-semibold mb-2">
            {line.slice(3)}
          </h2>
        );
      }
      if (line.startsWith("### ")) {
        return (
          <h3 key={i} className="text-base font-medium mb-1">
            {line.slice(4)}
          </h3>
        );
      }
      if (line.startsWith("- ")) {
        return (
          <li key={i} className="ml-4 text-sm">
            {line.slice(2)}
          </li>
        );
      }
      if (line.trim() === "") {
        return <br key={i} />;
      }
      return (
        <p key={i} className="text-sm mb-1">
          {line}
        </p>
      );
    });
  };

  return <div className="prose prose-sm dark:prose-invert max-w-none">{renderContent()}</div>;
}

export const MarkdownPanel: GuildPanelDefinition<MarkdownConfig> = {
  type: "markdown",
  label: "Text Block",
  icon: <FileText className="h-4 w-4" />,
  description: "Rich text content block",
  defaultSize: { w: 6, h: 2 },
  minSize: { w: 3, h: 1 },
  maxSize: { w: 12, h: 8 },
  configSchema: [
    {
      name: "content",
      label: "Content",
      type: "textarea",
      placeholder: "Enter markdown content...",
      defaultValue: "",
    },
  ],
  defaultConfig: {
    content: "",
  },
  render: (props) => <MarkdownContent {...props} />,
};
