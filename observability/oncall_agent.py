#!/usr/bin/env python3
"""Local alert receiver that triages incidents and reruns the user journey."""
import json
import os
import smtplib
import ssl
import time
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen

API = os.environ.get("API_URL", "http://api:8080").rstrip("/")
PROBE = os.environ.get("PROBE_URL", "http://api-journey:9464").rstrip("/")
PORT = int(os.environ.get("ALERT_PORT", "8081"))
ON_CALL_EMAIL = os.environ.get("ON_CALL_AGENT_EMAIL", "").strip()
processed_fingerprints = set()


def get(url):
    with urlopen(url, timeout=5) as response:
        return response.status, response.read().decode("utf-8", "replace")


def post(url):
    request = Request(url, data=b"{}", headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(request, timeout=5) as response:
        return response.status, response.read().decode("utf-8", "replace")


def send_email(event):
    if not ON_CALL_EMAIL:
        return "not_configured"
    host = os.environ.get("SMTP_HOST", "").strip()
    sender = os.environ.get("SMTP_FROM", "").strip()
    if not host or not sender:
        return "not_sent_missing_smtp_host_or_from"
    if any(char in value for value in ("\r", "\n") for value in (ON_CALL_EMAIL, sender)):
        return "not_sent_invalid_email_header"

    try:
        port = int(os.environ.get("SMTP_PORT", "587"))
    except ValueError:
        return "not_sent_invalid_smtp_port"
    timeout = 10
    username = os.environ.get("SMTP_USERNAME", "")
    password = os.environ.get("SMTP_PASSWORD", "")
    if bool(username) != bool(password):
        return "not_sent_incomplete_smtp_credentials"
    try:
        message = EmailMessage()
        message["From"] = sender
        message["To"] = ON_CALL_EMAIL
        message["Subject"] = "Knowledge Base on-call: " + ", ".join(event["alert_names"])
        message.set_content(
            "Knowledge Base local observability alert\n\n"
            f"Alert(s): {', '.join(event['alert_names'])}\n"
            f"API health: {event['api_health']}\n"
            f"Responder action: {event['action']}\n"
            f"Resolution: {event['resolution']}\n"
        )
        if os.environ.get("SMTP_USE_SSL", "false").lower() in ("1", "true", "yes"):
            with smtplib.SMTP_SSL(host, port, timeout=timeout, context=ssl.create_default_context()) as smtp:
                if username:
                    smtp.login(username, password)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=timeout) as smtp:
                smtp.ehlo()
                if os.environ.get("SMTP_STARTTLS", "true").lower() in ("1", "true", "yes"):
                    smtp.starttls(context=ssl.create_default_context())
                    smtp.ehlo()
                if username:
                    smtp.login(username, password)
                smtp.send_message(message)
        return "sent"
    except Exception as exc:
        # Do not log server responses or addresses; they can contain private data.
        print(json.dumps({"event": "oncall_email_delivery_failed", "error_type": type(exc).__name__}), flush=True)
        return "failed"


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/alert":
            self.send_error(404)
            return
        length = min(int(self.headers.get("Content-Length", "0")), 65536)
        try:
            payload = json.loads(self.rfile.read(length))
            alerts = payload.get("alerts", [])
            active = [a for a in alerts if a.get("status") == "firing"]
            if not active:
                for alert in alerts:
                    processed_fingerprints.discard(alert.get("fingerprint"))
                self.send_response(202)
                self.end_headers()
                return
            fresh = [
                alert for alert in active
                if alert.get("fingerprint", alert.get("labels", {}).get("alertname", "unknown"))
                not in processed_fingerprints
            ]
            if not fresh:
                self.send_response(200)
                self.end_headers()
                return
            for alert in fresh:
                processed_fingerprints.add(
                    alert.get("fingerprint", alert.get("labels", {}).get("alertname", "unknown"))
                )
            try:
                code, body = get(API + "/actuator/health")
                api_state = "healthy" if code == 200 and '"status":"UP"' in body.replace(" ", "") else "unhealthy"
            except Exception as exc:
                api_state = f"unreachable ({type(exc).__name__})"
            # A bounded demo remediation: clear only the probe's synthetic fault,
            # then confirm with one end-to-end journey. No application data is changed.
            try:
                post(PROBE + "/recover")
                action = "cleared demo-only synthetic fault and started verification"
                for _ in range(10):
                    time.sleep(1)
                    _, metrics = get(PROBE + "/metrics")
                    if "knowledge_base_journey_success 1" in metrics:
                        action = "cleared demo-only synthetic fault; journey recovery confirmed"
                        break
                else:
                    action = "journey verification failed; human intervention required"
            except Exception as exc:
                action = f"retry failed ({type(exc).__name__}); human intervention required"
            event = {
                "event": "oncall_alert_triaged",
                "alert_names": [
                    str(a.get("labels", {}).get("alertname", "unknown")).replace("\r", " ").replace("\n", " ")[:120]
                    for a in fresh
                ],
                "api_health": api_state,
                "action": action,
                "resolution": "recovery confirmed" if "recovery confirmed" in action else "escalate to operator",
            }
            event["email_status"] = send_email(event)
            print(json.dumps(event), flush=True)
            data = json.dumps(event).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (ValueError, json.JSONDecodeError):
            self.send_error(400)

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
