import axios from 'axios';
import type { LLMResponse } from '../types';

export type LLMProvider = "local" | "openrouter" | "anthropic";
export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

interface QueryOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
  timeout?: number;
}

export async function queryLLM(
  messages: ChatMessage[],
  provider: LLMProvider = "local",
  options: QueryOptions = {}
): Promise<{ reply: string; history: ChatMessage[] }> {
  const { maxRetries = 3 } = options;
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let reply: string;
      switch (provider) {
        case "local":      reply = await queryLocal(messages, options);      break;
        case "openrouter": reply = await queryOpenRouter(messages, options);  break;
        case "anthropic":  reply = await queryAnthropic(messages, options);   break;
        default: throw new Error(`Provedor desconhecido: ${provider}`);
      }

      const history: ChatMessage[] = [
        ...messages,
        { role: "assistant", content: reply },
      ];
      return { reply, history };

    } catch (error) {
      lastError = error;
      if (axios.isAxiosError(error) && error.response &&
          error.response.status < 500 && error.response.status !== 429) throw error;

      const waitTime = attempt * 2000;
      console.warn(`⚠️ Erro no ${provider} (tentativa ${attempt}/${maxRetries}). Retentando em ${waitTime}ms...`);
      await new Promise(res => setTimeout(res, waitTime));
    }
  }
  throw new Error(`Falha total após ${maxRetries} tentativas. Último erro: ${lastError?.message}`);
}

// --- PROVEDORES ---

async function queryLocal(messages: ChatMessage[], opts: QueryOptions): Promise<string> {
  const url = import.meta.env.VITE_LOCAL_LLM_URL || "/api-local/v1/chat/completions";
  const response = await axios.post(url, {
    model: opts.model || "meta-llama-3.1-8b-instruct",
    messages,
    temperature: opts.temperature ?? 0.7,
    stream: false,
  }, {
    headers: { "Content-Type": "application/json" },
    timeout: opts.timeout ?? 90000,
  });
  return response.data.choices[0].message.content.trim();
}

async function queryOpenRouter(messages: ChatMessage[], opts: QueryOptions): Promise<string> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY não encontrada no .env");

  // OpenRouter espera system separado do array para alguns modelos — deixamos no array mesmo
  const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
    model: opts.model || "google/gemini-pro-1.5",
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 1500,
  }, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "3d-scene-navigation-research",
    },
    timeout: opts.timeout ?? 60000,
  });
  return response.data.choices[0].message.content.trim();
}

async function queryAnthropic(messages: ChatMessage[], opts: QueryOptions): Promise<string> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não encontrada no .env");

  // Anthropic exige system fora do array de messages
  const systemMsg = messages.find(m => m.role === "system");
  const convo      = messages.filter(m => m.role !== "system");

  const response = await axios.post("https://api.anthropic.com/v1/messages", {
    model: opts.model || "claude-3-5-sonnet-20240620",
    max_tokens: opts.maxTokens ?? 1500,
    ...(systemMsg ? { system: systemMsg.content } : {}),
    messages: convo,
  }, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    timeout: opts.timeout ?? 60000,
  });
  return response.data.content[0].text.trim();
}

// --- HELPERS ---

export function parseLLMResponse(raw: string): LLMResponse {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const cleanJson = jsonMatch ? jsonMatch[0] : raw;
    const parsed = JSON.parse(cleanJson);
    return {
      reasoning: parsed.reasoning ?? parsed.raciocinio ?? "",
      steps: (parsed.steps ?? parsed.passos ?? []).map((s: any) => ({
        angle:    s.angle    ?? s.angulo    ?? 0,
        distance: s.distance ?? s.distancia ?? 0.5,
      })),
      arrived: parsed.arrived ?? parsed.chegou ?? false,
    };
  } catch {
    throw new Error("Falha ao processar JSON do LLM. Formato inválido.");
  }
}

/** Monta o array inicial de mensagens para uma nova sessão */
export function buildInitialMessages(systemPrompt: string): ChatMessage[] {
  return [{ role: "system", content: systemPrompt }];
}

/** Monta a mensagem de feedback do turno para ser anexada ao histórico */
export function buildTurnFeedback(
  turnNumber: number,
  stepsExecuted: Array<{ angle: number; distance: number }>,
  newPos: { x: number; z: number },
  collisions: Array<{ angle: number; what: string }>,
  doorDist: string,
): string {
  const stepsDesc = stepsExecuted
    .map((s, i) => `  Step ${i + 1}: angle ${s.angle}°, distance ${s.distance}m`)
    .join("\n");

  const collisionDesc = collisions.length > 0
    ? `\nCollisions blocked:\n${collisions.map(c => `  - angle ${c.angle}° → hit "${c.what}"`).join("\n")}`
    : "\nNo collisions this turn.";

  return `Turn ${turnNumber} result:
New position: x=${newPos.x.toFixed(2)}, z=${newPos.z.toFixed(2)}
Steps executed:
${stepsDesc}${collisionDesc}
Distance to door: ${doorDist}m

Now provide your next move.`;
}