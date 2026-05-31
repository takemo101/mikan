set dotenv-load := false

default:
    @just --list

# Install a local mikan CLI wrapper without changing the tracked bin file mode.
install:
    mkdir -p "$HOME/.bun/bin"
    rm -f "$HOME/.bun/bin/mikan"
    printf '%s\n' '#!/usr/bin/env sh' 'exec bun "{{ justfile_directory() }}/packages/cli/src/bin.ts" "$@"' > "$HOME/.bun/bin/mikan"
    chmod 755 "$HOME/.bun/bin/mikan"
    "$HOME/.bun/bin/mikan" help

# Remove the local mikan CLI wrapper that `just install` created.
# This recipe only removes the dev-loop shell wrapper at ~/.bun/bin/mikan.
uninstall:
    rm -f "$HOME/.bun/bin/mikan"

# Install lefthook git hooks for this checkout.
hooks-install:
    lefthook install

# Run the pre-commit hook without committing.
hooks-run:
    lefthook run pre-commit --force

typecheck:
    bun run typecheck

test:
    bun run test

check:
    bun run check

fix:
    bun run fix

build:
    bun run build

validate: typecheck test check build
