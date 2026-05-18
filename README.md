# 🦬 Buffalo

Multi-agent AI orchestration. All 6 agents respond to every prompt simultaneously.

## Setup

1. Install dependencies
   ```
   npm install
   ```

2. Add your Anthropic API key — create a `.env` file:
   ```
   VITE_ANTHROPIC_KEY=sk-ant-your-key-here
   ```

3. Run locally
   ```
   npm run dev
   ```

4. Build for production
   ```
   npm run build
   ```

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Import the repo on vercel.com
3. Add `VITE_ANTHROPIC_KEY` in Vercel → Project → Settings → Environment Variables
4. Deploy

Every `git push` auto-redeploys.

## Agents

| Agent | Role |
|-------|------|
| ⬡ Orchestrator | Synthesizes inputs, routes tasks |
| ◈ Coder | Writes and reviews code |
| ◎ Researcher | Gathers info, compares options |
| ◇ Tester | Edge cases, tests, bugs |
| ◉ Security | Vulnerabilities, CVEs |
| ◫ Docs Writer | Documentation, readmes |

## Tips

- Use **Memory** tab to store project context — it's injected into every agent automatically
- Click agent tags to **focus** on one agent's response full-width
- Say "remember that…" in your prompt to auto-save to memory
- Every prompt fires all 6 agents in parallel via `Promise.allSettled`
