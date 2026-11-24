// One mindmap tree for anything the app makes — a feature film, a short film (Project) or a song — rendered by
// StoryMap.jsx. The tree is recursive: { kind, root, children: [ { id, title, sub, body, meta, status, chip, link, children } ] }.
// Nodes with chip: true (shots, lyric lines) render as compact chips; every node keeps its own id for
// select/drag/collapse, and link.production points at the Project a sequence or scene opens.
export const shotStatus = (sh) => (sh.state?.final || sh.state?.status === 'success' ? 'finished' : sh.state?.candidates?.length ? 'filmed' : 'written')

const shotNode = (sh) => ({
  id: `h:${sh.id}`,
  kind: 'shot',
  title: sh.action || 'Shot',
  sub: `${sh.seconds || 0}s`,
  body: sh.line || '',
  meta: sh.camera || '',
  status: shotStatus(sh),
  chip: true,
  projectId: sh.projectId || sh.state?.final?.projectId || null,
  staging: sh.staging || '',
  ends: sh.ends || ''
})

const sceneNode = (sc) => ({
  id: `c:${sc.id}`,
  kind: 'scene',
  title: sc.heading || 'Scene',
  sub: sc.location || '',
  meta: `${(sc.shots || []).length} shots`,
  children: (sc.shots || []).map(shotNode)
})

// A short film: the film at the root, its scenes and shots beside it.
export function productionTree(p) {
  return {
    kind: 'production',
    root: {
      id: `p:${p.id}`,
      title: p.name,
      sub: p.logline || '',
      body: (p.script?.text || '').split('\n').slice(0, 12).join('\n'),
      meta: `${p.scenes?.length || 0} scenes · ${(p.scenes || []).reduce((n, s) => n + (s.shots || []).length, 0)} shots · ${Math.round((p.targetSeconds || 0))}s target`
    },
    children: (p.scenes || []).map(sceneNode)
  }
}

// A feature: the explore() tree re-shaped to the same recursive form.
export function featureTree(explore) {
  return {
    kind: 'feature',
    root: {
      id: `f:${explore.feature.id}`,
      title: explore.feature.name,
      sub: explore.feature.logline,
      body: explore.feature.story,
      meta: `${explore.totals.shots} shots · ${explore.totals.finished} finished · ${explore.feature.targetMinutes} min`
    },
    children: explore.acts.map((act, i) => ({
      id: `a:${act.id}`,
      kind: 'act',
      title: act.title,
      sub: act.logline,
      meta: `Act ${i + 1} · ${act.minutes} min`,
      children: act.sequences.map((seq) => ({
        id: `s:${seq.id}`,
        kind: 'sequence',
        title: seq.title,
        sub: seq.logline,
        meta: `${seq.scenes.length} scenes`,
        link: { production: seq.id },
        children: seq.scenes.map((sc) => ({ ...sceneNode(sc), link: { production: seq.id } }))
      }))
    }))
  }
}

// Lyrics → labeled sections: [Verse]/[Chorus] markers when present, else 4-line parts.
export function lyricsSections(lyrics) {
  const lines = String(lyrics || '')
    .split('\n')
    .map((s) => s.trim())
  if (!lines.some(Boolean)) return []
  const MARK = /^\[(.+?)\]\s*$/
  const sections = []
  let cur = null
  for (const line of lines) {
    const m = MARK.exec(line)
    if (m) {
      cur = { label: m[1], lines: [] }
      sections.push(cur)
      continue
    }
    if (!line) continue
    if (!cur) {
      cur = { label: 'Lyrics', lines: [] }
      sections.push(cur)
    }
    cur.lines.push(line)
  }
  if (sections.length === 1 && sections[0].label === 'Lyrics' && sections[0].lines.length > 8) {
    const all = sections[0].lines
    const out = []
    for (let i = 0; i < all.length; i += 4) out.push({ label: `Part ${out.length + 1}`, lines: all.slice(i, i + 4) })
    return out
  }
  return sections.filter((s) => s.lines.length)
}

// A song: its structure as branches — lyric sections (lines as chips), plus remixes made from it.
export function songTree(song, songs = []) {
  const engine = song.engine === 'minimax' ? 'MiniMax Music 3' : 'ACE-Step 1.5'
  const sections = lyricsSections(song.lyrics)
  const remixes = song.file ? (songs || []).filter((s) => s.remix?.source && s.remix.source === song.file && s.id !== song.id) : []
  return {
    kind: 'song',
    root: {
      id: `m:${song.id}`,
      title: song.name,
      sub: song.caption || '',
      body: song.lyrics || '',
      meta: [engine, song.duration ? `${Math.round(song.duration)}s` : `${song.seconds || 0}s`, song.instrumental ? 'instrumental' : '', song.bpm ? `${song.bpm} BPM` : '', song.key || '']
        .filter(Boolean)
        .join(' · ')
    },
    children: [
      ...sections.map((sec, i) => ({
        id: `sec:${i}`,
        kind: 'section',
        title: sec.label,
        meta: `${sec.lines.length} lines`,
        children: sec.lines.map((ln, j) => ({ id: `ln:${i}:${j}`, kind: 'line', title: ln, chip: true }))
      })),
      ...(remixes.length
        ? [
            {
              id: 'remixes',
              kind: 'group',
              title: 'Remixes',
              meta: `${remixes.length}`,
              children: remixes.map((r) => ({
                id: `m:${r.id}`,
                kind: 'song',
                title: r.name,
                sub: r.caption,
                meta: [r.remix?.strength != null ? `strength ${r.remix.strength}` : '', r.duration ? `${Math.round(r.duration)}s` : ''].filter(Boolean).join(' · '),
                link: { song: r.id }
              }))
            }
          ]
        : [])
    ]
  }
}

// The one entry point: build the tree for whatever was asked for.
export function storyTree({ productions, features, music }, kind, id) {
  if (kind === 'feature') return featureTree(features.explore(id))
  if (kind === 'production') return productionTree(productions.get(id))
  if (kind === 'song') {
    const songs = music.all()
    const song = songs.find((s) => s.id === id)
    if (!song) throw new Error(`No song ${id}.`)
    return songTree(song, songs)
  }
  throw new Error(`Unknown storymap kind "${kind}". Use feature, production or song.`)
}
