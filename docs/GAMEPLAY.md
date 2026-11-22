# LIVE CITY — Gameplay & Interactive Viewer Reference

---

## 1. Viewer Chat Commands (`CommandParser`)

Commands are case-insensitive and support Vietnamese (with or without diacritics) as well as English aliases, with optional `!` prefix:

| Action | Recognized Commands | In-Game Effect |
|---|---|---|
| **JOIN** | `vao`, `vào`, `tham gia`, `join`, `play`, `spawn`, `start`, `hi`, `hello` | Spawns persistent viewer citizen at Central Plaza `(10, 10)` |
| **WOOD** | `go`, `gỗ`, `chat cay`, `chat go`, `wood`, `chop`, `tree` | Harvests nearest wood node and delivers cargo to city storage |
| **STONE** | `da`, `đá`, `dao da`, `khai thac da`, `stone`, `mine`, `rock` | Harvests nearest stone node and carries cargo back |
| **FOOD** | `luong thuc`, `thuc pham`, `hai qua`, `nong trai`, `food`, `farm`, `berry` | Gathers food to sustain working citizens during economy ticks |
| **BUILD** | `xay`, `xây`, `xay dung`, `build`, `construct`, `help` | Routes citizen (with perimeter fallback) to active construction site |
| **EXPLORE** | `kham pha`, `khám phá`, `tham hiem`, `explore`, `scout` | Explores undiscovered Fog of War frontier, reveals map tiles/nodes, earns gold/EXP |
| **VOTE** | `vote 1..3`, `bau 1..3`, `chon 1..3` | Casts community ballot during open voting session (1 vote per viewer) |
| **TRADE** | `doi vang`, `đổi vàng`, `trade`, `sell` | Trades surplus resources into city gold |

---

## 2. Citizen Progression & Titles

Citizens gain XP whenever depositing harvested resources, contributing build progress, or finishing exploration patrols (`level = min(20, 1 + floor(xp / 100))`):

- `Lv.1`: **Tân Binh**
- `Lv.2–3`: **Thợ Lành Nghề**
- `Lv.4–6`: **Kiến Trúc Sư**
- `Lv.7–9`: **Nguyên Soái**
- `Lv.10+`: **Huyền Thoại**

Level badges render directly on map sprites (`EntityRenderer`), `LeaderboardHUD`, and `CityInspector`.

---

## 3. City Milestones (`CityMilestone`) & Community Voting

- **Milestones (`WorldState.checkAndUnlockMilestones`):** Automatically unlocked and awarded once (re-entrancy guarded) for key city achievements (`first_building`, `explorer_50`, `explorer_80`, `city_level_3`, `master_workforce`).
- **Voting Queue & Tie-Breaking (`BuildingSystem`):** When a voting session closes on equal vote counts, lowest option index deterministically wins (`#1 < #2 < #3`). If another construction site is busy or resources are not yet accumulated, the winner waits in `worldState.pendingVotedProject` and auto-starts on the next `BuildingSystem.update()` tick once resources & slot allow.
