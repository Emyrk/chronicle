const ADDON_URL = "https://github.com/Emyrk/ChronicleCompanionForever";

/** Upload instructions for WoW Forever's built-in Blizzard combat log. */
export function InstructionsForever() {
  const code = "bg-muted px-1.5 py-0.5 rounded text-xs break-all";
  return (
    <>
      <div>
        <h3 className="font-medium mb-2">Recommended</h3>
        <p className="text-muted-foreground">
          <a href={ADDON_URL} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
            ChronicleCompanionForever Addon
          </a>
          : turns combat logging on inside dungeons and raids and off when you leave. Optional, but nothing to remember.
        </p>
      </div>

      <div>
        <h3 className="font-medium mb-2">Upload Instructions</h3>
        <ol className="list-decimal list-inside space-y-3 text-muted-foreground">
          <li>
            Install the addon, or turn on <strong className="text-foreground">Advanced Combat Logging</strong> in{" "}
            <strong className="text-foreground">Options &gt; System &gt; Network</strong> and type{" "}
            <code className={code}>/combatlog</code> once you are inside the instance.
          </li>
          <li>
            After the run, upload <code className={code}>&lt;WoW Folder&gt;/Logs/WoWCombatLog.txt</code>.
          </li>
          <li>Delete the file after uploading.</li>
        </ol>
      </div>
    </>
  );
}
