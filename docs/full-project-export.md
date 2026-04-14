# Full project export (everything important)

## One file — all code + SQL

From the project root:

```bash
npm run export:txt
```

This **overwrites** exactly:

**`exports/ALL_CODE_AND_SQL.txt`**

That file concatenates essentially all typed source, SQL, configs, Markdown, YAML workflows, manifests, and related text assets. See [`scripts/export-project-one-file.mjs`](../scripts/export-project-one-file.mjs) for include rules and exclusions. **`FILE:` paths match the repo on disk**—if a pasted line looks wrong (e.g. imports), open the same path in the project; the export is UTF-8 concatenation only.

Order inside the file:

1. Short **single-file intro** (for reviewers).
2. **Front matter** — every `supabase/migrations/*.sql` (apply in filename order), Edge Functions, env notes.
3. **`FILE: README.md`** then **`FILE: DEVELOPERS.md`** (when present), then all other paths **A–Z**.

**Excluded** (not embedded): `node_modules`, `dist`, `.git`, `exports` (avoids nesting prior dumps), `ExportedProject`, typical caches, `supabase/.temp/`, and non-text/binary blobs not in the allowlist.

---

## Zip archive (optional)

```bash
npm run export
```

Creates a timestamped zip under `exports/` via [`scripts/export-codebase.mjs`](../scripts/export-codebase.mjs). Use this when you want a normal folder tree without the mega-text file.

---

## Windows PowerShell (alternative full zip)

If present in the repo, `scripts/export-full-project.ps1` can build a broader zip; prefer `npm run export` for consistency.

---

## SQL coverage

All migrations live under `supabase/migrations/`; the exact list and count appear in the **front matter** at the top of **`exports/ALL_CODE_AND_SQL.txt`** each time you run `npm run export:txt`.

---

## Restore

1. Clone or unzip the project.
2. `npm install`
3. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, etc.
4. `npm run build` (optional)
5. `npm run supabase:push` when pointed at your Supabase project (requires CLI + `SUPABASE_DB_PASSWORD`).
