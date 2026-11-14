# Renovo

For saving Voyage places from the deployed GitHub Pages site, follow
[voyage/SETUP.md](voyage/SETUP.md) to connect a Free Supabase database.
Cloud configuration enables private sign-in and saving across devices.
The local workflow below remains available when cloud settings are empty.

Run the dashboard locally with its read-only Obsidian connection:

```sh
python3 server.py
```

Open http://127.0.0.1:8000. Requires Python 3.9 or later; no dependencies.
The default vault is the sibling `compaulo-codex` folder. Override it with:

```sh
python3 server.py --vault "/path/to/vault" --port 8000
```

The home page reads `Personal/Personal - Goals.md` every five seconds while
visible. It displays the current year's goals, or the latest year available.
Use a heading like `<u>2026 Goals</u>` or `## 2026 Goals`, followed by a
consecutive Markdown list (`- [x] Done`, `- [ ] Pending`, or `- A goal`).
Text after the list and other vault notes are excluded. The site never writes
to your vault. Workout entries remain in browser local storage.

Keep the server running while using the connection. It binds only to your Mac's
loopback address. A GitHub Pages/static deployment cannot read local Obsidian
files and will show the connection as offline. Private note contents are read
at request time, never copied into the repository or published assets.

In local file mode, Voyage places save to `voyage/public/data.json` in its `places` array through
`server.py`. Existing browser places migrate automatically on first successful
connection. Starter examples are not saved. Saving requires the local server;
failed saves leave the form open for retry. Existing file metadata is preserved.
