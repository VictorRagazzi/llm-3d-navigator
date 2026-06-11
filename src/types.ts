// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface Point {
  x: number;
  z: number;
}

export interface Waypoint {
  id: string;
  label: string;
  x: number;
  z: number;
  radius?: number;
  hint?: string;
}

export interface SceneObject {
  id: number;
  label: string;
  footprint: [number, number][];
  h: number;
  color: string;
  isHidden: boolean;
  isDestiny?: boolean;
}

export interface Scene {
  id: string;
  name: string;
  room: { w: number; d: number };
  startPos: Point;
  objects: SceneObject[];
  waypoints?: Waypoint[];
}

// Single canonical LogEntry — has both `text` (used in App) and optional `msg`
export interface LogEntry {
  id: number;
  type: string;
  text: string;
  ts: string;
}

export interface Metrics {
  success: boolean;
  inferences: number;
  turns: number;
  steps: number;
  distance: number;
  collisionsAvoided: number;
  finalDist: number;
}

export interface CanvasProps {
  agentPos: Point;
  path: Point[];
  scene: Scene;
}

export interface SummaryCardProps {
  metrics: Metrics | null;
  onExport: () => void;
}

// ─── Waypoint nav state ───────────────────────────────────────────
export interface WaypointNavState {
  waypoints: Waypoint[];
  currentIndex: number;
  completedIds: string[];
  stuckCounter: number;
  lastPos: Point;
  lastDistToTarget: number;
  stuckAnglesTriedDeg: number[];
}

export interface NavParams {
  STEP_SIZE: number;
  MAX_STEPS_PER_TURN: number;
  ARRIVAL_THRESHOLD: number;
  AGENT_RADIUS: number;
  MAX_TURNS: number;
  STEP_ANIM_MS: number;
  WAYPOINT_ARRIVAL_RADIUS: number;
  STUCK_THRESHOLD: number;
  STUCK_TURNS_LIMIT: number;
  LLM_PROVIDER: LLMProvider;
  LLM_OPTS: Partial<Record<LLMProvider, QueryOptions>>;
  SYSTEM_PROMPT: string;
}

export type LLMProvider = "local" | "openrouter" | "anthropic";

export interface QueryOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
  timeout?: number;
}

export interface LLMResponse {
  reasoning: string;
  steps: Array<{ angle: number; distance: number }>;
  arrived: boolean;
}