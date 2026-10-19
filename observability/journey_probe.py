#!/usr/bin/env python3
"""Synthetic, disposable user journey and Prometheus metrics endpoint."""
import json
import os
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

API = os.environ.get("API_URL", "http://localhost:8080").rstrip("/")
PORT = int(os.environ.get("METRICS_PORT", "9464"))
INTERVAL = max(5, int(os.environ.get("CHECK_INTERVAL_SECONDS", "30")))
EMAIL = f"obs-{secrets.token_hex(8)}@example.invalid"
PASSWORD = secrets.token_urlsafe(24)
lock = threading.Lock()
state = {"success": 0, "duration": 0.0, "runs": 0, "failures": 0, "last_success": 0}
token = None
forced_failure = False


def request(method, path, payload=None, auth=True):
    headers = {"Content-Type": "application/json"}
    if auth and token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(payload).encode() if payload is not None else None
    req = Request(API + path, data=body, headers=headers, method=method)
    with urlopen(req, timeout=8) as response:
        raw = response.read()
        return response.status, json.loads(raw) if raw else None


def run_journey():
    global token
    started = time.monotonic()
    ok = 0
    with lock:
        state["success"] = 0
    try:
        if token is None:
            _, auth = request("POST", "/api/v1/auth/register", {"email": EMAIL, "password": PASSWORD}, auth=False)
            token = auth["token"]
        _, note = request("POST", "/api/v1/notes", {
            "title": "Synthetic observability check",
            "content": "Disposable local monitoring demo record.",
            "contentText": "Disposable local monitoring demo record.",
            "tags": []
        })
        note_id = note["id"]
        request("GET", f"/api/v1/notes/{note_id}")
        request("DELETE", f"/api/v1/notes/{note_id}")
        ok = 1
    except (HTTPError, URLError, TimeoutError, KeyError, ValueError) as exc:
        # Keep log detail limited to error type and HTTP status; never log credentials,
        # tokens, request bodies, or note contents.
        status = getattr(exc, "code", None)
        print(json.dumps({"event": "synthetic_journey_failed", "error_type": type(exc).__name__, "http_status": status}), flush=True)
    finally:
        elapsed = time.monotonic() - started
        with lock:
            effective_ok = ok and not forced_failure
            state["success"] = int(effective_ok)
            state["duration"] = elapsed
            state["runs"] += 1
            state["failures"] += 0 if effective_ok else 1
            state["last_success"] = int(time.time()) if effective_ok else state["last_success"]
        if effective_ok:
            print(json.dumps({"event": "synthetic_journey_succeeded", "duration_seconds": round(elapsed, 3)}), flush=True)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/run":
            threading.Thread(target=run_journey, daemon=True).start()
            data = b'{"status":"journey_started"}'
            self.send_response(202)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if self.path != "/metrics":
            self.send_error(404)
            return
        with lock:
            snapshot = dict(state)
        body = ("# HELP knowledge_base_journey_success Whether the last synthetic journey passed.\n"
                "# TYPE knowledge_base_journey_success gauge\n"
                f"knowledge_base_journey_success {snapshot['success']}\n"
                "# HELP knowledge_base_journey_duration_seconds Duration of the last synthetic journey.\n"
                "# TYPE knowledge_base_journey_duration_seconds gauge\n"
                f"knowledge_base_journey_duration_seconds {snapshot['duration']:.6f}\n"
                "# HELP knowledge_base_journey_runs_total Number of synthetic journey runs.\n"
                "# TYPE knowledge_base_journey_runs_total counter\n"
                f"knowledge_base_journey_runs_total {snapshot['runs']}\n"
                "# HELP knowledge_base_journey_failures_total Number of failed synthetic journeys.\n"
                "# TYPE knowledge_base_journey_failures_total counter\n"
                f"knowledge_base_journey_failures_total {snapshot['failures']}\n"
                "# HELP knowledge_base_journey_last_success_timestamp_seconds Unix timestamp of last success.\n"
                "# TYPE knowledge_base_journey_last_success_timestamp_seconds gauge\n"
                f"knowledge_base_journey_last_success_timestamp_seconds {snapshot['last_success']}\n")
        data = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_):
        pass

    def do_POST(self):
        global forced_failure
        if self.path == "/simulate-failure":
            with lock:
                forced_failure = True
                state["success"] = 0
                state["failures"] += 1
            result = {"status": "synthetic_failure_injected"}
        elif self.path == "/recover":
            with lock:
                forced_failure = False
                state["success"] = 0
            threading.Thread(target=run_journey, daemon=True).start()
            result = {"status": "bounded_recovery_started"}
        else:
            self.send_error(404)
            return
        data = json.dumps(result).encode()
        self.send_response(202)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    threading.Thread(target=lambda: ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever(), daemon=True).start()
    while True:
        run_journey()
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
