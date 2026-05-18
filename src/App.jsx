import { useState, useRef, useEffect, useCallback } from "react";

async function streamClaude(messages, system, onChunk, signal) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": import.meta.env.VITE_ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      system,
      stream: true,
      messages,
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

const AGENTS = [
  { id: "architect", name: "Architect",   short: "ARCH", icon: "⬡", color: "#F59E0B", role: "Design the component structure, data flow, state management, and file layout. Be specific and technical." },
  { id: "coder",     name: "Coder",       short: "CODE", icon: "◈", color: "#10B981", role: "Write the core React logic: hooks, state, event handlers, data operations. Focus on implementation details." },
  { id: "ui",        name: "UI Designer", short: "UI",   icon: "◑", color: "#EC4899", role: "Design the complete UI: layout, color scheme, typography, spacing, responsive behavior. Be specific about values." },
  { id: "data",      name: "Data Layer",  short: "DATA", icon: "◎", color: "#3B82F6", role: "Design the data model, localStorage schema, state shape, and data transformation logic needed." },
  { id: "ux",        name: "UX",          short: "UX",   icon: "◇", color: "#8B5CF6", role: "Define user flows, interactions, feedback states (loading, empty, error, success), and edge cases." },
  { id: "qa",        name: "QA",          short: "QA",   icon: "◉", color: "#EF4444", role: "Identify potential bugs, missing features, and what must be included for a complete working app." },
];

const TABS = ["Build", "Swarm", "History"];

function fmt() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }

function Dot({ status }) {
  const c = status === "busy" ? "#F59E0B" : status === "done" ? "#10B981" : status === "error" ? "#EF4444" : "#222";
  return <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: c, boxShadow: status === "busy" ? `0 0 8px ${c}` : "none", transition: "all 0.3s" }} />;
}

function Tag({ agent, dim }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", background: agent.color + (dim ? "10" : "18"), border: `1px solid ${agent.color}${dim ? "22" : "44"}`, borderRadius: 3, fontSize: 10, color: dim ? agent.color + "88" : agent.color, fontFamily: "inherit", letterSpacing: "0.06em", fontWeight: 700 }}>
      {agent.icon} {agent.short}
    </span>
  );
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function Buffalo() {
  const [tab, setTab] = useState("Build");
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
  const [errorMsg, setErrorMsg] = useState("");
  const [lastSwarmResults, setLastSwarmResults] = useState(null);
  const [lastPromptUsed, setLastPromptUsed] = useState("");

  const buildRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (buildRef.current) buildRef.current.scrollTop = buildRef.current.scrollHeight;
  }, [buildOutput]);

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
Give your specialist analysis. Be concrete and detailed — your output feeds a builder that writes the actual code. No preamble, start immediately.`,
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
        `You are an expert React developer. Six specialists analyzed the app request below. Synthesize ALL their input into a single complete, production-ready React component.

SPECIALIST ANALYSIS:
${swarmContext}

RULES — follow exactly:
- Output ONLY raw code. No explanation. No markdown fences. No comments outside code.
- Single file complete App.jsx with default export: export default function App()
- Import only from "react" — no external libraries
- Use localStorage for persistence where needed
- All states handled: empty, loading, error, success
- Beautiful polished UI using inline styles (JS objects)
- Dark theme, mobile responsive
- Fully functional — not a skeleton, the real working app

