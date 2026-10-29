# mini-maker — rules for any AI session working here

- **Blizzard IP: nothing generated is committed.** Stills, meshes, portraits and
  reference images live in the configured `workdir` (default
  `~/.cache/chronicle-mini-maker/`), never in this repo. The tools refuse a
  `workdir` inside any git repo with a remote; `.gitignore` is a second line of
  defence, not a licence to `git add -A`. Only rosters
  (`dungeons/<slug>/roster.yaml`) and `refs/SOURCES.md` are tracked.
- **Operator rules:** read `LOCAL.md` (`scripts/mini-maker/`, else
  `~/.config/chronicle-mini-maker/`) first when it exists; it wins over this file
  and the skill. Settings come from `local.yaml` (same lookup).
- Read `MESHY.md` and `PLAYBOOK.md` before writing a prompt or a line of code.
- Python 3.12; deps in `requirements.txt` (Pillow, PyYAML). Run the CLI from
  `scripts/mini-maker/`: `python3.12 scripts/mini.py <cmd> --dungeon <slug>`.
  Roster `dungeons/<slug>/roster.yaml` is in the checkout; working state
  `work/<slug>/<boss>/` and published minis `dungeons/<slug>/<boss>/` are in the
  workdir. Never hand-edit `meta.json` to get past a gate.
- **Tests:** `python3.12 -m pytest tests` from `scripts/mini-maker/`.
- **API keys:** the user brings their own Meshy and OpenRouter accounts.
  `MESHY_API_KEY` (mesh generation, https://docs.meshy.ai/en/api) and
  `OPENROUTER_API_KEY` (stills, portraits) come from the environment or
  `local.yaml`'s `env_file`. Never print either, never write one to a file,
  never search the filesystem for credentials. If a key is missing, stop and ask.
- **Spend:** tests make no paid calls, to either API. Live renders/mesh
  tasks only up to the cap the user names. Log every billed OpenRouter
  call to `cost.log` and every billed Meshy task to `meshy-tests/LOG.md`
  (both in the workdir; task id, credits, settings). `--dry-run` is always
  free — use it first.
- **Gates are the operator's.** `approve --stage stills|mesh` is run only on the
  operator's own word after they have seen the stills / mesh; never on your
  judgement. Publishing to the Miniature Foundry needs their explicit go, every time.
- Recursive deletes only inside your own worktree.
- No database, no R2 bucket, no production service, except the Miniature Foundry
  publish the operator approved.
