-- Account SavedVariables can contain unrelated data.
UnrelatedDB = { enabled = true }
ChronicleSidekickBridgeWoTLKDB = {
  ["other_setting"] = "preserved\nvalue",
  scale = 0.85,
  offset = -12,
  nested = { ["escaped\"key"] = true },
  ["position_payload"] = {
    ["schema_version"] = 2,
    ["encoding"] = "b36-v2",
    ["guids"] = {
      [1] = "0x0000000000000001",
      [2] = "0x0000000000000002",
    },
    ["chunks"] = {
      [1] = "msl7so3f:0hj:000ya4dqdw6y017ps000rszz;",
    },
    ["state_chunks"] = {
      [1] = "msl7so3f:0000n5c00ffk0;msl7so3f:01012kw000001;",
    },
    current_chunk_ticks = 1,
    current_state_chunk_records = 2,
    tick_count = 1,
    position_count = 2,
    state_count = 2,
    encoded_bytes = 122,
    capped = false,
  },
}
