- Show relationship to the totem/summoned in the logs. So add a log emit when a totem/summoned enters combat because its owner did.
  - Make it a `summons` log line.
  - `UnitPlayerControlled("unit")`
  - https://github.com/shagu/pfUI/blob/master/libs/libtotem.lua
  - Maybe this log? https://turtle-wow.fandom.com/wiki/API_Events#CHAT_MSG_SPELL_PET_DAMAGE
    - Raw log is just that but guids, maybe we can edit it
- Log `UnitCanCooperate` for who is friendly and foe.


Maybe every guid we see, we log:
```text
COMBTANT_INFO <guid>&<canCooperate>&<isPlayerControlled>
```