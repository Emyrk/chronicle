-- Account SavedVariables can contain unrelated data.
UnrelatedDB = { enabled = true }
ChronicleCompanionWoTLKDB = {
  ["other_setting"] = "preserved\nvalue",
  scale = 0.85,
  offset = -12,
  nested = { ["escaped\"key"] = true },
  -- Position telemetry from the sidekick bridge.
  ["position_payload"] = {
    ["schema_version"] = 1,
    ["encoding"] = "b36-v1",
    ["guids"] = {
      [1] = "0x0000000000000001",
      [2] = "0x0000000000000002",
    },
    ["chunks"] = {
      [1] = "msl7so3f:0hj:000ya4dq017ps000;",
    },
    current_chunk_ticks = 1,
    tick_count = 1,
    position_count = 2,
    encoded_bytes = 68,
    capped = false,
  },
}
