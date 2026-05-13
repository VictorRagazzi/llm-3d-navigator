import { useState, useEffect, useRef, useCallback } from "react";
import type { CanvasProps, Point, Scene, LLMResponse, LogEntry, Metrics, SummaryCardProps } from "./types";
import { queryLLM, parseLLMResponse, buildInitialMessages, buildTurnFeedback } from "./clients/llm_client";
import type { ChatMessage } from "./clients/llm_client";

// ═══════════════════════════════════════════════════════════════════
// BANCO DE CENAS — adicione novas cenas aqui
// ═══════════════════════════════════════════════════════════════════

const IS_MOCKED = false;

const MOCK_SCENES: Scene[] = [
  {
    id: "quarto_simples",
    name: "Quarto Simples",
    room: { w: 10, d: 10 },
    startPos: { x: 5.0, z: 8.5 },
    objects: [
      { id: 1, label: "porta",   x: 5.0, z: 0.15, w: 1.0, d: 0.2,  h: 2.1,  color: "#60a5fa", isDestiny: true },
      { id: 2, label: "mesa",    x: 3.0, z: 4.0,  w: 1.2, d: 0.8,  h: 0.75, color: "#f59e0b" },
      { id: 3, label: "cadeira", x: 2.0, z: 5.5,  w: 0.6, d: 0.6,  h: 0.9,  color: "#a78bfa" },
      { id: 4, label: "sofá",    x: 7.5, z: 6.5,  w: 2.0, d: 0.9,  h: 0.85, color: "#34d399" },
      { id: 5, label: "estante", x: 1.0, z: 2.0,  w: 0.4, d: 1.8,  h: 1.8,  color: "#fb923c" },
      { id: 6, label: "cama",    x: 7.5, z: 3.0,  w: 2.0, d: 1.6,  h: 0.5,  color: "#f472b6" },
      { id: 7, label: "armário", x: 1.0, z: 8.0,  w: 1.2, d: 0.6,  h: 2.0,  color: "#94a3b8" },
    ],
  },
  {
    id: "sala_corredor",
    name: "Sala com Corredor",
    room: { w: 12, d: 8 },
    startPos: { x: 10.0, z: 6.5 },
    objects: [
      { id: 1, label: "porta",       x: 0.15, z: 4.0, w: 0.2, d: 1.0,  h: 2.1,  color: "#60a5fa", isDestiny: true },
      { id: 2, label: "sofá",        x: 8.5,  z: 5.5, w: 2.5, d: 1.0,  h: 0.85, color: "#34d399" },
      { id: 3, label: "mesa center", x: 6.0,  z: 4.5, w: 1.4, d: 0.8,  h: 0.75, color: "#f59e0b" },
      { id: 4, label: "tv stand",    x: 2.0,  z: 1.5, w: 1.8, d: 0.5,  h: 0.6,  color: "#94a3b8" },
      { id: 5, label: "poltrona",    x: 4.5,  z: 2.5, w: 0.8, d: 0.8,  h: 1.0,  color: "#a78bfa" },
      { id: 6, label: "estante",     x: 10.5, z: 1.0, w: 0.4, d: 2.0,  h: 1.8,  color: "#fb923c" },
      { id: 7, label: "tapete",      x: 6.0,  z: 3.5, w: 3.0, d: 2.0,  h: 0.02, color: "#e879f9" },
    ],
  },
  {
    id: "escritorio",
    name: "Escritório Lotado",
    room: { w: 8, d: 8 },
    startPos: { x: 6.5, z: 6.5 },
    objects: [
      { id: 1, label: "porta",       x: 4.0, z: 0.15, w: 0.9, d: 0.2,  h: 2.1,  color: "#60a5fa", isDestiny: true },
      { id: 2, label: "mesa work",   x: 2.0, z: 2.5,  w: 1.6, d: 0.8,  h: 0.75, color: "#f59e0b" },
      { id: 3, label: "cadeira 1",   x: 2.0, z: 3.7,  w: 0.6, d: 0.6,  h: 0.9,  color: "#a78bfa" },
      { id: 4, label: "mesa work 2", x: 5.5, z: 2.5,  w: 1.6, d: 0.8,  h: 0.75, color: "#f59e0b" },
      { id: 5, label: "cadeira 2",   x: 5.5, z: 3.7,  w: 0.6, d: 0.6,  h: 0.9,  color: "#a78bfa" },
      { id: 6, label: "armário",     x: 1.0, z: 6.5,  w: 1.5, d: 0.6,  h: 2.0,  color: "#94a3b8" },
      { id: 7, label: "impressora",  x: 6.5, z: 5.0,  w: 0.5, d: 0.4,  h: 0.4,  color: "#64748b" },
      { id: 8, label: "planta",      x: 7.2, z: 1.0,  w: 0.4, d: 0.4,  h: 1.2,  color: "#4ade80" },
    ],
  },{
    id: "537238e9",
    name: "Processed Scene",
    room: {  w: 3.05, d: 1.24 },
    startPos: { x: 0.15, z: 0.06 },
    objects: [
      { id: 1, label: "chair",        x: 0.87,  z: 0.33,  w: 0.28, d: 0.56, h: 1.1, color: "#E63946"},
      { id: 2, label: "object",       x: 0.41,  z: 0.96,  w: 0.47,  d: 0.24,   h: 1.29,    color: "#457B9D" },
      { id: 3, label: "small_object", x: 0.59,  z: -0.2,  w: 0.12,  d: 0.08,   h: 0.91,    color: "#2A9D8F" },
      { id: 4, label: "chair",        x: 2.56,  z: -0.02, w: 0.97,  d: 0.65,   h: 0.3,    color: "#E9C46A" },
      { id: 5, label: "small_object", x: -0.14, z: 1.14,  w: 0.2,  d: 0.22,   h: 0.49,    color: "#F4A261" },
      { id: 6, label: "small_object", x: -0.04, z: 0.74,  w: 0.09,  d: 0.34,   h: 0.68,    color: "#264653" },
      { id: 7, label: "chair",        x: 1.62,  z: -0.05, w: 0.68,  d: 0.76,   h: 0.64,    color: "#A8DADC", "isDestiny": true },
      { id: 8, label: "small_object", x: 2.62,  z: 0.12,  w: 0.27,  d: 0.09,   h: 0.24,    color: "#6A4C93"}
    ]
  }
];

