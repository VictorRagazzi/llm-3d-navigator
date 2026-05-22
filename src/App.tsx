import { useState, useEffect, useRef, useCallback } from "react";
import { SCENES } from './scenes/load_scenes'
import { buildContext } from './prompt/context'
import { buildPrompt } from './prompt/build_prompt'
import { checkCollisionSweep, dist2D, footprintCentroid, stepFromAngle,  } from './utils/polygons'
import type { CanvasProps, Point, LLMResponse, LogEntry, Metrics, SummaryCardProps, NavParams, QueryOptions, LLMProvider } from "./types";
import { queryLLM, parseLLMResponse, buildInitialMessages, buildTurnFeedback } from "./clients/llm_client";
import type { ChatMessage } from "./clients/llm_client";

// ═══════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════
const STEP_SIZE                  = 0.5;
const MAX_STEPS_PER_TURN         = 3;
const ARRIVAL_THRESHOLD          = 0.5;
const AGENT_RADIUS               = 0.2;
const MAX_TURNS                  = 30;
const STEP_ANIM_MS               = 380;
const WAYPOINT_ARRIVAL_RADIUS    = 0.8; // chegada em waypoint intermediário (mais frouxo)
const STUCK_THRESHOLD            = 0.15;  // movimento mínimo por turno antes de considerar stuck
const STUCK_TURNS_LIMIT          = 3;     // turnos consecutivos parado → modo escape
const LLM_PROVIDER: LLMProvider  = "openrouter"; // "local" | "openrouter" | "anthropic"
const LLM_OPTS: Partial<Record<LLMProvider, QueryOptions>> = {
                                      openrouter: {
                                        temperature: 0.2, maxTokens: 1500, model: 'gpt-4o-mini'
                                      },
                                      local: {
                                        temperature: 0.2, maxTokens: 1500, model: 'meta-llama-3.1-8b-instruct'
                                      }
                                    };
const SYSTEM_PROMPT = "You are a 3D navigation agent. Always respond exclusively in JSON, no markdown, no extra text.";

