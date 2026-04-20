# Brainstorming

Use the local brainstorming MCP server to turn an ambiguous task into a direction with an explicit confidence bar.

## Assumption

This skill assumes the `brainstorming` MCP server is already configured and available.

## Workflow

1. Call `brainstorm_start` with the task, current state, target state, change tolerance, desired confidence, and artifact preference.
2. Call `brainstorm_update` as research findings, options, and user answers become available.
3. Use `brainstorm_status` to inspect the latest structured state and recommendation.
4. Call `brainstorm_finalize` once confidence meets the target, or explicitly accept a lower confidence level when appropriate.
5. Route the result into the implementation, planning, or documentation workflow the session recommends.

## Notes

- Prefer `95` confidence for production-safe or surgical changes.
- Prefer `90` confidence for standard engineering work.
- Prefer `85` confidence for exploratory work or personal projects.
- Use `artifactPreference` to drive whether the next step should emit a doc, a plan, or no persistent artifact.
