/**
 * Host half of the DSH boot animation plugin (`dsh-boot-custom`).
 *
 * Responsibilities:
 *  - resolve and persist user configuration (0.1.7 `configEditor` → 0.1.x
 *    `ctx.settings` → `<profile>/boot-custom/config.json`);
 *  - push the first-frame mask into the web server's structured injection
 *    table (`webserver/index-inject`), so the desktop carrier renders it
 *    through `collectIndexInjections()` without touching `dist/index.html`;
 *  - publish the resolved configuration to the browser half as a global row
 *    on every index render;
 *  - serve the read/write routes used by the settings panel.
 *
 * Hard rule: nothing in this file may throw out of `apply`. The DSH web boot
 * fails the whole GUI when a plugin activation throws, so every path logs a
 * warning and degrades instead.
 *
 * @module dsh-boot-custom
 */
import { type RouteHostContext } from './host/routes.js';
import { Config } from './host/schema.js';
import { type StoreHostContext } from './host/store.js';
export { Config };
/**
 * Bundle row id, package name and host export are deliberately the same
 * string: `cordis.patch.yml` resolves the module by package name, and the
 * loader keys the entry by this id.
 */
export declare const name = "dsh-boot-custom";
/**
 * Required services. `webServer` is the HTTP carrier that renders the index
 * (the desktop GUI is served over loopback HTTP) and owns the event this
 * plugin injects into. It is part of the shipped desktop profile.
 */
export declare const inject: string[];
/** Minimal structural face of the cordis context used by the host half. */
interface HostContext extends StoreHostContext, RouteHostContext {
    effect(callback: () => (() => void) | void, label?: string): unknown;
    on(event: string, listener: (...args: never[]) => void): unknown;
}
/**
 * Plugin activation.
 *
 * @param ctx - host context.
 * @param config - the entry's effective configuration (volatile references on
 *   0.1.7+, plain values on older hosts).
 */
export declare function apply(ctx: HostContext, config?: unknown): void;
