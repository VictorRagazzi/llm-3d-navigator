import type { Point, Scene } from "../types";
import { expandPolygon, pointInPolygon } from "./polygons";

// ═══════════════════════════════════════════════════════════════════
// OCCUPANCY GRID + A* PATHFINDER
// ═══════════════════════════════════════════════════════════════════

export interface OccupancyGrid {
  cells: Uint8Array;   // 0 = free, 1 = obstacle
  cols: number;
  rows: number;
  cellSize: number;    // world units per cell
  roomW: number;
  roomD: number;
}

/**
 * Converts world coordinates to grid cell indices.
 */
export function worldToCell(
  x: number, z: number, grid: OccupancyGrid
): { col: number; row: number } {
  return {
    col: Math.floor(x / grid.cellSize),
    row: Math.floor(z / grid.cellSize),
  };
}

/**
 * Converts grid cell center back to world coordinates.
 */
export function cellToWorld(col: number, row: number, grid: OccupancyGrid): Point {
  return {
    x: (col + 0.5) * grid.cellSize,
    z: (row + 0.5) * grid.cellSize,
  };
}

function cellIndex(col: number, row: number, cols: number): number {
  return row * cols + col;
}

/**
 * Rasterizes the scene's polygon footprints into a binary occupancy grid.
 * Each cell is marked 1 if any obstacle polygon (expanded by agentRadius) covers it.
 */
export function buildOccupancyGrid(
  scene: Scene,
  agentRadius: number,
  resolution = 0.2   // world units per cell — smaller = more precise but slower A*
): OccupancyGrid {
  const { room, objects } = scene;
  const cellSize = resolution;
  const cols = Math.ceil(room.w / cellSize);
  const rows = Math.ceil(room.d / cellSize);
  const cells = new Uint8Array(cols * rows); // all free by default

  // Pre-expand all non-destination footprints by agent radius
  const obstacles = objects
    .filter(o => !o.isDestiny)
    .map(o => expandPolygon(o.footprint, agentRadius));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Sample the center of each cell
      const wx = (c + 0.5) * cellSize;
      const wz = (r + 0.5) * cellSize;

      // Wall padding — cell center must be at least agentRadius from each wall
      if (
        wx < agentRadius || wx > room.w - agentRadius ||
        wz < agentRadius || wz > room.d - agentRadius
      ) {
        cells[cellIndex(c, r, cols)] = 1;
        continue;
      }

      // Obstacle check
      for (const poly of obstacles) {
        if (pointInPolygon(wx, wz, poly)) {
          cells[cellIndex(c, r, cols)] = 1;
          break;
        }
      }
    }
  }

  return { cells, cols, rows, cellSize, roomW: room.w, roomD: room.d };
}

// ─── A* Node ───────────────────────────────────────────────────────

interface AStarNode {
  col: number;
  row: number;
  g: number;  // cost from start
  f: number;  // g + h
  parent: AStarNode | null;
}

function heuristic(c1: number, r1: number, c2: number, r2: number): number {
  // Octile distance — matches 8-directional movement cost
  const dc = Math.abs(c1 - c2);
  const dr = Math.abs(r1 - r2);
  return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
}

/**
 * 8-directional A* on the occupancy grid.
 * Returns a list of world-space waypoints from start to goal,
 * or null if no path is found.
 */
export function aStarGrid(
  start: Point,
  goal: Point,
  grid: OccupancyGrid
): Point[] | null {
  const startCell = worldToCell(start.x, start.z, grid);
  const goalCell  = worldToCell(goal.x,  goal.z,  grid);

  const { cols, rows, cells } = grid;

  // Clamp to grid bounds
  const sc = Math.max(0, Math.min(cols - 1, startCell.col));
  const sr = Math.max(0, Math.min(rows - 1, startCell.row));
  const gc = Math.max(0, Math.min(cols - 1, goalCell.col));
  const gr = Math.max(0, Math.min(rows - 1, goalCell.row));

  if (cells[cellIndex(gc, gr, cols)] === 1) {
    // Goal is inside an obstacle — find nearest free cell
    const free = findNearestFreeCell(gc, gr, grid);
    if (!free) return null;
    return aStarGrid(start, cellToWorld(free.col, free.row, grid), grid);
  }

  // Simple binary heap (min-heap by f)
  const open: AStarNode[] = [];
  const gScore = new Float32Array(cols * rows).fill(Infinity);
  const closed = new Uint8Array(cols * rows);

  const startNode: AStarNode = {
    col: sc, row: sr,
    g: 0,
    f: heuristic(sc, sr, gc, gr),
    parent: null,
  };

  gScore[cellIndex(sc, sr, cols)] = 0;
  heapPush(open, startNode);

  const DIRS = [
    [0, -1, 1], [0, 1, 1], [-1, 0, 1], [1, 0, 1],       // cardinal (cost 1)
    [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2],             // diagonal (cost √2)
    [-1,  1, Math.SQRT2], [1,  1, Math.SQRT2],
  ];

  while (open.length > 0) {
    const current = heapPop(open)!;
    const idx = cellIndex(current.col, current.row, cols);

    if (closed[idx]) continue;
    closed[idx] = 1;

    if (current.col === gc && current.row === gr) {
      return reconstructPath(current, grid);
    }

    for (const [dc, dr, cost] of DIRS) {
      const nc = current.col + dc;
      const nr = current.row + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const nIdx = cellIndex(nc, nr, cols);
      if (cells[nIdx] === 1 || closed[nIdx]) continue;

      // For diagonals: ensure both adjacent cardinal cells are free (no corner cutting)
      if (dc !== 0 && dr !== 0) {
        if (cells[cellIndex(current.col + dc, current.row, cols)] === 1) continue;
        if (cells[cellIndex(current.col, current.row + dr, cols)] === 1) continue;
      }

      const tentativeG = current.g + cost;
      if (tentativeG < gScore[nIdx]) {
        gScore[nIdx] = tentativeG;
        const neighbor: AStarNode = {
          col: nc, row: nr,
          g: tentativeG,
          f: tentativeG + heuristic(nc, nr, gc, gr),
          parent: current,
        };
        heapPush(open, neighbor);
      }
    }
  }

  return null; // No path found
}

