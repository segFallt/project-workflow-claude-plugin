## Repository Locations

```
## Repository Locations

| Repo Name | Local Path | Role / Description | Primary Tech Stack |
|-----------|------------|--------------------|--------------------|
| {repo_1} | {path_1} | {role_1} | {stack_1} |
...
```

## Repository Dependency Order

```
## Repository Dependency Order

| Build Order | Repo | Role in Dependency Chain | Notes |
|-------------|------|--------------------------|-------|
| 1 | {most_upstream_repo} | {role} | |
...
```

## Tech Stacks Per Repo

```
## Tech Stacks Per Repo

### `{repo_name}`

**Purpose:** {brief description}

| Property | Value |
|----------|-------|
| Language | {language} |
| Language version | {version or "not specified"} |
| Framework | {framework} |
| Key libraries | {comma-separated} |
| Test framework | {test_framework} |
| Build tool | {build_tool} |

#### Key Paths

```
{key paths, one per line}
```

#### Commands

| Action | Command |
|--------|---------|
| Lint | {lint_cmd} |
| Test | {test_cmd} |
| Build | {build_cmd} |
| Run | {run_cmd} |

#### CI Stages

```
{stage_1} → {stage_2} → ...
```
```

## Container Registry

```
## Container Registry

| Setting | Value |
|---------|-------|
| Registry URL | `{registry_url}` |

### Image Naming Convention

```
{registry_url}/{group}/{repo_name}:{tag}
```

### Registry Login

```bash
docker login {registry_url} -u {username} -p $API_TOKEN_ENV_VAR
```
```

## Local Development

```
## Local Development

### Starting Infrastructure

```bash
cd {worktrees_base}/{deploy_repo}
cp .env.example .env      # fill in secrets
{infrastructure_start_command}
```

### Running Services Individually

```bash
{one block per repo from Phase 4, using the run command they provided}
```
```

## Domain Concepts

```
## Domain Concepts

### Terminology

| Term | Definition | Where Used |
|------|------------|------------|
{rows from user input}

### Domain Signals to Repo Mapping

| Domain Signals | Repo |
|----------------|------|
{rows from user input}

### PRD Files

{if prd_directory was provided:
Root: `{prd_directory}`

Read all Markdown files in this directory as PRD inputs. See `PRD-MANIFEST.md` (or the more general `SPEC-MANIFEST.md`) for extraction rules, test ID prefixes, and feature priorities. The `testing-spec` skill (or the legacy `testing-prd`) uses these to generate integration tests from your specs.
}
{if prd_directory was 'none' or skipped: {not-configured stanza} }
```

## Work Item Conventions

```
## Work Item Conventions

### Hierarchy & Typing

{levels, type labels, parent/child links, and orthogonal label axes from user input — or "Not applicable."}

### Lifecycle & Status

{status values, selection rule, and advance/close transitions from user input — or "Not applicable."}

### Comment & Body Conventions

{body structure, comment conventions, and cross-reference conventions from user input — or "Not applicable."}
```

## API Endpoints

```
## API Endpoints

| Method | Path | Description | Auth Required | Service |
|--------|------|-------------|---------------|---------|
{rows from user input}
```

## Database Schema

```
## Database Schema

| Table | Description | Key Columns |
|-------|-------------|-------------|
{rows from user input}
```

## Cross-Cutting Concerns

```
## Cross-Cutting Concerns

### Authentication Flow

{description from user}

### Message Queue / Event Streaming Patterns

{description from user, or "Not applicable."}

### Caching Strategy

{description from user, or "Not applicable."}

### Shared Data Models

{description from user, or "Not applicable."}
```

## Design Documentation

```
## Design Documentation

| Document | Path |
|----------|------|
{rows from user input}

### Documentation Profile

`{lite | standard | full}` — default `standard`. Sets which documents this project maintains (see `shared/documentation-taxonomy.md`).

### Docs Root

`{docs_root, default docs/}`

### Spec Sources

{PRD directory, `.feature` globs, and/or issue references used by `testing-spec` — or "not configured"}
```

## Git Tags

```
## Git Tags

| Repo | Current Tag | Versioning Scheme |
|------|-------------|-------------------|
{rows from user input}
```
