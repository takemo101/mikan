# GitHub Mirror is one-way

mikan may create and update GitHub Issues as external mirrors of local mikan Issues, but the mikan Markdown files remain the source of truth. We choose a one-way GitHub Mirror instead of bidirectional sync because GitHub visibility and discussion are useful, while conflict resolution, remote edits, scheduling semantics, and GitHub state ownership would push mikan toward a project-management system rather than a tiny local-first Issue board.

## Consequences

GitHub Mirror operations update GitHub Issue title, body, and mikan-managed labels from the local Issue. They do not import GitHub edits back into mikan, do not treat GitHub open/closed state as authoritative, and do not create unmapped Issues automatically.
