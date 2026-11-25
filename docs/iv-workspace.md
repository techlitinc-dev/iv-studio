# Hivemind: local app continuity

This build connects IV Outreach 0.12.4, IV Studio 1.1.14 and IV Signal 0.1.10 on one Windows account. It does not require a new account, server or provider subscription.

## Use it

1. Open each updated app once. In Outreach and Signal, the red **Hivemind** button in the top bar shows the other connected apps. Studio has no Hivemind window: handoffs from the other apps still arrive and open their project, and the shared profile still feeds its chat's memory, but there is nothing to open in Studio itself.
2. In Outreach, choose your business and campaign, then Scanning → Content briefs. Prepare a brief and select **Create in IV Studio**. The business is linked to the shared workspace and Studio opens a native project with the campaign, offer, audience, voice, visual direction and source evidence in its creative notes.
3. Work on the project in Studio using its existing tools. When ready, open **Hivemind**, select that handoff, choose the finished picture/video files, review a caption and network, then select **Prepare in IV Signal**.
4. Signal opens a native unapproved post draft with the selected media copied into its own library. Review the wording, media, alt text and network checks before using Signal's existing approval/publishing controls.

Outreach can also hand a brief directly to Signal. It arrives as an idea; no caption is invented. Email/Website briefs do not silently become a social-network version.

## Shared businesses

Open Hivemind → Shared businesses to create or edit a shared profile. **Share current business** connects an existing native business. **Use in this app** imports a shared profile or returns to its existing linked record; unrelated similarly named businesses are never silently merged.

Name, website, offer, audience, voice, visual direction, location, goal, color and selected logo are shared. Linked Outreach and Signal business basics reconcile while their windows are open (approximately every four seconds). Concurrent changes in both places require an explicit choice of which profile to keep. App-specific fields such as Signal's Never say rules, channel connections, credentials, approvals and mailbox settings are not transferred. Studio reads the same shared businesses and saves a dated profile snapshot with each prepared project. Existing creative notes and post drafts are not rewritten when the brand changes.

## Contract and storage

- `%APPDATA%\IV Workspace\workspace.db`: independent SQLite WAL database, contract version 1. Brands have optimistic revisions; links are scoped by app and native profile path. Handoffs are immutable `iv.handoff.v1` records with source/target, parent, selected asset IDs and per-profile draft receipts.
- `%APPDATA%\IV Workspace\assets`: selected files copied by SHA-256. File headers, extension, bounds and hashes are checked. Pictures max 30 MB; videos max 1 GB; logos PNG/JPG/WebP max 4 MB. No arbitrary paths or credentials in handoff URLs.
- App links: `iv-studio://workspace/<UUID>` and `iv-signal://workspace/<UUID>`. Cold and existing-instance paths accept only valid local handoff IDs. Cross-app buttons launch the registered installed app directly with the same ID, with no shell or network listener.
- A receiving app must register contract support by opening once. Missing/old apps leave a saved handoff and a clear update/open instruction. No clipboard fallback is described as a completed integration.
- Studio uses a deterministic native production ID; Signal stores its native draft and receipt in the same transaction. Reopening preserves existing edits and cannot reapprove or republish anything.
- This is a same-OS-user local boundary, not isolation from malicious programs already running as that user. There is no cloud sync, SSO, general shared-library browser or social analytics feedback in this phase.

The common source lives in Outreach's `src/service/iv-workspace*.js` and `src/renderer/src/components/IVWorkspace.*`. Run `node scripts/sync-iv-workspace.mjs <Studio checkout> <Signal checkout>` to copy it to explicit app worktrees. Keep the contract and tests compatible across releases. Native adapters live in each app's `src/service/iv-workspace-import.js`.

Test profiles use their own isolated workspace unless `IV_WORKSPACE_DIR` explicitly points all three at a disposable shared directory. Studio Incognito cannot access the shared workspace. The integration does not transfer tokens, accounts, agent sessions, full lead lists or unrelated files. Sharing context never authorizes generation, spending, scheduling, approval or publication.

## Validation and rollout

- Outreach's regression suite includes shared contract/revision/URL/media tests.
- Studio's native import test proves one prepared project with evidence and no generation; its existing graph parity and tours checks remain applicable.
- Signal's import tests prove draft-only behavior, retry safety and transaction rollback.
- `node scripts/iv-workspace-ui-check.mjs [--packaged]` exercises three isolated windows, native draft navigation, selected media, shared profile reconciliation, duplicate protection, cold launch, responsive layouts and zero approvals/deliveries. It expects the two explicitly prepared source checkouts under `.runtime/iv-connect/`.

Back up the three native profiles before installation. Outreach's native schema remains 6; the shared store is separate. Signal 0.1.6 includes the existing 0.1.4 migrations when upgrading an older installed version. Rollback to the respective prior installers and retain the shared folder for recovery; older apps ignore it. Do not remove generated projects or drafts just because an app was downgraded.

Next phases: selecting existing Studio library outputs without a file picker, an app-wide shared asset browser, progress callbacks from generation/publishing, then optional account and cross-device synchronization.

Hivemind is the shared workspace name across all three products. Existing internal IDs, app links and the legacy IV Workspace storage folder are retained so saved brands and handoffs remain available. Studio builds and their source patches stay private.

Hivemind uses the supplied IV eye/infinity logo unchanged. A short animated mark accompanies handoffs and draft preparation; reduced-motion mode uses a static indicator. Logo and transitions do not change action permissions.
