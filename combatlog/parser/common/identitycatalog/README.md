# Identity catalogue evidence policy

Every observed GUID, observation count, and instance context remains retained.
Evidence details use a history-derived budget:

- Known identities with no unresolved history retain their deterministic first
  evidence entry. Repeated observations of that entry update its count and time
  range. Other routine details are intentionally omitted, not reported as overflow or evidence truncation warnings.
- Zero GUIDs, conflicting identities, and identities with any unknown context
  retain up to 64 evidence summaries. Additional diagnostic observations increment
  `evidence_overflow`.

The complete current message's classification, contexts, and owner-cycle checks
finish before evidence retention. Becoming unknown expands the budget from that
point onward; becoming known never erases unresolved history. Snapshot restore
uses the same persisted context/conflict history. Older snapshots with additional
known evidence remain readable and retain their existing summaries.
