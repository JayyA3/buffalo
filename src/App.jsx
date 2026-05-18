import { useState, useRef, useEffect, useCallback } from "react";

// ── Streaming API call per agent ────────────────────────────────────────────
async function callClaude(messages, systemPrompt, onChunk) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": import.meta.env.VITE_ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      system: systemPrompt,
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

// ── Agents ──────────────────────────────────────────────────────────────────
const AGENTS = [
  { id: "orchestrator", name: "Orchestrator", short: "ORCH", role: "Synthesizes inputs, routes tasks, coordinates the swarm", icon: "⬡", color: "#F59E0B" },
  { id: "coder",        name: "Coder",        short: "CODE", role: "Writes, reviews and refactors code with best practices",  icon: "◈", color: "#10B981" },
  { id: "researcher",  name: "Researcher",   short: "RSRC", role: "Gathers info, compares options, synthesizes findings",    icon: "◎", color: "#3B82F6" },
  { id: "tester",      name: "Tester",       short: "TEST", role: "Identifies edge cases, writes tests, finds bugs",         icon: "◇", color: "#8B5CF6" },
  { id: "security",    name: "Security",     short: "SEC",  role: "Audits for vulnerabilities, CVEs, and attack surfaces",   icon: "◉", color: "#EF4444" },
  { id: "docs",        name: "Docs Writer",  short: "DOCS", role: "Creates documentation, readmes, and API references",      icon: "◫", color: "#06B6D4" },
];

const TABS = ["Swarm", "Memory", "Goals", "Logs"];

const INITIAL_MEMORIES = [
  { id: 1, key: "project_context", value: "Multi-agent orchestration platform — personal workspace", ts: "just now", tags: ["context"] },
  { id: 2, key: "preferred_style", value: "Concise, actionable responses with code examples", ts: "just now", tags: ["style"] },
];

const SAMPLE_GOALS = [
  { id: 1, title: "Ship auth refactor with tests", status: "planning", progress: 20, steps: ["Analyze current auth code", "Write unit tests", "Refactor implementation", "Open PR"] },
  { id: 2, title: "Document REST API endpoints",   status: "idle",     progress: 0,  steps: ["Scan codebase", "Extract endpoints", "Generate OpenAPI spec", "Write markdown docs"] },
];

function formatTime(d = new Date()) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function StatusDot({ status }) {
  const col = status === "busy" ? "#F59E0B" : status === "done" ? "#10B981" : status === "error" ? "#EF4444" : "#2A2A2A";
  return (
    <span style={{
      display: "inline-block", width: 7, height: 7, borderRadius: "50%",
      background: col,
      boxShadow: status === "busy" ? `0 0 8px ${col}` : "none",
      transition: "all 0.3s",
    }} />
  );
}

function AgentTag({ agent }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px",
      background: agent.color + "18",
      border: `1px solid ${agent.color}44`,
      borderRadius: 3, fontSize: 10,
      color: agent.color,
      fontFamily: "inherit", letterSpacing: "0.06em", fontWeight: 700,
    }}>
      {agent.icon} {agent.short}
    </span>
  );
}

