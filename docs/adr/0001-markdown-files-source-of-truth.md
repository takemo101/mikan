# Markdown files are the source of truth

mikan stores each Issue as a Markdown file and treats the containing status directory as the Issue's current Status. We choose this over SQLite or another database in v0 because agents can read and edit Markdown naturally, humans can inspect and repair the board with ordinary tools, and Git diffs remain meaningful. The trade-off is weaker structured querying and transaction support, so mikan-managed writes use a short-lived lock and atomic file replacement rather than introducing a parallel database.
