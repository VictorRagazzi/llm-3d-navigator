// ═══════════════════════════════════════════════════════════════════
// TYPES — Alteração 3: SceneObject usa footprint em vez de x,z,w,d
// ═══════════════════════════════════════════════════════════════════



export interface LLMResponse {
  reasoning: string;
  steps: Array<{ angle: number; distance: number }>;
  arrived: boolean;
}

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

// ═══════════════════════════════════════════════════════════════════
// TYPES — Alteração 3: SceneObject usa footprint em vez de x,z,w,d
// ═══════════════════════════════════════════════════════════════════

export interface Point {
  x: number;
  z: number;
}
 
export interface Waypoint {
  id: string;
  label: string;         // nome semântico ("passagem corredor", "centro da cozinha")
  x: number;
  z: number;
  radius?: number;       // distância de chegada (default: WAYPOINT_ARRIVAL_RADIUS)
  hint?: string;         // dica extra para o LLM nesse trecho ("vire à esquerda após o sofá")
}
 
export interface SceneObject {
  id: number;
  label: string;
  footprint: [number, number][];
  h: number;
  color: string;
  isDestiny?: boolean;
}
 
export interface Scene {
  id: string;
  name: string;
  room: { w: number; d: number };
  startPos: Point;
  objects: SceneObject[];
  waypoints?: Waypoint[];  // ← NOVO: opcional, cenas pequenas não precisam
}
 
export interface LogEntry {
  type: string;
  msg?: string;
  turn?: number;
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
 
// ─── Estado de navegação por waypoints ───────────────────────────
export interface WaypointNavState {
  waypoints: Waypoint[];
  currentIndex: number;         // índice do waypoint ativo
  completedIds: string[];       // histórico de waypoints concluídos
  stuckCounter: number;         // turnos sem progresso significativo
  lastPos: Point;               // posição no turno anterior (para stuck detection)
  lastDistToTarget: number;     // distância ao alvo no turno anterior
  stuckAnglesTriedDeg: number[]; // ângulos já tentados ao escapar de stuck
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
