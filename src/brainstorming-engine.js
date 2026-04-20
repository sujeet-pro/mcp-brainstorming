import { randomUUID } from "node:crypto";

export const CHANGE_TOLERANCES = ["surgical", "bounded", "transformative"];
export const ARTIFACT_PREFERENCES = [
  "none",
  "proposal",
  "prd",
  "rfc",
  "hld",
  "lld",
  "tdd",
  "plan",
  "all",
];
export const ROUTES = [
  "brainstorm",
  "research",
  "spec",
  "plan",
  "write-docs",
  "build",
  "refactor",
  "migrate",
  "design",
];

function timestamp() {
  return new Date().toISOString();
}

function clampConfidence(value, fallback = 90) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function defaultConfidenceFor(skillContext, changeTolerance) {
  if (changeTolerance === "surgical") {
    return 95;
  }

  if (["build", "refactor", "migrate", "plan"].includes(skillContext)) {
    return 90;
  }

  return 85;
}

function normalizeSkillContext(skillContext) {
  return skillContext || "brainstorm";
}

function normalizeArtifactPreference(artifactPreference) {
  return artifactPreference || "none";
}

function normalizeChangeTolerance(changeTolerance) {
  return changeTolerance || "bounded";
}

function normalizeQuestion(question, index) {
  return {
    questionId: question.questionId || `q${index + 1}`,
    question: question.question.trim(),
    why: question.why?.trim() || "",
    answer: question.answer?.trim() || "",
    status: question.answer?.trim() ? "answered" : question.status || "open",
  };
}

function normalizeOption(option, index) {
  return {
    optionId: option.optionId || `opt${index + 1}`,
    title: option.title?.trim() || `Option ${index + 1}`,
    summary: option.summary?.trim() || "",
    pros: Array.isArray(option.pros) ? option.pros.filter(Boolean) : [],
    cons: Array.isArray(option.cons) ? option.cons.filter(Boolean) : [],
    effort: option.effort?.trim() || "",
    riskLevel: option.riskLevel?.trim() || "",
    fit: option.fit?.trim() || "",
    confidence: clampConfidence(option.confidence, 0),
  };
}

function normalizeFinding(finding, index) {
  return {
    findingId: finding.findingId || `rf${index + 1}`,
    sourceType: finding.sourceType?.trim() || "unknown",
    source: finding.source?.trim() || "",
    summary: finding.summary?.trim() || "",
    verified: Boolean(finding.verified),
    confidence: clampConfidence(finding.confidence, finding.verified ? 90 : 60),
  };
}

function normalizeDecisionLogEntry(entry) {
  return {
    at: timestamp(),
    type: entry.type,
    summary: entry.summary,
  };
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item[key])) {
      return false;
    }
    seen.add(item[key]);
    return true;
  });
}

function chooseRoute(session) {
  if (session.preferredRoute) {
    return session.preferredRoute;
  }

  switch (session.artifactPreference) {
    case "prd":
      return "spec";
    case "plan":
      return "plan";
    case "proposal":
    case "rfc":
    case "hld":
    case "lld":
    case "tdd":
    case "all":
      return "write-docs";
    default:
      break;
  }

  switch (session.skillContext) {
    case "research":
      return "research";
    case "spec":
      return "spec";
    case "plan":
      return "plan";
    case "build":
      return "build";
    case "refactor":
      return "refactor";
    case "migrate":
      return "migrate";
    case "design":
      return "design";
    case "docs":
    case "write-docs":
      return "write-docs";
    default:
      return "brainstorm";
  }
}

function scoreConfidence(session) {
  const optionConfidence =
    session.options.length > 0
      ? Math.round(
          session.options.reduce((sum, option) => sum + option.confidence, 0) /
            session.options.length,
        )
      : 0;

  const verifiedFindings = session.researchFindings.filter((finding) => finding.verified).length;
  const researchScore =
    session.researchFindings.length === 0
      ? 0
      : Math.round((verifiedFindings / session.researchFindings.length) * 100);

  const answeredQuestions =
    session.openQuestions.length === 0
      ? 100
      : Math.round(
          (session.openQuestions.filter((question) => question.status === "answered").length /
            session.openQuestions.length) *
            100,
        );

  const fieldsScore =
    session.currentState && session.targetState
      ? 100
      : session.currentState || session.targetState
        ? 60
        : 0;

  const blended = Math.round(
    optionConfidence * 0.3 + researchScore * 0.3 + answeredQuestions * 0.2 + fieldsScore * 0.2,
  );

  return Math.max(session.currentConfidence, blended);
}