const PARAMS: NavParams = { STEP_SIZE, MAX_STEPS_PER_TURN, ARRIVAL_THRESHOLD, AGENT_RADIUS, MAX_TURNS, STEP_ANIM_MS, WAYPOINT_ARRIVAL_RADIUS, STUCK_THRESHOLD, STUCK_TURNS_LIMIT, LLM_PROVIDER, LLM_OPTS, SYSTEM_PROMPT}

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
// CANVAS 2D — ALTERAÇÃO 1: desenha polígonos via footprint
// ═══════════════════════════════════════════════════════════════════
function SceneCanvas({ agentPos, path, scene }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const MAX_PX = 460;
  const scale = Math.min(MAX_PX / scene.room.w, MAX_PX / scene.room.d);
  const PAD = 20;
  const W = Math.round(scene.room.w * scale + PAD * 2);
  const H = Math.round(scene.room.d * scale + PAD * 2);

  // Converte coordenada do mundo para pixel no canvas
  const tc = (x: number, z: number) => ({ cx: PAD + x * scale, cy: PAD + z * scale });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !agentPos) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#06090f";
    ctx.fillRect(0, 0, W, H);

    // Grade de fundo
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

    // Borda da sala
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD, PAD, scene.room.w * scale, scene.room.d * scale);

    // ALTERAÇÃO 1 — desenha cada objeto como polígono usando footprint
    for (const obj of scene.objects) {
      if (obj.footprint.length < 2) continue;

      ctx.beginPath();
      const first = tc(obj.footprint[0][0], obj.footprint[0][1]);
      ctx.moveTo(first.cx, first.cy);
      for (let i = 1; i < obj.footprint.length; i++) {
        const { cx, cy } = tc(obj.footprint[i][0], obj.footprint[i][1]);
        ctx.lineTo(cx, cy);
      }
      ctx.closePath();

      ctx.fillStyle = obj.isDestiny ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.04)";
      ctx.fill();
      ctx.strokeStyle = obj.color;
      ctx.lineWidth = obj.isDestiny ? 2.5 : 1.5;
      ctx.stroke();

      // ALTERAÇÃO 1 — label no centróide do footprint
      const center = footprintCentroid(obj.footprint);
      const { cx: lcx, cy: lcy } = tc(center.x, center.z);
      const fs = Math.max(8, Math.min(11, scale * 0.2));
      ctx.font = `${obj.isDestiny ? "bold " : ""}${fs}px monospace`;
      ctx.fillStyle = obj.isDestiny ? "#93c5fd" : "rgba(255,255,255,0.45)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(obj.label, lcx, lcy);
    }

    // Trilha do caminho
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

    // Ponto de início
    if (path.length > 0) {
      const { cx, cy } = tc(path[0].x, path[0].z);
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#fbbf24"; ctx.fill();
    }

    // Agente
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
    ["Dist. final", `${metrics.finalDist.toFixed(2)}m`],
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
  response:  "#7c3aed",
  reasoning: "#c084fc",
  prompt:    "#1e3a5f",
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
  const [openPrompts, setOpenPrompts] = useState<Set<number>>(new Set());

  const scene = SCENES[sceneIdx];
  const door  = scene.objects.find(o => o.isDestiny)!;
  const doorCenter = footprintCentroid(door.footprint);

  const historyRef  = useRef<ChatMessage[]>([]);
  const logsEndRef  = useRef<HTMLDivElement>(null);
  const sessionRef  = useRef<{
    scene: string;
    metrics: Metrics;
    logs: LogEntry[];
    path: Point[];
  } | null>(null);

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
    setOpenPrompts(new Set());
    setRunning(true);
    setStatus("running");
    setMetrics(null);

    const initPos = { ...scene.startPos };
    setAgentPos({ ...initPos });
    setPath([{ ...initPos }]);
    setLogs([]);
    setTurn(0);

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
      const entry: LogEntry = { id: Date.now() + Math.random(), type, text, ts: new Date().toISOString()};
      logArr = [...logArr, entry];
      setLogs([...logArr]);
    };

    log("system", `🚀 Cena: "${scene.name}" | Início (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}) → Destino (${doorCenter.x.toFixed(1)}, ${doorCenter.z.toFixed(1)})`);

    while (currentTurn < MAX_TURNS) {
      currentTurn++;
      setTurn(currentTurn);

      const d = dist2D(pos, doorCenter);
      if (d < ARRIVAL_THRESHOLD) {
        log("success", `✅ Turno ${currentTurn}: Chegou ao destino! Distância final: ${d.toFixed(2)}m`);
        arrived = true;
        break;
      }

      const ctx    = buildContext(pos, scene);
      const prompt = buildPrompt(ctx, scene, PARAMS);
      log("prompt", prompt);

      const distLog = ctx.objs.map(o => `${o.label} ${o.distancia}m`).join(" | ");
      log("info", `📐 Distâncias: ${distLog} | Destino ${ctx.doorDist}m`);
      log("info", `🤔 Turno ${currentTurn} | Destino: ${ctx.doorDist}m | Direção: ${ctx.doorAngle}° | Consultando LLM…`);

      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: prompt },
      ];

      let resp: LLMResponse;
      try {
        const { reply, history } = await queryLLM(historyRef.current, LLM_PROVIDER, LLM_OPTS[LLM_PROVIDER]);
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
        log("success", `✅ LLM declarou chegada. Destino: ${dist2D(pos, doorCenter).toFixed(2)}m`);
        arrived = true;
        break;
      }

      const turnSteps = (resp.steps || []).slice(0, MAX_STEPS_PER_TURN);
      const executedSteps: Array<{ angle: number; distance: number }> = [];
      const collisionEvents: Array<{ angle: number; what: string }>   = [];

      for (let i = 0; i < turnSteps.length; i++) {
        const s      = turnSteps[i];
        const newPos = stepFromAngle(pos, s.angle, s.distance || STEP_SIZE);
        const col    = checkCollisionSweep(pos, newPos, scene, PARAMS.AGENT_RADIUS);

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

        if (dist2D(pos, doorCenter) < ARRIVAL_THRESHOLD) break;
      }

      const feedback = buildTurnFeedback(
        currentTurn,
        executedSteps,
        pos,
        collisionEvents,
        dist2D(pos, doorCenter).toFixed(1),
        resp.reasoning,
      );

      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: feedback },
      ];

      if (collisionEvents.length > 0) {
        log("feedback", `🔁 Feedback injetado | ${executedSteps.length} passos executados | ${collisionEvents.length} colisão(ões): ${collisionEvents.map(c => `"${c.what}" @${c.angle}°`).join(", ")}`);
      } else {
        log("feedback", `🔁 Feedback injetado | ${executedSteps.length} passos executados | sem colisões`);
      }

      await new Promise(r => setTimeout(r, 350));
    }

    if (!arrived && currentTurn >= MAX_TURNS) {
      log("error", `🛑 Limite de ${MAX_TURNS} turnos atingido sem chegar ao destino.`);
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
      finalDist: dist2D(pos, doorCenter),
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
    setOpenPrompts(new Set());
    setAgentPos({ ...scene.startPos });
    setPath([{ ...scene.startPos }]);
    setLogs([]);
    setStatus("idle");
    setTurn(0);
    setMetrics(null);
    historyRef.current = [];
    sessionRef.current = null;
  };

  const togglePrompt = useCallback((id: number) => {
    setOpenPrompts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const ST = {
    idle:    ["Aguardando", "#334155"],
    running: ["Navegando…", "#60a5fa"],
    arrived: ["Chegou ✓",   "#34d399"],
    stuck:   ["Travado",    "#f87171"],
  }[status] ?? ["Desconhecido", "#475569"];

  function PromptAccordion({ id, text, open, onToggle }: {
    id: number; text: string; open: boolean; onToggle: (id: number) => void
  }) {
    return (
      <div style={{ borderLeft: "2px solid #1e3a5f33", borderRadius: "0 3px 3px 0" }}>
        <button
          onClick={() => onToggle(id)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#1e6fa8", fontSize: "11px", padding: "2px 8px",
            fontFamily: "inherit", textAlign: "left", width: "100%",
            lineHeight: "1.7",
          }}
        >
          {open ? "▾" : "▸"} 📋 Prompt enviado ao LLM {open ? "(fechar)" : "(expandir)"}
        </button>
        {open && (
          <pre style={{
            margin: "0 0 4px 8px", padding: "8px",
            background: "rgba(30,58,95,0.18)",
            borderRadius: "4px", fontSize: "9.5px",
            color: "#60a5fa", whiteSpace: "pre-wrap",
            wordBreak: "break-word", lineHeight: "1.6",
            maxHeight: "320px", overflowY: "auto",
          }}>
            {text}
          </pre>
        )}
      </div>
    );
  }

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
              ["#60a5fa", "Destino"],
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
              ["Dist. Destino", agentPos ? `${dist2D(agentPos, doorCenter).toFixed(1)}m` : "—"],
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
            {logs.map(entry =>
              entry.type === "prompt" ? (
                <PromptAccordion
                  key={entry.id}
                  id={entry.id}
                  text={entry.text}
                  open={openPrompts.has(entry.id)}
                  onToggle={togglePrompt}
                />
              ) : (
                <div key={entry.id} style={{
                  fontSize: "11px", lineHeight: "1.7",
                  color: LC[entry.type] || "#475569",
                  padding: "2px 8px",
                  borderLeft: `2px solid ${LC[entry.type] || "#334155"}33`,
                  borderRadius: "0 3px 3px 0",
                  background: entry.type === "success"   ? "rgba(52,211,153,0.05)"
                            : entry.type === "error"     ? "rgba(248,113,113,0.05)"
                            : entry.type === "reasoning" ? "rgba(192,132,252,0.04)"
                            : entry.type === "feedback"  ? "rgba(148,163,184,0.04)"
                            : "transparent",
                }}>
                  {entry.text}
                </div>
              )
            )}
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