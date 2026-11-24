// Local AI in Techlit Studio's chat: a model in the person's own Ollama, free and on this PC, driving Techlit Studio's tools.
// Claude Code, Codex and Hermes run their own agent loops; Local AI's loop is this one. It starts Techlit Studio's MCP
// server (the same one, with the same environment, so Allow cards, undo points, the activity log and the spend desk
// work as for the others), offers the model a short list of everyday tools (all of them would swamp a small model's
// memory), and goes round: the model answers or asks for tools, the tools run, their results go back, until it
// answers in words or reaches the step limit. The conversation is kept in the chat's folder between messages.
import fs from 'node:fs'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { cpuOptions, DEFAULT_LOCAL_MODEL, ensureOllama, ollamaUrl } from './prompter.js'

// The tools a small model is offered: looking things up, prompts, shots, pictures, music, lines, the editor and
// finding its way round the app. Everything else needs Claude Code, Codex or Hermes.
export const LOCAL_TOOLS = [
  'check_setup',
  'list_characters',
  'list_projects',
  'list_renders',
  'get_job',
  'cancel_job',
  'make_shot',
  'rank_takes',
  'finish_candidate',
  'make_image',
  'list_images',
  'make_music',
  'list_music',
  'list_voices',
  'speak_line',
  'list_edits',
  'get_edit',
  'edit_timeline',
  'add_media',
  'caption_edit',
  'export_edit',
  'grab_frame',
  'list_places',
  'show_in_app',
  'free_memory'
]
// Tools that start work on the GPU: the model leaves the graphics card before one runs, and stays on the CPU after it
// for the rest of the turn, so the render has the card to itself.
export const GPU_TOOLS = new Set(['make_shot', 'finish_candidate', 'make_image', 'make_music', 'speak_line', 'export_edit'])

export const LOCAL_WINDOW = 24576
const MAX_STEPS = 14
const MAX_RESULT = 6000
const KEEP_MESSAGES = 40

export const LOCAL_PROMPT = `You are Local AI, the assistant inside Techlit Studio, the person's video app, talking with them in a chat panel at the side of the app. You run on a small model on their own PC.

You have some of Techlit Studio's tools and nothing else. Use them: look things up before you answer, and never make up shots, characters, files or ids. Call one tool at a time and read its result before the next.

Each message starts with a line in [brackets] saying what Techlit Studio is showing them now (the page, and the ids of the open shot, film or edit). "This" and "it" usually mean that. Use the ids with the tools; never show raw ids to the person.

To make a video shot, call make_shot with their idea in plain words (list_characters first if they name someone, and pass that character's id). It writes the prompt and starts the previews. Renders take minutes: tell the person it's on its way and that the takes will appear on the shot's page; check with get_job only if they ask.

When the person asks where something is in Techlit Studio, find it with list_places and show it with show_in_app.

Anything that deletes, costs money or changes a setting shows the person an Allow card and waits. If they say no, accept it and say what you could do instead.

If they ask for something your tools can't do (films, sequences, training a character, website films), say that Claude, ChatGPT or Hermes can do it in this chat, or show them the page with show_in_app.

Keep replies short and plain, for someone who isn't technical: a few sentences, no tables, no code.`

// An MCP tool as Ollama's function definition (its description cut down; the schema as it is).
export function toOllamaTool(t) {
  const description = String(t.description || '').replace(/\s+/g, ' ').slice(0, 420)
  return { type: 'function', function: { name: t.name, description, parameters: t.inputSchema || { type: 'object', properties: {} } } }
}

// A tool's result as text for the model (and any pictures it returned, for a model that sees).
export function toolResult(result) {
  const parts = []
  const images = []
  for (const c of result?.content || []) {
    if (c.type === 'text') parts.push(c.text)
    else if (c.type === 'image' && c.data) (images.push(c.data), parts.push('[a picture, shown to you below]'))
    else parts.push(`[${c.type}]`)
  }
  if (!parts.length && result?.structuredContent) parts.push(JSON.stringify(result.structuredContent))
  let text = parts.join('\n').trim() || '(no result)'
  if (text.length > MAX_RESULT) text = `${text.slice(0, MAX_RESULT)}\n… (cut here; ask a narrower question for the rest)`
  return { text: result?.isError ? `Error: ${text}` : text, images, error: !!result?.isError }
}

