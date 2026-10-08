"""Unit tests for scripts/poll-until-change.py (stdlib unittest, recorded fixtures, no network).

Run: python3 -m unittest discover -s scripts/tests
"""

from __future__ import annotations

import contextlib
import copy
import importlib.util
import io
import json
import os
import tempfile
import unittest
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "fixtures"
_spec = importlib.util.spec_from_file_location("poll_until_change", HERE.parent / "poll-until-change.py")
poll = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(poll)

TOKEN = "fake-token-value-123"
SELF = "agent-bot"


def fixture(host: str, name: str):
    return json.loads((FIXTURES / host / f"{name}.json").read_text())


class FakeTransport:
    """Routes `GET <api>/<path>` to JSON bodies. A route is a body, a list of pages
    (`paged=True`), a Response, or a callable returning one of those.

    With a `clock` and `latency`, each request advances the clock by `latency`, or
    by `timeout` and then times out (like a socket timeout) when `latency` exceeds it."""

    def __init__(self, api_base: str, routes: dict, clock=None, latency: float = 0.0):
        self.api_base = api_base
        self.routes = routes
        self.calls = []
        self.timeouts = []
        self.clock = clock
        self.latency = latency

    def __call__(self, method, url, headers, timeout):
        self.calls.append((method, url, dict(headers)))
        self.timeouts.append(timeout)
        if self.clock and self.latency:
            if self.latency > timeout:
                self.clock.t += timeout
                raise poll.TransientError(f"GET {url}: timed out")
            self.clock.t += self.latency
        parsed = urllib.parse.urlsplit(url)
        path = urllib.parse.unquote(parsed.path)[len(urllib.parse.urlsplit(self.api_base).path):]
        query = dict(urllib.parse.parse_qsl(parsed.query))
        if path not in self.routes:
            return poll.Response(404, {}, b'{"message":"404 Not found"}')
        route = self.routes[path]
        if callable(route):
            route = route()
        if isinstance(route, poll.Response):
            return route
        if isinstance(route, Paged):
            page = int(query.get("page", 1))
            body = route.pages[page - 1] if page <= len(route.pages) else []
            return poll.Response(200, {}, json.dumps(body).encode())
        return poll.Response(200, {}, json.dumps(route).encode())


class Paged:
    def __init__(self, *pages):
        self.pages = list(pages)


class Sequenced:
    """Returns successive values per call; the last repeats."""

    def __init__(self, *values):
        self.values = list(values)
        self.n = 0

    def __call__(self):
        value = self.values[min(self.n, len(self.values) - 1)]
        self.n += 1
        return value


class FakeClock:
    def __init__(self):
        self.t = 1000.0
        self.sleeps = []

    def now(self):
        return self.t

    def sleep(self, s):
        self.sleeps.append(s)
        self.t += s


def unauthorized():
    return poll.Response(401, {}, b'{"message":"401 Unauthorized"}')


GL_API = "https://gitlab.example.test/api/v4"
GL_MR = "/projects/grp/repo/merge_requests/12"


def gitlab_routes(**overrides):
    routes = {
        "/user": fixture("gitlab", "user"),
        GL_MR: fixture("gitlab", "mr"),
        f"{GL_MR}/discussions": Paged(fixture("gitlab", "discussions")),
        f"{GL_MR}/pipelines": fixture("gitlab", "pipelines_running"),
    }
    routes.update(overrides)
    return routes


class Harness:
    def __init__(self, routes, api=GL_API, environ=None, latency=0.0):
        self.clock = FakeClock()
        self.transport = FakeTransport(api, routes, self.clock, latency)
        self.stdout = []
        self.environ = {"API_TOKEN_ENV_VAR": TOKEN} if environ is None else environ

    def run(self, *argv):
        deps = poll.Deps(self.transport, self.environ, self.clock.now, self.clock.sleep, self.stdout.append)
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            code = poll.run(list(argv), deps)
        self.stderr = err.getvalue()
        self.result = json.loads(self.stdout[-1]) if self.stdout else None
        self.elapsed = self.clock.t - FakeClock().t
        return code


def gl_args(*extra, watch="pipeline", crs=("grp/repo:12",)):
    args = ["--host", "gitlab", "--watch", watch, "--api-base", GL_API, "--token-env", "API_TOKEN_ENV_VAR"]
    for cr in crs:
        args += ["--cr", cr]
    return args + list(extra)


# ── GET-only guard ───────────────────────────────────────────────────────────


