/** Upload instructions for WoW Forever's built-in Blizzard combat log. */
export function InstructionsForever() {
  return (
    <>
      <p className="text-muted-foreground">
        <strong className="text-foreground">No addon required.</strong>
      </p>

      <div>
        <h3 className="font-medium mb-2">Upload Instructions</h3>
        <ol className="list-decimal list-inside space-y-3 text-muted-foreground">
          <li>
            Go to <strong className="text-foreground">Options &gt; System &gt; Network</strong>.
          </li>
          <li>
            Check the box for <strong className="text-foreground">Advanced Combat Logging</strong>.
          </li>
          <li>
            Before the raid, type <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/combatlog</code>.
          </li>
          <li>
            After the raid, upload{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
              &lt;WoW Folder&gt;/Logs/WoWCombatLog.txt
            </code>
            .
          </li>
          <li>Delete the file after uploading.</li>
        </ol>
      </div>
    </>
  );
}
