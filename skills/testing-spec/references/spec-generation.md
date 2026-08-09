#### Step 0b: Enumerate spec sources and extract

From the manifest's **Spec Sources**, enumerate at runtime (never hardcode filenames):

- **PRD / requirement Markdown** — apply the manifest's extraction rules (API tables, acceptance criteria, error tables, non-functional subsections).
- **Issues** — extract acceptance criteria listed on referenced issues.
- **Gherkin `.feature` files** — one check per `Scenario`; a `Scenario Outline` expands to one check per `Examples` row. Map `Given` → setup/preconditions, `When` → the action (curl/grpcurl/Playwright), `Then` → the PASS condition.

**Gherkin parsing (optional tool, never a hard dependency):** if a Bun/Node-runnable Gherkin parser or linter is available in the consumer environment (e.g. `@cucumber/gherkin-utils`, `gherkin-lint`), use it to parse and validate `.feature` files; otherwise fall back to a lightweight inline Given/When/Then parse. Do not add a required dependency. Keep `.feature` files valid Gherkin — v1 generates checks from them but does not execute them through a Cucumber runner; a documented **runner-adapter seam** (map parsed steps → executable Method) is where a real runner would later attach.

#### Step 0c: Generate the matrix

Classify each extracted criterion into a check using the manifest's **Test ID Prefixes** (the static `I-`/`BL-`/`UI-`/`XS-`/`NF-` categories plus project `API-*` prefixes). Each check carries:

```
ID          : <category prefix><sequential number>
Spec Source : <source> <criterion id>  (e.g. "02-recommendations.md AC-5", "#42 AC-3", "checkout.feature: Reject empty cart")
Description : derived from the criterion / scenario
Method      : the curl / grpcurl / Playwright action
PASS Cond.  : the observable outcome (from the Then step or acceptance criterion)
```

Every check must trace back to its originating scenario/criterion via **Spec Source**.
