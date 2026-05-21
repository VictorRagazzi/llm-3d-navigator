import { useState, useEffect, useRef, useCallback } from "react";
import type { CanvasProps, Point, Scene, LLMResponse, LogEntry, Metrics, SummaryCardProps } from "./types";
import { queryLLM, parseLLMResponse, buildInitialMessages, buildTurnFeedback } from "./clients/llm_client";
import type { ChatMessage } from "./clients/llm_client";

// ═══════════════════════════════════════════════════════════════════
// BANCO DE CENAS — adicione novas cenas aqui
// ═══════════════════════════════════════════════════════════════════

const IS_MOCKED = true;

const MOCK_SCENES: Scene[] = [
  {
    id: "quarto_simples",
    name: "Quarto Simples",
    room: { w: 10, d: 10 },
    startPos: { x: 5.0, z: 8.5 },
    objects: [
      { id: 1, label: "porta",   footprint: [[4.5,0.05],[5.5,0.05],[5.5,0.25],[4.5,0.25]], h: 2.1,  color: "#60a5fa", isDestiny: true },
      { id: 2, label: "mesa",    footprint: [[2.4,3.6],[3.6,3.6],[3.6,4.4],[2.4,4.4]],     h: 0.75, color: "#f59e0b" },
      { id: 3, label: "cadeira", footprint: [[1.7,5.2],[2.3,5.2],[2.3,5.8],[1.7,5.8]],     h: 0.9,  color: "#a78bfa" },
      { id: 4, label: "sofá",    footprint: [[6.5,6.05],[8.5,6.05],[8.5,6.95],[6.5,6.95]], h: 0.85, color: "#34d399" },
      { id: 5, label: "estante", footprint: [[0.8,1.1],[1.2,1.1],[1.2,2.9],[0.8,2.9]],     h: 1.8,  color: "#fb923c" },
      { id: 6, label: "cama",    footprint: [[6.5,2.2],[8.5,2.2],[8.5,3.8],[6.5,3.8]],     h: 0.5,  color: "#f472b6" },
      { id: 7, label: "armário", footprint: [[0.4,7.7],[1.6,7.7],[1.6,8.3],[0.4,8.3]],     h: 2.0,  color: "#94a3b8" },
    ],
  },
  {
    id: "sala_corredor",
    name: "Sala com Corredor",
    room: { w: 12, d: 8 },
    startPos: { x: 10.0, z: 6.5 },
    objects: [
      { id: 1, label: "porta",       footprint: [[0.05,3.5],[0.25,3.5],[0.25,4.5],[0.05,4.5]], h: 2.1,  color: "#60a5fa", isDestiny: true },
      { id: 2, label: "sofá",        footprint: [[7.25,5.0],[9.75,5.0],[9.75,6.0],[7.25,6.0]], h: 0.85, color: "#34d399" },
      { id: 3, label: "mesa center", footprint: [[5.3,4.1],[6.7,4.1],[6.7,4.9],[5.3,4.9]],    h: 0.75, color: "#f59e0b" },
      { id: 4, label: "tv stand",    footprint: [[1.1,1.25],[2.9,1.25],[2.9,1.75],[1.1,1.75]], h: 0.6,  color: "#94a3b8" },
      { id: 5, label: "poltrona",    footprint: [[4.1,2.1],[4.9,2.1],[4.9,2.9],[4.1,2.9]],    h: 1.0,  color: "#a78bfa" },
      { id: 6, label: "estante",     footprint: [[10.3,0.0],[10.7,0.0],[10.7,2.0],[10.3,2.0]], h: 1.8,  color: "#fb923c" },
      { id: 7, label: "tapete",      footprint: [[4.5,2.5],[7.5,2.5],[7.5,4.5],[4.5,4.5]],    h: 0.02, color: "#e879f9" },
    ],
  },
  {
    id: "escritorio",
    name: "Escritório Lotado",
    room: { w: 8, d: 8 },
    startPos: { x: 6.5, z: 6.5 },
    objects: [
      { id: 1, label: "porta",       footprint: [[3.55,0.05],[4.45,0.05],[4.45,0.25],[3.55,0.25]], h: 2.1,  color: "#60a5fa", isDestiny: true },
      { id: 2, label: "mesa work",   footprint: [[1.2,2.1],[2.8,2.1],[2.8,2.9],[1.2,2.9]],        h: 0.75, color: "#f59e0b" },
      { id: 3, label: "cadeira 1",   footprint: [[1.7,3.4],[2.3,3.4],[2.3,4.0],[1.7,4.0]],        h: 0.9,  color: "#a78bfa" },
      { id: 4, label: "mesa work 2", footprint: [[4.7,2.1],[6.3,2.1],[6.3,2.9],[4.7,2.9]],        h: 0.75, color: "#f59e0b" },
      { id: 5, label: "cadeira 2",   footprint: [[5.2,3.4],[5.8,3.4],[5.8,4.0],[5.2,4.0]],        h: 0.9,  color: "#a78bfa" },
      { id: 6, label: "armário",     footprint: [[0.25,6.2],[1.75,6.2],[1.75,6.8],[0.25,6.8]],    h: 2.0,  color: "#94a3b8" },
      { id: 7, label: "impressora",  footprint: [[6.25,4.8],[6.75,4.8],[6.75,5.2],[6.25,5.2]],    h: 0.4,  color: "#64748b" },
      { id: 8, label: "planta",      footprint: [[7.0,0.8],[7.4,0.8],[7.4,1.2],[7.0,1.2]],        h: 1.2,  color: "#4ade80" },
    ],
  },
  {
  id: "casa_completa_1",
  name: "Casa Completa 1",
  room: { w: 24, d: 18 },
  startPos: { x: 21.0, z: 17.0 }, // começa no quarto

  objects: [
    // =========================
    // DESTINO
    // =========================
    {
      id: 1,
      label: "porta sala",
      footprint: [[0.05,8.0],[0.25,8.0],[0.25,10.0],[0.05,10.0]],
      h: 2.1,
      color: "#60a5fa",
      isDestiny: true
    },

    // =========================
    // PAREDES EXTERNAS
    // =========================
    { id: 2,  label: "parede", footprint: [[0,0],[24,0],[24,0.2],[0,0.2]], h: 2.8, color: "#475569" },
    { id: 3,  label: "parede", footprint: [[0,17.8],[24,17.8],[24,18],[0,18]], h: 2.8, color: "#475569" },
    { id: 4,  label: "parede", footprint: [[0,0],[0.2,0],[0.2,18],[0,18]], h: 2.8, color: "#475569" },
    { id: 5,  label: "parede", footprint: [[23.8,0],[24,0],[24,18],[23.8,18]], h: 2.8, color: "#475569" },

    // =========================
    // DIVISÕES INTERNAS
    // =========================

    // separa quartos da casa
    { id: 6, label: "parede", footprint: [[14,8],[14.2,8],[14.2,18],[14,18]], h: 2, color: "#64748b" },

    // corredor horizontal
    { id: 7, label: "parede", footprint: [[0,8],[12,8],[12,8.2],[0,8.2]], h: 2.8, color: "#64748b" },

    // cozinha separada
    { id: 9, label: "parede", footprint: [[8,0],[8.2,8],[8,8]], h: 2.8, color: "#64748b" },

    // banheiro
    { id: 10, label: "parede", footprint: [[18,8],[18.2,13],[18.2,13],[18,13]], h: 2.8, color: "#64748b" },
    { id: 11, label: "parede", footprint: [[14,13],[20,13],[20,13.2],[14,13.2]], h: 2.8, color: "#64748b" },

    // =========================
    // QUARTO (START)
    // =========================
    { id: 12, label: "cama", footprint: [[17.5,13.5],[20.5,13.5],[20.5,15.5],[17.5,15.5]], h: 0.5, color: "#f472b6" },
    { id: 13, label: "mesa", footprint: [[15.2,14],[17,14],[17,15]], h: 0.75, color: "#f59e0b" },
    { id: 14, label: "cadeira", footprint: [[15.8,15.3],[16.4,15.3],[16.4,15.9],[15.8,15.9]], h: 0.9, color: "#a78bfa" },
    { id: 15, label: "armário", footprint: [[22.5,10],[23.4,10],[23.4,14]], h: 2.0, color: "#94a3b8" },

    // =========================
    // BANHEIRO
    // =========================
    { id: 15, label: "pia", footprint: [[15,9],[16,9],[16,9.8],[15,9.8]], h: 0.9, color: "#cbd5e1" },
    { id: 16, label: "vaso", footprint: [[17,9],[17.8,9],[17.8,9.8],[17,9.8]], h: 0.8, color: "#e2e8f0" },

    // =========================
    // COZINHA
    // =========================
    { id: 17, label: "geladeira", footprint: [[9,1],[10.5,1],[10.5,2.5],[9,2.5]], h: 2.0, color: "#94a3b8" },
    { id: 18, label: "fogão", footprint: [[11,1],[12.5,1],[12.5,2]], h: 1.0, color: "#64748b" },
    { id: 19, label: "mesa cozinha", footprint: [[9.5,4],[12,4],[12,5.5],[9.5,5.5]], h: 0.8, color: "#f59e0b" },

    // =========================
    // SALA
    // =========================
    { id: 20, label: "sofá", footprint: [[2,11],[6,11],[6,12.5],[2,12.5]], h: 0.85, color: "#34d399" },
    { id: 21, label: "tv", footprint: [[1.5,14],[3.5,14],[3.5,14.5],[1.5,14.5]], h: 0.7, color: "#64748b" },
    { id: 22, label: "mesa centro", footprint: [[9,13],[10.5,13],[10.5,14]], h: 0.5, color: "#f59e0b" },

    // =========================
    // CORREDOR
    // =========================
    { id: 23, label: "planta", footprint: [[13,10],[13.5,10],[13.5,10.5],[13,10.5]], h: 1.2, color: "#4ade80" },
  ]
},

{
  id: "casa_completa_2",
  name: "Casa Completa 2",
  room: { w: 30, d: 20 },
  startPos: { x: 27.0, z: 17.0 },

  objects: [
    // =========================
    // DESTINO
    // =========================
    {
      id: 1,
      label: "porta saída",
      footprint: [[0.05,9],[0.25,9],[0.25,11],[0.05,11]],
      h: 2.1,
      color: "#60a5fa",
      isDestiny: true
    },

    // =========================
    // PAREDES EXTERNAS
    // =========================
    { id: 2, label: "parede", footprint: [[0,0],[30,0],[30,0.2],[0,0.2]], h: 2.8, color: "#475569" },
    { id: 3, label: "parede", footprint: [[0,19.8],[30,19.8],[30,20],[0,20]], h: 2.8, color: "#475569" },
    { id: 4, label: "parede", footprint: [[0,0],[0.2,0],[0.2,20],[0,20]], h: 2.8, color: "#475569" },
    { id: 5, label: "parede", footprint: [[29.8,0],[30,0],[30,20],[29.8,20]], h: 2.8, color: "#475569" },

    // =========================
    // DIVISÕES INTERNAS
    // =========================

    // corredor principal
    { id: 6, label: "parede", footprint: [[10,0],[10.2,16],[10,16]], h: 2.8, color: "#64748b" },

    // separa quartos
    { id: 7, label: "parede", footprint: [[20,8],[20.2,20],[20,20]], h: 2.8, color: "#64748b" },

    // banheiro
    { id: 8, label: "parede", footprint: [[20,8],[28,8],[28,8.2],[20,8.2]], h: 2.8, color: "#64748b" },

    // cozinha
    { id: 9, label: "parede", footprint: [[10,6],[20,6],[20,6.2],[10,6.2]], h: 2.8, color: "#64748b" },

    // sala
    { id: 10, label: "parede", footprint: [[0,14],[10,14],[10,14.2],[0,14.2]], h: 2.8, color: "#64748b" },

    // =========================
    // QUARTO (START)
    // =========================
    { id: 11, label: "cama", footprint: [[24,14],[27,14],[27,16]], h: 0.5, color: "#f472b6" },
    { id: 12, label: "mesa pc", footprint: [[21,15],[23,15],[23,16]], h: 0.75, color: "#f59e0b" },
    { id: 13, label: "cadeira", footprint: [[21.5,16.2],[22.1,16.2],[22.1,16.8],[21.5,16.8]], h: 0.9, color: "#a78bfa" },

    // =========================
    // BANHEIRO
    // =========================
    { id: 14, label: "pia", footprint: [[22,2],[23,2],[23,2.8],[22,2.8]], h: 0.9, color: "#cbd5e1" },
    { id: 15, label: "vaso", footprint: [[25,2],[25.8,2],[25.8,2.8],[25,2.8]], h: 0.8, color: "#e2e8f0" },

    // =========================
    // COZINHA
    // =========================
    { id: 16, label: "geladeira", footprint: [[12,1],[13.5,1],[13.5,2.5],[12,2.5]], h: 2.0, color: "#94a3b8" },
    { id: 17, label: "fogão", footprint: [[15,1],[16.5,1],[16.5,2]], h: 1.0, color: "#64748b" },
    { id: 18, label: "mesa jantar", footprint: [[12,3.5],[16,3.5],[16,5],[12,5]], h: 0.8, color: "#f59e0b" },

    // =========================
    // SALA
    // =========================
    { id: 19, label: "sofá grande", footprint: [[2,16],[7,16],[7,17.5],[2,17.5]], h: 0.85, color: "#34d399" },
    { id: 20, label: "rack tv", footprint: [[2,18],[5,18],[5,18.5],[2,18.5]], h: 0.6, color: "#94a3b8" },
    { id: 21, label: "mesa centro", footprint: [[4,14.8],[5.5,14.8],[5.5,15.8],[4,15.8]], h: 0.5, color: "#f59e0b" },

    // =========================
    // CORREDOR
    // =========================
    { id: 22, label: "planta", footprint: [[18,10],[18.5,10],[18.5,10.5],[18,10.5]], h: 1.2, color: "#4ade80" },
    { id: 23, label: "estante", footprint: [[11,10],[11.5,10],[11.5,14],[11,14]], h: 1.8, color: "#fb923c" },
  ]
}
];

