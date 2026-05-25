import type { Scene} from "../types";

// ═══════════════════════════════════════════════════════════════════
// BANCO DE CENAS — adicione novas cenas aqui
// ═══════════════════════════════════════════════════════════════════

const IS_MOCKED = true;

const MOCK_SCENES: Scene[] = [
  {
    id: "simple_bedroom",
    name: "Simple Bedroom",
    room: { w: 10, d: 10 },
    startPos: { x: 5.0, z: 8.5 },
    objects: [
      { id: 1, label: "door",      footprint: [[4.5,0.05],[5.5,0.05],[5.5,0.25],[4.5,0.25]], h: 2.1,  color: "#60a5fa", isDestiny: true },
      { id: 2, label: "table",     footprint: [[2.4,3.6],[3.6,3.6],[3.6,4.4],[2.4,4.4]],     h: 0.75, color: "#f59e0b" },
      { id: 3, label: "chair",     footprint: [[1.7,5.2],[2.3,5.2],[2.3,5.8],[1.7,5.8]],     h: 0.9,  color: "#a78bfa" },
      { id: 4, label: "sofa",      footprint: [[6.5,6.05],[8.5,6.05],[8.5,6.95],[6.5,6.95]], h: 0.85, color: "#34d399" },
      { id: 5, label: "bookshelf", footprint: [[0.8,1.1],[1.2,1.1],[1.2,2.9],[0.8,2.9]],     h: 1.8,  color: "#fb923c" },
      { id: 6, label: "bed",       footprint: [[6.5,2.2],[8.5,2.2],[8.5,3.8],[6.5,3.8]],     h: 0.5,  color: "#f472b6" },
      { id: 7, label: "wardrobe",  footprint: [[0.4,7.7],[1.6,7.7],[1.6,8.3],[0.4,8.3]],     h: 2.0,  color: "#94a3b8" },
    ],
  },
  {
    id: "living_room_corridor",
    name: "Living Room with Corridor",
    room: { w: 12, d: 8 },
    startPos: { x: 10.0, z: 4.25 },
    objects: [
      { id: 1, label: "door",         footprint: [[0.05,3.5],[0.25,3.5],[0.25,4.5],[0.05,4.5]], h: 2.1,  color: "#60a5fa", isDestiny: true },
      { id: 2, label: "sofa",         footprint: [[7.25,5.0],[9.75,5.0],[9.75,6.0],[7.25,6.0]], h: 0.85, color: "#34d399" },
      { id: 3, label: "coffee table", footprint: [[5.3,4.1],[6.7,4.1],[6.7,4.9],[5.3,4.9]],    h: 0.75, color: "#f59e0b" },
      { id: 4, label: "tv stand",     footprint: [[1.1,1.25],[2.9,1.25],[2.9,1.75],[1.1,1.75]], h: 0.6,  color: "#94a3b8" },
      { id: 5, label: "armchair",     footprint: [[4.1,2.1],[4.9,2.1],[4.9,2.9],[4.1,2.9]],    h: 1.0,  color: "#a78bfa" },
      { id: 6, label: "bookshelf",    footprint: [[10.3,0.0],[10.7,0.0],[10.7,2.0],[10.3,2.0]], h: 1.8,  color: "#fb923c" },
      { id: 7, label: "rug",          footprint: [[4.5,2.5],[7.5,2.5],[7.5,4.5],[4.5,4.5]],    h: 0.02, color: "#e879f9" },
    ],
  },
  {
    id: "office",
    name: "Crowded Office",
    room: { w: 8, d: 8 },
    startPos: { x: 0.5, z: 7.5 },
    objects: [
      { id: 1, label: "door",        footprint: [[3.55,0.05],[4.45,0.05],[4.45,0.25],[3.55,0.25]], h: 2.1,  color: "#60a5fa", isDestiny: true },
      { id: 2, label: "work desk",   footprint: [[1.2,2.1],[2.8,2.1],[2.8,2.9],[1.2,2.9]],        h: 0.75, color: "#f59e0b" },
      { id: 3, label: "chair 1",     footprint: [[1.7,3.4],[2.3,3.4],[2.3,4.0],[1.7,4.0]],        h: 0.9,  color: "#a78bfa" },
      { id: 4, label: "work desk 2", footprint: [[4.7,2.1],[6.3,2.1],[6.3,2.9],[4.7,2.9]],        h: 0.75, color: "#f59e0b" },
      { id: 5, label: "chair 2",     footprint: [[5.2,3.4],[5.8,3.4],[5.8,4.0],[5.2,4.0]],        h: 0.9,  color: "#a78bfa" },
      { id: 6, label: "wardrobe",    footprint: [[0.25,6.2],[1.75,6.2],[1.75,6.8],[0.25,6.8]],    h: 2.0,  color: "#94a3b8" },
      { id: 7, label: "printer",     footprint: [[6.25,4.8],[6.75,4.8],[6.75,5.2],[6.25,5.2]],    h: 0.4,  color: "#64748b" },
      { id: 8, label: "plant",       footprint: [[7.0,0.8],[7.4,0.8],[7.4,1.2],[7.0,1.2]],        h: 1.2,  color: "#4ade80" },
    ],
  },
  {
    id: "single_story_house",
    name: "Single-Story House",
    room: { w: 16, d: 12 },
    startPos: { x: 13.0, z: 5.0 },
    objects: [


      { id:  1, label: "front door", footprint: [[0.05,4.5],[0.25,4.5],[0.25,5.5],[0.05,5.5]], h: 2.1, color: "#60a5fa", isDestiny: true },
 
      // Internal walls
      { id:  2, label: "wall1", footprint: [[9.9,0.0],[10.1,0.0],[10.1,7.0],[9.9,7.0]],     h: 2.5, color: "#9ca3af" },
      { id:  3, label: "wall2", footprint: [[9.9,9.0],[10.1,9.0],[10.1,12.0],[9.9,12.0]],   h: 2.5, color: "#9ca3af" },
      { id:  4, label: "wall3", footprint: [[10.0,9.9],[16.0,9.9],[16.0,10.1],[10.0,10.1]], h: 2.5, color: "#9ca3af" },
      { id:  5, label: "wall4", footprint: [[0.0,8.9],[6.0,8.9],[6.0,9.1],[0.0,9.1]],       h: 2.5, color: "#9ca3af" },
      { id:  6, label: "wall5", footprint: [[8.0,8.9],[10.0,8.9],[10.0,9.1],[8.0,9.1]],     h: 2.5, color: "#9ca3af" },
 
      // Bedroom
      { id:  7, label: "bed",       footprint: [[11.0,1.0],[14.5,1.0],[14.5,3.5],[11.0,3.5]],    h: 0.5,  color: "#f472b6" },
      { id:  8, label: "wardrobe",  footprint: [[11.0,4.2],[14.5,4.2],[14.5,5.0],[11.0,5.0]],    h: 2.0,  color: "#94a3b8" },
      { id:  9, label: "table",     footprint: [[14.6,6.0],[15.8,6.0],[15.8,7.5],[14.6,7.5]],    h: 0.75, color: "#f59e0b" },
      { id: 10, label: "chair",     footprint: [[13.3,6.5],[14.0,6.5],[14.0,7.2],[13.3,7.2]],    h: 0.9,  color: "#a78bfa" },
 
      // Bathroom
      { id: 11, label: "toilet", footprint: [[14.5,10.3],[15.5,10.3],[15.5,11.3],[14.5,11.3]], h: 0.4, color: "#a78bfa" },
 
      // Living room
      { id: 12, label: "sofa",       footprint: [[1.5,3.0],[5.0,3.0],[5.0,4.0],[1.5,4.0]],        h: 0.85, color: "#34d399" },
      { id: 13, label: "tv stand",   footprint: [[0.8,0.2],[3.5,0.2],[3.5,0.7],[0.8,0.7]],         h: 0.6,  color: "#94a3b8" },
      { id: 14, label: "coffee table", footprint: [[2.5,5.0],[5.0,5.0],[5.0,6.5],[2.5,6.5]],      h: 0.4,  color: "#f59e0b" },
      { id: 15, label: "armchair",  footprint: [[6.5,5.5],[7.8,5.5],[7.8,6.8],[6.5,6.8]],         h: 1.0,  color: "#a78bfa" },
      { id: 16, label: "bookshelf", footprint: [[8.5,0.2],[9.8,0.2],[9.8,3.0],[8.5,3.0]],         h: 1.8,  color: "#fb923c" },
 
      // Kitchen
      { id: 17, label: "countertop",    footprint: [[0.5,9.3],[4.5,9.3],[4.5,10.0],[0.5,10.0]],    h: 0.9,  color: "#fb923c" },
      { id: 18, label: "stove",         footprint: [[5.0,9.3],[6.5,9.3],[6.5,10.3],[5.0,10.3]],    h: 0.85, color: "#64748b" },
      { id: 19, label: "refrigerator",  footprint: [[7.5,9.3],[8.8,9.3],[8.8,11.0],[7.5,11.0]],    h: 1.8,  color: "#e2e8f0" },
      { id: 20, label: "dining table",  footprint: [[1.0,10.5],[4.0,10.5],[4.0,11.8],[1.0,11.8]],  h: 0.75, color: "#f59e0b" },
    ],
  },
 
  {
    id: "compact_apartment",
    name: "Compact Apartment",
    room: { w: 14, d: 10 },
    startPos: { x: 11.0, z: 3.5 },
    objects: [
      { id:  1, label: "front door", footprint: [[5.0,0.05],[7.0,0.05],[7.0,0.25],[5.0,0.25]], h: 2.1, color: "#60a5fa", isDestiny: true },
 
      // Internal walls
      { id:  2, label: "wall", footprint: [[7.9,0.0],[8.1,0.0],[8.1,5.0],[7.9,5.0]],    h: 2.5, color: "#9ca3af" },
      { id:  3, label: "wall", footprint: [[7.9,7.0],[8.1,7.0],[8.1,10.0],[7.9,10.0]],  h: 2.5, color: "#9ca3af" },
      { id:  4, label: "wall", footprint: [[8.0,6.9],[14.0,6.9],[14.0,7.1],[8.0,7.1]],  h: 2.5, color: "#9ca3af" },
      { id:  5, label: "wall", footprint: [[0.0,4.9],[6.0,4.9],[6.0,5.1],[0.0,5.1]],    h: 2.5, color: "#9ca3af" },
 
      // Bedroom
      { id:  6, label: "bed",       footprint: [[8.5,0.5],[12.5,0.5],[12.5,3.5],[8.5,3.5]],   h: 0.5,  color: "#f472b6" },
      { id:  8, label: "desk",      footprint: [[12.6,0.5],[13.8,0.5],[13.8,2.0],[12.6,2.0]], h: 0.75, color: "#f59e0b" },
      { id:  9, label: "chair",     footprint: [[11.5,5.0],[12.3,5.0],[12.3,5.8],[11.5,5.8]], h: 0.9,  color: "#a78bfa" },
 
      // Bathroom
      { id: 10, label: "toilet",  footprint: [[12.5,7.3],[13.5,7.3],[13.5,8.3],[12.5,8.3]], h: 0.4, color: "#a78bfa" },
      { id: 11, label: "shower",  footprint: [[8.3,7.3],[10.0,7.3],[10.0,9.5],[8.3,9.5]],   h: 2.1, color: "#bae6fd" },
 
      // Living room
      { id: 12, label: "sofa",       footprint: [[0.5,1.0],[4.5,1.0],[4.5,2.0],[0.5,2.0]],    h: 0.85, color: "#34d399" },
      { id: 13, label: "tv stand",   footprint: [[0.5,0.2],[3.5,0.2],[3.5,0.7],[0.5,0.7]],     h: 0.6,  color: "#94a3b8" },
      { id: 14, label: "armchair",   footprint: [[5.5,2.2],[6.8,2.2],[6.8,3.5],[5.5,3.5]],     h: 1.0,  color: "#a78bfa" },
      { id: 15, label: "bookshelf",  footprint: [[6.8,0.2],[7.8,0.2],[7.8,3.5],[6.8,3.5]],     h: 1.8,  color: "#fb923c" },
 
      // Dining room
      { id: 16, label: "dining table", footprint: [[1.0,5.5],[4.5,5.5],[4.5,8.0],[1.0,8.0]],  h: 0.75, color: "#f59e0b" },
      { id: 17, label: "chair 1",      footprint: [[0.2,6.0],[0.9,6.0],[0.9,6.8],[0.2,6.8]],  h: 0.9,  color: "#a78bfa" },
      { id: 18, label: "chair 2",      footprint: [[4.6,6.0],[5.3,6.0],[5.3,6.8],[4.6,6.8]],  h: 0.9,  color: "#a78bfa" },
      { id: 19, label: "sideboard",    footprint: [[5.5,8.5],[7.5,8.5],[7.5,9.5],[5.5,9.5]],  h: 0.9,  color: "#fb923c" },
    ],
  },
];

function loadRealScenes(): Scene[] {
  const sceneFiles = import.meta.glob('./scenes/*.json', { eager: true });
  const scenes = Object.values(sceneFiles).map((module: any) => {
    return (module.default ? module.default : module) as Scene;
  });
  return scenes;
}

export const SCENES: Scene[] = (IS_MOCKED ? MOCK_SCENES : loadRealScenes()) || [];
