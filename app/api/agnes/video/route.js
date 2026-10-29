import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_URL = "https://apihub.agnes-ai.com";
const MODEL = "agnes-video-2.5-flash";

function getKey() {
  return process.env.AGNES_API_KEY;
}

async function readJson(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function findValue(value, keys, depth = 0) {
  if (!value || typeof value !== "object" || depth > 8) return null;

  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) {
      const item = value[key];

      if (typeof item === "string" || typeof item === "number") {
        return item;
      }
    }
  }

  const children = Array.isArray(value) ? value : Object.values(value);

  for (const child of children) {
    const result = findValue(child, keys, depth + 1);
    if (result !== null) return result;
  }

  return null;
}

function findVideoUrl(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 8) return null;

  const urlKeys = [
    "url", "video_url", "videoUrl", "output_url",
    "outputUrl", "result_url", "resultUrl"
  ];

  for (const key of urlKeys) {
    const candidate = value[key];

    if (
      typeof candidate === "string" &&
      /^https?:\/\//i.test(candidate)
    ) {
      return candidate;
    }
  }

  const children = Array.isArray(value) ? value : Object.values(value);

  for (const child of children) {
    const result = findVideoUrl(child, depth + 1);
    if (result) return result;
  }

  return null;
}

function messageOf(payload) {
  return String(
    findValue(payload, ["error", "failMsg", "fail_msg", "message", "msg", "detail"]) ||
    "Agnes API request failed."
  );
}

function extractVideoId(payload) {
  return findValue(payload, [
    "video_id", "videoId", "task_id", "taskId", "id"
  ]);
}

function normalizeStatus(payload, url) {
  const raw = String(
    findValue(payload?.data, ["status", "state", "task_status", "taskStatus"]) ||
    payload?.status ||
    payload?.state ||
    ""
  ).toLowerCase();

  if (url && ["success", "succeeded", "complete", "completed", "done"].includes(raw)) {
    return "completed";
  }

  if (url) return "completed";

  if (["failed", "fail", "error", "cancelled"].includes(raw)) {
    return "failed";
  }

  if (["completed", "complete", "success", "succeeded", "done"].includes(raw)) {
    return "processing";
  }

  if (["queued", "pending", "waiting", "created"].includes(raw)) {
    return "queued";
  }

  return raw || "processing";
}

export async function POST(request) {
  const apiKey = getKey();

  if (!apiKey) {
    return NextResponse.json(
      { error: "AGNES_API_KEY is missing. Add it in Vercel Project Settings > Environment Variables." },
      { status: 500 }
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  const prompt = String(body.prompt || "").trim();

  if (!prompt) {
    return NextResponse.json({ error: "Please enter a video prompt." }, { status: 400 });
  }

  const allowedRatios = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
  const ratio = allowedRatios.includes(body.aspect_ratio)
    ? body.aspect_ratio
    : "16:9";

  const requestedSeconds = Number(body.duration || 5);
  const seconds = Math.min(12, Math.max(4, Math.round(requestedSeconds)));

  const payload = {
    model: MODEL,
    prompt,
    mode: "text",
    seconds: String(seconds),
    size: "720P",
    aspect_ratio: ratio,
    n: 1
  };

  try {
    const response = await fetch(`${BASE_URL}/v1/videos`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    const data = await readJson(response);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Agnes API HTTP ${response.status}: ${messageOf(data)}` },
        { status: 502 }
      );
    }

    const code = data.code;

    if (
      code !== undefined &&
      !["200", "0"].includes(String(code))
    ) {
      return NextResponse.json(
        { error: `Agnes API error: ${messageOf(data)}` },
        { status: 502 }
      );
    }

    const videoId = extractVideoId(data);
    const url = findVideoUrl(data);

    if (url) {
      return NextResponse.json({
        status: "completed",
        video_id: videoId ? String(videoId) : null,
        url
      });
    }

    if (!videoId) {
      return NextResponse.json(
        { error: "Agnes did not return a video ID. Check the API response in your Agnes dashboard." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      video_id: String(videoId),
      status: "queued"
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Could not connect to Agnes API." },
      { status: 502 }
    );
  }
}

export async function GET(request) {
  const apiKey = getKey();

  if (!apiKey) {
    return NextResponse.json(
      { error: "AGNES_API_KEY is missing in Vercel environment variables." },
      { status: 500 }
    );
  }

  const videoId = new URL(request.url).searchParams.get("video_id");

  if (!videoId) {
    return NextResponse.json({ error: "Missing video_id." }, { status: 400 });
  }

  const query = new URLSearchParams({
    video_id: videoId,
    model_name: MODEL
  });

  try {
    const response = await fetch(`${BASE_URL}/agnesapi?${query.toString()}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
      cache: "no-store"
    });

    const data = await readJson(response);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Agnes status HTTP ${response.status}: ${messageOf(data)}` },
        { status: 502 }
      );
    }

    const code = data.code;

    if (
      code !== undefined &&
      !["200", "0"].includes(String(code))
    ) {
      return NextResponse.json(
        { error: `Agnes status error: ${messageOf(data)}` },
        { status: 502 }
      );
    }

    const url = findVideoUrl(data);
    const status = normalizeStatus(data, url);

    return NextResponse.json({
      video_id: videoId,
      status,
      url: url || null,
      error: status === "failed" ? messageOf(data) : null
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Could not check Agnes task status." },
      { status: 502 }
    );
  }
}