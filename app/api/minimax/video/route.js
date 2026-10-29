import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_URL = "https://api.minimax.io";

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function apiMessage(data) {
  return String(
    data?.error?.message ||
    data?.message ||
    data?.base_resp?.status_msg ||
    data?.msg ||
    "Unknown MiniMax H3 API error."
  );
}

function taskFrom(data) {
  return data?.task || data?.data?.task || data;
}

function resultUrl(task) {
  return task?.content?.url ||
         task?.content?.video_url ||
         task?.video_url ||
         task?.url ||
         null;
}

export async function POST(request) {
  const apiKey = process.env.MINIMAX_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "MINIMAX_API_KEY missing. Add it in Vercel Environment Variables." },
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

  if (!prompt || prompt.length > 5000) {
    return NextResponse.json(
      { error: "Enter a prompt between 1 and 5000 characters." },
      { status: 400 }
    );
  }

  const allowedRatios = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
  const ratio = allowedRatios.includes(input?.aspect_ratio)
    ? input.aspect_ratio
    : "16:9";

  // Fixed to 5 seconds at 768P to avoid accidental 2K usage.
  // This is still a billable API request; verify your account balance first.
  const payload = {
    model: "MiniMax-H3",
    content: [{ type: "text", text: prompt }],
    resolution: "768P",
    duration: 5,
    ratio
  };

  try {
    const response = await fetch(`${BASE_URL}/v2/video_generation`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    const data = await readJson(response);

    if (!response.ok || data?.type === "error" || data?.error) {
      const httpStatus = response.status || Number(data?.error?.http_code) || 502;
      const message = httpStatus === 402
        ? "MiniMax H3 reports insufficient balance. Check your API billing/credits. No automatic retry was sent."
        : `MiniMax H3 API HTTP ${httpStatus}: ${apiMessage(data)}`;

      return NextResponse.json(
        { error: message },
        { status: httpStatus >= 400 && httpStatus <= 599 ? httpStatus : 502 }
      );
    }

    const taskId = data?.task_id || data?.task?.id;
    const task = taskFrom(data);
    const url = resultUrl(task);

    if (url) {
      return NextResponse.json({
        task_id: taskId || null,
        status: "succeeded",
        url
      });
    }

    if (!taskId) {
      return NextResponse.json(
        { error: "MiniMax H3 did not return a task_id. Check the API response." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      task_id: String(taskId),
      status: task?.status || "queued"
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Could not connect to MiniMax H3." },
      { status: 502 }
    );
  }
}

export async function GET(request) {
  const apiKey = process.env.MINIMAX_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "MINIMAX_API_KEY missing in Vercel Environment Variables." },
      { status: 500 }
    );
  }

  const taskId = new URL(request.url).searchParams.get("task_id");

  if (!taskId) {
    return NextResponse.json({ error: "Missing task_id." }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${BASE_URL}/v2/query/video_generation/${encodeURIComponent(taskId)}`,
      {
        headers: { "Authorization": `Bearer ${apiKey}` },
        cache: "no-store"
      }
    );

    const data = await readJson(response);

    if (!response.ok || data?.type === "error" || data?.error) {
      return NextResponse.json(
        { error: `MiniMax H3 task query failed: ${apiMessage(data)}` },
        { status: response.status >= 400 ? response.status : 502 }
      );
    }

    const task = taskFrom(data);
    const url = resultUrl(task);

    return NextResponse.json({
      task_id: String(task?.id || taskId),
      status: String(task?.status || "processing").toLowerCase(),
      url,
      error: task?.status === "failed"
        ? apiMessage(task)
        : null
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Could not query MiniMax H3 task." },
      { status: 502 }
    );
  }
}