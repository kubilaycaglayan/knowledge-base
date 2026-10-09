#!/usr/bin/env python3
"""Redact account credentials and identifiers from a Playwright trace ZIP."""

import json
import os
import re
import sys
import tempfile
import zipfile

trace_path = sys.argv[1]
sensitive_keys = {"authorization", "cookie", "set_cookie", "password", "email", "token", "access_token", "refresh_token"}
credential = re.compile(r"(?i)\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*")
email = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")


def sensitive(key):
    normalized = key.lower().replace("-", "_")
    return normalized in sensitive_keys or normalized.endswith("_token")


def redact(value, key=""):
    if sensitive(key):
        return "[REDACTED]"
    if isinstance(value, dict):
        header_name = str(value.get("name", "")).lower()
        if sensitive(header_name) and "value" in value:
            return {child_key: ("[REDACTED]" if child_key == "value" else redact(child, child_key)) for child_key, child in value.items()}
        return {child_key: redact(child, child_key) for child_key, child in value.items()}
    if isinstance(value, list):
        if key.lower() == "cookies":
            return [{child_key: ("[REDACTED]" if child_key == "value" else redact(child, child_key)) for child_key, child in item.items()} if isinstance(item, dict) else redact(item) for item in value]
        return [redact(child) for child in value]
    if isinstance(value, str):
        return email.sub("[REDACTED_ACCOUNT]", credential.sub("[REDACTED_CREDENTIAL]", value))
    return value


directory = os.path.dirname(os.path.abspath(trace_path))
fd, temporary_path = tempfile.mkstemp(prefix="trace-scrub-", suffix=".zip", dir=directory)
os.close(fd)
try:
    with zipfile.ZipFile(trace_path, "r") as source, zipfile.ZipFile(temporary_path, "w", compression=zipfile.ZIP_DEFLATED) as target:
        for entry in source.infolist():
            content = source.read(entry.filename)
            try:
                decoded = content.decode("utf-8")
            except UnicodeDecodeError:
                target.writestr(entry, content)
                continue
            redacted_lines = []
            for line in decoded.splitlines(keepends=True):
                try:
                    parsed = json.loads(line)
                except json.JSONDecodeError:
                    cleaned = email.sub("[REDACTED_ACCOUNT]", credential.sub("[REDACTED_CREDENTIAL]", line))
                    redacted_lines.append(cleaned)
                else:
                    redacted_lines.append(json.dumps(redact(parsed), ensure_ascii=False, separators=(",", ":")) + ("\n" if line.endswith("\n") else ""))
            target.writestr(entry, "".join(redacted_lines).encode("utf-8"))
    os.replace(temporary_path, trace_path)
except BaseException:
    try:
        os.unlink(temporary_path)
    except FileNotFoundError:
        pass
    raise
