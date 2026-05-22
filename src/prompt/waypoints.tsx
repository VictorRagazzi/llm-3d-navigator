import type { Point, Scene, Waypoint, NavParams, WaypointNavState } from "../types";
import { queryLLM, type ChatMessage } from '../clients/llm_client'
import { footprintCentroid, checkCollisionSweep, dist2D } from '../utils/polygons'

// ═══════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO DO ESTADO DE WAYPOINTS
// ═══════════════════════════════════════════════════════════════════
 
type CardinalFace = "north" | "south" | "east" | "west" | "center";

interface ObjectAnchorRef {
  label: string;       // label do objeto na imagem
  face: CardinalFace;
  offset?: number;     // opcional — default 0.8 se ausente
  radius?: number;     // opcional — default WAYPOINT_ARRIVAL_RADIUS
  wpLabel?: string;    // nome semântico do waypoint (opcional)
}

interface ObjectBounds {
  xMin: number; xMax: number;
  zMin: number; zMax: number;
  cx: number;   cz: number;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS DE GEOMETRIA
// ═══════════════════════════════════════════════════════════════════

function renderSceneToBase64(scene: Scene): { base64: string; scale: number; W: number; H: number } {
  const TARGET_PX = 900; // resolução maior que o canvas de UI (~460px)
  const scale     = Math.min(TARGET_PX / scene.room.w, TARGET_PX / scene.room.d);
  const PAD       = 36;
  const W         = Math.round(scene.room.w * scale + PAD * 2);
  const H         = Math.round(scene.room.d * scale + PAD * 2);
 
  const canvas  = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx     = canvas.getContext("2d")!;
 
  // Fundo
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, W, H);
 
  // Grade
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth   = 1;
  for (let i = 0; i <= scene.room.w; i++) {
    const x = PAD + i * scale;
    ctx.beginPath(); ctx.moveTo(x, PAD); ctx.lineTo(x, PAD + scene.room.d * scale); ctx.stroke();
  }
  for (let j = 0; j <= scene.room.d; j++) {
    const y = PAD + j * scale;
    ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(PAD + scene.room.w * scale, y); ctx.stroke();
  }
 
  // Borda da sala
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth   = 2;
  ctx.strokeRect(PAD, PAD, scene.room.w * scale, scene.room.d * scale);
 
  // Objetos como polígonos coloridos
  const tc = (x: number, z: number) => ({ cx: PAD + x * scale, cy: PAD + z * scale });
  for (const obj of scene.objects) {
    if (obj.footprint.length < 2) continue;
 
    ctx.beginPath();
    const [fx, fz] = obj.footprint[0];
    ctx.moveTo(PAD + fx * scale, PAD + fz * scale);
    for (let i = 1; i < obj.footprint.length; i++) {
      ctx.lineTo(PAD + obj.footprint[i][0] * scale, PAD + obj.footprint[i][1] * scale);
    }
    ctx.closePath();
 
    ctx.fillStyle   = obj.isDestiny ? "rgba(96,165,250,0.25)" : "rgba(255,255,255,0.07)";
    ctx.fill();
    ctx.strokeStyle = obj.color;
    ctx.lineWidth   = obj.isDestiny ? 3 : 2;
    ctx.stroke();
 
    // Label no centróide
    const cx = obj.footprint.reduce((s, p) => s + p[0], 0) / obj.footprint.length;
    const cz = obj.footprint.reduce((s, p) => s + p[1], 0) / obj.footprint.length;
    const fs  = Math.max(9, Math.min(13, scale * 0.22));
    ctx.font         = `${obj.isDestiny ? "bold " : ""}${fs}px monospace`;
    ctx.fillStyle    = obj.isDestiny ? "#93c5fd" : "rgba(255,255,255,0.55)";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(obj.label, PAD + cx * scale, PAD + cz * scale);
  }
 
