"""Local dashboard server with read-only access to Obsidian goal lists."""
import argparse
import json
import re
import os
import tempfile
from threading import Lock
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
DEFAULT_VAULT = ROOT.parent / 'compaulo-codex'


def read_goals(vault):
    note = vault / 'Personal' / 'Personal - Goals.md'
    text = note.read_text(encoding='utf-8')
    # Only the consecutive goal list following a year heading is exposed.
    sections = []
    current = None
    for line in text.splitlines():
        heading = re.fullmatch(r'\s*(?:<u>|#{1,6}\s*)?(\d{4}) Goals(?:</u>)?\s*', line)
        if heading:
            current = {'year': int(heading[1]), 'goals': []}
            sections.append(current)
            continue
        if current is None:
            continue
        item = re.fullmatch(r'\s*[-*] (?:\[([ xX])\]\s*)?(.+)', line)
        if item:
            current['goals'].append({'text': item[2], 'done': (item[1] or '').lower() == 'x'})
        elif line.strip():
            current = None
    sections = [section for section in sections if section['goals']]
    return {'sections': sections, 'modified': note.stat().st_mtime,
            'source': 'Personal/Personal - Goals.md', 'vault': vault.name}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, vault, **kwargs):
        self.vault = vault
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def json_response(self, data, status=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if urlsplit(self.path).path != '/api/obsidian/goals':
            self.send_error(404)
            return
        self.send_error(404)

    def do_GET(self):
        if urlsplit(self.path).path != '/api/obsidian/goals':
            # Serve only the dashboard's public assets, never repository files.
            if urlsplit(self.path).path not in ('/', '/index.html', '/app.js', '/styles.css', '/compaulo-theme.css'):
                self.send_error(404)
                return
            return super().do_GET()
        if self.headers.get('Sec-Fetch-Site') == 'cross-site':
            self.send_error(403)
            return
        try:
            data = read_goals(self.vault)
            status = 200
        except (OSError, UnicodeError):
            data = {'error': 'The goals note is unavailable. Check the vault path and note filename.'}
            status = 503
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--vault', type=Path, default=DEFAULT_VAULT)
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, vault=args.vault.expanduser().resolve()))
    print(f'Dashboard: http://127.0.0.1:{args.port} (Obsidian refreshes every 5 seconds)', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
