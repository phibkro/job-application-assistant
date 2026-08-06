#!/usr/bin/env python3
"""Bounded staging soak monitor. Use --duration 604800 for seven days."""
from __future__ import annotations

import argparse
import json
import statistics
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def fetch_json(url: str) -> tuple[int, Any]:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=15) as response:
        return response.status, json.load(response)


def source_data(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    data = payload.get("data", payload)
    return data if isinstance(data, dict) else {}


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int((len(ordered) - 1) * fraction)))
    return ordered[index]


parser = argparse.ArgumentParser()
parser.add_argument("base_url")
parser.add_argument("--duration", type=int, default=300)
parser.add_argument("--interval", type=int, default=30)
parser.add_argument("--output", default=".artifacts/soak/observations.jsonl")
parser.add_argument("--slo", default="ops/slo.json")
args = parser.parse_args()

slo = json.loads(Path(args.slo).read_text(encoding="utf-8"))
objectives = slo.get("objectives", {})
availability_target = float(objectives.get("public_api_availability_ratio", 0.995))
lag_target = float(objectives.get("nav_feed_lag_seconds_p95", 1800))

output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
deadline = time.monotonic() + max(1, args.duration)
checks = successes = 0
lag_samples: list[float] = []
source_failure_samples: list[int] = []

with output.open("a", encoding="utf-8") as handle:
    while time.monotonic() < deadline:
        record: dict[str, object] = {"at": datetime.now(timezone.utc).isoformat()}
        try:
            health_status, health = fetch_json(args.base_url.rstrip("/") + "/api/health")
            source_status, source = fetch_json(
                args.base_url.rstrip("/") + "/api/sources/nav/status"
            )
            record.update(
                health_status=health_status,
                health=health,
                source_status=source_status,
                source=source,
            )
            if health_status == 200 and source_status == 200:
                successes += 1
            source = source_data(source)
            lag = source.get("lag_seconds")
            if isinstance(lag, (int, float)) and lag >= 0:
                lag_samples.append(float(lag))
            consecutive_failures = source.get("consecutive_failures")
            if isinstance(consecutive_failures, int):
                source_failure_samples.append(consecutive_failures)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            record["error"] = str(error)
        checks += 1
        handle.write(json.dumps(record, separators=(",", ":")) + "\n")
        handle.flush()
        time.sleep(max(1, args.interval))

availability = successes / checks if checks else 0.0
lag_p95 = percentile(lag_samples, 0.95)
summary = {
    "checks": checks,
    "successes": successes,
    "availability_ratio": availability,
    "availability_target": availability_target,
    "lag_samples": len(lag_samples),
    "lag_seconds_p95": lag_p95,
    "lag_target": lag_target,
    "max_consecutive_failures": max(source_failure_samples, default=None),
    "output": str(output),
}
summary_path = output.with_suffix(".summary.json")
summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

failures: list[str] = []
if checks == 0:
    failures.append("no checks completed")
if availability < availability_target:
    failures.append(
        f"availability {availability:.5f} below target {availability_target:.5f}"
    )
if lag_p95 is None:
    failures.append("no feed-lag samples observed")
elif lag_p95 > lag_target:
    failures.append(f"feed lag p95 {lag_p95:.1f}s above target {lag_target:.1f}s")
if source_failure_samples and max(source_failure_samples) > 0:
    failures.append(
        f"source reported consecutive failures: {max(source_failure_samples)}"
    )
if failures:
    raise SystemExit("soak failed: " + "; ".join(failures))
print(json.dumps(summary, indent=2))
