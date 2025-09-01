# Repo Reset Plan (Empty & Rebase when Scaffolding is Ready)

Purpose: Clear prior project history and re‑initialize the repository once scaffolding is approved.

## Preconditions

- Sign‑off on scaffolding plan (stack, versions, directories).
- Backup any legacy artifacts needed for reference.

## Recommended Approach

1) Create a safety tag of current `main`:
   - `git tag legacy-pre-reset-<date>`
   - `git push origin --tags`
2) Create a fresh orphan branch for the new initial commit:
   - `git checkout --orphan scaffold-main`
   - Remove all files except `/docs` (keep Sprint 0 docs): `git rm -rf .` then restore `/docs`.
   - Add scaffolding when approved; commit with message: `chore: initial scaffold`.
3) Force‑update `main` to the new history:
   - `git branch -M scaffold-main main`
   - `git push -f origin main`
4) Protect `main` (branch protection rules) and delete obsolete branches.

## Alternative (Filter history)

- Use `git filter-repo` (or `git filter-branch`) to remove unwanted history and keep only new tree. Verify with a mirror clone before pushing.

## Notes

- Coordinate with collaborators; communicate window for force push.
- Ensure CI/secrets are prepared in the new setup before force push.

