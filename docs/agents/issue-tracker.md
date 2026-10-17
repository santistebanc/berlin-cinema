# Issue tracker: GitHub

Issues and specs live in GitHub Issues for
santistebanc/berlin-cinema. Use the gh CLI.

## Conventions

Run commands inside this repository, or supply
--repo santistebanc/berlin-cinema.

- Create: gh issue create --title "..." --body-file <file>
- Read: gh issue view <number> --json number,title,body,labels,comments
- List: gh issue list --state open --json number,title,body,labels
- Comment: gh issue comment <number> --body-file <file>
- Add label: gh issue edit <number> --add-label "<label>"
- Remove label: gh issue edit <number> --remove-label "<label>"
- Close: gh issue close <number> --comment "..."

Use UTF-8 body files for multiline content.

When a skill says "publish to the issue tracker",
create a GitHub issue.

When a skill says "fetch the relevant ticket",
read the corresponding GitHub issue.

Use docs/agents/triage-labels.md for triage role mappings.

## Pull requests as a triage surface

PRs as a request surface: no.