  // Ponto de início do agente
  const { cx: sx, cy: sz } = tc(scene.startPos.x, scene.startPos.z);
  ctx.beginPath(); ctx.arc(sx, sz, 10, 0, Math.PI * 2);
  ctx.fillStyle   = "#fbbf24";
  ctx.fill();
  ctx.font        = "bold 11px monospace";
  ctx.fillStyle   = "#000";
  ctx.textAlign   = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("A", sx, sz);
 
  // Eixos e escala no canto
  ctx.font      = "10px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.textAlign = "left";
  ctx.fillText(`N (z=0)`, PAD + 4, PAD - 20);
  ctx.fillText(`S (z=${scene.room.d})`, PAD + 4, PAD + scene.room.d * scale + 18);
  ctx.fillText(`W (x=0)`, 2, PAD + 14);
 
  // Retorna base64 sem prefixo
  const dataUrl = canvas.toDataURL("image/png");
  return {
    base64: dataUrl.replace(/^data:image\/png;base64,/, ""),
    scale,
    W,
    H,
  };
}

function getFootprintBounds(fp: [number, number][]): ObjectBounds {
  const xs = fp.map(p => p[0]);
  const zs = fp.map(p => p[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const zMin = Math.min(...zs), zMax = Math.max(...zs);
  return { xMin, xMax, zMin, zMax, cx: (xMin + xMax) / 2, cz: (zMin + zMax) / 2 };
}

function resolveAnchorToCoords(
  ref: ObjectAnchorRef,
  scene: Scene,
): { x: number; z: number; anchorLabel: string } | null {
  const obj = scene.objects.find(o => o.label === ref.label);
  if (!obj) return null;

  const b      = getFootprintBounds(obj.footprint);
  const offset = ref.offset ?? 0.8;

  switch (ref.face) {
    case "north":  return { x: b.cx,               z: b.zMin - offset, anchorLabel: obj.label };
    case "south":  return { x: b.cx,               z: b.zMax + offset, anchorLabel: obj.label };
    case "east":   return { x: b.xMax + offset,    z: b.cz,            anchorLabel: obj.label };
    case "west":   return { x: b.xMin - offset,    z: b.cz,            anchorLabel: obj.label };
    case "center": return { x: b.cx,               z: b.cz,            anchorLabel: obj.label };
  }
}

export function tryAdvanceWaypoint(agentPos: Point, state: WaypointNavState, waypointRadius: number): boolean {
  const wp = getCurrentWaypoint(state);
  if (!wp) return false;
  const radius = wp.radius ?? waypointRadius;
  if (dist2D(agentPos, { x: wp.x, z: wp.z }) <= radius) {
    state.completedIds.push(wp.id);
    state.currentIndex++;
    state.stuckCounter = 0;
    state.stuckAnglesTriedDeg = [];
    return true;
  }
  return false;
}

export function initWaypointState(scene: Scene, startPos: Point): WaypointNavState | null {
  if (!scene.waypoints || scene.waypoints.length === 0) return null;
  return {
    waypoints: scene.waypoints,
    currentIndex: 0,
    completedIds: [],
    stuckCounter: 0,
    lastPos: { ...startPos },
    lastDistToTarget: Infinity,
    stuckAnglesTriedDeg: [],
  };
}



/**
 * Valida um waypoint retornado pela LLM:
 * - dentro dos limites da sala
 * - sem colisão com obstáculos
 * - coordenadas numéricas válidas
 */
export function validateWaypoint(wp: Partial<Waypoint>, scene: Scene, agentRadius: number): wp is Waypoint {
  if (
    typeof wp.id     !== "string" || wp.id.trim() === "" ||
    typeof wp.label  !== "string" || wp.label.trim() === "" ||
    typeof wp.x      !== "number" || isNaN(wp.x) ||
    typeof wp.z      !== "number" || isNaN(wp.z)
  ) return false;
 
  // Dentro dos limites da sala (com margem do agente)
  const m = agentRadius + 0.1;
  if (wp.x < m || wp.x > scene.room.w - m) return false;
  if (wp.z < m || wp.z > scene.room.d - m) return false;
 
  // Sem colisão com obstáculos
  if (checkCollisionSweep({ x: wp.x, z: wp.z }, { x: wp.x, z: wp.z }, scene, agentRadius).hit) return false;
 
  return true;
}

export function getCurrentWaypoint(state: WaypointNavState): Waypoint | null {
  if (state.currentIndex >= state.waypoints.length) return null;
  return state.waypoints[state.currentIndex];
}

// ═══════════════════════════════════════════════════════════════════
// DESCRIÇÃO DE PASSAGENS (mantida — útil no prompt mesmo sem JSON)
// ═══════════════════════════════════════════════════════════════════

function describePassages(scene: Scene): string {
  const walls = scene.objects.filter(o =>
    o.label?.toLowerCase().includes("parede") ||
    o.label?.toLowerCase().includes("wall"),
  );
  if (walls.length === 0) return "";

  const THRESHOLD = 0.4;
  const passages: string[] = [];

  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const a = getFootprintBounds(walls[i].footprint);
      const b = getFootprintBounds(walls[j].footprint);

      if (Math.abs(a.cz - b.cz) < THRESHOLD) {
        const left  = a.xMax < b.xMin ? a : b;
        const right = a.xMax < b.xMin ? b : a;
        const gapX0 = left.xMax, gapX1 = right.xMin;
        if (gapX1 - gapX0 > 0.3) {
          passages.push(
            `  - Horizontal passage at z≈${a.cz.toFixed(1)}: gap x=${gapX0.toFixed(2)}..${gapX1.toFixed(2)} — between "${walls[i].label}" and "${walls[j].label}"`,
          );
        }
      }

      if (Math.abs(a.cx - b.cx) < THRESHOLD) {
        const top    = a.zMax < b.zMin ? a : b;
        const bottom = a.zMax < b.zMin ? b : a;
        const gapZ0  = top.zMax, gapZ1 = bottom.zMin;
        if (gapZ1 - gapZ0 > 0.3) {
          passages.push(
            `  - Vertical passage at x≈${a.cx.toFixed(1)}: gap z=${gapZ0.toFixed(2)}..${gapZ1.toFixed(2)} — between "${walls[i].label}" and "${walls[j].label}"`,
          );
        }
      }
    }
  }

  return passages.length > 0
    ? `\nDetected passages (the agent MUST pass through these gaps):\n${passages.join("\n")}`
    : "";
}

