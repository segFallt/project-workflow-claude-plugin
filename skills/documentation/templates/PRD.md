# Product Requirements Document — <!-- REPLACE THIS: feature name -->

> PRD plus its Gherkin acceptance criteria are the mandatory core of the framework (see `shared/documentation-taxonomy.md`).

## Summary

<!-- REPLACE THIS: what this feature is, in two or three sentences -->

## Problem & context

<!-- REPLACE THIS: the user problem and why it matters now -->

## Users

<!-- REPLACE THIS: who uses this and what they are trying to do -->

## Goals & non-goals

- **Goals:** <!-- REPLACE THIS -->
- **Non-goals:** <!-- REPLACE THIS: what this deliberately does not do -->

## Requirements

<!-- REPLACE THIS: numbered functional requirements. One testable statement each. -->

1.
2.

## Acceptance criteria

Behavioural criteria are written as Gherkin scenarios (see `gherkin-guide.md`). Keep `.feature` blocks valid so they can drive checks. Process/DoD gates (lint, tests, docs) go in the Definition of Done below, not in Given/When/Then.

```gherkin
Feature: <!-- REPLACE THIS: the capability under test -->

  Scenario: <!-- REPLACE THIS: one behaviour -->
    Given <!-- REPLACE THIS: starting state -->
    When <!-- REPLACE THIS: the action -->
    Then <!-- REPLACE THIS: the observable outcome -->
```

## Definition of Done

- [ ] <!-- REPLACE THIS: e.g. lint and tests pass, docs updated -->

## Out of scope

<!-- REPLACE THIS -->

## Dependencies & open questions

<!-- REPLACE THIS: upstream work, external services, unresolved decisions -->
