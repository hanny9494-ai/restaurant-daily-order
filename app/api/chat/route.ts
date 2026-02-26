import { NextRequest, NextResponse } from "next/server";

type DifyResponse = {
  answer?: string;
  conversation_id?: string;
  message?: string;
  code?: string;
};

export async function POST(request: NextRequest) {
  try {
    const timeoutMs = 90000;
    const body = await request.json();
    const query = String(body?.query || "").trim();
    const conversationId = String(body?.conversationId || "").trim();

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const baseUrl = process.env.DIFY_API_BASE_URL || "https://api.dify.ai";
    const apiKey = process.env.DIFY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "DIFY_API_KEY is not configured" }, { status: 500 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const upstream = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat-messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        inputs: {},
        query,
        response_mode: "streaming",
        // 用固定 user，确保多轮对话的 conversationId 能被找到
        user: "chef-user",
        ...(conversationId ? { conversation_id: conversationId } : {})
      }),
      signal: controller.signal
    }).finally(() => clearTimeout(timer));

    if (!upstream.ok) {
      const json = (await upstream.json()) as DifyResponse;
      const msg = json?.message || json?.code || "Dify request failed";
      return NextResponse.json({ error: msg }, { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.includes("text/event-stream")) {
      const json = (await upstream.json()) as DifyResponse;
      return NextResponse.json({
        answer: json.answer || "",
        conversationId: json.conversation_id || ""
      });
    }

    const reader = upstream.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: "Dify stream body is empty" }, { status: 502 });
    }

    const decoder = new TextDecoder();
    const deadline = Date.now() + timeoutMs;
    let buffer = "";
    let answer = "";
    let finalConversationId = conversationId;

    while (Date.now() < deadline) {
      const remaining = Math.max(1, deadline - Date.now());
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("SSE_TIMEOUT")), remaining);
        })
      ]);

      if (chunk.done) break;

      buffer += decoder.decode(chunk.value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const block of events) {
        const lines = block.split("\n");
        const eventType = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() || "";
        const dataLine = lines.find((line) => line.startsWith("data:"))?.slice(5).trim();
        if (!dataLine) continue;

        let payload: any = null;
        try {
          payload = JSON.parse(dataLine);
        } catch {
          continue;
        }

        if (payload?.conversation_id) {
          finalConversationId = String(payload.conversation_id);
        }
        if (eventType === "message" || payload?.event === "message") {
          if (typeof payload.answer === "string") {
            answer += payload.answer;
          }
        }
        if (eventType === "message_end" || payload?.event === "message_end") {
          return NextResponse.json({ answer, conversationId: finalConversationId });
        }
        if (eventType === "workflow_finished" || payload?.event === "workflow_finished") {
          const workflowAnswer = payload?.data?.outputs?.answer;
          return NextResponse.json({
            answer: typeof workflowAnswer === "string" && workflowAnswer ? workflowAnswer : answer,
            conversationId: finalConversationId
          });
        }
        if (eventType === "error" || payload?.event === "error") {
          return NextResponse.json({ error: payload?.message || "Dify stream error" }, { status: 502 });
        }
      }
    }

    return NextResponse.json(
      { error: "Dify stream timeout (90s). Please check model/provider config in Dify." },
      { status: 504 }
    );
  } catch (error: any) {
    if (error?.message === "SSE_TIMEOUT" || error?.name === "AbortError") {
      return NextResponse.json(
        { error: "Dify stream timeout (90s). Please check model/provider config in Dify." },
        { status: 504 }
      );
    }
    return NextResponse.json({ error: error?.message || "Invalid request" }, { status: 400 });
  }
}
