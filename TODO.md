- Show relationship to the totem/summoned in the logs. So add a log emit when a totem/summoned enters combat because its owner did.
  - Make it a `summons` log line.
  - `UnitPlayerControlled("unit")`
  - https://github.com/shagu/pfUI/blob/master/libs/libtotem.lua
  - Maybe this log? https://turtle-wow.fandom.com/wiki/API_Events#CHAT_MSG_SPELL_PET_DAMAGE
    - Raw log is just that but guids, maybe we can edit it

- When a `slain` message comes in, attribute the kill to the last damage dealer. Attach this to the slain message for the ui.
  - Track the same pet across multiple summons, even though its guid changes
    - To identify the "same" pet across summons, we could create a stable key like:
      ${owner}-${name} (for named pets like warlock demons)
      ${owner}-${entry} (for generic pets/totems)
- Rotation panel to show casts
  - cancelled/interrupted should also be shown
- Detect out of date super wow, that is missing Raw logs
- Corpse release should be tracked and count as a wipe, but an indicator
- Use https://github.com/otiai10/gosseract to extract server time from video and sync to fights
  - https://github.com/otiai10/ocrserver/wiki/API-Endpoints 
- Sunder panel ASAP or bust
- On the damage panel breakout, we can show damage mitigated by blocks/resists
 - Or damage mitigated panel under "Damage Taken"
- Remove the interface database.Store
- Use spicedb and mix it with database.Store for permissions
- Guild attendance tracking.
- Some discord cli commands
- Guild page can show demand for class/spec combinations
- A rogue's distract ability should not cause a start of activity.

# Synthetic Messages

- [Absorbs](./combatlog/parser/vanilla/absorbs/TODO.md)
- Interrupts
```
1/31 20:43:55.408  CAST: 0x0000000000049036(Defen) casts Pummel(6552) on 0xF130002D8E00DD66(Flamewaker Priest).
1/31 20:43:55.408  CAST: 0xF130002D8E00DD66(Flamewaker Priest) fails casting Dark Mending(19775).
```

- Judgement of light to credit who applied debuff
- Filter by source spell id
- Sunder casts, add dodge/parry/miss to the sunder `CASTv2` message if the dodge/parry/miss message comes right after
- First action into encounter panel to see how long it took a player to do something

Look into reflect damage:
- https://chronicleclassic.com/instances/WGbcG8RUeoRk-8YZ
- https://www.turtlogs.com/viewer/93232/base?history_state=13

# Guild pages

References
- https://guildsofwow.com/v-a-l-o-r
- https://guildsofwow.com/looking-for-guild

# Mods

- UnitXP3 https://codeberg.org/konaka/UnitXP_SP3/wiki
- Nampower https://gitea.com/avitasia/nampower/src/branch/master/EVENTS.md#spell_damage_event_self-and-spell_damage_event_other


# UI State

- The entire UI state should be json serializable and stored in local storage.
- Add back recent memory but instead of auto loading have a button to "return to last visit" or something.

# Custom panels

A step to custom panels is to add the ability to write any filter to a given panel. Ability name, targets, school, etc. It would flip the panel to see the back, where you can tweak these things.

Rotation panel -> https://www.archon.gg/classic-fresh/builds/feral/druid/raid/rotation/normal/high-king-maulgar