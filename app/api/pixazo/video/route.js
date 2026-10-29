import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = "https://gateway.pixazo.ai";
const CREATE_URL = `${BASE}/ltx-video/v1/text-to-video`;

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function errorMessage(data) {
  return String(data?.message || data?.error || data?.detail || "Pixazo API error.");
}

function extractUrl(data) {
  const media = data?.output?.media_url;
  if (Array.isArray(media) && typeof media[0] === "string") return media[0];
  if (typeof media === "string") return media;
  if (typeof data?.output?.preview_video?.url === "string") {
    return data.output.preview_video.url;
  }
  return typeof data?.url === "string" ? data.url : null;
}

export async function POST(request) {
  const apiKey = process.env.PIXAZO_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "PIXAZO_API_KEY missing. Add it in Vercel Environment Variables." },
      { status: 500 }
    );
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  const prompt = String(input?.prompt || "").trim();

  if (!prompt || prompt.length > 4000) {
    return NextResponse.json(
      { error: "Prompt must contain 1 to 4000 characters." },
      { status: 400 }
    );
  }

  const allowedAspects = [
    "16:9", "9:16", "1:1", "4:3", "3:4",
    "21:9", "4:5", "2:3", "3:2"
  ];

  const aspect = allowedAspects.includes(input?.aspect_ratio)
    ? input.aspect_ratio
    : "16:9";

  // 121 frames at 24 FPS is approximately a 5-second clip.
  // This calls the Pixazo LTX Video preview endpoint.
  const payload = {
    prompt,
    aspect,
    num_frames: 121,
    frame_rate: 24,
    enhance_prompt: true
  };

  try {
    const response = await fetch(CREATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "Ocp-Apim-Subscription-Key": apiKey
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    const data = await readJson(response);

    if (!response.ok) {
      let message = `Pixazo API HTTP ${response.status}: ${errorMessage(data)}`;
      if (response.status === 402) {
        message = "Pixazo reports insufficient balance or no free-preview allowance. Check the Pixazo API console before retrying.";
      }
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const requestId = data?.request_id || data?.data?.request_id;
    const url = extractUrl(data);

    if (url && (!requestId || String(data?.status || "").toUpperCase() === "COMPLETED")) {
      return NextResponse.json({
        request_id: requestId || null,
        status: "COMPLETED",
        url
      });
    }

    if (!requestId) {
      return NextResponse.json(
        { error: "Pixazo did not return request_id. Check Pixazo API logs." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      request_id: String(requestId),
      status: String(data?.status || "QUEUED").toUpperCase()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Could not connect to Pixazo." },
      { status: 502 }
    );
  }
}

export async function GET(request) {
  const apiKey = process.env.PIXAZO_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "PIXAZO_API_KEY missing in Vercel Environment Variables." },
      { status: 500 }
    );
  }

  const requestId = new URL(request.url).searchParams.get("request_id");

  if (!requestId) {
    return NextResponse.json({ error: "Missing request_id." }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${BASE}/v2/requests/status/${encodeURIComponent(requestId)}`,
      {
        headers: {
          "Ocp-Apim-Subscription-Key": apiKey,
          "Cache-Control": "no-cache"
        },
        cache: "no-store"
      }
    );

    const data = await readJson(response);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Pixazo status HTTP ${response.status}: ${errorMessage(data)}` },
        { status: response.status }
      );
    }

    const status = String(data?.status || "QUEUED").toUpperCase();
    const url = extractUrl(data);

    return NextResponse.json({
      request_id: String(data?.request_id || requestId),
      status,
      url,
      error: data?.error || (
        ["ERROR", "FAILED", "FAIL"].includes(status) ? errorMessage(data) : null
      )
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Could not check Pixazo task status." },
      { status: 502 }
    );
  }
}