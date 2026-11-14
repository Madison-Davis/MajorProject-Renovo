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

VOYAGE_FILE = ROOT / 'voyage' / 'public' / 'data.json'
VOYAGE_LOCK = Lock()


def read_places():
    if not VOYAGE_FILE.exists():
        return {'places': []}
    data = json.loads(VOYAGE_FILE.read_text(encoding='utf-8'))
    if not isinstance(data, dict) or not isinstance(data.get('places', []), list):
        raise ValueError('Invalid Voyage data file')
    return data


def save_places(places):
    if not isinstance(places, list) or len(places) > 10000:
        raise ValueError('Expected a list of places')
    for place in places:
        if not isinstance(place, dict) or any(not isinstance(place.get(key), str) or not place[key].strip() for key in ('id', 'title', 'date')):
            raise ValueError('Each place needs an id, title, and date')
        if place.get('category') not in ('event', 'restaurant') or place.get('seed') or place['id'].startswith('seed-'):
            raise ValueError('Invalid place category or starter example')
        for key, limit in (('lat', 90), ('lng', 180)):
            value = place.get(key)
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not -limit <= value <= limit:
                raise ValueError('Invalid coordinates')
    with VOYAGE_LOCK:
        data = read_places()
        merged = {place['id']: place for place in data.get('places', [])}
        merged.update({place['id']: place for place in places})
        data['places'] = list(merged.values())
        VOYAGE_FILE.parent.mkdir(parents=True, exist_ok=True)
        filename = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=VOYAGE_FILE.parent, delete=False) as output:
                filename = output.name
                json.dump(data, output, indent=2, ensure_ascii=False, allow_nan=False)
                output.write('\n')
            os.replace(filename, VOYAGE_FILE)
        finally:
            if filename and os.path.exists(filename):
                os.unlink(filename)
        return data['places']


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
        if urlsplit(self.path).path != '/api/voyage/places':
            self.send_error(404)
            return
        origin = self.headers.get('Origin')
        if self.headers.get('Sec-Fetch-Site') == 'cross-site' or (origin and origin != 'http://' + self.headers.get('Host', '')):
            self.send_error(403)
            return
        if self.headers.get_content_type() != 'application/json':
            self.json_response({'error': 'Expected JSON'}, 415)
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 5_000_000:
                raise ValueError('Invalid request size')
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError('Expected an object')
            places = save_places(payload.get('places'))
            self.json_response({'places': places})
        except (ValueError, UnicodeError) as error:
            self.json_response({'error': str(error)}, 400)
        except OSError:
            self.json_response({'error': 'Could not save Voyage data'}, 500)

    def do_GET(self):
        if urlsplit(self.path).path == '/api/voyage/places':
            try:
                self.json_response({'places': read_places().get('places', [])})
            except (OSError, ValueError):
                self.json_response({'error': 'Could not read Voyage data'}, 500)
            return
        if urlsplit(self.path).path != '/api/obsidian/goals':
            # Serve only the dashboard's public assets, never repository files.
            if urlsplit(self.path).path not in ('/', '/index.html', '/app.js', '/styles.css', '/compaulo-theme.css', '/voyage/config.js', '/voyage/store.js'):
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
