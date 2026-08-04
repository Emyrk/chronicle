# Chronicle Agent Skills

This directory contains [Agent Skills](https://agentskills.io/) — modular knowledge packages that help AI coding agents work effectively with the Chronicle codebase.

## What are Agent Skills?

Agent Skills is an open specification (Apache 2.0) for extending AI agent capabilities. Each skill is a directory with a `SKILL.md` file containing YAML frontmatter and markdown instructions that teach agents how to handle specialized tasks.

## Available Skills

| Skill | Use When |
|-------|----------|
| [combat-log-parsing](./combat-log-parsing/) | Adding/fixing combat log event parsing, understanding GUID format |
| [events-panels](./events-panels/) | Creating new metrics panels in the frontend |
| [database-sqlc-patterns](./database-sqlc-patterns/) | Database queries, migrations, schema changes |
| [http-api-patterns](./http-api-patterns/) | API endpoints, authentication, SDK types |
| [wow-encounter-detection](./wow-encounter-detection/) | Adding raid/dungeon support, boss-specific logic |
| [river-job-queue](./river-job-queue/) | Background job processing for log parsing |
| [frontend-data-flow](./frontend-data-flow/) | Frontend data fetching, React Query, protobuf decoding |
| [panel-explainer](./panel-explainer/) | Building/maintaining `?explain=` lesson pages and their Remotion lesson videos |
| [remotion-best-practices](./remotion-best-practices/) | Routing Remotion work to the appropriate specialized skill |
| [remotion-captions](./remotion-captions/) | Transcribing, displaying, and animating captions |
| [remotion-create](./remotion-create/) | Creating a Remotion project or video composition |
| [remotion-docs](./remotion-docs/) | Finding current Remotion documentation |
| [remotion-interactivity](./remotion-interactivity/) | Structuring Remotion markup for Studio interactivity |
| [remotion-maps](./remotion-maps/) | Creating animated maps with Remotion |
| [remotion-markup](./remotion-markup/) | Applying Remotion content, animation, and effects practices |
| [remotion-multimedia](./remotion-multimedia/) | Inspecting audio and video with Mediabunny |
| [remotion-render](./remotion-render/) | Rendering and exporting Remotion videos |
| [remotion-saas](./remotion-saas/) | Building applications backed by Remotion |
| [remotion-upgrade](./remotion-upgrade/) | Upgrading Remotion and related packages |

## Compatibility

These skills follow the open [Agent Skills specification](https://agentskills.io/specification) and work with:

- **Claude Code** / **Claude.ai** — Native support via Anthropic
- **GitHub Copilot** — Via agent mode extensions
- **OpenAI Codex CLI** — Native support
- **VS Code** — With Agent Skills extensions

## Structure

Each skill directory contains:

```
skill-name/
└── SKILL.md          # Required: YAML frontmatter + instructions
```

Some skills may also include:
- `scripts/` — Executable helper scripts
- `references/` — Additional documentation
- `assets/` — Templates and resources

## Contributing

When adding a new skill:

1. Create a directory with a lowercase-hyphenated name
2. Add a `SKILL.md` with required frontmatter (`name`, `description`)
3. Keep instructions under 500 lines (use `references/` for details)
4. Update this README's skill table

See the [Agent Skills specification](https://agentskills.io/specification) for format details.
