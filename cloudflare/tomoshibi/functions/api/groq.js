// 灯火の語り部 — Groq プロキシ (Cloudflare Pages Functions)
// ブラウザからはキーなしで叩ける。Groq APIキーは Pages のシークレット
// GROQ_API_KEY にだけ存在し、クライアントへは一切返さない。
const MODELS = ["qwen/qwen3.8-27b", "openai/gpt-oss-20b", "openai/gpt-oss-120b"];
const MAX_PROMPT = 20000;

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.GROQ_API_KEY) {
    return json({ error: "proxy not configured" }, 500);
  }
  let body;
  try { body = await request.json(); } catch (e) {
    return json({ error: "bad json" }, 400);
  }
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt || prompt.length > MAX_PROMPT) {
    return json({ error: "bad prompt" }, 400);
  }
  let lastStatus = 0;
  for (const model of MODELS) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.GROQ_API_KEY,
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; tomoshibi-proxy/1.0)",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "【文体指示】返答は自然な日本語の口語で書くこと。直訳調の表現や不自然な言い回し、不要な外国語混じりを避けること。yomi（読み）を付ける場合は文脈に合う読みを選ぶこと（例：「行ったことある」は「いったことある」、「行った調査」は「おこなったちょうさ」）。\n\n" + prompt }],
          temperature: 0.7,
          max_tokens: 1000,
        }),
      });
      lastStatus = res.status;
      if (res.status === 401 || res.status === 403) {
        return json({ error: "upstream auth" }, 502);
      }
      if (!res.ok) continue;
      const data = await res.json();
      const text = data && data.choices && data.choices[0] &&
        data.choices[0].message && data.choices[0].message.content;
      if (!text) continue;
      return json({ text }, 200);
    } catch (e) {
      continue;
    }
  }
  return json({ error: "upstream failed", status: lastStatus }, 502);
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }
  return onRequestPost(context);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
