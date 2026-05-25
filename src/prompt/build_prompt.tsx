import type { Scene, NavParams } from "../types";
import { buildContext, buildDirectionScan } from '../prompt/context';

// ═══════════════════════════════════════════════════════════════════
// PROMPT BUILDER — A*-guided navigation
// ═══════════════════════════════════════════════════════════════════

export interface WaypointContext {
  /** The immediate next waypoint the agent should walk toward. */
  nextWaypoint: { x: number; z: number };
  /** How far the next waypoint is from the agent. */
  distToNext: number;
  /** The angle toward the next waypoint, in degrees (0 = North). */
  angleToNext: number;
  /** Total remaining waypoints after this one. */
  remainingCount: number;
  /** Brief look-ahead: coordinates of the waypoint after next, if any. */
  lookAhead?: { x: number; z: number };
}

export function buildPrompt(
  ctx: ReturnType<typeof buildContext>,
  scene: Scene,
  params: NavParams,
  stuckWarningStr?: string,
  previousFeedback?: string | null,
  waypointCtx?: WaypointContext | null,
) {
  const scanStr = buildDirectionScan(ctx.agentPos, scene, params);

  // ── Waypoint guidance block ──────────────────────────────────────
  let waypointBlock = "";
  if (waypointCtx) {
    const ahead = waypointCtx.lookAhead
      ? `\n- Look-ahead (waypoint after next): x=${waypointCtx.lookAhead.x.toFixed(2)}, z=${waypointCtx.lookAhead.z.toFixed(2)}`
      : "";
    waypointBlock = [
      `## Planned Route (A* computed — follow it)`,
      `The shortest collision-free path has already been computed for you.`,
      `- **Immediate target waypoint**: x=${waypointCtx.nextWaypoint.x.toFixed(2)}, z=${waypointCtx.nextWaypoint.z.toFixed(2)}`,
      `- Distance to it: ${waypointCtx.distToNext.toFixed(2)}m`,
      `- Bearing to it: ${waypointCtx.angleToNext}°`,
      `- Remaining waypoints after this: ${waypointCtx.remainingCount}`,
      ahead,
      ``,
      `Walk toward the immediate target waypoint. Use the bearing above as your primary direction.`,
      `Only deviate if that direction is BLOCKED in the radar scan below.`,
    ].join("\n");
  }

  const sections: string[] = [
    `You are an AI navigation agent moving through a 2D room.`,

    `## Current Position`,
    `x=${ctx.agentPos.x.toFixed(2)}, z=${ctx.agentPos.z.toFixed(2)}`,
    `Final destination (Door): x=${ctx.doorCenter.x.toFixed(2)}, z=${ctx.doorCenter.z.toFixed(2)} — ${ctx.doorDist}m away at ${ctx.doorAngle}°`,

    waypointBlock || [
      `## Final Destination`,
      `Bearing: ${ctx.doorAngle}°, Distance: ${ctx.doorDist}m`,
      `Navigate toward it while avoiding obstacles.`,
    ].join("\n"),

    `## Immediate Surroundings — Radar Scan`,
    `This scan tells you exactly what happens if you move ${params.STEP_SIZE}m in each direction.`,
    `**You MUST pick a direction marked "free". Never choose BLOCKED directions.**`,
    `\`\`\``,
    scanStr,
    `\`\`\``,

    `## Instructions`,
    `1. Check the radar scan. Note which directions are free.`,
    `2. ${waypointCtx
      ? `Move toward the bearing ${waypointCtx.angleToNext}° (nearest free angle is fine).`
      : `Move toward the door bearing ${ctx.doorAngle}° (nearest free angle).`}`,
    `3. You must provide UP TO EXACTLY ${params.MAX_STEPS_PER_TURN} steps in your array. Each step angle MUST be one of: 0, 45, 90, 135, 180, 225, 270, 315.`,
    `4. If you are within ${params.ARRIVAL_THRESHOLD}m of the final door, set "arrived": true.`,

    `## Output — strict JSON only, no markdown`,
    `{`,
    `  "reasoning": "one sentence explaining your choice",`,
    `  "steps": [{ "angle": <0|45|90|135|180|225|270|315>, "distance": ${params.STEP_SIZE} }],`,
    `  "arrived": <boolean>`,
    `}`,

    previousFeedback
      ? `## Last Turn Feedback\n${previousFeedback}`
      : "",
  ].filter(Boolean);

  if (stuckWarningStr) {
    sections.push(
      `## ⚠️ STUCK — You have not made progress for several turns`,
      stuckWarningStr,
      `Pick one of the "Free escape angles" above. Do NOT repeat the direction you just tried.`,
    );
  }

  return sections.join("\n\n");
}