export default function Buffalo() {
  const [tab, setTab] = useState("Swarm");
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rounds, setRounds] = useState([]);
  const [memories, setMemories] = useState(INITIAL_MEMORIES);
  const [goals, setGoals] = useState(SAMPLE_GOALS);
  const [logs, setLogs] = useState([
    { ts: formatTime(), level: "INFO", msg: "Buffalo initialized — swarm mode active" },
    { ts: formatTime(), level: "INFO", msg: "6 agents registered — all respond in parallel" },
  ]);
  const [memInput, setMemInput] = useState({ key: "", value: "" });
  const [goalInput, setGoalInput] = useState("");
  const [expandedAgents, setExpandedAgents] = useState({});
  const [focusedAgent, setFocusedAgent] = useState(null);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const addLog = useCallback((level, msg) => {
    setLogs(prev => [...prev, { ts: formatTime(), level, msg }].slice(-300));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [rounds]);

  // Check API key on load
  useEffect(() => {
    if (!import.meta.env.VITE_ANTHROPIC_KEY) {
      addLog("ERROR", "VITE_ANTHROPIC_KEY not set — add it to .env or Vercel environment variables");
    } else {
      addLog("INFO", "API key loaded ✓");
    }
  }, []);

  const getSystemPrompt = (agent) => {
    const memCtx = memories.map(m => `${m.key}: ${m.value}`).join("\n");
    return `You are ${agent.name} in the Buffalo multi-agent swarm. Role: ${agent.role}.

Memory context:
${memCtx}

IMPORTANT: You are one of 6 agents all responding to the same prompt simultaneously. Stay strictly in your lane — only give your specialist perspective. Be direct, dense, and actionable. No preamble. No intro sentences. Start your answer immediately. Max 3-4 short paragraphs or a tight list. Other agents are covering their domains in parallel.`;
  };

  const submit = async () => {
    const text = input.trim();
    if (!text || submitting) return;

    if (!import.meta.env.VITE_ANTHROPIC_KEY) {
      addLog("ERROR", "No API key — set VITE_ANTHROPIC_KEY in .env file or Vercel dashboard");
      return;
    }

    setInput("");
    setSubmitting(true);
    setFocusedAgent(null);

    const roundId = Date.now();
    const initResponses = {};
    AGENTS.forEach(a => { initResponses[a.id] = { content: "", status: "busy", done: false }; });

    setRounds(prev => [...prev, { id: roundId, prompt: text, ts: formatTime(), responses: initResponses }]);
    addLog("INFO", `Swarm dispatch: "${text.slice(0, 60)}"`);

    if (text.toLowerCase().includes("remember") || text.toLowerCase().includes("note that")) {
      const m = { id: Date.now(), key: "user_note_" + Date.now(), value: text, ts: formatTime(), tags: ["auto"] };
      setMemories(prev => [...prev, m]);
      addLog("MEM", `Auto-stored: ${text.slice(0, 50)}`);
    }

    const history = [{ role: "user", content: text }];

    const promises = AGENTS.map(agent =>
      callClaude(history, getSystemPrompt(agent), (partial) => {
        setRounds(prev => prev.map(r => r.id !== roundId ? r : {
          ...r,
          responses: { ...r.responses, [agent.id]: { content: partial, status: "busy", done: false } },
        }));
      }).then(final => {
        setRounds(prev => prev.map(r => r.id !== roundId ? r : {
          ...r,
          responses: { ...r.responses, [agent.id]: { content: final, status: "done", done: true } },
        }));
        addLog("INFO", `[${agent.short}] done — ${final.split(" ").length} words`);
      }).catch(err => {
        setRounds(prev => prev.map(r => r.id !== roundId ? r : {
          ...r,
          responses: { ...r.responses, [agent.id]: { content: `Error: ${err.message}`, status: "error", done: true } },
        }));
        addLog("ERROR", `[${agent.short}] ${err.message}`);
      })
    );

    await Promise.allSettled(promises);
    setSubmitting(false);
    addLog("INFO", "Swarm round complete");
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const S = {
    root: {
      minHeight: "100vh", background: "#080808",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      color: "#E5E5E5", display: "flex", flexDirection: "column",
    },
    header: {
      borderBottom: "1px solid #1A1A1A", background: "#0C0C0C",
      padding: "0 20px", display: "flex", alignItems: "center", gap: 14, height: 50, flexShrink: 0,
    },
    brand: { fontSize: 17, fontWeight: 700, letterSpacing: "0.14em", color: "#F59E0B" },
    version: { fontSize: 9, color: "#4B5563", letterSpacing: "0.1em" },
    tabBar: { display: "flex", borderBottom: "1px solid #1A1A1A", background: "#0C0C0C", paddingLeft: 14, flexShrink: 0 },
    tab: (a) => ({
      padding: "9px 18px", fontSize: 10, letterSpacing: "0.1em",
      color: a ? "#F59E0B" : "#4B5563",
      borderBottom: a ? "2px solid #F59E0B" : "2px solid transparent",
      cursor: "pointer", userSelect: "none", transition: "color 0.1s",
    }),
    body: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
    swarmFeed: { flex: 1, overflowY: "auto", padding: "16px 16px 8px" },
    promptChip: {
      background: "#141414", border: "1px solid #222",
      borderRadius: 6, padding: "10px 14px", marginBottom: 10,
      fontSize: 13, color: "#E5E5E5", display: "flex", gap: 10, alignItems: "flex-start",
    },
    agentGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 },
    agentGridFocused: { display: "grid", gridTemplateColumns: "1fr", gap: 8, marginBottom: 20 },
    agentCard: (agent, status) => ({
      background: "#0E0E0E",
      border: `1px solid ${status === "busy" ? agent.color + "66" : status === "done" ? agent.color + "28" : "#1A1A1A"}`,
      borderRadius: 7, padding: "10px 12px", transition: "border-color 0.3s", position: "relative",
    }),
    cardHeader: { display: "flex", alignItems: "center", gap: 7, marginBottom: 7 },
    cardContent: (expanded) => ({
      fontSize: 12, color: "#C4C4C4", lineHeight: 1.65,
      whiteSpace: "pre-wrap", wordBreak: "break-word",
      maxHeight: expanded ? "none" : 120, overflow: "hidden", position: "relative",
    }),
    fadeOut: {
      position: "absolute", bottom: 0, left: 0, right: 0, height: 40,
      background: "linear-gradient(transparent, #0E0E0E)", pointerEvents: "none",
    },
    cursor: {
      display: "inline-block", width: 7, height: 12, background: "#F59E0B", marginLeft: 2,
      animation: "blink 1s step-end infinite", verticalAlign: "text-bottom",
    },
    inputBar: {
      borderTop: "1px solid #1A1A1A", padding: "10px 16px",
      display: "flex", gap: 8, alignItems: "flex-end",
      background: "#0C0C0C", flexShrink: 0,
    },
    textarea: {
      flex: 1, background: "#111", border: "1px solid #252525",
      borderRadius: 6, padding: "9px 12px", color: "#E5E5E5", fontSize: 13,
      fontFamily: "inherit", resize: "none", outline: "none", lineHeight: 1.5,
      minHeight: 42, maxHeight: 140, transition: "border-color 0.15s",
    },
    sendBtn: (ok) => ({
      background: ok ? "#F59E0B" : "#1A1A1A", color: ok ? "#080808" : "#3A3A3A",
      border: "none", borderRadius: 6, padding: "9px 20px",
      cursor: ok ? "pointer" : "default", fontSize: 11, fontFamily: "inherit",
      fontWeight: 700, letterSpacing: "0.07em", transition: "all 0.15s", flexShrink: 0,
    }),
    swarmStatus: {
      display: "flex", gap: 10, alignItems: "center",
      padding: "5px 16px", borderTop: "1px solid #0F0F0F",
      background: "#0A0A0A", flexShrink: 0,
    },
    panel: { flex: 1, overflowY: "auto", padding: "16px 20px" },
    card: { background: "#0E0E0E", border: "1px solid #1A1A1A", borderRadius: 7, padding: "12px 14px", marginBottom: 10 },
    cardTitle: { fontSize: 10, color: "#F59E0B", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 },
    inp: {
      background: "#080808", border: "1px solid #252525", borderRadius: 5,
      padding: "7px 10px", color: "#E5E5E5", fontSize: 12,
      fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box",
    },
    btn: {
      background: "#F59E0B", color: "#080808", border: "none",
      borderRadius: 5, padding: "7px 14px", cursor: "pointer",
      fontSize: 10, fontFamily: "inherit", fontWeight: 700, letterSpacing: "0.07em",
    },
    btnGhost: {
      background: "transparent", color: "#4B5563", border: "1px solid #1F1F1F",
      borderRadius: 4, padding: "4px 9px", cursor: "pointer", fontSize: 10, fontFamily: "inherit",
    },
    tag: (c = "#F59E0B") => ({
      display: "inline-block", fontSize: 9, padding: "2px 6px",
      background: c + "18", border: `1px solid ${c}33`,
      borderRadius: 3, color: c, marginRight: 4, letterSpacing: "0.06em", cursor: "pointer",
    }),
    progressBar: (pct, c = "#F59E0B") => ({
      height: 3, borderRadius: 2,
      background: `linear-gradient(90deg, ${c} ${pct}%, #1A1A1A ${pct}%)`, marginTop: 6,
    }),
    logLine: (lv) => ({
      fontSize: 10, padding: "3px 0", borderBottom: "1px solid #0D0D0D",
      color: lv === "ERROR" ? "#EF4444" : lv === "MEM" ? "#3B82F6" : lv === "GOAL" ? "#8B5CF6" : "#4B5563",
      display: "flex", gap: 10,
    }),
  };

  const renderSwarm = () => {
    const canSend = !submitting && input.trim() && !!import.meta.env.VITE_ANTHROPIC_KEY;
    return (
      <div style={S.body}>
        <div style={S.swarmFeed}>
          {rounds.length === 0 && (
            <div style={{ textAlign: "center", color: "#2A2A2A", fontSize: 12, marginTop: 60, lineHeight: 2.2 }}>
              <div style={{ fontSize: 36, marginBottom: 14 }}>🦬</div>
              <div>All 6 agents respond to every prompt simultaneously.</div>
              <div>Click an agent tag to focus. Expand cards to read in full.</div>
              {!import.meta.env.VITE_ANTHROPIC_KEY && (
                <div style={{ marginTop: 20, color: "#EF4444", fontSize: 11, lineHeight: 1.8 }}>
                  ⚠ No API key detected.<br />
                  Add VITE_ANTHROPIC_KEY to your .env file or Vercel environment variables.
                </div>
              )}
              <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                {AGENTS.map(a => <AgentTag key={a.id} agent={a} />)}
              </div>
            </div>
          )}

          {rounds.map(round => {
            const doneCount = AGENTS.filter(a => round.responses[a.id]?.done).length;
            const isFocused = focusedAgent !== null;
            return (
              <div key={round.id}>
                <div style={S.promptChip}>
                  <span style={{ color: "#4B5563", flexShrink: 0, fontSize: 10, marginTop: 1 }}>YOU</span>
                  <span>{round.prompt}</span>
                  <span style={{ marginLeft: "auto", color: "#2A2A2A", fontSize: 9, flexShrink: 0 }}>{round.ts}</span>
                </div>

                <div style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: "#3A3A3A" }}>FOCUS:</span>
                  <span style={S.tag(focusedAgent === null ? "#F59E0B" : "#3A3A3A")} onClick={() => setFocusedAgent(null)}>ALL</span>
                  {AGENTS.map(a => (
                    <span key={a.id} style={S.tag(focusedAgent === a.id ? a.color : "#3A3A3A")}
                      onClick={() => setFocusedAgent(focusedAgent === a.id ? null : a.id)}>
                      {a.icon} {a.short}
                    </span>
                  ))}
                  <span style={{ marginLeft: "auto", fontSize: 9, color: "#3A3A3A" }}>{doneCount}/{AGENTS.length} done</span>
                </div>

                <div style={isFocused ? S.agentGridFocused : S.agentGrid}>
                  {AGENTS.filter(a => !isFocused || a.id === focusedAgent).map(agent => {
                    const resp = round.responses[agent.id];
                    const expandKey = `${round.id}-${agent.id}`;
                    const isExpanded = expandedAgents[expandKey] || isFocused;
                    const isLong = (resp?.content?.length || 0) > 280;

                    return (
                      <div key={agent.id} style={S.agentCard(agent, resp?.status)}>
                        <div style={S.cardHeader}>
                          <span style={{ color: agent.color, fontSize: 13 }}>{agent.icon}</span>
                          <AgentTag agent={agent} />
                          <StatusDot status={resp?.status || "idle"} />
                          {resp?.status === "busy" && <span style={{ fontSize: 9, color: agent.color }}>live</span>}
                          {resp?.done && <span style={{ fontSize: 9, color: "#3A3A3A", marginLeft: "auto" }}>{resp.content.split(" ").length}w</span>}
                        </div>

                        <div style={S.cardContent(isExpanded)}>
                          {resp?.content || <span style={{ color: "#2A2A2A" }}>waiting…</span>}
                          {resp?.status === "busy" && resp?.content && <span style={S.cursor} />}
                          {!isExpanded && isLong && <div style={S.fadeOut} />}
                        </div>

                        {isLong && !isFocused && (
                          <button style={{ ...S.btnGhost, marginTop: 6, fontSize: 9, padding: "3px 8px" }}
                            onClick={() => setExpandedAgents(prev => ({ ...prev, [expandKey]: !prev[expandKey] }))}>
                            {isExpanded ? "▲ collapse" : "▼ expand"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div style={S.swarmStatus}>
          {AGENTS.map(a => {
            const lastRound = rounds[rounds.length - 1];
            const status = lastRound ? lastRound.responses[a.id]?.status : "idle";
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <StatusDot status={status || "idle"} />
                <span style={{ fontSize: 9, color: status === "done" ? a.color : status === "busy" ? a.color : "#2A2A2A" }}>{a.short}</span>
              </div>
            );
          })}
          <span style={{ marginLeft: "auto", fontSize: 9, color: "#2A2A2A" }}>
            {submitting ? "● swarm active" : `${rounds.length} round${rounds.length !== 1 ? "s" : ""}`}
          </span>
        </div>

        <div style={S.inputBar}>
          <textarea
            ref={inputRef}
            style={S.textarea}
            placeholder="All 6 agents will respond simultaneously… (Enter to send)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            disabled={submitting}
          />
          <button style={S.sendBtn(canSend)} onClick={submit} disabled={!canSend}>
            {submitting ? "RUNNING…" : "SWARM ▶"}
          </button>
        </div>
      </div>
    );
  };

  const renderMemory = () => (
    <div style={S.panel}>
      <div style={{ ...S.card, background: "#0A0A0A" }}>
        <div style={S.cardTitle}>ADD MEMORY</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...S.inp, flex: "0 0 140px" }} placeholder="key" value={memInput.key}
            onChange={e => setMemInput(p => ({ ...p, key: e.target.value }))} />
          <input style={S.inp} placeholder="value" value={memInput.value}
            onChange={e => setMemInput(p => ({ ...p, value: e.target.value }))} />
          <button style={S.btn} onClick={() => {
            if (!memInput.key || !memInput.value) return;
            setMemories(prev => [...prev, { id: Date.now(), key: memInput.key, value: memInput.value, ts: formatTime(), tags: ["manual"] }]);
            addLog("MEM", `Stored: ${memInput.key}`);
            setMemInput({ key: "", value: "" });
          }}>STORE</button>
        </div>
        <div style={{ fontSize: 9, color: "#3A3A3A", marginTop: 8 }}>Memory is injected into every agent's context on each swarm call.</div>
      </div>
      {memories.map(m => (
        <div key={m.id} style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "#F59E0B", fontWeight: 700 }}>{m.key}</span>
                {m.tags.map(t => <span key={t} style={S.tag()}>{t}</span>)}
                <span style={{ fontSize: 9, color: "#3A3A3A" }}>{m.ts}</span>
              </div>
              <div style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.5 }}>{m.value}</div>
            </div>
            <button style={S.btnGhost} onClick={() => { setMemories(prev => prev.filter(x => x.id !== m.id)); addLog("MEM", `Deleted: ${m.key}`); }}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );

  const renderGoals = () => (
    <div style={S.panel}>
      <div style={{ ...S.card, background: "#0A0A0A" }}>
        <div style={S.cardTitle}>NEW GOAL</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={S.inp} placeholder="Describe a goal in plain English…"
            value={goalInput} onChange={e => setGoalInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && goalInput.trim()) {
                setGoals(prev => [...prev, { id: Date.now(), title: goalInput.trim(), status: "planning", progress: 0, steps: ["Analyze requirements", "Plan execution", "Execute", "Verify"] }]);
                addLog("GOAL", goalInput); setGoalInput("");
              }
            }} />
          <button style={S.btn} onClick={() => {
            if (!goalInput.trim()) return;
            setGoals(prev => [...prev, { id: Date.now(), title: goalInput.trim(), status: "planning", progress: 0, steps: ["Analyze requirements", "Plan execution", "Execute", "Verify"] }]);
            addLog("GOAL", goalInput); setGoalInput("");
          }}>PLAN</button>
        </div>
      </div>
      {goals.map(g => {
        const sc = g.status === "complete" ? "#10B981" : g.status === "running" ? "#F59E0B" : g.status === "planning" ? "#3B82F6" : "#4B5563";
        return (
          <div key={g.id} style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 12, color: "#E5E5E5", fontWeight: 700 }}>{g.title}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={S.tag(sc)}>{g.status.toUpperCase()}</span>
                {g.status !== "complete" && (
                  <button style={S.btn} onClick={() => setGoals(prev => prev.map(x => x.id !== g.id ? x : { ...x, progress: Math.min(x.progress + 25, 100), status: x.progress + 25 >= 100 ? "complete" : "running" }))}>▶</button>
                )}
              </div>
            </div>
            <div style={S.progressBar(g.progress, sc)} />
            <div style={{ fontSize: 9, color: "#4B5563", marginTop: 3, marginBottom: 8 }}>{g.progress}%</div>
            {g.steps.map((step, idx) => {
              const done = g.progress > (idx / g.steps.length) * 100;
              return (
                <div key={idx} style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 11, color: done ? "#6B7280" : "#3A3A3A", marginBottom: 3 }}>
                  <span style={{ color: done ? "#10B981" : "#2A2A2A" }}>{done ? "✓" : "○"}</span>
                  <span style={{ textDecoration: done ? "line-through" : "none" }}>{step}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  const renderLogs = () => (
    <div style={S.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: "#4B5563" }}>{logs.length} events</span>
        <button style={S.btnGhost} onClick={() => setLogs([])}>CLEAR</button>
      </div>
      <div style={{ ...S.card, padding: "8px 12px" }}>
        {logs.slice().reverse().map((l, i) => (
          <div key={i} style={S.logLine(l.level)}>
            <span style={{ color: "#2A2A2A", flexShrink: 0 }}>{l.ts}</span>
            <span style={{ flexShrink: 0, minWidth: 46 }}>[{l.level}]</span>
            <span>{l.msg}</span>
          </div>
        ))}
      </div>
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
        textarea:focus { border-color: #F59E0B55 !important; }
      `}</style>

      <div style={S.header}>
        <span style={{ fontSize: 20 }}>🦬</span>
        <div>
          <div style={S.brand}>BUFFALO</div>
          <div style={S.version}>SWARM MODE — 6 AGENTS PARALLEL</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8 }}>
          {AGENTS.map(a => <span key={a.id} style={{ fontSize: 10, color: a.color, opacity: 0.6 }} title={a.name}>{a.icon} {a.short}</span>)}
        </div>
      </div>

      <div style={S.tabBar}>
        {TABS.map(t => <div key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>{t.toUpperCase()}</div>)}
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {tab === "Swarm"  && renderSwarm()}
        {tab === "Memory" && renderMemory()}
        {tab === "Goals"  && renderGoals()}
        {tab === "Logs"   && renderLogs()}
      </div>
    </div>
  );
}
