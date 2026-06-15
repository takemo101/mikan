# Issue Metadata is advisory context

mikan stores project-defined Issue Metadata under a single `metadata` frontmatter object, exposes it to agents and hooks, and keeps it advisory rather than authoritative. We chose a JSON-compatible object over arbitrary top-level frontmatter keys to avoid future field collisions and stable read/hook serialization problems; metadata can inform agents, humans, and hook scripts, but it does not become a profile, priority, scheduler rule, transition gate, or hook filter.