class GetOnlyGuardTest(unittest.TestCase):
    def test_request_refuses_every_non_get_method_before_any_io(self):
        transport = FakeTransport(GL_API, {})
        for method in ("POST", "PUT", "PATCH", "DELETE", "HEAD", "get"):
            with self.subTest(method=method), self.assertRaises(poll.NonGetRequestError):
                poll.request(transport, method, f"{GL_API}/user", {})
        self.assertEqual(transport.calls, [])

    def test_network_transport_refuses_non_get(self):
        with self.assertRaises(poll.NonGetRequestError):
            poll.urllib_transport("POST", "http://127.0.0.1:9/never", {}, 1)

    def test_a_full_watch_issues_only_get_requests(self):
        h = Harness(gitlab_routes())
        h.run(*gl_args("--ignore-self", watch="cr-activity"))
        self.assertTrue(h.transport.calls)
        self.assertEqual({c[0] for c in h.transport.calls}, {"GET"})


# ── --cr / --fingerprint parsing ─────────────────────────────────────────────


class ParsingTest(unittest.TestCase):
    def test_cr_splits_on_the_last_colon(self):
        self.assertEqual(poll.parse_cr("grp/sub/repo:12"), poll.Target("grp/sub/repo", 12))
        self.assertEqual(poll.parse_cr("weird:name:7"), poll.Target("weird:name", 7))
        self.assertEqual(poll.parse_cr("42:3"), poll.Target("42", 3))

    def test_cr_rejects_malformed_entries(self):
        for bad in ("repo", "repo:", ":5", "repo:abc", "repo:0", "repo:-1"):
            with self.subTest(bad=bad), self.assertRaises(poll.UsageError):
                poll.parse_cr(bad)

    def test_fingerprint_accepts_comma_lists_and_repeats(self):
        fp = poll.parse_fingerprint(["a/b:1=0123456789abcdef,c/d:2=fedcba9876543210", "e:f:3=00000000000000ff"])
        self.assertEqual(fp, {"a/b:1": "0123456789abcdef", "c/d:2": "fedcba9876543210", "e:f:3": "00000000000000ff"})
        with self.assertRaises(poll.UsageError):
            poll.parse_fingerprint(["a/b:1=nothex"])

    def test_bad_arguments_exit_4(self):
        cases = {
            "bad --cr": gl_args(crs=("repo",)),
            "unknown host": ["--host", "bitbucket", "--watch", "pipeline", "--api-base", GL_API, "--cr", "a/b:1",
                             "--token-env", "API_TOKEN_ENV_VAR"],
            "max-wait over limit": gl_args("--max-wait", "600"),
            "missing required arg": ["--host", "gitlab"],
            "token value instead of name": gl_args()[:-4] + ["--token-env", "glpat-xyz.abc", "--cr", "grp/repo:12"],
            "bad api base": gl_args("--api-base", "gitlab.example.test"),
            "unknown project": gl_args(crs=("grp/missing:1",)),
        }
        for name, argv in cases.items():
            with self.subTest(name):
                h = Harness(gitlab_routes())
                self.assertEqual(h.run(*argv), poll.EXIT_USAGE)
                self.assertEqual(h.result["outcome"], "usage-error")

    def test_missing_token_exits_4_and_env_file_is_a_fallback(self):
        h = Harness(gitlab_routes(), environ={})
        self.assertEqual(h.run(*gl_args()), poll.EXIT_USAGE)
        with tempfile.TemporaryDirectory() as tmp:
            env = os.path.join(tmp, ".env")
            Path(env).write_text(f"# c\nOTHER=x\nexport API_TOKEN_ENV_VAR='{TOKEN}'\n")
            h = Harness(gitlab_routes(), environ={})
            self.assertEqual(h.run(*gl_args("--env-file", env)), poll.EXIT_CHANGED)
            self.assertEqual(h.transport.calls[0][2]["PRIVATE-TOKEN"], TOKEN)


# ── Pure fingerprint functions + self-identity filter, per host ──────────────


def fp(obs):
    return poll.digest(obs.material)


