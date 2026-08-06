# Which Document, When

Author-facing guide for choosing the documents a change needs. It restates the escalation matrix from `shared/documentation-taxonomy.md` (the single source of truth) — if the two ever differ, the taxonomy wins.

Two rules combine:

- The project's **profile** (`lite` / `standard` / `full`, default `standard`) sets the ceiling of documents maintained.
- The change's **significance** sets the floor. Author what the significance requires, capped by the profile.

| Your change… | Author |
|--------------|--------|
| A typo, small fix, or refactor with no behaviour change | Nothing |
| Adds or changes user-facing behaviour | PRD with Gherkin acceptance criteria |
| Adds a service or API surface, or otherwise non-trivial design | The above, plus an SDD |
| Is architecturally significant | The above, plus a TSD |
| Is a business pivot or new product direction | A BRD, then cascade PRD/SDD/TSD for the affected initiatives |

Start from the PRD template and escalate only as far as the row you land on. Templates live alongside this guide; write Gherkin per `gherkin-guide.md`.