function summarizeSession(session, recommendedNextAction, recommendedRoute, warnings) {
  const openCount = session.openQuestions.filter((question) => question.status !== "answered").length;
  const parts = [
    `Route: ${recommendedRoute}`,
    `Next: ${recommendedNextAction}`,
    `Confidence ${session.currentConfidence}/${session.desiredConfidence}`,
    `${session.options.length} option(s)`,
    `${session.researchFindings.length} finding(s)`,
    `${openCount} open question(s)`,
  ];

  if (warnings.length > 0) {
    parts.push(`${warnings.length} warning(s)`);
  }

  return parts.join(" | ");
}

function computeState(session) {
  const warnings = [];
  const missing = [];
  const openQuestions = session.openQuestions.filter((question) => question.status !== "answered");
  session.currentConfidence = clampConfidence(scoreConfidence(session), session.currentConfidence);

  if (!session.currentState) {
    missing.push("currentState");
  }

  if (!session.targetState) {
    missing.push("targetState");
  }

  if (missing.length > 0) {
    warnings.push("Capture both currentState and targetState before finalizing a direction.");
  }

  if (session.researchFindings.length === 0 && session.desiredConfidence >= 90) {
    warnings.push("High-confidence workflows should collect at least one research finding.");
  }

  if (session.options.length === 0) {
    warnings.push("No candidate options have been recorded yet.");
  }

  if (openQuestions.length > 0) {
    warnings.push("There are unresolved user or design questions.");
  }

  if (session.currentConfidence < session.desiredConfidence) {
    warnings.push("Current confidence is below the requested threshold.");
  }

  if (session.changeTolerance === "transformative" && session.artifactPreference === "none") {
    warnings.push("Transformative changes should usually produce at least one design or planning artifact.");
  }

  let recommendedNextAction = "finalize";
  if (missing.length > 0 || openQuestions.length > 0) {
    recommendedNextAction = "ask-user";
  } else if (session.researchFindings.length === 0 && session.desiredConfidence >= 90) {
    recommendedNextAction = "research";
  } else if (session.options.length === 0) {
    recommendedNextAction = "compare-options";
  } else if (session.currentConfidence < session.desiredConfidence) {
    recommendedNextAction = session.researchFindings.length === 0 ? "research" : "compare-options";
  }

  session.recommendedRoute = chooseRoute(session);
  session.recommendedNextAction = recommendedNextAction;
  session.warnings = warnings;
  session.summary = summarizeSession(
    session,
    recommendedNextAction,
    session.recommendedRoute,
    warnings,
  );
  session.updatedAt = timestamp();
  return session;
}

export class BrainstormingEngine {
  constructor() {
    this.sessions = new Map();
  }

  startSession(input) {
    const skillContext = normalizeSkillContext(input.skillContext);
    const changeTolerance = normalizeChangeTolerance(input.changeTolerance);
    const desiredConfidence = clampConfidence(
      input.desiredConfidence,
      defaultConfidenceFor(skillContext, changeTolerance),
    );
    const sessionId = input.sessionId?.trim() || `brainstorm-${randomUUID()}`;
    const session = computeState({
      sessionId,
      task: input.task.trim(),
      skillContext,
      currentState: input.currentState?.trim() || "",
      targetState: input.targetState?.trim() || "",
      changeTolerance,
      desiredConfidence,
      currentConfidence: clampConfidence(input.currentConfidence, 0),
      artifactPreference: normalizeArtifactPreference(input.artifactPreference),
      preferredRoute: input.preferredRoute?.trim() || "",
      researchFindings: uniqueBy(
        (input.researchFindings || []).map((finding, index) => normalizeFinding(finding, index)),
        "findingId",
      ),
      options: uniqueBy(
        (input.options || []).map((option, index) => normalizeOption(option, index)),
        "optionId",
      ),
      openQuestions: uniqueBy(
        (input.openQuestions || []).map((question, index) => normalizeQuestion(question, index)),
        "questionId",
      ),
      decisionLog: [
        normalizeDecisionLogEntry({
          type: "start",
          summary: input.note?.trim() || "Session created.",
        }),
      ],
      warnings: [],
      recommendedRoute: "",
      recommendedNextAction: "ask-user",
      summary: "",
      status: "active",
      chosenOptionId: "",
      createdAt: timestamp(),
      updatedAt: timestamp(),
      finalizedAt: "",
      finalDecision: null,
    });

    this.sessions.set(sessionId, session);
    return structuredClone(session);
  }

