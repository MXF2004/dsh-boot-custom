/**
 * Host-side schemastery schemas.
 *
 * Two schemas share one shape:
 *  - {@link Config} is the bundle entry's schema. Every top-level field is
 *    `.volatile()`, which is what DSH >= 0.1.7 projects into the entry's
 *    settings form and what makes `ctx.configEditor.edit()` accept a write.
 *    On schemastery < 3.18.4 — or a host that predates the volatile seam —
 *    the marker is inert and the field behaves as ordinary configuration.
 *  - {@link SettingsSchema} is the plain schema registered as the
 *    `boot-custom` settings namespace on hosts that predate
 *    `ctx.configEditor` (the 0.1.x fallback documented in the README).
 *
 * Both resolve exactly the same defaults, so a value that round-trips through
 * either store is indistinguishable once normalized by `shared/config.ts`.
 *
 * @module dsh-boot-custom/host/schema
 */
import z from '@deepseek-ai/schemastery';
/**
 * Schemastery's builder types are intentionally precise; the shape factory
 * below is structural, so it works on the unconstrained nodes with a local
 * `any` at the two seams that need it (enum construction and the optional
 * volatile marker). The exported schemas keep their full inferred types.
 */
type AnyNode = {
    default(value: unknown): AnyNode;
    volatile?: () => AnyNode;
};
/**
 * The bundle entry's schema: every top-level field is a volatile anchor.
 * This is the contract that makes the 0.1.7 settings form render and
 * `configEditor.edit(entryId, …)` accept writes.
 */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    version: AnyNode;
    enabled: AnyNode;
    mode: AnyNode;
    cssAnimation: AnyNode;
    allowSkip: AnyNode;
    bootDuration: AnyNode;
    videos: AnyNode;
    videoMode: AnyNode;
    playing: AnyNode;
    logo: AnyNode;
    greeting: AnyNode;
    progress: AnyNode;
    countdown: AnyNode;
    transition: AnyNode;
    audio: AnyNode;
}>>, Schemastery.ObjectT<NoInfer<{
    version: AnyNode;
    enabled: AnyNode;
    mode: AnyNode;
    cssAnimation: AnyNode;
    allowSkip: AnyNode;
    bootDuration: AnyNode;
    videos: AnyNode;
    videoMode: AnyNode;
    playing: AnyNode;
    logo: AnyNode;
    greeting: AnyNode;
    progress: AnyNode;
    countdown: AnyNode;
    transition: AnyNode;
    audio: AnyNode;
}>>, "plain">;
/**
 * The plain namespace schema used by the 0.1.x `ctx.settings` fallback.
 * No volatile markers: the resolved value must be plain JSON so it can be
 * persisted in the settings document.
 */
export declare const SettingsSchema: z<Schemastery.ObjectS<NoInfer<{
    version: AnyNode;
    enabled: AnyNode;
    mode: AnyNode;
    cssAnimation: AnyNode;
    allowSkip: AnyNode;
    bootDuration: AnyNode;
    videos: AnyNode;
    videoMode: AnyNode;
    playing: AnyNode;
    logo: AnyNode;
    greeting: AnyNode;
    progress: AnyNode;
    countdown: AnyNode;
    transition: AnyNode;
    audio: AnyNode;
}>>, Schemastery.ObjectT<NoInfer<{
    version: AnyNode;
    enabled: AnyNode;
    mode: AnyNode;
    cssAnimation: AnyNode;
    allowSkip: AnyNode;
    bootDuration: AnyNode;
    videos: AnyNode;
    videoMode: AnyNode;
    playing: AnyNode;
    logo: AnyNode;
    greeting: AnyNode;
    progress: AnyNode;
    countdown: AnyNode;
    transition: AnyNode;
    audio: AnyNode;
}>>, "plain">;
export {};
