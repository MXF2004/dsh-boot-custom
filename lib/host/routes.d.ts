/**
 * Host HTTP routes for the settings panel.
 *
 * These routes are the write/read path for every host that does not expose a
 * browser-side settings service (and the fallback for the 0.1.7 config editor
 * path). They are plain `node:http` handlers registered on `ctx.webServer`.
 *
 * Failure policy: every handler is wrapped, returns JSON in every branch, and
 * never lets an exception reach the server's request lifecycle.
 *
 * @module dsh-boot-custom/host/routes
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type BootAnimationConfig, type ConfigWriteMode } from '../shared/types.js';
/** Minimal structural face of the web-server service. */
export interface WebServerLike {
    register(route: {
        kind: 'exact' | 'prefix';
        path: string;
        handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
    }): () => void;
}
/** Host context needed to mount the routes. */
export interface RouteHostContext {
    webServer?: WebServerLike;
    effect(callback: () => (() => void) | void, label?: string): void;
}
/** Store face consumed by the routes. */
export interface RouteConfigStore {
    readonly mode: ConfigWriteMode;
    current(): BootAnimationConfig;
    save(next: unknown): Promise<BootAnimationConfig>;
    reset(): Promise<BootAnimationConfig>;
}
/** Register the config routes; no-op when the host has no web server. */
export declare function registerConfigRoutes(ctx: RouteHostContext, store: RouteConfigStore): void;