  updateSession(sessionId, input) {
    const session = this.requireSession(sessionId);

    if (input.currentState !== undefined) {
      session.currentState = input.currentState.trim();
    }
    if (input.targetState !== undefined) {
      session.targetState = input.targetState.trim();
    }
    if (input.changeTolerance !== undefined) {
      session.changeTolerance = normalizeChangeTolerance(input.changeTolerance);
    }
    if (input.desiredConfidence !== undefined) {
      session.desiredConfidence = clampConfidence(input.desiredConfidence, session.desiredConfidence);
    }
    if (input.currentConfidence !== undefined) {
      session.currentConfidence = clampConfidence(input.currentConfidence, session.currentConfidence);
    }
    if (input.artifactPreference !== undefined) {
      session.artifactPreference = normalizeArtifactPreference(input.artifactPreference);
    }
    if (input.preferredRoute !== undefined) {
      session.preferredRoute = input.preferredRoute.trim();
    }

    if (Array.isArray(input.researchFindings) && input.researchFindings.length > 0) {
      const nextIndex = session.researchFindings.length;
      session.researchFindings = uniqueBy(
        session.researchFindings.concat(
          input.researchFindings.map((finding, index) => normalizeFinding(finding, nextIndex + index)),
        ),
        "findingId",
      );
    }

    if (Array.isArray(input.options) && input.options.length > 0) {
      const nextIndex = session.options.length;
      session.options = uniqueBy(
        session.options.concat(
          input.options.map((option, index) => normalizeOption(option, nextIndex + index)),
        ),
        "optionId",
      );
    }

    if (Array.isArray(input.openQuestions) && input.openQuestions.length > 0) {
      const nextIndex = session.openQuestions.length;
      session.openQuestions = uniqueBy(
        session.openQuestions.concat(
          input.openQuestions.map((question, index) => normalizeQuestion(question, nextIndex + index)),
        ),
        "questionId",
      );
    }

    if (Array.isArray(input.answers) && input.answers.length > 0) {
      for (const answer of input.answers) {
        const matchingQuestion = session.openQuestions.find(
          (question) => question.questionId === answer.questionId,
        );
        if (matchingQuestion) {
          matchingQuestion.answer = answer.answer.trim();
          matchingQuestion.status = "answered";
        }
      }
    }

    if (input.chosenOptionId !== undefined) {
      session.chosenOptionId = input.chosenOptionId.trim();
    }

    if (input.note?.trim()) {
      session.decisionLog.push(
        normalizeDecisionLogEntry({
          type: "update",
          summary: input.note.trim(),
        }),
      );
    }

    computeState(session);
    this.sessions.set(sessionId, session);
    return structuredClone(session);
  }

  getSession(sessionId) {
    return structuredClone(this.requireSession(sessionId));
  }

  finalizeSession(sessionId, input) {
    const session = this.requireSession(sessionId);
    this.updateSession(sessionId, input);

    if (input.rationale?.trim()) {
      session.decisionLog.push(
        normalizeDecisionLogEntry({
          type: "finalize",
          summary: input.rationale.trim(),
        }),
      );
    }

    const acceptLowerConfidence = Boolean(input.acceptLowerConfidence);
    computeState(session);

    if (session.currentConfidence < session.desiredConfidence && !acceptLowerConfidence) {
      throw new Error(
        `Cannot finalize below the desired confidence (${session.currentConfidence}/${session.desiredConfidence}) without acceptLowerConfidence=true.`,
      );
    }

    session.status = "finalized";
    session.finalizedAt = timestamp();
    session.finalDecision = {
      chosenOptionId: session.chosenOptionId || input.chosenOptionId?.trim() || "",
      recommendedRoute: input.preferredRoute?.trim() || session.recommendedRoute,
      artifactPreference: normalizeArtifactPreference(input.artifactPreference || session.artifactPreference),
      rationale: input.rationale?.trim() || "",
      acceptedBelowThreshold: acceptLowerConfidence && session.currentConfidence < session.desiredConfidence,
    };

    computeState(session);
    this.sessions.set(sessionId, session);
    return structuredClone(session);
  }

  resetSession(sessionId) {
    if (sessionId) {
      const existed = this.sessions.delete(sessionId);
      return {
        removedSessions: existed ? 1 : 0,
        remainingSessions: this.sessions.size,
      };
    }

    const removedSessions = this.sessions.size;
    this.sessions.clear();
    return {
      removedSessions,
      remainingSessions: 0,
    };
  }

  requireSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown brainstorming session: ${sessionId}`);
    }
    return session;
  }
}
