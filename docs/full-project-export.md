# Full project export (everything important)

## Three files — all code + SQL (fixed paths)

From the project root:

```bash
npm run export:txt
```

This **overwrites** exactly:

- **`exports/1.txt`** — title **1**, migration index / front matter, and the first third of embedded files (sorted by path)
- **`exports/2.txt`** — title **2**, second third
- **`exports/3.txt`** — title **3**, final third

Together they contain the same content as the old single-file export, split for size. See [`scripts/export-project-one-file.mjs`](../scripts/export-project-one-file.mjs) for include rules and exclusions.

The dump in **`1.txt`** opens with **front matter** listing every `supabase/migrations/*.sql` file (apply in filename order), plus notes on Edge Functions and environment variables.

**Excluded** (not embedded): `node_modules`, `dist`, `.git`, `exports` (avoids nesting prior dumps), `ExportedProject`, typical caches, `supabase/.temp/`, and non-text/binary blobs not in the allowlist.

---

## Zip archive (optional)

```bash
npm run export
```

Creates a timestamped zip under `exports/` via [`scripts/export-codebase.mjs`](../scripts/export-codebase.mjs). Use this when you want a normal folder tree without the mega-text files.

---

## Windows PowerShell (alternative full zip)

If present in the repo, `scripts/export-full-project.ps1` can build a broader zip; prefer `npm run export` for consistency.

---

## SQL coverage

All migrations live under `supabase/migrations/`; the exact list and count appear at the top of **`exports/1.txt`** each time you run `npm run export:txt`.

---

## Restore

1. Clone or unzip the project.
2. `npm install`
3. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, etc.
4. `npm run build` (optional)
5. `npm run supabase:push` when pointed at your Supabase project (requires CLI + `SUPABASE_DB_PASSWORD`).
