<!-- pw-version: 1.5.0 -->
# {project_name} — Project Reference

> **Purpose:** This file provides the AI coding agent with the information needed to navigate, understand, and modify the project codebase. It is the central configuration that all action prompts reference at runtime via `PROJECT.md § Section Name` patterns.

---

## Overview

{architecture_overview — formatted as a readable description with ASCII diagram if provided}

---

## Source Control

| Setting | Value |
|---------|-------|
| Platform | `{platform}` |
| Instance | `{instance_url}` |
| Group / Organization | `{group}` |
| Group dashboard | `{group_dashboard}` |
| API base | `{api_base_url}` |
| Credential file | `.claude/project-config/.env` |

> See also: `## Container Registry` section below for registry URL and login command.

### Credential Loading

Load credentials from `.claude/project-config/.env`:

```
API_TOKEN_ENV_VAR=<personal access token>
REVIEW_TOKEN_ENV_VAR=<review bot token — used only by code review skill>
```

> **Review token:** The code review skill uses `REVIEW_TOKEN_ENV_VAR` instead of the general token. See the review skill's Environment Setup for loading instructions.

Once configured, see `project-workflows:{host}-api` skill for all API interaction patterns where `{host}` is the lowercase selected platform. **The `project-workflows` plugin ships with API reference skills for each supported host (gitlab-api, github-api, gitea-api).** Do not edit these skills; they document standardized operation names used by the action skills.

---

## Repository Locations

{not-configured stanza}

---

## Repository Dependency Order

{not-configured stanza}

---

## Container Registry

{not-configured stanza}

---

## Tech Stacks Per Repo

{not-configured stanza}

---

## Cross-Cutting Concerns

{not-configured stanza}

---

## Domain Concepts

{not-configured stanza}

---

## Work Item Conventions

{not-configured stanza}

---

## API Endpoints

{not-configured stanza}

---

## Database Schema

{not-configured stanza}

---

## Concurrent Session Isolation

{not-configured stanza}

---

## Local Development

{not-configured stanza}

---

## Design Documentation

{not-configured stanza}

---

## Git Tags

{not-configured stanza}
