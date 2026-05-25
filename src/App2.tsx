import { useState, useEffect, useRef, useCallback } from "react";
import { SCENES } from './scenes/load_scenes';
import { buildContext } from './prompt/context';
import { buildPrompt } from './prompt/build_prompt';
import { updateStuckState, buildStuckWarning } from './prompt/stuck_detection';
import { checkCollisionSweep, dist2D, footprintCentroid, stepFromAngle } from './utils/polygons';
import { buildOccupancyGrid, aStarGrid } from './utils/pathfind';
import type {
  CanvasProps, Point, LLMResponse, LogEntry, Metrics,
  SummaryCardProps, NavParams, QueryOptions, LLMProvider, WaypointNavState
} from "./types";
import { queryLLM, parseLLMResponse, buildInitialMessages, buildTurnFeedback } from "./clients/llm_client";
import type { ChatMessage } from "./clients/llm_client";
import type { WaypointContext } from "./prompt/build_prompt";
import type { OccupancyGrid } from "./utils/pathfind";
import { angleToTarget } from "./utils/polygons";

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════
const STEP_SIZE               = 0.5;
const MAX_STEPS_PER_TURN      = 3;
const ARRIVAL_THRESHOLD       = 0.5;
const AGENT_RADIUS            = 0.2;
const MAX_TURNS               = 30;
const STEP_ANIM_MS            = 380;
const WAYPOINT_ARRIVAL_RADIUS = 0.8;
const STUCK_THRESHOLD         = 0.15;
const STUCK_TURNS_LIMIT       = 3;
const GRID_RESOLUTION         = 0.15;  // world units per A* cell — balance precision vs speed

const LLM_PROVIDER: LLMProvider = "openrouter";
const LLM_OPTS: Partial<Record<LLMProvider, QueryOptions>> = {
  openrouter: { temperature: 0.2, maxTokens: 800, model: 'gpt-4o-mini' },
  local:      { temperature: 0.2, maxTokens: 800, model: 'meta-llama-3.1-8b-instruct' },
};
const SYSTEM_PROMPT = "You are a navigation agent. Always respond exclusively in JSON — no markdown, no extra text.";

const PARAMS: NavParams = {
  STEP_SIZE, MAX_STEPS_PER_TURN, ARRIVAL_THRESHOLD, AGENT_RADIUS,
  MAX_TURNS, STEP_ANIM_MS, WAYPOINT_ARRIVAL_RADIUS, STUCK_THRESHOLD,
  STUCK_TURNS_LIMIT, LLM_PROVIDER, LLM_OPTS, SYSTEM_PROMPT,
};

// ═══════════════════════════════════════════════════════════════════
// A* WAYPOINT TRACKING
// ═══════════════════════════════════════════════════════════════════

/**
 * Given the agent position and the current A* path, returns which waypoint
 * the agent should be walking toward and a WaypointContext for the prompt.
 */
