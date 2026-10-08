#!/usr/bin/env python3
"""Wait, without a model in the loop, until a change request's CI or activity changes.

Usage (one foreground chunk; re-invoke with the printed fingerprint on exit 2):

    python3 poll-until-change.py --host gitlab|github|gitea --watch pipeline|cr-activity \
        --api-base <API base URL> --cr <project>:<iid> [--cr ...] \
        --token-env <VAR> [--env-file <path>] [--ignore-self] \
        [--fingerprint <previous>] [--max-wait 540] [--interval <s>] [--max-interval 300]

The script only issues GET requests (enforced in `request`), never writes state
files, and never takes the token as an argument: it reads it from the
environment variable named by --token-env (or, when unset there, from that key
in --env-file).

Without --fingerprint, or for a --cr missing from it, the current state is
reported at once (exit 0), so the caller can start watching from it.

Exit codes:
    0  changed: prints JSON with the new fingerprint and the changed target(s)
    2  --max-wait reached without a change: prints JSON (fingerprint unchanged)
    3  persistent authentication failure (start-up identity lookup, or
       --max-auth-failures consecutive polls rejected)
    4  bad arguments, unknown host, or a target/API base that does not exist

The chunk, start-up identity lookup included, ends within --max-wait: no
request starts after the deadline, each request's timeout is clamped to the
time left, and targets not polled before the deadline keep their previous
fingerprint entry.

Every swallowed error (401/403/429/5xx/network) is logged to stderr.
Standard library only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Callable, Dict, Iterable, List, Mapping, NamedTuple, Optional, Sequence, Tuple

EXIT_CHANGED = 0
EXIT_MAX_WAIT = 2
EXIT_AUTH = 3
EXIT_USAGE = 4

MAX_WAIT_LIMIT = 540  # stays under the 600 s foreground Bash timeout
DEFAULT_INTERVALS = {"pipeline": 60.0, "cr-activity": 90.0}
DEFAULT_MAX_INTERVAL = 300.0
BACKOFF_FACTOR = 1.5
DEFAULT_MAX_AUTH_FAILURES = 3
REQUEST_TIMEOUT_S = 20
MIN_REQUEST_TIMEOUT_S = 0.5  # with less time left than this, no request starts
MAX_PAGES = 50
STARTUP_RETRIES = 3
STARTUP_RETRY_DELAY_S = 5.0
PROG = "poll-until-change"


# ── Errors ───────────────────────────────────────────────────────────────────


class UsageError(Exception):
    """Bad arguments, unknown host, or a target that does not exist (exit 4)."""


class AuthError(Exception):
    """The host rejected the token (401, or 403 that is not a rate limit)."""


class TransientError(Exception):
    """A failure worth retrying: 5xx, 429, rate-limited 403, network, bad JSON."""


class NonGetRequestError(Exception):
    """Raised when anything other than GET is attempted. This script never writes."""


class DeadlineReached(Exception):
    """The chunk's --max-wait is spent; no further request or sleep may start."""


# ── Chunk deadline ───────────────────────────────────────────────────────────


class Deadline:
    """The chunk's end, measured from process start on an injectable clock."""

    def __init__(self, now: Callable[[], float], max_wait: float, started: Optional[float] = None):
        self._now = now
        self.started = now() if started is None else started
        self.at = self.started + max_wait

    def remaining(self) -> float:
        return self.at - self._now()

    def request_timeout(self) -> float:
        """Timeout for the next request, never past the deadline; raises when too little time is left."""
        left = self.remaining()
        if left < MIN_REQUEST_TIMEOUT_S:
            raise DeadlineReached(f"{max(left, 0):.1f} s left")
        return min(float(REQUEST_TIMEOUT_S), left)

    def sleep(self, sleep: Callable[[float], None], seconds: float) -> bool:
        """Sleep at most until the deadline. True if time is left afterwards."""
        left = self.remaining()
        if left > 0:
            sleep(min(seconds, left))
        return self.remaining() > 0


# ── HTTP layer (GET only) ────────────────────────────────────────────────────