class GitLabFingerprintTest(unittest.TestCase):
    def test_pipeline_uses_latest_id_and_status(self):
        running = poll.gitlab_pipeline_observation(fixture("gitlab", "pipelines_running"))
        success = poll.gitlab_pipeline_observation(fixture("gitlab", "pipelines_success"))
        self.assertEqual(running.material, {"id": 11756, "status": "running"})
        self.assertEqual((running.summary["status"], running.summary["terminal"]), ("running", False))
        self.assertEqual((success.summary["status"], success.summary["terminal"]), ("success", True))
        self.assertNotEqual(fp(running), fp(success))
        self.assertEqual(poll.gitlab_pipeline_observation([]).summary["status"], "none")

    def test_skipped_pipeline_is_its_own_terminal_status(self):
        skipped = poll.gitlab_pipeline_observation([dict(fixture("gitlab", "pipelines_running")[0], status="skipped")])
        self.assertEqual((skipped.summary["status"], skipped.summary["terminal"]), ("skipped", True))
        canceled = poll.gitlab_pipeline_observation([dict(fixture("gitlab", "pipelines_running")[0], status="canceled")])
        self.assertEqual(canceled.summary["status"], "canceled")

    def test_own_reply_and_own_resolve_do_not_change_activity(self):
        mr, discussions = fixture("gitlab", "mr"), fixture("gitlab", "discussions")
        base = poll.gitlab_activity_observation(mr, discussions, SELF)
        self.assertEqual(base.material["latest_activity"], "2026-10-05T15:49:35.416000Z")

        replied = copy.deepcopy(discussions)
        replied[0]["notes"].append({"author": {"username": SELF}, "created_at": "2026-10-05T16:30:00Z",
                                    "updated_at": "2026-10-05T16:30:00Z"})
        replied[0]["notes"][0].update(resolved=True, resolved_by={"username": SELF},
                                      updated_at="2026-10-05T16:30:01.5Z", resolved_at="2026-10-05T16:30:01.5Z")
        self.assertEqual(fp(poll.gitlab_activity_observation(mr, replied, SELF)), fp(base))

    def test_foreign_comment_and_push_change_activity(self):
        mr, discussions = fixture("gitlab", "mr"), fixture("gitlab", "discussions")
        base = fp(poll.gitlab_activity_observation(mr, discussions, SELF))
        commented = copy.deepcopy(discussions)
        commented[0]["notes"].append({"author": {"username": "review-bot"}, "created_at": "2026-10-05T16:31:00Z",
                                      "updated_at": "2026-10-05T16:31:00Z"})
        self.assertNotEqual(fp(poll.gitlab_activity_observation(mr, commented, SELF)), base)
        pushed = dict(mr, sha="ffff")
        self.assertNotEqual(fp(poll.gitlab_activity_observation(pushed, discussions, SELF)), base)
        merged = dict(mr, state="merged")
        self.assertEqual(poll.gitlab_activity_observation(merged, discussions, SELF).summary["state"], "merged")

    def test_without_ignore_self_own_notes_count(self):
        mr, discussions = fixture("gitlab", "mr"), fixture("gitlab", "discussions")
        latest = poll.gitlab_activity_observation(mr, discussions, None).material["latest_activity"]
        self.assertEqual(latest, "2026-10-05T15:49:35.416000Z")  # system note is older; still counted
        replied = copy.deepcopy(discussions)
        replied[0]["notes"].append({"author": {"username": SELF}, "created_at": "2026-10-05T16:30:00Z"})
        self.assertNotEqual(fp(poll.gitlab_activity_observation(mr, replied, None)),
                            fp(poll.gitlab_activity_observation(mr, discussions, None)))


class GitHubFingerprintTest(unittest.TestCase):
    def test_pipeline_uses_head_sha_and_check_run_set(self):
        pr = fixture("github", "pr")
        running = poll.github_pipeline_observation(pr, fixture("github", "check_runs_running")["check_runs"])
        failed = poll.github_pipeline_observation(pr, fixture("github", "check_runs_failed")["check_runs"])
        self.assertEqual(running.summary["status"], "running")
        self.assertEqual((failed.summary["status"], failed.summary["terminal"]), ("failed", True))
        self.assertNotEqual(fp(running), fp(failed))
        new_head = poll.github_pipeline_observation(dict(pr, head={"sha": "ffff"}), fixture("github", "check_runs_running")["check_runs"])
        self.assertNotEqual(fp(new_head), fp(running))
        self.assertEqual(poll.github_pipeline_observation(pr, []).summary["status"], "none")

    def test_all_skipped_check_runs_report_skipped(self):
        pr = fixture("github", "pr")
        run = {"name": "lint", "id": 1, "status": "completed"}
        skipped = poll.github_pipeline_observation(pr, [dict(run, conclusion="skipped"), dict(run, id=2, conclusion="skipped")])
        self.assertEqual((skipped.summary["status"], skipped.summary["terminal"]), ("skipped", True))
        mixed = poll.github_pipeline_observation(pr, [dict(run, conclusion="skipped"), dict(run, id=2, conclusion="success")])
        self.assertEqual(mixed.summary["status"], "success")

    def test_self_identity_filter(self):
        pr, rc, rv, ic = (fixture("github", n) for n in ("pr", "review_comments", "reviews", "issue_comments"))
        base = poll.github_activity_observation(pr, rc, rv, ic, SELF)
        self.assertEqual(base.material["latest_activity"], "2026-10-05T15:49:40.000000Z")  # review, not own reply
        own = rc + [{"user": {"login": SELF}, "created_at": "2026-10-05T17:00:00Z", "updated_at": "2026-10-05T17:00:00Z"}]
        self.assertEqual(fp(poll.github_activity_observation(pr, own, rv, ic, SELF)), fp(base))
        foreign = ic + [{"user": {"login": "reviewer"}, "created_at": "2026-10-05T17:00:00Z", "updated_at": "2026-10-05T17:00:00Z"}]
        self.assertNotEqual(fp(poll.github_activity_observation(pr, rc, rv, foreign, SELF)), fp(base))
        merged = poll.github_activity_observation(dict(pr, state="closed", merged=True), rc, rv, ic, SELF)
        self.assertEqual(merged.summary["state"], "merged")


