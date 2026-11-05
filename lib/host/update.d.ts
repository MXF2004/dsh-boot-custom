/**
 * In-page update support.
 *
 * The settings panel asks the host to compare its running version with the
 * latest GitHub Release and, when a newer release exists, hands the release
 * tarball to DSH's own Plugin Manager. Using the managed install path (rather
 * than spawning pnpm ourselves) keeps profile locking, bundle validation,
 * rollback and HMR/reload behavior in one place.
 *
 * Update state lives on `globalThis`: a successful HMR reload replaces this
 * module while the client may still be polling, and the state has to survive
 * that reload. The browser sees only GitHub release metadata and the fixed
 * install command; it never chooses an arbitrary install spec.
 *
 * @module dsh-boot-custom/host/update
 */
import { type RouteHostContext } from './routes.js';
/** GitHub release data resolved for the settings panel. */
export interface UpdateInfo {
    current: string;
    latest: string;
    available: boolean;
    /** False when the host cannot apply updates through Plugin Manager. */
    canApply: boolean;
    assetUrl?: string;
    releaseUrl?: string;
    notes?: string;
    /** Command to run when the host cannot apply the update itself. */
    manual?: string;
}
/** Successful or refused release lookup. */
export type UpdateCheck = ({
    ok: true;
} & UpdateInfo) | {
    ok: false;
    error: string;
};
/** Managed install face of `@deepseek-ai/dsh-plugin-manager`. */
export interface PluginManagerLike {
    installBundle(spec: string, options?: {
        enabled?: boolean;
        saveExact?: boolean;
        requestId?: string;
    }): Promise<unknown>;
}
/** Host context needed by the update routes. */
export interface UpdateHostContext extends RouteHostContext {
    get?(name: string): unknown;
    pluginManager?: unknown;
}
/** Observable update phase shared with the settings panel. */
export interface UpdateState {
    phase: 'idle' | 'running' | 'done' | 'failed';
    current: string;
    latest?: string;
    startedAt?: number;
    finishedAt?: number;
    application?: string;
    restartRequired?: boolean;
    error?: string;
}
/** Result of starting an update. */
export type BeginUpdate = {
    ok: true;
    state: UpdateState;
} | {
    ok: false;
    status: number;
    error: string;
    manual?: string;
};
/** Test seams for the routes. */
export interface UpdateRouteOptions {
    check?(current: string, canApply: boolean): Promise<UpdateCheck>;
    manager?: PluginManagerLike;
}
/** Copy the current update state for the browser. */
export declare function readUpdateState(): UpdateState;
interface ParsedVersion {
    core: [number, number, number];
    prerelease: string[];
}
/** Parse `v1.2.3[-pre][+build]`; undefined for anything else. */
export declare function parseVersion(value: string): ParsedVersion | undefined;
/** Compare two semantic versions; 0 when either input is unparsable. */
export declare function compareVersions(left: string, right: string): number;
/** Read one release payload without trusting anything beyond the fixed repo. */
export declare function parseLatestRelease(payload: unknown, current: string, canApply: boolean): UpdateCheck;
/** Query the fixed public repository for its latest release. */
export declare function checkForUpdate(options: {
    current: string;
    canApply: boolean;
    fetch?: typeof fetch;
    timeoutMs?: number;
}): Promise<UpdateCheck>;
/** Resolve the Plugin Manager service without assuming it is active. */
export declare function resolvePluginManager(ctx: UpdateHostContext): PluginManagerLike | undefined;
/** Manual fallback shown when the host has no Plugin Manager. */
export declare function manualUpdateCommand(assetUrl: string): string;
/** Start a managed install of the release asset and return immediately. */
export declare function beginUpdate(info: UpdateInfo, manager: PluginManagerLike | undefined): BeginUpdate;
/**
 * Register the check/start/status routes.
 *
 * @param ctx - host context with webServer and optional Plugin Manager.
 * @param writeToken - per-activation session token.
 * @param options - test seams.
 */
export declare function registerUpdateRoutes(ctx: UpdateHostContext, writeToken: string, options?: UpdateRouteOptions): void;
export {};
