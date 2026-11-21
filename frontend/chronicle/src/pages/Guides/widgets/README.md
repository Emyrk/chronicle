# Lua panel widgets

Widgets are Chronicle-owned UI objects that Lua panels configure with setter methods, such as `PlayerMetricChart` and `LineChart`. Each widget is described once by a `WidgetSpec`. Everything else is derived from that spec:

| Derived from the spec | Where |
| --- | --- |
| `CreateFrame("<LuaType>")` and the Lua setter methods | `runtime/runtime.ts` |
| Scene prop allowlist and validation (the worker → page trust boundary) | `protocol/scene.ts` |
| `require("chronicle.v1.ui").<helper>(parent, id, options)` | `runtime/trustedModules.ts` |
| LuaLS definitions and the generated API reference | `LuaProjects/lua-panel-api.d.lua`, via `pnpm generate:lua-api` |
| Contract tests for every setter, the helper, and missing or omitted arguments | `widgets.test.ts` |

Only the React renderer is written by hand, in `protocol/widgetRenderers.tsx`. That map is keyed by `WidgetKind`, so a spec without a renderer does not compile.

## Add an option to an existing widget

1. Add a setter to the spec's `setters`, using an option type from `optionTypes.ts` (`flag`, `number`, `numberOrAuto`, `text`, `choice`) or a custom `OptionType`.
2. Read the new prop in the widget's renderer.
3. Run `pnpm generate:lua-api`.

To add a value to an existing choice, such as a new curve or format, add it to the `choice([...])` list, then handle it in the renderer.

## Add a widget

1. Add its kind to `NODE_KINDS` in `protocol/types.ts`.
2. Write `widgets/<name>.ts` exporting `defineWidget({ ... })`, and add it to `WIDGETS` in `index.ts`.
3. Add a renderer to `WIDGET_RENDERERS`. Set `interactive: true` if it handles the pointer itself.
4. Run `pnpm generate:lua-api`, and add prose and an example to `lua-panel-api.md`.

## Rules

- **Values must be JSON.** Widget props cross from the Lua worker to the page as data. Library options that are functions or components, such as Nivo formatters, tooltips or layers, become named presets that the renderer maps to code, like `LineChartFormat`.
- **Keep `fengari` out of specs.** Option readers get the Lua API from `LuaReadContext`. Specs are also imported by scene validation on the main thread, and the Lua VM must stay in the worker bundle.
- **Validate in both places.** `read` turns bad Lua input into a helpful Lua error. `validate` is the security check on worker output; it must not trust `read`.
- **Bound everything.** Arrays need a maximum length, and strings go through the shared validators.