class GiteaFingerprintTest(unittest.TestCase):
    def test_pipeline_uses_head_sha_and_combined_state(self):
        pr = fixture("gitea", "pr")
        pending = poll.gitea_pipeline_observation(pr, fixture("gitea", "status_pending"))
        success = poll.gitea_pipeline_observation(pr, fixture("gitea", "status_success"))
        self.assertEqual(pending.material, {"head_sha": pr["head"]["sha"], "state": "pending"})
        self.assertEqual((success.summary["status"], success.summary["terminal"]), ("success", True))
        self.assertNotEqual(fp(pending), fp(success))
        self.assertEqual(poll.gitea_pipeline_observation(pr, {"state": "", "total_count": 0}).summary["status"], "none")

    def test_self_identity_filter_including_resolves(self):
        pr, reviews, ic = fixture("gitea", "pr"), fixture("gitea", "reviews"), fixture("gitea", "issue_comments")
        comments = fixture("gitea", "review_31_comments")
        base = poll.gitea_activity_observation(pr, reviews, comments, ic, SELF)
        self.assertEqual(base.material["latest_activity"], "2026-10-05T13:49:40.000000Z")  # +02:00 normalised to UTC
        resolved = copy.deepcopy(comments)
        resolved[0].update(resolver={"login": SELF}, updated_at="2026-10-05T18:00:00+02:00")
        self.assertEqual(fp(poll.gitea_activity_observation(pr, reviews, resolved, ic, SELF)), fp(base))
        edited = copy.deepcopy(comments)
        edited[0]["updated_at"] = "2026-10-05T18:00:00+02:00"
        self.assertNotEqual(fp(poll.gitea_activity_observation(pr, reviews, edited, ic, SELF)), fp(base))


class TimestampTest(unittest.TestCase):
    def test_mixed_precision_and_offsets_compare_correctly(self):
        a = poll.parse_ts("2026-10-05T12:00:00Z")
        b = poll.parse_ts("2026-10-05T12:00:00.5Z")
        c = poll.parse_ts("2026-10-05T14:00:00.123456789+02:00")
        self.assertLess(a, b)
        self.assertLess(c, b)
        self.assertIsNone(poll.parse_ts(None))
        with self.assertRaises(ValueError):
            poll.parse_ts("yesterday")


# ── Watch loop: exit codes via the injected transport and clock ──────────────


