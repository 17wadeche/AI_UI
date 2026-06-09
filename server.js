import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const DEFAULT_MODEL = "qwen3:4b";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

function modelMatches(name, target) {
  return name === target || name.startsWith(`${target}:`);
}

async function pipeReadableStreamToResponse(readable, res) {
  const reader = readable.getReader();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }

  res.end();
}

app.get("/api/ollama-status", async (_req, res) => {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);

    if (!response.ok) {
      return res.status(response.status).json({
        running: false,
        error: "Ollama responded, but the status check failed."
      });
    }

    const data = await response.json();
    const models = data.models || [];
    const modelNames = models.map((model) => model.name);

    res.json({
      running: true,
      url: OLLAMA_URL,
      models: modelNames,
      defaultModel: DEFAULT_MODEL,
      hasDefaultModel: modelNames.some((name) => modelMatches(name, DEFAULT_MODEL))
    });
  } catch {
    res.json({
      running: false,
      url: OLLAMA_URL,
      models: [],
      defaultModel: DEFAULT_MODEL,
      hasDefaultModel: false,
      error: "Could not connect to Ollama. Make sure Ollama is running."
    });
  }
});

app.post("/api/pull", async (req, res) => {
  const model = req.body?.model || DEFAULT_MODEL;
  const controller = new AbortController();

  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    const response = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model, stream: true }),
      signal: controller.signal
    });

    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");

    if (!response.ok) {
      const errorText = await response.text();
      res.write(JSON.stringify({ error: errorText || "Model download failed.", done: true }) + "\n");
      return res.end();
    }

    await pipeReadableStreamToResponse(response.body, res);
  } catch (error) {
    if (!res.writableEnded) {
      res.write(JSON.stringify({ error: error.message, done: true }) + "\n");
      res.end();
    }
  }
});

app.post("/api/chat", async (req, res) => {
  const {
    model = DEFAULT_MODEL,
    messages = [],
    system = "",
    temperature = 0,
    context = 8192,
    thinking = false
  } = req.body;

  const fullMessages = [];

  if (system.trim()) {
    fullMessages.push({ role: "system", content: system.trim() });
  }

  for (const message of messages) {
    if (message?.role && message?.content) {
      fullMessages.push({ role: message.role, content: message.content });
    }
  }

  const controller = new AbortController();

  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: fullMessages,
        stream: true,
        think: Boolean(thinking),
        options: {
          temperature: Number(temperature),
          num_ctx: Number(context)
        }
      }),
      signal: controller.signal
    });

    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");

    if (!response.ok) {
      const errorText = await response.text();
      res.write(JSON.stringify({ error: errorText || "Ollama chat request failed.", done: true }) + "\n");
      return res.end();
    }

    await pipeReadableStreamToResponse(response.body, res);
  } catch (error) {
    if (!res.writableEnded) {
      res.write(JSON.stringify({ error: error.message, done: true }) + "\n");
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`Chey Local AI running at http://localhost:${PORT}`);
});