Start immediately with: import { useState, useEffect, useRef, useCallback } from "react";`,
        (partial) => setBuildOutput(partial),
        ac.signal
      );

      setBuildOutput(final);
      setPhase("done");
      setBuildStreaming(false);

      setHistory(prev => [{
        id: Date.now(), prompt: userPrompt, code: final, ts: fmt(), swarm: swarmResults,
      }, ...prev].slice(0, 20));
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
    setTab("Swarm");
    const swarmResults = await runSwarm(text);
    await runBuilder(text, swarmResults);
    setTab("Build");
  };

  const handleRetry = async () => {
    if (!lastPromptUsed) return;
    // If swarm already completed, skip straight to builder
    if (lastSwarmResults && Object.keys(lastSwarmResults).length > 0) {
      await runBuilder(lastPromptUsed, lastSwarmResults);
    } else {
      // Full restart
      const swarmResults = await runSwarm(lastPromptUsed);
      await runBuilder(lastPromptUsed, swarmResults);
    }
    setTab("Build");
  };


    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleBuild(); }
  };

  const stop = () => { abortRef.current?.abort(); setPhase("idle"); setBuildStreaming(false); };

  const cleanCode = buildOutput.replace(/^```[a-z]*\n?/m, "").replace(/```\s*$/m, "").trim();
  const isBuilding = phase === "swarming" || phase === "building";

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const S = {
    root: { minHeight: "100vh", background: "#080808", fontFamily: "'JetBrains Mono', monospace", color: "#E5E5E5", display: "flex", flexDirection: "column" },
    header: { borderBottom: "1px solid #1A1A1A", background: "#0C0C0C", padding: "0 20px", display: "flex", alignItems: "center", gap: 12, height: 50, flexShrink: 0 },
    brand: { fontSize: 17, fontWeight: 700, letterSpacing: "0.14em", color: "#F59E0B" },
    sub: { fontSize: 9, color: "#4B5563", letterSpacing: "0.1em" },
    tabBar: { display: "flex", borderBottom: "1px solid #1A1A1A", background: "#0C0C0C", paddingLeft: 14, flexShrink: 0 },
    tab: (a) => ({ padding: "9px 18px", fontSize: 10, letterSpacing: "0.1em", color: a ? "#F59E0B" : "#4B5563", borderBottom: a ? "2px solid #F59E0B" : "2px solid transparent", cursor: "pointer", userSelect: "none" }),
    wrap: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
    outputArea: { flex: 1, overflowY: "auto", padding: 16, fontFamily: "inherit", fontSize: 11, lineHeight: 1.7, color: "#C4C4C4", whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#0A0A0A" },
    inputBar: { borderTop: "1px solid #1A1A1A", padding: "12px 16px", background: "#0C0C0C", flexShrink: 0 },
    promptRow: { display: "flex", gap: 8, marginBottom: 8 },
    textarea: { flex: 1, background: "#111", border: "1px solid #252525", borderRadius: 6, padding: "10px 12px", color: "#E5E5E5", fontSize: 13, fontFamily: "inherit", resize: "none", outline: "none", lineHeight: 1.5, minHeight: 44, maxHeight: 120 },
    buildBtn: (ok) => ({ background: ok ? "#F59E0B" : "#1A1A1A", color: ok ? "#080808" : "#333", border: "none", borderRadius: 6, padding: "10px 22px", cursor: ok ? "pointer" : "default", fontSize: 11, fontFamily: "inherit", fontWeight: 700, letterSpacing: "0.07em", flexShrink: 0, transition: "all 0.15s" }),
    stopBtn: { background: "#EF4444", color: "#fff", border: "none", borderRadius: 6, padding: "10px 16px", cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 700 },
    dlBtn: { background: "#10B981", color: "#080808", border: "none", borderRadius: 5, padding: "8px 16px", cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 700 },
    copyBtn: (done) => ({ background: done ? "#10B98122" : "#1F1F1F", color: done ? "#10B981" : "#9CA3AF", border: `1px solid ${done ? "#10B98144" : "#2A2A2A"}`, borderRadius: 5, padding: "8px 14px", cursor: "pointer", fontSize: 11, fontFamily: "inherit", transition: "all 0.2s" }),
    actionRow: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 },
    phaseBar: { display: "flex", gap: 10, alignItems: "center", marginBottom: 10, padding: "8px 12px", background: "#111", borderRadius: 6, border: "1px solid #1A1A1A" },
    panel: { flex: 1, overflowY: "auto", padding: "16px 20px" },
    swarmFeed: { flex: 1, overflowY: "auto", padding: "14px 16px" },
    grid: (f) => ({ display: "grid", gridTemplateColumns: f ? "1fr" : "repeat(3, 1fr)", gap: 8, marginBottom: 16 }),
    card: (agent, status) => ({ background: "#0E0E0E", border: `1px solid ${status === "busy" ? agent.color + "66" : status === "done" ? agent.color + "28" : "#1A1A1A"}`, borderRadius: 7, padding: "10px 12px", transition: "border-color 0.3s", position: "relative" }),
    cardHead: { display: "flex", alignItems: "center", gap: 7, marginBottom: 7 },
    cardBody: (e) => ({ fontSize: 11, color: "#C4C4C4", lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: e ? "none" : 110, overflow: "hidden", position: "relative" }),
    fade: { position: "absolute", bottom: 0, left: 0, right: 0, height: 36, background: "linear-gradient(transparent, #0E0E0E)", pointerEvents: "none" },
    cursor: { display: "inline-block", width: 7, height: 12, background: "#F59E0B", marginLeft: 2, animation: "blink 1s step-end infinite", verticalAlign: "text-bottom" },
    ghost: { background: "transparent", color: "#4B5563", border: "1px solid #1F1F1F", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 9, fontFamily: "inherit" },
    tag: (c = "#F59E0B", dim) => ({ display: "inline-block", fontSize: 9, padding: "2px 6px", background: c + (dim ? "10" : "18"), border: `1px solid ${c}${dim ? "22" : "33"}`, borderRadius: 3, color: dim ? c + "77" : c, marginRight: 4, letterSpacing: "0.06em", cursor: "pointer" }),
    histCard: { background: "#0E0E0E", border: "1px solid #1A1A1A", borderRadius: 7, padding: "12px 14px", marginBottom: 10 },
  };

  const renderBuild = () => (
    <div style={S.wrap}>
      <div style={S.outputArea} ref={buildRef}>
        {!buildOutput && !isBuilding && phase !== "error" && (
          <div style={{ textAlign: "center", color: "#2A2A2A", marginTop: 60, lineHeight: 2.4 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🦬</div>
            <div>Describe any app you want.</div>
            <div>6 agents analyze it simultaneously,</div>
            <div>then a builder synthesizes a complete deployable App.jsx.</div>
            <div style={{ marginTop: 16, fontSize: 10, color: "#1F1F1F" }}>
              ↓ Download → drop into Vite project → git push → live on Vercel
            </div>
            {!import.meta.env.VITE_ANTHROPIC_KEY && (
              <div style={{ marginTop: 20, color: "#EF4444", fontSize: 11 }}>⚠ VITE_ANTHROPIC_KEY not set</div>
            )}
          </div>
        )}
        {phase === "error" && (
          <div style={{ textAlign: "center", marginTop: 60, lineHeight: 2 }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>⚠</div>
            <div style={{ color: "#EF4444", fontSize: 13, marginBottom: 6 }}>{errorMsg}</div>
            <div style={{ color: "#4B5563", fontSize: 11, marginBottom: 24 }}>
              {lastSwarmResults ? "Swarm completed — will skip straight to Builder on retry." : "Will restart from the beginning."}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button style={{ ...S.dlBtn, background: "#F59E0B", padding: "10px 24px", fontSize: 12 }} onClick={handleRetry}>
                ↻ Retry {lastSwarmResults ? "Builder" : "from start"}
              </button>
              <button style={{ ...S.copyBtn(false), padding: "10px 18px", fontSize: 12 }} onClick={() => { setPhase("idle"); setErrorMsg(""); }}>
                Start over
              </button>
            </div>
          </div>
        )}

          <>
            <div style={{ color: "#4B5563", fontSize: 9, marginBottom: 8, letterSpacing: "0.1em" }}>
              {phase === "done" ? `✓ COMPLETE — ${cleanCode.split("\n").length} lines · ${Math.round(cleanCode.length / 1024)}KB` : "● BUILDING…"}
            </div>
            {buildOutput}
            {buildStreaming && <span style={S.cursor} />}
          </>
        )}
      </div>

      <div style={S.inputBar}>
        {phase === "done" && (
          <div style={S.actionRow}>
            <button style={S.dlBtn} onClick={() => downloadFile("App.jsx", cleanCode)}>↓ Download App.jsx</button>
            <button style={S.copyBtn(copied)} onClick={handleCopy}>{copied ? "✓ Copied" : "Copy code"}</button>
            <span style={{ fontSize: 9, color: "#3A3A3A" }}>Replace src/App.jsx → git push → Vercel redeploys</span>
          </div>
        )}
        {isBuilding && (
          <div style={S.phaseBar}>
            <Dot status={phase === "swarming" ? "busy" : "done"} />
            <span style={{ fontSize: 10, color: phase === "swarming" ? "#F59E0B" : "#10B981" }}>
              {phase === "swarming" ? "Swarm analyzing…" : "✓ Swarm done"}
            </span>
            <span style={{ color: "#222", fontSize: 12 }}>→</span>
            <Dot status={phase === "building" ? "busy" : "idle"} />
            <span style={{ fontSize: 10, color: phase === "building" ? "#F59E0B" : "#4B5563" }}>
              {phase === "building" ? "Builder writing your app…" : "Builder"}
            </span>
            <button style={{ ...S.stopBtn, marginLeft: "auto", padding: "4px 10px", fontSize: 10 }} onClick={stop}>■ Stop</button>
          </div>
        )}
        <div style={S.promptRow}>
          <textarea
            style={S.textarea}
            placeholder='e.g. "a personal budget tracker with charts and categories" — Enter to build'
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            disabled={isBuilding}
          />
          {isBuilding
            ? <button style={S.stopBtn} onClick={stop}>■ Stop</button>
            : <button style={S.buildBtn(!isBuilding && prompt.trim())} onClick={handleBuild} disabled={!prompt.trim()}>BUILD ▶</button>
          }
        </div>
        <div style={{ fontSize: 9, color: "#1F1F1F" }}>Swarm → Builder → App.jsx ready to deploy</div>
      </div>
    </div>
  );

  const renderSwarm = () => (
    <div style={S.wrap}>
      <div style={S.swarmFeed}>
        {!currentPrompt
          ? <div style={{ textAlign: "center", color: "#2A2A2A", fontSize: 12, marginTop: 60 }}>Swarm analysis appears here during a build.</div>
          : <>
            <div style={{ background: "#141414", border: "1px solid #222", borderRadius: 6, padding: "9px 14px", marginBottom: 10, fontSize: 12, color: "#E5E5E5", display: "flex", gap: 10 }}>
              <span style={{ color: "#4B5563", fontSize: 10, flexShrink: 0 }}>PROMPT</span>
              <span>{currentPrompt}</span>
            </div>
            <div style={{ display: "flex", gap: 5, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 9, color: "#3A3A3A" }}>FOCUS:</span>
              <span style={S.tag("#F59E0B", focusAgent !== null)} onClick={() => setFocusAgent(null)}>ALL</span>
              {AGENTS.map(a => (
                <span key={a.id} style={S.tag(a.color, focusAgent !== null && focusAgent !== a.id)}
                  onClick={() => setFocusAgent(focusAgent === a.id ? null : a.id)}>
                  {a.icon} {a.short}
                </span>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 9, color: "#3A3A3A" }}>
                {AGENTS.filter(a => swarmData[a.id]?.status === "done").length}/{AGENTS.length} done
              </span>
            </div>
            <div style={S.grid(focusAgent !== null)}>
              {AGENTS.filter(a => !focusAgent || a.id === focusAgent).map(agent => {
                const resp = swarmData[agent.id];
                const isExp = expanded[agent.id] || focusAgent === agent.id;
                const isLong = (resp?.content?.length || 0) > 260;
                return (
                  <div key={agent.id} style={S.card(agent, resp?.status || "idle")}>
                    <div style={S.cardHead}>
                      <span style={{ color: agent.color, fontSize: 13 }}>{agent.icon}</span>
                      <Tag agent={agent} />
                      <Dot status={resp?.status || "idle"} />
                      {resp?.status === "busy" && <span style={{ fontSize: 9, color: agent.color }}>live</span>}
                      {resp?.status === "done" && <span style={{ fontSize: 9, color: "#3A3A3A", marginLeft: "auto" }}>{resp.content.split(" ").length}w</span>}
                    </div>
                    <div style={S.cardBody(isExp)}>
                      {resp?.content || <span style={{ color: "#222" }}>waiting…</span>}
                      {resp?.status === "busy" && resp?.content && <span style={S.cursor} />}
                      {!isExp && isLong && <div style={S.fade} />}
                    </div>
                    {isLong && focusAgent !== agent.id && (
                      <button style={{ ...S.ghost, marginTop: 6 }}
                        onClick={() => setExpanded(p => ({ ...p, [agent.id]: !p[agent.id] }))}>
                        {isExp ? "▲ collapse" : "▼ expand"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {(phase === "building" || phase === "done") && buildOutput && (
              <div style={{ background: "#0A0A0A", border: "1px solid #1A1A1A", borderRadius: 7, padding: "12px 14px" }}>
                <div style={{ fontSize: 9, color: "#F59E0B", letterSpacing: "0.1em", marginBottom: 8 }}>
                  {phase === "done" ? "✓ BUILDER COMPLETE" : "● BUILDER WRITING APP…"}
                </div>
                <div style={{ fontSize: 10, color: "#6B7280", lineHeight: 1.6, maxHeight: 80, overflow: "hidden" }}>
                  {buildOutput.slice(0, 300)}…
                </div>
                <button style={{ ...S.dlBtn, marginTop: 8, fontSize: 10, padding: "6px 12px" }} onClick={() => setTab("Build")}>
                  View full output →
                </button>
              </div>
            )}
          </>
        }
      </div>
    </div>
  );

  const renderHistory = () => (
    <div style={S.panel}>
      {history.length === 0
        ? <div style={{ textAlign: "center", color: "#2A2A2A", fontSize: 12, marginTop: 60 }}>Your built apps appear here.</div>
        : history.map(h => {
          const clean = h.code.replace(/^```[a-z]*\n?/m, "").replace(/```\s*$/m, "").trim();
          return (
            <div key={h.id} style={S.histCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ fontSize: 12, color: "#E5E5E5", fontWeight: 700, flex: 1, marginRight: 10 }}>{h.prompt}</div>
                <span style={{ fontSize: 9, color: "#3A3A3A", flexShrink: 0 }}>{h.ts}</span>
              </div>
              <div style={{ fontSize: 10, color: "#4B5563", marginBottom: 10 }}>
                {clean.split("\n").length} lines · {Math.round(clean.length / 1024)}KB
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={S.dlBtn} onClick={() => downloadFile("App.jsx", clean)}>↓ Download</button>
                <button style={S.copyBtn(false)} onClick={() => navigator.clipboard.writeText(clean)}>Copy</button>
                <button style={S.copyBtn(false)} onClick={() => { setBuildOutput(h.code); setCurrentPrompt(h.prompt); setPhase("done"); setTab("Build"); }}>View</button>
              </div>
            </div>
          );
        })
      }
    </div>
  );

  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: #080808; }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 2px; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        textarea:focus { border-color: #F59E0B55 !important; outline: none; }
      `}</style>

      <div style={S.header}>
        <span style={{ fontSize: 20 }}>🦬</span>
        <div>
          <div style={S.brand}>BUFFALO</div>
          <div style={S.sub}>DESCRIBE → SWARM → BUILD → DEPLOY</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {phase === "swarming" && <><Dot status="busy" /><span style={{ fontSize: 9, color: "#F59E0B" }}>SWARMING</span></>}
          {phase === "building" && <><Dot status="busy" /><span style={{ fontSize: 9, color: "#F59E0B" }}>BUILDING</span></>}
          {phase === "done"     && <><Dot status="done" /><span style={{ fontSize: 9, color: "#10B981" }}>READY TO DEPLOY</span></>}
        </div>
      </div>

      <div style={S.tabBar}>
        {TABS.map(t => <div key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>{t.toUpperCase()}</div>)}
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {tab === "Build"   && renderBuild()}
        {tab === "Swarm"   && renderSwarm()}
        {tab === "History" && renderHistory()}
      </div>
    </div>
  );
}
