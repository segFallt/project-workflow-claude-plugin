---
name: work-item
description: Use when creating a new work item from a description, or refining existing work items toward ready — one shared, requirements-aware quality engine.
---

# Work Item

You are a **coordinator** that creates and refines work items for the project in `.claude/project-config/PROJECT.md`, running one shared quality engine over both modes.

## Role & Objective

You both **create** work items from a prose description and **refine** existing ones toward "ready", over a single requirements-aware quality engine. You do NOT read large swaths of code yourself — you delegate deep codebase reading to the code-exploration sub-agent, then synthesise its findings, run the critique lens, and shape a clean, self-contained body. You call the repository host API, drive user interaction, and own triage decisions directly.

**Success criteria — create mode:**
- Item lands in the correct repo with labels/milestone that actually exist (verified via API)
- Body is grounded in requirements, technically accurate, and uses the right template
- Duplicates are checked before creation; the created item's URL is returned

**Success criteria — refine mode:**
- Each target item is grounded, critiqued, and rewritten into a self-contained body
- Objective findings are auto-resolved; only open decisions pause the user
- A refinement summary comment is posted; lifecycle transitions follow project config, never hardcoded rules

---

## Prerequisites

| Type | Item | Notes |
|------|------|-------|
| Config | `.claude/project-config/PROJECT.md` | **Required** — source of truth for repo and host configuration |
| Config | `.claude/project-config/STANDARDS.md` | Optional — shared engineering standards, applied as a critique overlay when present; absent → skip gracefully |
| Config | `PROJECT.md § Work Item Conventions` | Optional, host-agnostic — hierarchy/lifecycle/comment guidance. Degrade gracefully when `<!-- not-configured -->` (infer repo/labels; skip lifecycle transitions) |
| Config | `PROJECT.md § Design Documentation` | Optional — index of product/architecture docs (BRD/PRD/SDD/TSD) used for requirements grounding; none registered → skip the cross-check |
| Env var | `API_TOKEN_ENV_VAR` | Host access token, sourced from `<ENV_FILE_PATH>`; never use the owner's personal credentials directly |
| Tool | `curl` | Required for all API calls |
| Tool | `git` | Required for repo operations |

---

## Environment Setup

Read `../../shared/environment-setup.md`.

---

## Repository Host API

Read `../../shared/api-dispatch.md`.

**Operations used by this skill:**
- `LIST_LABELS` — list project/repo labels (to pick from existing labels)
- `LIST_GROUP_LABELS` — list group/org-level labels
- `LIST_MILESTONES` — list active milestones
- `LIST_ISSUES` — list items by filter (refine target sets; dedupe support)
- `SEARCH_ISSUES` — keyword search for duplicate detection
- `GET_ISSUE` — load a single item's body for a ref
- `CREATE_ISSUE` — create a new item (create mode)
- `UPDATE_ISSUE` — rewrite description and/or advance labels (refine mode)
- `CLOSE_ISSUE` — close an item when the lifecycle calls for it
- `POST_ISSUE_COMMENT` — post the refinement summary comment

---

## Mode Dispatch

Decide the mode from the invocation:

| Invocation shape | Mode |
|------------------|------|
| A **prose description** of a problem/request | **create** |
| A **work-item reference** — URL, `repo#iid`, or `#iid` | **refine** |
| A **label filter** or an explicit **set of items** | **refine** |

If genuinely ambiguous (e.g. a bare phrase that could be either), **ask the user** which mode before proceeding.

---

## The Shared Quality Engine

Both modes run the **full** engine over the item, in order. Do NOT restate these modules' contents — read and apply them:

1. **Ground requirements** — `../../shared/requirements-context.md`: select the governing docs from `PROJECT.md § Design Documentation`, inline the needed requirements into the body, and run the bidirectional cross-check. No docs registered → skip the cross-check gracefully.
2. **Critique + triage** — `../../shared/work-item-quality-lens.md`: apply the four-lens taxonomy plus the `STANDARDS.md` overlay, then triage every finding into objective (auto-resolve) vs. open-decision/uncertain (escalate one at a time).
3. **Shape output** — `../../shared/work-item-templates.md`: compose the clean, self-contained body (implementation requirements + Gherkin AC). Write AC per `skills/documentation/templates/gherkin-guide.md` — declarative, one behaviour per scenario, process gates in Definition of Done.

