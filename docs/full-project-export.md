# Full project export (everything important)

## One file — all code + SQL (always same path)

From the project folder:

```bash
npm run export:txt
```

This **overwrites** exactly:

`exports/ALL_CODE_AND_SQL.txt`

That single file contains ~all `.ts`, `.tsx`, `.css`, `.sql`, configs, etc. (see `scripts/export-project-one-file.mjs`).

---

The **plushie-only** zip from earlier was incomplete for whole-repo backups. Use the zip script when you want an archive without the one-file dump.

## Run this (Windows PowerShell)

From the project root:

```powershell
.\scripts\export-full-project.ps1
```

## Output (this repo only — never `dist/` or your system temp)

- **File:** `exports\medical-bible-project-FULL-<timestamp>.zip`
- **Example:** `exports\medical-bible-project-FULL-20260413-083429.zip`

Inside the zip you get the **entire repo tree** except:

| Excluded | Why |
|----------|-----|
| `node_modules` | Run `npm install` after unzip |
| `.git` | Use `git clone` if you need history |
| `dist` | Run `npm run build` to regenerate |
| `supabase/.temp` | Supabase CLI cache only |

## Proof of SQL coverage

Each archive includes **`EXPORT_MANIFEST.txt`** at the top level listing **every** file in `supabase/migrations/*.sql` (29 migrations as of this doc).

## Restore

1. Unzip anywhere.
2. `npm install`
3. `npm run build` (optional)
4. Point Supabase CLI at `supabase/` if you use local DB work.

---

The smaller script **`scripts/export-plushie-artifacts.ps1`** is still available for a **minimal** plushie-only bundle; the **full** export is **`export-full-project.ps1`**.