function loadRealScenes(): Scene[] {
  // Usando o caminho relativo direto do src
  const sceneFiles = import.meta.glob('./scenes/*.json', { eager: true });
  
  const scenes = Object.values(sceneFiles).map((module: any) => {
    // Se o Vite importar como um módulo ES, o conteúdo estará em .default
    // Se for direto, o próprio module é o objeto.
    return (module.default ? module.default : module) as Scene;
  });

  return scenes;
}

const SCENES: Scene[] = (IS_MOCKED ? MOCK_SCENES : loadRealScenes()) || [];

// ═══════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════
const STEP_SIZE          = 0.5;
const MAX_STEPS_PER_TURN = 3;
const ARRIVAL_THRESHOLD  = 0.8;
const AGENT_RADIUS       = 0.3;
const MAX_TURNS          = 30;
const STEP_ANIM_MS       = 380;
const LLM_PROVIDER       = "openrouter"; // "local" | "openrouter" | "anthropic"
const LLM_OPTS           = { 
                            openrouter: { 
                              temperature: 0.7, maxTokens: 1500, model: 'gpt-4o-mini' 
                            },
                            local: {
                              temperature: 0.7, maxTokens: 1500, model: 'meta-llama-3.1-8b-instruct' 
                            } 
                          }; // Customize por provedor se quiser
const SYSTEM_PROMPT = "You are a 3D navigation agent. Always respond exclusively in JSON, no markdown, no extra text.";

// ═══════════════════════════════════════════════════════════════════
// GEOMETRIA
// ═══════════════════════════════════════════════════════════════════
const dist2D = (a: Point, b: Point) => Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);

