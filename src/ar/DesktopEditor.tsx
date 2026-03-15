import { useRef, useState, useEffect, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  ContactShadows,
  Grid,
  Environment,
} from "@react-three/drei";
import {
  Box,
  Move,
  RotateCw,
  Maximize,
  Trash2,
  Monitor,
  Smartphone,
  LayoutGrid,
  Settings2,
  X,
  ScanLine,
  CheckCircle2,
  AlertCircle,
  Upload,
  Loader2,
} from "lucide-react";
import { MODEL_LIBRARY, BACKEND } from "./constants";
import { telemetrySync } from "./telemetry";
import type { ARModelInstance } from "./types";
import { RoomShell } from "../components/RoomShell";
import { EditableModel } from "../components/EditableModel";
import { UserIndicator } from "../components/UserIndicator";
import { PanoramaCapture } from "../components/PanoramaCapture";

const blobToDataURL = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

export function DesktopEditor() {
  const [models, setModels] = useState<ARModelInstance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  const undoStack = useRef<ARModelInstance[][]>([]);
  const redoStack = useRef<ARModelInstance[][]>([]);
  const modelsRef = useRef<ARModelInstance[]>([]);
  // Keep modelsRef in sync with React state so the keyboard handler (which
  // has an empty dep array and uses refs) always sees the latest snapshot.
  useEffect(() => {
    modelsRef.current = models;
  }, [models]);

  const commit = (next: ARModelInstance[]) => {
    undoStack.current.push([...modelsRef.current]);
    redoStack.current = [];
    modelsRef.current = next;
    setModels(next);
    localStorage.setItem("genai_ar_models", JSON.stringify(next));
  };
  const [mode, setMode] = useState<"translate" | "rotate" | "scale">(
    "translate",
  );
  const [remoteUser, setRemoteUser] = useState<{
    position: [number, number, number];
    rotation: [number, number, number];
  } | null>(null);
  const [motionPermission, setMotionPermission] = useState<
    "prompt" | "granted" | "denied"
  >("prompt");

  const requestMotion = async () => {
    if (
      typeof (DeviceOrientationEvent as any).requestPermission === "function"
    ) {
      try {
        const permission = await (
          DeviceOrientationEvent as any
        ).requestPermission();
        setMotionPermission(permission === "granted" ? "granted" : "denied");
      } catch (e) {
        console.error("Motion permission error:", e);
        setMotionPermission("denied");
      }
    } else {
      setMotionPermission("granted");
    }
  };

  // Ctrl+Z / Ctrl+Y undo-redo keyboard handler
  useEffect(() => {
    const apply = (next: ARModelInstance[]) => {
      modelsRef.current = next;
      setModels(next);
      localStorage.setItem("genai_ar_models", JSON.stringify(next));
    };
    const handleKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "z") {
        e.preventDefault();
        if (!undoStack.current.length) return;
        redoStack.current.push([...modelsRef.current]);
        apply(undoStack.current.pop()!);
      } else if (e.key === "y") {
        e.preventDefault();
        if (!redoStack.current.length) return;
        undoStack.current.push([...modelsRef.current]);
        apply(redoStack.current.pop()!);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Sync from LocalStorage & WebSockets
  useEffect(() => {
    // One-time load from localStorage on mount (restores state across page refreshes).
    // DesktopEditor is the source of truth — we do NOT poll localStorage after mount,
    // because that would overwrite in-memory state committed via commit().
    // The storage event only fires from other tabs, so it's safe to keep.
    const s = localStorage.getItem("genai_ar_models");
    if (s) {
      try {
        const parsed: ARModelInstance[] = JSON.parse(s);
        // Drop entries with missing or stale blob: URLs (blob: dies on page reload)
        const clean = parsed.filter(
          (m) => typeof m.url === "string" && m.url.length > 0 && !m.url.startsWith("blob:")
        );
        if (clean.length !== parsed.length) {
          localStorage.setItem("genai_ar_models", JSON.stringify(clean));
        }
        setModels(clean);
        modelsRef.current = clean;
      } catch {
        localStorage.removeItem("genai_ar_models");
      }
    }

    // Real-time Telemetry Sync via WebSocket
    const unsub = telemetrySync.subscribe((data) => {
      if (data.type === "telemetry_pos") {
        setRemoteUser({
          position: data.position, // Un-hardcoded so physical walking works
          rotation: data.rotation,
        });
      }
    });

    return () => {
      unsub();
    };
  }, []);

  const updateModel = (id: string, updates: Partial<ARModelInstance>) => {
    const u = models.map((m) => (m.id === id ? { ...m, ...updates } : m));
    commit(u);
  };

  const addModel = (item: (typeof MODEL_LIBRARY)[0]) => {
    const m: ARModelInstance = {
      id: Math.random().toString(36).substring(7),
      name: item.name,
      url: item.url,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1.5, 1.5, 1.5],
    };
    const u = [...models, m];
    commit(u);
    setSelectedId(m.id);
  };

  const deleteModel = (id: string) => {
    const u = models.filter((m) => m.id !== id);
    commit(u);
    setSelectedId(null);
  };

  const [customUploading, setCustomUploading] = useState(false);
  const [customError, setCustomError] = useState("");
  const customInputRef = useRef<HTMLInputElement>(null);

  const [agentPrompt, setAgentPrompt] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState("");

  const GENERATE_ENDPOINT = "https://6db3-142-1-46-35.ngrok-free.app/generate";
  const DESIGN_ROOM_ENDPOINT =
    "https://6db3-142-1-46-35.ngrok-free.app/design-room/agentic";

  const handleCustomFile = async (file: File) => {
    setCustomUploading(true);
    setCustomError("");
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(GENERATE_ENDPOINT, {
        method: "POST",
        headers: { "ngrok-skip-browser-warning": "true" },
        body: form,
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("model/gltf-binary") || ct.includes("octet-stream")) {
        const blob = await res.blob();
        const url = await blobToDataURL(blob);
        const m: ARModelInstance = {
          id: Math.random().toString(36).substring(7),
          name: file.name.replace(/\.[^.]+$/, "") || "Custom",
          url,
          position: [
            remoteUser?.position[0] ?? 0,
            0,
            remoteUser?.position[2] ?? 0,
          ],
          rotation: [0, 0, 0],
          scale: [1.5, 1.5, 1.5],
        };
        commit([...modelsRef.current, m]);
        setSelectedId(m.id);
      } else {
        setCustomError("Model queued — try again shortly.");
      }
    } catch (e: any) {
      setCustomError(e.message ?? "Upload failed");
    } finally {
      setCustomUploading(false);
    }
  };

  const handleDesignRoom = async () => {
    if (!agentPrompt.trim()) return;
    setAgentLoading(true);
    setAgentError("");
    try {
      const res = await fetch(DESIGN_ROOM_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ prompt: agentPrompt }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      const items: Array<{
        name: string;
        url: string;
        position_xyz: [number, number, number];
        rotation_y: number;
      }> = data.scene_graph ?? [];
      if (items.length === 0) throw new Error("No objects returned");
      const newModels: ARModelInstance[] = items.map((item) => ({
        id: Math.random().toString(36).substring(7),
        name: item.name,
        url: item.url,
        position: [
          item.position_xyz[0],
          item.position_xyz[1] ?? 0,
          item.position_xyz[2],
        ] as [number, number, number],
        rotation: [0, item.rotation_y ?? 0, 0] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number],
      }));
      commit([...modelsRef.current, ...newModels]);
    } catch (e: any) {
      setAgentError(
        e.message?.includes("fetch") || e.message?.includes("Failed")
          ? "Agent is busy optimizing. Please try again in a moment."
          : (e.message ??
              "Agent is busy optimizing. Please try again in a moment."),
      );
    } finally {
      setAgentLoading(false);
    }
  };

  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const [capturingRoom, setCapturingRoom] = useState(false);
  const [roomShellUrl, setRoomShellUrl] = useState<string | null>(null);
  const [roomStatus, setRoomStatus] = useState<"idle" | "uploading" | "error">(
    "idle",
  );
  const [roomError, setRoomError] = useState("");

  const handlePanoramaCapture = async (blob: Blob) => {
    setCapturingRoom(false);
    setRoomStatus("uploading");
    setRoomError("");
    try {
      const form = new FormData();
      // Use the same blob for panorama, ceiling and floor — backend has fallback logic
      form.append("panorama", blob, "panorama.jpg");
      form.append("ceiling", blob, "ceiling.jpg");
      form.append("floor", blob, "floor.jpg");

      const res = await fetch(`${BACKEND}/reconstruct-room`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? res.statusText);
      }
      const data = await res.json();
      const { reconstruction_id } = data;

      // Download the GLB
      const glbRes = await fetch(
        `${BACKEND}/reconstruct-room/${reconstruction_id}/shell.glb`,
      );
      if (!glbRes.ok)
        throw new Error(`GLB download failed: ${glbRes.statusText}`);
      const glbBlob = await glbRes.blob();

      const url = await blobToDataURL(glbBlob);
      setRoomShellUrl(url);
      setRoomStatus("idle");
    } catch (e: any) {
      setRoomError(e?.message ?? "Unknown error");
      setRoomStatus("error");
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#020617] text-slate-200 overflow-hidden font-sans relative">
      {/* Panorama capture overlay */}
      {capturingRoom && (
        <PanoramaCapture
          onCapture={handlePanoramaCapture}
          onCancel={() => setCapturingRoom(false)}
        />
      )}
      {/* User Indicator Legend & Telemetry (Moved to Root for max visibility) */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none md:top-24 md:left-4 md:-translate-x-0">
        <div
          className={`backdrop-blur-xl border px-4 py-2 rounded-xl flex items-center gap-3 shadow-xl transition-all pointer-events-auto justify-center ${remoteUser ? "bg-emerald-900/40 border-emerald-500/30" : "bg-slate-900/40 border-slate-700/30"}`}
        >
          <div
            className={`w-3 h-3 rounded-full animate-pulse shadow-[0_0_10px_rgba(0,0,0,0.5)] ${remoteUser ? "bg-emerald-500 shadow-emerald-500" : "bg-slate-500"}`}
          />
          <span
            className={`text-[12px] font-black uppercase tracking-widest ${remoteUser ? "text-emerald-200" : "text-slate-300"}`}
          >
            {remoteUser ? "Live Link Active" : "Telemetry Module"}
          </span>
        </div>
      </div>

      {/* Mobile Sidebar Toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className={`absolute top-40 left-6 z-[70] bg-indigo-600 p-4 rounded-2xl shadow-2xl border border-indigo-400/30 transition-all active:scale-90 ${sidebarOpen ? "opacity-0 pointer-events-none" : "opacity-100"}`}
      >
        <LayoutGrid className="w-6 h-6 text-white" />
      </button>

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 w-80 flex flex-col border-r border-slate-800 bg-[#020617] z-[60] transition-transform duration-300 transform ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:relative md:translate-x-0"}`}
      >
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl">
            <LayoutGrid className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none">AR Stage</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1 font-black">
              Editor
            </p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto text-slate-500 hover:text-white p-2 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Library */}
          <section>
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 px-2">
              Assets Library
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {MODEL_LIBRARY.map((item) => (
                <button
                  key={item.name}
                  onClick={() => addModel(item)}
                  className="flex flex-col items-center gap-2 p-4 bg-slate-900 hover:bg-slate-800 rounded-2xl border border-slate-800 transition-all hover:border-slate-700 active:scale-95 group"
                >
                  <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                    <Box className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-bold">{item.name}</span>
                </button>
              ))}
              {/* 4th slot: Custom image → 3D model */}
              <button
                onClick={() => customInputRef.current?.click()}
                disabled={customUploading}
                className="flex flex-col items-center gap-2 p-4 bg-slate-900 hover:bg-slate-800 rounded-2xl border border-indigo-500/40 transition-all hover:border-indigo-400 active:scale-95 group disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                  {customUploading ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Upload className="w-6 h-6" />
                  )}
                </div>
                <span className="text-xs font-bold">
                  {customUploading ? "Generating…" : "Custom"}
                </span>
              </button>
              <input
                ref={customInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCustomFile(file);
                  e.target.value = "";
                }}
              />
            </div>
            {customError && (
              <p className="mt-2 text-[10px] text-red-400 px-2">
                {customError}
              </p>
            )}
          </section>

          {/* Scene Tree */}
          <section>
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 px-2">
              Scene Tree
            </h2>
            <div className="space-y-1">
              {models.length === 0 && (
                <p className="text-xs text-slate-600 italic px-2">
                  No objects in scene
                </p>
              )}
              {models.map((m) => (
                <div
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${selectedId === m.id ? "bg-indigo-600/20 border border-indigo-500/50 text-white" : "hover:bg-slate-900 border border-transparent"}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${selectedId === m.id ? "bg-indigo-400" : "bg-slate-700"}`}
                    />
                    <span className="text-xs font-bold tracking-tight">
                      {m.name}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteModel(m.id);
                    }}
                    className="p-1 hover:text-red-400 text-slate-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Measure Walls */}
          <section>
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 px-2">
              Room
            </h2>
            <button
              onClick={() => {
                setRoomStatus("idle");
                setRoomError("");
                setCapturingRoom(true);
              }}
              disabled={roomStatus === "uploading"}
              className="w-full flex items-center gap-3 p-4 bg-slate-900 hover:bg-slate-800 rounded-2xl border border-slate-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform flex-shrink-0">
                {roomStatus === "uploading" ? (
                  <ScanLine className="w-5 h-5 animate-pulse" />
                ) : roomShellUrl ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <ScanLine className="w-5 h-5" />
                )}
              </div>
              <div className="text-left">
                <span className="text-sm font-bold block">
                  {roomStatus === "uploading"
                    ? "Processing room…"
                    : roomShellUrl
                      ? "Re-measure Walls"
                      : "Measure Walls"}
                </span>
                <span className="text-[10px] text-slate-500">
                  {roomStatus === "uploading"
                    ? "Uploading panorama…"
                    : "Capture a 360° panorama"}
                </span>
              </div>
            </button>
            {roomStatus === "error" && (
              <div className="mt-2 flex items-start gap-2 text-red-400 text-xs p-3 bg-red-900/20 rounded-xl border border-red-800/50">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{roomError || "Reconstruction failed. Try again."}</span>
              </div>
            )}
            {roomShellUrl && roomStatus === "idle" && (
              <p className="mt-2 text-[10px] text-emerald-500 px-2">
                Room shell loaded in scene.
              </p>
            )}
          </section>
        </div>

        {/* Debug Info Box Removed */}

        <div className="p-4 border-t border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
            <Smartphone className="w-4 h-4" />
            <span>MOBILE SYNC ACTIVE</span>
          </div>
        </div>
        <button
          onClick={() => {
            if (confirm("Clear everything?")) {
              localStorage.clear();
              location.reload();
            }
          }}
          className="p-4 text-[9px] text-red-500/50 hover:text-red-500 font-bold uppercase tracking-[0.2em] text-center border-t border-slate-900"
        >
          Hard Reset Engine
        </button>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 relative flex flex-col bg-slate-950">
        {/* Toolbar */}
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 p-1.5 rounded-2xl flex gap-1 shadow-2xl">
          <button
            onClick={() => setMode("translate")}
            className={`p-3 rounded-xl transition-all ${mode === "translate" ? "bg-indigo-600 text-white shadow-lg" : "hover:bg-slate-800 text-slate-400"}`}
          >
            <Move className="w-5 h-5" />
          </button>
          <button
            onClick={() => setMode("rotate")}
            className={`p-3 rounded-xl transition-all ${mode === "rotate" ? "bg-indigo-600 text-white shadow-lg" : "hover:bg-slate-800 text-slate-400"}`}
          >
            <RotateCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setMode("scale")}
            className={`p-3 rounded-xl transition-all ${mode === "scale" ? "bg-indigo-600 text-white shadow-lg" : "hover:bg-slate-800 text-slate-400"}`}
          >
            <Maximize className="w-5 h-5" />
          </button>
        </div>

        {/* Perspective Toggle */}
        <div className="absolute top-24 right-6 z-30 flex gap-2">
          <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 px-4 py-2 rounded-xl flex items-center gap-3 shadow-xl">
            <Monitor className="w-4 h-4 text-indigo-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Desktop Master
            </span>
          </div>
        </div>

        {/* 3D Canvas */}
        <Canvas
          key="editor-canvas"
          shadows
          camera={{ position: [5, 5, 5], fov: 45 }}
        >
          <color attach="background" args={["#020617"]} />
          <gridHelper
            args={[100, 100, "#334155", "#1e293b"]}
            position={[0, 0, 0]}
          />
          <Grid
            infiniteGrid
            fadeDistance={50}
            sectionSize={1}
            sectionColor="#475569"
            cellColor="#1e293b"
            sectionThickness={1.5}
          />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={1.5} castShadow />
          <Environment preset="city" />

          <OrbitControls makeDefault enabled={!isDragging} />

          <Suspense fallback={null}>
            {roomShellUrl && <RoomShell url={roomShellUrl} />}
            {models.map((m) => (
              <EditableModel
                key={m.id}
                model={m}
                isSelected={selectedId === m.id}
                onSelect={() => setSelectedId(m.id)}
                onUpdate={(updates) => updateModel(m.id, updates)}
                mode={mode}
                onDragStart={() => setIsDragging(true)}
                onDragEnd={() => setIsDragging(false)}
              />
            ))}
            <UserIndicator
              position={remoteUser?.position}
              rotation={remoteUser?.rotation} // Restored live rotation
              active={!!remoteUser}
            />
          </Suspense>

          <Grid
            infiniteGrid
            fadeDistance={20}
            sectionColor="#1e293b"
            cellColor="#0f172a"
          />
          <ContactShadows
            position={[0, -0.01, 0]}
            opacity={0.4}
            scale={20}
            blur={2}
            far={4.5}
          />
        </Canvas>

        {/* Agentic Room Designer floating panel */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 w-full max-w-md px-4">
          {/* Toast: loading */}
          {agentLoading && (
            <div className="bg-slate-800/90 backdrop-blur border border-indigo-500/40 text-white text-sm px-4 py-2 rounded-2xl flex items-center gap-2 shadow-xl">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              Loading Agent Assets...
            </div>
          )}
          {/* Toast: error */}
          {agentError && !agentLoading && (
            <div className="bg-red-900/80 backdrop-blur border border-red-500/40 text-red-200 text-xs px-4 py-2 rounded-2xl shadow-xl max-w-xs text-center">
              {agentError}
            </div>
          )}
          {/* Input + Button */}
          <div className="flex gap-2 w-full">
            <input
              type="text"
              value={agentPrompt}
              onChange={(e) => setAgentPrompt(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && !agentLoading && handleDesignRoom()
              }
              placeholder="Describe your room (e.g. cozy office with a desk and plant)…"
              disabled={agentLoading}
              className="flex-1 bg-slate-900/90 backdrop-blur border border-slate-700 text-white text-sm rounded-xl px-4 py-3 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            />
            <button
              onClick={handleDesignRoom}
              disabled={agentLoading || !agentPrompt.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm px-5 py-3 rounded-xl transition-all active:scale-95 whitespace-nowrap"
            >
              {agentLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Design Room"
              )}
            </button>
          </div>
        </div>

        {/* Selection HUD */}
        {selectedId && (
          <div className="absolute bottom-6 right-6 w-64 bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-2xl z-30 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                Transform
              </span>
              <Settings2 className="w-4 h-4 text-slate-600" />
            </div>
            {models.find((m) => m.id === selectedId) && (
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] text-slate-500 mb-1">Position</p>
                  <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                    <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                      X:{" "}
                      {models
                        .find((m) => m.id === selectedId)!
                        .position[0].toFixed(2)}
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                      Y:{" "}
                      {models
                        .find((m) => m.id === selectedId)!
                        .position[1].toFixed(2)}
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                      Z:{" "}
                      {models
                        .find((m) => m.id === selectedId)!
                        .position[2].toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