/** Reconstructs path from goal node back to start, then smooths it. */
function reconstructPath(goal: AStarNode, grid: OccupancyGrid): Point[] {
  const raw: Point[] = [];
  let node: AStarNode | null = goal;
  while (node) {
    raw.push(cellToWorld(node.col, node.row, grid));
    node = node.parent;
  }
  raw.reverse();
  return smoothPath(raw, grid);
}

/**
 * Greedy string-pulling path smoother.
 * Removes intermediate waypoints that are line-of-sight to a further point.
 */
export function smoothPath(path: Point[], grid: OccupancyGrid): Point[] {
  if (path.length <= 2) return path;
  const smooth: Point[] = [path[0]];
  let i = 0;

  while (i < path.length - 1) {
    let furthest = i + 1;
    for (let j = i + 2; j < path.length; j++) {
      if (hasLineOfSight(path[i], path[j], grid)) {
        furthest = j;
      }
    }
    smooth.push(path[furthest]);
    i = furthest;
  }
  return smooth;
}

/** Checks line-of-sight between two world points on the grid using Bresenham. */
function hasLineOfSight(a: Point, b: Point, grid: OccupancyGrid): boolean {
  const { cols, rows, cells, cellSize } = grid;
  let c0 = Math.floor(a.x / cellSize);
  let r0 = Math.floor(a.z / cellSize);
  const c1 = Math.floor(b.x / cellSize);
  const r1 = Math.floor(b.z / cellSize);

  const dc = Math.abs(c1 - c0), dr = Math.abs(r1 - r0);
  const sc = c0 < c1 ? 1 : -1, sr = r0 < r1 ? 1 : -1;
  let err = dc - dr;

  while (true) {
    if (c0 < 0 || c0 >= cols || r0 < 0 || r0 >= rows) return false;
    if (cells[cellIndex(c0, r0, cols)] === 1) return false;
    if (c0 === c1 && r0 === r1) break;
    const e2 = 2 * err;
    if (e2 > -dr) { err -= dr; c0 += sc; }
    if (e2 <  dc) { err += dc; r0 += sr; }
  }
  return true;
}

/** BFS to find nearest non-obstacle cell to a blocked goal. */
function findNearestFreeCell(
  col: number, row: number, grid: OccupancyGrid
): { col: number; row: number } | null {
  const { cols, rows, cells } = grid;
  const visited = new Uint8Array(cols * rows);
  const queue: [number, number][] = [[col, row]];
  visited[cellIndex(col, row, cols)] = 1;
  const DIRS = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];

  while (queue.length > 0) {
    const [c, r] = queue.shift()!;
    if (cells[cellIndex(c, r, cols)] === 0) return { col: c, row: r };
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const ni = cellIndex(nc, nr, cols);
      if (!visited[ni]) { visited[ni] = 1; queue.push([nc, nr]); }
    }
  }
  return null;
}

// ─── Minimal binary min-heap ───────────────────────────────────────

function heapPush(heap: AStarNode[], node: AStarNode) {
  heap.push(node);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent].f <= heap[i].f) break;
    [heap[parent], heap[i]] = [heap[i], heap[parent]];
    i = parent;
  }
}

function heapPop(heap: AStarNode[]): AStarNode | undefined {
  if (heap.length === 0) return undefined;
  const top = heap[0];
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    let i = 0;
    while (true) {
      const l = 2 * i + 1, r = 2 * i + 2;
      let smallest = i;
      if (l < heap.length && heap[l].f < heap[smallest].f) smallest = l;
      if (r < heap.length && heap[r].f < heap[smallest].f) smallest = r;
      if (smallest === i) break;
      [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
      i = smallest;
    }
  }
  return top;
}