function angleToTarget(from: { x: number; z: number }, to: { x: number; z: number }) {
  const a = Math.atan2(to.x - from.x, -(to.z - from.z)) * (180 / Math.PI);
  return Math.round((a + 360) % 360);
}

function stepFromAngle(pos: { x: number; z: number }, deg: number, dist: number = STEP_SIZE) {
  const r = (deg * Math.PI) / 180;
  return { x: pos.x + dist * Math.sin(r), z: pos.z - dist * Math.cos(r) };
}

function checkCollision(pos: { x: number; z: number }, scene: typeof SCENES[0]) {
  const { room, objects } = scene;
  const m = AGENT_RADIUS;
  if (pos.x < m || pos.x > room.w - m || pos.z < m || pos.z > room.d - m)
    return { hit: true, what: "parede" };
  for (const o of objects) {
    if (o.isDestiny) continue;
    if (
      pos.x > o.x - o.w / 2 - m && pos.x < o.x + o.w / 2 + m &&
      pos.z > o.z - o.d / 2 - m && pos.z < o.z + o.d / 2 + m
    ) return { hit: true, what: o.label };
  }
  return { hit: false, what: null };
}

// ═══════════════════════════════════════════════════════════════════
// CONTEXTO + PROMPT
// ═══════════════════════════════════════════════════════════════════
function buildContext(agentPos: { x: number; z: number }, scene: typeof SCENES[0]) {
  const door = scene.objects.find(o => o.isDestiny);
  if (!door) throw new Error("No door found in scene");
  const objs = scene.objects
    .filter(o => !o.isDestiny)
    .map(o => ({
      label: o.label,
      distancia: dist2D(agentPos, o).toFixed(1),
      direcao: angleToTarget(agentPos, o),
      volume: (o.w * o.d * o.h).toFixed(2),
      dims: `${o.w}x${o.d}x${o.h}m`,
    }))
    .sort((a, b) => parseFloat(a.distancia) - parseFloat(b.distancia));
  return {
    agentPos,
    objs,
    doorDist: dist2D(agentPos, door).toFixed(1),
    doorAngle: angleToTarget(agentPos, door),
  };
}

