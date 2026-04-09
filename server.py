import json
import os
import secrets
import sqlite3
import hashlib
import base64
import mimetypes
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "todo.db")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
HOST = "0.0.0.0"
PORT = 8001


def now_iso():
    return datetime.utcnow().isoformat()


def connect_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = connect_db()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            pass_salt TEXT NOT NULL,
            pass_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS board_users (
            id TEXT PRIMARY KEY,
            owner_user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            owner_user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            deadline TEXT,
            assignee_id TEXT,
            status TEXT NOT NULL,
            done INTEGER NOT NULL,
            comments_json TEXT NOT NULL,
            attachments_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def hash_passphrase(passphrase, salt_hex):
    salt = bytes.fromhex(salt_hex)
    digest = hashlib.pbkdf2_hmac("sha256", passphrase.encode("utf-8"), salt, 100000)
    return digest.hex()


def verify_passphrase(passphrase, salt_hex, expected_hex):
    return secrets.compare_digest(hash_passphrase(passphrase, salt_hex), expected_hex)


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def parse_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def get_auth_user_id(self):
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return None
        token = auth.replace("Bearer ", "", 1).strip()
        if not token:
            return None
        conn = connect_db()
        row = conn.execute("SELECT user_id FROM sessions WHERE token = ?", (token,)).fetchone()
        conn.close()
        return row["user_id"] if row else None

    def require_auth(self):
        user_id = self.get_auth_user_id()
        if not user_id:
            self.send_json(401, {"error": "Unauthorized"})
            return None
        return user_id

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/auth/login":
            return self.handle_login()
        if parsed.path == "/api/auth/logout":
            return self.handle_logout()
        if parsed.path == "/api/users":
            return self.handle_create_board_user()
        if parsed.path == "/api/tasks":
            return self.handle_create_task()
        if parsed.path == "/api/uploads/audio":
            return self.handle_upload_audio()
        if parsed.path.startswith("/api/tasks/clear/"):
            return self.handle_clear_tasks_by_status(parsed.path.split("/")[-1])
        self.send_json(404, {"error": "Not found"})

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/users":
            return self.handle_list_board_users()
        if parsed.path == "/api/tasks":
            return self.handle_list_tasks()
        if parsed.path.startswith("/api/"):
            return self.send_json(404, {"error": "Not found"})
        return self.serve_static(parsed.path)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/users/"):
            return self.handle_delete_board_user(parsed.path.split("/")[-1])
        if parsed.path.startswith("/api/tasks/"):
            return self.handle_delete_task(parsed.path.split("/")[-1])
        self.send_json(404, {"error": "Not found"})

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/tasks/"):
            return self.handle_update_task(parsed.path.split("/")[-1])
        self.send_json(404, {"error": "Not found"})

    def handle_login(self):
        body = self.parse_body()
        username = str(body.get("username", "")).strip()
        passphrase = str(body.get("passphrase", "")).strip()
        if not username or not passphrase:
            return self.send_json(400, {"error": "Нужно имя и кодовое слово"})

        conn = connect_db()
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if row:
            if not verify_passphrase(passphrase, row["pass_salt"], row["pass_hash"]):
                conn.close()
                return self.send_json(403, {"error": "Неверное кодовое слово"})
            user_id = row["id"]
        else:
            user_id = secrets.token_hex(16)
            salt = secrets.token_hex(16)
            phash = hash_passphrase(passphrase, salt)
            conn.execute(
                "INSERT INTO users (id, username, pass_salt, pass_hash, created_at) VALUES (?, ?, ?, ?, ?)",
                (user_id, username, salt, phash, now_iso()),
            )
            member_id = secrets.token_hex(16)
            conn.execute(
                "INSERT INTO board_users (id, owner_user_id, name, created_at) VALUES (?, ?, ?, ?)",
                (member_id, user_id, username, now_iso()),
            )

        token = secrets.token_urlsafe(32)
        conn.execute("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", (token, user_id, now_iso()))
        conn.commit()
        conn.close()
        self.send_json(200, {"token": token, "username": username})

    def handle_logout(self):
        auth = self.headers.get("Authorization", "")
        token = auth.replace("Bearer ", "", 1).strip() if auth.startswith("Bearer ") else ""
        if token:
            conn = connect_db()
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
            conn.close()
        self.send_json(200, {"ok": True})

    def handle_list_board_users(self):
        user_id = self.require_auth()
        if not user_id:
            return
        conn = connect_db()
        rows = conn.execute("SELECT id, name FROM board_users WHERE owner_user_id = ? ORDER BY created_at DESC", (user_id,)).fetchall()
        conn.close()
        self.send_json(200, [{"id": r["id"], "name": r["name"]} for r in rows])

    def handle_create_board_user(self):
        user_id = self.require_auth()
        if not user_id:
            return
        body = self.parse_body()
        name = str(body.get("name", "")).strip()
        if not name:
            return self.send_json(400, {"error": "Имя пользователя пустое"})
        member_id = secrets.token_hex(16)
        conn = connect_db()
        conn.execute(
            "INSERT INTO board_users (id, owner_user_id, name, created_at) VALUES (?, ?, ?, ?)",
            (member_id, user_id, name, now_iso()),
        )
        conn.commit()
        conn.close()
        self.send_json(201, {"id": member_id, "name": name})

    def handle_delete_board_user(self, member_id):
        user_id = self.require_auth()
        if not user_id:
            return
        conn = connect_db()
        conn.execute("DELETE FROM board_users WHERE id = ? AND owner_user_id = ?", (member_id, user_id))
        conn.execute("UPDATE tasks SET assignee_id = NULL, updated_at = ? WHERE owner_user_id = ? AND assignee_id = ?", (now_iso(), user_id, member_id))
        conn.commit()
        conn.close()
        self.send_json(200, {"ok": True})

    def handle_list_tasks(self):
        user_id = self.require_auth()
        if not user_id:
            return
        conn = connect_db()
        rows = conn.execute("SELECT * FROM tasks WHERE owner_user_id = ? ORDER BY created_at DESC", (user_id,)).fetchall()
        conn.close()
        tasks = []
        for r in rows:
            tasks.append(
                {
                    "id": r["id"],
                    "title": r["title"],
                    "description": r["description"] or "",
                    "deadline": r["deadline"],
                    "assigneeId": r["assignee_id"],
                    "status": r["status"],
                    "done": bool(r["done"]),
                    "comments": json.loads(r["comments_json"]),
                    "attachments": json.loads(r["attachments_json"]),
                }
            )
        self.send_json(200, tasks)

    def handle_create_task(self):
        user_id = self.require_auth()
        if not user_id:
            return
        body = self.parse_body()
        title = str(body.get("title", "")).strip()
        if not title:
            return self.send_json(400, {"error": "Название обязательно"})
        task_id = secrets.token_hex(16)
        now = now_iso()
        conn = connect_db()
        conn.execute(
            """
            INSERT INTO tasks (
                id, owner_user_id, title, description, deadline, assignee_id,
                status, done, comments_json, attachments_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                user_id,
                title,
                body.get("description", ""),
                body.get("deadline"),
                body.get("assigneeId"),
                body.get("status", "todo"),
                1 if body.get("done") else 0,
                json.dumps(body.get("comments", [])),
                json.dumps(body.get("attachments", [])),
                now,
                now,
            ),
        )
        conn.commit()
        conn.close()
        self.send_json(201, {"id": task_id})

    def handle_update_task(self, task_id):
        user_id = self.require_auth()
        if not user_id:
            return
        body = self.parse_body()
        title = str(body.get("title", "")).strip()
        if not title:
            return self.send_json(400, {"error": "Название обязательно"})
        conn = connect_db()
        conn.execute(
            """
            UPDATE tasks SET
                title = ?, description = ?, deadline = ?, assignee_id = ?,
                status = ?, done = ?, comments_json = ?, attachments_json = ?, updated_at = ?
            WHERE id = ? AND owner_user_id = ?
            """,
            (
                title,
                body.get("description", ""),
                body.get("deadline"),
                body.get("assigneeId"),
                body.get("status", "todo"),
                1 if body.get("done") else 0,
                json.dumps(body.get("comments", [])),
                json.dumps(body.get("attachments", [])),
                now_iso(),
                task_id,
                user_id,
            ),
        )
        conn.commit()
        conn.close()
        self.send_json(200, {"ok": True})

    def handle_delete_task(self, task_id):
        user_id = self.require_auth()
        if not user_id:
            return
        conn = connect_db()
        conn.execute("DELETE FROM tasks WHERE id = ? AND owner_user_id = ?", (task_id, user_id))
        conn.commit()
        conn.close()
        self.send_json(200, {"ok": True})

    def handle_clear_tasks_by_status(self, status):
        user_id = self.require_auth()
        if not user_id:
            return
        allowed = {"todo", "in-progress", "done"}
        if status not in allowed:
            return self.send_json(400, {"error": "Некорректный статус"})
        conn = connect_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM tasks WHERE owner_user_id = ? AND status = ?", (user_id, status))
        deleted = cur.rowcount
        conn.commit()
        conn.close()
        self.send_json(200, {"ok": True, "deleted": deleted})

    def handle_upload_audio(self):
        user_id = self.require_auth()
        if not user_id:
            return
        body = self.parse_body()
        data_url = str(body.get("dataUrl", ""))
        mime_type = str(body.get("mimeType", "audio/webm"))
        if not data_url.startswith("data:") or "," not in data_url:
            return self.send_json(400, {"error": "Некорректные аудио данные"})

        _, b64_data = data_url.split(",", 1)
        try:
            raw = base64.b64decode(b64_data)
        except Exception:
            return self.send_json(400, {"error": "Не удалось декодировать аудио"})

        ext = ".webm"
        if "ogg" in mime_type:
            ext = ".ogg"
        elif "mp4" in mime_type:
            ext = ".m4a"

        user_dir = os.path.join(UPLOADS_DIR, user_id)
        os.makedirs(user_dir, exist_ok=True)
        fname = f"{secrets.token_hex(12)}{ext}"
        full = os.path.join(user_dir, fname)
        with open(full, "wb") as f:
            f.write(raw)

        rel_url = f"/uploads/{user_id}/{fname}"
        self.send_json(201, {"url": rel_url})

    def serve_static(self, path):
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        full = os.path.abspath(os.path.join(BASE_DIR, rel))
        if not full.startswith(os.path.abspath(BASE_DIR)):
            self.send_response(403)
            self.end_headers()
            return
        if not os.path.isfile(full):
            full = os.path.join(BASE_DIR, "index.html")
            if not os.path.isfile(full):
                self.send_response(404)
                self.end_headers()
                return
        content_type = mimetypes.guess_type(full)[0] or "text/plain; charset=utf-8"
        if full.endswith(".html"):
            content_type = "text/html; charset=utf-8"
        if full.endswith(".css"):
            content_type = "text/css; charset=utf-8"
        if full.endswith(".js"):
            content_type = "application/javascript; charset=utf-8"
        if full.endswith(".webmanifest"):
            content_type = "application/json; charset=utf-8"

        with open(full, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run():
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    init_db()
    server = HTTPServer((HOST, PORT), Handler)
    print(f"Server running on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    run()
