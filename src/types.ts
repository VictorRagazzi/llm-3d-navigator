// ═══════════════════════════════════════════════════════════════════
// TYPES — Alteração 3: SceneObject usa footprint em vez de x,z,w,d
// ═══════════════════════════════════════════════════════════════════

export interface Point {
  x: number;
  z: number;
}

/** Um objeto na cena, descrito por um polígono 2D (footprint) e altura. */
export interface SceneObject {
  id: number;
  label: string;
  /** Lista de vértices [x, z] formando o polígono do footprint (sentido horário ou anti-horário). */
  footprint: [number, number][];
  /** Altura do objeto em metros. */
  h: number;
  color: string;
  isDestiny?: boolean;
}

export interface Room {
  w: number;
  d: number;
}

export interface Scene {
  id: string;
  name: string;
  room: Room;
  startPos: Point;
  objects: SceneObject[];
}

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