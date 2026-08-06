#!/usr/bin/env python3
"""Deterministic HTTP stub for the NAV vacancy feed contract.

The server is intentionally dependency-free so `just verify` can exercise the
real Worker Fetch adapter without depending on NAV availability.
"""

from __future__ import annotations

import argparse
import base64
import json
import threading
import time
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


def b64url(payload: dict[str, object]) -> str:
    raw = json.dumps(payload, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


PUBLIC_TOKEN = ".".join(
    [
        b64url({"alg": "none", "typ": "JWT"}),
        b64url({"sub": "job-index-nav-stub", "exp": 4_102_444_800}),
        "stub-signature",
    ]
)


@dataclass
class StubState:
    scenario: str = "happy"
    requests: int = 0
    feed_requests: int = 0
    detail_requests: int = 0
    token_requests: int = 0
    webhook_requests: int = 0
    webhook_payloads: list[dict[str, object]] = field(default_factory=list)
    webhook_headers: list[dict[str, str]] = field(default_factory=list)
    webhook_raw: list[str] = field(default_factory=list)
    last_if_none_match: str | None = None
    last_if_modified_since: str | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)

    def reset(self, scenario: str) -> None:
        with self.lock:
            self.scenario = scenario
            self.requests = 0
            self.feed_requests = 0
            self.detail_requests = 0
            self.token_requests = 0
            self.webhook_requests = 0
            self.webhook_payloads = []
            self.webhook_headers = []
            self.webhook_raw = []
            self.last_if_none_match = None
            self.last_if_modified_since = None

    def snapshot(self) -> dict[str, object]:
        with self.lock:
            return {
                "scenario": self.scenario,
                "requests": self.requests,
                "feed_requests": self.feed_requests,
                "detail_requests": self.detail_requests,
                "token_requests": self.token_requests,
                "webhook_requests": self.webhook_requests,
                "webhook_payloads": list(self.webhook_payloads),
                "webhook_headers": list(self.webhook_headers),
                "webhook_raw": list(self.webhook_raw),
                "last_if_none_match": self.last_if_none_match,
                "last_if_modified_since": self.last_if_modified_since,
            }


STATE = StubState()


def feed_item(
    external_id: str,
    *,
    active: bool = True,
    title: str = "Technical Support Specialist",
    employer: str = "Stub Technology AS",
    municipal: str = "Oslo",
    modified: str = "2026-08-05T20:00:00Z",
) -> dict[str, object]:
    return {
        "id": f"entry-{external_id}",
        "url": f"/api/v1/feedentry/{external_id}",
        "title": title if active else "",
        "content_text": "Help customers use technical products." if active else "",
        "date_modified": modified,
        "_feed_entry": {
            "uuid": external_id,
            "status": "ACTIVE" if active else "INACTIVE",
            "title": title if active else "",
            "businessName": employer if active else "",
            "municipal": municipal,
            "sistEndret": modified,
        },
    }


