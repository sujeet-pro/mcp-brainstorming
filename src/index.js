#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  ARTIFACT_PREFERENCES,
  BrainstormingEngine,
  CHANGE_TOLERANCES,
  ROUTES,
} from "./brainstorming-engine.js";

const quiet = (process.env.BRAINSTORMING_MCP_QUIET || "").toLowerCase() === "true";

function log(message) {
  if (!quiet) {
    console.error(`[brainstorming-mcp] ${message}`);
  }
}

function safeBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") {
      return true;
    }
    if (value.toLowerCase() === "false") {
      return false;
    }
  }
  return value;
}

const coercedBoolean = z.preprocess(safeBoolean, z.boolean());
const optionalTrimmedString = z.string().trim().optional();
const confidenceSchema = z.coerce.number().min(0).max(100);
const changeToleranceSchema = z.enum(CHANGE_TOLERANCES);
const artifactPreferenceSchema = z.enum(ARTIFACT_PREFERENCES);
const routeSchema = z.enum(ROUTES);

const researchFindingSchema = z.object({
  findingId: optionalTrimmedString,
  sourceType: z.string().trim(),
  source: z.string().trim().optional(),
  summary: z.string().trim(),
  verified: coercedBoolean.optional(),
  confidence: confidenceSchema.optional(),
});

const optionSchema = z.object({
  optionId: optionalTrimmedString,
  title: z.string().trim(),
  summary: z.string().trim().optional(),
  pros: z.array(z.string().trim()).optional(),
  cons: z.array(z.string().trim()).optional(),
  effort: z.string().trim().optional(),
  riskLevel: z.string().trim().optional(),
  fit: z.string().trim().optional(),
  confidence: confidenceSchema.optional(),
});

const questionSchema = z.object({
  questionId: optionalTrimmedString,
  question: z.string().trim(),
  why: z.string().trim().optional(),
  answer: z.string().trim().optional(),
  status: z.enum(["open", "answered"]).optional(),
});

const answerSchema = z.object({
  questionId: z.string().trim(),
  answer: z.string().trim(),
});

const sessionOutputSchema = {
  sessionId: z.string(),
  task: z.string(),
  skillContext: z.string(),
  currentState: z.string(),
  targetState: z.string(),
  changeTolerance: changeToleranceSchema,
  desiredConfidence: z.number(),
  currentConfidence: z.number(),
  artifactPreference: artifactPreferenceSchema,
  preferredRoute: z.string(),
  recommendedRoute: z.string(),
  recommendedNextAction: z.string(),
  status: z.string(),
  chosenOptionId: z.string(),
  finalizedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  summary: z.string(),
  warnings: z.array(z.string()),
  researchFindings: z.array(
    z.object({
      findingId: z.string(),
      sourceType: z.string(),
      source: z.string(),
      summary: z.string(),
      verified: z.boolean(),
      confidence: z.number(),
    }),
  ),
  options: z.array(
    z.object({
      optionId: z.string(),
      title: z.string(),
      summary: z.string(),
      pros: z.array(z.string()),
      cons: z.array(z.string()),
      effort: z.string(),
      riskLevel: z.string(),
      fit: z.string(),
      confidence: z.number(),
    }),
  ),
  openQuestions: z.array(
    z.object({
      questionId: z.string(),
      question: z.string(),
      why: z.string(),
      answer: z.string(),
      status: z.string(),
    }),
  ),
  decisionLog: z.array(
    z.object({
      at: z.string(),
      type: z.string(),
      summary: z.string(),
    }),
  ),
  finalDecision: z
    .object({
      chosenOptionId: z.string(),
      recommendedRoute: z.string(),
      artifactPreference: z.string(),
      rationale: z.string(),
      acceptedBelowThreshold: z.boolean(),
    })
    .nullable(),
};

const server = new McpServer({
  name: "brainstorming-mcp",
  version: "0.1.0",
});

const engine = new BrainstormingEngine();

function serializeResult(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function serializeError(error) {
  const payload = {
    status: "error",
    error: error instanceof Error ? error.message : String(error),
  };
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: true,
  };
}

