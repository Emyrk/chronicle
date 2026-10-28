import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo } from "react";
// The chooser page is served by the Go backend (servicechoose), not React.
// Rendering the same file here means edits show up without a server rebuild.
import chooseHTML from "../../../../../internal/services/servicechoose/choose.html?raw";

type Destination = {
  key: string;
  name: string;
  tagline?: string;
  logo?: string;
  origin: string;
};

type ChooserPageProps = {
  destinations: Destination[];
  /** The chooser URL the visitor opened, including any choose_* params. */
  url: string;
  /** Key of the choice saved in the visitor's browser, if any. */
  saved?: string;
  /** Frame width in px; full width when omitted. */
  width?: number;
};

function ChooserPage({ destinations, url, saved, width }: ChooserPageProps) {
  const srcDoc = useMemo(() => {
    // Escape "<" like Go's json.Marshal so the payload can't close the <script>.
    const data = JSON.stringify({
      choose_host: new URL(url).host,
      destinations,
      preview: { url, saved },
    }).replace(/</g, "\\u003c");
    return chooseHTML.replace("{{CHOOSE_DATA}}", () => data);
  }, [destinations, url, saved]);

  return (
    <div className="min-h-screen bg-[#1a1a1a]">
      <iframe
        title="Community chooser"
        srcDoc={srcDoc}
        className="mx-auto block h-screen border-0"
        style={{ width: width ?? "100%" }}
      />
    </div>
  );
}

function dest(key: string, name: string, extra: Partial<Destination> = {}): Destination {
  return { key, name, origin: `https://${key}.chronicleclassic.com`, ...extra };
}

const COMMUNITIES: Destination[] = [
  dest("turtle", "Turtle WoW", { tagline: "Vanilla, expanded" }),
  dest("chromie", "Chromie Craft", {
    tagline: "Progressive WotLK powered by AzerothCore",
    logo: "https://icons.chronicleclassic.com/servers/chromiecraft/chromie-square.webp",
  }),
  dest("octo", "OctoWoW", { tagline: "Vanilla, but octopus" }),
  dest("kronos", "Kronos", { logo: "https://chronicleclassic.com/servers/kronos/logo.png" }),
  dest("vanillaplus", "Vanilla Plus"),
  dest("faebright", "Faebright", { logo: "https://example.invalid/broken.png" }),
];

const LONG_LIST: Destination[] = [
  ...COMMUNITIES,
  ...Array.from({ length: 16 }, (_, i) => dest(`realm${i + 1}`, `Community ${i + 1}`)),
];

const PAGE_URL = "https://choose.chronicleclassic.com/instances/42?tab=dps";

const meta = {
  title: "Chooser/Page",
  component: ChooserPage,
  parameters: { layout: "fullscreen" },
  args: {
    destinations: COMMUNITIES,
    url: PAGE_URL,
  },
} satisfies Meta<typeof ChooserPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** First visit: no saved choice. */
export const Picker: Story = {};

/** "Remember my choice" must stay visible above a long list. */
export const LongList: Story = {
  args: { destinations: LONG_LIST },
};

/** Saved choice: auto-redirects after a short countdown. */
export const SavedChoice: Story = {
  args: { saved: "chromie" },
};

/** Back from the arrival notice's "Change choice" link. */
export const ManageSavedChoice: Story = {
  args: { saved: "chromie", url: `${PAGE_URL}&choose_manage=1` },
};

/** Back from the arrival notice's "Forget choice" link. */
export const ForgotChoice: Story = {
  args: { saved: "chromie", url: `${PAGE_URL}&choose_forget=1` },
};

export const HomePage: Story = {
  args: { url: "https://choose.chronicleclassic.com/" },
};

export const NoCommunities: Story = {
  args: { destinations: [] },
};

export const Mobile: Story = {
  args: { destinations: LONG_LIST, width: 375 },
};
