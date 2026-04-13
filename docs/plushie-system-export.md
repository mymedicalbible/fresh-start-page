# Plushie system — export index

> **Need the ENTIRE project (all files, all SQL, everything)?**  
> Run `.\scripts\export-full-project.ps1` and use the zip under `exports\medical-bible-project-FULL-*.zip`.  
> See `docs/full-project-export.md`.

This document lists **every migration, asset, and source file** that matters for the **game tokens + weekly plush shop**, so you can archive, audit, or redeploy without hunting the repo.

---

## Apply order (Supabase migrations)

Run migrations in **timestamp order** (folder `supabase/migrations/`). Plush-related SQL files:

| File | Role |
|------|------|
| `20260411120000_game_tokens_trial.sql` | Creates `plushie_catalog`, `game_config`, `token_ledger`, `user_plushie_unlocks`, original `game_get_state` / `game_purchase_active_plushie` (5 slots). |
| `20260411140000_panda_popcorn_lottie_path.sql` | Panda Lottie path. |
| `20260412160000_turtle_plushie_fixed_price.sql` | Early turtle at slot 0 + RPC tweaks (superseded later by rotation migration). |
| `20260413103000_plushie_rotation_monday_local_tz.sql` | **Core:** `game_get_state(p_tz)` / `game_purchase_active_plushie(p_tz)` with **local timezone** and ISO Monday week. |
| `20260414120100_plushie_display_names.sql` | Display names in catalog. |
| `20260415120000_remove_rustle_plant_catalog_name.sql` | Neutralize rustle-plant naming. |
| `20260416160000_plushie_turtle_slot_and_neutralize_rustle.sql` | Turtle on slot 0; rustle slug → `coming-soon-slot-1`. |
| `20260416170000_plushie_turtle_name_oneal.sql` | O’Neal turtle display name. |
| `20260418100000_plushie_next_week_rpc_and_copy.sql` | `next_week_plushie` in JSON; `rotation_anchor` + stub names; **`mod(..., 5)`** in this file’s `game_get_state`. |
| `20260420150000_plushie_seven_slot_catalog_and_rpc.sql` | **Seven slots (0–6):** constraint, six new plush rows + **unchanged slot 0 turtle**, **`mod(..., 7)`**, purchase RPC aligned. |
| `20260422100000_plushie_spotlight_override_and_anchor.sql` | Optional `game_config.plushie_spotlight_slot` (**0–6** or empty); RPCs respect override; re-anchors `rotation_anchor`; hardens slot 0 turtle + slot 1 vs rustle. |

**Authoritative RPC bodies** after full migration chain: **latest** `CREATE OR REPLACE` wins — currently **7-slot** logic lives in `20260420150000_*` for `game_get_state` and `game_purchase_active_plushie`.

---

## Public Lottie / assets (`public/lottie/`)

Rotation / shop use **JSON** paths under `/lottie/*.json` (not `.lottie` at runtime).

| Path | Notes |
|------|--------|
| `/lottie/meditating-turtle.json` | Turtle (slot 0). |
| `/lottie/panda-popcorn.json` | Legacy / profile; may be excluded from rotation strip. |
| `/lottie/robot-says-hi.json` | Slot 1. |
| `/lottie/fox-programmer.json` | Slot 2. |
| `/lottie/sleeping-penguin.json` | Slot 3. |
| `/lottie/petite-girafe.json` | Slot 4. |
| `/lottie/happy-dog.json` | Slot 5. |
| `/lottie/my-octopus-teacher.json` | Slot 6. |
| `/lottie/plushie-0.json` … `plushie-4.json` | **Placeholder** trial shapes — filtered in UI via `isPlaceholderLottiePath`. |
| `/lottie/dancing-bear.lottie` | Binary DotLottie on disk (if unused, safe to ignore or remove later). |

---

## Client source (TypeScript / TSX)

| Path | Role |
|------|------|
| `src/lib/gameTokens.ts` | `fetchGameState`, `purchaseActivePlushie`, `plushieNextMondayMidnightLocalMs`, `plushieRotationTimezone`, types. |
| `src/lib/dashPlushieDisplay.ts` | Dashboard/account plush prefs, `plushieCatalogDisplayName`, `resolveDashboardPlushieLottiePath`, localStorage keys. |
| `src/lib/useGameStateRefresh.ts` | Poll/refetch game state when enabled. |
| `src/pages/PlushieShopPage.tsx` | Shop UI, hero, countdown, purchase. |
| `src/pages/MyPlushiesPage.tsx` | Collection polaroids, long-press / sheet for dashboard + account display. |
| `src/pages/DashboardPage.tsx` | Weekly/collection plush Lottie on dashboard. |
| `src/pages/ProfilePage.tsx` | Tokens, plush strip, featured account plush. |
| `src/pages/MorePage.tsx` | Nav to shop / mine. |
| `src/components/PlushieTokenVictoryModal.tsx` | Victory modal (if used on completion flows). |
| `src/components/more/PlushiesSparkles.tsx` | Decorative. |
| `src/App.tsx` | Routes: `/app/plushies`, `/app/plushies/mine`. |

---

## Full data export (user backup)

`src/lib/fullDataExport.ts` includes **`user_plushie_unlocks`** in the exported JSON bundle so backups preserve unlocks.

---

## Environment

| Variable | Meaning |
|----------|--------|
| `VITE_GAME_TOKENS_ENABLED` | If `'false'`, token earns and plush RPCs are disabled client-side (`gameTokens.ts` / gating). |

---

## Database objects (reference)

- **`plushie_catalog`** — `id`, `slug`, `name`, `lottie_path`, `slot_index` (unique; 0–6 after latest migration).
- **`game_config`** — keys like `rotation_anchor`, `fixed_plushie_price`, `enabled`.
- **`user_plushie_unlocks`** — per-user unlocks.
- **`token_ledger`** — token grants and plush purchases.

---

## Quick archive zip (Windows)

From the project root, run:

```powershell
.\scripts\export-plushie-artifacts.ps1
```

Output: `exports/plushie-system-export-<date>.zip` (project folder only) — migrations, docs, listed sources, and `public/lottie` JSON assets.

---

## Routes

- Shop: `/app/plushies`
- My Plushies: `/app/plushies/mine`

---

*Generated as a static index; when you add migrations or assets, update this file or regenerate the zip.*
