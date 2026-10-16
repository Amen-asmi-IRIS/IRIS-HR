# ruff: noqa: T201  (a command-line tool: printing is its output)
"""Measure the read endpoints of a working day under concurrent sessions (NFR-01, NFR-02).

    python tests/hardening/perf_measure.py --base http://localhost:8000 --users 20

Exit code 0 when the 95th percentile of every endpoint is under the limit and no call failed.
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import ssl
import statistics
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

PASSWORD = "Correct-Horse-42!"
TODAY = date.today()
MONTH = {"from": TODAY.replace(day=1).isoformat(), "to": TODAY.isoformat()}
EVERYONE = [
    ("me", "/auth/me", {}),
    ("unread count", "/notifications/unread-count", {}),
    ("notifications", "/notifications", {}),
    ("my requests", "/requests", {"scope": "mine"}),
    ("my home", "/home/me", {}),
    ("department calendar", "/calendar", {**MONTH, "scope": "department"}),
    ("request types", "/request-types", {}),
    ("holidays", "/holidays", {"year": str(TODAY.year)}),
    ("my balance", "/balances/{employee}", {}),
    ("my ledger", "/balances/{employee}/ledger", {}),
    ("workspace summary", "/workspaces/summary", {}),
]
BY_ROLE = {
    "manager": [
        ("to decide", "/approvals", {"queue": "mine"}),
        ("team home", "/home/team", {}),
        ("team requests", "/requests", {"scope": "team"}),
        ("team calendar", "/calendar", {**MONTH, "scope": "team"}),
        ("team people", "/employees", {}),
    ],
    "hr": [
        ("hr queue", "/approvals", {"queue": "hr"}),
        ("certificates queue", "/approvals", {"queue": "certificates"}),
        ("all requests", "/requests", {"scope": "all"}),
        ("all employees", "/employees", {"page_size": "100"}),
        ("company calendar", "/calendar", {**MONTH, "scope": "company"}),
        ("absence report", "/reports/absences", MONTH),
        ("balance report", "/reports/balances", {"on": TODAY.isoformat()}),
        ("kpmg export", "/exports/kpmg", MONTH),
        ("activity log", "/audit/business", {}),
    ],
    "exec": [
        ("overview home", "/home/overview", {}),
        ("all requests", "/requests", {"scope": "all"}),
        ("company calendar", "/calendar", {**MONTH, "scope": "company"}),
    ],
}


class Session:
    def __init__(self, base: str, host_header: str | None, email: str, insecure: bool = False) -> None:
        self.base, self.host_header, self.email = base.rstrip("/") + "/api/v1", host_header, email
        handlers: list = [urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())]
        if insecure:
            handlers.append(urllib.request.HTTPSHandler(context=ssl._create_unverified_context()))  # noqa: S323
        self.opener = urllib.request.build_opener(*handlers)
        self.me: dict = {}
        self.csrf = ""

    def _request(
        self, path: str, params: dict | None = None, body: dict | None = None
    ) -> tuple[int, bytes, float]:
        url = self.base + path + ("?" + urllib.parse.urlencode(params) if params else "")
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        if self.host_header:
            request.add_header("Host", self.host_header)
        if body is not None:
            request.add_header("X-CSRFToken", self.csrf)
            request.add_header(
                "Origin", f"http://{self.host_header}" if self.host_header else self.base.split("/api/")[0]
            )
        started = time.perf_counter()
        try:
            with self.opener.open(request, timeout=30) as response:
                payload, status = response.read(), response.status
        except urllib.error.HTTPError as error:
            payload, status = error.read(), error.code
        return status, payload, (time.perf_counter() - started) * 1000

    def sign_in(self) -> None:
        # Sign-in needs the CSRF token like every unsafe call (plan 01a, contract note 10).
        _, payload, _ = self._request("/auth/csrf")
        self.csrf = json.loads(payload)["csrf_token"]
        status, payload, _ = self._request("/auth/login", body={"email": self.email, "password": PASSWORD})
        if status != 200:
            raise SystemExit(f"cannot sign in as {self.email}: {status} {payload[:200]!r}")
        self.me = json.loads(payload)

    def endpoints(self) -> list[tuple[str, str, dict]]:
        chosen = list(EVERYONE)
        for role in self.me.get("roles", []):
            chosen += BY_ROLE.get(role, [])
        employee = (self.me.get("employee") or {}).get("public_id", "")
        return [
            (label, path.replace("{employee}", employee), params)
            for label, path, params in chosen
            if "{employee}" not in path or employee
        ]

    def run(self, rounds: int, timings: dict, failures: list, lock: threading.Lock) -> None:
        for _ in range(rounds):
            for label, path, params in self.endpoints():
                status, _, elapsed = self._request(path, params)
                with lock:
                    if status == 200:
                        timings.setdefault(label, []).append(elapsed)
                    else:
                        failures.append((self.email, label, status))


def accounts(users: int) -> list[str]:
    fixed = [
        "load.hr@impactrisks.com",
        "load.ceo@impactrisks.com",
        "load.m1@impactrisks.com",
        "load.m2@impactrisks.com",
        "load.m3@impactrisks.com",
        "load.m4@impactrisks.com",
    ]
    staff = [f"load.e{index:03d}@impactrisks.com" for index in range(1, max(users - len(fixed), 0) + 1)]
    return (fixed + staff)[:users]


def percentile_95(values: list[float]) -> float:
    return statistics.quantiles(values, n=20)[18] if len(values) >= 2 else values[0]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True, help="for example http://localhost:8000")
    parser.add_argument("--host-header", default=None)
    parser.add_argument(
        "--insecure",
        action="store_true",
        help="accept the certificate of Caddy's own authority (a server stack reached through its proxy)",
    )
    parser.add_argument("--users", type=int, default=20)
    parser.add_argument("--rounds", type=int, default=15)
    parser.add_argument("--limit-ms", type=float, default=500.0)
    options = parser.parse_args()

    sessions = [
        Session(options.base, options.host_header, email, options.insecure)
        for email in accounts(options.users)
    ]
    for session in sessions:
        session.sign_in()

    timings: dict[str, list[float]] = {}
    failures: list[tuple[str, str, int]] = []
    lock = threading.Lock()
    threads = [
        threading.Thread(target=session.run, args=(options.rounds, timings, failures, lock))
        for session in sessions
    ]
    started = time.perf_counter()
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    total = sum(len(values) for values in timings.values())
    seconds = time.perf_counter() - started

    print(
        f"{options.users} concurrent sessions, {total} calls in {seconds:.1f} s ({total / seconds:.0f} calls/s)\n"
    )
    print(f"{'endpoint':<24}{'calls':>7}{'median':>10}{'p95':>10}{'max':>10}")
    slow = []
    for label in sorted(timings):
        values = timings[label]
        p95 = percentile_95(values)
        flag = "" if p95 < options.limit_ms else "   SLOW"
        print(
            f"{label:<24}{len(values):>7}{statistics.median(values):>9.0f}ms{p95:>8.0f}ms{max(values):>8.0f}ms{flag}"
        )
        if p95 >= options.limit_ms:
            slow.append(label)
    overall = percentile_95([value for values in timings.values() for value in values])
    print(f"\nall calls: p95 = {overall:.0f} ms (limit {options.limit_ms:.0f} ms)")

    for email, label, status in failures[:20]:
        print(f"FAILED {label} as {email}: HTTP {status}")
    if slow or failures or overall >= options.limit_ms:
        print(f"\nNOT MET: {len(slow)} slow endpoint(s), {len(failures)} failed call(s)")
        return 1
    print("\nNFR-02 met.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
