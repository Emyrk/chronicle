import { WDBUpload } from "./WDBUpload";

export function ItemsTab() {
  return (
    <WDBUpload
      title="Item Cache Import"
      description="Upload an itemcache.wdb file from your WoW client to compare and import item data."
      fileHint="itemcache.wdb"
      showUnreliableFilter
    />
  );
}
