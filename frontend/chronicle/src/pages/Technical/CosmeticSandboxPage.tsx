import { useState } from "react";
import { ArrowLeft, Sparkles, WandSparkles } from "lucide-react";
import { Link } from "react-router-dom";
import type { LinkedCharacter } from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";
import { CharacterCosmeticsEditor } from "@/features/characterCosmetics/CharacterCosmeticsEditor";
import { cosmeticPreviewCatalog } from "./cosmeticPreviewCatalog";

const PREVIEW_CHARACTER: LinkedCharacter = {
  link_id: "cosmetic-sandbox",
  user_id: "cosmetic-sandbox",
  character_guid: "cosmetic-sandbox",
  realm_id: "cosmetic-sandbox",
  realm_name: "Preview Realm",
  name: "Adventurer",
  class: "Mage",
  race: "Human",
  gender: "Female",
  level: 60,
  is_primary: true,
  link_source: "preview",
  linked_at: "",
};

const PREVIEW_CATALOG = cosmeticPreviewCatalog();
const PREVIEW_ALLOWED_IDS = PREVIEW_CATALOG.map(({ id }) => id);

export function CosmeticSandboxPage() {
  const [editorOpen, setEditorOpen] = useState(true);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-4">
      <Link to="/technical" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" />
        Back to Technical Details
      </Link>

      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="h-5 w-5" />
        <h1 className="text-xl font-bold">Cosmetic Sandbox</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Mix and match every character cosmetic, including supporter tiers, without logging in or saving changes.
      </p>

      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 p-0">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <WandSparkles className="size-5" />
              <h2 className="font-semibold text-foreground">Build a preview</h2>
            </div>
            <p className="max-w-xl text-sm text-muted-foreground">
              Try names, backgrounds, and borders together. Switch between full and limited effects to see how each combination appears to other viewers.
            </p>
          </div>
          <Button onClick={() => setEditorOpen(true)} className="shrink-0">
            <Sparkles className="size-4" />
            Open editor
          </Button>
        </div>
      </Card>

      <CharacterCosmeticsEditor
        character={PREVIEW_CHARACTER}
        catalog={PREVIEW_CATALOG}
        allowedIDs={PREVIEW_ALLOWED_IDS}
        open={editorOpen}
        saving={false}
        previewOnly
        onOpenChange={setEditorOpen}
        onSave={() => {}}
      />
    </div>
  );
}
