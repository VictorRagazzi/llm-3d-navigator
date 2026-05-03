export interface Point {
  x: number;
  z: number;
}

export interface LLMResponse {
  reasoning: string;
  arrived: boolean;
  steps: Array<{ angle: number; distance?: number }>;
}

export interface SceneObject {
  id: number;
  label: string;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
  isDoor?: boolean;
}

export interface Scene {
  id: string;
  name: string;
  room: { w: number; d: number };
  startPos: Point;
  objects: SceneObject[];
}

export interface CanvasProps {
  agentPos: Point;
  path: Point[];
  scene: Scene;
}

export type Metrics = {
  success: boolean;
  inferences: number;
  turns: number;
  steps: number;
  distance: number;
  collisionsAvoided: number;
  finalDist: number;
};

export type LogEntry = {
  id: number;
  type: string;
  text: string;
  ts: string;
};

export type SummaryCardProps = {
  metrics: Metrics | null;
  onExport: () => void;
};
