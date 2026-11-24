import { app, dialog, shell } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { APPS, IVWorkspace, cleanBrand, fingerprint, handoffArgument } from './iv-workspace.js'

// Where people get IV Hivemind, and where it installs (per user, the standard folder).
// IV Hivemind's public download page: its newest release (installer and self-updates), hollisorg/iv-hivemind-releases
export const HIVEMIND_PAGE = 'https://github.com/hollisorg/iv-hivemind-releases/releases/latest'
const hivemindExe = () => process.env.IV_HIVEMIND_EXE || join(app.getPath('appData'), '..', 'Local', 'Programs', 'IV Hivemind', 'IV Hivemind.exe')

// Main-process adapter. No renderer-selected executable, shell command or file path.
export function workspaceHost({ appId, dataDir, nativeBrands, importBrand, receive, disabled = false }) {
  let store, pending = handoffArgument(process.argv, appId)
  let pendingRequest = pending ? 1 : 0
  const isolatedProfile = appId === 'studio' ? process.env.IV_STUDIO_USER_DATA : appId === 'signal' ? process.env.IV_SIGNAL_DATA_DIR : process.env.FITSCOUT_DATA_DIR
  const root = process.env.IV_WORKSPACE_DIR || (isolatedProfile ? join(dataDir, 'iv-workspace-test') : undefined)
  const get = () => {
    if (disabled) throw Error('Hivemind is unavailable in Incognito. Return to your regular workspace to share.')
    return store ||= new IVWorkspace({ root, appId, profile: dataDir })
  }
  const native = id => nativeBrands?.().find(b => b.id === id)
  const localProfile = b => cleanBrand({ ...b.profile, name: b.name, logo: null })
  const nativeFingerprint = b => fingerprint({ ...localProfile(b), logo_id: b.profile?.logo_id || '' })
  const installed = target => {
    const test = process.env.IV_WORKSPACE_TEST === '1' ? JSON.parse(process.env.IV_WORKSPACE_TEST_APPS || '{}') : {}
    const executable = test[target] || join(app.getPath('appData'), '..', 'Local', 'Programs', APPS[target], `${APPS[target]}.exe`)
    const registered = get().db.prepare('select value from meta where key=?').get(`app:${target}`)
    const record = registered ? JSON.parse(registered.value) : null
    return { id: target, name: APPS[target], ready: existsSync(executable) && !!record && record.protocol === 1 && resolve(record.executable) === resolve(executable), executable, version: record?.version }
  }
  const launch = async h => {
    const info = installed(h.target)
    if (!info.ready) throw Error(`Update and open ${APPS[h.target]} once to connect it. Your handoff is saved in Hivemind.`)
    if (process.env.IV_WORKSPACE_TEST === '1' && process.env.IV_WORKSPACE_NO_LAUNCH === '1') return
    await new Promise((ok, no) => {
      const child = spawn(info.executable, [`--iv-handoff=${h.id}`], { detached: true, stdio: 'ignore', windowsHide: false })
      child.once('error', () => no(Error(`Could not open ${info.name}. Open its Hivemind to continue.`)))
      child.once('spawn', () => { child.unref(); ok() })
    })
  }
  function shareNative(id, preferLocal = false) {
    const w = get(), n = native(id); if (!n) throw Error('Select a business in this app first.')
    const link = w.link(id), profile = localProfile(n), fp = nativeFingerprint(n)
    const nativeLogo = () => {
      if (!/^[a-f0-9]{64}\.(png|jpg)$/.test(n.profile?.logo_id || '')) return null
      const file = join(dataDir, 'brand-assets', n.profile.logo_id)
      return existsSync(file) ? w.addAsset(file).id : null
    }
    if (link) {
      const shared = w.brand(link.brandId)
      if (link.fingerprint === fp) return shared
      if (shared.revision !== link.revision && !preferLocal) throw Error('This business changed in both apps. Choose which profile to use in Hivemind.')
      const b = w.saveBrand({ ...profile, logo: nativeLogo(), id: shared.id }, shared.revision)
      w.setLink(id, { brandId: b.id, revision: b.revision, fingerprint: fp }); return b
    }
    const logo = nativeLogo()
    const b = w.saveBrand({ ...profile, logo })
    w.setLink(id, { brandId: b.id, revision: b.revision, fingerprint: fp }); return b
  }
  function useBrand(brandId, localId = null) {
    const w = get(), b = w.brand(brandId)
    if (!importBrand) return { brandId }
    const linked = localId || w.links().find(l => l.brandId === brandId)?.localId
    const result = importBrand(b, linked, w)
    w.setLink(result.id, { brandId, revision: b.revision, fingerprint: nativeFingerprint(result) })
    return { brandId, localId: result.id }
  }
  function syncBrands() {
    const w = get(), conflicts = []
    for (const link of w.links()) {
      const n = native(link.localId); if (!n) continue
      const b = w.brand(link.brandId), dirty = nativeFingerprint(n) !== link.fingerprint
      if (dirty && b.revision !== link.revision) { conflicts.push({ localId: n.id, brandId: b.id, name: b.name }); continue }
      if (dirty) shareNative(n.id)
      else if (b.revision !== link.revision) useBrand(b.id, n.id)
    }
    return conflicts
  }
  const api = {
    state: () => {
      const w = get(), conflicts = syncBrands()
      return { appId, pending, pendingRequest, active: w.active(), brands: w.brands().map(b => ({ ...b, logoPreview: b.logo ? w.preview(b.logo) : null })), handoffs: w.handoffs().map(h => ({ ...h, receipt: h.receipts[w.profile], assets: h.assets.map(id => w.asset(id)) })), apps: Object.keys(APPS).map(id => { const { executable, ...info } = installed(id); return info }), links: w.links(), conflicts }
    },
    // The Hivemind button's pop-up: open IV Hivemind when it's installed, otherwise its download page.
    hivemind: () => ({ installed: existsSync(hivemindExe()), page: HIVEMIND_PAGE }),
    openHivemind: async () => {
      const exe = hivemindExe()
      if (!existsSync(exe)) throw Error('IV Hivemind is not installed on this PC.')
      await new Promise((ok, no) => {
        const child = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false })
        child.once('error', () => no(Error('Could not open IV Hivemind.')))
        child.once('spawn', () => { child.unref(); ok() })
      })
      return { opened: true }
    },
    getHivemind: async () => { await shell.openExternal(HIVEMIND_PAGE); return { page: HIVEMIND_PAGE } },
    saveBrand: ({ brand, revision }) => get().saveBrand(brand, revision),
    shareNative: ({ localId, preferLocal }) => shareNative(localId, !!preferLocal),
    useBrand: ({ brandId, localId }) => useBrand(brandId, localId),
    pickLogo: async () => {
      const choice = await dialog.showOpenDialog({ title: 'Choose a shared business logo', properties: ['openFile'], filters: [{ name: 'Logo under 4 MB', extensions: ['png','jpg','jpeg','webp'] }] })
      if (choice.canceled) return null
      const asset = get().addAsset(choice.filePaths[0])
      if (asset.bytes > 4 * 1024 * 1024) throw Error('Choose a logo smaller than 4 MB.')
      return { ...asset, preview: get().preview(asset.id) }
    },
    pickAssets: async () => {
      const selected = await dialog.showOpenDialog({ title: 'Share selected media with your Techlit apps', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Pictures and videos', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'mov', 'webm'] }] })
      if (selected.canceled) return []
      if (selected.filePaths.length > 10) throw Error('Choose up to ten files.')
      return selected.filePaths.map(p => get().addAsset(p))
    },
    open: async ({ id }) => { const h = get().handoff(id); await launch(h); return { id } },
    receive: async ({ id }) => {
      const w = get(), h = w.handoff(id)
      if (h.target !== appId || !receive) throw Error('Open the handoff in its receiving app.')
      const request = pendingRequest
      const result = await receive(h, w, useBrand)
      w.receipt(id, result)
      if (pending === id && request === pendingRequest) pending = null
      return result
    },
    dismiss: () => { pending = null },
    forward: async ({ id, caption, assets = [], channel }) => {
      const w = get(), h = w.handoff(id)
      if (appId !== 'studio' || h.target !== 'studio' || !h.receipts[w.profile]) throw Error('Open this creative brief in Studio first.')
      const next = w.createHandoff({ target: 'signal', brandId: h.brandId, sourceKey: h.id, parentId: h.id, brief: { ...h.brief, caption, channel: channel || h.brief.channel }, assets })
      await launch(next); return next
    }
  }
  // Follow the active business: on launch and whenever it changes (in Hivemind or another app), select this app's copy
  // of it, making the copy from the shared profile first if this app has none. Studio has no businesses of its own and
  // just gets told which one is active.
  let seenActive = null
  function followActive({ select, interval = 3000 }) {
    if (disabled) return () => {}
    const check = () => {
      try {
        const w = get(), a = w.active(), key = `${a.brandId}|${a.at}`
        if (key === seenActive) return
        seenActive = key
        if (!a.brandId) return select({ brandId: '', localId: null, brand: null })
        const brand = w.brand(a.brandId)
        let localId = null
        if (importBrand) {
          const link = w.links().find(l => l.brandId === a.brandId && native(l.localId))
          localId = link ? link.localId : useBrand(a.brandId).localId
        }
        select({ brandId: a.brandId, localId, brand })
      } catch {}
    }
    check()
    const timer = setInterval(check, interval)
    timer.unref?.()
    return () => clearInterval(timer)
  }
  // The person picked a business inside this app: a shared one becomes the active business in every IV app.
  function picked(localId) {
    if (disabled || !localId) return
    try {
      const w = get(), link = w.link(localId)
      if (!link) return
      const a = w.setActive(link.brandId)
      seenActive = `${a.brandId}|${a.at}`
    } catch {}
  }
  return {
    get, api, shareNative, followActive, picked,
    active: () => { try { return get().active() } catch { return { brandId: '', at: null, by: null } } },
    capture: args => {
      const id = handoffArgument(args, appId)
      if (id) {
        pending = id
        pendingRequest++
      }
    },
    ready: () => {
      if (disabled) return
      const w = get()
      if (app.isPackaged || process.env.IV_WORKSPACE_TEST === '1') w.db.prepare('insert into meta values(?,?) on conflict(key) do update set value=excluded.value').run(`app:${appId}`, JSON.stringify({ protocol: 1, executable: process.execPath, version: app.getVersion() }))
      if (app.isPackaged && !isolatedProfile && process.env.IV_WORKSPACE_TEST !== '1') app.setAsDefaultProtocolClient(`iv-${appId}`)
    },
    sendBrief: async ({ nativeId, sourceKey, brief, target }) => {
      const brand = shareNative(nativeId), h = get().createHandoff({ target, brandId: brand.id, sourceKey, brief })
      await launch(h); return h
    }
  }
}
