# Product Requirements Document — Cost-Controlled Skill Execution

> PRD plus its Gherkin acceptance criteria are the mandatory core of the framework (see `shared/documentation-taxonomy.md`). The design that implements this PRD is in the [SDD](../design/cost-controls.md).

## Summary

The plugin's skills lower their token and model cost without lowering the quality of code-writing and approval decisions. Read-heavy sub-agents run on a cheaper model tier by default, and projects can override the tiers in `PROJECT.md`. Waiting on CI and review activity no longer costs a model turn per poll. Coordinators read only the host-API sections they need. `development` merges a change request only when told to, explicitly.

## Problem & context

Before this feature the plugin had no cost controls. Sub-agent models were unpinned: often the session model, usually the most expensive one, and sometimes picked ad hoc by the coordinator. So read-heavy work did not reliably run on a cheaper tier, and code-writing work sometimes ran on a weaker one. `development` and `code-review` waited on CI and review feedback with timed polls, and each poll was a full coordinator turn that re-read a large context. Coordinators loaded a whole host-API skill, several hundred lines, to use one operation. A measured baseline showed these as the main cost drivers (see the SDD). The baseline also showed `development` merging a change request on its own, which the skill must not do.

## Users

Project owners and operators who configure a project with this plugin and run its skills (`work-item`, `development`, `code-review`, the testing skills) interactively or in unattended loops. They want predictable cost, control over which model does which kind of work, and no surprise actions on their repositories.

## Goals & non-goals

- **Goals:** Lower the cost of skill runs. Choose sub-agent models by task type, with plugin defaults a project can override. Stop spending model turns on polling. Load only the host-API sections a step needs. Keep run outcomes the same as before. Keep merges under the operator's explicit control.
- **Non-goals:** Setting `model:` or `effort:` in skill frontmatter. Using `disable-model-invocation` to hide skills. Changing which skills exist or what they produce.

## Requirements

### Agent Model Tiering

