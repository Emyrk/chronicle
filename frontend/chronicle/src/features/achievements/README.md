# Achievements UI

Spec: `docs/achievement-system.md`. Stories: `Pages/Achievements` and `Features/Achievements/Notifications`.

## Storybook is the implementation

The stories render the real production components. There is no mock-only UI to port later.

- `AchievementsPage` is the `/achievements` route component. The page story renders it unchanged; only the network is mocked (MSW, `achievements.mocks.ts`).
- `AchievementsPage` may only fetch (`useAchievements`), map (`buildAchievementsModel`), and sync URL state (`achievementsState.ts`). All UI lives in `AchievementsBrowser` and the components it uses.
- The API contract is `AchievementsResponse` in `api/chroniclesdk/achievements.go`. The fixtures build that exact type, so the backend must return what the stories show.
- Toasts and next-step hints are the components the app calls (`showAchievementToast`, `AchievementNextStep`).

When implementing:

1. Add the Go handler for `GET /api/v1/achievements` returning `AchievementsResponse`.
2. Register `<Route path="/achievements" element={<AchievementsPage />} />` in `App.tsx`.
3. Change UI by editing these components and checking the stories. Do not add a parallel "live" component.
4. If the API shape changes, change the Go type, regenerate, and update `achievements.fixtures.ts` in the same commit.

Story-only files: `*.stories.tsx`, `achievements.fixtures.ts`, `achievements.mocks.ts`.
