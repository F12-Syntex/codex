"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import type { WikiEntryType } from "@/lib/ai-wiki";
import type { ChapterLabels } from "@/lib/chapter-labels";

/* ── Types ─────────────────────────────────────────────── */
interface EntryListItem {
  id: string;
  name: string;
  type: WikiEntryType;
  significance: number;
}

interface RelRow {
  source_id: string;
  target_id: string;
  relation: string;
}

/* ── Type colors (match WikiViewer TYPE_META) ──────────── */
const TYPE_COLORS: Record<WikiEntryType, string> = {
  character: "rgb(147, 197, 253)",
  item: "rgb(252, 211, 77)",
  location: "rgb(110, 231, 183)",
  event: "rgb(253, 164, 175)",
  concept: "rgb(196, 181, 253)",
};

/* ── Layout node ───────────────────────────────────────── */
interface GNode {
  id: string;
  name: string;
  type: WikiEntryType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface GEdge {
  source: number;
  target: number;
  label: string;
}

/* ── Force layout (synchronous, capped) ────────────────── */
function layoutGraph(
  entries: EntryListItem[],
  rels: RelRow[],
  width: number,
  height: number,
  maxNodes: number,
): { nodes: GNode[]; edges: GEdge[] } {
  const sorted = [...entries].sort((a, b) => b.significance - a.significance);
  const top = sorted.slice(0, maxNodes);
  const idToIdx = new Map(top.map((e, i) => [e.id, i]));

  const nodes: GNode[] = top.map((e, i) => {
    const angle = (2 * Math.PI * i) / top.length;
    const r = Math.min(width, height) * 0.35;
    return {
      id: e.id,
      name: e.name,
      type: e.type,
      x: width / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * 40,
      y: height / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * 40,
      vx: 0,
      vy: 0,
      radius: Math.max(4, Math.min(14, 4 + e.significance * 2)),
    };
  });

  // Build edges — deduplicate by keeping lower-index source
  const edgeSet = new Set<string>();
  const edges: GEdge[] = [];
  for (const rel of rels) {
    const si = idToIdx.get(rel.source_id);
    const ti = idToIdx.get(rel.target_id);
    if (si === undefined || ti === undefined) continue;
    const key = si < ti ? `${si}:${ti}` : `${ti}:${si}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    edges.push({ source: Math.min(si, ti), target: Math.max(si, ti), label: rel.relation });
  }

  // Force simulation
  const iterations = Math.min(200, Math.max(60, 300 - top.length));
  const repulsion = 800;
  const attraction = 0.005;
  const damping = 0.92;
  const centerPull = 0.01;

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (repulsion * alpha) / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }

    for (const edge of edges) {
      const a = nodes[edge.source];
      const b = nodes[edge.target];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = dist * attraction * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    for (const n of nodes) {
      n.vx += (width / 2 - n.x) * centerPull * alpha;
      n.vy += (height / 2 - n.y) * centerPull * alpha;
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx;
      n.y += n.vy;
      n.x = Math.max(n.radius + 4, Math.min(width - n.radius - 4, n.x));
      n.y = Math.max(n.radius + 4, Math.min(height - n.radius - 4, n.y));
    }
  }

  return { nodes, edges };
}

/* ── Component ─────────────────────────────────────────── */
interface RelationshipGraphProps {
  filePath: string;
  chapterLabels: ChapterLabels;
  entries: EntryListItem[];
  onNavigate: (id: string) => void;
}

const MAX_NODES = 150;

export function RelationshipGraph({ filePath, entries, onNavigate }: RelationshipGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [hovered, setHovered] = useState<GNode | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rels, setRels] = useState<RelRow[]>([]);
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // Fetch all relationships once
  useEffect(() => {
    window.electronAPI?.wikiGetAllRelationships(filePath).then((rows: RelRow[]) => {
      if (rows) setRels(rows);
    });
  }, [filePath]);

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const graph = useMemo(
    () => layoutGraph(entries, rels, size.w, size.h, MAX_NODES),
    [entries, rels, size.w, size.h],
  );

  const truncated = entries.length > MAX_NODES;

  const toWorld = useCallback(
    (sx: number, sy: number) => ({
      x: (sx - pan.x) / zoom,
      y: (sy - pan.y) / zoom,
    }),
    [pan, zoom],
  );

  const hitTest = useCallback(
    (sx: number, sy: number): GNode | null => {
      const { x, y } = toWorld(sx, sy);
      for (let i = graph.nodes.length - 1; i >= 0; i--) {
        const n = graph.nodes[i];
        const dx = n.x - x;
        const dy = n.y - y;
        if (dx * dx + dy * dy <= (n.radius + 4) * (n.radius + 4)) return n;
      }
      return null;
    },
    [graph.nodes, toWorld],
  );

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    const { nodes, edges } = graph;

    // Edges (non-hovered)
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    for (const e of edges) {
      const a = nodes[e.source];
      const b = nodes[e.target];
      if (hovered && (a.id === hovered.id || b.id === hovered.id)) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Highlighted edges
    if (hovered) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      for (const e of edges) {
        const a = nodes[e.source];
        const b = nodes[e.target];
        if (a.id === hovered.id || b.id === hovered.id) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // Nodes
    for (const n of nodes) {
      const color = TYPE_COLORS[n.type] ?? "rgb(200,200,200)";
      const isHov = hovered?.id === n.id;
      const isNeighbor = hovered && edges.some(
        (e) =>
          (nodes[e.source].id === hovered.id && nodes[e.target].id === n.id) ||
          (nodes[e.target].id === hovered.id && nodes[e.source].id === n.id),
      );

      ctx.globalAlpha = hovered ? (isHov || isNeighbor ? 1 : 0.15) : 0.85;

      if (isHov) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fill();

      if (isHov) ctx.shadowBlur = 0;

      // Labels
      if (n.radius >= 8 || isHov || isNeighbor) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.font = `${isHov ? "bold " : ""}${isHov ? 11 : 9}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(n.name, n.x, n.y + n.radius + 12);
      }
    }

