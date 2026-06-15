# mikan

mikan is a micro-kanban context for coordinating AI-assisted development work through lightweight Issues.

## Language

**Issue**:
The single unit of work or discussion tracked by mikan. Each **Issue** has one current board position and carries its own context, history, reports, and notes.
_Avoid_: Task, ticket, work item

**Issue ID**:
A short stable identifier for an **Issue**, formed from the project key and a sequence number, such as `MIK-001`. An **Issue ID** does not change when the Issue title changes.
_Avoid_: Slug, title ID, filename ID

**Issue Metadata**:
Structured, project-defined context stored on an **Issue** for agents, hooks, and humans to read. Issue Metadata informs decisions, but it does not assign roles, priority, scheduling behavior, or transition authority.
_Avoid_: Profile, priority, assignee, workflow rule

**Label**:
A configured lightweight tag on an **Issue** used for filtering, grouping, and selecting optional hook commands. Labels are descriptive only; they do not assign agent profiles, roles, priority, scheduling, or success behavior.
_Avoid_: Profile, role, priority

**Dependency**:
A structured prerequisite relationship from one **Issue** to another, stored as an Issue ID in frontmatter `depends_on`. A Dependency is satisfied only when the prerequisite Issue is in **Completed**. Dependencies guide implementation order; they do not automatically move or schedule Issues.
_Avoid_: Parent task, blocking edge, scheduler rule

**GitHub Mirror**:
A GitHub Issue representation of a mikan **Issue** used for external visibility and discussion. The mikan Issue remains authoritative; the GitHub Mirror is not a second source of truth.
_Avoid_: GitHub sync, bidirectional sync, GitHub source of truth

**Unmet Dependency**:
A declared **Dependency** whose prerequisite Issue is missing, malformed, archived, cyclic, self-referential, or not yet **Completed**. Unmet Dependencies are warnings/read-model information, not hard transition validation.
_Avoid_: Lock, enforced gate, workflow rule

**Status**:
The current lifecycle position of an **Issue** on the board. The standard Statuses are backlog, ready, active, blocked, completed, and archived.
_Avoid_: State, phase

**Backlog**:
A Status for Issues that are known but not necessarily ready to work on.
_Avoid_: Todo, someday

**Ready**:
A Status for Issues that can be started immediately without another decision or missing input.
_Avoid_: Accepted, queued

**Active**:
A Status for Issues currently being worked by a human, parent agent, child agent, or script.
_Avoid_: Spawned, in flight

**Blocked**:
A Status for Issues that cannot progress until an external input, decision, or dependency is resolved.
_Avoid_: Waiting, stuck

**Completed**:
A Status for Issues that have met their acceptance criteria and need no further work.
_Avoid_: Done-ish, closed

**Archived**:
A Status for Issues intentionally removed from normal board/list views while remaining available for explicit reference.
_Avoid_: Deleted, hidden

**Column**:
The board lane that groups Issues with the same **Status**. A **Column** is how a Status appears in the board UI.
_Avoid_: List, bucket

**Report**:
An append-only finding or result added to an **Issue** by a named source such as an agent, script, or human. Reports are evidence and context for the Issue; they are not separate Issues, and their source is not a modeled Agent.
_Avoid_: Comment, message, artifact

**Note**:
A lightweight free-form addition to an **Issue** for context, judgement, or reminders that are not formal Reports.
_Avoid_: Comment, chat message

**Card**:
The visual representation of an **Issue** in the human-facing board UI. A **Card** is not a separate domain object from the **Issue** it displays.
_Avoid_: Task card, item

## Example dialogue

Developer: "Create an Issue for the herdr dispatcher prototype."
Domain expert: "Yes — it will appear as a Card in the Ready column, but the underlying thing remains an Issue."
Developer: "It depends on MIK-001 being finished first. Is that a workflow rule?"
Domain expert: "No. Add `MIK-001` to `depends_on` so humans and agents see the Dependency. mikan warns while it is unmet, but it does not enforce scheduling."
Developer: "So should the CLI say `task` anywhere?"
Domain expert: "No. Use Issue for the domain concept; Card only when talking about the board UI."
