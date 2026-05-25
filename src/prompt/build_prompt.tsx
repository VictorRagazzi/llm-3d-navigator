import type { Scene, NavParams } from "../types";
// import { buildStuckWarning } from '../prompt/stuck_detection'
import { buildContext, buildDirectionScan, buildAsciiMap } from '../prompt/context'

export function buildPrompt(ctx: ReturnType<typeof buildContext>, scene: Scene, params: NavParams) {
  // ALTERAÇÃO 4 — objetos descritos pelos cantos do footprint, não por centro+dims
  const lines = ctx.objs
    .map(o =>
      `  - ${o.label}: dist ${o.distancia}m | bearing ${o.direcao}° | h ${o.h}m | corners ${o.corners}`
    )
    .join("\n");

  const sections = [
    `You are an autonomous navigation agent operating inside a ${scene.room.w}x${scene.room.d}m room.`,
    `Your ONLY goal is to reach the door as efficiently as possible while avoiding all obstacles.`,

    `## Current State
      - Position : x=${ctx.agentPos.x.toFixed(2)}, z=${ctx.agentPos.z.toFixed(2)}
      - Target   : Door — bearing ${ctx.doorAngle}°, distance ${ctx.doorDist}m`,

    `Map Draw: \n ${buildAsciiMap(ctx.agentPos, scene, 30)}`,

    `## Bearing Convention
        0° = North (−z), 90° = East (+x), 180° = South (+z), 270° = West (−x)`,

    `## Obstacles (nearest → farthest)\n${lines}`,

    `## Movement Rules
        1. You HAVE to take up ${params.MAX_STEPS_PER_TURN} steps per turn; each step is exactly ${params.STEP_SIZE}m.
        2. A step that would collide with any obstacle or wall is INVALID and will be discarded.
        3. If the door is within ${params.ARRIVAL_THRESHOLD}m, set \`arrived\` to true immediately.
        4. Always prefer the shortest collision-free path to the door.
        5. When an obstacle blocks the direct path, choose the side that minimises total detour.`,

    `## Direction Scans\n\`\`\`\n${buildDirectionScan(ctx.agentPos, scene, params)}\n\`\`\``,

    `## Output — strict JSON, no markdown, no extra text
      {
        "reasoning": "concise explanation of chosen strategy",
        "steps": [{ "angle": <degrees 0–359>, "distance": <meters, max ${params.STEP_SIZE}> }],
        "arrived": false
      }`
  ];

  return sections.filter(Boolean).join("\n\n");
}