class Response(NamedTuple):
    status: int
    headers: Mapping[str, str]
    body: bytes


Transport = Callable[[str, str, Mapping[str, str], float], Response]


def urllib_transport(method: str, url: str, headers: Mapping[str, str], timeout: float) -> Response:
    """Real network transport. Returns HTTP error statuses instead of raising."""
    if method != "GET":  # defence in depth; `request` already refuses
        raise NonGetRequestError(method)
    req = urllib.request.Request(url, headers=dict(headers), method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return Response(resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read())
    except urllib.error.HTTPError as err:
        return Response(err.code, {k.lower(): v for k, v in (err.headers or {}).items()}, err.read() or b"")
    except (urllib.error.URLError, OSError) as err:  # DNS, refused, TLS, timeout
        raise TransientError(f"GET {url}: {getattr(err, 'reason', err)}") from err


def request(transport: Transport, method: str, url: str, headers: Mapping[str, str],
            timeout: float = REQUEST_TIMEOUT_S) -> Response:
    """The single request helper. Refuses every method but GET before any I/O."""
    if method != "GET":
        raise NonGetRequestError(f"{PROG} only issues GET requests; refused {method} {url}")
    return transport("GET", url, headers, timeout)


def _is_rate_limited(resp: Response) -> bool:
    h = resp.headers
    return h.get("x-ratelimit-remaining") == "0" or "retry-after" in h


def classify(resp: Response, url: str) -> None:
    """Raise the error class for a non-2xx response; return for 2xx."""
    if 200 <= resp.status < 300:
        return
    what = f"GET {url} -> HTTP {resp.status}"
    if resp.status == 401 or (resp.status == 403 and not _is_rate_limited(resp)):
        raise AuthError(what)
    if resp.status == 404:
        raise UsageError(f"{what} (check --api-base and --cr)")
    if resp.status in (403, 429) or resp.status >= 500:
        raise TransientError(what)
    raise UsageError(what)


class ApiClient:
    """GET-only JSON client over an injectable transport."""

    def __init__(self, transport: Transport, api_base: str, headers: Mapping[str, str],
                 deadline: Optional[Deadline] = None):
        self._transport = transport
        self.api_base = api_base.rstrip("/")
        self._headers = dict(headers)
        self._deadline = deadline

    def url(self, path: str, **query: object) -> str:
        qs = urllib.parse.urlencode({k: v for k, v in query.items() if v is not None})
        return f"{self.api_base}{path}" + (f"?{qs}" if qs else "")

    def _get(self, url: str) -> Tuple[object, Mapping[str, str]]:
        timeout = self._deadline.request_timeout() if self._deadline else REQUEST_TIMEOUT_S
        resp = request(self._transport, "GET", url, self._headers, timeout)
        classify(resp, url)
        try:
            return json.loads(resp.body.decode("utf-8") or "null"), resp.headers
        except (UnicodeDecodeError, json.JSONDecodeError) as err:
            raise TransientError(f"GET {url}: response is not JSON ({err})") from err

    def get_json(self, path: str, **query: object) -> object:
        return self._get(self.url(path, **query))[0]

    def get_pages(self, path: str, size_param: str, size: int, items_key: Optional[str] = None,
                  **query: object) -> List[object]:
        """Every item of a paginated list endpoint (`page` + `size_param`)."""
        items: List[object] = []
        for page in range(1, MAX_PAGES + 1):
            data, headers = self._get(self.url(path, **{size_param: size, "page": page}, **query))
            batch = data.get(items_key, []) if items_key and isinstance(data, dict) else data
            if not isinstance(batch, list):
                raise TransientError(f"GET {path}: expected a list, got {type(batch).__name__}")
            items.extend(batch)
            total = headers.get("x-total-count") or (data.get("total_count") if isinstance(data, dict) else None)
            if not batch or len(batch) < size or (total is not None and len(items) >= int(total)):
                return items
            if headers.get("x-next-page") == "":
                return items
        log(f"GET {path}: stopped after {MAX_PAGES} pages")
        return items


# ── Pure fingerprint functions (no I/O) ──────────────────────────────────────


class Observation(NamedTuple):
    material: Dict[str, object]  # hashed into the fingerprint
    summary: Dict[str, object]  # reported to the caller


class Note(NamedTuple):
    author: Optional[str]
    created_at: Optional[str]
    updated_at: Optional[str]
    resolved_by: Optional[str] = None


_TS = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$")


def parse_ts(value: Optional[str]) -> Optional[datetime]:
    """ISO-8601 → aware datetime (any fraction length, `Z` or offset); None if absent."""
    if not value:
        return None
    m = _TS.match(value.strip())
    if not m:
        raise ValueError(f"unrecognised timestamp {value!r}")
    base, frac, zone = m.groups()
    zone = "+00:00" if zone in (None, "Z") else (zone if ":" in zone else f"{zone[:3]}:{zone[3:]}")
    frac = (frac or "0")[:6].ljust(6, "0")
    return datetime.fromisoformat(f"{base}.{frac}{zone}").astimezone(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ") if dt else None


def _same_user(a: Optional[str], b: Optional[str]) -> bool:
    return bool(a) and bool(b) and a.lower() == b.lower()


def latest_foreign_activity(notes: Iterable[Note], self_id: Optional[str]) -> Optional[datetime]:
    """Newest created/updated time of notes not authored by `self_id`.

    A note resolved by `self_id` contributes only its `created_at`, so the
    identity's own resolves never move the result.
    """
    latest: Optional[datetime] = None
    for note in notes:
        if _same_user(note.author, self_id):
            continue
        stamps = [note.created_at]
        if not _same_user(note.resolved_by, self_id):
            stamps.append(note.updated_at)
        for raw in stamps:
            try:
                ts = parse_ts(raw)
            except ValueError as err:
                log(f"ignoring note timestamp: {err}")
                continue
            if ts and (latest is None or ts > latest):
                latest = ts
    return latest


def activity_observation(state: str, head_sha: Optional[str], notes: Iterable[Note],
                         self_id: Optional[str]) -> Observation:
    latest = _iso(latest_foreign_activity(notes, self_id))
    material = {"state": state, "head_sha": head_sha, "latest_activity": latest}
    return Observation(material, dict(material))


def _cr_state(raw_state: Optional[str], merged: bool) -> str:
    if merged or raw_state == "merged":
        return "merged"
    return "open" if raw_state in ("open", "opened") else (raw_state or "unknown")


TERMINAL = {"success", "failed", "canceled", "skipped"}


def _pipeline_summary(status: str, host_status: Optional[str], sha: Optional[str], **extra: object) -> Dict[str, object]:
    return {"status": status, "terminal": status in TERMINAL, "host_status": host_status, "sha": sha, **extra}


_GITLAB_STATUS = {"success": "success", "failed": "failed", "canceled": "canceled", "skipped": "skipped"}


def gitlab_pipeline_observation(pipelines: Sequence[Mapping[str, object]]) -> Observation:
    """GitLab: latest MR pipeline `id` + `status`."""
    if not pipelines:
        return Observation({"id": None, "status": None}, _pipeline_summary("none", None, None, pipeline_id=None))
    latest = max(pipelines, key=lambda p: int(p.get("id") or 0))
    raw = latest.get("status")
    return Observation(
        {"id": latest.get("id"), "status": raw},
        _pipeline_summary(_GITLAB_STATUS.get(str(raw), "running"), raw, latest.get("sha"),
                          pipeline_id=latest.get("id"), web_url=latest.get("web_url")),
    )


_GITHUB_FAILED = {"failure", "cancelled", "timed_out", "action_required", "startup_failure", "stale"}


def github_pipeline_observation(pr: Mapping[str, object], check_runs: Sequence[Mapping[str, object]]) -> Observation:
    """GitHub: `head.sha` + the set of check-run `status`/`conclusion`."""
    sha = (pr.get("head") or {}).get("sha")
    runs = sorted((str(r.get("name")), r.get("id") or 0, r.get("status"), r.get("conclusion")) for r in check_runs)
    if not runs:
        status = "none"
    elif any(r[2] != "completed" for r in runs):
        status = "running"
    elif any(r[3] in _GITHUB_FAILED for r in runs):
        status = "failed"
    elif all(r[3] == "skipped" for r in runs):
        status = "skipped"
    else:
        status = "success"
    return Observation({"head_sha": sha, "check_runs": [list(r) for r in runs]},
                       _pipeline_summary(status, None, sha, check_runs=len(runs)))


_GITEA_STATUS = {"success": "success", "warning": "success", "failure": "failed", "error": "failed", "pending": "running"}


def gitea_pipeline_observation(pr: Mapping[str, object], combined: Mapping[str, object]) -> Observation:
    """Gitea: `head.sha` + combined status `state`."""
    sha = (pr.get("head") or {}).get("sha")
    raw = combined.get("state") or None
    total = combined.get("total_count")
    status = "none" if not raw or total == 0 else _GITEA_STATUS.get(str(raw), "running")
    return Observation({"head_sha": sha, "state": raw}, _pipeline_summary(status, raw, sha))


def gitlab_activity_observation(mr: Mapping[str, object], discussions: Sequence[Mapping[str, object]],
                                self_id: Optional[str]) -> Observation:
    notes = [
        Note((n.get("author") or {}).get("username"), n.get("created_at"), n.get("updated_at"),
             (n.get("resolved_by") or {}).get("username"))
        for d in discussions for n in (d.get("notes") or [])
    ]
    sha = mr.get("sha") or (mr.get("diff_refs") or {}).get("head_sha")
    return activity_observation(_cr_state(mr.get("state"), False), sha, notes, self_id)


def github_activity_observation(pr: Mapping[str, object], review_comments: Sequence[Mapping[str, object]],
                                reviews: Sequence[Mapping[str, object]], issue_comments: Sequence[Mapping[str, object]],
                                self_id: Optional[str]) -> Observation:
    def login(o: Mapping[str, object]) -> Optional[str]:
        return (o.get("user") or {}).get("login")

    notes = [Note(login(c), c.get("created_at"), c.get("updated_at")) for c in [*review_comments, *issue_comments]]
    notes += [Note(login(r), r.get("submitted_at"), None) for r in reviews]
    sha = (pr.get("head") or {}).get("sha")
    return activity_observation(_cr_state(pr.get("state"), bool(pr.get("merged"))), sha, notes, self_id)


def gitea_activity_observation(pr: Mapping[str, object], reviews: Sequence[Mapping[str, object]],
                               review_comments: Sequence[Mapping[str, object]],
                               issue_comments: Sequence[Mapping[str, object]], self_id: Optional[str]) -> Observation:
    def login(o: Mapping[str, object], key: str = "user") -> Optional[str]:
        return (o.get(key) or {}).get("login")

    notes = [Note(login(r), r.get("submitted_at"), r.get("updated_at")) for r in reviews]
    notes += [Note(login(c), c.get("created_at"), c.get("updated_at"), login(c, "resolver")) for c in review_comments]
    notes += [Note(login(c), c.get("created_at"), c.get("updated_at")) for c in issue_comments]
    sha = (pr.get("head") or {}).get("sha")
    return activity_observation(_cr_state(pr.get("state"), bool(pr.get("merged"))), sha, notes, self_id)


def digest(material: Mapping[str, object]) -> str:
    blob = json.dumps(material, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


# ── Host adapters (endpoints + fetch; delegate shaping to the pure functions) ─


class Target(NamedTuple):
    project: str
    iid: int

    @property
    def key(self) -> str:
        return f"{self.project}:{self.iid}"


class HostAdapter:
    """Per-host endpoints. Subclasses set the auth headers and the three observers."""

    user_field = "login"

    def __init__(self, client: ApiClient):
        self.client = client

    @staticmethod
    def auth_headers(token: str) -> Dict[str, str]:
        raise NotImplementedError

    def identity(self) -> str:
        user = self.client.get_json("/user")  # host current-user endpoint
        name = user.get(self.user_field) if isinstance(user, dict) else None
        if not name:
            raise UsageError(f"GET /user returned no {self.user_field!r}")
        return str(name)

    def pipeline(self, target: Target) -> Observation:
        raise NotImplementedError

    def activity(self, target: Target, self_id: Optional[str]) -> Observation:
        raise NotImplementedError


class GitLabAdapter(HostAdapter):
    user_field = "username"

    @staticmethod
    def auth_headers(token: str) -> Dict[str, str]:
        return {"PRIVATE-TOKEN": token, "Accept": "application/json"}

    def _mr(self, t: Target) -> str:
        return f"/projects/{urllib.parse.quote(t.project, safe='')}/merge_requests/{t.iid}"

    def pipeline(self, t: Target) -> Observation:
        # GET_CR_PIPELINES: /projects/:id/merge_requests/:iid/pipelines
        return gitlab_pipeline_observation(self.client.get_json(f"{self._mr(t)}/pipelines") or [])

    def activity(self, t: Target, self_id: Optional[str]) -> Observation:
        mr = self.client.get_json(self._mr(t))  # GET_CR: /projects/:id/merge_requests/:iid
        # GET_CR_DISCUSSIONS: /projects/:id/merge_requests/:iid/discussions (all pages)
        discussions = self.client.get_pages(f"{self._mr(t)}/discussions", "per_page", 100)
        return gitlab_activity_observation(mr, discussions, self_id)


class GitHubAdapter(HostAdapter):
    @staticmethod
    def auth_headers(token: str) -> Dict[str, str]:
        return {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28"}

    def _repo(self, t: Target) -> str:
        return f"/repos/{t.project}"

    def pipeline(self, t: Target) -> Observation:
        pr = self.client.get_json(f"{self._repo(t)}/pulls/{t.iid}")  # GET_CR: /repos/:o/:r/pulls/:n
        sha = (pr.get("head") or {}).get("sha")
        # GET_CR_PIPELINES: /repos/:o/:r/commits/{head.sha}/check-runs (all pages)
        runs = self.client.get_pages(f"{self._repo(t)}/commits/{sha}/check-runs", "per_page", 100,
                                     items_key="check_runs") if sha else []
        return github_pipeline_observation(pr, runs)

    def activity(self, t: Target, self_id: Optional[str]) -> Observation:
        base = self._repo(t)
        pr = self.client.get_json(f"{base}/pulls/{t.iid}")  # GET_CR
        # GET_CR_DISCUSSIONS: /repos/:o/:r/pulls/:n/comments (all pages)
        review_comments = self.client.get_pages(f"{base}/pulls/{t.iid}/comments", "per_page", 100)
        # reviews (UNAPPROVE_CR step 1 listing): /repos/:o/:r/pulls/:n/reviews (all pages)
        reviews = self.client.get_pages(f"{base}/pulls/{t.iid}/reviews", "per_page", 100)
        # GET_CR_COMMENTS (general comments): /repos/:o/:r/issues/:n/comments (all pages)
        issue_comments = self.client.get_pages(f"{base}/issues/{t.iid}/comments", "per_page", 100)
        return github_activity_observation(pr, review_comments, reviews, issue_comments, self_id)


class GiteaAdapter(HostAdapter):
    @staticmethod
    def auth_headers(token: str) -> Dict[str, str]:
        return {"Authorization": f"token {token}", "Accept": "application/json"}

    def _repo(self, t: Target) -> str:
        return f"/repos/{t.project}"

    def pipeline(self, t: Target) -> Observation:
        pr = self.client.get_json(f"{self._repo(t)}/pulls/{t.iid}")  # GET_CR: /repos/:o/:r/pulls/:index
        sha = (pr.get("head") or {}).get("sha")
        # GET_CR_PIPELINES (combined status): /repos/:o/:r/commits/{head.sha}/status
        combined = self.client.get_json(f"{self._repo(t)}/commits/{sha}/status") if sha else {}
        return gitea_pipeline_observation(pr, combined or {})

    def activity(self, t: Target, self_id: Optional[str]) -> Observation:
        base = self._repo(t)
        pr = self.client.get_json(f"{base}/pulls/{t.iid}")  # GET_CR
        # GET_CR_DISCUSSIONS: /repos/:o/:r/pulls/:index/reviews (all pages) + per-review comments
        reviews = self.client.get_pages(f"{base}/pulls/{t.iid}/reviews", "limit", 50)
        review_comments: List[object] = []
        for review in reviews:
            review_comments += self.client.get_json(f"{base}/pulls/{t.iid}/reviews/{review.get('id')}/comments") or []
        # GET_CR_COMMENTS (general comments): /repos/:o/:r/issues/:index/comments (all pages)
        issue_comments = self.client.get_pages(f"{base}/issues/{t.iid}/comments", "limit", 50)
        return gitea_activity_observation(pr, reviews, review_comments, issue_comments, self_id)


ADAPTERS = {"gitlab": GitLabAdapter, "github": GitHubAdapter, "gitea": GiteaAdapter}


# ── CLI parsing ──────────────────────────────────────────────────────────────


class _Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:  # exit 4, not argparse's 2 (2 means max-wait here)
        raise UsageError(message)


def parse_cr(value: str) -> Target:
    """`project:iid`, split on the LAST colon (GitLab paths may hold anything but the iid may not)."""
    project, sep, iid = value.rpartition(":")
    if not sep or not project or not iid.isdigit() or int(iid) < 1:
        raise UsageError(f"--cr expects <project>:<iid>, got {value!r}")
    return Target(project, int(iid))


def parse_fingerprint(values: Sequence[str]) -> Dict[str, str]:
    """`<project>:<iid>=<hash>` entries, comma-separated and/or repeated."""
    result: Dict[str, str] = {}
    for value in values:
        for entry in filter(None, (e.strip() for e in value.split(","))):
            key, sep, digest_ = entry.rpartition("=")
            if not sep or not key or not re.fullmatch(r"[0-9a-f]{16}", digest_):
                raise UsageError(f"--fingerprint entry {entry!r} is not <project>:<iid>=<hash>")
            parse_cr(key)
            result[key] = digest_
    return result


def build_parser() -> argparse.ArgumentParser:
    p = _Parser(prog=PROG, description=__doc__.split("\n\n")[0])
    p.add_argument("--host", required=True, help="gitlab | github | gitea")
    p.add_argument("--watch", required=True, choices=sorted(DEFAULT_INTERVALS))
    p.add_argument("--api-base", required=True, help="API root, e.g. https://gitlab.example.com/api/v4")
    p.add_argument("--cr", action="append", required=True, type=str, help="<project>:<iid>; repeatable")
    p.add_argument("--token-env", required=True, help="name of the env var holding the token")
    p.add_argument("--env-file", help="dotenv file to read --token-env from when it is not in the environment")
    p.add_argument("--ignore-self", action="store_true", help="ignore the token identity's own notes and resolves")
    p.add_argument("--fingerprint", action="append", default=[], help="previous fingerprint to resume from")
    p.add_argument("--max-wait", type=float, default=MAX_WAIT_LIMIT, help=f"seconds, at most {MAX_WAIT_LIMIT}")
    p.add_argument("--interval", type=float, help="first poll interval (default 60 pipeline, 90 cr-activity)")
    p.add_argument("--max-interval", type=float, default=DEFAULT_MAX_INTERVAL, help="backoff cap in seconds")
    p.add_argument("--max-auth-failures", type=int, default=DEFAULT_MAX_AUTH_FAILURES,
                   help="consecutive rejected polls before exit 3")
    return p


class Options(NamedTuple):
    host: str
    watch: str
    api_base: str
    targets: List[Target]
    token_env: str
    env_file: Optional[str]
    ignore_self: bool
    previous: Dict[str, str]
    max_wait: float
    interval: float
    max_interval: float
    max_auth_failures: int


def parse_args(argv: Sequence[str]) -> Options:
    a = build_parser().parse_args(argv)
    if a.host not in ADAPTERS:
        raise UsageError(f"--host must be one of {', '.join(ADAPTERS)}, got {a.host!r}")
    if not re.match(r"^https?://[^/\s]+", a.api_base):
        raise UsageError(f"--api-base must be an http(s) URL, got {a.api_base!r}")
    if not 0 < a.max_wait <= MAX_WAIT_LIMIT:
        raise UsageError(f"--max-wait must be in (0, {MAX_WAIT_LIMIT}]")
    interval = a.interval if a.interval is not None else DEFAULT_INTERVALS[a.watch]
    if interval <= 0 or a.max_interval < interval:
        raise UsageError("--interval must be > 0 and <= --max-interval")
    if a.max_auth_failures < 1:
        raise UsageError("--max-auth-failures must be >= 1")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", a.token_env):
        raise UsageError("--token-env takes a variable NAME, not a token")
    targets = list({t.key: t for t in map(parse_cr, a.cr)}.values())
    return Options(a.host, a.watch, a.api_base, targets, a.token_env, a.env_file, a.ignore_self,
                   parse_fingerprint(a.fingerprint), a.max_wait, interval, a.max_interval, a.max_auth_failures)


def read_env_file(path: str, name: str) -> Optional[str]:
    """Value of `name` in a dotenv file (`KEY=value`, optional `export`, optional quotes)."""
    try:
        with open(path, encoding="utf-8") as fh:
            lines = fh.read().splitlines()
    except OSError as err:
        raise UsageError(f"--env-file {path}: {err.strerror}") from err
    for line in lines:
        m = re.match(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
        if m and m.group(1) == name:
            value = m.group(2)
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
                value = value[1:-1]
            return value
    return None


def resolve_token(opts: Options, environ: Mapping[str, str]) -> str:
    token = environ.get(opts.token_env) or (read_env_file(opts.env_file, opts.token_env) if opts.env_file else None)
    if not token:
        where = f"the environment or {opts.env_file}" if opts.env_file else "the environment"
        raise UsageError(f"{opts.token_env} is not set in {where}")
    return token


# ── Poll loop ────────────────────────────────────────────────────────────────


def log(message: str) -> None:
    print(f"{PROG}: {message}", file=sys.stderr, flush=True)


class Deps(NamedTuple):
    transport: Transport
    environ: Mapping[str, str]
    now: Callable[[], float]
    sleep: Callable[[float], None]
    out: Callable[[str], None]


def default_deps() -> Deps:
    return Deps(urllib_transport, os.environ, time.monotonic, time.sleep, lambda s: print(s, flush=True))


def lookup_identity(adapter: HostAdapter, deps: Deps, deadline: Deadline) -> str:
    """Start-up current-user lookup: auth failure → AuthError; transient retried, then UsageError.

    Raises DeadlineReached when --max-wait runs out first."""
    for attempt in range(1, STARTUP_RETRIES + 1):
        try:
            return adapter.identity()
        except TransientError as err:
            log(f"identity lookup failed ({attempt}/{STARTUP_RETRIES}): {err}")
            if attempt < STARTUP_RETRIES and not deadline.sleep(deps.sleep, STARTUP_RETRY_DELAY_S):
                raise DeadlineReached("during the identity lookup") from err
    raise UsageError("could not resolve the token identity (GET /user); check --host and --api-base")


class PollResult(NamedTuple):
    observations: Dict[str, Observation]
    auth_failed: bool
    deadline_reached: bool = False


def poll_once(adapter: HostAdapter, opts: Options, self_id: Optional[str]) -> PollResult:
    """Observe every target. Logs and skips auth/transient failures; UsageError propagates.

    Stops at the deadline: the target being read and the rest get no observation."""
    observations: Dict[str, Observation] = {}
    auth_failed = False
    for t in opts.targets:
        try:
            observations[t.key] = adapter.pipeline(t) if opts.watch == "pipeline" else adapter.activity(t, self_id)
        except DeadlineReached as err:
            log(f"max-wait reached before {t.key} was read ({err}); keeping its previous fingerprint")
            return PollResult(observations, auth_failed, deadline_reached=True)
        except AuthError as err:
            auth_failed = True
            log(f"{t.key}: authentication rejected: {err}")
        except TransientError as err:
            log(f"{t.key}: transient error, will retry: {err}")
        except (AttributeError, TypeError, ValueError) as err:  # unexpected response shape
            log(f"{t.key}: unexpected response shape, will retry: {err!r}")
    return PollResult(observations, auth_failed)


def fingerprint_string(entries: Mapping[str, str]) -> str:
    return ",".join(f"{k}={entries[k]}" for k in sorted(entries))


def report(deps: Deps, outcome: str, opts: Options, current: Mapping[str, str], changed: Sequence[str],
           summaries: Mapping[str, object], started: float) -> None:
    deps.out(json.dumps({
        "outcome": outcome,
        "host": opts.host,
        "watch": opts.watch,
        "fingerprint": fingerprint_string(current),
        "changed": list(changed),
        "targets": {k: {"fingerprint": f"{k}={current[k]}", "summary": summaries.get(k)} for k in sorted(current)},
        "elapsed_s": round(deps.now() - started),
    }, sort_keys=True))


def previous_entries(opts: Options) -> Dict[str, str]:
    wanted = {t.key for t in opts.targets}
    return {k: v for k, v in opts.previous.items() if k in wanted}


def watch(opts: Options, adapter: HostAdapter, self_id: Optional[str], deps: Deps, deadline: Deadline) -> int:
    started = deadline.started
    current = previous_entries(opts)
    summaries: Dict[str, object] = {}
    interval = opts.interval
    auth_failures = 0
    while True:
        result = poll_once(adapter, opts, self_id)
        if result.auth_failed:
            auth_failures += 1
            if auth_failures >= opts.max_auth_failures:
                log(f"{auth_failures} consecutive polls rejected as unauthorized; giving up")
                deps.out(json.dumps({"outcome": "auth-failure", "consecutive_failures": auth_failures}))
                return EXIT_AUTH
        elif result.observations:
            auth_failures = 0
        changed = []
        for key, obs in result.observations.items():
            new = digest(obs.material)
            summaries[key] = obs.summary
            if current.get(key) != new:
                changed.append(key)
            current[key] = new
        if changed:  # only fully read targets are compared, so a cut-short poll never fakes a change
            report(deps, "changed", opts, current, sorted(changed), summaries, started)
            return EXIT_CHANGED
        if result.deadline_reached or not deadline.sleep(deps.sleep, interval):
            break
        interval = min(interval * BACKOFF_FACTOR, opts.max_interval)
    report(deps, "max-wait", opts, current, [], summaries, started)
    return EXIT_MAX_WAIT


def run(argv: Sequence[str], deps: Deps) -> int:
    started = deps.now()  # the chunk deadline counts from here, start-up lookups included
    try:
        opts = parse_args(argv)
        deadline = Deadline(deps.now, opts.max_wait, started)
        token = resolve_token(opts, deps.environ)
        cls = ADAPTERS[opts.host]
        adapter = cls(ApiClient(deps.transport, opts.api_base, cls.auth_headers(token), deadline))
        try:
            self_id = lookup_identity(adapter, deps, deadline) if opts.ignore_self else None
        except DeadlineReached as err:
            log(f"max-wait reached before polling ({err})")
            report(deps, "max-wait", opts, previous_entries(opts), [], {}, started)
            return EXIT_MAX_WAIT
        return watch(opts, adapter, self_id, deps, deadline)
    except AuthError as err:
        log(f"authentication failed: {err}")
        deps.out(json.dumps({"outcome": "auth-failure", "error": str(err)}))
        return EXIT_AUTH
    except UsageError as err:
        log(f"error: {err}")
        deps.out(json.dumps({"outcome": "usage-error", "error": str(err)}))
        return EXIT_USAGE


def main() -> int:
    return run(sys.argv[1:], default_deps())


if __name__ == "__main__":
    sys.exit(main())