def detail(external_id: str, *, updated: bool = False) -> dict[str, object]:
    changed = " and improve our support documentation" if updated else ""
    # Envelope, HTML body, and free-text application deadline all mirror what
    # the live feed serves. The stub exists to catch drift from that shape, so
    # it may only diverge where a scenario deliberately says so.
    return {
        "uuid": external_id,
        "status": "ACTIVE",
        "sistEndret": "2026-08-05T21:00:00Z" if updated else "2026-08-05T20:00:00Z",
        "ad_content": {
            "uuid": external_id,
            "published": "2026-08-05T19:45:00Z",
            "expires": "2026-08-25T23:59:59Z",
            "updated": "2026-08-05T21:00:00Z" if updated else "2026-08-05T20:00:00Z",
            "workLocations": [
                {
                    "country": "NORGE",
                    "address": "Stub gate 1",
                    "city": "Oslo",
                    "postalCode": "0001",
                    "county": "Oslo",
                    "municipal": "Oslo",
                }
            ],
            "title": "Technical Support Specialist",
            "description": (
                f"<section id=\"arb-main\"><p>Help customers use technical"
                f" products{changed}.</p></section>"
            ),
            "applicationUrl": f"https://careers.example/jobs/{external_id}?utm_source=nav-stub",
            "applicationDue": "Snarest",
            "employer": {"name": "Stub Technology AS"},
        },
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "JobIndexNavStub/1"
    # The Worker runtime under test speaks HTTP/1.1. The stdlib default of
    # HTTP/1.0 answers every request with a close-delimited response, which the
    # runtime reports as a lost connection instead of a delivered webhook.
    protocol_version = "HTTP/1.1"

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def do_GET(self) -> None:  # noqa: N802 - stdlib handler contract
        parsed = urlparse(self.path)
        with STATE.lock:
            STATE.requests += 1
        if parsed.path == "/__health":
            return self.send_json({"status": "ok"})
        if parsed.path == "/__state":
            return self.send_json(STATE.snapshot())
        if parsed.path == "/__webhooks":
            return self.send_json({
                "requests": STATE.snapshot()["webhook_requests"],
                "payloads": STATE.snapshot()["webhook_payloads"],
                "headers": STATE.snapshot()["webhook_headers"],
                "raw": STATE.snapshot()["webhook_raw"],
            })
        if parsed.path == "/api/publicToken":
            with STATE.lock:
                STATE.token_requests += 1
                scenario = STATE.scenario
            if scenario == "token_error":
                return self.send_text("temporarily unavailable", HTTPStatus.SERVICE_UNAVAILABLE)
            return self.send_text(
                f"Current public token for Nav Job Vacancy Feed:\n{PUBLIC_TOKEN}\n"
            )
        if parsed.path == "/api/v1/feed":
            return self.handle_feed(parse_qs(parsed.query))
        if parsed.path.startswith("/api/v1/feedentry/"):
            external_id = parsed.path.rsplit("/", 1)[-1]
            return self.handle_detail(external_id)
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802 - stdlib handler contract
        parsed = urlparse(self.path)
        length = int(self.headers.get("content-length", "0"))
        raw = self.rfile.read(length) or b"{}"
        if parsed.path == "/webhook":
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                self.send_json({"error": "invalid JSON"}, HTTPStatus.BAD_REQUEST)
                return
            with STATE.lock:
                STATE.webhook_requests += 1
                STATE.webhook_payloads.append(payload)
                STATE.webhook_headers.append({
                    "signature": self.headers.get("x-job-index-signature", ""),
                    "event_id": self.headers.get("x-job-index-event-id", ""),
                })
                STATE.webhook_raw.append(raw.decode("utf-8"))
                scenario = STATE.scenario
            if scenario == "webhook_fail":
                self.send_text("webhook failure", HTTPStatus.SERVICE_UNAVAILABLE)
            else:
                self.send_response(HTTPStatus.NO_CONTENT)
                self.end_headers()
            return
        if parsed.path != "/__control":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            self.send_json({"error": "invalid JSON"}, HTTPStatus.BAD_REQUEST)
            return
        scenario = str(payload.get("scenario", "happy"))
        STATE.reset(scenario)
        self.send_json(STATE.snapshot())

    def handle_feed(self, query: dict[str, list[str]]) -> None:
        with STATE.lock:
            STATE.feed_requests += 1
            STATE.last_if_none_match = self.headers.get("if-none-match")
            STATE.last_if_modified_since = self.headers.get("if-modified-since")
            scenario = STATE.scenario

        if not self.headers.get("authorization", "").lower().startswith("bearer "):
            self.send_text("missing bearer token", HTTPStatus.UNAUTHORIZED)
            return
        if scenario == "auth":
            self.send_text("invalid token", HTTPStatus.UNAUTHORIZED)
            return
        if scenario == "rate_limit":
            self.send_text(
                "too many requests",
                HTTPStatus.TOO_MANY_REQUESTS,
                {"Retry-After": "7"},
            )
            return
        if scenario == "upstream":
            self.send_text("temporary upstream failure", HTTPStatus.SERVICE_UNAVAILABLE)
            return
        if scenario == "malformed":
            self.send_text('{"items":[', HTTPStatus.OK, {"Content-Type": "application/json"})
            return
        if scenario == "slow_happy":
            time.sleep(1.5)
            scenario = "happy"
        if scenario == "oversized":
            page = {
                "feed_url": "/api/v1/feed?last=true",
                "next_url": None,
                "items": [feed_item(f"oversized-{index}") for index in range(201)],
            }
            self.send_json(page)
            return

        page_number = query.get("page", ["1"])[0]
        if scenario in {"detail_404", "detail_auth", "updated", "inactive"}:
            if scenario == "inactive":
                items = [feed_item("stub-active-1", active=False)]
            else:
                items = [feed_item("stub-active-1")]
            page = {
                "feed_url": "/api/v1/feed?last=true",
                "next_url": None,
                "id": "scenario-tail",
                "next_id": None,
                "items": items,
            }
            self.send_json(
                page,
                headers={
                    "ETag": '"scenario-tail-v1"',
                    "Last-Modified": "Wed, 05 Aug 2026 20:00:00 GMT",
                },
            )
            return

        if page_number == "2":
            etag = '"stub-tail-v1"'
            if self.headers.get("if-none-match") == etag:
                self.send_response(HTTPStatus.NOT_MODIFIED)
                self.send_header("ETag", etag)
                self.send_header("Last-Modified", "Wed, 05 Aug 2026 20:00:00 GMT")
                self.end_headers()
                return
            page = {
                "feed_url": "/api/v1/feed?page=2",
                "next_url": None,
                "id": "page-2",
                "next_id": None,
                "items": [feed_item("stub-active-2", title="Customer Support Adviser")],
            }
            self.send_json(
                page,
                headers={
                    "ETag": etag,
                    "Last-Modified": "Wed, 05 Aug 2026 20:00:00 GMT",
                },
            )
            return

        page = {
            "feed_url": "/api/v1/feed?page=1",
            "next_url": "/api/v1/feed?page=2",
            "id": "page-1",
            "next_id": "page-2",
            "items": [feed_item("stub-active-1")],
        }
        self.send_json(page)

    def handle_detail(self, external_id: str) -> None:
        with STATE.lock:
            STATE.detail_requests += 1
            scenario = STATE.scenario
        if scenario == "detail_404":
            self.send_text("not found", HTTPStatus.NOT_FOUND)
            return
        if scenario == "detail_auth":
            self.send_text("invalid token", HTTPStatus.UNAUTHORIZED)
            return
        self.send_json(detail(external_id, updated=scenario == "updated"))

    def send_json(
        self,
        payload: dict[str, object],
        status: HTTPStatus = HTTPStatus.OK,
        headers: dict[str, str] | None = None,
    ) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def send_text(
        self,
        body: str,
        status: HTTPStatus = HTTPStatus.OK,
        headers: dict[str, str] | None = None,
    ) -> None:
        encoded = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(encoded)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=9797)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"NAV stub listening on http://{args.host}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
