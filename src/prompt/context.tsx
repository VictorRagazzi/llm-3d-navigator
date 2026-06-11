import type { Point, Scene, NavParams } from "../types";
import { angleToTarget, checkCollisionSweep, dist2D, footprintCentroid, stepFromAngle, pointInPolygon } from '../utils/polygons'

// ═══════════════════════════════════════════════════════════════════
// CONTEXT + PROMPT
// ═══════════════════════════════════════════════════════════════════

export function buildContext(agentPos: Point, scene: Scene) {
  const door = scene.objects.find(o => o.isDestiny);
  if (!door) throw new Error("No door found in scene");
  const doorCenter = footprintCentroid(door.footprint);
 
  const objs = scene.objects
    .filter(o => !o.isDestiny)
    .map(o => {
      const center = footprintCentroid(o.footprint);
      return {
        label: o.label,
        distancia: dist2D(agentPos, center).toFixed(1),
        direcao: angleToTarget(agentPos, center),
        corners: o.footprint.map(([x, z]) => `[${x.toFixed(1)},${z.toFixed(1)}]`).join(" "),
        h: o.h,
      };
    })
    .sort((a, b) => parseFloat(a.distancia) - parseFloat(b.distancia));
 
  return {
    agentPos,
    objs,
    doorDist: dist2D(agentPos, doorCenter).toFixed(1),
    doorAngle: angleToTarget(agentPos, doorCenter),
    doorCenter,
  };
}
 
export function buildAsciiMap(agentPos: Point, scene: Scene, gridSize = 20): string {
  const { room, objects } = scene;
  const grid: string[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill("·"));
 
  const clamp = (v: number) => Math.max(0, Math.min(gridSize - 1, v));
 
  for (const obj of objects) {
    const ch = obj.isDestiny ? "D" : "█";
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const wx = (c / (gridSize - 1)) * room.w;
        const wz = (r / (gridSize - 1)) * room.d;
        if (pointInPolygon(wx, wz, obj.footprint)) grid[r][c] = ch;
      }
    }
  }
 
  const agentCol = clamp(Math.round((agentPos.x / room.w) * (gridSize - 1)));
  const agentRow = clamp(Math.round((agentPos.z / room.d) * (gridSize - 1)));
  grid[agentRow][agentCol] = "A";
 
  const rows = grid.map((row, i) => {
    const zLabel = ((i / (gridSize - 1)) * room.d).toFixed(1).padStart(4);
    return `${zLabel} │${row.join("")}│`;
  });
 
  const xLabels = Array.from({ length: gridSize }, (_, i) => {
    const val = Math.round((i / (gridSize - 1)) * room.w);
    return (val % 10).toString();
  }).join("");
 
  return [
    `       ╔${"═".repeat(gridSize)}╗`,
    ...rows,
    `       ╚${"═".repeat(gridSize)}╝`,
    `        ${xLabels}`,
    `        W (x=0) → E (x=${room.w})  |  N (z=0) → S (z=${room.d})`,
    `Legend: A=agent  D=door  █=obstacle  ·=free`,
  ].join("\n");
}

/**
 * Enhanced multi-step radar scan.
 *
 * For each of the 8 cardinal/diagonal directions, simulates up to
 * MAX_STEPS_PER_TURN consecutive steps and reports how many are free
 * before hitting an obstacle. This lets the LLM plan exactly how many
 * steps it can safely take in a given direction without colliding.
 *
 * Example output:
 *   90° (E): free×4+ | after 4 steps: dist=3.20m (+1.80m progress)
 *   135° (SE): free×2 then BLOCKED by "Sofa" | after 2 steps: dist=4.10m (+0.90m progress)
 *   180° (S): BLOCKED immediately by "Wall"
 */
export function buildDirectionScan(
  pos: { x: number; z: number },
  scene: Scene,
  params: NavParams,
  blockedByHidden: Set<number> = new Set(),
): string {
  const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
  const LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  const door = scene.objects.find(o => o.isDestiny)!;
  const doorCenter = footprintCentroid(door.footprint);
  const distFromStart = dist2D(pos, doorCenter);

  const lines = ANGLES.map((angle, idx) => {
    let cursor = { ...pos };
    let freeCount = 0;
    let blockedBy: string | null = null;

    // Simulate up to MAX_STEPS_PER_TURN steps in this direction
    for (let step = 0; step < params.MAX_STEPS_PER_TURN; step++) {
      const nextPos = stepFromAngle(cursor, angle, params.STEP_SIZE);
      const col = checkCollisionSweep(cursor, nextPos, scene, params.AGENT_RADIUS);
      if (col.hit) {
        blockedBy = col.what ?? "obstacle";
        break;
      }
      freeCount++;
      cursor = nextPos;
    }

    const distAfter = dist2D(cursor, doorCenter);
    const delta = distFromStart - distAfter;
    const progressStr = `dist=${distAfter.toFixed(2)}m (${delta >= 0 ? '+' : ''}${delta.toFixed(2)}m)`;
    const label = `${String(angle).padStart(3)}° (${LABELS[idx]})`;

    if (freeCount === 0) {
      return `  ${label}: BLOCKED immediately by "${blockedBy}"`;
    } else if (blockedBy) {
      return `  ${label}: free×${freeCount} then BLOCKED by "${blockedBy}" | after ${freeCount} steps: ${progressStr}`;
    } else if (blockedByHidden.has(angle)) {
      return `  ${label}: BLOCKED immediately by "unknown obstacle"`;
    } else {
      return `  ${label}: free×${freeCount}+ | after ${freeCount} steps: ${progressStr}`;
    }
  });

  return [
    `## Direction scan — each column = consecutive ${params.STEP_SIZE}m steps before hitting obstacle`,
    `## "free×N" = you can safely take up to N steps. Plan your steps array accordingly.`,
    ...lines,
  ].join("\n");
}