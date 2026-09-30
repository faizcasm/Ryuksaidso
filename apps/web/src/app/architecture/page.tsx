"use client";

import { useState, useEffect, useRef } from "react";
import {
  Database, Cpu, Zap, GitBranch, Shield, BarChart3,
  X, Copy, Check, Play, Pause, RotateCcw
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import icon from "../icon.png";

type ViewMode = "3d" | "2d" | "detailed";
type LayerId = "edge" | "app" | "data";
type Vec3 = [number, number, number];

interface Component {
  id: string;
  name: string;
  icon: typeof Database;
  color: string;
  description: string;
  position: [number, number, number];
  size: [number, number, number];
  layer: LayerId;
  dependencies: string[];
  details: string;
}

interface Projected {
  x: number;
  y: number;
  depth: number;
  scale: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Hit {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const components: Component[] = [
  {
    id: "web",
    name: "Web Dashboard",
    icon: GitBranch,
    color: "#22d3ee",
    description: "Next.js 15 SPA for agent management and monitoring",
    position: [-3, 2, 4.5],
    size: [1.8, 1.2, 0.8],
    layer: "edge",
    dependencies: ["api"],
    details: "React-based UI with real-time updates, authentication, and comprehensive monitoring dashboard",
  },
  {
    id: "api",
    name: "API Server",
    icon: Cpu,
    color: "#8b5cf6",
    description: "Express.js backend with full agent lifecycle management",
    position: [0, 1, 0],
    size: [1.8, 1.2, 0.8],
    layer: "app",
    dependencies: ["postgres", "redis"],
    details: "RESTful API with authentication, rate limiting, audit logging, and metrics collection",
  },
  {
    id: "worker",
    name: "Worker Processes",
    icon: Zap,
    color: "#f59e0b",
    description: "BullMQ-based job queue workers for async execution",
    position: [3, 2, 0],
    size: [1.8, 1.2, 0.8],
    layer: "app",
    dependencies: ["redis", "postgres"],
    details: "Distributed job processing with retry logic, timeouts, and failure handling",
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    icon: Database,
    color: "#34d399",
    description: "Primary data persistence layer",
    position: [-3, -1, -4.5],
    size: [1.6, 1.2, 0.8],
    layer: "data",
    dependencies: [],
    details: "Agent registry, runs, approvals, users, organizations, and audit logs",
  },
  {
    id: "redis",
    name: "Redis",
    icon: Zap,
    color: "#ef4444",
    description: "Job queue and caching layer",
    position: [0, -1, -4.5],
    size: [1.6, 1.2, 0.8],
    layer: "data",
    dependencies: [],
    details: "BullMQ jobs, sessions, real-time event streaming, and performance caching",
  },
  {
    id: "ollama",
    name: "OLLAMA LLM",
    icon: Cpu,
    color: "#a78bfa",
    description: "Local LLM inference engine",
    position: [3, -1, -4.5],
    size: [1.6, 1.2, 0.8],
    layer: "data",
    dependencies: [],
    details: "Local LLM provider with support for multiple models (qwen, llama, etc)",
  },
];

const layers: { id: LayerId; name: string; color: string }[] = [
  { id: "edge", name: "Edge / Ingress", color: "#22d3ee" },
  { id: "app", name: "Application", color: "#8b5cf6" },
  { id: "data", name: "Data / Storage", color: "#34d399" },
];

const dataFlows = [
  { from: "web", to: "api", label: "HTTP/REST", color: "#22d3ee" },
  { from: "api", to: "postgres", label: "Queries", color: "#34d399" },
  { from: "api", to: "redis", label: "Cache/Jobs", color: "#ef4444" },
  { from: "worker", to: "redis", label: "Dequeue", color: "#ef4444" },
  { from: "worker", to: "postgres", label: "Updates", color: "#34d399" },
  { from: "worker", to: "ollama", label: "Inference", color: "#a78bfa" },
];

const CAMERA_DISTANCE = 22;
const TILT_MIN = 0.1;
const TILT_MAX = 0.5;
const DEFAULT_TILT = 0.32;

const sceneCenter: Vec3 = [
  components.reduce((sum, c) => sum + c.position[0], 0) / components.length,
  components.reduce((sum, c) => sum + c.position[1], 0) / components.length,
  components.reduce((sum, c) => sum + c.position[2], 0) / components.length,
];

const lightDir: Vec3 = (() => {
  const raw: Vec3 = [-0.35, 0.85, 0.55];
  const len = Math.hypot(raw[0], raw[1], raw[2]);
  return [raw[0] / len, raw[1] / len, raw[2] / len];
})();

const FACES: { idx: number[]; n: Vec3 }[] = [
  { idx: [4, 5, 7, 6], n: [0, 0, 1] },
  { idx: [0, 1, 3, 2], n: [0, 0, -1] },
  { idx: [2, 3, 7, 6], n: [0, 1, 0] },
  { idx: [0, 4, 5, 1], n: [0, -1, 0] },
  { idx: [1, 5, 7, 3], n: [1, 0, 0] },
  { idx: [0, 4, 6, 2], n: [-1, 0, 0] },
];

function resolveApiServerHref(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (!raw) return process.env.NODE_ENV === 'production' ? '/health' : '/docs';
  if (raw.startsWith('/')) return '/health';
  try {
    return new URL(raw).origin + "/health";
  } catch {
    return "/docs";
  }
}

const apiServerHref = resolveApiServerHref();

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function rotate3(x: number, y: number, z: number, yaw: number, pitch: number): Vec3 {
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const x1 = x * cosY + z * sinY;
  const z1 = -x * sinY + z * cosY;
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const y2 = y * cosP - z1 * sinP;
  const z2 = y * sinP + z1 * cosP;
  return [x1, y2, z2];
}

function makeProjector(
  yaw: number,
  pitch: number,
  centerX: number,
  centerY: number,
  scale: number,
  distance: number
) {
  return (x: number, y: number, z: number): Projected => {
    const [tx, ty, tz] = rotate3(
      x - sceneCenter[0],
      y - sceneCenter[1],
      z - sceneCenter[2],
      yaw,
      pitch
    );
    const depth = distance - tz;
    const factor = distance / Math.max(depth, 1);
    return {
      x: centerX + tx * factor * scale,
      y: centerY - ty * factor * scale,
      depth,
      scale: factor,
    };
  };
}

function shadedAlpha(hex: string, factor: number, alpha: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = clamp(Math.round(((num >> 16) & 255) * factor), 0, 255);
  const g = clamp(Math.round(((num >> 8) & 255) * factor), 0, 255);
  const b = clamp(Math.round((num & 255) * factor), 0, 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function withAlpha(hex: string, alpha: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function clipToRect(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  rect: Rect
): [number, number] {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return [fromX, fromY];
  let exit = 1;
  if (dx > 1e-6) exit = Math.min(exit, (rect.x + rect.w - fromX) / dx);
  else if (dx < -1e-6) exit = Math.min(exit, (rect.x - fromX) / dx);
  if (dy > 1e-6) exit = Math.min(exit, (rect.y + rect.h - fromY) / dy);
  else if (dy < -1e-6) exit = Math.min(exit, (rect.y - fromY) / dy);
  const t = clamp(exit, 0, 1) * 0.98;
  return [fromX + dx * t, fromY + dy * t];
}

function drawFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  baseSize: number,
  color: string
) {
  let size = baseSize;
  ctx.font = `bold ${size}px inter, sans-serif`;
  let width = ctx.measureText(text).width;
  while (width > maxWidth && size > 7) {
    size -= 1;
    ctx.font = `bold ${size}px inter, sans-serif`;
    width = ctx.measureText(text).width;
  }
  ctx.fillStyle = color;
  if (width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }
  let cut = text;
  while (cut.length > 1 && ctx.measureText(cut + "...").width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  ctx.fillText(cut + "...", x, y);
}

function drawBox3d(
  ctx: CanvasRenderingContext2D,
  comp: Component,
  corners: Projected[],
  yaw: number,
  pitch: number,
  distance: number,
  active: boolean
) {
  const visible: { depth: number; path: Projected[]; brightness: number }[] = [];
  for (const face of FACES) {
    const n = face.n;
    const [nx, ny, nz] = rotate3(n[0], n[1], n[2], yaw, pitch);
    const cx = comp.position[0] + (n[0] * comp.size[0]) / 2 - sceneCenter[0];
    const cy = comp.position[1] + (n[1] * comp.size[1]) / 2 - sceneCenter[1];
    const cz = comp.position[2] + (n[2] * comp.size[2]) / 2 - sceneCenter[2];
    const [fx, fy, fz] = rotate3(cx, cy, cz, yaw, pitch);
    const facing = nx * (0 - fx) + ny * (0 - fy) + nz * (distance - fz);
    if (facing <= 0) continue;
    const dot = Math.max(0, n[0] * lightDir[0] + n[1] * lightDir[1] + n[2] * lightDir[2]);
    const brightness = 0.32 + 0.68 * dot;
    const path = face.idx.map((i) => corners[i]);
    const depth = path.reduce((sum, p) => sum + p.depth, 0) / path.length;
    visible.push({ depth, path, brightness });
  }
  visible.sort((a, b) => b.depth - a.depth);
  for (const face of visible) {
    ctx.beginPath();
    ctx.moveTo(face.path[0].x, face.path[0].y);
    for (let i = 1; i < face.path.length; i++) {
      ctx.lineTo(face.path[i].x, face.path[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = shadedAlpha(
      comp.color,
      face.brightness,
      0.86 + 0.12 * face.brightness
    );
    ctx.fill();
    ctx.strokeStyle = withAlpha(comp.color, active ? 1 : 0.75);
    ctx.lineWidth = active ? 2.2 : 1.3;
    ctx.stroke();
  }
}

export default function ArchitecturePage() {
  const [selectedComponent, setSelectedComponent] = useState<string | null>("api");
  const [isRotating, setIsRotating] = useState(true);
  const [rotationSpeed, setRotationSpeed] = useState(0.5);
  const [viewMode, setViewMode] = useState<ViewMode>("3d");
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef(0);
  const tiltRef = useRef(DEFAULT_TILT);
  const animationRef = useRef<number | null>(null);
  const hitsRef = useRef<Hit[]>([]);
  const hoverRef = useRef<string | null>(null);
  const draggingRef = useRef(false);
  const stateRef = useRef({ isRotating, rotationSpeed, viewMode, selectedComponent });

  useEffect(() => {
    stateRef.current = { isRotating, rotationSpeed, viewMode, selectedComponent };
  }, [isRotating, rotationSpeed, viewMode, selectedComponent]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 1;
    let height = 1;
    let dpr = 1;
    let lastTime = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(rect.width));
      const nextHeight = Math.max(1, Math.round(rect.height));
      const nextDpr = Math.max(1, window.devicePixelRatio || 1);
      if (nextWidth === width && nextHeight === height && nextDpr === dpr) return;
      width = nextWidth;
      height = nextHeight;
      dpr = nextDpr;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const pickAt = (x: number, y: number): string | null => {
      const list = hitsRef.current;
      for (let i = list.length - 1; i >= 0; i--) {
        const hit = list[i];
        if (x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h) {
          return hit.id;
        }
      }
      return null;
    };

    const localPoint = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const pointer = {
      id: -1,
      down: false,
      lastX: 0,
      lastY: 0,
      moved: 0,
    };

    const onPointerDown = (e: PointerEvent) => {
      const point = localPoint(e);
      pointer.id = e.pointerId;
      pointer.down = true;
      pointer.lastX = point.x;
      pointer.lastY = point.y;
      pointer.moved = 0;
      draggingRef.current = false;
      if (e.pointerType === "mouse") e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const point = localPoint(e);
      if (pointer.down && e.pointerId === pointer.id) {
        const dx = point.x - pointer.lastX;
        const dy = point.y - pointer.lastY;
        pointer.lastX = point.x;
        pointer.lastY = point.y;
        pointer.moved += Math.abs(dx) + Math.abs(dy);
        if (pointer.moved > 4) {
          draggingRef.current = true;
          rotationRef.current += dx * 0.006;
          tiltRef.current = clamp(tiltRef.current + dy * 0.004, TILT_MIN, TILT_MAX);
          hoverRef.current = null;
          canvas.style.cursor = "grabbing";
        }
        return;
      }
      const hit = pickAt(point.x, point.y);
      hoverRef.current = hit;
      canvas.style.cursor = hit ? "pointer" : "grab";
    };

    const finishPointer = (e: PointerEvent) => {
      if (!pointer.down || e.pointerId !== pointer.id) return;
      const wasDrag = draggingRef.current;
      pointer.down = false;
      draggingRef.current = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
      }
      if (!wasDrag) {
        const point = localPoint(e);
        const hit = pickAt(point.x, point.y);
        if (hit) setSelectedComponent(hit);
      }
      const hover = hoverRef.current;
      canvas.style.cursor = hover ? "pointer" : "grab";
    };

    const onPointerUp = (e: PointerEvent) => finishPointer(e);

    const onPointerCancel = (e: PointerEvent) => {
      if (!pointer.down || e.pointerId !== pointer.id) return;
      pointer.down = false;
      draggingRef.current = false;
      canvas.style.cursor = "grab";
    };

    const onPointerLeave = () => {
      if (pointer.down) return;
      hoverRef.current = null;
      canvas.style.cursor = "grab";
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("pointerleave", onPointerLeave);

    const drawGrid = () => {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 40) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
      }
      for (let y = 0; y <= height; y += 40) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
      }
      ctx.stroke();
    };

    const drawRings = (rect: Rect, color: string) => {
      for (let i = 1; i <= 3; i++) {
        ctx.strokeStyle = withAlpha(color, 0.32 / i);
        ctx.lineWidth = 1;
        ctx.strokeRect(
          rect.x - i * 4 + 0.5,
          rect.y - i * 4 + 0.5,
          rect.w + i * 8,
          rect.h + i * 8
        );
      }
    };

    const drawLegend = () => {
      const rows = layers.map((layer) => ({
        ...layer,
        count: components.filter((c) => c.layer === layer.id).length,
      }));
      const pad = 10;
      const titleHeight = 18;
      const rowHeight = 16;
      const boxWidth = 168;
      const boxHeight = pad * 2 + titleHeight + rows.length * rowHeight;
      const x = 14;
      const y = height - boxHeight - 14;
      ctx.fillStyle = "rgba(10, 13, 18, 0.9)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(x + 0.5, y + 0.5, boxWidth, boxHeight);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "9px inter, sans-serif";
      ctx.fillStyle = "#8f98a9";
      ctx.fillText("LAYERS", x + pad, y + pad + 6);
      rows.forEach((row, index) => {
        const rowY = y + pad + titleHeight + index * rowHeight + rowHeight / 2;
        ctx.fillStyle = row.color;
        ctx.fillRect(x + pad, rowY - 4, 8, 8);
        ctx.font = "10px inter, sans-serif";
        ctx.fillStyle = "#c7cfdb";
        ctx.fillText(row.name, x + pad + 16, rowY);
        ctx.textAlign = "right";
        ctx.fillStyle = "#8f98a9";
        ctx.fillText(`${row.count} ${row.count === 1 ? "node" : "nodes"}`, x + boxWidth - pad, rowY);
        ctx.textAlign = "left";
      });
    };

    const renderSpatial = (st: {
      selectedComponent: string | null;
      viewMode: ViewMode;
    }) => {
      const yaw = rotationRef.current;
      const pitch = tiltRef.current;
      const scale = Math.max(14, Math.min((width - 40) / 17, (height - 40) / 10));
      const project = makeProjector(
        yaw,
        pitch,
        width / 2,
        height / 2,
        scale,
        CAMERA_DISTANCE
      );

      const nodes = components.map((comp) => {
        const hx = comp.size[0] / 2;
        const hy = comp.size[1] / 2;
        const hz = comp.size[2] / 2;
        const corners: Projected[] = [];
        for (let i = 0; i < 8; i++) {
          corners.push(
            project(
              comp.position[0] + ((i & 1) !== 0 ? hx : -hx),
              comp.position[1] + ((i & 2) !== 0 ? hy : -hy),
              comp.position[2] + ((i & 4) !== 0 ? hz : -hz)
            )
          );
        }
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const corner of corners) {
          minX = Math.min(minX, corner.x);
          maxX = Math.max(maxX, corner.x);
          minY = Math.min(minY, corner.y);
          maxY = Math.max(maxY, corner.y);
        }
        const center = project(comp.position[0], comp.position[1], comp.position[2]);
        return {
          comp,
          corners,
          center,
          rect: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
          depth: center.depth,
        };
      });

      let nearDepth = Infinity;
      let farDepth = -Infinity;
      for (const node of nodes) {
        nearDepth = Math.min(nearDepth, node.depth);
        farDepth = Math.max(farDepth, node.depth);
      }
      const depthSpan = Math.max(1e-6, farDepth - nearDepth);

      const edges: {
        flow: (typeof dataFlows)[number];
        ax: number;
        ay: number;
        bx: number;
        by: number;
        depth: number;
      }[] = [];
      for (const flow of dataFlows) {
        const from = nodes.find((n) => n.comp.id === flow.from);
        const to = nodes.find((n) => n.comp.id === flow.to);
        if (!from || !to) continue;
        const [ax, ay] = clipToRect(
          from.center.x,
          from.center.y,
          to.center.x,
          to.center.y,
          from.rect
        );
        const [bx, by] = clipToRect(
          to.center.x,
          to.center.y,
          from.center.x,
          from.center.y,
          to.rect
        );
        edges.push({
          flow,
          ax,
          ay,
          bx,
          by,
          depth: (from.depth + to.depth) / 2,
        });
      }

      const tasks: { depth: number; run: () => void }[] = [];

      for (const edge of edges) {
        const depthRatio = (edge.depth - nearDepth) / depthSpan;
        const hot =
          st.selectedComponent === edge.flow.from ||
          st.selectedComponent === edge.flow.to;
        const alpha = clamp((0.62 - 0.45 * depthRatio) * (hot ? 1.6 : 1), 0.06, 0.95);
        const lineWidth = 1 + (1 - depthRatio) * 1.4 + (hot ? 0.6 : 0);
        tasks.push({
          depth: edge.depth,
          run: () => {
            ctx.strokeStyle = withAlpha(edge.flow.color, alpha);
            ctx.lineWidth = lineWidth;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(edge.ax, edge.ay);
            ctx.lineTo(edge.bx, edge.by);
            ctx.stroke();
            ctx.setLineDash([]);
          },
        });
      }

      for (const node of nodes) {
        const active =
          st.selectedComponent === node.comp.id || hoverRef.current === node.comp.id;
        tasks.push({
          depth: node.depth,
          run: () => {
            drawBox3d(ctx, node.comp, node.corners, yaw, pitch, CAMERA_DISTANCE, active);
            if (active) drawRings(node.rect, node.comp.color);
            hitsRef.current.push({
              id: node.comp.id,
              x: node.rect.x,
              y: node.rect.y,
              w: node.rect.w,
              h: node.rect.h,
            });
          },
        });
      }

      tasks.sort((a, b) => b.depth - a.depth);
      for (const task of tasks) task.run();

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const node of nodes) {
        const active =
          st.selectedComponent === node.comp.id || hoverRef.current === node.comp.id;
        if (st.viewMode !== "3d" || active) {
          drawFittedText(
            ctx,
            node.comp.name,
            node.center.x,
            node.center.y,
            node.rect.w - 14,
            11,
            active ? "#ffffff" : "rgba(255, 255, 255, 0.92)"
          );
        }
      }

      if (st.viewMode === "detailed") {
        for (const edge of edges) {
          const midX = (edge.ax + edge.bx) / 2;
          const midY = (edge.ay + edge.by) / 2;
          ctx.font = "10px inter, sans-serif";
          const labelWidth = ctx.measureText(edge.flow.label).width;
          ctx.fillStyle = "rgba(8, 10, 15, 0.88)";
          ctx.fillRect(midX - labelWidth / 2 - 5, midY - 8, labelWidth + 10, 16);
          ctx.fillStyle = withAlpha(edge.flow.color, 0.95);
          ctx.fillText(edge.flow.label, midX, midY);
        }
      }
    };

    const renderFlat = (st: {
      selectedComponent: string | null;
      viewMode: ViewMode;
    }) => {
      const scale = Math.max(14, Math.min((width - 40) / 8, (height - 150) / 4.2));
      const centerX = width / 2;
      const centerY = height / 2;
      const nodes = components.map((comp) => {
        const x = centerX + (comp.position[0] - sceneCenter[0]) * scale;
        const y = centerY - (comp.position[1] - sceneCenter[1]) * scale;
        const w = comp.size[0] * scale;
        const h = comp.size[1] * scale;
        return {
          comp,
          center: { x, y },
          rect: { x: x - w / 2, y: y - h / 2, w, h },
        };
      });
      const byId = new Map(nodes.map((node) => [node.comp.id, node]));

      const edges: {
        flow: (typeof dataFlows)[number];
        ax: number;
        ay: number;
        bx: number;
        by: number;
      }[] = [];
      for (const flow of dataFlows) {
        const from = byId.get(flow.from);
        const to = byId.get(flow.to);
        if (!from || !to) continue;
        const [ax, ay] = clipToRect(
          from.center.x,
          from.center.y,
          to.center.x,
          to.center.y,
          from.rect
        );
        const [bx, by] = clipToRect(
          to.center.x,
          to.center.y,
          from.center.x,
          from.center.y,
          to.rect
        );
        edges.push({ flow, ax, ay, bx, by });
      }

      for (const edge of edges) {
        const hot =
          st.selectedComponent === edge.flow.from ||
          st.selectedComponent === edge.flow.to;
        ctx.strokeStyle = withAlpha(edge.flow.color, hot ? 0.85 : 0.45);
        ctx.lineWidth = hot ? 2.4 : 1.6;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(edge.ax, edge.ay);
        ctx.lineTo(edge.bx, edge.by);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      for (const node of nodes) {
        const active =
          st.selectedComponent === node.comp.id || hoverRef.current === node.comp.id;
        ctx.fillStyle = withAlpha(node.comp.color, active ? 0.75 : 0.5);
        ctx.strokeStyle = withAlpha(node.comp.color, active ? 1 : 0.85);
        ctx.lineWidth = active ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.rect(node.rect.x, node.rect.y, node.rect.w, node.rect.h);
        ctx.fill();
        ctx.stroke();
        if (active) drawRings(node.rect, node.comp.color);
        hitsRef.current.push({
          id: node.comp.id,
          x: node.rect.x,
          y: node.rect.y,
          w: node.rect.w,
          h: node.rect.h,
        });
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const node of nodes) {
        const active =
          st.selectedComponent === node.comp.id || hoverRef.current === node.comp.id;
        drawFittedText(
          ctx,
          node.comp.name,
          node.center.x,
          node.center.y,
          node.rect.w - 14,
          12,
          active ? "#ffffff" : "rgba(255, 255, 255, 0.95)"
        );
      }

      if (st.viewMode === "detailed") {
        for (const edge of edges) {
          const midX = (edge.ax + edge.bx) / 2;
          const midY = (edge.ay + edge.by) / 2;
          ctx.font = "11px inter, sans-serif";
          const labelWidth = ctx.measureText(edge.flow.label).width;
          ctx.fillStyle = "rgba(8, 10, 15, 0.88)";
          ctx.fillRect(midX - labelWidth / 2 - 5, midY - 8, labelWidth + 10, 16);
          ctx.fillStyle = withAlpha(edge.flow.color, 0.95);
          ctx.fillText(edge.flow.label, midX, midY);
        }
      }
    };

    const render = (time: number) => {
      animationRef.current = requestAnimationFrame(render);
      const st = stateRef.current;
      const dt = Math.min(0.05, Math.max(0, (time - lastTime) / 1000));
      lastTime = time;
      if (st.isRotating && !draggingRef.current) {
        rotationRef.current += st.rotationSpeed * 0.6 * dt;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0a0d12";
      ctx.fillRect(0, 0, width, height);
      drawGrid();

      hitsRef.current = [];
      if (st.viewMode === "2d") {
        renderFlat(st);
      } else {
        renderSpatial(st);
      }
      if (st.viewMode === "detailed") drawLegend();
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      hoverRef.current = null;
      draggingRef.current = false;
      hitsRef.current = [];
    };
  }, []);

  const currentComponent = components.find((c) => c.id === selectedComponent);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(text);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const canvasLabel =
    viewMode === "2d"
      ? "Interactive 2D Architecture"
      : viewMode === "detailed"
      ? "Detailed 3D Architecture"
      : "Interactive 3D Architecture";

  return (
    <div className="architecture-page">
      <header className="arch-header">
        <div className="arch-header-content">
          <Link href="/" className="arch-brand">
            <Image src={icon} alt="Ryuksaidso" width={32} height={32} />
            <div>
              <strong>Ryuksaidso</strong>
              <span>Architecture</span>
            </div>
          </Link>
          <div className="arch-nav">
            <Link href="/docs">
              <span>Documentation</span>
            </Link>
            <a href={apiServerHref} target="_blank" rel="noopener noreferrer">
              <span>API Server</span>
            </a>
          </div>
        </div>
      </header>

      <div className="architecture-container">
        <aside className="arch-sidebar">
          <div className="arch-controls">
            <h3>View Controls</h3>
            <div className="control-group">
              <label>View Mode</label>
              <div className="view-modes">
                {(["3d", "2d", "detailed"] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={`view-mode-btn ${viewMode === mode ? "active" : ""}`}
                    onClick={() => setViewMode(mode)}
                  >
                    {mode === "3d" ? "3D" : mode === "2d" ? "2D" : "Detailed"}
                  </button>
                ))}
              </div>
            </div>
            <div className="control-group">
              <label>Rotation Speed</label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={rotationSpeed}
                onChange={(e) => setRotationSpeed(parseFloat(e.target.value))}
                className="slider"
              />
              <span className="slider-value">{rotationSpeed.toFixed(1)}x</span>
            </div>
            <div className="control-buttons">
              <button
                className={`control-btn ${isRotating ? "active" : ""}`}
                onClick={() => setIsRotating(!isRotating)}
              >
                {isRotating ? <Pause size={16} /> : <Play size={16} />}
                {isRotating ? "Pause" : "Play"}
              </button>
              <button
                className="control-btn"
                onClick={() => {
                  rotationRef.current = 0;
                  tiltRef.current = DEFAULT_TILT;
                }}
              >
                <RotateCcw size={16} />
                Reset
              </button>
            </div>
          </div>

          <div className="arch-components-list">
            <h3>System Components</h3>
            <div className="components-grid">
              {components.map((comp) => (
                <button
                  key={comp.id}
                  className={`component-item ${
                    selectedComponent === comp.id ? "active" : ""
                  }`}
                  onClick={() => setSelectedComponent(comp.id)}
                  style={{
                    borderLeftColor: comp.color,
                  }}
                >
                  <comp.icon size={16} style={{ color: comp.color }} />
                  <div className="comp-info">
                    <strong>{comp.name}</strong>
                    <span>{comp.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="arch-main">
          <div className="visualization-area">
            <canvas ref={canvasRef} className="architecture-canvas" />
            <div className="canvas-overlay">
              <div className="canvas-label">{canvasLabel}</div>
              <div className="canvas-hint">Click components to view details</div>
            </div>
          </div>

          {currentComponent && (
            <div className="component-details">
              <div className="details-header">
                <div className="details-title">
                  <currentComponent.icon
                    size={24}
                    style={{ color: currentComponent.color }}
                  />
                  <div>
                    <h2>{currentComponent.name}</h2>
                    <p>{currentComponent.description}</p>
                  </div>
                </div>
                <button
                  className="close-btn"
                  onClick={() => setSelectedComponent(null)}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="details-content">
                <div className="detail-section">
                  <h4>Overview</h4>
                  <p>{currentComponent.details}</p>
                </div>

                {currentComponent.dependencies.length > 0 && (
                  <div className="detail-section">
                    <h4>Dependencies</h4>
                    <div className="dependencies">
                      {currentComponent.dependencies.map((dep) => {
                        const depComp = components.find((c) => c.id === dep);
                        return (
                          <button
                            key={dep}
                            className="dependency-btn"
                            onClick={() => setSelectedComponent(dep)}
                            style={{
                              borderColor: depComp?.color,
                            }}
                          >
                            <span
                              style={{
                                background: depComp?.color,
                              }}
                            />
                            {depComp?.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="detail-section">
                  <h4>Data Flows</h4>
                  <div className="flows">
                    {dataFlows
                      .filter(
                        (f) =>
                          f.from === currentComponent.id ||
                          f.to === currentComponent.id
                      )
                      .map((flow, idx) => (
                        <div key={idx} className="flow-item">
                          <div className="flow-from">
                            {flow.from === currentComponent.id ? (
                              <>
                                <strong>{currentComponent.name}</strong>
                                <span>→</span>
                              </>
                            ) : (
                              <>
                                <strong>
                                  {
                                    components.find((c) => c.id === flow.from)
                                      ?.name
                                  }
                                </strong>
                                <span>→</span>
                              </>
                            )}
                          </div>
                          <div
                            className="flow-label"
                            style={{ color: flow.color }}
                          >
                            {flow.label}
                          </div>
                          <div className="flow-to">
                            {flow.to === currentComponent.id ? (
                              <>
                                <span>→</span>
                                <strong>{currentComponent.name}</strong>
                              </>
                            ) : (
                              <>
                                <span>→</span>
                                <strong>
                                  {
                                    components.find((c) => c.id === flow.to)
                                      ?.name
                                  }
                                </strong>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="arch-features">
            <h3>Key Features</h3>
            <div className="features-grid">
              <div className="feature-card">
                <Zap size={20} />
                <h4>Async Job Queue</h4>
                <p>BullMQ-based distributed processing with retry logic</p>
              </div>
              <div className="feature-card">
                <Shield size={20} />
                <h4>Human Approvals</h4>
                <p>Policy-based approval workflows for sensitive operations</p>
              </div>
              <div className="feature-card">
                <Database size={20} />
                <h4>Data Persistence</h4>
                <p>PostgreSQL for reliability, Redis for performance</p>
              </div>
              <div className="feature-card">
                <Cpu size={20} />
                <h4>LLM Integration</h4>
                <p>Support for OLLAMA and OmniRoute providers</p>
              </div>
              <div className="feature-card">
                <BarChart3 size={20} />
                <h4>Monitoring</h4>
                <p>Real-time execution traces and performance metrics</p>
              </div>
              <div className="feature-card">
                <GitBranch size={20} />
                <h4>Agent Versioning</h4>
                <p>Version control and A/B testing for agents</p>
              </div>
            </div>
          </div>

          <div className="deployment-section">
            <h3>Quick Deployment</h3>
            <div className="deployment-card">
              <h4>Docker Compose</h4>
              <p>Complete stack deployment in one command:</p>
              <div className="code-display">
                <code>docker compose up --build</code>
                <button
                  className="copy-btn"
                  onClick={() => copyToClipboard("docker compose up --build")}
                  title="Copy command"
                >
                  {copiedLink === "docker compose up --build" ? (
                    <Check size={14} />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      <style jsx>{`
        .architecture-page {
          min-height: 100vh;
          background: var(--bg);
          color: var(--text);
          display: flex;
          flex-direction: column;
        }

        .arch-header {
          background: linear-gradient(180deg, rgba(139, 92, 246, 0.08), transparent);
          border-bottom: 1px solid var(--line);
          position: sticky;
          top: 0;
          z-index: 20;
          padding: 16px 0;
        }

        .arch-header-content {
          max-width: 1600px;
          margin: 0 auto;
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 24px;
        }

        .arch-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
          color: inherit;
        }

        .arch-brand div {
          display: flex;
          flex-direction: column;
        }

        .arch-brand strong {
          font-size: 16px;
          letter-spacing: 0.05em;
        }

        .arch-brand span {
          font-size: 11px;
          color: var(--muted);
        }

        .arch-nav {
          display: flex;
          gap: 16px;
        }

        .arch-nav a {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--accent);
          text-decoration: none;
          font-size: 13px;
          transition: all 0.2s;
        }

        .arch-nav a:hover {
          color: var(--accent2);
        }

        .architecture-container {
          display: grid;
          grid-template-columns: 320px 1fr;
          flex: 1;
          max-width: 1600px;
          margin: 0 auto;
          width: 100%;
          gap: 20px;
          padding: 20px;
        }

        .arch-sidebar {
          border: 1px solid var(--line);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.02);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          height: fit-content;
          position: sticky;
          top: 80px;
        }

        .arch-controls h3,
        .arch-components-list h3 {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--muted);
          margin: 0 0 14px;
        }

        .control-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 12px;
        }

        .control-group label {
          font-size: 11px;
          color: var(--muted);
        }

        .view-modes {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 4px;
          padding: 3px;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.02);
        }

        .view-mode-btn {
          border: 1px solid transparent;
          background: transparent;
          color: var(--muted);
          padding: 7px 4px;
          border-radius: 7px;
          cursor: pointer;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          transition: all 0.2s;
        }

        .view-mode-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text);
        }

        .view-mode-btn.active {
          background: rgba(139, 92, 246, 0.15);
          border-color: var(--accent);
          color: var(--accent);
        }

        .slider {
          width: 100%;
          cursor: pointer;
        }

        .slider-value {
          font-size: 12px;
          font-weight: 600;
          color: var(--accent);
        }

        .control-buttons {
          display: flex;
          gap: 8px;
        }

        .control-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.02);
          color: var(--muted);
          border-radius: 8px;
          cursor: pointer;
          font-size: 11px;
          transition: all 0.2s;
        }

        .control-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text);
        }

        .control-btn.active {
          background: rgba(139, 92, 246, 0.15);
          border-color: var(--accent);
          color: var(--accent);
        }

        .components-grid {
          display: grid;
          gap: 8px;
        }

        .component-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px;
          border: 1px solid var(--line);
          border-left: 3px solid transparent;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .component-item:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .component-item.active {
          background: rgba(139, 92, 246, 0.1);
          border-color: var(--accent);
        }

        .comp-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .comp-info strong {
          font-size: 11px;
          line-height: 1.3;
        }

        .comp-info span {
          font-size: 9px;
          color: var(--muted);
          line-height: 1.3;
        }

        .arch-main {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .visualization-area {
          position: relative;
          border: 1px solid var(--line);
          border-radius: 14px;
          overflow: hidden;
          background: #0a0d12;
          min-height: 600px;
        }

        .architecture-canvas {
          display: block;
          width: 100%;
          height: 600px;
          cursor: grab;
          touch-action: pan-y;
        }

        .canvas-overlay {
          position: absolute;
          top: 20px;
          right: 20px;
          text-align: right;
          pointer-events: none;
        }

        .canvas-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--accent);
          margin-bottom: 4px;
        }

        .canvas-hint {
          font-size: 10px;
          color: var(--muted);
        }

        .component-details {
          border: 1px solid var(--line);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.02);
          overflow: hidden;
        }

        .details-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 20px;
          border-bottom: 1px solid var(--line);
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.05), transparent);
        }

        .details-title {
          display: flex;
          align-items: flex-start;
          gap: 14px;
        }

        .details-title h2 {
          margin: 0 0 4px;
          font-size: 18px;
        }

        .details-title p {
          margin: 0;
          font-size: 12px;
          color: var(--muted);
        }

        .close-btn {
          border: 1px solid var(--line);
          background: transparent;
          color: var(--muted);
          border-radius: 6px;
          padding: 6px;
          cursor: pointer;
          display: grid;
          place-items: center;
          transition: all 0.2s;
        }

        .close-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text);
        }

        .details-content {
          padding: 20px;
          display: grid;
          gap: 20px;
          max-height: 400px;
          overflow-y: auto;
        }

        .detail-section {
          display: grid;
          gap: 10px;
        }

        .detail-section h4 {
          margin: 0;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--muted);
        }

        .detail-section p {
          margin: 0;
          font-size: 13px;
          line-height: 1.6;
          color: var(--text);
        }

        .dependencies,
        .flows {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .dependency-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border: 1px solid currentColor;
          background: transparent;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          color: inherit;
          transition: all 0.2s;
          text-align: left;
        }

        .dependency-btn:hover {
          background: currentColor;
          color: white;
        }

        .dependency-btn span {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .flow-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          padding: 8px;
          border: 1px solid var(--line);
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.01);
        }

        .flow-from,
        .flow-to {
          display: flex;
          align-items: center;
          gap: 4px;
          min-width: 0;
          flex: 1;
        }

        .flow-from strong,
        .flow-to strong {
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .flow-label {
          font-weight: 600;
          white-space: nowrap;
          font-size: 10px;
        }

        .arch-features {
          display: grid;
          gap: 16px;
        }

        .arch-features h3 {
          margin: 0;
          font-size: 16px;
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .feature-card {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 16px;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.02);
        }

        .feature-card svg {
          color: var(--accent);
        }

        .feature-card h4 {
          margin: 0;
          font-size: 13px;
        }

        .feature-card p {
          margin: 0;
          font-size: 11px;
          color: var(--muted);
          line-height: 1.5;
        }

        .deployment-section {
          display: grid;
          gap: 14px;
          padding: 20px;
          border: 1px solid var(--line);
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(52, 211, 153, 0.05), transparent);
        }

        .deployment-section h3 {
          margin: 0;
          font-size: 16px;
        }

        .deployment-card {
          display: grid;
          gap: 10px;
        }

        .deployment-card h4 {
          margin: 0;
          font-size: 13px;
          color: var(--good);
        }

        .deployment-card p {
          margin: 0;
          font-size: 12px;
          color: var(--muted);
        }

        .code-display {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px;
          background: #0a0d12;
          border: 1px solid var(--line);
          border-radius: 8px;
          font-family: "Fira Code", monospace;
        }

        .code-display code {
          flex: 1;
          font-size: 12px;
          color: #a8b5c7;
          overflow: auto;
        }

        .copy-btn {
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.02);
          color: var(--muted);
          border-radius: 6px;
          padding: 6px;
          cursor: pointer;
          display: grid;
          place-items: center;
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .copy-btn:hover {
          background: rgba(52, 211, 153, 0.1);
          color: var(--good);
          border-color: var(--good);
        }

        @media (max-width: 1200px) {
          .architecture-container {
            grid-template-columns: 1fr;
          }

          .arch-sidebar {
            position: static;
            height: auto;
          }

          .features-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .architecture-container {
            padding: 12px;
            gap: 12px;
          }

          .arch-header-content {
            padding: 0 16px;
          }

          .visualization-area {
            min-height: 400px;
          }

          .architecture-canvas {
            height: 400px;
          }

          .features-grid {
            grid-template-columns: 1fr;
          }

          .details-content {
            max-height: 300px;
          }
        }
      `}</style>
    </div>
  );
}