class WatchLoopTest(unittest.TestCase):
    def baseline(self, watch="pipeline", routes=None, crs=("grp/repo:12",)):
        h = Harness(routes or gitlab_routes())
        self.assertEqual(h.run(*gl_args("--ignore-self", watch=watch, crs=crs)), poll.EXIT_CHANGED)
        return h.result["fingerprint"]

    def test_no_fingerprint_reports_current_state_at_once(self):
        h = Harness(gitlab_routes())
        self.assertEqual(h.run(*gl_args()), poll.EXIT_CHANGED)
        self.assertEqual(h.result["changed"], ["grp/repo:12"])
        self.assertEqual(h.result["targets"]["grp/repo:12"]["summary"]["status"], "running")
        self.assertEqual(h.clock.sleeps, [])

    def test_pipeline_finishing_wakes_with_the_changed_target(self):
        prev = self.baseline()
        pipes = Sequenced(fixture("gitlab", "pipelines_running"), fixture("gitlab", "pipelines_running"),
                          fixture("gitlab", "pipelines_success"))
        h = Harness(gitlab_routes(**{f"{GL_MR}/pipelines": pipes}))
        self.assertEqual(h.run(*gl_args("--fingerprint", prev)), poll.EXIT_CHANGED)
        self.assertEqual(h.result["outcome"], "changed")
        self.assertEqual(h.result["changed"], ["grp/repo:12"])
        self.assertTrue(h.result["targets"]["grp/repo:12"]["summary"]["terminal"])
        self.assertNotEqual(h.result["fingerprint"], prev)
        self.assertEqual(h.clock.sleeps, [60, 90])

    def test_unchanged_state_ends_the_chunk_within_max_wait_with_backoff(self):
        prev = self.baseline()
        h = Harness(gitlab_routes())
        self.assertEqual(h.run(*gl_args("--fingerprint", prev)), poll.EXIT_MAX_WAIT)
        self.assertEqual(h.result["outcome"], "max-wait")
        self.assertEqual(h.result["fingerprint"], prev)  # resume from the same fingerprint
        self.assertEqual(h.clock.sleeps[:4], [60, 90, 135, 202.5])
        self.assertLessEqual(sum(h.clock.sleeps), poll.MAX_WAIT_LIMIT)
        self.assertLessEqual(h.result["elapsed_s"], poll.MAX_WAIT_LIMIT)

    def test_backoff_caps_and_interval_option(self):
        prev = self.baseline()
        h = Harness(gitlab_routes())
        self.assertEqual(h.run(*gl_args("--fingerprint", prev, "--interval", "200", "--max-interval", "250")),
                         poll.EXIT_MAX_WAIT)
        self.assertEqual(h.clock.sleeps, [200, 250, 90])

    def test_cr_activity_default_interval_is_90(self):
        prev = self.baseline(watch="cr-activity")
        h = Harness(gitlab_routes())
        h.run(*gl_args("--ignore-self", "--fingerprint", prev, "--max-wait", "100", watch="cr-activity"))
        self.assertEqual(h.clock.sleeps, [90, 10])

    def test_own_reply_keeps_waiting_and_reviewer_comment_wakes(self):
        prev = self.baseline(watch="cr-activity")
        own = fixture("gitlab", "discussions") + [{"id": "d3", "notes": [
            {"author": {"username": SELF}, "created_at": "2026-10-05T17:00:00Z", "updated_at": "2026-10-05T17:00:00Z"}]}]
        h = Harness(gitlab_routes(**{f"{GL_MR}/discussions": Paged(own)}))
        self.assertEqual(h.run(*gl_args("--ignore-self", "--fingerprint", prev, watch="cr-activity")), poll.EXIT_MAX_WAIT)

        foreign = own + [{"id": "d4", "notes": [
            {"author": {"username": "review-bot"}, "created_at": "2026-10-05T17:05:00Z", "updated_at": "2026-10-05T17:05:00Z"}]}]
        h = Harness(gitlab_routes(**{f"{GL_MR}/discussions": Sequenced(Paged(own), Paged(foreign))}))
        self.assertEqual(h.run(*gl_args("--ignore-self", "--fingerprint", prev, watch="cr-activity")), poll.EXIT_CHANGED)
        self.assertEqual(h.result["changed"], ["grp/repo:12"])

    def test_discussions_are_read_across_all_pages(self):
        page1 = [{"id": f"x{i}", "notes": [{"author": {"username": SELF}, "created_at": "2026-10-05T10:00:00Z"}]}
                 for i in range(100)]
        page2 = [{"id": "late", "notes": [{"author": {"username": "review-bot"}, "created_at": "2026-10-06T09:00:00Z"}]}]
        h = Harness(gitlab_routes(**{f"{GL_MR}/discussions": Paged(page1, page2)}))
        h.run(*gl_args("--ignore-self", watch="cr-activity"))
        self.assertEqual(h.result["targets"]["grp/repo:12"]["summary"]["latest_activity"], "2026-10-06T09:00:00.000000Z")

    def test_multi_cr_reports_only_the_changed_one(self):
        other = "/projects/grp/other/merge_requests/3"
        routes = gitlab_routes(**{other: fixture("gitlab", "mr"), f"{other}/discussions": Paged(fixture("gitlab", "discussions"))})
        crs = ("grp/repo:12", "grp/other:3")
        prev = self.baseline(watch="cr-activity", routes=routes, crs=crs)
        routes[other] = Sequenced(fixture("gitlab", "mr"), dict(fixture("gitlab", "mr"), sha="ffff"))
        h = Harness(routes)
        self.assertEqual(h.run(*gl_args("--ignore-self", "--fingerprint", prev, watch="cr-activity", crs=crs)),
                         poll.EXIT_CHANGED)
        self.assertEqual(h.result["changed"], ["grp/other:3"])
        self.assertEqual(set(h.result["targets"]), set(crs))

    def test_target_missing_from_fingerprint_is_reported_at_once(self):
        prev = self.baseline()
        h = Harness(gitlab_routes(**{"/projects/grp/other/merge_requests/3/pipelines": fixture("gitlab", "pipelines_success")}))
        self.assertEqual(h.run(*gl_args("--fingerprint", prev, crs=("grp/repo:12", "grp/other:3"))), poll.EXIT_CHANGED)
        self.assertEqual(h.result["changed"], ["grp/other:3"])

    def test_transient_401_keeps_waiting_and_is_logged(self):
        prev = self.baseline()
        pipes = Sequenced(unauthorized(), fixture("gitlab", "pipelines_running"), unauthorized(),
                          fixture("gitlab", "pipelines_running"))
        h = Harness(gitlab_routes(**{f"{GL_MR}/pipelines": pipes}))
        self.assertEqual(h.run(*gl_args("--fingerprint", prev)), poll.EXIT_MAX_WAIT)
        self.assertEqual(h.stderr.count("authentication rejected"), 2)
        self.assertIn("HTTP 401", h.stderr)

    def test_5xx_and_network_errors_keep_waiting_and_are_logged(self):
        prev = self.baseline()

        def network_down():
            raise poll.TransientError("GET x: connection refused")

        pipes = Sequenced(poll.Response(502, {}, b"bad gateway"), poll.Response(200, {}, b"<html>"),
                          fixture("gitlab", "pipelines_success"))
        transport_routes = gitlab_routes(**{f"{GL_MR}/pipelines": pipes})
        h = Harness(transport_routes)
        self.assertEqual(h.run(*gl_args("--fingerprint", prev)), poll.EXIT_CHANGED)
        self.assertIn("HTTP 502", h.stderr)
        self.assertIn("not JSON", h.stderr)

        h = Harness(gitlab_routes(**{f"{GL_MR}/pipelines": network_down}))
        self.assertEqual(h.run(*gl_args("--fingerprint", prev, "--max-wait", "60")), poll.EXIT_MAX_WAIT)
        self.assertIn("connection refused", h.stderr)

    def test_rate_limited_403_is_transient_not_auth(self):
        prev = self.baseline()
        limited = poll.Response(403, {"x-ratelimit-remaining": "0"}, b"{}")
        h = Harness(gitlab_routes(**{f"{GL_MR}/pipelines": limited}))
        self.assertEqual(h.run(*gl_args("--fingerprint", prev)), poll.EXIT_MAX_WAIT)
        self.assertIn("transient", h.stderr)

    def test_consecutive_401s_exit_3_distinct_from_timeout(self):
        prev = self.baseline()
        h = Harness(gitlab_routes(**{f"{GL_MR}/pipelines": unauthorized()}))
        self.assertEqual(h.run(*gl_args("--fingerprint", prev)), poll.EXIT_AUTH)
        self.assertEqual(h.result["outcome"], "auth-failure")
        self.assertEqual(len(h.clock.sleeps), poll.DEFAULT_MAX_AUTH_FAILURES - 1)
        h = Harness(gitlab_routes(**{f"{GL_MR}/pipelines": unauthorized()}))
        self.assertEqual(h.run(*gl_args("--fingerprint", prev, "--max-auth-failures", "5")), poll.EXIT_AUTH)
        self.assertEqual(len(h.clock.sleeps), 4)

    def test_startup_identity_lookup_failures(self):
        h = Harness(gitlab_routes(**{"/user": unauthorized()}))
        self.assertEqual(h.run(*gl_args("--ignore-self")), poll.EXIT_AUTH)
        h = Harness(gitlab_routes(**{"/user": poll.Response(404, {}, b"{}")}))
        self.assertEqual(h.run(*gl_args("--ignore-self")), poll.EXIT_USAGE)
        h = Harness(gitlab_routes(**{"/user": poll.Response(503, {}, b"")}))
        self.assertEqual(h.run(*gl_args("--ignore-self")), poll.EXIT_USAGE)
        self.assertEqual(h.stderr.count("identity lookup failed"), poll.STARTUP_RETRIES)
        h = Harness(gitlab_routes(**{"/user": Sequenced(poll.Response(503, {}, b""), fixture("gitlab", "user"))}))
        self.assertEqual(h.run(*gl_args("--ignore-self")), poll.EXIT_CHANGED)

    def test_fingerprint_survives_compaction_roundtrip(self):
        """A fingerprint stored in a state file and passed back resumes without a spurious wake."""
        prev = self.baseline(watch="cr-activity")
        state = json.loads(json.dumps({"loop": {"last_fingerprint_activity": prev}}))
        h = Harness(gitlab_routes())
        code = h.run(*gl_args("--ignore-self", "--fingerprint", state["loop"]["last_fingerprint_activity"], watch="cr-activity"))
        self.assertEqual(code, poll.EXIT_MAX_WAIT)
        entry = h.result["targets"]["grp/repo:12"]["fingerprint"]
        self.assertEqual(poll.parse_fingerprint([entry]), poll.parse_fingerprint([prev]))

    def test_fingerprint_of_the_other_watch_kind_reports_current_state(self):
        """A pipeline fingerprint passed to a cr-activity watch is just a non-matching entry."""
        pipeline_fp = self.baseline(watch="pipeline")
        h = Harness(gitlab_routes())
        self.assertEqual(h.run(*gl_args("--ignore-self", "--fingerprint", pipeline_fp, watch="cr-activity")),
                         poll.EXIT_CHANGED)
        self.assertEqual(h.result["changed"], ["grp/repo:12"])
        self.assertEqual(h.result["targets"]["grp/repo:12"]["summary"]["state"], "open")
        self.assertEqual(h.clock.sleeps, [])
        self.assertEqual(h.result["fingerprint"], self.baseline(watch="cr-activity"))

    def test_token_never_printed(self):
        h = Harness(gitlab_routes(**{f"{GL_MR}/pipelines": unauthorized()}))
        h.run(*gl_args())
        self.assertNotIn(TOKEN, "".join(h.stdout) + h.stderr)


