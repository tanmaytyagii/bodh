import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/config";

// Same-origin proxy to the FastAPI service, so the browser never needs the
// API's address or CORS. Responses are streamed through unchanged, which keeps
// server-sent events (the answer stream) incremental.

const ALLOWED = [
  /^health$/,
  /^ask$/,
  /^ask\/stream$/,
  /^feedback$/,
  /^search$/,
  /^sources(\/[\w.-]+(\/chapters\/[\w.-]+|\/passages\/[\w.-]+\/[\w.-]+)?)?$/,
  /^passages\/[\w.-]+$/,
  /^concepts(\/[\w.-]+)?$/,
  /^stories(\/[\w.-]+)?$/,
];

const PASS_RESPONSE_HEADERS = ["content-type", "cache-control", "retry-after"];

async function proxy(request: NextRequest, ctx: RouteContext<"/api/[...path]">) {
  const { path } = await ctx.params;
  const target = path.join("/");
  if (!ALLOWED.some((pattern) => pattern.test(target))) {
    return Response.json({ detail: "Not found." }, { status: 404 });
  }

  const url = new URL(`${API_URL}/${target}`);
  url.search = request.nextUrl.search;

  const headers = new Headers({ accept: request.headers.get("accept") ?? "application/json" });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const client =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "";
  if (client) headers.set("x-forwarded-for", client);

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: request.method,
      headers,
      body: request.method === "POST" ? await request.text() : undefined,
      cache: "no-store",
      signal: request.signal,
    });
  } catch (error) {
    // The browser gets a plain message; whoever runs the web app gets where it looked, and why it failed.
    if (!request.signal.aborted) {
      const reason = error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error);
      console.error(`API proxy: ${request.method} /${target} failed. Is the API running at ${API_URL}? (${reason})`);
    }
    return Response.json(
      { detail: "The guidance service is not reachable right now. Please try again shortly." },
      { status: 503 },
    );
  }

  const responseHeaders = new Headers();
  for (const name of PASS_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  if (upstream.headers.get("content-type")?.startsWith("text/event-stream")) {
    responseHeaders.set("cache-control", "no-cache, no-transform");
    responseHeaders.set("x-accel-buffering", "no");
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const GET = proxy;
export const POST = proxy;
