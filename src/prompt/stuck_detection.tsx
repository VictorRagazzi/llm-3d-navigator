import type { Point, Scene, WaypointNavState } from "../types";
import { dist2D, stepFromAngle, checkCollision } from '../utils/polygons'

// ═══════════════════════════════════════════════════════════════════
// STUCK DETECTION
// ═══════════════════════════════════════════════════════════════════
 
/**
 * Atualiza o contador de stuck.
 * Retorna true se o agente está preso (não se moveu o suficiente por STUCK_TURNS_LIMIT turnos).
 */
export function updateStuckState(agentPos: Point, state: WaypointNavState, stuckThreshold: number, stuckTurnLimit: number): boolean {
  const moved = dist2D(agentPos, state.lastPos);
  state.lastPos = { ...agentPos };
 
  if (moved < stuckThreshold) {
    state.stuckCounter++;
  } else {
    state.stuckCounter = 0;
    state.stuckAnglesTriedDeg = [];
  }
 
  return state.stuckCounter >= stuckTurnLimit;
}
 
/**
 * Gera um bloco de texto para o prompt quando o agente está preso.
 * Inclui ângulos alternativos ainda não tentados.
 */
export function buildStuckWarning(state: WaypointNavState, agentPos: Point, scene: Scene, stepSize: number, agentRadius: number): string {
  const escapeAngles = [0, 45, 90, 135, 180, 225, 270, 315].filter(deg => {
    if (state.stuckAnglesTriedDeg.includes(deg)) return false;
    const next = stepFromAngle(agentPos, deg, stepSize);
    return !checkCollision(next, scene, agentRadius).hit;
  });
 
  const tried = state.stuckAnglesTriedDeg.length > 0
    ? `Already tried: ${state.stuckAnglesTriedDeg.join("°, ")}°.`
    : "";
 
  const suggestions = escapeAngles.length > 0
    ? `Free escape angles: ${escapeAngles.join("°, ")}°.`
    : "All immediate angles blocked — try a multi-step detour.";
 
  // Registra os ângulos sugeridos como "tentados" para o próximo turno
  state.stuckAnglesTriedDeg.push(...escapeAngles.slice(0, 2));
 
  return `## ⚠️ STUCK WARNING (${state.stuckCounter} turns without progress)
You are not moving toward the target. Do NOT repeat recent directions.
${tried}
${suggestions}
Priority: escape the stuck position before resuming approach to the target.`;
}