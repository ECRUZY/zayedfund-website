"""Local content editor. Start via the macOS launcher at the site root."""
import base64
import fcntl
import hashlib
import json
import math
import mimetypes
import os
import re
import secrets
import subprocess
import tempfile
import threading
import time
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

import build

SRC = Path(__file__).resolve().parent
ROOT = SRC.parent
DATA = SRC / 'data'
IMAGES = ROOT / 'assets/img/projects'
PAGES = {'home': ['index.html'], 'projects': ['projects.html'],
         'programs': ['index.html', 'funding.html', 'calculator.html']}
LIMIT = 5 * 1024 * 1024


class Conflict(Exception):
    pass


def revision():
    digest = hashlib.sha256()
    for kind in PAGES:
        digest.update((DATA / (kind + '.json')).read_bytes())
    return digest.hexdigest()


def content():
    return {**{k: build._data(k + '.json') for k in PAGES}, 'revision': revision(),
            'photos': sorted(str(p.relative_to(ROOT)) for p in IMAGES.rglob('*')
                             if p.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp'} and p.is_file())}


def string(value, label, size=5000, required=True):
    if not isinstance(value, str) or len(value.strip()) > size or (required and not value.strip()):
        raise ValueError('Проверьте поле «' + label + '».')
    return value.strip()


def photo(value):
    value = string(value, 'Фотография', LIMIT)
    if value.startswith('data:image/jpeg;base64,'):
        raw = base64.b64decode(value.split(',', 1)[1], validate=True)
        if not raw.startswith(b'\xff\xd8\xff'):
            raise ValueError('Выберите фотографию JPEG, PNG или WebP.')
        # Re-encode the browser-resized photo before placing it among public assets.
        with tempfile.TemporaryDirectory() as tmp:
            src, dst = Path(tmp, 'input.jpg'), Path(tmp, 'image.jpg')
            src.write_bytes(raw)
            result = subprocess.run(['/usr/bin/sips', '-s', 'format', 'jpeg', '-Z', '1600',
                                     str(src), '--out', str(dst)], capture_output=True, timeout=15)
            if result.returncode or not dst.is_file():
                raise ValueError('Не удалось обработать фотографию.')
            image = dst.read_bytes()
        dest = IMAGES / ('photo-' + hashlib.sha256(image).hexdigest() + '.jpg')
        if not dest.exists():
            atomic(dest, image)
        return str(dest.relative_to(ROOT))
    target = (ROOT / value).resolve()
    if IMAGES not in target.parents or not target.is_file() or target.suffix.lower() not in {'.jpg','.jpeg','.png','.webp'}:
        raise ValueError('Выберите фотографию из библиотеки или с компьютера.')
    return str(target.relative_to(ROOT))


def atomic(path, raw):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temp:
        temp.write(raw)
    try:
        os.chmod(temp.name, 0o644)
        os.replace(temp.name, path)
    finally:
        Path(temp.name).unlink(missing_ok=True)


def update(kind, data, request):
    fields = request['fields']
    if not isinstance(fields, dict):
        raise ValueError('Некорректные поля.')
    if kind == 'home':
        group = data[request['id']]
        if set(fields) != set(group):
            raise ValueError('Обновите страницу панели.')
        for key, field in group.items():
            field['value'] = photo(fields[key]) if field['kind'] == 'photo' else string(fields[key], field['label'])
        return
    item_id = request.get('id')
    item = next((row for row in data if row['id'] == item_id), None)
    if item_id is not None and item is None:
        raise ValueError('Запись не найдена.')
    if kind == 'projects':
        values = {k: string(fields[k], label, 250) for k, label in [('title','Название'), ('category','Отрасль')]}
        values['text'] = [s.strip() for s in string(fields['text'], 'Описание', 30000).splitlines() if s.strip()]
        values['photo'] = photo(fields['photo'])
        if item is None:
            item = {'id': max((p['id'] for p in data), default=0) + 1, 'date': datetime.now().strftime('%d.%m.%Y')}
            data.insert(0, item)
    else:
        values = {k: string(fields[k], k, 5000 if k == 'description' else 400, required=k != 'districts')
                  for k in ['title','tag','description','markup','duration','holiday','pledge','districts']}
        for key, low, high in [('rate',0,100), ('grace',0,12), ('term',1,60)]:
            try:
                v = float(fields[key]) if key == 'rate' else int(str(fields[key]))
            except (TypeError, ValueError):
                raise ValueError('Проверьте числовые параметры калькулятора.')
            if not math.isfinite(v) or not low <= v <= high:
                raise ValueError('Параметры калькулятора вне допустимого диапазона.')
            values[key] = v
        if item is None:
            item = {'id': 'program-' + secrets.token_hex(8)}
            data.append(item)
    item.update(values)


def publish(request):
    kind = request['kind']
    if kind not in PAGES:
        raise ValueError('Неизвестный раздел.')
    if request.get('revision') != revision():
        raise Conflict()
    path = DATA / (kind + '.json')
    before = path.read_bytes()
    data = json.loads(before)
    update(kind, data, request)
    backup = SRC / 'backups' / kind
    backup.mkdir(parents=True, exist_ok=True)
    snapshot = backup / (datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.json')
    snapshot.write_bytes(before)
    originals = {ROOT / name: (ROOT / name).read_bytes() for name in PAGES[kind]}
    replaced = []
    try:
        atomic(path, (json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode())
        rendered = {name: build.render(name).encode() for name in PAGES[kind]}
        for name, raw in rendered.items():
            target = ROOT / name
            atomic(target, raw)
            replaced.append(target)
    except Exception:
        atomic(path, before)
        for target in replaced:
            atomic(target, originals[target])
        raise


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, body, mime='application/json; charset=utf-8', cookie=None):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        for key, value in [('Content-Type', mime), ('Content-Length', str(len(body))), ('Cache-Control','no-store'),
                           ('X-Content-Type-Options','nosniff'), ('X-Frame-Options','DENY'), ('Referrer-Policy','no-referrer')]:
            self.send_header(key, value)
        if self.path.startswith('/admin'):
            self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(body)

    def local(self):
        return self.headers.get('Host') == self.server.address

    def authorized(self):
        cookies = self.headers.get('Cookie', '').split(';')
        return time.monotonic() < self.server.expires and any(
            secrets.compare_digest(c.strip().encode(), (self.server.cookie_name + '=' + self.server.session).encode()) for c in cookies)

    def do_GET(self):
        if not self.local():
            return self.reply(403, {})
        path = urlsplit(self.path).path
        if path == '/admin/data':
            if not self.authorized():
                return self.reply(401, {})
            with self.server.lock, (SRC / '.publish.lock').open('a') as lock:
                fcntl.flock(lock, fcntl.LOCK_SH)
                return self.reply(200, content())
        if path == '/admin/':
            self.send_response(302)
            self.send_header('Location', '/admin.html')
            self.end_headers()
            return
        elif re.fullmatch(r'/[a-z-]+\.html', path):
            target = ROOT / path[1:]
        elif path.startswith('/assets/') and (ROOT / 'assets') in (ROOT / path[1:]).resolve().parents:
            target = (ROOT / path[1:]).resolve()
        else:
            return self.reply(404, {})
        if not target.is_file():
            return self.reply(404, {})
        self.reply(200, target.read_bytes(), mimetypes.guess_type(target)[0] or 'application/octet-stream')

    def do_POST(self):
        if not self.local() or self.headers.get('Origin') != 'http://' + self.server.address:
            return self.reply(403, {})
        if self.headers.get_content_type() != 'application/json':
            return self.reply(415, {})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= LIMIT:
                return self.reply(413, {'error':'Слишком большой файл.'})
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                return self.reply(400, {})
            with self.server.lock:
                if self.path == '/admin/login':
                    token = data.get('token')
                    if not isinstance(token, str) or not any(secrets.compare_digest(token.encode(), key.encode())
                                                              for key in (self.server.token, self.server.access_code) if key):
                        return self.reply(401, {})
                    self.server.token = None
                    self.server.expires = time.monotonic() + 8 * 3600
                    return self.reply(200, {}, cookie=self.server.cookie_name + '=' + self.server.session + '; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=28800')
                if not self.authorized():
                    return self.reply(401, {})
                if self.path != '/admin/save':
                    return self.reply(404, {})
                with (SRC / '.publish.lock').open('a') as lock:
                    fcntl.flock(lock, fcntl.LOCK_EX)
                    publish(data)
                    return self.reply(200, content())
        except Conflict:
            self.reply(409, {'error':'Данные уже изменились в другом окне. Скопируйте свои правки и обновите панель.'})
        except (KeyError, TypeError, ValueError) as err:
            self.reply(422, {'error': str(err) if isinstance(err, ValueError) else 'Проверьте поля формы.'})
        except (OSError, subprocess.SubprocessError):
            self.reply(500, {'error':'Не удалось записать изменения. Проверьте доступ к папке сайта.'})


def serve():
    server = ThreadingHTTPServer(('127.0.0.1', 18769), Handler)
    server.address = '127.0.0.1:' + str(server.server_port)
    server.cookie_name = 'zf_session_' + str(server.server_port)
    server.lock = threading.Lock()
    server.session = secrets.token_urlsafe(32)
    server.token = secrets.token_urlsafe(32)
    server.expires = 0
    private_dir = Path.home() / 'Library/Application Support/ZayedFund'
    private_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.NamedTemporaryFile(dir=private_dir, mode='w', delete=False) as key_file:
        key_file.write(secrets.token_urlsafe(24))
    os.replace(key_file.name, private_dir / 'admin-code.txt')
    server.access_code = (private_dir / 'admin-code.txt').read_text()
    webbrowser.open('http://' + server.address + '/admin.html#' + server.token)
    print('Панель открыта в браузере. Для завершения закройте это окно или нажмите Ctrl+C.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    serve()
