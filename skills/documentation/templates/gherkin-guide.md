# Writing Gherkin Acceptance Criteria

Gherkin turns a PRD's behavioural acceptance criteria into scenarios that read as specification and can drive checks. Keep `.feature` blocks valid.

## Style

- **Declarative, not imperative.** State the behaviour and outcome, not the UI steps. Write "When the order is submitted", not "When the user clicks the blue Submit button".
- **One behaviour per scenario.** If a scenario needs "and also", it is two scenarios.
- **Observable outcomes.** `Then` asserts something a user or system can see, not an internal implementation detail.
- **Behaviour only.** Process gates (lint, tests, docs) belong in the PRD's Definition of Done, not in Given/When/Then.

## Structure

```gherkin
Feature: Portfolio export

  Background:
    Given a signed-in user with a funded portfolio

  Scenario: Export a portfolio as CSV
    When the user requests a CSV export
    Then a CSV file with one row per holding is returned

  Scenario Outline: Rejected export formats
    When the user requests a "<format>" export
    Then the request is rejected with an unsupported-format error

    Examples:
      | format |
      | xls    |
      | txt    |
```

- **`Background`** holds `Given` steps shared by every scenario in the feature.
- **`Scenario Outline` + `Examples`** covers one behaviour across many inputs — use it instead of copy-pasting near-identical scenarios.
- **Tags** (e.g. `@smoke`, `@slow`) group scenarios for selective runs.

## Anti-patterns

- Imperative click-by-click steps.
- Multiple behaviours in one scenario ("and then also…").
- Asserting internals ("Then row 5 of the cache table updates") instead of outcomes.
- Conjunction-stuffed steps — prefer several `And` lines or a `Scenario Outline`.
- Vague outcomes ("Then it works").