function getCurrentWaypointCtx(
  pos: Point,
  astarPath: Point[],
  waypointIndexRef: React.MutableRefObject<number>,
): WaypointContext | null {
  if (!astarPath || astarPath.length < 2) return null;

  // Advance waypoint index whenever we're close enough
  while (
    waypointIndexRef.current < astarPath.length - 1 &&
    dist2D(pos, astarPath[waypointIndexRef.current]) < WAYPOINT_ARRIVAL_RADIUS
  ) {
    waypointIndexRef.current++;
  }

  const idx = waypointIndexRef.current;
  const next = astarPath[idx];
  if (!next) return null;

  return {
    nextWaypoint: next,
    distToNext: dist2D(pos, next),
    angleToNext: angleToTarget(pos, next),
    remainingCount: astarPath.length - 1 - idx,
    lookAhead: astarPath[idx + 1] ?? undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT JSON
// ═══════════════════════════════════════════════════════════════════
function exportSession(
  sceneId: string,
  metrics: Metrics,
  logs: LogEntry[],
  path: Point[],
) {
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
interface CanvasPropsExtended extends CanvasProps {
  astarPath?: Point[];
  grid?: OccupancyGrid;
}

function SceneCanvas({ agentPos, path, scene, astarPath }: CanvasPropsExtended) {
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
    // Deep terminal black background
    ctx.fillStyle = "#09090b"; 
    ctx.fillRect(0, 0, W, H);

    // Background grid (Very subtle tech grid)
    ctx.strokeStyle = "rgba(255,255,255,0.02)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= scene.room.w; i++) {
      const x = PAD + i * scale;
      ctx.beginPath(); ctx.moveTo(x, PAD); ctx.lineTo(x, PAD + scene.room.d * scale); ctx.stroke();
    }
    for (let j = 0; j <= scene.room.d; j++) {
      const y = PAD + j * scale;
      ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(PAD + scene.room.w * scale, y); ctx.stroke();
    }

    // Outer Blueprint Room Border
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.strokeRect(PAD, PAD, scene.room.w * scale, scene.room.d * scale);

    // Objects / Obstacles
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
      
      // Wireframe style infill
      ctx.fillStyle = obj.isDestiny ? "rgba(255, 174, 174, 0.29)" : "rgba(255, 0, 0, 0.27)";
      ctx.fill();
      
      ctx.strokeStyle = obj.isDestiny ? "rgba(255, 94, 94, 0.6)" : "rgba(255, 0, 0, 0.6)";
      ctx.lineWidth = obj.isDestiny ? 1.5 : 1;
      ctx.stroke();

      const center = footprintCentroid(obj.footprint);
      const { cx: lcx, cy: lcy } = tc(center.x, center.z);
      const fs = Math.max(8, Math.min(10, scale * 0.18));
      
      ctx.font = `${fs}px monospace`;
      ctx.fillStyle = obj.isDestiny ? "#ffffff" : "rgba(255,255,255,0.3)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(obj.label.toUpperCase(), lcx, lcy);
    }

    // A* planned path (Dotted fine technical line)
    if (astarPath && astarPath.length > 1) {
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const p0 = tc(astarPath[0].x, astarPath[0].z);
      ctx.moveTo(p0.cx, p0.cy);
      for (let i = 1; i < astarPath.length; i++) {
        const { cx, cy } = tc(astarPath[i].x, astarPath[i].z);
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Waypoint micro-dots
      for (let i = 1; i < astarPath.length - 1; i++) {
        const { cx, cy } = tc(astarPath[i].x, astarPath[i].z);
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fillRect(cx - 1, cy - 1, 2, 2); // Square dots look more retro than arcs
      }
    }

    // Actual walked path (CRT Phosphor Fade style)
    if (path.length > 1) {
      for (let i = 1; i < path.length; i++) {
        const p0 = tc(path[i - 1].x, path[i - 1].z);
        const p1 = tc(path[i].x, path[i].z);
        
        // Simulates a fading radar line instead of an AI rainbow gradient
        const alpha = (i / path.length) * 0.7; 
        ctx.beginPath();
        ctx.moveTo(p0.cx, p0.cy);
        ctx.lineTo(p1.cx, p1.cy);
        ctx.strokeStyle = `rgba(0, 255, 102, ${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Start marker (Simple tech cross)
    if (path.length > 0) {
      const { cx, cy } = tc(path[0].x, path[0].z);
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy - 4); ctx.lineTo(cx + 4, cy + 4);
      ctx.moveTo(cx + 4, cy - 4); ctx.lineTo(cx - 4, cy + 4);
      ctx.stroke();
    }

    // Agent (Radar Crosshair Target Reticle)
    const { cx, cy } = tc(agentPos.x, agentPos.z);
    
    // Outer range radius ring (Dashed)
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(cx, cy, AGENT_RADIUS * scale, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    // Hard Core Target Circle
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.stroke();

    // Crosshair lines
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy); ctx.lineTo(cx - 2, cy);
    ctx.moveTo(cx + 2, cy); ctx.lineTo(cx + 9, cy);
    ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy - 2);
    ctx.moveTo(cx, cy + 2); ctx.lineTo(cx, cy + 9);
    ctx.stroke();

  }, [agentPos, path, scene, astarPath, W, H]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{
        display: "block",
        background: "#09090b",
        border: "1px solid #27272a", // Solid crisp borders
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
    ["STATUS EXECUÇÃO",  metrics.success ? "✓ SUCCESS" : "✗ FAILED"],
    ["INFERÊNCIAS LLM",  String(metrics.inferences)],
    ["CICLOS / TURNOS",  String(metrics.turns)],
    ["PASSOS VÁLIDOS",   String(metrics.steps)],
    ["DIST. TOTAL",      `${metrics.distance.toFixed(2)}m`],
    ["EVASÃO COLISÃO",  String(metrics.collisionsAvoided)],
    ["DISTÂNCIA FINAL",  `${metrics.finalDist.toFixed(2)}m`],
  ];
  return (
    <div style={{
      background: "#18181b",
      border: "1px solid #27272a",
      padding: "12px",
    }}>
      <div style={{ fontSize: "9px", color: "#71717a", letterSpacing: "0.1em", fontWeight: "bold", marginBottom: "8px" }}>
        [ TELEMETRIA FINAL DA SESSÃO ]
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ borderBottom: "1px dashed #27272a", paddingBottom: "3px" }}>
            <div style={{ fontSize: "8px", color: "#71717a" }}>{k}</div>
            <div style={{ fontSize: "11px", color: "#ffffff", fontWeight: "normal", marginTop: "1px" }}>{v}</div>
          </div>
        ))}
      </div>
      <button onClick={onExport} style={{
        marginTop: "12px", width: "100%", padding: "6px",
        background: "transparent",
        border: "1px solid #3f3f46",
        color: "#e4e4e7",
        fontSize: "10px", fontFamily: "inherit",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#e4e4e7"; e.currentTarget.style.color = "#09090b"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#e4e4e7"; }}
      >
        APPEND TO EXPORT LOG (JSON)
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LOG STYLES
// ═══════════════════════════════════════════════════════════════════
const LC: { [key: string]: string } = {
  system:    "#71717a", // Zinc 500
  info:      "#a1a1aa", // Zinc 400
  planner:   "#d4d4d8", // Zinc 300
  response:  "#e4e4e7", // Zinc 200
  reasoning: "#a1a1aa", 
  prompt:    "#52525b", // Zinc 600
  step:      "#ffffff", // High contrast white
  warn:      "#f4f4f5", // Light warning accent (kept gray)
  error:     "#ffffff", 
  success:   "#ffffff",
  metric:    "#71717a",
  feedback:  "#52525b",
};

// ═══════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [sceneIdx, setSceneIdx]     = useState(0);
  const [agentPos, setAgentPos]     = useState<Point | null>(null);
  const [path, setPath]             = useState<Point[]>([]);
  const [astarPath, setAstarPath]   = useState<Point[]>([]);
  const [logs, setLogs]             = useState<LogEntry[]>([]);
  const [metrics, setMetrics]       = useState<Metrics | null>(null);
  const [running, setRunning]       = useState(false);
  const [status, setStatus]         = useState<"idle" | "running" | "arrived" | "stuck">("idle");
  const [turn, setTurn]             = useState(0);
  const [openPrompts, setOpenPrompts] = useState<Set<number>>(new Set());

  const scene = SCENES[sceneIdx];
  const door  = scene.objects.find(o => o.isDestiny)!;
  const doorCenter = footprintCentroid(door.footprint);

  const historyRef      = useRef<ChatMessage[]>([]);
  const logsEndRef      = useRef<HTMLDivElement>(null);
  const waypointIdxRef  = useRef<number>(1); // start at 1: index 0 is agent start
  const sessionRef      = useRef<{
    scene: string; metrics: Metrics; logs: LogEntry[]; path: Point[];
  } | null>(null);

  const navStateRef = useRef<WaypointNavState>({
    waypoints: [], currentIndex: 0, completedIds: [],
    stuckCounter: 0, lastPos: { x: 0, z: 0 },
    lastDistToTarget: 0, stuckAnglesTriedDeg: [],
  });

  useEffect(() => {
    setAgentPos({ ...scene.startPos });
    setPath([{ ...scene.startPos }]);
    setAstarPath([]);
    setLogs([]);
    setStatus("idle");
    setTurn(0);
    setMetrics(null);
    historyRef.current = [];
    sessionRef.current = null;
  }, [sceneIdx]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // ── NAVIGATION LOOP ───────────────────────────────────────────────
  const runNavigation = useCallback(async () => {
    setOpenPrompts(new Set());
    setRunning(true);
    setStatus("running");
    setMetrics(null);

    const initPos = { ...scene.startPos };
    setAgentPos({ ...initPos });
    setPath([{ ...initPos }]);
    setAstarPath([]);
    setLogs([]);
    setTurn(0);

    historyRef.current = buildInitialMessages(SYSTEM_PROMPT);

    let pos               = { ...initPos };
    let pathArr: Point[]  = [{ ...initPos }];
    let logArr: LogEntry[] = [];
    let inferences        = 0;
    let steps             = 0;
    let distance          = 0;
    let collisionsAvoided = 0;
    let currentTurn       = 0;
    let arrived           = false;
    let previousTurnFeedback: string | null = null;

    const log = (type: string, text: string): void => {
      const entry: LogEntry = {
        id: Date.now() + Math.random(),
        type, text,
        ts: new Date().toISOString(),
      };
      logArr = [...logArr, entry];
      setLogs([...logArr]);
    };

    log("system", ` Cena: "${scene.name}" | Início (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}) → Destino (${doorCenter.x.toFixed(1)}, ${doorCenter.z.toFixed(1)})`);

    // ── STEP 1: A* pre-planning ─────────────────────────────────────
    log("planner", `Calculando rota A*…`);
    const grid = buildOccupancyGrid(scene, AGENT_RADIUS, GRID_RESOLUTION);
    const rawPath = aStarGrid(pos, doorCenter, grid);

    let plannedPath: Point[] = [];
    if (rawPath && rawPath.length > 0) {
      plannedPath = rawPath;
      setAstarPath(plannedPath);
      log("planner", `✅ A* encontrou rota com ${plannedPath.length} waypoints.`);
    } else {
      log("warn", `⚠️ A* não encontrou rota. O LLM navegará sem guia de waypoints.`);
    }

    waypointIdxRef.current = 1; // reset to first waypoint (index 0 is start)

    navStateRef.current = {
      waypoints: [], currentIndex: 0, completedIds: [],
      stuckCounter: 0,
      lastPos: { ...initPos },
      lastDistToTarget: dist2D(initPos, doorCenter),
      stuckAnglesTriedDeg: [],
    };

    // ── STEP 2: Turn-by-turn LLM reactive navigation ────────────────
    while (currentTurn < MAX_TURNS) {
      currentTurn++;
      setTurn(currentTurn);

      const d = dist2D(pos, doorCenter);
      if (d < ARRIVAL_THRESHOLD) {
        log("success", `Turno ${currentTurn}: Chegou ao destino! Distância final: ${d.toFixed(2)}m`);
        arrived = true;
        break;
      }

      // Stuck detection
      const isStuck = updateStuckState(pos, navStateRef.current, PARAMS.STUCK_THRESHOLD, PARAMS.STUCK_TURNS_LIMIT);
      let stuckWarningStr: string | undefined;

      if (isStuck) {
        stuckWarningStr = buildStuckWarning(navStateRef.current, pos, scene, PARAMS.STEP_SIZE, PARAMS.AGENT_RADIUS);
        log("warn", `⚠️ PRESO por ${navStateRef.current.stuckCounter} turnos. Gerando aviso de escape…`);

        // Re-run A* from current position when stuck to get a fresh route
        const freshPath = aStarGrid(pos, doorCenter, grid);
        if (freshPath && freshPath.length > 1) {
          plannedPath = freshPath;
          setAstarPath(plannedPath);
          waypointIdxRef.current = 1;
          log("planner", `🔄 A* replanejou rota: ${plannedPath.length} waypoints.`);
        }
      }

      // Build waypoint context for the prompt
      const wpCtx = getCurrentWaypointCtx(pos, plannedPath, waypointIdxRef);

      const ctx    = buildContext(pos, scene);
      const prompt = buildPrompt(ctx, scene, PARAMS, stuckWarningStr, previousTurnFeedback, wpCtx);

      log("prompt", prompt);

      if (wpCtx) {
        log("info", `🗺️ Waypoint ${waypointIdxRef.current}/${plannedPath.length - 1} | Próximo: (${wpCtx.nextWaypoint.x.toFixed(1)}, ${wpCtx.nextWaypoint.z.toFixed(1)}) | ${wpCtx.distToNext.toFixed(1)}m @ ${wpCtx.angleToNext}°`);
      }
      log("info", `Turno ${currentTurn} | Destino: ${ctx.doorDist}m | Direção: ${ctx.doorAngle}° | Consultando LLM…`);

      const currentMessages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: prompt },
      ];

      let resp: LLMResponse;
      try {
        const { reply } = await queryLLM(currentMessages, LLM_PROVIDER, LLM_OPTS[LLM_PROVIDER]);
        inferences++;
        resp = parseLLMResponse(reply);
      } catch (e) {
        log("error", `❌ Erro LLM: ${(e as Error).message}`);
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

        log("step", `Passo ${i + 1}: ${s.angle}° / ${(s.distance || STEP_SIZE).toFixed(1)}m → (${pos.x.toFixed(2)}, ${pos.z.toFixed(2)})`);

        await new Promise(r => setTimeout(r, STEP_ANIM_MS));

        if (dist2D(pos, doorCenter) < ARRIVAL_THRESHOLD) break;
      }

      previousTurnFeedback = buildTurnFeedback(
        currentTurn, executedSteps, pos, collisionEvents,
        dist2D(pos, doorCenter).toFixed(1), resp.reasoning,
      );

      if (collisionEvents.length > 0) {
        log("feedback", `🔁 Feedback | ${executedSteps.length} passos | ${collisionEvents.length} colisão(ões): ${collisionEvents.map(c => `"${c.what}" @${c.angle}°`).join(", ")}`);
      } else {
        log("feedback", `🔁 Feedback | ${executedSteps.length} passos executados | sem colisões`);
      }

      await new Promise(r => setTimeout(r, 350));
    }

    if (!arrived && currentTurn >= MAX_TURNS) {
      log("error", `🛑 Limite de ${MAX_TURNS} turnos atingido.`);
      setStatus("stuck");
    } else if (arrived) {
      setStatus("arrived");
    }

    const finalMetrics: Metrics = {
      success: arrived, inferences, turns: currentTurn,
      steps, distance, collisionsAvoided,
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
    setAstarPath([]);
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
    idle:    ["STANDBY", "#71717a"],
    running: ["PROCESSING...", "#ffffff"],
    arrived: ["TARGET ACQUIRED", "#ffffff"],
    stuck:   ["SYSTEM CRITICAL / STUCK", "#ffffff"],
  }[status] ?? ["UNKNOWN", "#71717a"];

  function PromptAccordion({ id, text, open, onToggle }: any) {
    return (
      <div style={{ borderLeft: "1px solid #27272a", marginBottom: "4px" }}>
        <button
          onClick={() => onToggle(id)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#a1a1aa", fontSize: "10px", padding: "4px 8px",
            fontFamily: "inherit", textAlign: "left", width: "100%",
          }}
        >
          {open ? "[-] TELEMETRY PROMPT DATA" : "[+] VIEW INJECTED PROMPT METADATA"}
        </button>
        {open && (
          <pre style={{
            margin: "0 0 4px 8px", padding: "8px",
            background: "#18181b",
            border: "1px dashed #27272a", fontSize: "9px",
            color: "#a1a1aa", whiteSpace: "pre-wrap",
            wordBreak: "break-word", lineHeight: "1.5",
            maxHeight: "200px", overflowY: "auto",
          }}>
            {text}
          </pre>
        )}
      </div>
    );
  }
  return (
    <div style={{
      height: "100vh",
      background: "#09090b", // Pure dark zinc black
      color: "#e4e4e7",
      fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* HEADER */}
      <header style={{
        borderBottom: "1px solid #27272a",
        padding: "12px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#09090b",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div>
          <div style={{ fontSize: "8px", color: "#52525b", letterSpacing: "0.15em" }}>
            NAV-SYSTEM // CORE_v4.2 // RECON_ENGINE
          </div>
          <div style={{ fontSize: "14px", fontWeight: "normal", color: "#ffffff", marginTop: "1px" }}>
            SCENE://{scene.name.toUpperCase().replace(/\s+/g, "_")}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "10px", color: ST[1], fontWeight: "bold" }}>
            <div style={{
              width: 5, height: 5, background: ST[1],
              animation: status === "running" ? "blink 0.8s infinite steps(2)" : "none",
            }} />
            {ST[0]}
          </div>
          {turn > 0 && <div style={{ fontSize: "10px", color: "#52525b" }}>CYCLE: {turn}/{MAX_TURNS}</div>}
        </div>
      </header>

      {/* SCENE TABS */}
      <div style={{
        display: "flex", gap: "4px", padding: "8px 20px",
        borderBottom: "1px solid #27272a",
        overflowX: "auto", background: "#09090b"
      }}>
        {SCENES.map((s, i) => (
          <button key={s.id} onClick={() => { if (!running) setSceneIdx(i); }} disabled={running}
            style={{
              padding: "4px 10px",
              border: i === sceneIdx ? "1px solid #ffffff" : "1px solid #27272a",
              background: i === sceneIdx ? "#ffffff" : "transparent",
              color: i === sceneIdx ? "#09090b" : "#71717a",
              fontSize: "10px", cursor: running ? "not-allowed" : "pointer",
              fontFamily: "inherit", transition: "all 0.1s",
            }}
          >
            {s.name.toUpperCase()}
          </button>
        ))}
      </div>

      {/* BODY */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* LEFT */}
        <div style={{
          display: "flex", flexDirection: "column", gap: "12px",
          padding: "16px", borderRight: "1px solid #27272a",
          overflowY: "auto", minWidth: "fit-content", background: "#09090b"
        }}>
          <SceneCanvas
            agentPos={agentPos || scene.startPos}
            path={path}
            scene={scene}
            astarPath={astarPath}
          />

          {/* Telemetry Sub-Dashboard instead of Generic Legend */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
            {[
              ["MATRIX COORDINATES", agentPos ? `X:${agentPos.x.toFixed(2)} / Z:${agentPos.z.toFixed(2)}` : "VOID"],
              ["PROXIMITY RADAR",    agentPos ? `${dist2D(agentPos, doorCenter).toFixed(2)}m` : "VOID"],
              ["HISTORIC STEPS",     String(path.length - 1)],
              ["SYSTEM TIME-STEP",   turn ? `CYCLE_${turn}` : "IDLE"],
            ].map(([k, v]) => (
              <div key={k} style={{
                background: "#18181b",
                border: "1px solid #27272a",
                padding: "6px 8px",
              }}>
                <div style={{ fontSize: "7px", color: "#52525b" }}>{k}</div>
                <div style={{ fontSize: "11px", color: "#e4e4e7", marginTop: "1px" }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Control Buttons */}
          <div style={{ display: "flex", gap: "6px" }}>
            <button onClick={runNavigation} disabled={running} style={{
              flex: 1, padding: "8px",
              background: running ? "transparent" : "#ffffff",
              border: "1px solid #ffffff",
              color: running ? "#52525b" : "#09090b",
              fontSize: "10px", fontWeight: "bold", cursor: running ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}>
              {running ? "|| IN_PROGRESS" : ">> INITIALIZE SYSTEM"}
            </button>
            <button onClick={handleReset} disabled={running} style={{
              padding: "8px 12px",
              background: "transparent",
              border: "1px solid #27272a", color: "#71717a",
              fontSize: "11px", cursor: running ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => { if(!running) e.currentTarget.style.borderColor = "#ffffff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#27272a"; }}
            >RESET</button>
          </div>

          <SummaryCard metrics={metrics} onExport={handleExport} />
        </div>

        {/* RIGHT — TERMINAL LOG */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, background: "#09090b" }}>
          <div style={{
            padding: "8px 16px",
            borderBottom: "1px solid #27272a",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: "8px", color: "#52525b", letterSpacing: "0.1em",
          }}>
            <span>SYSTEM_LOG_BUFFER</span>
            <span>[{logs.length} ENTRIES]</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {logs.length === 0 && (
              <div style={{ color: "#3f3f46", fontSize: "10px", fontFamily: "monospace", textAlign: "center", marginTop: "40px" }}>
                [SYSTEM IDLE. AWAITING INITIALIZATION SEQUENCE...]
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
                  fontSize: "10px",
                  lineHeight: "1.5",
                  color: LC[entry.type] || "#71717a",
                  padding: "1px 6px",
                  borderLeft: `1px solid ${LC[entry.type] || "#27272a"}`,
                  background: entry.type === "error" ? "rgba(255,0,0,0.05)" : "transparent",
                }}>
                  <span style={{ color: "#3f3f46", marginRight: "6px", fontSize: "9px" }}>
                    {new Date(entry.ts).toLocaleTimeString(undefined, { hour12: false })}
                  </span>
                  {entry.text}
                </div>
              )
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #09090b; }
        ::-webkit-scrollbar-thumb { background: #27272a; }
        ::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
      `}</style>
    </div>
  );
}