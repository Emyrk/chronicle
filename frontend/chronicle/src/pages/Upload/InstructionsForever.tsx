import { Download, Github, PackageOpen } from "lucide-react";
import { Link } from "react-router-dom";

const GITHUB_URL = "https://github.com/Emyrk/ChronicleCompanionForever";
const CURSEFORGE_URL = "https://www.curseforge.com/wow/addons/chroniclecompanionforever";

/** Upload instructions for WoW Forever's built-in Blizzard combat log. */
export function InstructionsForever() {
  const code = "bg-muted px-1.5 py-0.5 rounded text-xs break-all";
  const addonLink = "inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-foreground transition-colors hover:bg-muted";
  return (
    <>
      <div>
        <h3 className="font-medium mb-2">Recommended</h3>
        <p className="text-muted-foreground">
          ChronicleCompanionForever turns combat logging on inside dungeons and raids and off when you leave. Optional, but nothing to remember.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={addonLink}>
            <Github className="h-4 w-4" aria-hidden="true" />
            GitHub
          </a>
          <a href={CURSEFORGE_URL} target="_blank" rel="noopener noreferrer" className={addonLink}>
            <PackageOpen className="h-4 w-4" aria-hidden="true" />
            CurseForge
          </a>
        </div>
        <p className="mt-3 flex items-start gap-2 text-muted-foreground">
          <Download className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Want an easier upload flow? Install Chronicle Sidekick from the{" "}
            <Link to="/download" className="text-link hover:underline">
              download page
            </Link>
            .
          </span>
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
