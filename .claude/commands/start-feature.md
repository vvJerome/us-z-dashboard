---
description: Start a new feature branch following the git workflow. Asks for a name and component, creates the branch, and identifies which agent to spawn.
allowed-tools: [Bash, Read]
---

Start a new feature for the us-z-dashboard project. Follow these steps exactly:

## Step 1: Gather requirements

Ask the user:
1. "What is the feature name?" (short, hyphen-separated, e.g. `job-cancel-button`, `log-viewer-scroll`)
2. "What type of change is this?" — options: `feat`, `fix`, `refactor`, `chore`, `docs`
3. "Which component does this primarily touch?" — options: `frontend`, `backend`, `pipeline`, `infra`, `multiple`

## Step 2: Confirm branch name

Construct the branch name: `{type}/{feature-name}`

Example: `feat/job-cancel-button`, `fix/log-viewer-scroll`, `chore/upgrade-vite`

Confirm with the user before proceeding.

## Step 3: Create the branch

```bash
git checkout main && git pull origin main
git checkout -b {branch-name}
```

## Step 4: Identify the right agent

Based on the component, tell the user which agent to spawn next:

| Component | Agent to spawn | Scope |
|-----------|---------------|-------|
| frontend  | FrontendDev   | dashboard/ |
| backend   | BackendDev    | backend/ |
| pipeline  | PipelineDev   | pipeline/ |
| infra     | InfraSetup    | docker-compose.yml, kestra/, nginx/, .github/ |
| multiple  | Spawn the primary component's agent first; mention the others |

## Step 5: Output summary

```
Branch created: {branch-name}
Component: {component}
Next step: Spawn the {AgentName} agent and describe what you need built.
Reference: docs/context.md for full system architecture
          .claude/directions/ for architectural decisions already made
```

## Rules

- Branch prefix must match the change type (feat/fix/refactor/chore/docs)
- Never create branches directly on main — always branch from a fresh pull
- If the user is already on a non-main branch, warn them and ask if they want to stash + switch first
