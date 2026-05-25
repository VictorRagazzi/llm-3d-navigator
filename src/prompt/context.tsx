import type { Point, Scene, NavParams } from "../types";
import { angleToTarget, checkCollisionSweep, dist2D, footprintCentroid, stepFromAngle, pointInPolygon } from '../utils/polygons'

// ═══════════════════════════════════════════════════════════════════
// CONTEXTO + PROMPT
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
 
  // 1. Plot Obstacles and Door
  for (const obj of objects) {
    const ch = obj.isDestiny ? "D" : "█";
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const wx = (c / (gridSize - 1)) * room.w;
        const wz = (r / (gridSize - 1)) * room.d;
        // Assuming pointInPolygon is available in this scope
        if (pointInPolygon(wx, wz, obj.footprint)) grid[r][c] = ch;
      }
    }
  }
 
  // 2. Plot Agent
  const agentCol = clamp(Math.round((agentPos.x / room.w) * (gridSize - 1)));
  const agentRow = clamp(Math.round((agentPos.z / room.d) * (gridSize - 1)));
  grid[agentRow][agentCol] = "A";
 
  // 3. Build rows with Z-axis labels (Left side)
  const rows = grid.map((row, i) => {
    const zLabel = ((i / (gridSize - 1)) * room.d).toFixed(1).padStart(4);
    return `${zLabel} │${row.join("")}│`;
  });
 
  // 4. Build X-axis labels (Bottom)
  // We use modulo 10 so numbers >= 10 don't break the 1-character-per-column spacing.
  const xLabels = Array.from({ length: gridSize }, (_, i) => {
    const val = Math.round((i / (gridSize - 1)) * room.w);
    return (val % 10).toString();
  }).join("");
 
  // 5. Assemble final ASCII map
  return [
    `       ╔${"═".repeat(gridSize)}╗`,
    ...rows, // Removed the map() that was destroying the first row's label
    `       ╚${"═".repeat(gridSize)}╝`,
    `        ${xLabels}`,
    `        W (x=0) → E (x=${room.w})  |  N (z=0) → S (z=${room.d})`,
    `Legend: A=agent  D=door  █=obstacle  ·=free`, // Removed waypoints to avoid confusing the LLM
  ].join("\n");
}
 
export function buildDirectionScan(pos: { x: number; z: number }, scene: Scene, params: NavParams): string {
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  const door = scene.objects.find(o => o.isDestiny)!;
  const doorCenter = footprintCentroid(door.footprint);

  const results = angles.map(angle => {
    const newPos = stepFromAngle(pos, angle, params.STEP_SIZE);
    const col = checkCollisionSweep(pos, newPos, scene, params.AGENT_RADIUS);
    const distBefore = dist2D(pos, doorCenter);
    const distAfter = dist2D(newPos, doorCenter);
    const delta = distBefore - distAfter;

    return `  ${String(angle).padStart(3)}° (${['N','NE','E','SE','S','SW','W','NW'][angles.indexOf(angle)]}): ${
      col.hit
        ? `BLOCKED by "${col.what}"`
        : `free → dist ${distAfter.toFixed(2)}m (${delta > 0 ? '+' : ''}${delta.toFixed(2)}m progress)`
    }`;
  }).join('\n');

  return `## Direction Scan (next 0.5m step)\n${results}`;
}