// ═══════════════════════════════════════════════════════════════════
// PROMPT
// ═══════════════════════════════════════════════════════════════════

export function buildWaypointGenerationPrompt(scene: Scene): string {
  const door       = scene.objects.find(o => o.isDestiny)!;
  const doorCenter = footprintCentroid(door.footprint);

  // Lista de labels visíveis na imagem — reforça o que a LLM já vê
  const labelList = scene.objects
    .filter(o => !o.isDestiny)
    .map(o => `"${o.label}"`)
    .join(", ");

  const passageBlock = describePassages(scene);

  return `You are a navigation planner. You will receive a top-down floor plan image of a ${scene.room.w}x${scene.room.d} meter room.

## Coordinate system
- North = up in the image (z decreases)
- South = down  (z increases)
- East  = right (x increases)
- West  = left  (x decreases)
- Agent start: marked "A" in the image (x=${scene.startPos.x}, z=${scene.startPos.z})
- Destination: the highlighted door object (x≈${doorCenter.x.toFixed(1)}, z≈${doorCenter.z.toFixed(1)})
${passageBlock}

## Object labels visible in the image
${labelList}

## Your task
Trace a collision-free path from the agent "A" to the destination door.
For each waypoint on that path, pick ONE object visible in the image and ONE of its faces as the anchor point.
The system will automatically place the waypoint at the center of that face, offset into free space.

Face convention:
  "north" → waypoint placed just north of the object (above it in the image)
  "south" → waypoint placed just south of the object (below it)
  "east"  → waypoint placed just east  of the object (to its right)
  "west"  → waypoint placed just west  of the object (to its left)
  "center"→ waypoint placed at the object's centroid (only for large open areas)

## Rules
1. Use ONLY labels from the list above — exactly as written, case-sensitive.
2. Choose objects near passages, doorways, or room transitions as anchors.
3. For each passage between rooms, anchor to one of its flanking wall segments using the face that points into the gap.
4. Order waypoints: start → through each room in sequence → near door (but not on it).
5. Keep the list minimal — only waypoints truly needed to navigate the path.

Respond ONLY with a valid JSON array, no markdown, no explanation:
[
  {
    "label": "<object label exactly as shown in image>",
    "face": <"north" | "south" | "east" | "west" | "center">,
    "offset": <meters from face into free space, min 0.6>,
    "radius": <0.8 for passages, 1.2 for open areas>,
    "wpLabel": "short semantic name for this waypoint"
  }
]`;
}