    ctx.globalAlpha = 1;

    // Relationship labels on hover
    if (hovered) {
      ctx.font = "8px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.textAlign = "center";
      for (const e of edges) {
        const a = nodes[e.source];
        const b = nodes[e.target];
        if (a.id === hovered.id || b.id === hovered.id) {
          ctx.fillText(e.label, (a.x + b.x) / 2, (a.y + b.y) / 2 - 4);
        }
      }
    }

    ctx.restore();

    if (truncated) {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`Showing top ${MAX_NODES} of ${entries.length}`, size.w - 12, size.h - 10);
    }
  }, [graph, size, hovered, pan, zoom, truncated, entries.length]);

  // Mouse handlers
  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (dragging.current) {
        setPan((p) => ({
          x: p.x + e.clientX - lastMouse.current.x,
          y: p.y + e.clientY - lastMouse.current.y,
        }));
        lastMouse.current = { x: e.clientX, y: e.clientY };
        return;
      }

      const hit = hitTest(sx, sy);
      setHovered(hit);
      if (canvasRef.current) canvasRef.current.style.cursor = hit ? "pointer" : "grab";
    },
    [hitTest],
  );

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (hit) onNavigate(hit.id);
    },
    [hitTest, onNavigate],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (!hitTest(e.clientX - rect.left, e.clientY - rect.top)) {
        dragging.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
        if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
      }
    },
    [hitTest],
  );

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    if (canvasRef.current) canvasRef.current.style.cursor = hovered ? "pointer" : "grab";
  }, [hovered]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((z) => {
      const nz = Math.max(0.2, Math.min(5, z * factor));
      setPan((p) => ({ x: sx - (sx - p.x) * (nz / z), y: sy - (sy - p.y) * (nz / z) }));
      return nz;
    });
  }, []);

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
        No entities to graph
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        width={size.w}
        height={size.h}
        style={{ width: size.w, height: size.h, cursor: "grab" }}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { setHovered(null); dragging.current = false; }}
        onClick={onClick}
        onWheel={onWheel}
      />
      {/* Legend */}
      <div
        className="absolute left-3 bottom-3 flex flex-wrap gap-2 rounded-lg px-2 py-1.5"
        style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)" }}
      >
        {(Object.entries(TYPE_COLORS) as [WikiEntryType, string][]).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full" style={{ background: color }} />
            <span className="text-[10px] capitalize" style={{ color: "rgba(255,255,255,0.5)" }}>{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
