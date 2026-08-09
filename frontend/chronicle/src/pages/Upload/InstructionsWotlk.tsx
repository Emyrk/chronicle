/** Upload instructions for 2.4.3/3.3.5a ChronicleCompanion and AzerothCore formats. */
export function InstructionsWotlk({ tbc = false }: { tbc?: boolean }) {
  const addonName = tbc ? "ChronicleCompanionTBC" : "ChronicleCompanionWoTLK";
  const addonUrl = tbc
    ? "https://github.com/Emyrk/ChronicleCompanionTBC"
    : "https://github.com/Emyrk/ChronicleCompanionWoTLK";
  const clientVersion = tbc ? "2.4.3" : "3.3.5a";

  return (
    <>
      <div>
        <h3 className="font-medium mb-2">Requirements</h3>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>
            <a href={addonUrl} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
              {addonName} Addon
            </a>
          </li>
        </ul>
      </div>

      <div>
        <h3 className="font-medium mb-2">On Raid Night</h3>
        <div className="space-y-3 text-muted-foreground">
          <div>
            <p className="mb-1"><strong className="text-foreground">1. Delete old logs before raiding:</strong></p>
            <ul className="list-none ml-4">
              <li>Delete <code className="bg-muted px-1.5 py-0.5 rounded text-xs">&lt;WoWFolder&gt;/Logs/WoWCombatLog.txt</code></li>
            </ul>
          </div>
          <p><strong className="text-foreground">2. Launch WoW and do your raid.</strong></p>
          <div>
            <p className="mb-1"><strong className="text-foreground">3. Upload the file:</strong></p>
            <ul className="list-none ml-4">
              <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">&lt;WoWFolder&gt;/Logs/WoWCombatLog.txt</code></li>
            </ul>
          </div>
          <div>
            <p className="mb-1"><strong className="text-foreground">4. Delete the log file after uploading</strong></p>
            <p className="ml-4">This keeps the file small for next time.</p>
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="font-medium mb-3">FAQ</h3>
        <div className="space-y-4">
          <div>
            <p className="font-medium text-foreground">What is the {addonName} addon?</p>
            <p className="text-muted-foreground mt-1">
              A companion addon for WoW {clientVersion} that enriches combat logs with additional metadata
              (gear, talents, glyphs, raid roster) for more detailed analysis in Chronicle.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