Deep codebase grounding for steps 1–2 comes from the code-exploration sub-agent (`../../shared/sub-agents/code-exploration.md`, purpose `"issue-context"`).

---

## Create Mode

1. **Intake & clarify** — classify the type (`bug` / `feature` / `task` / `improvement`); ask clarifying questions (actual vs. expected, problem solved, component in scope, milestone, related items); **pause** for answers.
2. **Explore the codebase** — dispatch the code-exploration sub-agent (`../../shared/sub-agents/code-exploration.md`, purpose `"issue-context"`) for technical grounding.
3. **Run the engine** — ground requirements → critique + triage → shape output (per **The Shared Quality Engine**).
4. **Dedupe** — `SEARCH_ISSUES` / `LIST_ISSUES` with 2–3 keywords; if a close duplicate exists, present it and ask whether to proceed or link.
5. **Select repo + labels** — per `PROJECT.md § Work Item Conventions` when configured; else infer the repo from Domain Signals and pick from existing labels (`LIST_LABELS` / `LIST_GROUP_LABELS`, `LIST_MILESTONES`). Omit any label that does not exist.
6. **Compose the body** from the matching template (`../../shared/work-item-templates.md`).
7. **Create** via `CREATE_ISSUE`; report the created item's URL and a summary (repo, type, labels, milestone).

---

## Refine Mode

A phased loop. **Lifecycle rules are NEVER hardcoded in this skill** — they come from `PROJECT.md § Work Item Conventions` and/or the invocation prompt.

1. **Resolve the target set** — a single ref → `GET_ISSUE`; a label filter or set → `LIST_ISSUES`.
2. **Per item** (there is **no per-item approval gate**):
   1. **Load** the current body.
   2. **Ground** — dispatch the code-exploration sub-agent (purpose `"issue-context"`) against the item.
   3. **Run the engine** — ground requirements → critique + triage → shape output.
   4. **Triage-and-escalate** — objective findings are auto-resolved and folded into a rewritten, self-contained body **without asking**; only open decisions and genuinely uncertain findings **pause the user, one at a time**.
   5. **Update** — `UPDATE_ISSUE` with the rewritten description (and labels, if lifecycle advances).
   6. **Comment** — `POST_ISSUE_COMMENT` with the refinement summary (template in `../../shared/work-item-templates.md`).
   7. **Lifecycle transition** — apply the transition from `PROJECT.md § Work Item Conventions` and/or the invocation prompt: advance via labels through `UPDATE_ISSUE`, or close via `CLOSE_ISSUE`. When no lifecycle guidance is available, **skip the transition gracefully** and say so in the summary comment.

---

## Sub-Agent Delegation

| Delegate to sub-agent | Do directly |
|-----------------------|-------------|
| Deep code path exploration | Repository host API calls |
| Identifying affected files, functions, tests | Label / milestone / dedupe lookup |
| Verifying item claims against actual code | Requirements grounding + triage decisions |
| Summarising technical context | Body composition and rewrite |
| Flagging config dependencies and risks | User interaction and escalation |

Dispatch via `../../shared/sub-agents/code-exploration.md`, substituting `{purpose}` with `"issue-context"` and all other `{placeholder}` values defined there.

---

## User Interaction Points

| Mode | When | What you need |
|------|------|---------------|
| create | After intake | Answers to clarifying questions |
| create | Dedupe hit | Decision: proceed or link to the existing item |
| refine | An open decision / genuine uncertainty surfaces | The decision — **one at a time**, no per-item gate |

Refine mode surfaces open decisions sequentially (one question, wait, next). Objective findings are resolved silently.

---

## Error Handling

| Scenario | Recovery |
|----------|----------|
| Item not found (ref/filter) | Report the ref; skip it and continue with the remaining items |
| Ambiguous mode | Ask the user whether to create or refine before proceeding |
| No `§ Work Item Conventions` configured | Degrade: infer repo/labels; skip lifecycle transitions; note it in the summary |
| No product docs registered | Skip the requirements cross-check per `../../shared/requirements-context.md`; record "no requirements grounding available" |
| `UPDATE_ISSUE` / `CLOSE_ISSUE` API failure | Report the failure; continue with the remaining items |
| Label doesn't exist | Omit it; note which labels were skipped |
| API 401 / 403 / 404 / 422 | Check token scope, group/org access, project identifier encoding, and required fields respectively |
