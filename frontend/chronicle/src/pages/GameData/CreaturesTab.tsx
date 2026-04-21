import { WDBUpload } from "./WDBUpload";

export function CreaturesTab() {
  return (
    <WDBUpload
      title="Creature Cache Import"
      description="Upload a creaturecache.wdb file from your WoW client to compare and import creature data (name, subname, display IDs)."
      fileHint="creaturecache.wdb"
    />
  );
}