server.registerTool(
  "brainstorm_start",
  {
    title: "Brainstorm Start",
    description:
      "Create a structured brainstorming session that captures current state, target state, blast radius, confidence target, artifact preference, and early questions/options.",
    inputSchema: {
      sessionId: optionalTrimmedString.describe("Optional caller-supplied session identifier."),
      task: z.string().trim().min(1).describe("The problem, task, or decision to explore."),
      skillContext: z
        .string()
        .trim()
        .optional()
        .describe("The surrounding workflow such as brainstorm, research, spec, plan, build, refactor, migrate, design, or write-docs."),
      currentState: optionalTrimmedString.describe("What exists today."),
      targetState: optionalTrimmedString.describe("What outcome or state should be reached."),
      changeTolerance: changeToleranceSchema
        .optional()
        .describe("How much change is acceptable: surgical, bounded, or transformative."),
      desiredConfidence: confidenceSchema
        .optional()
        .describe("Confidence target from 0-100 before finalizing a direction."),
      currentConfidence: confidenceSchema
        .optional()
        .describe("Current estimated confidence from 0-100."),
      artifactPreference: artifactPreferenceSchema
        .optional()
        .describe("Requested artifact output such as none, proposal, prd, rfc, hld, lld, tdd, plan, or all."),
      preferredRoute: routeSchema
        .optional()
        .describe("Optional explicit route override such as spec, plan, write-docs, build, or design."),
      researchFindings: z.array(researchFindingSchema).optional(),
      options: z.array(optionSchema).optional(),
      openQuestions: z.array(questionSchema).optional(),
      note: optionalTrimmedString.describe("Initial context note to attach to the session log."),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    outputSchema: sessionOutputSchema,
  },
  async (args) => {
    try {
      const session = engine.startSession(args);
      log(`started ${session.sessionId}`);
      return serializeResult(session);
    } catch (error) {
      return serializeError(error);
    }
  },
);

server.registerTool(
  "brainstorm_update",
  {
    title: "Brainstorm Update",
    description:
      "Append findings, options, questions, answers, or confidence updates to an existing brainstorming session.",
    inputSchema: {
      sessionId: z.string().trim().min(1),
      currentState: optionalTrimmedString,
      targetState: optionalTrimmedString,
      changeTolerance: changeToleranceSchema.optional(),
      desiredConfidence: confidenceSchema.optional(),
      currentConfidence: confidenceSchema.optional(),
      artifactPreference: artifactPreferenceSchema.optional(),
      preferredRoute: routeSchema.optional(),
      researchFindings: z.array(researchFindingSchema).optional(),
      options: z.array(optionSchema).optional(),
      openQuestions: z.array(questionSchema).optional(),
      answers: z.array(answerSchema).optional(),
      chosenOptionId: optionalTrimmedString,
      note: optionalTrimmedString.describe("What changed in this iteration."),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    outputSchema: sessionOutputSchema,
  },
  async (args) => {
    try {
      const session = engine.updateSession(args.sessionId, args);
      log(`updated ${session.sessionId}`);
      return serializeResult(session);
    } catch (error) {
      return serializeError(error);
    }
  },
);

server.registerTool(
  "brainstorm_status",
  {
    title: "Brainstorm Status",
    description: "Read the current structured state of a brainstorming session.",
    inputSchema: {
      sessionId: z.string().trim().min(1),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputSchema: sessionOutputSchema,
  },
  async (args) => {
    try {
      const session = engine.getSession(args.sessionId);
      return serializeResult(session);
    } catch (error) {
      return serializeError(error);
    }
  },
);

server.registerTool(
  "brainstorm_finalize",
  {
    title: "Brainstorm Finalize",
    description:
      "Finalize a brainstorming session once the confidence target is met, or explicitly accept the remaining gap.",
    inputSchema: {
      sessionId: z.string().trim().min(1),
      preferredRoute: routeSchema.optional(),
      artifactPreference: artifactPreferenceSchema.optional(),
      currentConfidence: confidenceSchema.optional(),
      chosenOptionId: optionalTrimmedString,
      rationale: optionalTrimmedString.describe("Why this direction is being finalized."),
      acceptLowerConfidence: coercedBoolean
        .optional()
        .describe("Allow finalization below the desired confidence threshold."),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    outputSchema: sessionOutputSchema,
  },
  async (args) => {
    try {
      const session = engine.finalizeSession(args.sessionId, args);
      log(`finalized ${session.sessionId}`);
      return serializeResult(session);
    } catch (error) {
      return serializeError(error);
    }
  },
);

server.registerTool(
  "brainstorm_reset",
  {
    title: "Brainstorm Reset",
    description: "Delete one brainstorming session or clear all local in-memory sessions.",
    inputSchema: {
      sessionId: optionalTrimmedString,
      allSessions: coercedBoolean.optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    outputSchema: {
      removedSessions: z.number(),
      remainingSessions: z.number(),
    },
  },
  async (args) => {
    try {
      const result = engine.resetSession(args.allSessions ? undefined : args.sessionId);
      return serializeResult(result);
    } catch (error) {
      return serializeError(error);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error starting brainstorming MCP server:", error);
  process.exit(1);
});
