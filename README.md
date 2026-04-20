# mcp-brainstorming

Local MCP server for structured brainstorming, design closure, and implementation-path selection.

## Why This Exists

This server takes inspiration from `sequentialthinking`, but it is opinionated around engineering workflow decisions instead of freeform thought logging.

It is designed to help an agent:
- capture the current state and desired target state
- decide how much blast radius is acceptable
- keep track of research findings, options, and open questions
- drive toward a confidence threshold such as `85`, `90`, or `95`
- decide whether the next step should be `spec`, `plan`, `write-docs`, `build`, or another route

The server keeps structured session state in memory and returns JSON snapshots that callers can consume directly.

## Tools

The MCP server exposes these tools:
- `brainstorm_start`
- `brainstorm_update`
- `brainstorm_status`
- `brainstorm_finalize`
- `brainstorm_reset`

## Session Model

Each session tracks:
- `task`
- `skillContext`
- `currentState`
- `targetState`
- `changeTolerance`
- `desiredConfidence`
- `currentConfidence`
- `artifactPreference`
- `researchFindings`
- `options`
- `openQuestions`
- `recommendedRoute`
- `recommendedNextAction`

## Install

```bash
cd /Users/sujeet/personal/mcp-brainstorming
npm install
```

## Run Locally

```bash
cd /Users/sujeet/personal/mcp-brainstorming
npm start
```

Set `BRAINSTORMING_MCP_QUIET=true` to disable stderr status logs.

## Configure As An MCP Server

Example stdio config:

```json
{
  "mcpServers": {
    "brainstorming": {
      "command": "node",
      "args": [
        "/Users/sujeet/personal/mcp-brainstorming/src/index.js"
      ]
    }
  }
}
```

In the ADK repo, the portable config should use an environment variable such as `BRAINSTORMING_MCP_ROOT` instead of checking in a machine-specific path.

## Development

```bash
npm test
npm run lint
npm run validate
```

## Local Skill

This repo also ships a local helper skill at `skills/brainstorming/SKILL.md` that assumes the server exists and explains the intended tool loop.
