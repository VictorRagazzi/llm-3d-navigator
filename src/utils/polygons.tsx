import type { Point, Scene } from "../types";

// ═══════════════════════════════════════════════════════════════════
// GEOMETRIA — POLÍGONO
// ═══════════════════════════════════════════════════════════════════
export const dist2D = (a: Point, b: Point) => Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);

/** Calcula o centróide de um footprint (média dos vértices). */
export function footprintCentroid(fp: [number, number][]): Point {
  const x = fp.reduce((s, p) => s + p[0], 0) / fp.length;
  const z = fp.reduce((s, p) => s + p[1], 0) / fp.length;
  return { x, z };
}

/**
 * Ray-casting point-in-polygon.
 * Retorna true se (px, pz) estiver dentro do polígono definido por `poly`.
 */
export function pointInPolygon(px: number, pz: number, poly: [number, number][]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i][0], zi = poly[i][1];
    const xj = poly[j][0], zj = poly[j][1];
    const intersect =
      zi > pz !== zj > pz &&
      px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Expande um polígono afastando cada vértice do centróide por `margin` metros.
 * Serve como aproximação simples do Minkowski sum para colisão com agente esférico.
 */
export function expandPolygon(poly: [number, number][], margin: number): [number, number][] {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  return poly.map(([x, z]) => {
    const dx = x - cx;
    const dz = z - cz;
    const len = Math.sqrt(dx * dx + dz * dz) || 1e-9;
    return [x + (dx / len) * margin, z + (dz / len) * margin];
  });
}
 
export function angleToTarget(from: Point, to: Point): number {
  const a = Math.atan2(to.x - from.x, -(to.z - from.z)) * (180 / Math.PI);
  return Math.round((a + 360) % 360);
}
 
export function stepFromAngle(pos: Point, deg: number, dist: number): Point {
  const r = (deg * Math.PI) / 180;
  return { x: pos.x + dist * Math.sin(r), z: pos.z - dist * Math.cos(r) };
}

// ALTERAÇÃO 2 — colisão via ponto-em-polígono com expansão pelo raio do agente
function checkCollision(pos: { x: number; z: number }, scene: Scene, m: number) {
  const { room, objects } = scene;

  // Verifica paredes
  if (pos.x < m || pos.x > room.w - m || pos.z < m || pos.z > room.d - m)
    return { hit: true, what: "parede" };

  // Verifica cada objeto usando ponto-em-polígono no footprint expandido
  for (const o of objects) {
    if (o.isDestiny) continue;
    const expanded = expandPolygon(o.footprint, m);
    if (pointInPolygon(pos.x, pos.z, expanded))
      return { hit: true, what: o.label };
  }

  return { hit: false, what: null };
}

export function checkCollisionSweep(
  from: Point,
  to: Point,
  scene: Scene,
  margin: number,
  steps = 5  // quantos pontos intermediários checar
) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mid = {
      x: from.x + (to.x - from.x) * t,
      z: from.z + (to.z - from.z) * t,
    };
    const col = checkCollision(mid, scene, margin);
    if (col.hit) return col;
  }
  return { hit: false, what: null };
}