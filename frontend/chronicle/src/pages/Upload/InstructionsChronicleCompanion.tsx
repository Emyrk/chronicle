import { AlertTriangle } from "lucide-react";
import type { MouseEvent } from "react";

/** Opens the collapsed Nampower install guide and scrolls to it. */
function openNampowerGuide(e: MouseEvent<HTMLAnchorElement>) {
  const guide = document.getElementById("install-nampower");
  if (!(guide instanceof HTMLDetailsElement)) return;
  e.preventDefault();
  guide.open = true;
  guide.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Upload instructions for 1.12a ChronicleCompanion + Nampower format. */
export function InstructionsChronicleCompanion({ nightmareOfUrsol = false }: { nightmareOfUrsol?: boolean }) {
  return (
    <>
      <div>
        <h3 className="font-medium mb-2">Requirements</h3>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>
            <a href="https://github.com/Emyrk/ChronicleCompanion/" target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
              ChronicleCompanion Addon
            </a>
          </li>
          <li>
            <a href="https://github.com/Emyrk/nampower" target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
              Nampower
            </a>
            {" "}
            <span className="text-sm">
              (<a href="#install-nampower" onClick={openNampowerGuide} className="text-link hover:underline">install guide</a>)
            </span>
          </li>
        </ul>
      </div>

      <div>
        <h3 className="font-medium mb-2">Optional dependencies</h3>
        <p className="mb-2 text-muted-foreground">
          Chronicle works without these, but positional data requires at least one:
        </p>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>
            <a href="https://github.com/brues-code/ClassicAPI" target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
              ClassicAPI
            </a>
          </li>
          <li>
            <a href="https://github.com/balakethelock/SuperWoW" target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
              SuperWoW
            </a>
            {nightmareOfUrsol && (
              <span className="ml-2 inline-flex items-center gap-1 rounded border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-300">
                <AlertTriangle className="h-3 w-3" />
                Friendly positions only
              </span>
            )}
          </li>
        </ul>
      </div>

      {nightmareOfUrsol && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-amber-100">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <p className="font-medium">Use ClassicAPI for complete map replays</p>
              <p className="mt-1 text-amber-100/80">
                SuperWoW only emits positional data for friendly units. Hostile entities will not be shown. Switch to ClassicAPI for positional data on all units.
              </p>
            </div>
          </div>
        </div>
      )}

      <details id="install-nampower" className="scroll-mt-4 rounded-md border border-border/70 bg-muted/20">
        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium hover:bg-muted/40">
          How to install Nampower
        </summary>
        <div className="px-3 pb-3 space-y-3 text-muted-foreground text-sm">
          <p>
            Nampower is a DLL mod — it requires a DLL loader like{" "}
            <a href="https://github.com/hannesmann/vanillafixes" target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
              VanillaFixes
            </a>
            {" "}to run.
          </p>
          <div>
            <p className="font-medium text-foreground mb-1">1. Install VanillaFixes (DLL loader)</p>
            <ol className="list-decimal list-inside space-y-1 ml-1">
              <li>Go to the{" "}
                <a href="https://github.com/hannesmann/vanillafixes/releases" target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                  VanillaFixes releases page
                </a>
              </li>
              <li>Download the latest release zip</li>
              <li>Extract <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">VanillaFixes.exe</code> and <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">VfPatcher.dll</code> into your WoW folder (the same directory as <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">WoW.exe</code>)</li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">2. Install Nampower</p>
            <ol className="list-decimal list-inside space-y-1 ml-1">
              <li>Go to the{" "}
                <a href="https://github.com/Emyrk/nampower/releases" target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                  Nampower releases page
                </a>
              </li>
              <li>Download the latest <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">nampower.dll</code></li>
              <li>Place it in your WoW folder (the same directory as <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">WoW.exe</code>)</li>
              <li>Create or edit <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">dlls.txt</code> in the same folder and add <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">nampower.dll</code> on its own line</li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">3. Launch the game</p>
            <p className="ml-1">
              Run <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">VanillaFixes.exe</code> instead of <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">WoW.exe</code>. VanillaFixes automatically loads DLLs listed in <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">dlls.txt</code>, including nampower.
            </p>
          </div>
        </div>
      </details>

      <p className="text-muted-foreground">
        <strong className="text-foreground">You can still use SuperWoWCombatLogger for Turtlogs compatibility</strong>
      </p>

      <div>
        <h3 className="font-medium mb-2">On Raid Night</h3>
        <div className="space-y-3 text-muted-foreground">
          <p className="italic">Optional: Configure the addon with <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">/clog config</code></p>
          <div>
            <p className="mb-1"><strong className="text-foreground">1. Prepare the logs</strong></p>
            <ul className="list-none ml-4">
              <li>Type <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">/clog delete</code> to delete any existing logs</li>
            </ul>
          </div>
          <p><strong className="text-foreground">2. Do your raid</strong></p>
          <div>
            <p><strong className="text-foreground">3. Save your logs</strong></p>
            <ul className="list-none ml-4">
              <li>Type <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">/clog save</code> to save the logs to disk</li>
            </ul>
          </div>
          <div>
            <p className="mb-1"><strong className="text-foreground">4. Upload the file:</strong></p>
            <ul className="list-none ml-4">
              <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">&lt;WoWFolder&gt;/CustomData/Chronicle_&lt;character_name&gt;.txt</code></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="font-medium mb-3">FAQ</h3>
        <div className="space-y-4">
          <div>
            <p className="font-medium text-foreground">What is the ChronicleCompanion addon?</p>
            <p className="text-muted-foreground mt-1">
              ChronicleCompanion is a new combat logger written from the ground up specifically for Chronicle.
              It captures additional data not available in standard combat logs for more detailed analysis.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
