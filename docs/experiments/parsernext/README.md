# Parsernext experiment: stopped, lessons retained

**Decision:** abandon the parser stack as a merge candidate. These documents
preserve evidence and possible small follow-ups, not a plan to land the stack.

The goals were lower hosted parsing cost using home hardware, then live logging
and eventual battleground support—not simply faster parsing. Recurring retained
message failures and the amount of coupled machinery made this attempt too broad.

## Short reads

- [Experiment and outcome](experiment.md): what was built, tested, and rejected.
- [Salvage candidates](salvage.md): small changes worth evaluating independently.
- [Design lessons](design.md): useful boundaries without adopting the machinery.

## Agent reference

- [Evidence and limitations](reference/experiment-evidence.md)
- [Candidate-by-candidate salvage map](reference/salvage-map.md)
- [Detailed design notes](reference/design-notes.md)

The references distinguish the committed experiment tip, later local fixes, and
main. Source links are historical evidence, not instructions to apply migrations
or restore the branch. Start future implementation from current main and request
approval for one bounded change at a time.