function buildPrompt(ctx: ReturnType<typeof buildContext>, scene: typeof SCENES[0]) {
  const lines = ctx.objs
    .map(o => [
      `  - ${o.label}:`,
      `dist ${o.distancia}m`,
      `bearing ${o.direcao}°`,
      `size ${o.dims}`,
      `vol ${o.volume}m³`,
    ].join(" | "))
    .join("\n");

  return `You are an autonomous navigation agent operating inside a ${scene.room.w}x${scene.room.d}m room.
Your ONLY goal is to reach the door as efficiently as possible while avoiding all obstacles.

## Current State
- Position : x=${ctx.agentPos.x.toFixed(2)}, z=${ctx.agentPos.z.toFixed(2)}
- Target   : Door — bearing ${ctx.doorAngle}°, distance ${ctx.doorDist}m

## Bearing Convention
0° = North (−z), 90° = East (+x), 180° = South (+z), 270° = West (−x)

## Obstacles (nearest → farthest)
${lines}

## Movement Rules
1. You may take up to ${MAX_STEPS_PER_TURN} steps per turn; each step is exactly ${STEP_SIZE}m.
2. A step that would collide with any obstacle or wall is INVALID and will be discarded.
3. If the door is within ${ARRIVAL_THRESHOLD}m, set \`arrived\` to true immediately.
4. Always prefer the shortest collision-free path to the door.
5. When an obstacle blocks the direct path, choose the side that minimises total detour.

## Output — strict JSON, no markdown, no extra text
{
  "reasoning": "concise explanation of chosen strategy",
  "steps": [{ "angle": <degrees 0–359>, "distance": <meters, max ${STEP_SIZE}> }],
  "arrived": false
}`;
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT JSON
// ═══════════════════════════════════════════════════════════════════
function exportSession(sceneId: string, metrics: Metrics, logs: Array<LogEntry>, path: Array<{ x: number; z: number }>) {
  const payload = { scene: sceneId, timestamp: new Date().toISOString(), metrics, path, logs };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nav_${sceneId}_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════
// CANVAS 2D
// ═══════════════════════════════════════════════════════════════════
function SceneCanvas({ agentPos, path, scene }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const MAX_PX = 460;
  const scale = Math.min(MAX_PX / scene.room.w, MAX_PX / scene.room.d);
  const PAD = 20;
  const W = Math.round(scene.room.w * scale + PAD * 2);
  const H = Math.round(scene.room.d * scale + PAD * 2);

  const tc = (x: number, z: number) => ({ cx: PAD + x * scale, cy: PAD + z * scale });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !agentPos) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#06090f";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= scene.room.w; i++) {
      const x = PAD + i * scale;
      ctx.beginPath(); ctx.moveTo(x, PAD); ctx.lineTo(x, PAD + scene.room.d * scale); ctx.stroke();
    }
    for (let j = 0; j <= scene.room.d; j++) {
      const y = PAD + j * scale;
      ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(PAD + scene.room.w * scale, y); ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD, PAD, scene.room.w * scale, scene.room.d * scale);

    for (const obj of scene.objects) {
      const { cx, cy } = tc(obj.x - obj.w / 2, obj.z - obj.d / 2);
      const pw = obj.w * scale, pd = obj.d * scale;
      ctx.fillStyle = obj.isDestiny ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.04)";
      ctx.fillRect(cx, cy, pw, pd);
      ctx.strokeStyle = obj.color;
      ctx.lineWidth = obj.isDestiny ? 2.5 : 1.5;
      ctx.strokeRect(cx, cy, pw, pd);
      const fs = Math.max(8, Math.min(11, scale * 0.2));
      ctx.font = `${obj.isDestiny ? "bold " : ""}${fs}px monospace`;
      ctx.fillStyle = obj.isDestiny ? "#93c5fd" : "rgba(255,255,255,0.45)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(obj.label, cx + pw / 2, cy + pd / 2);
    }

    if (path.length > 1) {
      for (let i = 1; i < path.length; i++) {
        const p0 = tc(path[i - 1].x, path[i - 1].z);
        const p1 = tc(path[i].x, path[i].z);
        const t = i / path.length;
        const r = Math.round(251 - t * 160);
        const g = Math.round(191 + t * 20);
        const b = Math.round(36 + t * 80);
        ctx.beginPath();
        ctx.moveTo(p0.cx, p0.cy);
        ctx.lineTo(p1.cx, p1.cy);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.8)`;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.stroke();
      }
      for (let i = 1; i < path.length - 1; i++) {
        const { cx, cy } = tc(path[i].x, path[i].z);
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(99,220,150,0.6)";
        ctx.fill();
      }
    }

    if (path.length > 0) {
      const { cx, cy } = tc(path[0].x, path[0].z);
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#fbbf24"; ctx.fill();
    }

    const { cx, cy } = tc(agentPos.x, agentPos.z);
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 24);
    grd.addColorStop(0, "rgba(99,220,150,0.35)");
    grd.addColorStop(1, "rgba(99,220,150,0)");
    ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.fillStyle = grd; ctx.fill();

    ctx.beginPath(); ctx.arc(cx, cy, AGENT_RADIUS * scale, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(99,220,150,0.15)";
    ctx.strokeStyle = "#63dc96"; ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();

    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#63dc96"; ctx.fill();

  }, [agentPos, path, scene, W, H]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{
        display: "block",
        borderRadius: "10px",
        border: "1px solid rgba(255,255,255,0.07)",
        maxWidth: "100%",
      }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════
// SUMMARY CARD
// ═══════════════════════════════════════════════════════════════════
function SummaryCard({ metrics, onExport }: SummaryCardProps) {
  if (!metrics) return null;
  const rows = [
    ["Resultado",           metrics.success ? "✅ Chegou" : "❌ Falhou"],
    ["Inferências LLM",     String(metrics.inferences)],
    ["Turnos",              String(metrics.turns)],
    ["Passos válidos",      String(metrics.steps)],
    ["Dist. percorrida",    `${metrics.distance.toFixed(2)}m`],
    ["Colisões evitadas",   String(metrics.collisionsAvoided)],
    ["Dist. final à porta", `${metrics.finalDist.toFixed(2)}m`],
  ];
  return (
    <div style={{
      background: "rgba(99,220,150,0.04)",
      border: "1px solid rgba(99,220,150,0.18)",
      borderRadius: "10px",
      padding: "14px 16px",
    }}>
      <div style={{ fontSize: "9px", color: "#63dc96", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: "10px" }}>
        Resumo da Sessão
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px 14px" }}>
        {rows.map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: "8px", color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em" }}>{k}</div>
            <div style={{ fontSize: "13px", color: "#e2e8f0", fontWeight: "600", marginTop: "1px" }}>{v}</div>
          </div>
        ))}
      </div>
      <button
        onClick={onExport}
        style={{
          marginTop: "12px", width: "100%", padding: "8px",
          background: "rgba(99,220,150,0.1)",
          border: "1px solid rgba(99,220,150,0.28)",
          borderRadius: "6px", color: "#63dc96",
          fontSize: "10px", fontFamily: "inherit",
          cursor: "pointer", letterSpacing: "0.06em",
          transition: "all 0.2s",
        }}
      >
        ↓ Exportar log JSON
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LOG STYLES
// ═══════════════════════════════════════════════════════════════════
const LC: { [key: string]: string } = {
  system:    "#475569",
  info:      "#60a5fa",
  reasoning: "#c084fc",
  step:      "#63dc96",
  warn:      "#fbbf24",
  error:     "#f87171",
  success:   "#34d399",
  metric:    "#64748b",
  feedback:  "#94a3b8",
};

// ═══════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [agentPos, setAgentPos] = useState<Point | null>(null);
  const [path, setPath] = useState<Point[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<"idle" | "running" | "arrived" | "stuck">("idle");
  const [turn, setTurn] = useState(0);

  const scene = SCENES[sceneIdx];
  const door  = scene.objects.find(o => o.isDestiny)!;

  // Histórico acumulado da conversa — persiste entre turnos da mesma sessão
  const historyRef  = useRef<ChatMessage[]>([]);
  const logsEndRef  = useRef<HTMLDivElement>(null);
  const sessionRef  = useRef<{
    scene: string;
    metrics: Metrics;
    logs: LogEntry[];
    path: Point[];
  } | null>(null);

  // Reset ao trocar de cena
  useEffect(() => {
    setAgentPos({ ...scene.startPos });
    setPath([{ ...scene.startPos }]);
    setLogs([]);
    setStatus("idle");
    setTurn(0);
    setMetrics(null);
    historyRef.current = [];
    sessionRef.current = null;
  }, [sceneIdx]);

  // ── NAVEGAÇÃO ────────────────────────────────────────────────────
  const runNavigation = useCallback(async () => {
    setRunning(true);
    setStatus("running");
    setMetrics(null);

    const initPos = { ...scene.startPos };
    setAgentPos({ ...initPos });
    setPath([{ ...initPos }]);
    setLogs([]);
    setTurn(0);

    // Inicializa o histórico com o system prompt
    historyRef.current = buildInitialMessages(SYSTEM_PROMPT);

    let pos               = { ...initPos };
    let pathArr           = [{ ...initPos }];
    let logArr: LogEntry[] = [];
    let inferences        = 0;
    let steps             = 0;
    let distance          = 0;
    let collisionsAvoided = 0;
    let currentTurn       = 0;
    let arrived           = false;

    const log = (type: string, text: string): void => {
      const entry: LogEntry = { id: Date.now() + Math.random(), type, text, ts: new Date().toISOString() };
      logArr = [...logArr, entry];
      setLogs([...logArr]);
    };

    log("system", `🚀 Cena: "${scene.name}" | Início (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}) → Porta (${door.x}, ${door.z})`);

    while (currentTurn < MAX_TURNS) {
      currentTurn++;
      setTurn(currentTurn);

      const d = dist2D(pos, door);
      if (d < ARRIVAL_THRESHOLD) {
        log("success", `✅ Turno ${currentTurn}: Chegou à porta! Distância final: ${d.toFixed(2)}m`);
        arrived = true;
        break;
      }

      const ctx    = buildContext(pos, scene);
      const prompt = buildPrompt(ctx, scene);

      // Log de distâncias antes de consultar
      const distLog = ctx.objs.map(o => `${o.label} ${o.distancia}m`).join(" | ");
      log("info", `📐 Distâncias: ${distLog} | porta ${ctx.doorDist}m`);
      log("info", `🤔 Turno ${currentTurn} | Dist. porta: ${ctx.doorDist}m | Direção: ${ctx.doorAngle}° | Consultando LLM…`);

      // Adiciona o prompt do turno ao histórico como mensagem "user"
      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: prompt },
      ];

      let resp: LLMResponse;
      try {
        const { reply, history } = await queryLLM(historyRef.current, LLM_PROVIDER, LLM_OPTS[LLM_PROVIDER]);
        // Atualiza histórico com a resposta do modelo (já inclui a msg "assistant")
        historyRef.current = history;
        inferences++;
        resp = parseLLMResponse(reply);
      } catch (e) {
        log("error", `❌ Erro: ${(e as Error).message}`);
        setStatus("stuck");
        break;
      }

      log("reasoning", `💭 ${resp.reasoning}`);

      if (resp.arrived) {
        log("success", `✅ LLM declarou chegada. Dist. à porta: ${dist2D(pos, door).toFixed(2)}m`);
        arrived = true;
        break;
      }

      const turnSteps = (resp.steps || []).slice(0, MAX_STEPS_PER_TURN);
      const executedSteps: Array<{ angle: number; distance: number }> = [];
      const collisionEvents: Array<{ angle: number; what: string }>   = [];

      for (let i = 0; i < turnSteps.length; i++) {
        const s      = turnSteps[i];
        const newPos = stepFromAngle(pos, s.angle, s.distance || STEP_SIZE);
        const col    = checkCollision(newPos, scene);

        if (col.hit) {
          collisionsAvoided++;
          collisionEvents.push({ angle: s.angle, what: col.what! });
          log("warn", `⚠️  Passo ${i + 1}: colisão com "${col.what}" evitada (${s.angle}°)`);
          break;
        }

        distance += dist2D(pos, newPos);
        steps++;
        pos     = newPos;
        executedSteps.push({ angle: s.angle, distance: s.distance || STEP_SIZE });
        pathArr = [...pathArr, { ...pos }];

        setAgentPos({ ...pos });
        setPath([...pathArr]);

        log("step", `👣 Passo ${i + 1}: ${s.angle}° / ${(s.distance || STEP_SIZE).toFixed(1)}m → (${pos.x.toFixed(2)}, ${pos.z.toFixed(2)})`);

        await new Promise(r => setTimeout(r, STEP_ANIM_MS));

        if (dist2D(pos, door) < ARRIVAL_THRESHOLD) break;
      }

      // Monta feedback do turno e injeta no histórico como "user"
      // O modelo verá o resultado real (posição, colisões) antes do próximo prompt
      const feedback = buildTurnFeedback(
        currentTurn,
        executedSteps,
        pos,
        collisionEvents,
        dist2D(pos, door).toFixed(1),
      );

      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: feedback },
      ];

      // Log resumido do feedback para o painel (sem poluir demais)
      if (collisionEvents.length > 0) {
        log("feedback", `🔁 Feedback injetado | ${executedSteps.length} passos executados | ${collisionEvents.length} colisão(ões): ${collisionEvents.map(c => `"${c.what}" @${c.angle}°`).join(", ")}`);
      } else {
        log("feedback", `🔁 Feedback injetado | ${executedSteps.length} passos executados | sem colisões`);
      }

      await new Promise(r => setTimeout(r, 350));
    }

    if (!arrived && currentTurn >= MAX_TURNS) {
      log("error", `🛑 Limite de ${MAX_TURNS} turnos atingido sem chegar à porta.`);
      setStatus("stuck");
    } else if (arrived) {
      setStatus("arrived");
    }

    const finalMetrics: Metrics = {
      success: arrived,
      inferences,
      turns: currentTurn,
      steps,
      distance,
      collisionsAvoided,
      finalDist: dist2D(pos, door),
    };

    log("metric", `📊 Fim | ${inferences} inferências | ${steps} passos | ${distance.toFixed(2)}m | ${collisionsAvoided} colisões evitadas`);

    setMetrics(finalMetrics);
    sessionRef.current = { scene: scene.id, metrics: finalMetrics, logs: logArr, path: pathArr };
    setRunning(false);
  }, [scene]);

  const handleExport = () => {
    if (!sessionRef.current) return;
    const { scene: sid, metrics: m, logs: l, path: p } = sessionRef.current;
    exportSession(sid, m, l, p);
  };

  const handleReset = () => {
    setAgentPos({ ...scene.startPos });
    setPath([{ ...scene.startPos }]);
    setLogs([]);
    setStatus("idle");
    setTurn(0);
    setMetrics(null);
    historyRef.current = [];
    sessionRef.current = null;
  };

  // ── STATUS ───────────────────────────────────────────────────────
  const ST = {
    idle:    ["Aguardando", "#334155"],
    running: ["Navegando…", "#60a5fa"],
    arrived: ["Chegou ✓",   "#34d399"],
    stuck:   ["Travado",    "#f87171"],
  }[status] ?? ["Desconhecido", "#475569"];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#06090f",
      color: "#e2e8f0",
      fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace",
      display: "flex",
      flexDirection: "column",
    }}>

      {/* HEADER */}
      <header style={{
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "13px 22px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "rgba(0,0,0,0.4)",
        backdropFilter: "blur(10px)",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div>
          <div style={{ fontSize: "8px", color: "#636f86", letterSpacing: "0.22em", textTransform: "uppercase" }}>LLM · NAVEGAÇÃO 3D · PROTÓTIPO</div>
          <div style={{ fontSize: "16px", fontWeight: "700", color: "#f1f5f9", letterSpacing: "-0.02em", marginTop: "2px" }}>
            {scene.name}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: ST[1] }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%", background: ST[1],
              boxShadow: status === "running" ? `0 0 10px ${ST[1]}` : "none",
              animation: status === "running" ? "blink 1s infinite" : "none",
            }} />
            {ST[0]}
          </div>
          {turn > 0 && <div style={{ fontSize: "9px", color: "#636f86" }}>turno {turn}/{MAX_TURNS}</div>}
        </div>
      </header>

      {/* SCENE TABS */}
      <div style={{
        display: "flex", gap: "6px", padding: "10px 22px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        overflowX: "auto",
      }}>
        {SCENES.map((s, i) => (
          <button key={s.id} onClick={() => { if (!running) setSceneIdx(i); }} disabled={running}
            style={{
              padding: "5px 14px", borderRadius: "6px",
              border: i === sceneIdx ? "1px solid rgba(99,220,150,0.45)" : "1px solid rgba(255,255,255,0.07)",
              background: i === sceneIdx ? "rgba(99,220,150,0.09)" : "rgba(255,255,255,0.02)",
              color: i === sceneIdx ? "#63dc96" : "#334155",
              fontSize: "10px", cursor: running ? "not-allowed" : "pointer",
              fontFamily: "inherit", whiteSpace: "nowrap", transition: "all 0.2s",
            }}
          >{s.name}</button>
        ))}
        <div style={{ marginLeft: "auto", fontSize: "9px", color: "#636f86", alignSelf: "center", whiteSpace: "nowrap" }}>
          + adicione cenas no array SCENES
        </div>
      </div>

      {/* BODY */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* LEFT */}
        <div style={{
          display: "flex", flexDirection: "column", gap: "11px",
          padding: "18px", borderRight: "1px solid rgba(255,255,255,0.04)",
          overflowY: "auto", minWidth: "fit-content",
        }}>
          <SceneCanvas agentPos={agentPos || scene.startPos} path={path} scene={scene} />

          {/* Legend */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {[
              ["#63dc96", "Agente"],
              ["#fbbf24", "Início"],
              ["#60a5fa", "Porta"],
              ["linear-gradient(90deg,#fbbf24,#63dc96)", "Caminho"],
            ].map(([c, l]) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "9px", color: "#334155" }}>
                <div style={{ width: 10, height: 10, borderRadius: "2px", background: c }} />
                {l}
              </div>
            ))}
          </div>

          {/* Live metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px" }}>
            {[
              ["Posição",    agentPos ? `(${agentPos.x.toFixed(1)}, ${agentPos.z.toFixed(1)})` : "—"],
              ["Dist. porta", agentPos ? `${dist2D(agentPos, door).toFixed(1)}m` : "—"],
              ["Passos",     String(path.length - 1)],
              ["Turno",      turn ? String(turn) : "—"],
            ].map(([k, v]) => (
              <div key={k} style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.04)",
                borderRadius: "6px", padding: "7px 10px",
              }}>
                <div style={{ fontSize: "7px", color: "#636f86", textTransform: "uppercase", letterSpacing: "0.12em" }}>{k}</div>
                <div style={{ fontSize: "12px", color: "#e2e8f0", fontWeight: "600", marginTop: "2px" }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: "7px" }}>
            <button onClick={runNavigation} disabled={running} style={{
              flex: 1, padding: "10px",
              background: running ? "rgba(99,220,150,0.04)" : "rgba(99,220,150,0.11)",
              border: `1px solid ${running ? "rgba(99,220,150,0.12)" : "rgba(99,220,150,0.45)"}`,
              borderRadius: "7px", color: running ? "#636f86" : "#63dc96",
              fontSize: "11px", fontWeight: "700", cursor: running ? "not-allowed" : "pointer",
              fontFamily: "inherit", transition: "all 0.2s",
            }}>
              {running ? "▶ Executando…" : "▶ Iniciar Navegação"}
            </button>
            <button onClick={handleReset} disabled={running} style={{
              padding: "10px 13px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "7px", color: "#334155",
              fontSize: "14px", cursor: running ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}>↺</button>
          </div>

          <SummaryCard metrics={metrics} onExport={handleExport} />
        </div>

        {/* RIGHT — LOG */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          <div style={{
            padding: "9px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: "8px", color: "#636f86", letterSpacing: "0.18em", textTransform: "uppercase",
          }}>
            <span>Log de Navegação</span>
            <span>{logs.length} entradas</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px", display: "flex", flexDirection: "column", gap: "2px" }}>
            {logs.length === 0 && (
              <div style={{ color: "#636f86", fontSize: "11px", textAlign: "center", marginTop: "40px" }}>
                Selecione uma cena e pressione Iniciar.
              </div>
            )}
            {logs.map(entry => (
              <div key={entry.id} style={{
                fontSize: "11px", lineHeight: "1.7",
                color: LC[entry.type] || "#475569",
                padding: "2px 8px",
                borderLeft: `2px solid ${LC[entry.type] || "#334155"}33`,
                borderRadius: "0 3px 3px 0",
                background: entry.type === "success"  ? "rgba(52,211,153,0.05)"
                          : entry.type === "error"    ? "rgba(248,113,113,0.05)"
                          : entry.type === "reasoning" ? "rgba(192,132,252,0.04)"
                          : entry.type === "feedback"  ? "rgba(148,163,184,0.04)"
                          : "transparent",
              }}>
                {entry.text}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.15} }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 2px; }
      `}</style>
    </div>
  );
}