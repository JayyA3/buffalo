import { useState, useRef, useEffect, useCallback } from "react";

// ── API ──────────────────────────────────────────────────────────────────────
async function streamClaude(messages, system, onChunk, signal) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": import.meta.env.VITE_ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      system, stream: true, messages,
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of dec.decode(value).split("\n")) {
      if (line.startsWith("data: ")) {
        try {
          const d = JSON.parse(line.slice(6));
          if (d.type === "content_block_delta" && d.delta?.text) {
            full += d.delta.text;
            onChunk(full);
          }
        } catch {}
      }
    }
  }
  return full;
}

// ── Agents ───────────────────────────────────────────────────────────────────
const AGENTS = [
  { id: "architect", name: "Architect",   short: "ARCH", icon: "⬡", color: "#C84B31", bg: "#FFF3EE", role: "Design the component structure, data flow, state management, and file layout. Be specific and technical." },
  { id: "coder",     name: "Coder",       short: "CODE", icon: "◈", color: "#1B4332", bg: "#EDFAF3", role: "Write the core React logic: hooks, state, event handlers, data operations. Focus on implementation details." },
  { id: "ui",        name: "UI Designer", short: "UI",   icon: "◑", color: "#6B21A8", bg: "#F5F0FF", role: "Design the complete UI: layout, color scheme, typography, spacing, responsive behavior. Be specific about values." },
  { id: "data",      name: "Data Layer",  short: "DATA", icon: "◎", color: "#1E3A8A", bg: "#EFF4FF", role: "Design the data model, localStorage schema, state shape, and data transformation logic needed." },
  { id: "ux",        name: "UX",          short: "UX",   icon: "◇", color: "#92400E", bg: "#FFFBEB", role: "Define user flows, interactions, feedback states (loading, empty, error, success), and edge cases." },
  { id: "qa",        name: "QA",          short: "QA",   icon: "◉", color: "#9F1239", bg: "#FFF0F3", role: "Identify potential bugs, missing features, and what must be included for a complete working app." },
];

function fmt() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function fmtDate() {
  return new Date().toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}


function downloadFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "my-app";
}

function makeProjectFiles(appCode, projectName) {
  const pkg = JSON.stringify({
    name: projectName, version: "1.0.0",
    scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
    dependencies: { react: "^18.2.0", "react-dom": "^18.2.0" },
    devDependencies: { vite: "^5.0.0", "@vitejs/plugin-react": "^4.0.0" },
  }, null, 2);
  const viteConfig = `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nexport default defineConfig({ plugins: [react()] })\n`;
  const indexHtml = `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${projectName.replace(/\b\w/g, c => c.toUpperCase())}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n`;
  const mainJsx = `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App.jsx'\nReactDOM.createRoot(document.getElementById('root')).render(\n  <React.StrictMode><App /></React.StrictMode>\n)\n`;
  const gitignore = `node_modules\ndist\n.env\n.env.local\n.DS_Store\n`;
  const readme = `# ${projectName}\n\nBuilt with Buffalo 🦬\n\n## Run locally\n\`\`\`\nnpm install\nnpm run dev\n\`\`\`\n\n## Deploy to Vercel\n1. Push to GitHub\n2. Import on vercel.com — auto-detects Vite\n3. Deploy\n`;
  return { pkg, viteConfig, indexHtml, mainJsx, gitignore, readme };
}

