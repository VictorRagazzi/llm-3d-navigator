import type { Scene, NavParams } from "../types";
import { buildContext, buildDirectionScan } from '../prompt/context';

// ═══════════════════════════════════════════════════════════════════
// PROMPT BUILDER — A*-guided navigation with hidden obstacle support
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
  /** Labels of hidden obstacles discovered so far via collision. */
  discoveredObstacleLabels?: string[],
) {
  // The radar scan uses whatever `scene` is passed — after reveal+replan,
  // this will include discovered hidden obstacles, so they appear as BLOCKED.
  const scanStr = buildDirectionScan(ctx.agentPos, scene, params);

  // ── Waypoint guidance block ──────────────────────────────────────
  let waypointBlock = "";
  if (waypointCtx) {
    const ahead = waypointCtx.lookAhead
      ? `\n- Look-ahead (waypoint after next): x=${waypointCtx.lookAhead.x.toFixed(2)}, z=${waypointCtx.lookAhead.z.toFixed(2)}`
      : "";
    waypointBlock = [
      `## Planned route (A* computed — follow it)`,
      `A collision-free path has been computed. Walk toward each waypoint in order.`,
      `- **Immediate target waypoint**: x=${waypointCtx.nextWaypoint.x.toFixed(2)}, z=${waypointCtx.nextWaypoint.z.toFixed(2)}`,
      `- Distance to it: ${waypointCtx.distToNext.toFixed(2)}m`,
      `- Bearing to it: ${waypointCtx.angleToNext}°`,
      `- Remaining waypoints after this: ${waypointCtx.remainingCount}`,
      ahead,
      ``,
      `Walk toward the immediate target waypoint using the bearing above as your primary direction.`,
      `Only deviate if that direction is BLOCKED in the radar scan below.`,
    ].join("\n");
  }

  // ── Discovered hidden obstacles block ───────────────────────────
  let discoveredBlock = "";
  if (discoveredObstacleLabels && discoveredObstacleLabels.length > 0) {
    discoveredBlock = [
      `## ⚠️ Obstacles discovered during navigation (not on original map)`,
      `These obstacles were found by collision. The route has been replanned around them.`,
      discoveredObstacleLabels.map(n => `- "${n}"`).join("\n"),
      `They are now visible in the radar scan below.`,
    ].join("\n");
  }

  const sections: string[] = [
    `You are an AI navigation agent moving through a 2D room.`,

    `## Current position`,
    `x=${ctx.agentPos.x.toFixed(2)}, z=${ctx.agentPos.z.toFixed(2)}`,
    `Final destination (Door): x=${ctx.doorCenter.x.toFixed(2)}, z=${ctx.doorCenter.z.toFixed(2)} — ${ctx.doorDist}m away at ${ctx.doorAngle}°`,

    waypointBlock || [
      `## Final destination`,
      `Bearing: ${ctx.doorAngle}°, Distance: ${ctx.doorDist}m`,
      `Navigate toward it while avoiding obstacles.`,
    ].join("\n"),

    discoveredBlock,

    `## Radar scan — how many steps are free before collision`,
    `Read each line as: direction → number of consecutive free steps you can take.`,
    `**You MUST only choose directions that have at least free×1.**`,
    `**Plan your steps array to not exceed the free count for your chosen direction.**`,
    `\`\`\``,
    scanStr,
    `\`\`\``,

    `## Instructions`,
    `1. Read the radar scan. Note the free count for each direction.`,
    `2. ${waypointCtx
      ? `Move toward bearing ${waypointCtx.angleToNext}° (or nearest unblocked angle).`
      : `Move toward door bearing ${ctx.doorAngle}° (or nearest unblocked angle).`}`,
    `3. Build your steps array: each step MUST use exactly one of these angles: 0, 45, 90, 135, 180, 225, 270, 315.`,
    `   Do NOT use any other angle values. The radar only covers these 8 directions.`,
    `4. Number of steps in your array must not exceed the "free×N" count shown in the radar for that direction.`,
    `   Example: if "90° (E): free×2 then BLOCKED", plan at most 2 steps at 90°.`,
    `5. You may chain directions: e.g., 2 steps at 90° then turn to 45° to navigate around a corner.`,
    `6. If you are within ${params.ARRIVAL_THRESHOLD}m of the final door, set "arrived": true.`,
    `7. Before finalising, mentally trace each step: step 2 starts where step 1 lands, step 3 from step 2, etc.`,

    `## Output — strict JSON only, no markdown`,
    `{`,
    `  "reasoning": "one sentence: which direction(s) and why",`,
    `  "steps": [{ "angle": <one of 0,45,90,135,180,225,270,315>, "distance": ${params.STEP_SIZE} }, ...],`,
    `  "arrived": <boolean>`,
    `}`,

    previousFeedback
      ? `## Last turn feedback\n${previousFeedback}`
      : "",
  ].filter(Boolean);

  if (stuckWarningStr) {
    sections.push(
      `## ⚠️ STUCK — you have not made progress for several turns`,
      stuckWarningStr,
      `Pick a direction with the highest free count that moves you toward the target.`,
      `Do NOT repeat a direction you already tried while stuck.`,
    );
  }

  return sections.join("\n\n");
}