function loadRealScenes(): Scene[] {
  const sceneFiles = import.meta.glob('./scenes/*.json', { eager: true });
  const scenes = Object.values(sceneFiles).map((module: any) => {
    return (module.default ? module.default : module) as Scene;
  });
  return scenes;
}

const SCENES: Scene[] = (IS_MOCKED ? MOCK_SCENES : loadRealScenes()) || [];

// ═══════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════
const STEP_SIZE          = 0.5;
const MAX_STEPS_PER_TURN = 3;
const ARRIVAL_THRESHOLD  = 0.5;
const AGENT_RADIUS       = 0.2;
const MAX_TURNS          = 60;
const STEP_ANIM_MS       = 380;
const LLM_PROVIDER       = "openrouter"; // "local" | "openrouter" | "anthropic"
const LLM_OPTS           = {
                            openrouter: {
                              temperature: 0.2, maxTokens: 1500, model: 'gpt-4o-mini'
                            },
                            local: {
                              temperature: 0.2, maxTokens: 1500, model: 'meta-llama-3.1-8b-instruct'
                            }
                          };
const SYSTEM_PROMPT = "You are a 3D navigation agent. Always respond exclusively in JSON, no markdown, no extra text.";

// ═══════════════════════════════════════════════════════════════════
// GEOMETRIA — POLÍGONO
// ═══════════════════════════════════════════════════════════════════
const dist2D = (a: Point, b: Point) => Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);