class ChunkDeadlineTest(unittest.TestCase):
    """--max-wait bounds the whole chunk, start-up lookup and request time included."""

    OTHER = "/projects/grp/other/merge_requests/3"
    CRS = ("grp/repo:12", "grp/other:3")

    def routes(self):
        return gitlab_routes(**{self.OTHER: fixture("gitlab", "mr"),
                                f"{self.OTHER}/discussions": Paged(fixture("gitlab", "discussions")),
                                f"{self.OTHER}/pipelines": fixture("gitlab", "pipelines_running")})

    def baseline(self, watch):
        h = Harness(self.routes())
        self.assertEqual(h.run(*gl_args("--ignore-self", watch=watch, crs=self.CRS)), poll.EXIT_CHANGED)
        return h.result["fingerprint"]

    def assertWithinMaxWait(self, h, max_wait):
        self.assertLessEqual(h.elapsed, max_wait + 1e-9)

    def test_slow_requests_across_two_crs_end_within_max_wait(self):
        prev = self.baseline("cr-activity")
        h = Harness(self.routes(), latency=1.0)
        code = h.run(*gl_args("--ignore-self", "--fingerprint", prev, "--max-wait", "3", watch="cr-activity", crs=self.CRS))
        self.assertEqual(code, poll.EXIT_MAX_WAIT)
        self.assertWithinMaxWait(h, 3)
        self.assertEqual(h.result["fingerprint"], prev)  # the unread CR keeps its previous entry
        self.assertIn("max-wait reached before grp/other:3", h.stderr)

    def test_identity_lookup_and_its_retries_count_against_max_wait(self):
        h = Harness(gitlab_routes(**{"/user": poll.Response(503, {}, b"")}), latency=1.0)
        prev = "grp/repo:12=0123456789abcdef"
        self.assertEqual(h.run(*gl_args("--ignore-self", "--fingerprint", prev, "--max-wait", "4")), poll.EXIT_MAX_WAIT)
        self.assertWithinMaxWait(h, 4)
        self.assertEqual(h.clock.sleeps, [3.0])  # retry delay clamped to the time left
        self.assertEqual(h.result["fingerprint"], prev)
        self.assertEqual(h.result["changed"], [])

    def test_request_timeout_is_clamped_to_the_time_left(self):
        prev = self.baseline("pipeline")
        h = Harness(self.routes(), latency=30.0)  # every request hangs past its timeout
        code = h.run(*gl_args("--fingerprint", prev, "--max-wait", "25", crs=self.CRS))
        self.assertEqual(code, poll.EXIT_MAX_WAIT)
        self.assertEqual(h.transport.timeouts, [poll.REQUEST_TIMEOUT_S, 5.0])
        self.assertWithinMaxWait(h, 25)
        self.assertEqual(h.result["fingerprint"], prev)

    def test_no_request_starts_with_too_little_time_left(self):
        prev = self.baseline("pipeline")
        h = Harness(self.routes(), latency=1.0)
        self.assertEqual(h.run(*gl_args("--fingerprint", prev, "--max-wait", "1.2", crs=self.CRS)), poll.EXIT_MAX_WAIT)
        self.assertEqual(len(h.transport.calls), 1)
        self.assertWithinMaxWait(h, 1.2)

    def test_cut_short_poll_reports_only_real_changes(self):
        prev = self.baseline("pipeline")
        routes = self.routes()
        routes[f"{GL_MR}/pipelines"] = fixture("gitlab", "pipelines_success")
        h = Harness(routes, latency=1.0)
        self.assertEqual(h.run(*gl_args("--fingerprint", prev, "--max-wait", "1.2", crs=self.CRS)), poll.EXIT_CHANGED)
        self.assertEqual(h.result["changed"], ["grp/repo:12"])
        self.assertIn(poll.parse_fingerprint([prev])["grp/other:3"], h.result["fingerprint"])

    def test_unread_target_without_a_previous_entry_is_not_reported_changed(self):
        prev = self.baseline("pipeline").split(",")
        repo_only = next(e for e in prev if e.startswith("grp/repo:12="))
        h = Harness(self.routes(), latency=1.0)
        self.assertEqual(h.run(*gl_args("--fingerprint", repo_only, "--max-wait", "1.2", crs=self.CRS)), poll.EXIT_MAX_WAIT)
        self.assertEqual(h.result["changed"], [])
        self.assertEqual(h.result["fingerprint"], repo_only)


