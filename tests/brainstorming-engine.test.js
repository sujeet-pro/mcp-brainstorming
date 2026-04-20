import test from "node:test";
import assert from "node:assert/strict";

import { BrainstormingEngine } from "../src/brainstorming-engine.js";

test("startSession sets defaults and asks for missing state", () => {
  const engine = new BrainstormingEngine();

  const session = engine.startSession({
    task: "Design a production-safe fix",
    skillContext: "build",
    changeTolerance: "surgical",
  });

  assert.equal(session.desiredConfidence, 95);
  assert.equal(session.recommendedNextAction, "ask-user");
  assert.equal(session.recommendedRoute, "build");
  assert.match(session.summary, /Confidence/);
  assert.ok(session.warnings.some((warning) => warning.includes("currentState")));
});

test("updateSession resolves questions and raises the route for doc artifacts", () => {
  const engine = new BrainstormingEngine();
  const session = engine.startSession({
    task: "Choose a rollout plan",
    skillContext: "plan",
    currentState: "Legacy workflow exists",
    targetState: "New brainstorming workflow is adopted",
    openQuestions: [{ question: "How much change is acceptable?" }],
  });

  const updated = engine.updateSession(session.sessionId, {
    answers: [{ questionId: "q1", answer: "Keep it bounded for production work." }],
    researchFindings: [
      {
        sourceType: "repo",
        source: "skills/adk-plan/SKILL.md",
        summary: "Planning already supports options and approval gates.",
        verified: true,
      },
    ],
    options: [
      {
        title: "Shared workflow with per-skill customization",
        summary: "Use one common protocol but let each skill tailor it.",
        pros: ["Consistent"],
        cons: ["Broad rollout"],
        confidence: 92,
      },
    ],
    artifactPreference: "rfc",
    currentConfidence: 91,
  });

  assert.equal(updated.openQuestions[0].status, "answered");
  assert.equal(updated.recommendedRoute, "write-docs");
  assert.equal(updated.recommendedNextAction, "finalize");
});

test("finalizeSession rejects low confidence unless explicitly accepted", () => {
  const engine = new BrainstormingEngine();
  const session = engine.startSession({
    task: "Pick an implementation path",
    currentState: "There is no MCP server yet.",
    targetState: "There is a repo-local MCP-first workflow.",
    desiredConfidence: 90,
    currentConfidence: 70,
    options: [{ title: "Option A", confidence: 70 }],
  });

  assert.throws(
    () =>
      engine.finalizeSession(session.sessionId, {
        rationale: "Ship it now.",
      }),
    /Cannot finalize below the desired confidence/,
  );

  const finalized = engine.finalizeSession(session.sessionId, {
    rationale: "Proceed with explicit risk acknowledgment.",
    acceptLowerConfidence: true,
  });

  assert.equal(finalized.status, "finalized");
  assert.equal(finalized.finalDecision.acceptedBelowThreshold, true);
});

test("resetSession clears one or all sessions", () => {
  const engine = new BrainstormingEngine();
  const first = engine.startSession({
    task: "Task one",
    currentState: "A",
    targetState: "B",
  });
  engine.startSession({
    task: "Task two",
    currentState: "C",
    targetState: "D",
  });

  const single = engine.resetSession(first.sessionId);
  assert.equal(single.removedSessions, 1);
  assert.equal(single.remainingSessions, 1);

  const all = engine.resetSession();
  assert.equal(all.removedSessions, 1);
  assert.equal(all.remainingSessions, 0);
});
