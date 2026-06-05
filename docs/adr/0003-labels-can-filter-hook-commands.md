# Labels can filter hook commands

mikan allows optional hook commands to declare Label filters, while keeping Labels descriptive rather than turning them into agent profiles, roles, priorities, or scheduling rules. We chose this over requiring every project to implement script-side filtering because hook filtering is part of the public config surface users naturally reach for, but limited it to command selection so Status changes, success judgement, retries, and agent dispatch behavior remain outside mikan.

## Consequences

A hook entry may use object form with `command` and `when.labels_include`; the listed Labels are an include-all filter for deciding whether that command runs. Existing string hook entries remain unconditional commands.