// ═══════════════════════════════════════════════════════════════════
// HINT GERADO PELO CÓDIGO
// ═══════════════════════════════════════════════════════════════════

function buildHint(
  pos: Point,
  prevPoint: Point,
  anchorLabel: string,
  face: CardinalFace,
): string {
  const dx = pos.x - prevPoint.x;
  const dz = pos.z - prevPoint.z;
  const primaryDir = Math.abs(dx) >= Math.abs(dz)
    ? (dx > 0 ? "East" : "West")
    : (dz > 0 ? "South" : "North");

  const faceDir: Record<CardinalFace, string> = {
    north: "north side of",
    south: "south side of",
    east:  "east side of",
    west:  "west side of",
    center: "center of",
  };

  return `Head ${primaryDir} toward the ${faceDir[face]} "${anchorLabel}"`;
}

// ═══════════════════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════

export async function generateWaypointsFromImage(
  scene: Scene,
  log: (type: string, text: string) => void,
  params: NavParams,
): Promise<Waypoint[] | null> {
  log("system", "🧠 Gerando waypoints via LLM (âncoras por label+face)…");

  // 1. Renderiza cena — a imagem carrega os labels visualmente
  let imageData: ReturnType<typeof renderSceneToBase64>;
  try {
    imageData = renderSceneToBase64(scene);
    log("info", `🖼️  Canvas renderizado (${imageData.W}×${imageData.H}px, ${imageData.scale.toFixed(1)}px/m)`);
  } catch (e) {
    log("error", `❌ Falha ao renderizar canvas: ${(e as Error).message}`);
    return null;
  }

  // 2. Prompt + mensagem multimodal
  const prompt = buildWaypointGenerationPrompt(scene);
  log("prompt", prompt);

  const messages: ChatMessage[] = [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: "image/png", data: imageData.base64 },
        },
        { type: "text", text: prompt },
      ] as any,
    },
  ];

  // 3. Chama a LLM
  let rawJson: string;
  try {
    const { reply } = await queryLLM(
      messages,
      params.LLM_PROVIDER,
      params.LLM_OPTS[params.LLM_PROVIDER],
    );
    rawJson = reply;
    log("info",  `📡 Resposta recebida (${rawJson.length} chars)`);
    log("saída", rawJson);
  } catch (e) {
    log("error", `❌ Falha na chamada à LLM: ${(e as Error).message}`);
    return null;
  }

  // 4. Parse
  let parsed: ObjectAnchorRef[];
  try {
    const match = rawJson.match(/\[[\s\S]*\]/);
    const clean = match ? match[0] : rawJson.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) throw new Error("Resposta não é um array");
  } catch (e) {
    log("error", `❌ Falha ao parsear resposta: ${(e as Error).message}`);
    log("warn",  `⚠️  Raw: ${rawJson.slice(0, 300)}`);
    return null;
  }

  // 5. Resolve coordenadas e valida
  const valid: Waypoint[] = [];
  const invalid: any[]    = [];
  const m = params.AGENT_RADIUS + 0.1;
  let prevPoint: Point = { ...scene.startPos };

  parsed.forEach((ref, i) => {
    // Valida estrutura mínima
    if (
      typeof ref.label !== "string" || ref.label.trim() === "" ||
      !["north", "south", "east", "west", "center"].includes(ref.face)
    ) {
      log("warn", `⚠️  Waypoint ${i + 1}: estrutura inválida — ${JSON.stringify(ref)}`);
      invalid.push(ref);
      return;
    }

    // Label existe na cena?
    const anchorObj = scene.objects.find(o => o.label === ref.label);
    if (!anchorObj) {
      log("warn", `⚠️  Waypoint ${i + 1}: label "${ref.label}" não encontrado na cena`);
      invalid.push(ref);
      return;
    }

    // Resolve coordenada
    const coords = resolveAnchorToCoords(ref, scene);
    if (!coords) { invalid.push(ref); return; }

    const x = Math.max(m, Math.min(scene.room.w - m, coords.x));
    const z = Math.max(m, Math.min(scene.room.d - m, coords.z));

    const candidate: Waypoint = {
      id:     `wp_${i + 1}_${ref.label}_${ref.face}`,
      label:  ref.wpLabel?.trim() || `${ref.label} ${ref.face}`,
      x,
      z,
      radius: ref.radius ?? params.WAYPOINT_ARRIVAL_RADIUS,
    };
    candidate.hint = buildHint({ x, z }, prevPoint, anchorObj.label, ref.face);

    if (validateWaypoint(candidate, scene, params.AGENT_RADIUS)) {
      valid.push(candidate);
      prevPoint = { x, z };
      log("info", `  ✓ wp ${i + 1}: "${candidate.label}" → "${ref.label}" ${ref.face}+${ref.offset ?? 0.8}m = (${x.toFixed(2)}, ${z.toFixed(2)})`);
      return;
    }

    // Rescue: aumenta offset gradualmente
    let rescued = false;
    for (let extra = 0.3; extra <= 1.5; extra += 0.3) {
      const retry = resolveAnchorToCoords({ ...ref, offset: (ref.offset ?? 0.8) + extra }, scene);
      if (!retry) break;

      const rx = Math.max(m, Math.min(scene.room.w - m, retry.x));
      const rz = Math.max(m, Math.min(scene.room.d - m, retry.z));
      // const retryWp: Waypoint = { ...candidate, x: rx, z: rz };
      const retryWp: Waypoint = candidate
      retryWp.x = rx;
      retryWp.z = rz;

      retryWp.hint = buildHint({ x: rx, z: rz }, prevPoint, anchorObj.label, ref.face);

      if (validateWaypoint(retryWp, scene, params.AGENT_RADIUS)) {
        valid.push(retryWp);
        prevPoint = { x: rx, z: rz };
        log("info", `  ✓ wp ${i + 1}: resgatado offset +${extra.toFixed(1)}m = (${rx.toFixed(2)}, ${rz.toFixed(2)})`);
        rescued = true;
        break;
      }
    }

    if (!rescued) {
      log("warn", `⚠️  Waypoint ${i + 1} inválido após ajuste — descartado`);
      invalid.push(ref);
    }
  });

  if (invalid.length > 0) log("warn", `⚠️  ${invalid.length} waypoint(s) descartado(s)`);

  if (valid.length === 0) {
    log("error", "❌ Nenhum waypoint válido — fallback para navegação direta à porta");
    return null;
  }

  log("info", `✅ ${valid.length} waypoints: ${valid.map(w => `"${w.label}"`).join(" → ")}`);
  return valid;
}