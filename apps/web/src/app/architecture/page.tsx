"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Layers3, Database, Cpu, Zap, GitBranch, Shield, BarChart3, 
  Home, ChevronDown, X, Copy, Check, ExternalLink, Settings,
  Play, Pause, RotateCcw
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import icon from "../icon.png";

interface Component {
  id: string;
  name: string;
  icon: typeof Database;
  color: string;
  description: string;
  position: [number, number, number];
  size: [number, number, number];
  dependencies: string[];
  details: string;
}

const components: Component[] = [
  {
    id: "web",
    name: "Web Dashboard",
    icon: GitBranch,
    color: "#22d3ee",
    description: "Next.js 15 SPA for agent management and monitoring",
    position: [-3, 2, 0],
    size: [1.8, 1.2, 0.4],
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
    size: [1.8, 1.2, 0.4],
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
    size: [1.8, 1.2, 0.4],
    dependencies: ["redis", "postgres"],
    details: "Distributed job processing with retry logic, timeouts, and failure handling",
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    icon: Database,
    color: "#34d399",
    description: "Primary data persistence layer",
    position: [-3, -1, 0],
    size: [1.6, 1.2, 0.4],
    dependencies: [],
    details: "Agent registry, runs, approvals, users, organizations, and audit logs",
  },
  {
    id: "redis",
    name: "Redis",
    icon: Zap,
    color: "#ef4444",
    description: "Job queue and caching layer",
    position: [0, -1, 0],
    size: [1.6, 1.2, 0.4],
    dependencies: [],
    details: "BullMQ jobs, sessions, real-time event streaming, and performance caching",
  },
  {
    id: "ollama",
    name: "OLLAMA LLM",
    icon: Cpu,
    color: "#a78bfa",
    description: "Local LLM inference engine",
    position: [3, -1, 0],
    size: [1.6, 1.2, 0.4],
    dependencies: [],
    details: "Local LLM provider with support for multiple models (qwen, llama, etc)",
  },
];

const dataFlows = [
  { from: "web", to: "api", label: "HTTP/REST", color: "#22d3ee" },
  { from: "api", to: "postgres", label: "Queries", color: "#34d399" },
  { from: "api", to: "redis", label: "Cache/Jobs", color: "#ef4444" },
  { from: "worker", to: "redis", label: "Dequeue", color: "#ef4444" },
  { from: "worker", to: "postgres", label: "Updates", color: "#34d399" },
  { from: "worker", to: "ollama", label: "Inference", color: "#a78bfa" },
];

export default function ArchitecturePage() {
  const [selectedComponent, setSelectedComponent] = useState<string | null>("api");
  const [isRotating, setIsRotating] = useState(true);
  const [rotationSpeed, setRotationSpeed] = useState(0.5);
  const [viewMode, setViewMode] = useState<"3d" | "2d" | "detailed">("3d");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // 3D Canvas Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const animate = () => {
      if (isRotating) {
        rotationRef.current += rotationSpeed * 0.01;
      }

      // Clear canvas
      ctx.fillStyle = "rgba(8, 10, 15, 0.9)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }
      for (let i = 0; i < canvas.height; i += 40) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
      }

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const scale = 60;

      // Draw connections
      dataFlows.forEach((flow) => {
        const fromComp = components.find((c) => c.id === flow.from);
        const toComp = components.find((c) => c.id === flow.to);
        if (!fromComp || !toComp) return;

        const fromX =
          centerX +
          (fromComp.position[0] * Math.cos(rotationRef.current) -
            fromComp.position[1] * Math.sin(rotationRef.current)) *
            scale;
        const fromY =
          centerY +
          (fromComp.position[0] * Math.sin(rotationRef.current) +
            fromComp.position[1] * Math.cos(rotationRef.current)) *
            scale;

        const toX =
          centerX +
          (toComp.position[0] * Math.cos(rotationRef.current) -
            toComp.position[1] * Math.sin(rotationRef.current)) *
            scale;
        const toY =
          centerY +
          (toComp.position[0] * Math.sin(rotationRef.current) +
            toComp.position[1] * Math.cos(rotationRef.current)) *
            scale;

        ctx.strokeStyle = flow.color + "40";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw label
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;
        ctx.fillStyle = flow.color;
        ctx.font = "10px inter";
        ctx.textAlign = "center";
        ctx.fillText(flow.label, midX, midY - 5);
      });

      // Draw components
      components.forEach((comp) => {
        const x =
          centerX +
          (comp.position[0] * Math.cos(rotationRef.current) -
            comp.position[1] * Math.sin(rotationRef.current)) *
            scale;
        const y =
          centerY +
          (comp.position[0] * Math.sin(rotationRef.current) +
            comp.position[1] * Math.cos(rotationRef.current)) *
            scale;

        const isSelected = selectedComponent === comp.id;
        const size = isSelected ? 50 : 40;

        // Draw shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.beginPath();
        ctx.ellipse(x + 2, y + 2, size, size * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Draw component box
        ctx.fillStyle = comp.color + (isSelected ? "cc" : "88");
        ctx.strokeStyle = comp.color;
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.fillRect(x - size, y - size * 0.6, size * 2, size * 1.2);
        ctx.strokeRect(x - size, y - size * 0.6, size * 2, size * 1.2);

        // Draw glow effect for selected
        if (isSelected) {
          ctx.strokeStyle = comp.color + "44";
          ctx.lineWidth = 1;
          for (let i = 1; i <= 3; i++) {
            ctx.globalAlpha = 0.3 / i;
            ctx.strokeRect(
              x - size - i * 3,
              y - size * 0.6 - i * 3,
              size * 2 + i * 6,
              size * 1.2 + i * 6
            );
          }
          ctx.globalAlpha = 1;
        }

        // Draw text
        ctx.fillStyle = "#fff";
        ctx.font = "bold 11px inter";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(comp.name, x, y);
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRotating, rotationSpeed, selectedComponent]);

  const currentComponent = components.find((c) => c.id === selectedComponent);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(text);
    setTimeout(() => setCopiedLink(null), 2000);
  };

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
            <a href="http://localhost:3001" target="_blank" rel="noopener noreferrer">
              <span>API Server</span>
            </a>
          </div>
        </div>
      </header>

      <div className="architecture-container">
        <aside className="arch-sidebar">
          <div className="arch-controls">
            <h3>3D View Controls</h3>
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
                onClick={() => (rotationRef.current = 0)}
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
            <canvas
              ref={canvasRef}
              className="architecture-canvas"
              width={1200}
              height={600}
            />
            <div className="canvas-overlay">
              <div className="canvas-label">Interactive 3D Architecture</div>
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
