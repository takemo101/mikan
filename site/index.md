---
layout: home

hero:
  name: mikan
  text: Local-first Issue board for AI-assisted development
  tagline: A tiny Markdown-backed board shared by humans, CLIs, TUIs, MCP clients, and coding agents — without a server, database, scheduler, or workflow engine.
  actions:
    - theme: brand
      text: Get Started
      link: /quickstart
    - theme: alt
      text: Install
      link: /install
    - theme: alt
      text: View on GitHub
      link: https://github.com/takemo101/mikan

features:
  - icon: 🍊
    title: Markdown source of truth
    details: Every Issue is a readable Markdown file under .mikan/. Status is the containing directory, so state stays easy to diff, edit, and commit.
  - icon: 🧭
    title: Small primitive CLI
    details: Create, list, show, update, move, and append Issue context with focused commands that are safe for humans and agents.
  - icon: 🖥️
    title: Keyboard-first TUI
    details: Open a dense board, inspect full-page Markdown details, append Notes, move Issues, and archive completed context from the terminal.
  - icon: 🌐
    title: Local Browser board
    details: Open a local Web board with mikan browser. It binds to 127.0.0.1, opens on demand, and supports a Markdown detail modal, appends, and drag-and-drop Status moves — no shared server.
  - icon: 🔌
    title: Stdio MCP for agents
    details: Register mikan with common AI coding agents so they can read and update the same local Issue files through explicit tools.
  - icon: 🧩
    title: Skills without a runtime
    details: Install agent guidance for supported clients. mikan does not model agents, spawn workers, or schedule work.
  - icon: 🔔
    title: Optional local hooks
    details: Poll Status transitions for lightweight local automation. Hook failures are logged as warnings and never become authoritative state.
---