// Ollama's tool-call arguments arrive as an object, or now and then as a JSON string.
export function argsOf(call) {
  const a = call?.function?.arguments
  if (!a) return {}
  if (typeof a === 'string') {
    try {
      return JSON.parse(a)
    } catch {
      return {}
    }
  }
  return a
}

const historyFile = (dir) => path.join(dir, 'local-history.json')
export function readHistory(dir) {
  try {
    const h = JSON.parse(fs.readFileSync(historyFile(dir), 'utf8'))
    return Array.isArray(h) ? h : []
  } catch {
    return []
  }
}
// The newest messages, starting at one of the person's (so a tool result never loses the call it answers);
// pictures are dropped from older messages.
export function trimHistory(h, keep = KEEP_MESSAGES) {
  let out = h.slice(-keep)
  const first = out.findIndex((m) => m.role === 'user' && !m.fromTool)
  out = first > 0 ? out.slice(first) : out
  return out.map((m, i) => (i < out.length - 4 && m.images ? { ...m, images: undefined } : m))
}

// One message's turn. server: { command, args, env } for Techlit Studio's MCP server. emit(e): the chat's events
// (session, step, stepError, say, end, usage). cpu: start off the graphics card (a render is running).
// Returns { done: Promise<{ ok, error, session }>, cancel() }.
export function localTurn({ server, dir, system, text, model = '', cpu = false, emit = () => {}, fetchFn = fetch, connect = null, maxSteps = MAX_STEPS }) {
  const ctl = new AbortController()
  let client = null
  const name = model || DEFAULT_LOCAL_MODEL
  const done = (async () => {
    let onCpu = !!cpu
    try {
      if (!connect) await ensureOllama()
      client = connect ? await connect() : await openServer(server)
      const offered = new Set(LOCAL_TOOLS)
      const tools = (await client.listTools()).tools.filter((t) => offered.has(t.name)).map(toOllamaTool)
      const history = trimHistory(readHistory(dir))
      history.push({ role: 'user', content: text })
      emit({ type: 'session', id: 'local' })
      const totals = { input: 0, output: 0 }
      const failed = new Set() // tool calls that failed this turn, as tool + arguments
      let n = 0
      for (let step = 0; ; step++) {
        if (ctl.signal.aborted) return { ok: false, error: 'Stopped.' }
        const reply = await ask({ fetchFn, name, system, history, tools, onCpu, signal: ctl.signal })
        totals.input += reply.prompt_eval_count || 0
        totals.output += reply.eval_count || 0
        emit({ type: 'usage', context: reply.prompt_eval_count || 0, window: LOCAL_WINDOW, model: name })
        const msg = reply.message || {}
        const calls = msg.tool_calls || []
        history.push({ role: 'assistant', content: msg.content || '', ...(calls.length ? { tool_calls: calls } : {}) })
        if (msg.content?.trim() && calls.length) emit({ type: 'say', text: msg.content.trim() })
        if (!calls.length) {
          save(dir, history)
          emit({ type: 'usage', turn: { input: totals.input, cached: 0, output: totals.output, apiUsd: 0 } })
          const said = (msg.content || '').trim()
          emit({ type: 'end', ok: true, text: said || 'Done.' })
          return { ok: true, error: null }
        }
        if (step >= maxSteps) {
          save(dir, history)
          emit({ type: 'usage', turn: { input: totals.input, cached: 0, output: totals.output, apiUsd: 0 } })
          return { ok: false, error: `Local AI took ${maxSteps} steps without finishing, so it stopped. Try asking for one thing at a time.` }
        }
        const started = [] // renders this step started: [tool, its result]
        for (const call of calls) {
          const tool = call.function?.name || ''
          const id = `local-${++n}`
          emit({ type: 'step', tool, id })
          let out
          const key = `${tool} ${JSON.stringify(argsOf(call))}`
          if (!offered.has(tool)) out = { text: `Error: there's no tool called ${tool} here. Use one of the tools you were given.`, images: [], error: true }
          // a small model can retry the same failing call forever: once is enough
          else if (failed.has(key)) out = { text: 'Error: you already tried exactly this and it failed. Change what you send, or answer the person in words now.', images: [], error: true }
          else {
            // a render wants the graphics card: the model leaves it now and answers from the CPU after
            if (GPU_TOOLS.has(tool) && !onCpu) {
              await unload(fetchFn, name)
              onCpu = true
            }
            try {
              out = toolResult(await client.callTool({ name: tool, arguments: argsOf(call) }, undefined, { timeout: 15 * 60 * 1000 }))
            } catch (e) {
              out = { text: `Error: ${e.message}`, images: [], error: true }
            }
          }
          if (out.error) (failed.add(key), emit({ type: 'stepError', id, text: out.text.replace(/^Error:\s*/, '') }))
          else if (GPU_TOOLS.has(tool)) started.push([tool, out.text])
          history.push({ role: 'tool', content: out.text, tool_name: tool })
          if (out.images.length) history.push({ role: 'user', content: `(The picture from ${tool}.)`, images: out.images.slice(0, 2), fromTool: true })
        }
        // A render has started and nothing failed: the turn ends with Techlit Studio's own words. Another answer from the
        // model would now come from the CPU, competing with the render, and take minutes to say "it's on its way".
        if (started.length && !calls.some((c) => failed.has(`${c.function?.name || ''} ${JSON.stringify(argsOf(c))}`))) {
          const said = startedReply(started)
          history.push({ role: 'assistant', content: said })
          save(dir, history)
          emit({ type: 'usage', turn: { input: totals.input, cached: 0, output: totals.output, apiUsd: 0 } })
          emit({ type: 'end', ok: true, text: said })
          return { ok: true, error: null }
        }
      }
    } catch (e) {
      if (ctl.signal.aborted) return { ok: false, error: 'Stopped.' }
      return { ok: false, error: /fetch failed|ECONNREFUSED/.test(e.message) ? `Ollama isn't answering at ${ollamaUrl()}.` : e.message }
    } finally {
      await client?.close?.().catch(() => {})
    }
  })().then((r) => ({ ...r, session: 'local' }))
  return {
    done,
    cancel() {
      ctl.abort()
      client?.close?.().catch(() => {})
    }
  }
}

