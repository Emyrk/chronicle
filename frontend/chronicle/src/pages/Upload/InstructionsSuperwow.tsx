/** Upload instructions for the 1.12a SuperWoW two-file format. */
export function InstructionsSuperwow() {
  return (
    <>
      <div>
        <h3 className="font-medium mb-2">Requirements</h3>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>
            <a href="https://github.com/balakethelock/SuperWoW" target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
              SuperWoW Mod
            </a>
          </li>
          <li>
            <a href="https://github.com/Emyrk/ChronicleCompanion/" target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
              ChronicleCompanion Addon
            </a>
          </li>
        </ul>
      </div>

      <div>
        <h3 className="font-medium mb-2">On Raid Night</h3>
        <div className="space-y-3 text-muted-foreground">
          <div>
            <p className="mb-1">1. <strong className="text-foreground">Delete these files before raiding:</strong></p>
            <ul className="list-none space-y-1 ml-4">
              <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">&lt;WoWFolder&gt;/Logs/WoWCombatLog.txt</code></li>
              <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">&lt;WoWFolder&gt;/Logs/WoWRawCombatLog.txt</code></li>
            </ul>
          </div>
          <p>2. <strong className="text-foreground">Launch WoW and do your raid.</strong></p>
          <div>
            <p className="mb-1">3. <strong className="text-foreground">Upload both files</strong> (required):</p>
            <ul className="list-none space-y-1 ml-4">
              <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">&lt;WoWFolder&gt;/Logs/WoWCombatLog.txt</code></li>
              <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">&lt;WoWFolder&gt;/Logs/WoWRawCombatLog.txt</code></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="font-medium mb-3">FAQ</h3>
        <div className="space-y-4">
          <div>
            <p className="font-medium text-foreground">Why delete my logs?</p>
            <p className="text-muted-foreground mt-1">
              The WoW client writes to the logs but never deletes them, so they grow continuously.
              Starting fresh gives the parser less data to process. Switching characters mid-session
              can also confuse the parser.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">What is the ChronicleCompanion addon?</p>
            <p className="text-muted-foreground mt-1">
              It replaces and extends SuperWoWCombatLogger with additional logging information.
              Chronicle uses different log formats than TurtLogs, so we maintain our own addon.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">Why disable logging on multibox characters?</p>
            <p className="text-muted-foreground mt-1">
              All WoW clients write to the same combat log file. When multiple characters log simultaneously,
              they create conflicting states and overwrite each other's data, corrupting the log.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
