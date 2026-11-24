// Local AI's chat loop (src/service/localchat.js) with a stand-in Ollama and stand-in Techlit Studio tools.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { GPU_TOOLS, LOCAL_TOOLS, argsOf, localTurn, readHistory, toolResult, trimHistory } from '../src/service/localchat.js'

let n = 0
const ok = async (name, fn) => (await fn(), n++, console.log(`ok ${name}`))
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ivlocal-'))

// a stand-in MCP client: three tools, one outside Local AI's list
const calls = []
const connect = async () => ({
  listTools: async () => ({ tools: [{ name: 'list_characters', description: 'Characters.', inputSchema: { type: 'object', properties: {} } }, { name: 'make_shot', description: 'Render.', inputSchema: { type: 'object', properties: { prompt: { type: 'string' } } } }, { name: 'delete_project', description: 'Delete.', inputSchema: { type: 'object' } }] }),
  callTool: async ({ name, arguments: a }) => (calls.push([name, a]), name === 'make_shot' ? { content: [{ type: 'text', text: '{"jobId":"j1"}' }] } : { content: [{ type: 'text', text: '[{"name":"Tess"}]' }] }),
  close: async () => {}
})
// a stand-in Ollama: answers from a script, records what it was sent
const sent = []
const ollama = (script) => async (url, init) => {
  const body = JSON.parse(init.body)
  sent.push({ url, body })
  if (url.endsWith('/api/generate')) return { ok: true, json: async () => ({}) }
  const next = script.shift()
  return { ok: true, json: async () => next }
}
const run = async (script, text = 'Which characters do I have?') => {
  const events = []
  const t = localTurn({ server: null, dir, system: 'SYSTEM', text, model: 'test-model', connect, fetchFn: ollama(script), emit: (e) => events.push(e) })
  return { r: await t.done, events }
}

await ok('only the everyday tools are offered', async () => {
  sent.length = 0
  await run([{ message: { content: 'Hi.' }, prompt_eval_count: 900, eval_count: 5 }], 'Hi')
  const names = sent[0].body.tools.map((t) => t.function.name)
  assert.deepEqual(names, ['list_characters', 'make_shot'])
  assert.equal(sent[0].body.messages[0].content, 'SYSTEM')
  assert.ok(LOCAL_TOOLS.includes('show_in_app') && !LOCAL_TOOLS.includes('delete_project'))
})
await ok('a tool call runs, its result goes back, and the answer ends the turn', async () => {
  sent.length = 0
  calls.length = 0
  const { r, events } = await run([{ message: { content: '', tool_calls: [{ function: { name: 'list_characters', arguments: {} } }] }, prompt_eval_count: 1000 }, { message: { content: 'You have Tess.' }, prompt_eval_count: 1100, eval_count: 6 }])
  assert.equal(r.ok, true)
  assert.deepEqual(calls, [['list_characters', {}]])
  assert.equal(sent[1].body.messages.at(-1).role, 'tool')
  assert.match(sent[1].body.messages.at(-1).content, /Tess/)
  assert.ok(events.some((e) => e.type === 'step' && e.tool === 'list_characters'))
  assert.deepEqual(events.find((e) => e.type === 'end'), { type: 'end', ok: true, text: 'You have Tess.' })
  assert.ok(events.some((e) => e.type === 'usage' && e.turn))
})
await ok('a render moves the model off the graphics card first', async () => {
  sent.length = 0
  await run([{ message: { content: '', tool_calls: [{ function: { name: 'make_shot', arguments: '{"idea":"a fox"}' } }] } }], 'Make a fox')
  assert.ok(GPU_TOOLS.has('make_shot'))
  assert.ok(sent[1].url.endsWith('/api/generate'), 'unloads before the render')
  assert.equal(sent.length, 2, 'no answer from the model while the render has the card')
})
await ok('once a render starts, the turn ends in Techlit Studio’s words', async () => {
  const { r, events } = await run([{ message: { content: '', tool_calls: [{ function: { name: 'make_shot', arguments: { idea: 'a fox' } } }] } }], 'Make a fox')
  assert.equal(r.ok, true)
  assert.match(events.find((e) => e.type === 'end').text, /started the previews/)
  assert.equal(readHistory(dir).at(-1).role, 'assistant')
})
await ok('a tool outside the list is refused, not run', async () => {
  calls.length = 0
  const { events } = await run([{ message: { content: '', tool_calls: [{ function: { name: 'delete_project', arguments: {} } }] } }, { message: { content: 'I can’t do that here.' } }], 'Delete it')
  assert.deepEqual(calls, [])
  assert.ok(events.some((e) => e.type === 'stepError'))
})
await ok('the conversation is kept between messages', async () => {
  const h = readHistory(dir)
  assert.ok(h.some((m) => m.role === 'user' && m.content === 'Which characters do I have?'))
  assert.equal(h.at(-1).role, 'assistant')
})
await ok('the step limit stops a loop', async () => {
  const loop = Array.from({ length: 6 }, () => ({ message: { content: '', tool_calls: [{ function: { name: 'list_characters', arguments: {} } }] } }))
  const t = localTurn({ server: null, dir, system: 'S', text: 'x', connect, fetchFn: ollama(loop), maxSteps: 3 })
  const r = await t.done
  assert.equal(r.ok, false)
  assert.match(r.error, /3 steps/)
})
await ok('helpers', async () => {
  assert.deepEqual(argsOf({ function: { arguments: '{"a":1}' } }), { a: 1 })
  assert.deepEqual(argsOf({ function: { arguments: 'nope' } }), {})
  const big = toolResult({ content: [{ type: 'text', text: 'x'.repeat(9000) }] })
  assert.ok(big.text.length < 6200)
  assert.equal(toolResult({ isError: true, content: [{ type: 'text', text: 'bad' }] }).error, true)
  const t = trimHistory([{ role: 'tool', content: 'orphan' }, { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }])
  assert.equal(t[0].role, 'user')
})
fs.rmSync(dir, { recursive: true, force: true })
console.log(`localchat: ${n}/${n} passed`)