// What Techlit Studio says when Local AI has started renders, from the tools' own results.
const STARTED = {
  make_shot: () => "I've started the previews. They'll show on the shot's page in a few minutes, and the queue in the sidebar shows how far along they are.",
  finish_candidate: () => "I've started finishing that take at full size. It shows on the shot's page when it's done.",
  make_image: () => "I've started the pictures. They'll appear on Create → Image in a moment.",
  make_music: () => "I've started the song. It'll be on Audio → Music when it's done.",
  speak_line: () => "Done: the line is on Audio → Lines.",
  export_edit: () => "I've started the export. It goes to your finished videos folder when it's done."
}
export function startedReply(started) {
  return started
    .map(([tool, text]) => {
      let r = {}
      try {
        r = JSON.parse(text)
      } catch {}
      return (STARTED[tool] || (() => 'Started. It shows in the queue in the sidebar.'))(r)
    })
    .join(' ')
}

function save(dir, history) {
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(historyFile(dir), JSON.stringify(trimHistory(history)))
  } catch {
    /* a full drive shouldn't end the turn */
  }
}

async function ask({ fetchFn, name, system, history, tools, onCpu, signal }) {
  const r = await fetchFn(`${ollamaUrl()}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: name,
      stream: false,
      keep_alive: '5m',
      tools,
      options: { temperature: 0.3, num_ctx: LOCAL_WINDOW, num_predict: 1500, ...cpuOptions(onCpu) },
      messages: [{ role: 'system', content: system }, ...history.map(({ fromTool, ...m }) => m)]
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(10 * 60 * 1000)])
  })
  if (!r.ok) {
    const t = (await r.text()).slice(0, 300)
    if (/not found/i.test(t)) throw new Error(`The model ${name} isn't in Ollama yet. Install it in Settings → Prompt writer, or pick another for Local AI.`)
    if (/does not support tools/i.test(t)) throw new Error(`${name} can't use tools, so it can't work Techlit Studio. Pick a model that can (Qwen3 or Llama 3.1 and newer) for Local AI.`)
    throw new Error(`Ollama: ${t}`)
  }
  return r.json()
}

async function unload(fetchFn, name) {
  await fetchFn(`${ollamaUrl()}/api/generate`, { method: 'POST', body: JSON.stringify({ model: name, keep_alive: 0 }), signal: AbortSignal.timeout(10000) }).catch(() => {})
}

async function openServer(server) {
  const client = new Client({ name: 'iv-studio-local-ai', version: '1.0.0' })
  await client.connect(new StdioClientTransport({ command: server.command, args: server.args, env: { ...process.env, ...server.env }, stderr: 'ignore' }))
  return client
}