1. `PROJECT.md` supports an optional `## Agent Model Tiering` section. A project without it, or with the section marked not configured, uses the plugin defaults.
2. The section is a table of tier keys and values. The allowed keys are `code-exploration`, `doc-authoring`, `test-writing`, `implementation`, `review-feedback`, `bug-fix`, `code-review-initial` and `code-review-re-review`.
3. The allowed values are `haiku`, `sonnet`, `opus` and `inherit`.
4. A table may list only some keys. Keys not listed use the plugin default.
5. An unknown key or an invalid value is ignored with one warning, and that key uses the next rule in the resolution order.
6. `init` shows the default table, accepts only the listed keys and values, and migrates an existing `PROJECT.md` to add the section.
7. The default tier is `sonnet` for `code-exploration`, `doc-authoring` and `test-writing`. It is `inherit` for `implementation`, `review-feedback`, `bug-fix`, `code-review-initial` and `code-review-re-review`.
8. A plugin default never runs a sub-agent on a higher tier than the session model. When the default is higher, or the session model cannot be determined, the sub-agent inherits the session model.
9. A value set in `PROJECT.md` is used as written and is not capped at the session model.
10. If the user's `CLAUDE_CODE_SUBAGENT_MODEL` environment variable is set to a model other than `inherit`, the plugin does not pass a model, so the user's setting applies. A `PROJECT.md` value takes precedence over it. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` overrides everything, as the platform defines.
11. A dispatch that has no tier key passes no model, so it uses `CLAUDE_CODE_SUBAGENT_MODEL` when that is set and the session model otherwise. A coordinator never picks a sub-agent model on its own.

### Waiting on CI and review activity

12. `development` and `code-review` wait for pipeline or review changes with a bundled poll script, in foreground chunks of at most 540 seconds. They take a model turn per chunk, not per poll, and act only when the script reports a change.
13. The poll script ignores activity by the identity that owns the token, so a skill's own comments do not wake it.
14. `development` treats a pipeline as stuck when 20 minutes of waiting pass with no terminal status. It then follows its CI-stuck path and reports to the user.
15. When the host rejects the token repeatedly, the wait stops and the skill tells the user. It does not retry unchanged.
16. `python3` (standard library only) is a documented prerequisite. The README and the skills' Prerequisites document a permanent `permissions.allow` rule for the poll script, because the skill's own pre-approval lasts only for the turn that invokes it.

### Host-API reads

17. A coordinator that needs a repository-host operation reads only the sections for that operation and the sections it depends on, not the whole host-API skill.
18. A missing host-API file or section stops the run with a report.

### Merging

19. `development` merges a change request only on an explicit, unambiguous instruction naming that change request, given in reply to its readiness report. It never proposes a merge, and a general reply such as "proceed" is not consent.
20. The readiness report states the change request's head commit. An explicit merge proceeds only if the pipeline succeeded, the host reports the change request mergeable, and the head still equals the reported one.
21. `development` never approves change requests. That belongs to `code-review`.

### Verification

22. Each cost lever is re-measured against the recorded baseline. The scenario a lever targets must come in below its reference band. `development` and `code-review` overall must stay within or below their band, or the excess is attributed to a resolved sub-agent tier. Run outcomes stay the same kind as the baseline's.

## Acceptance criteria

Behavioural criteria are written as Gherkin scenarios (see `gherkin-guide.md`). Keep `.feature` blocks valid so they can drive checks. Process/DoD gates (lint, tests, docs) go in the Definition of Done below, not in Given/When/Then.

```gherkin
Feature: Cost-controlled skill execution

  Scenario: Read-heavy sub-agents run on a cheaper default tier
    Given a project with no Agent Model Tiering configuration
    And CLAUDE_CODE_SUBAGENT_MODEL is not set
    And the session model is at or above the default tier for code-exploration
    When a coordinator dispatches the code-exploration sub-agent
    Then the dispatch uses the plugin's default tier for code-exploration

  Scenario: Code-writing sub-agents inherit the session model by default
    Given a project with no Agent Model Tiering configuration
    And CLAUDE_CODE_SUBAGENT_MODEL is not set
    When a coordinator dispatches the implementation sub-agent
    Then the sub-agent runs on the session model

  Scenario: A project overrides a sub-agent's tier
    Given PROJECT.md configures a tier for a sub-agent
    When a coordinator dispatches that sub-agent
    Then the dispatch uses the configured tier instead of the plugin default

  Scenario: A partial tier table leaves other keys on their defaults
    Given PROJECT.md configures a tier for one sub-agent only
    And CLAUDE_CODE_SUBAGENT_MODEL is not set
    And the session model is at or above the other sub-agent's default tier
    When a coordinator dispatches a different sub-agent
    Then the dispatch uses the plugin default for that sub-agent

  Scenario: An invalid tier value is ignored with a warning
    Given PROJECT.md configures a tier value that is not an allowed alias
    And CLAUDE_CODE_SUBAGENT_MODEL is not set
    And the session model is at or above that sub-agent's default tier
    When a coordinator dispatches that sub-agent
    Then one warning names the invalid value
    And the dispatch uses the plugin default for that sub-agent

  Scenario: A default tier never exceeds the session model
    Given a session running on a model of a lower tier than a sub-agent's plugin default
    And CLAUDE_CODE_SUBAGENT_MODEL is not set
    When a coordinator dispatches that sub-agent without a PROJECT.md override
    Then the sub-agent runs on the session model

  Scenario: The user's sub-agent model setting applies over plugin defaults
    Given the CLAUDE_CODE_SUBAGENT_MODEL environment variable names a model
    And PROJECT.md configures no tier for the sub-agent
    When a coordinator dispatches that sub-agent
    Then the sub-agent runs on the model the environment variable names

  Scenario: A PROJECT.md tier takes precedence over the user's sub-agent model setting
    Given the CLAUDE_CODE_SUBAGENT_MODEL environment variable names a model
    And PROJECT.md configures a tier for the sub-agent
    When a coordinator dispatches that sub-agent
    Then the dispatch uses the tier configured in PROJECT.md

  Scenario: Waiting on CI spends no model turn per poll
    Given a change request whose pipeline is still running
    When the development skill waits for the pipeline result
    Then the coordinator takes at most one turn per wait chunk instead of one per poll
    And it acts on the pipeline only after its state changes

  Scenario: A pipeline with no result is reported as stuck
    Given a change request whose pipeline reaches no terminal status within 20 minutes of waiting
    When the development skill finishes waiting
    Then the skill reports that CI is stuck

  Scenario: A rejected token stops the wait
    Given the repository host repeatedly rejects the access token while the skill waits
    When the poll script gives up
    Then the skill stops waiting and tells the user the token was rejected

  Scenario: The skill's own comments do not end a review wait
    Given the skill is waiting for review feedback on a change request
    When the only new activity is a comment posted by the token's own identity
    Then the wait continues

  Scenario: Coordinators load only the host-API sections they need
    Given a coordinator needs one repository-host operation
    When it resolves that operation
    Then only that operation's section and the sections it depends on are read into context, not the whole reference

  Scenario: Development does not offer to merge
    Given a change request is ready, with no open threads and a successful pipeline
    When the development skill reports readiness
    Then the report states the head commit
    And it does not propose a merge

  Scenario: A general reply is not consent to merge
    Given the development skill has reported a change request ready
    When the user replies "proceed with your recommendation"
    Then the change request is not merged

  Scenario: An explicit instruction merges the change request
    Given the development skill has reported a change request ready at a head commit
    And the pipeline succeeded and the host reports the change request mergeable
    When the user replies "merge" naming that change request
    Then the change request is merged

  Scenario: A changed head blocks an explicit merge
    Given the development skill has reported a change request ready at a head commit
    And a new commit has since been pushed to the change request
    When the user replies "merge" naming that change request
    Then the change request is not merged
    And the skill says the head changed since the report

  Scenario: Each lever reduces the cost it targets
    Given the recorded baseline from the cost spike and its variance bands
    When the scenario a lever targets is re-measured after all levers land
    Then its median cost is below the lower bound of its reference band

  Scenario: Whole-skill runs do not regress unexplained
    Given the recorded baseline from the cost spike and its variance bands
    When the development and code-review runs are re-measured
    Then each median is within or below its band, or the excess is attributed to a sub-agent's resolved tier

  Scenario: Run outcomes are preserved
    Given the recorded baseline outcomes
    When the representative runs are repeated after all levers land
    Then each run produces the same kind of outcome as its baseline run
```

## Definition of Done

- [ ] All work items of the feature are closed and released together in one plugin version.
- [ ] README documents the tier defaults and override, the host-API read wording, the `python3` prerequisite and the poll-script permission rule.
- [ ] Baseline and after-change figures are recorded on the feature's work item, not in the repository.
- [ ] `claude plugin validate .` and `.ci/smoke-test.sh` pass.
- [ ] This PRD and the [SDD](../design/cost-controls.md) match the shipped behaviour.

## Out of scope

- Skill frontmatter `model:` or `effort:`, and `disable-model-invocation`, as cost levers. The SDD records why they were rejected.
- Changing the model of the coordinator session itself.
- Committing measurement results to the repository.

## Dependencies & open questions

- Depends on the `.ci/evals/cost` runner and its recorded baseline, and on the throwaway sandbox project it runs against.
- The session model is read from the coordinator's system prompt. The platform documents no way for a skill to read it, so the cap relies on observed behaviour and falls back to `inherit` when the model cannot be named.
- PRDs under `docs/product/` are not `testing-spec` sources. This plugin's structural `TEST-MATRIX.md` remains the test source, so the Gherkin here is not run as checks.