/** Calcula o centróide de um footprint (média dos vértices). */
function footprintCentroid(fp: [number, number][]): { x: number; z: number } {
  const x = fp.reduce((s, p) => s + p[0], 0) / fp.length;
  const z = fp.reduce((s, p) => s + p[1], 0) / fp.length;
  return { x, z };
}

/**
 * Ray-casting point-in-polygon.
 * Retorna true se (px, pz) estiver dentro do polígono definido por `poly`.
 */
function pointInPolygon(px: number, pz: number, poly: [number, number][]): boolean {
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
function expandPolygon(poly: [number, number][], margin: number): [number, number][] {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  return poly.map(([x, z]) => {
    const dx = x - cx;
    const dz = z - cz;
    const len = Math.sqrt(dx * dx + dz * dz) || 1e-9;
    return [x + (dx / len) * margin, z + (dz / len) * margin];
  });
}

function angleToTarget(from: { x: number; z: number }, to: { x: number; z: number }) {
  const a = Math.atan2(to.x - from.x, -(to.z - from.z)) * (180 / Math.PI);
  return Math.round((a + 360) % 360);
}

function stepFromAngle(pos: { x: number; z: number }, deg: number, dist: number = STEP_SIZE) {
  const r = (deg * Math.PI) / 180;
  return { x: pos.x + dist * Math.sin(r), z: pos.z - dist * Math.cos(r) };
}

// ALTERAÇÃO 2 — colisão via ponto-em-polígono com expansão pelo raio do agente
function checkCollision(pos: { x: number; z: number }, scene: Scene) {
  const { room, objects } = scene;
  const m = AGENT_RADIUS;

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

// ═══════════════════════════════════════════════════════════════════
// CONTEXTO + PROMPT
// ═══════════════════════════════════════════════════════════════════
function buildContext(agentPos: { x: number; z: number }, scene: Scene) {
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
        // ALTERAÇÃO 4 — cantos do footprint arredondados a 1 decimal
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

function buildAsciiMap(agentPos: { x: number; z: number }, scene: Scene, gridSize = 20): string {
  const { room, objects } = scene;
  const grid: string[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill("·"));

  const clamp = (v: number) => Math.max(0, Math.min(gridSize - 1, v));

  for (const obj of objects) {
    const ch = obj.isDestiny ? "D" : "█";
    // Rasteriza o polígono: para cada célula, testa se o centro está dentro
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const wx = (c / (gridSize - 1)) * room.w;
        const wz = (r / (gridSize - 1)) * room.d;
        if (pointInPolygon(wx, wz, obj.footprint)) grid[r][c] = ch;
      }
    }
  }

  const agentCol = clamp(Math.round((agentPos.x / room.w) * (gridSize - 1)));
  const agentRow = clamp(Math.round((agentPos.z / room.d) * (gridSize - 1)));
  grid[agentRow][agentCol] = "A";

  const rows = grid.map((row, i) => {
    const zLabel = ((i / (gridSize - 1)) * room.d).toFixed(1).padStart(4);
    return `${zLabel}│${row.join("")}│`;
  });

  const xLabels = Array.from({ length: gridSize }, (_, i) =>
    ((i / (gridSize - 1)) * room.w).toFixed(0).padStart(1)
  ).join("");

  return [
    `     ╔${"═".repeat(gridSize)}╗`,
    ...rows.map((r, i) => (i === 0 ? `  N  │${grid[0].join("")}│` : r)),
    `     ╚${"═".repeat(gridSize)}╝`,
    `      ${xLabels}`,
    `      W (x=0) → E (x=${room.w})  |  N (z=0) → S (z=${room.d})`,
    `Legend: A=agent  D=door  █=obstacle  ·=free`,
  ].join("\n");
}

function buildDirectionScan(pos: { x: number; z: number }, scene: Scene): string {
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  const door = scene.objects.find(o => o.isDestiny)!;
  const doorCenter = footprintCentroid(door.footprint);

  const results = angles.map(angle => {
    const newPos = stepFromAngle(pos, angle, STEP_SIZE);
    const col = checkCollision(newPos, scene);
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

function buildPrompt(ctx: ReturnType<typeof buildContext>, scene: Scene) {
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

    `Map Draw: \n ${buildAsciiMap(ctx.agentPos, scene, 70)}`,

    `## Bearing Convention
        0° = North (−z), 90° = East (+x), 180° = South (+z), 270° = West (−x)`,

    `## Obstacles (nearest → farthest)\n${lines}`,

    `## Movement Rules
        1. You HAVE to take up ${MAX_STEPS_PER_TURN} steps per turn; each step is exactly ${STEP_SIZE}m.
        2. A step that would collide with any obstacle or wall is INVALID and will be discarded.
        3. If the door is within ${ARRIVAL_THRESHOLD}m, set \`arrived\` to true immediately.
        4. Always prefer the shortest collision-free path to the door.
        5. When an obstacle blocks the direct path, choose the side that minimises total detour.`,

    `## Direction Scans\n\`\`\`\n${buildDirectionScan(ctx.agentPos, scene)}\n\`\`\``,

    `## Output — strict JSON, no markdown, no extra text
      {
        "reasoning": "concise explanation of chosen strategy",
        "steps": [{ "angle": <degrees 0–359>, "distance": <meters, max ${STEP_SIZE}> }],
        "arrived": false
      }`
  ];

  return sections.filter(Boolean).join("\n\n");
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT JSON
// ═══════════════════════════════════════════════════════════════════
function exportSession(sceneId: string, metrics: Metrics, logs: Array<LogEntry>, path: Array<{ x: number; z: number }>) {
  const payload = { scene: sceneId, timestamp: new Date().toISOString(), metrics, path, logs };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nav_${sceneId}_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════
// CANVAS 2D — ALTERAÇÃO 1: desenha polígonos via footprint
// ═══════════════════════════════════════════════════════════════════
function SceneCanvas({ agentPos, path, scene }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const MAX_PX = 460;
  const scale = Math.min(MAX_PX / scene.room.w, MAX_PX / scene.room.d);
  const PAD = 20;
  const W = Math.round(scene.room.w * scale + PAD * 2);
  const H = Math.round(scene.room.d * scale + PAD * 2);

  // Converte coordenada do mundo para pixel no canvas
  const tc = (x: number, z: number) => ({ cx: PAD + x * scale, cy: PAD + z * scale });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !agentPos) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#06090f";
    ctx.fillRect(0, 0, W, H);

    // Grade de fundo
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= scene.room.w; i++) {
      const x = PAD + i * scale;
      ctx.beginPath(); ctx.moveTo(x, PAD); ctx.lineTo(x, PAD + scene.room.d * scale); ctx.stroke();
    }
    for (let j = 0; j <= scene.room.d; j++) {
      const y = PAD + j * scale;
      ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(PAD + scene.room.w * scale, y); ctx.stroke();
    }

    // Borda da sala
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD, PAD, scene.room.w * scale, scene.room.d * scale);

    // ALTERAÇÃO 1 — desenha cada objeto como polígono usando footprint
    for (const obj of scene.objects) {
      if (obj.footprint.length < 2) continue;

      ctx.beginPath();
      const first = tc(obj.footprint[0][0], obj.footprint[0][1]);
      ctx.moveTo(first.cx, first.cy);
      for (let i = 1; i < obj.footprint.length; i++) {
        const { cx, cy } = tc(obj.footprint[i][0], obj.footprint[i][1]);
        ctx.lineTo(cx, cy);
      }
      ctx.closePath();

      ctx.fillStyle = obj.isDestiny ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.04)";
      ctx.fill();
      ctx.strokeStyle = obj.color;
      ctx.lineWidth = obj.isDestiny ? 2.5 : 1.5;
      ctx.stroke();

      // ALTERAÇÃO 1 — label no centróide do footprint
      const center = footprintCentroid(obj.footprint);
      const { cx: lcx, cy: lcy } = tc(center.x, center.z);
      const fs = Math.max(8, Math.min(11, scale * 0.2));
      ctx.font = `${obj.isDestiny ? "bold " : ""}${fs}px monospace`;
      ctx.fillStyle = obj.isDestiny ? "#93c5fd" : "rgba(255,255,255,0.45)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(obj.label, lcx, lcy);
    }

    // Trilha do caminho
    if (path.length > 1) {
      for (let i = 1; i < path.length; i++) {
        const p0 = tc(path[i - 1].x, path[i - 1].z);
        const p1 = tc(path[i].x, path[i].z);
        const t = i / path.length;
        const r = Math.round(251 - t * 160);
        const g = Math.round(191 + t * 20);
        const b = Math.round(36 + t * 80);
        ctx.beginPath();
        ctx.moveTo(p0.cx, p0.cy);
        ctx.lineTo(p1.cx, p1.cy);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.8)`;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.stroke();
      }
      for (let i = 1; i < path.length - 1; i++) {
        const { cx, cy } = tc(path[i].x, path[i].z);
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(99,220,150,0.6)";
        ctx.fill();
      }
    }

    // Ponto de início
    if (path.length > 0) {
      const { cx, cy } = tc(path[0].x, path[0].z);
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#fbbf24"; ctx.fill();
    }

    // Agente
    const { cx, cy } = tc(agentPos.x, agentPos.z);
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 24);
    grd.addColorStop(0, "rgba(99,220,150,0.35)");
    grd.addColorStop(1, "rgba(99,220,150,0)");
    ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.fillStyle = grd; ctx.fill();

    ctx.beginPath(); ctx.arc(cx, cy, AGENT_RADIUS * scale, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(99,220,150,0.15)";
    ctx.strokeStyle = "#63dc96"; ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();

    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#63dc96"; ctx.fill();

  }, [agentPos, path, scene, W, H]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{
        display: "block",
        borderRadius: "10px",
        border: "1px solid rgba(255,255,255,0.07)",
        maxWidth: "100%",
      }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════
// SUMMARY CARD
// ═══════════════════════════════════════════════════════════════════
function SummaryCard({ metrics, onExport }: SummaryCardProps) {
  if (!metrics) return null;
  const rows = [
    ["Resultado",           metrics.success ? "✅ Chegou" : "❌ Falhou"],
    ["Inferências LLM",     String(metrics.inferences)],
    ["Turnos",              String(metrics.turns)],
    ["Passos válidos",      String(metrics.steps)],
    ["Dist. percorrida",    `${metrics.distance.toFixed(2)}m`],
    ["Colisões evitadas",   String(metrics.collisionsAvoided)],
    ["Dist. final", `${metrics.finalDist.toFixed(2)}m`],
  ];
  return (
    <div style={{
      background: "rgba(99,220,150,0.04)",
      border: "1px solid rgba(99,220,150,0.18)",
      borderRadius: "10px",
      padding: "14px 16px",
    }}>
      <div style={{ fontSize: "9px", color: "#63dc96", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: "10px" }}>
        Resumo da Sessão
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px 14px" }}>
        {rows.map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: "8px", color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em" }}>{k}</div>
            <div style={{ fontSize: "13px", color: "#e2e8f0", fontWeight: "600", marginTop: "1px" }}>{v}</div>
          </div>
        ))}
      </div>
      <button
        onClick={onExport}
        style={{
          marginTop: "12px", width: "100%", padding: "8px",
          background: "rgba(99,220,150,0.1)",
          border: "1px solid rgba(99,220,150,0.28)",
          borderRadius: "6px", color: "#63dc96",
          fontSize: "10px", fontFamily: "inherit",
          cursor: "pointer", letterSpacing: "0.06em",
          transition: "all 0.2s",
        }}
      >
        ↓ Exportar log JSON
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LOG STYLES
// ═══════════════════════════════════════════════════════════════════
const LC: { [key: string]: string } = {
  system:    "#475569",
  info:      "#60a5fa",
  reasoning: "#c084fc",
  prompt:    "#1e3a5f",
  step:      "#63dc96",
  warn:      "#fbbf24",
  error:     "#f87171",
  success:   "#34d399",
  metric:    "#64748b",
  feedback:  "#94a3b8",
};

// ═══════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [agentPos, setAgentPos] = useState<Point | null>(null);
  const [path, setPath] = useState<Point[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<"idle" | "running" | "arrived" | "stuck">("idle");
  const [turn, setTurn] = useState(0);
  const [openPrompts, setOpenPrompts] = useState<Set<number>>(new Set());

  const scene = SCENES[sceneIdx];
  const door  = scene.objects.find(o => o.isDestiny)!;
  const doorCenter = footprintCentroid(door.footprint);

  const historyRef  = useRef<ChatMessage[]>([]);
  const logsEndRef  = useRef<HTMLDivElement>(null);
  const sessionRef  = useRef<{
    scene: string;
    metrics: Metrics;
    logs: LogEntry[];
    path: Point[];
  } | null>(null);

  useEffect(() => {
    setAgentPos({ ...scene.startPos });
    setPath([{ ...scene.startPos }]);
    setLogs([]);
    setStatus("idle");
    setTurn(0);
    setMetrics(null);
    historyRef.current = [];
    sessionRef.current = null;
  }, [sceneIdx]);

  // ── NAVEGAÇÃO ────────────────────────────────────────────────────
  const runNavigation = useCallback(async () => {
    setOpenPrompts(new Set());
    setRunning(true);
    setStatus("running");
    setMetrics(null);

    const initPos = { ...scene.startPos };
    setAgentPos({ ...initPos });
    setPath([{ ...initPos }]);
    setLogs([]);
    setTurn(0);

    historyRef.current = buildInitialMessages(SYSTEM_PROMPT);

    let pos               = { ...initPos };
    let pathArr           = [{ ...initPos }];
    let logArr: LogEntry[] = [];
    let inferences        = 0;
    let steps             = 0;
    let distance          = 0;
    let collisionsAvoided = 0;
    let currentTurn       = 0;
    let arrived           = false;

    const log = (type: string, text: string): void => {
      const entry: LogEntry = { id: Date.now() + Math.random(), type, text, ts: new Date().toISOString() };
      logArr = [...logArr, entry];
      setLogs([...logArr]);
    };

    log("system", `🚀 Cena: "${scene.name}" | Início (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}) → Destino (${doorCenter.x.toFixed(1)}, ${doorCenter.z.toFixed(1)})`);

    while (currentTurn < MAX_TURNS) {
      currentTurn++;
      setTurn(currentTurn);

      const d = dist2D(pos, doorCenter);
      if (d < ARRIVAL_THRESHOLD) {
        log("success", `✅ Turno ${currentTurn}: Chegou ao destino! Distância final: ${d.toFixed(2)}m`);
        arrived = true;
        break;
      }

      const ctx    = buildContext(pos, scene);
      const prompt = buildPrompt(ctx, scene);
      log("prompt", prompt);

      const distLog = ctx.objs.map(o => `${o.label} ${o.distancia}m`).join(" | ");
      log("info", `📐 Distâncias: ${distLog} | Destino ${ctx.doorDist}m`);
      log("info", `🤔 Turno ${currentTurn} | Destino: ${ctx.doorDist}m | Direção: ${ctx.doorAngle}° | Consultando LLM…`);

      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: prompt },
      ];

      let resp: LLMResponse;
      try {
        const { reply, history } = await queryLLM(historyRef.current, LLM_PROVIDER, LLM_OPTS[LLM_PROVIDER]);
        historyRef.current = history;
        inferences++;
        resp = parseLLMResponse(reply);
      } catch (e) {
        log("error", `❌ Erro: ${(e as Error).message}`);
        setStatus("stuck");
        break;
      }

      log("reasoning", `💭 ${resp.reasoning}`);

      if (resp.arrived) {
        log("success", `✅ LLM declarou chegada. Destino: ${dist2D(pos, doorCenter).toFixed(2)}m`);
        arrived = true;
        break;
      }

      const turnSteps = (resp.steps || []).slice(0, MAX_STEPS_PER_TURN);
      const executedSteps: Array<{ angle: number; distance: number }> = [];
      const collisionEvents: Array<{ angle: number; what: string }>   = [];

      for (let i = 0; i < turnSteps.length; i++) {
        const s      = turnSteps[i];
        const newPos = stepFromAngle(pos, s.angle, s.distance || STEP_SIZE);
        const col    = checkCollision(newPos, scene);

        if (col.hit) {
          collisionsAvoided++;
          collisionEvents.push({ angle: s.angle, what: col.what! });
          log("warn", `⚠️  Passo ${i + 1}: colisão com "${col.what}" evitada (${s.angle}°)`);
          break;
        }

        distance += dist2D(pos, newPos);
        steps++;
        pos     = newPos;
        executedSteps.push({ angle: s.angle, distance: s.distance || STEP_SIZE });
        pathArr = [...pathArr, { ...pos }];

        setAgentPos({ ...pos });
        setPath([...pathArr]);

        log("step", `👣 Passo ${i + 1}: ${s.angle}° / ${(s.distance || STEP_SIZE).toFixed(1)}m → (${pos.x.toFixed(2)}, ${pos.z.toFixed(2)})`);

        await new Promise(r => setTimeout(r, STEP_ANIM_MS));

        if (dist2D(pos, doorCenter) < ARRIVAL_THRESHOLD) break;
      }

      const feedback = buildTurnFeedback(
        currentTurn,
        executedSteps,
        pos,
        collisionEvents,
        dist2D(pos, doorCenter).toFixed(1),
        resp.reasoning,
      );

      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: feedback },
      ];

      if (collisionEvents.length > 0) {
        log("feedback", `🔁 Feedback injetado | ${executedSteps.length} passos executados | ${collisionEvents.length} colisão(ões): ${collisionEvents.map(c => `"${c.what}" @${c.angle}°`).join(", ")}`);
      } else {
        log("feedback", `🔁 Feedback injetado | ${executedSteps.length} passos executados | sem colisões`);
      }

      await new Promise(r => setTimeout(r, 350));
    }

    if (!arrived && currentTurn >= MAX_TURNS) {
      log("error", `🛑 Limite de ${MAX_TURNS} turnos atingido sem chegar ao destino.`);
      setStatus("stuck");
    } else if (arrived) {
      setStatus("arrived");
    }

    const finalMetrics: Metrics = {
      success: arrived,
      inferences,
      turns: currentTurn,
      steps,
      distance,
      collisionsAvoided,
      finalDist: dist2D(pos, doorCenter),
    };

    log("metric", `📊 Fim | ${inferences} inferências | ${steps} passos | ${distance.toFixed(2)}m | ${collisionsAvoided} colisões evitadas`);

    setMetrics(finalMetrics);
    sessionRef.current = { scene: scene.id, metrics: finalMetrics, logs: logArr, path: pathArr };
    setRunning(false);
  }, [scene]);

  const handleExport = () => {
    if (!sessionRef.current) return;
    const { scene: sid, metrics: m, logs: l, path: p } = sessionRef.current;
    exportSession(sid, m, l, p);
  };

  const handleReset = () => {
    setOpenPrompts(new Set());
    setAgentPos({ ...scene.startPos });
    setPath([{ ...scene.startPos }]);
    setLogs([]);
    setStatus("idle");
    setTurn(0);
    setMetrics(null);
    historyRef.current = [];
    sessionRef.current = null;
  };

  const togglePrompt = useCallback((id: number) => {
    setOpenPrompts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const ST = {
    idle:    ["Aguardando", "#334155"],
    running: ["Navegando…", "#60a5fa"],
    arrived: ["Chegou ✓",   "#34d399"],
    stuck:   ["Travado",    "#f87171"],
  }[status] ?? ["Desconhecido", "#475569"];

  function PromptAccordion({ id, text, open, onToggle }: {
    id: number; text: string; open: boolean; onToggle: (id: number) => void
  }) {
    return (
      <div style={{ borderLeft: "2px solid #1e3a5f33", borderRadius: "0 3px 3px 0" }}>
        <button
          onClick={() => onToggle(id)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#1e6fa8", fontSize: "11px", padding: "2px 8px",
            fontFamily: "inherit", textAlign: "left", width: "100%",
            lineHeight: "1.7",
          }}
        >
          {open ? "▾" : "▸"} 📋 Prompt enviado ao LLM {open ? "(fechar)" : "(expandir)"}
        </button>
        {open && (
          <pre style={{
            margin: "0 0 4px 8px", padding: "8px",
            background: "rgba(30,58,95,0.18)",
            borderRadius: "4px", fontSize: "9.5px",
            color: "#60a5fa", whiteSpace: "pre-wrap",
            wordBreak: "break-word", lineHeight: "1.6",
            maxHeight: "320px", overflowY: "auto",
          }}>
            {text}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#06090f",
      color: "#e2e8f0",
      fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace",
      display: "flex",
      flexDirection: "column",
    }}>

      {/* HEADER */}
      <header style={{
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "13px 22px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "rgba(0,0,0,0.4)",
        backdropFilter: "blur(10px)",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div>
          <div style={{ fontSize: "8px", color: "#636f86", letterSpacing: "0.22em", textTransform: "uppercase" }}>LLM · NAVEGAÇÃO 3D · PROTÓTIPO</div>
          <div style={{ fontSize: "16px", fontWeight: "700", color: "#f1f5f9", letterSpacing: "-0.02em", marginTop: "2px" }}>
            {scene.name}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: ST[1] }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%", background: ST[1],
              boxShadow: status === "running" ? `0 0 10px ${ST[1]}` : "none",
              animation: status === "running" ? "blink 1s infinite" : "none",
            }} />
            {ST[0]}
          </div>
          {turn > 0 && <div style={{ fontSize: "9px", color: "#636f86" }}>turno {turn}/{MAX_TURNS}</div>}
        </div>
      </header>

      {/* SCENE TABS */}
      <div style={{
        display: "flex", gap: "6px", padding: "10px 22px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        overflowX: "auto",
      }}>
        {SCENES.map((s, i) => (
          <button key={s.id} onClick={() => { if (!running) setSceneIdx(i); }} disabled={running}
            style={{
              padding: "5px 14px", borderRadius: "6px",
              border: i === sceneIdx ? "1px solid rgba(99,220,150,0.45)" : "1px solid rgba(255,255,255,0.07)",
              background: i === sceneIdx ? "rgba(99,220,150,0.09)" : "rgba(255,255,255,0.02)",
              color: i === sceneIdx ? "#63dc96" : "#334155",
              fontSize: "10px", cursor: running ? "not-allowed" : "pointer",
              fontFamily: "inherit", whiteSpace: "nowrap", transition: "all 0.2s",
            }}
          >{s.name}</button>
        ))}
        <div style={{ marginLeft: "auto", fontSize: "9px", color: "#636f86", alignSelf: "center", whiteSpace: "nowrap" }}>
          + adicione cenas no array SCENES
        </div>
      </div>

      {/* BODY */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* LEFT */}
        <div style={{
          display: "flex", flexDirection: "column", gap: "11px",
          padding: "18px", borderRight: "1px solid rgba(255,255,255,0.04)",
          overflowY: "auto", minWidth: "fit-content",
        }}>
          <SceneCanvas agentPos={agentPos || scene.startPos} path={path} scene={scene} />

          {/* Legend */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {[
              ["#63dc96", "Agente"],
              ["#fbbf24", "Início"],
              ["#60a5fa", "Destino"],
              ["linear-gradient(90deg,#fbbf24,#63dc96)", "Caminho"],
            ].map(([c, l]) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "9px", color: "#334155" }}>
                <div style={{ width: 10, height: 10, borderRadius: "2px", background: c }} />
                {l}
              </div>
            ))}
          </div>

          {/* Live metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px" }}>
            {[
              ["Posição",    agentPos ? `(${agentPos.x.toFixed(1)}, ${agentPos.z.toFixed(1)})` : "—"],
              ["Dist. Destino", agentPos ? `${dist2D(agentPos, doorCenter).toFixed(1)}m` : "—"],
              ["Passos",     String(path.length - 1)],
              ["Turno",      turn ? String(turn) : "—"],
            ].map(([k, v]) => (
              <div key={k} style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.04)",
                borderRadius: "6px", padding: "7px 10px",
              }}>
                <div style={{ fontSize: "7px", color: "#636f86", textTransform: "uppercase", letterSpacing: "0.12em" }}>{k}</div>
                <div style={{ fontSize: "12px", color: "#e2e8f0", fontWeight: "600", marginTop: "2px" }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: "7px" }}>
            <button onClick={runNavigation} disabled={running} style={{
              flex: 1, padding: "10px",
              background: running ? "rgba(99,220,150,0.04)" : "rgba(99,220,150,0.11)",
              border: `1px solid ${running ? "rgba(99,220,150,0.12)" : "rgba(99,220,150,0.45)"}`,
              borderRadius: "7px", color: running ? "#636f86" : "#63dc96",
              fontSize: "11px", fontWeight: "700", cursor: running ? "not-allowed" : "pointer",
              fontFamily: "inherit", transition: "all 0.2s",
            }}>
              {running ? "▶ Executando…" : "▶ Iniciar Navegação"}
            </button>
            <button onClick={handleReset} disabled={running} style={{
              padding: "10px 13px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "7px", color: "#334155",
              fontSize: "14px", cursor: running ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}>↺</button>
          </div>

          <SummaryCard metrics={metrics} onExport={handleExport} />
        </div>

        {/* RIGHT — LOG */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          <div style={{
            padding: "9px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: "8px", color: "#636f86", letterSpacing: "0.18em", textTransform: "uppercase",
          }}>
            <span>Log de Navegação</span>
            <span>{logs.length} entradas</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px", display: "flex", flexDirection: "column", gap: "2px" }}>
            {logs.length === 0 && (
              <div style={{ color: "#636f86", fontSize: "11px", textAlign: "center", marginTop: "40px" }}>
                Selecione uma cena e pressione Iniciar.
              </div>
            )}
            {logs.map(entry =>
              entry.type === "prompt" ? (
                <PromptAccordion
                  key={entry.id}
                  id={entry.id}
                  text={entry.text}
                  open={openPrompts.has(entry.id)}
                  onToggle={togglePrompt}
                />
              ) : (
                <div key={entry.id} style={{
                  fontSize: "11px", lineHeight: "1.7",
                  color: LC[entry.type] || "#475569",
                  padding: "2px 8px",
                  borderLeft: `2px solid ${LC[entry.type] || "#334155"}33`,
                  borderRadius: "0 3px 3px 0",
                  background: entry.type === "success"   ? "rgba(52,211,153,0.05)"
                            : entry.type === "error"     ? "rgba(248,113,113,0.05)"
                            : entry.type === "reasoning" ? "rgba(192,132,252,0.04)"
                            : entry.type === "feedback"  ? "rgba(148,163,184,0.04)"
                            : "transparent",
                }}>
                  {entry.text}
                </div>
              )
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.15} }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 2px; }
      `}</style>
    </div>
  );
}