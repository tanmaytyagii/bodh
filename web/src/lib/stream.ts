// Client for the streaming ask endpoint (server-sent events over a POST).

import type { MessageKey } from "./i18n/messages";
import type { Answer, HistoryTurn, Passage, Retrieval, Stage } from "./types";

export interface StreamHandlers {
  onStage?: (stage: Stage) => void;
  onUnderstanding?: (data: { language: string; request_type: string; summary: string }) => void;
  onPassages?: (passages: Passage[], retrieval: Retrieval | null) => void;
  onAnswer: (answer: Answer) => void;
  onError?: (message: string) => void;
}

/**
 * Why a question could not be answered: an interface message (`key`, shown
 * in the chosen language), or the server's own explanation (`message`).
 */
export class AskError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly key?: MessageKey,
    readonly values?: Record<string, string | number>,
  ) {
    super(message);
  }
}

export async function askStream(
  question: string,
  history: HistoryTurn[],
  handlers: StreamHandlers,
  signal?: AbortSignal,
  /** Passages the question is about ("Ask about this verse"), searched first. */
  passageIds: string[] = [],
): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/ask/stream", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(passageIds.length ? { question, history, passage_ids: passageIds } : { question, history }),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new AskError("Could not reach the server. Check your connection and try again.", undefined, "error.network");
  }
  if (!response.ok || !response.body) {
    throw await responseError(response);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let answered = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = parseEvent(block);
      if (event) {
        answered = dispatch(event.type, event.data, handlers) || answered;
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
  if (!answered) throw new AskError("The answer was interrupted. Please try again.", undefined, "error.interrupted");
}

function parseEvent(block: string): { type: string; data: unknown } | null {
  let type = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) type = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  try {
    return { type, data: JSON.parse(data.join("\n")) };
  } catch {
    return null;
  }
}

function dispatch(type: string, data: unknown, handlers: StreamHandlers): boolean {
  switch (type) {
    case "status":
      handlers.onStage?.((data as { stage: Stage }).stage);
      return false;
    case "understanding":
      handlers.onUnderstanding?.(data as { language: string; request_type: string; summary: string });
      return false;
    case "passages": {
      const payload = data as { passages: Passage[]; retrieval?: Retrieval | null };
      handlers.onPassages?.(payload.passages, payload.retrieval ?? null);
      return false;
    }
    case "answer":
      handlers.onAnswer(data as Answer);
      return true;
    case "error":
      handlers.onError?.((data as { message: string }).message);
      return false;
    default:
      return false;
  }
}

async function responseError(response: Response): Promise<AskError> {
  const status = response.status;
  if (status === 429) {
    return new AskError(
      "You have asked several questions in a short time. Please wait a minute and try again.",
      status,
      "error.rateLimited",
    );
  }
  if (status === 502 || status === 503) {
    return new AskError("The guidance service is not available right now. Please try again shortly.", status, "error.unavailable");
  }
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return new AskError(body.detail, status);
  } catch {
    // fall through
  }
  return new AskError(`Something went wrong (${status}). Please try again.`, status, "error.status", { status });
}
