# [cost-eval] Add a multiply function to src/calc.sh

## Feature

`src/calc.sh` only supports `add`. Add a `multiply` command so `sh src/calc.sh multiply <a> <b>` prints the product. This is a throwaway issue for the cost baseline (#68).

## Acceptance Criteria

```gherkin
Feature: multiply command

  Scenario: multiply two integers
    Given the calculator script src/calc.sh
    When I run "sh src/calc.sh multiply 3 4"
    Then the output is "12"
    And the exit code is 0

  Scenario: existing add still works
    When I run "sh src/calc.sh add 1 2"
    Then the output is "3"
```

## Definition of Done

- [ ] `multiply` implemented in `src/calc.sh` and wired into the command dispatch
- [ ] A multiply test added to `test.sh`
- [ ] Lint passes: `sh -n src/calc.sh`
- [ ] Tests pass: `sh test.sh`
- [ ] CI pipeline green
