/**
 * Host configuration store.
 *
 * Resolves one normalized configuration from the three supported layers and
 * persists writes back through the best available seam:
 *
 *   1. `ctx.configEditor.edit(entryId, config)` — DSH >= 0.1.7, where the
 *      bundle entry's volatile fields are the settings document.
 *   2. the `boot-custom` settings namespace — the 0.1.x fallback.
 *   3. `<profile>/boot-custom/config.json` — the final fallback, also used
 *      when both services are unavailable.
 *
 * Every method is total: failures are logged with `console.warn` and degrade
 * to the last good value. A broken store must never keep the GUI from booting.
 *
 * @module dsh-boot-custom/host/store
 */
import { type BootAnimationConfig, type ConfigWriteMode } from '../shared/types.js';
/** Minimal structural face of the cordis context used by this store. */
export interface StoreHostContext {
    settings?: SettingsServiceLike;
    configEditor?: ConfigEditorLike;
    /** Optional service lookup (the 0.2.x host exposes services through it). */
    get?(name: string): unknown;
    /** The owning Loader entry of this activation (0.2.x config editor input). */
    fiber?: {
        entry?: unknown;
    };
    loader?: {
        entries(): Iterable<unknown>;
    };
    root?: {
        loader?: {
            entries(): Iterable<unknown>;
        };
    };
}
/** One registered settings namespace owner scope (0.1.x). */
export interface SettingsScopeLike {
    get(): unknown;
    watch?(callback: (next: unknown, prev: unknown) => void): () => void;
    update?(patch: object): Promise<void>;
    replace?(section: object): Promise<void>;
}
/** The settings provider face used here. */
export interface SettingsServiceLike {
    register(namespace: string, schema: unknown, options?: {
        applies?: 'live' | 'restart';
    }): SettingsScopeLike;
    describe?(options?: {
        redactSecrets?: boolean;
    }): Array<{
        ns: string;
        user?: unknown;
    }>;
}
/**
 * The 0.2.x config editor face.
 *
 * Real signature (extracted from `@deepseek-ai/dsh-config-editor` 0.2.1):
 * `edit(entry, change)` where `entry` is the OWNING LOADER ENTRY (not the row
 * id) and `change(current, inherited)` derives the next raw config. A row id
 * string is rejected by the service.
 */
export interface ConfigEditorLike {
    edit(entry: unknown, change: (current: unknown, inherited: unknown) => unknown): unknown;
}
/**
 * Read one configuration field, accepting both shapes the host may deliver:
 * a volatile reference (call `.get()`) or a plain value.
 */
export declare function readField(value: unknown): unknown;
/** Read the profile directory that owns this installation's data. */
export declare function resolveProfileDir(): string;
/** Absolute path of the JSON fallback document. */
export declare function resolveConfigFile(): string;
/**
 * Resolve the config editor service.
 *
 * 0.2.x exposes services through `ctx.get`, while a static cordis context also
 * carries them as properties; both are probed so the plugin works under the
 * static loader and the dynamic-plugin facade alike.
 */
export declare function resolveConfigEditor(ctx: StoreHostContext): ConfigEditorLike | undefined;
/**
 * Resolve this activation's owning Loader entry.
 *
 * `ConfigEditor.edit(entry, change)` takes the entry object, never the row id
 * string. `ctx.fiber.entry` is the direct path; `loader.entries()` is the
 * fallback for contexts that hide the fiber.
 */
export declare function resolveConfigEntry(ctx: StoreHostContext): unknown;
/** Host configuration store. */
export declare class HostConfigStore {
    /** Resolved persistence seam. */
    readonly mode: ConfigWriteMode;
    private readonly ctx;
    /** Raw `apply(ctx, config)` argument: volatile references live here. */
    private readonly entryRaw;
    private entryValues;
    private readonly filePath;
    private readonly scope;
    /** 0.2.x editor service and the owning Loader entry it requires. */
    private readonly editor;
    private readonly editorEntry;
    private unsubscribe;
    private value;
    private disposed;
    /** Cache the parsed JSON file until its size/mtime changes. */
    private fileCache;
    /** An oversized file is preserved, never silently overwritten. */
    private fileOversized;
    /** Set after reset/migration so a file that could not be deleted is ignored. */
    private fileIgnored;
    /**
     * @param ctx - host context (settings / configEditor are optional).
     * @param entryConfig - the `config` argument handed to `apply`.
     */
    constructor(ctx: StoreHostContext, entryConfig: unknown);
    /** The current normalized configuration. */
    current(): BootAnimationConfig;
    /** Re-resolve the store (settings change, volatile update or file edit). */
    refresh(): void;
    /**
     * Persist one complete configuration and return the normalized value.
     * Throws only after logging, so the HTTP route can report a real failure;
     * no plugin lifecycle path calls this.
     */
    save(next: unknown): Promise<BootAnimationConfig>;
    /** Restore defaults through the active seam. */
    reset(): Promise<BootAnimationConfig>;
    /** Release the settings subscription. */
    dispose(): void;
    /** Read (never throw on) the JSON fallback document. */
    private readFile;
    /** Delete the legacy JSON document after migration/reset. */
    private removeFile;
    /** Atomically write the JSON fallback document. */
    private writeFile;
}