class HostAdapterTest(unittest.TestCase):
    """The GitHub and Gitea adapters hit the documented endpoints and shape the responses."""

    def test_github_pipeline_and_activity(self):
        api = "https://api.github.example.test"
        routes = {
            "/user": fixture("github", "user"),
            "/repos/grp/repo/pulls/12": fixture("github", "pr"),
            "/repos/grp/repo/commits/aaaa111122223333444455556666777788889999/check-runs": fixture("github", "check_runs_failed"),
            "/repos/grp/repo/pulls/12/comments": Paged(fixture("github", "review_comments")),
            "/repos/grp/repo/pulls/12/reviews": Paged(fixture("github", "reviews")),
            "/repos/grp/repo/issues/12/comments": Paged(fixture("github", "issue_comments")),
        }
        base = ["--host", "github", "--api-base", api, "--cr", "grp/repo:12", "--token-env", "API_TOKEN_ENV_VAR"]
        h = Harness(routes, api=api)
        self.assertEqual(h.run(*base, "--watch", "pipeline"), poll.EXIT_CHANGED)
        self.assertEqual(h.result["targets"]["grp/repo:12"]["summary"]["status"], "failed")
        self.assertEqual(h.transport.calls[0][2]["Authorization"], f"Bearer {TOKEN}")
        h = Harness(routes, api=api)
        self.assertEqual(h.run(*base, "--watch", "cr-activity", "--ignore-self"), poll.EXIT_CHANGED)
        self.assertEqual(h.result["targets"]["grp/repo:12"]["summary"]["latest_activity"], "2026-10-05T15:49:40.000000Z")

    def test_gitea_pipeline_and_activity(self):
        api = "https://gitea.example.test/api/v1"
        routes = {
            "/user": fixture("gitea", "user"),
            "/repos/grp/repo/pulls/12": fixture("gitea", "pr"),
            "/repos/grp/repo/commits/aaaa111122223333444455556666777788889999/status": fixture("gitea", "status_pending"),
            "/repos/grp/repo/pulls/12/reviews": Paged(fixture("gitea", "reviews")),
            "/repos/grp/repo/pulls/12/reviews/31/comments": fixture("gitea", "review_31_comments"),
            "/repos/grp/repo/pulls/12/reviews/32/comments": fixture("gitea", "review_32_comments"),
            "/repos/grp/repo/issues/12/comments": Paged(fixture("gitea", "issue_comments")),
        }
        base = ["--host", "gitea", "--api-base", api, "--cr", "grp/repo:12", "--token-env", "API_TOKEN_ENV_VAR"]
        h = Harness(routes, api=api)
        self.assertEqual(h.run(*base, "--watch", "pipeline"), poll.EXIT_CHANGED)
        self.assertEqual(h.result["targets"]["grp/repo:12"]["summary"]["status"], "running")
        self.assertEqual(h.transport.calls[0][2]["Authorization"], f"token {TOKEN}")
        h = Harness(routes, api=api)
        self.assertEqual(h.run(*base, "--watch", "cr-activity", "--ignore-self"), poll.EXIT_CHANGED)
        self.assertEqual(h.result["targets"]["grp/repo:12"]["summary"]["latest_activity"], "2026-10-05T13:49:40.000000Z")


if __name__ == "__main__":
    unittest.main()
