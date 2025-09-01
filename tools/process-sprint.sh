#!/usr/bin/env bash
set -euo pipefail
SPRINT_NAME="${1:-Sprint 0}"
TYPE_FILTER="${2:-feature}" # feature|bug|docs|chore
OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

echo "Fetching open '$TYPE_FILTER' issues for milestone '$SPRINT_NAME'..."
issues=$(gh issue list --milestone "$SPRINT_NAME" --state open --json number,title,labels --jq '.[] | select([.labels[].name] | index("'"$TYPE_FILTER"'")) | [.number,.title] | @tsv')

if [ -z "$issues" ]; then echo "No open $TYPE_FILTER issues for $SPRINT_NAME"; exit 0; fi

wait_for_merge () {
  local pr=$1
  echo "Waiting for PR #$pr to be merged (auto-merge enabled)..."
  while true; do
    state=$(gh pr view "$pr" --json state,isDraft,mergeable,merged -q '[.state, .isDraft, .mergeable, .merged] | @tsv')
    IS_MERGED=$(echo "$state" | awk '{print $4}')
    if [ "$IS_MERGED" = "true" ]; then echo "✅ PR #$pr merged."; break; fi
    gh pr checks "$pr" --watch --fail-fast=false || true
    sleep 10
  done
}

while IFS=$'\t' read -r num title; do
  slug=$(echo "$title" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')
  branch="${TYPE_FILTER}/${num}-${slug}"
  echo "=== Issue #$num: $title ==="
  git checkout -b "$branch" || git checkout "$branch"

  # >>> Implement work for this issue here (edit code/tests/docs). <<<
  git add -A
  git commit -m "feat: start #$num - $title" || true
  git push -u origin "$branch"

  AC=$(gh issue view "$num" --json body --jq '.body' | awk '/^## +Acceptance Criteria/{flag=1;next}/^## +/{flag=0}flag' || true)
  [ -z "$AC" ] && AC="- [ ] Criteria 1\n- [ ] Criteria 2"

  cat > /tmp/pr_body.md <<EOM
Closes #$num

Automerge: yes

## Acceptance Criteria
$AC

## Tests
- [ ] Unit tests added/updated
- [ ] E2E (Playwright) if applicable

## Checklist
- [ ] Conventional Commit title
- [ ] All acceptance criteria ticked
- [ ] Docs/ADRs updated if needed
- [ ] Requested review from CODEOWNERS
EOM

  title_cc="feat: ${title}"
  gh pr create --title "$title_cc" --body-file /tmp/pr_body.md --base main --head "$branch" --milestone "$SPRINT_NAME" || \
  gh pr create --title "$title_cc" --body-file /tmp/pr_body.md --base main --head "$branch"

  pr_number=$(gh pr view --json number -q .number)
  gh pr edit "$pr_number" --add-label "$TYPE_FILTER" 2>/dev/null || true
  gh pr edit "$pr_number" --add-reviewer ${CODEOWNER_GH#@} || true
  gh pr merge "$pr_number" --squash --auto || true

  echo ">>> Continue committing until all Acceptance Criteria are met, then tick them in PR body."
  echo ">>> CI + PR Gatekeeper must pass, and at least one approval required; auto-merge will complete."

  wait_for_merge "$pr_number"
done <<< "$issues"

echo "✅ Completed milestone '$SPRINT_NAME' for type '$TYPE_FILTER'."