async function downloadProjectZip(appCode, prompt) {
  const projectName = slugify(prompt);
  if (!window.JSZip) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const { pkg, viteConfig, indexHtml, mainJsx, gitignore, readme } = makeProjectFiles(appCode, projectName);
  const zip = new window.JSZip();
  const folder = zip.folder(projectName);
  folder.file("package.json", pkg);
  folder.file("vite.config.js", viteConfig);
  folder.file("index.html", indexHtml);
  folder.file(".gitignore", gitignore);
  folder.file("README.md", readme);
  const src = folder.folder("src");
  src.file("main.jsx", mainJsx);
  src.file("App.jsx", appCode);
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${projectName}.zip`; a.click();
  URL.revokeObjectURL(url);
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Buffalo() {
  const [tab, setTab] = useState("build");
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState("idle");
  const [swarmData, setSwarmData] = useState({});
  const [buildOutput, setBuildOutput] = useState("");
  const [buildStreaming, setBuildStreaming] = useState(false);
  const [history, setHistory] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [focusAgent, setFocusAgent] = useState(null);
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [zipping, setZipping] = useState(null); // null | "current" | historyId
  const [errorMsg, setErrorMsg] = useState("");
  const [lastSwarmResults, setLastSwarmResults] = useState(null);
  const [lastPromptUsed, setLastPromptUsed] = useState("");
  const [hoveredHistory, setHoveredHistory] = useState(null);
  const [mounted, setMounted] = useState(false);

  const buildRef = useRef(null);
  const abortRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    setMounted(true);
    // Load history from localStorage
    try {
      const saved = localStorage.getItem("buffalo_history");
      if (saved) setHistory(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    if (buildRef.current) buildRef.current.scrollTop = buildRef.current.scrollHeight;
  }, [buildOutput]);

  const saveHistory = (items) => {
    try { localStorage.setItem("buffalo_history", JSON.stringify(items)); } catch {}
  };

  const runSwarm = async (userPrompt) => {
    setPhase("swarming");
    setSwarmData({});
    setBuildOutput("");
    setFocusAgent(null);
    setCurrentPrompt(userPrompt);
    setErrorMsg("");
    setLastPromptUsed(userPrompt);

    const initData = {};
    AGENTS.forEach(a => { initData[a.id] = { content: "", status: "busy" }; });
    setSwarmData(initData);

    const ac = new AbortController();
    abortRef.current = ac;
    const results = {};

    await Promise.allSettled(AGENTS.map(agent =>
      streamClaude(
        [{ role: "user", content: userPrompt }],
        `You are the ${agent.name} specialist in a multi-agent app-building swarm. ${agent.role}
The user wants to build: "${userPrompt}"
Give your specialist analysis. Be concrete and detailed — your output feeds a builder that writes actual code. No preamble, start immediately.`,
        (partial) => setSwarmData(prev => ({ ...prev, [agent.id]: { content: partial, status: "busy" } })),
        ac.signal
      ).then(final => {
        results[agent.id] = final;
        setSwarmData(prev => ({ ...prev, [agent.id]: { content: final, status: "done" } }));
      }).catch(err => {
        if (err.name !== "AbortError")
          setSwarmData(prev => ({ ...prev, [agent.id]: { content: `Error: ${err.message}`, status: "error" } }));
      })
    ));

    setLastSwarmResults(results);
    return results;
  };

  const runBuilder = async (userPrompt, swarmResults) => {
    setPhase("building");
    setBuildStreaming(true);
    setBuildOutput("");

    const swarmContext = AGENTS.map(a =>
      `=== ${a.name.toUpperCase()} ===\n${swarmResults[a.id] || "(no output)"}`
    ).join("\n\n");

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const final = await streamClaude(
        [{ role: "user", content: `Build this app: ${userPrompt}` }],
        `You are an expert React developer. Six specialists analyzed the app request. Synthesize ALL their input into a single complete production-ready React component.

SPECIALIST ANALYSIS:
${swarmContext}

RULES — follow exactly:
- Output ONLY raw code. No explanation. No markdown fences. No comments outside code.
- Single file complete App.jsx with default export: export default function App()
- Import only from "react" — no external libraries
- Use localStorage for persistence where needed
- All states handled: empty, loading, error, success
- Beautiful polished UI using inline styles (JS objects)
- Dark theme preferred, mobile responsive
- Fully functional — not a skeleton, the real working app

Start immediately with: import { useState, useEffect, useRef, useCallback } from "react";`,
        (partial) => setBuildOutput(partial),
        ac.signal
      );

      setBuildOutput(final);
      setPhase("done");
      setBuildStreaming(false);

      const clean = final.replace(/^```[a-z]*\n?/m, "").replace(/```\s*$/m, "").trim();
      const newEntry = {
        id: Date.now(),
        prompt: userPrompt,
        code: final,
        clean,
        ts: fmtDate(),
        lines: clean.split("\n").length,
        kb: Math.round(clean.length / 1024),
      };
      setHistory(prev => {
        const next = [newEntry, ...prev].slice(0, 50);
        saveHistory(next);
        return next;
      });
    } catch (err) {
      if (err.name !== "AbortError") {
        const msg = err.message.includes("429")
          ? "Rate limited (429) — wait a moment then hit Retry."
          : err.message.includes("404")
          ? "Model not found (404) — check your API key."
          : `Build failed: ${err.message}`;
        setErrorMsg(msg);
        setPhase("error");
        setBuildOutput("");
      }
      setBuildStreaming(false);
    }
  };

  const handleBuild = async () => {
    const text = prompt.trim();
    if (!text || phase === "swarming" || phase === "building") return;
    setPrompt("");
    setTab("swarm");
    const swarmResults = await runSwarm(text);
    await runBuilder(text, swarmResults);
    setTab("build");
  };

  const handleRetry = async () => {
    if (!lastPromptUsed) return;
    setErrorMsg("");
    if (lastSwarmResults && Object.keys(lastSwarmResults).length > 0) {
      setTab("build");
      await runBuilder(lastPromptUsed, lastSwarmResults);
    } else {
      setTab("swarm");
      const swarmResults = await runSwarm(lastPromptUsed);
      await runBuilder(lastPromptUsed, swarmResults);
      setTab("build");
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleBuild(); }
  };

  const stop = () => { abortRef.current?.abort(); setPhase("idle"); setBuildStreaming(false); };

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const cleanCode = buildOutput.replace(/^```[a-z]*\n?/m, "").replace(/```\s*$/m, "").trim();
  const isBuilding = phase === "swarming" || phase === "building";
  const doneCount = AGENTS.filter(a => swarmData[a.id]?.status === "done").length;

  // ── CSS ───────────────────────────────────────────────────────────────────
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --cream: #FAF7F2;
      --cream2: #F2EDE4;
      --ink: #1A1208;
      --ink2: #4A3F2F;
      --ink3: #9A8F7F;
      --orange: #E05A2B;
      --orange-light: #FFF0EA;
      --indigo: #2D1B69;
      --indigo-light: #EEE9FF;
      --green: #1B4332;
      --green-light: #EDFAF3;
      --border: #E8E0D4;
      --shadow: 0 2px 12px rgba(26,18,8,0.08);
      --shadow-lg: 0 8px 40px rgba(26,18,8,0.12);
    }

    body { background: var(--cream); color: var(--ink); }

    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: var(--cream2); }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

    textarea:focus, input:focus { outline: none; }

    @keyframes pulse-ring {
      0% { box-shadow: 0 0 0 0 rgba(224,90,43,0.4); }
      70% { box-shadow: 0 0 0 10px rgba(224,90,43,0); }
      100% { box-shadow: 0 0 0 0 rgba(224,90,43,0); }
    }

    @keyframes slide-up {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    @keyframes fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

    @keyframes shimmer {
      0%   { background-position: -200% center; }
      100% { background-position: 200% center; }
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }

    .mounted { animation: fade-in 0.4s ease both; }

    .agent-card {
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .agent-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(26,18,8,0.1);
    }

    .tab-btn {
      transition: all 0.15s ease;
      position: relative;
    }
    .tab-btn::after {
      content: '';
      position: absolute;
      bottom: -1px; left: 0; right: 0;
      height: 2px;
      background: var(--orange);
      transform: scaleX(0);
      transition: transform 0.2s ease;
    }
    .tab-btn.active::after { transform: scaleX(1); }
    .tab-btn.active { color: var(--orange) !important; }

    .build-btn {
      transition: all 0.2s ease;
    }
    .build-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(224,90,43,0.35);
    }
    .build-btn:active:not(:disabled) {
      transform: translateY(0);
    }

    .history-row {
      transition: background 0.15s ease;
      cursor: pointer;
    }
    .history-row:hover { background: var(--cream2) !important; }

    .dl-btn {
      transition: all 0.15s ease;
    }
    .dl-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(27,67,50,0.25);
    }

    .agent-busy {
      animation: pulse-ring 2s infinite;
    }

    .code-output {
      animation: fade-in 0.3s ease;
    }

    .progress-fill {
      transition: width 0.6s ease;
    }
  `;

  // ── Layout ─────────────────────────────────────────────────────────────────
  return (
    <div className={mounted ? "mounted" : ""} style={{
      minHeight: "100vh", background: "var(--cream)",
      fontFamily: "'DM Sans', sans-serif",
      color: "var(--ink)", display: "flex", flexDirection: "column",
    }}>
      <style>{css}</style>

      {/* ── Header ── */}
      <header style={{
        background: "var(--ink)", color: "var(--cream)",
        padding: "0 32px", height: 60,
        display: "flex", alignItems: "center", gap: 20,
        flexShrink: 0, position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 26 }}>🦬</span>
          <span style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 22, fontWeight: 900, letterSpacing: "0.02em",
            color: "#FAF7F2",
          }}>Buffalo</span>
          <span style={{
            fontSize: 10, color: "#9A8F7F",
            fontFamily: "'DM Mono', monospace",
            letterSpacing: "0.1em", marginLeft: 4,
          }}>v3</span>
        </div>

        {/* Tab bar */}
        <nav style={{ display: "flex", gap: 2, marginLeft: 24 }}>
          {[
            { id: "build", label: "Build" },
            { id: "swarm", label: "Swarm" },
            { id: "history", label: `History ${history.length > 0 ? `(${history.length})` : ""}` },
          ].map(t => (
            <button key={t.id}
              className={`tab-btn${tab === t.id ? " active" : ""}`}
              onClick={() => setTab(t.id)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "8px 16px", fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                fontWeight: 500,
                color: tab === t.id ? "#FAF7F2" : "#6B5F4F",
              }}>
              {t.label}
            </button>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Status pill */}
        {phase !== "idle" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: phase === "done" ? "#1B4332" : phase === "error" ? "#9F1239" : "#E05A2B",
            color: "#FAF7F2", padding: "5px 14px", borderRadius: 20,
            fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: "0.08em",
            animation: isBuilding ? "fade-in 0.3s ease" : "none",
          }}>
            {isBuilding && (
              <span style={{
                display: "inline-block", width: 8, height: 8,
                border: "2px solid rgba(255,255,255,0.4)",
                borderTopColor: "#FAF7F2",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }} />
            )}
            {phase === "swarming" ? `Swarming ${doneCount}/6` :
             phase === "building" ? "Building…" :
             phase === "done" ? "✓ Ready" :
             phase === "error" ? "Error" : ""}
          </div>
        )}
      </header>

      {/* ── Main ── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* ══ BUILD TAB ══ */}
        {tab === "build" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Output area */}
            <div ref={buildRef} style={{
              flex: 1, overflowY: "auto", padding: "32px",
              background: phase === "done" ? "var(--cream)" : "var(--cream)",
            }}>
              {/* Idle state */}
              {phase === "idle" && !buildOutput && (
                <div style={{ maxWidth: 640, margin: "60px auto", animation: "slide-up 0.5s ease" }}>
                  <h1 style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: 48, fontWeight: 900, lineHeight: 1.1,
                    color: "var(--ink)", marginBottom: 16,
                  }}>
                    Describe it.<br />
                    <span style={{ color: "var(--orange)" }}>We'll build it.</span>
                  </h1>
                  <p style={{ fontSize: 16, color: "var(--ink2)", lineHeight: 1.7, marginBottom: 40 }}>
                    Six specialist agents analyze your request simultaneously,
                    then a builder synthesizes a complete deployable React app — ready to drop into Vercel.
                  </p>

                  {/* Agent pills */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 48 }}>
                    {AGENTS.map(a => (
                      <span key={a.id} style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "6px 12px",
                        background: a.bg, color: a.color,
                        border: `1px solid ${a.color}30`,
                        borderRadius: 20, fontSize: 12,
                        fontWeight: 600, fontFamily: "'DM Mono', monospace",
                      }}>
                        {a.icon} {a.name}
                      </span>
                    ))}
                  </div>

                  {/* Example prompts */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: "var(--ink3)", letterSpacing: "0.1em", fontFamily: "'DM Mono', monospace", marginBottom: 10 }}>TRY THESE</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[
                        "A habit tracker with streaks and a calendar heatmap",
                        "A personal budget tracker with charts and categories",
                        "A Pomodoro timer with task list and session history",
                        "A recipe book with search, tags, and favorites",
                      ].map(ex => (
                        <button key={ex} onClick={() => setPrompt(ex)}
                          style={{
                            background: "white", border: "1px solid var(--border)",
                            borderRadius: 8, padding: "10px 14px",
                            textAlign: "left", cursor: "pointer",
                            fontSize: 13, color: "var(--ink2)",
                            fontFamily: "'DM Sans', sans-serif",
                            transition: "all 0.15s ease",
                          }}
                          onMouseEnter={e => { e.target.style.borderColor = "var(--orange)"; e.target.style.color = "var(--ink)"; }}
                          onMouseLeave={e => { e.target.style.borderColor = "var(--border)"; e.target.style.color = "var(--ink2)"; }}>
                          → {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Error state */}
              {phase === "error" && (
                <div style={{ maxWidth: 520, margin: "80px auto", animation: "slide-up 0.4s ease", textAlign: "center" }}>
                  <div style={{ fontSize: 48, marginBottom: 20 }}>⚠️</div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, marginBottom: 12, color: "#9F1239" }}>
                    Build failed
                  </h2>
                  <p style={{ color: "var(--ink2)", fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>{errorMsg}</p>
                  {lastSwarmResults && (
                    <p style={{ fontSize: 12, color: "var(--ink3)", marginBottom: 24, fontFamily: "'DM Mono', monospace" }}>
                      ✓ Swarm analysis saved — retry skips straight to builder
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                    <button className="dl-btn" onClick={handleRetry} style={{
                      background: "var(--orange)", color: "white",
                      border: "none", borderRadius: 10, padding: "12px 28px",
                      fontSize: 14, fontWeight: 600, cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}>
                      ↻ Retry {lastSwarmResults ? "Builder" : "from start"}
                    </button>
                    <button onClick={() => { setPhase("idle"); setErrorMsg(""); }} style={{
                      background: "white", color: "var(--ink2)",
                      border: "1px solid var(--border)", borderRadius: 10, padding: "12px 24px",
                      fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                    }}>
                      Start over
                    </button>
                  </div>
                </div>
              )}

              {/* Building state - show progress */}
              {phase === "building" && !buildOutput && (
                <div style={{ maxWidth: 520, margin: "80px auto", animation: "fade-in 0.4s ease", textAlign: "center" }}>
                  <div style={{
                    width: 56, height: 56, border: "3px solid var(--cream2)",
                    borderTopColor: "var(--orange)",
                    borderRadius: "50%", animation: "spin 0.9s linear infinite",
                    margin: "0 auto 24px",
                  }} />
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, marginBottom: 12 }}>
                    Writing your app…
                  </h2>
                  <p style={{ color: "var(--ink3)", fontSize: 13 }}>Builder is synthesizing 6 specialist analyses</p>
                </div>
              )}

              {/* Code output */}
              {buildOutput && (
                <div className="code-output" style={{ maxWidth: 900, margin: "0 auto" }}>
                  {/* Header bar */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 12,
                    marginBottom: 16, flexWrap: "wrap",
                  }}>
                    {phase === "done" ? (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 8,
                        background: "var(--green-light)", color: "var(--green)",
                        padding: "6px 14px", borderRadius: 20,
                        fontSize: 12, fontWeight: 600,
                      }}>
                        ✓ Complete — {cleanCode.split("\n").length} lines · {Math.round(cleanCode.length / 1024)}KB
                      </div>
                    ) : (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 8,
                        background: "var(--orange-light)", color: "var(--orange)",
                        padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                      }}>
                        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--orange)", animation: "blink 1s step-end infinite" }} />
                        Building…
                      </div>
                    )}
                    {phase === "done" && (
                      <>
                        <button className="dl-btn"
                          disabled={zipping === "current"}
                          onClick={async () => {
                            setZipping("current");
                            try { await downloadProjectZip(cleanCode, currentPrompt); } finally { setZipping(null); }
                          }}
                          style={{
                            background: zipping === "current" ? "var(--green-light)" : "var(--green)",
                            color: zipping === "current" ? "var(--green)" : "white",
                            border: "none", borderRadius: 8, padding: "7px 16px",
                            fontSize: 12, fontWeight: 600, cursor: zipping === "current" ? "default" : "pointer",
                            fontFamily: "'DM Sans', sans-serif",
                          }}>
                          {zipping === "current" ? "⏳ Packaging…" : "↓ Download Project"}
                        </button>
                        <button onClick={handleCopy} style={{
                          background: copied ? "var(--green-light)" : "white",
                          color: copied ? "var(--green)" : "var(--ink2)",
                          border: `1px solid ${copied ? "var(--green)" : "var(--border)"}`,
                          borderRadius: 8, padding: "7px 14px",
                          fontSize: 12, cursor: "pointer",
                          fontFamily: "'DM Sans', sans-serif",
                          transition: "all 0.2s ease",
                        }}>
                          {copied ? "✓ Copied" : "Copy code"}
                        </button>
                        <span style={{ fontSize: 11, color: "var(--ink3)", fontFamily: "'DM Mono', monospace" }}>
                          Unzip → push to GitHub → deploy on Vercel
                        </span>
                      </>
                    )}
                  </div>

                  {/* Code block */}
                  <div style={{
                    background: "#1A1208", borderRadius: 12,
                    padding: "24px", overflow: "auto",
                    border: "1px solid #2A2010",
                    boxShadow: "var(--shadow-lg)",
                  }}>
                    <pre style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 12, lineHeight: 1.7,
                      color: "#D4C9B8", margin: 0,
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}>
                      {buildOutput}
                      {buildStreaming && <span style={{
                        display: "inline-block", width: 8, height: 14,
                        background: "var(--orange)", marginLeft: 2,
                        animation: "blink 1s step-end infinite",
                        verticalAlign: "text-bottom",
                      }} />}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* ── Input bar ── */}
            <div style={{
              borderTop: "1px solid var(--border)",
              background: "white", padding: "16px 32px",
              flexShrink: 0,
            }}>
              {/* Progress bar when building */}
              {isBuilding && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--ink3)", fontFamily: "'DM Mono', monospace" }}>
                      {phase === "swarming" ? `Swarm: ${doneCount}/6 agents done` : "Builder synthesizing…"}
                    </span>
                    <button onClick={stop} style={{
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 11, color: "#9F1239", fontFamily: "'DM Mono', monospace",
                    }}>■ Stop</button>
                  </div>
                  <div style={{ height: 3, background: "var(--cream2)", borderRadius: 2 }}>
                    <div className="progress-fill" style={{
                      height: "100%", borderRadius: 2,
                      background: "var(--orange)",
                      width: phase === "swarming"
                        ? `${(doneCount / 6) * 60}%`
                        : `${60 + (buildOutput.length / 40)}%`,
                      maxWidth: "95%",
                    }} />
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={handleKey}
                  disabled={isBuilding}
                  rows={1}
                  placeholder='Describe the app you want built… (Enter to build)'
                  style={{
                    flex: 1,
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 14, lineHeight: 1.5,
                    padding: "12px 16px",
                    background: "var(--cream)", border: "1.5px solid var(--border)",
                    borderRadius: 10, color: "var(--ink)",
                    resize: "none", minHeight: 48, maxHeight: 120,
                    transition: "border-color 0.15s ease",
                  }}
                  onFocus={e => e.target.style.borderColor = "var(--orange)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                />
                <button
                  className="build-btn"
                  onClick={handleBuild}
                  disabled={isBuilding || !prompt.trim()}
                  style={{
                    background: isBuilding || !prompt.trim() ? "var(--cream2)" : "var(--orange)",
                    color: isBuilding || !prompt.trim() ? "var(--ink3)" : "white",
                    border: "none", borderRadius: 10,
                    padding: "12px 28px", fontSize: 14,
                    fontWeight: 700, cursor: isBuilding || !prompt.trim() ? "default" : "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    whiteSpace: "nowrap",
                    transition: "all 0.2s ease",
                  }}>
                  {isBuilding ? "Building…" : "Build ▶"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ SWARM TAB ══ */}
        {tab === "swarm" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
            {!currentPrompt ? (
              <div style={{ textAlign: "center", color: "var(--ink3)", marginTop: 80, fontSize: 14 }}>
                Swarm analysis appears here during a build.
              </div>
            ) : (
              <>
                {/* Prompt banner */}
                <div style={{
                  background: "var(--indigo)", color: "white",
                  borderRadius: 12, padding: "14px 20px",
                  marginBottom: 20, fontSize: 14, lineHeight: 1.5,
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  <div style={{ fontSize: 10, color: "#A89FD0", fontFamily: "'DM Mono', monospace", marginBottom: 4, letterSpacing: "0.1em" }}>BUILDING</div>
                  {currentPrompt}
                </div>

                {/* Focus filters */}
                <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--ink3)", fontFamily: "'DM Mono', monospace" }}>FOCUS:</span>
                  <button onClick={() => setFocusAgent(null)} style={{
                    background: focusAgent === null ? "var(--orange)" : "white",
                    color: focusAgent === null ? "white" : "var(--ink2)",
                    border: `1px solid ${focusAgent === null ? "var(--orange)" : "var(--border)"}`,
                    borderRadius: 20, padding: "3px 12px", fontSize: 11,
                    cursor: "pointer", fontFamily: "'DM Mono', monospace",
                    transition: "all 0.15s",
                  }}>ALL</button>
                  {AGENTS.map(a => (
                    <button key={a.id} onClick={() => setFocusAgent(focusAgent === a.id ? null : a.id)} style={{
                      background: focusAgent === a.id ? a.color : a.bg,
                      color: focusAgent === a.id ? "white" : a.color,
                      border: `1px solid ${a.color}40`,
                      borderRadius: 20, padding: "3px 12px", fontSize: 11,
                      cursor: "pointer", fontFamily: "'DM Mono', monospace",
                      transition: "all 0.15s",
                    }}>
                      {a.icon} {a.short}
                    </button>
                  ))}
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink3)", fontFamily: "'DM Mono', monospace" }}>
                    {doneCount}/{AGENTS.length} done
                  </span>
                </div>

                {/* Agent grid */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: focusAgent ? "1fr" : "repeat(3, 1fr)",
                  gap: 12,
                }}>
                  {AGENTS.filter(a => !focusAgent || a.id === focusAgent).map(agent => {
                    const resp = swarmData[agent.id];
                    const isExp = expanded[agent.id] || focusAgent === agent.id;
                    const isLong = (resp?.content?.length || 0) > 300;
                    const status = resp?.status || "idle";

                    return (
                      <div key={agent.id} className="agent-card" style={{
                        background: "white",
                        border: `1.5px solid ${status === "busy" ? agent.color : status === "done" ? agent.color + "40" : "var(--border)"}`,
                        borderRadius: 12, padding: "14px 16px",
                        animation: status === "done" ? "slide-up 0.3s ease" : "none",
                      }}>
                        {/* Card header */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                          <span style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: agent.bg, color: agent.color,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 16, flexShrink: 0,
                            ...(status === "busy" ? { animation: "pulse-ring 2s infinite" } : {}),
                          }}>{agent.icon}</span>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>{agent.name}</div>
                            <div style={{ fontSize: 10, color: "var(--ink3)", fontFamily: "'DM Mono', monospace" }}>
                              {status === "busy" ? "streaming…" : status === "done" ? `${resp.content.split(" ").length} words` : "waiting"}
                            </div>
                          </div>
                          <div style={{ marginLeft: "auto" }}>
                            {status === "done" && <span style={{ color: agent.color, fontSize: 14 }}>✓</span>}
                            {status === "busy" && <span style={{
                              display: "inline-block", width: 12, height: 12,
                              border: `2px solid ${agent.color}30`,
                              borderTopColor: agent.color,
                              borderRadius: "50%", animation: "spin 0.8s linear infinite",
                            }} />}
                          </div>
                        </div>

                        {/* Card body */}
                        <div style={{
                          fontSize: 12, color: "var(--ink2)", lineHeight: 1.65,
                          fontFamily: "'DM Mono', monospace",
                          whiteSpace: "pre-wrap", wordBreak: "break-word",
                          maxHeight: isExp ? "none" : 100, overflow: "hidden",
                          position: "relative",
                        }}>
                          {resp?.content || <span style={{ color: "var(--ink3)" }}>—</span>}
                          {status === "busy" && resp?.content && <span style={{
                            display: "inline-block", width: 6, height: 11,
                            background: agent.color, marginLeft: 2,
                            animation: "blink 1s step-end infinite", verticalAlign: "text-bottom",
                          }} />}
                          {!isExp && isLong && (
                            <div style={{
                              position: "absolute", bottom: 0, left: 0, right: 0, height: 32,
                              background: "linear-gradient(transparent, white)",
                            }} />
                          )}
                        </div>

                        {isLong && focusAgent !== agent.id && (
                          <button onClick={() => setExpanded(p => ({ ...p, [agent.id]: !p[agent.id] }))}
                            style={{
                              background: "none", border: "none", cursor: "pointer",
                              fontSize: 11, color: agent.color, marginTop: 6,
                              fontFamily: "'DM Mono', monospace", padding: 0,
                            }}>
                            {isExp ? "▲ collapse" : "▼ expand"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Builder preview */}
                {(phase === "building" || phase === "done") && buildOutput && (
                  <div style={{
                    marginTop: 20, background: "var(--ink)", borderRadius: 12,
                    padding: "16px 20px", animation: "slide-up 0.3s ease",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontSize: 11, color: "var(--orange)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em" }}>
                        {phase === "done" ? "✓ BUILDER COMPLETE" : "● BUILDER WRITING…"}
                      </span>
                      <button onClick={() => setTab("build")} style={{
                        background: "var(--orange)", color: "white", border: "none",
                        borderRadius: 6, padding: "5px 12px", fontSize: 11,
                        cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                      }}>View full →</button>
                    </div>
                    <pre style={{
                      fontSize: 11, color: "#6B5F4F", fontFamily: "'DM Mono', monospace",
                      maxHeight: 80, overflow: "hidden", lineHeight: 1.5,
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}>{buildOutput.slice(0, 400)}</pre>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══ HISTORY TAB ══ */}
        {tab === "history" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
            {history.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--ink3)", marginTop: 80 }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
                <div style={{ fontSize: 14 }}>Your built apps will appear here.</div>
                <div style={{ fontSize: 12, marginTop: 8 }}>History is saved locally in your browser.</div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700 }}>
                    Build History
                  </h2>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--ink3)" }}>{history.length} builds</span>
                    <button onClick={() => { if (confirm("Clear all history?")) { setHistory([]); saveHistory([]); } }}
                      style={{
                        background: "none", border: "1px solid var(--border)",
                        borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                        fontSize: 11, color: "var(--ink3)", fontFamily: "'DM Sans', sans-serif",
                      }}>Clear all</button>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "white" }}>
                  {history.map((h, idx) => (
                    <div key={h.id}
                      className="history-row"
                      onMouseEnter={() => setHoveredHistory(h.id)}
                      onMouseLeave={() => setHoveredHistory(null)}
                      style={{
                        padding: "16px 20px",
                        borderBottom: idx < history.length - 1 ? "1px solid var(--border)" : "none",
                        background: hoveredHistory === h.id ? "var(--cream)" : "white",
                        transition: "background 0.15s",
                      }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        {/* Index */}
                        <div style={{
                          width: 28, height: 28, borderRadius: 6,
                          background: "var(--cream2)", color: "var(--ink3)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontFamily: "'DM Mono', monospace",
                          flexShrink: 0, marginTop: 2,
                        }}>#{idx + 1}</div>

                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 4, lineHeight: 1.4 }}>
                            {h.prompt}
                          </div>
                          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, color: "var(--ink3)", fontFamily: "'DM Mono', monospace" }}>{h.ts}</span>
                            <span style={{
                              fontSize: 10, padding: "2px 8px",
                              background: "var(--green-light)", color: "var(--green)",
                              borderRadius: 10, fontFamily: "'DM Mono', monospace",
                            }}>{h.lines} lines</span>
                            <span style={{
                              fontSize: 10, padding: "2px 8px",
                              background: "var(--indigo-light)", color: "var(--indigo)",
                              borderRadius: 10, fontFamily: "'DM Mono', monospace",
                            }}>{h.kb}KB</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                          <button className="dl-btn"
                            disabled={zipping === h.id}
                            onClick={async () => {
                              setZipping(h.id);
                              try { await downloadProjectZip(h.clean || h.code, h.prompt); } finally { setZipping(null); }
                            }}
                            style={{
                              background: zipping === h.id ? "var(--green-light)" : "var(--green)",
                              color: zipping === h.id ? "var(--green)" : "white",
                              border: "none", borderRadius: 7, padding: "6px 14px",
                              fontSize: 11, fontWeight: 700, cursor: zipping === h.id ? "default" : "pointer",
                              fontFamily: "'DM Sans', sans-serif",
                            }}>
                            {zipping === h.id ? "⏳ Packaging…" : "↓ Full Project"}
                          </button>
                          <button onClick={() => { downloadFile("App.jsx", h.clean || h.code); }} style={{
                            background: "white", color: "var(--ink2)",
                            border: "1px solid var(--border)", borderRadius: 7, padding: "6px 10px",
                            fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                          }}>App.jsx</button>
                          <button onClick={() => { navigator.clipboard.writeText(h.clean || h.code); }} style={{
                            background: "white", color: "var(--ink2)",
                            border: "1px solid var(--border)", borderRadius: 7, padding: "6px 10px",
                            fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                          }}>Copy</button>
                          <button onClick={() => {
                            setBuildOutput(h.code);
                            setCurrentPrompt(h.prompt);
                            setPhase("done");
                            setTab("build");
                          }} style={{
                            background: "var(--indigo-light)", color: "var(--indigo)",
                            border: "1px solid var(--indigo)30", borderRadius: 7, padding: "6px 10px",
                            fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                          }}>View</button>
                          <button onClick={() => {
                            if (confirm("Remove this build from history?")) {
                              setHistory(prev => {
                                const next = prev.filter(x => x.id !== h.id);
                                saveHistory(next);
                                return next;
                              });
                            }
                          }} style={{
                            background: "none", color: "var(--ink3)",
                            border: "1px solid var(--border)", borderRadius: 7, padding: "6px 10px",
                            fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                          }}>✕</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
