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
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DATA_DIR_NAME, PACKAGE_NAME, SETTINGS_NAMESPACE } from '../shared/constants.js';
import { deepClone, deepMerge, isRecord, normalizeConfig } from '../shared/config.js';
import { DEFAULT_CONFIG } from '../shared/defaults.js';
import { LIMITS } from '../shared/types.js';
import { SettingsSchema } from './schema.js';
/** True when two JSON-shaped values are structurally equal. */
function deepEqual(left, right) {
    if (left === right)
        return true;
    if (Array.isArray(left) && Array.isArray(right)) {
        if (left.length !== right.length)
            return false;
        return left.every((entry, index) => deepEqual(entry, right[index]));
    }
    if (isRecord(left) && isRecord(right)) {
        const leftKeys = Object.keys(left);
        const rightKeys = Object.keys(right);
        if (leftKeys.length !== rightKeys.length)
            return false;
        return leftKeys.every((key) => key in right && deepEqual(left[key], right[key]));
    }
    return false;
}
/**
 * Read one configuration field, accepting both shapes the host may deliver:
 * a volatile reference (call `.get()`) or a plain value.
 */
export function readField(value) {
    if (value !== null && typeof value === 'object' && typeof value.get === 'function') {
        try {
            return value.get();
        }
        catch {
            return undefined;
        }
    }
    return value;
}
/** Read the profile directory that owns this installation's data. */
export function resolveProfileDir() {
    const env = process.env;
    const explicit = env.DSH_PROFILE_DIR?.trim();
    if (explicit !== undefined && explicit.length > 0)
        return resolve(explicit);
    const home = env.DSH_HOME?.trim();
    const base = home !== undefined && home.length > 0 ? home : join(homedir(), '.dsh');
    return join(base, 'profiles', env.DSH_PROFILE?.trim() || 'desktop');
}
/** Absolute path of the JSON fallback document. */
export function resolveConfigFile() {
    return join(resolveProfileDir(), DATA_DIR_NAME, 'config.json');
}
/** Keys that belong to this plugin (used to detect an entry-level config). */
const CONFIG_KEYS = Object.keys(DEFAULT_CONFIG);
/**
 * Project the bundle entry config onto known keys, resolving volatile
 * references. Returns only keys the host actually delivered.
 */
function readEntryValues(raw) {
    if (!isRecord(raw))
        return {};
    const out = {};
    for (const key of CONFIG_KEYS) {
        if (!(key in raw))
            continue;
        const value = readField(raw[key]);
        if (value !== undefined)
            out[key] = value;
    }
    return out;
}
/** True when any known key carries a value different from its default. */
function hasOverrides(values) {
    return Object.keys(values).some((key) => !deepEqual(values[key], DEFAULT_CONFIG[key]));
}
/** Serialize a config for a settings/schema store (JSON-shaped, no references). */
function toPlain(value) {
    const source = isRecord(value) ? value : {};
    const out = {};
    for (const key of CONFIG_KEYS) {
        if (key in source)
            out[key] = deepClone(source[key]);
    }
    return out;
}
/** Resolve the settings provider, preferring the facade-safe optional lookup. */
function resolveSettingsService(ctx) {
    try {
        const viaGet = ctx.get?.('settings');
        if (viaGet !== null && typeof viaGet === 'object')
            return viaGet;
    }
    catch {
        // Optional lookup unavailable.
    }
    try {
        return ctx.settings;
    }
    catch {
        // Direct service access is gated on some host facades.
        return undefined;
    }
}
/** Thin, never-throwing wrapper around the settings provider registration. */
function tryRegisterSettings(ctx) {
    const settings = resolveSettingsService(ctx);
    if (settings === undefined || settings === null || typeof settings.register !== 'function')
        return undefined;
    try {
        return settings.register(SETTINGS_NAMESPACE, SettingsSchema, { applies: 'live' });
    }
    catch (error) {
        console.warn('[dsh-boot-custom] settings namespace unavailable; using the JSON store:', error);
        return undefined;
    }
}
/** Read the current user section of this namespace, when the provider exposes it. */
function readUserSection(ctx) {
    const settings = resolveSettingsService(ctx);
    if (settings === undefined || typeof settings.describe !== 'function')
        return undefined;
    try {
        const descriptor = settings.describe({ redactSecrets: true }).find((entry) => entry.ns === SETTINGS_NAMESPACE);
        return isRecord(descriptor?.user) ? descriptor.user : {};
    }
    catch {
        return undefined;
    }
}
/**
 * Resolve the config editor service.
 *
 * 0.2.x exposes services through `ctx.get`, while a static cordis context also
 * carries them as properties; both are probed so the plugin works under the
 * static loader and the dynamic-plugin facade alike.
 */
export function resolveConfigEditor(ctx) {
    try {
        const viaGet = ctx.get?.('configEditor');
        if (viaGet !== null && typeof viaGet === 'object' && typeof viaGet.edit === 'function') {
            return viaGet;
        }
    }
    catch {
        // Optional lookup is not available on this host.
    }
    let direct;
    try {
        direct = ctx.configEditor;
    }
    catch {
        direct = undefined;
    }
    if (direct !== undefined && direct !== null && typeof direct.edit === 'function')
        return direct;
    return undefined;
}
/**
 * Resolve this activation's owning Loader entry.
 *
 * `ConfigEditor.edit(entry, change)` takes the entry object, never the row id
 * string. `ctx.fiber.entry` is the direct path; `loader.entries()` is the
 * fallback for contexts that hide the fiber.
 */
export function resolveConfigEntry(ctx) {
    try {
        const own = ctx.fiber?.entry;
        if (own !== undefined)
            return own;
    }
    catch {
        // Fiber not exposed.
    }
    try {
        const loader = ctx.loader ?? ctx.root?.loader;
        if (loader !== undefined && typeof loader.entries === 'function') {
            for (const entry of loader.entries()) {
                const options = isRecord(entry) && isRecord(entry.options) ? entry.options : undefined;
                if (options?.id === PACKAGE_NAME)
                    return entry;
            }
        }
    }
    catch {
        // Loader not reachable from this context.
    }
    return undefined;
}
/** Host configuration store. */
export class HostConfigStore {
    /** Resolved persistence seam. */
    mode;
    ctx;
    /** Raw `apply(ctx, config)` argument: volatile references live here. */
    entryRaw;
    entryValues;
    filePath;
    scope;
    /** 0.2.x editor service and the owning Loader entry it requires. */
    editor;
    editorEntry;
    unsubscribe;
    value;
    disposed = false;
    /**
     * @param ctx - host context (settings / configEditor are optional).
     * @param entryConfig - the `config` argument handed to `apply`.
     */
    constructor(ctx, entryConfig) {
        this.ctx = ctx;
        this.entryRaw = entryConfig;
        this.entryValues = readEntryValues(entryConfig);
        this.filePath = resolveConfigFile();
        this.editor = resolveConfigEditor(ctx);
        this.editorEntry = this.editor === undefined ? undefined : resolveConfigEntry(ctx);
        if (this.editor !== undefined && this.editorEntry !== undefined) {
            // 0.2.x: the entry's volatile config IS the settings document.
            this.mode = 'config-editor';
            this.scope = undefined;
            this.value = normalizeConfig(deepMerge(DEFAULT_CONFIG, this.entryValues));
            return;
        }
        this.scope = tryRegisterSettings(ctx);
        if (this.scope !== undefined) {
            this.mode = 'settings';
            const file = this.readFile();
            const user = readUserSection(ctx) ?? {};
            const entryOverrides = hasOverrides(this.entryValues) ? this.entryValues : {};
            this.value = normalizeConfig(deepMerge(deepMerge(DEFAULT_CONFIG, deepMerge(file.value, user)), entryOverrides));
            // One-shot migration: an existing JSON document fills an empty user
            // section, so upgrades from the file fallback keep their settings.
            if (file.exists && Object.keys(user).length === 0 && hasOverrides(toPlain(file.value))) {
                try {
                    if (typeof this.scope.update === 'function') {
                        void this.scope.update(toPlain(file.value)).catch((error) => {
                            console.warn('[dsh-boot-custom] settings migration failed:', error);
                        });
                    }
                }
                catch (error) {
                    console.warn('[dsh-boot-custom] settings migration failed:', error);
                }
            }
            try {
                if (typeof this.scope.watch === 'function') {
                    this.unsubscribe = this.scope.watch(() => this.refresh());
                }
            }
            catch (error) {
                console.warn('[dsh-boot-custom] settings watch unavailable:', error);
            }
            return;
        }
        // No config editor, no settings provider: the JSON document is the store.
        this.mode = 'file';
        const file = this.readFile();
        this.value = normalizeConfig(deepMerge(deepMerge(DEFAULT_CONFIG, file.value), this.entryValues));
    }
    /** The current normalized configuration. */
    current() {
        return this.value;
    }
    /** Re-resolve the store (settings change, volatile update or file edit). */
    refresh() {
        if (this.disposed)
            return;
        try {
            // Volatile references are stable objects whose `.get()` changes in
            // place, so re-read the raw entry config on every refresh.
            this.entryValues = readEntryValues(this.entryRaw);
            if (this.mode === 'config-editor') {
                this.value = normalizeConfig(deepMerge(DEFAULT_CONFIG, this.entryValues));
                return;
            }
            if (this.mode === 'settings' && this.scope !== undefined) {
                const user = readUserSection(this.ctx);
                if (user !== undefined) {
                    const file = this.readFile();
                    const entryOverrides = hasOverrides(this.entryValues) ? this.entryValues : {};
                    this.value = normalizeConfig(deepMerge(deepMerge(DEFAULT_CONFIG, deepMerge(file.value, user)), entryOverrides));
                    return;
                }
                const resolved = this.scope.get();
                this.value = normalizeConfig(deepMerge(DEFAULT_CONFIG, resolved));
                return;
            }
            const file = this.readFile();
            this.value = normalizeConfig(deepMerge(deepMerge(DEFAULT_CONFIG, file.value), this.entryValues));
        }
        catch (error) {
            console.warn('[dsh-boot-custom] configuration refresh failed; keeping the last good value:', error);
        }
    }
    /**
     * Persist one complete configuration and return the normalized value.
     * Throws only after logging, so the HTTP route can report a real failure;
     * no plugin lifecycle path calls this.
     */
    async save(next) {
        const normalized = normalizeConfig(next);
        try {
            if (this.mode === 'config-editor') {
                const editor = this.editor;
                if (editor === undefined || this.editorEntry === undefined) {
                    throw new Error('config editor entry is no longer available');
                }
                // 0.2.x contract: edit(entry, change) — entry is the Loader entry and
                // the change callback returns the next raw config.
                await Promise.resolve(editor.edit(this.editorEntry, () => normalized));
            }
            else if (this.mode === 'settings' && this.scope !== undefined) {
                if (typeof this.scope.replace !== 'function')
                    throw new Error('settings scope is read-only');
                await this.scope.replace(toPlain(normalized));
            }
            else {
                this.writeFile(normalized);
            }
            this.value = normalized;
            return this.value;
        }
        catch (error) {
            console.warn('[dsh-boot-custom] configuration write failed:', error);
            throw error;
        }
    }
    /** Restore defaults through the active seam. */
    async reset() {
        if (this.mode === 'settings' && this.scope !== undefined && typeof this.scope.replace === 'function') {
            try {
                // Replacing with an empty section re-inherits every schema default.
                await this.scope.replace({});
                this.value = normalizeConfig(DEFAULT_CONFIG);
                return this.value;
            }
            catch (error) {
                console.warn('[dsh-boot-custom] settings reset failed:', error);
            }
        }
        return this.save(DEFAULT_CONFIG);
    }
    /** Release the settings subscription. */
    dispose() {
        this.disposed = true;
        try {
            this.unsubscribe?.();
        }
        catch {
            // A disposed provider may already have dropped the watcher.
        }
        this.unsubscribe = undefined;
    }
    /** Read (never throw on) the JSON fallback document. */
    readFile() {
        try {
            if (!existsSync(this.filePath))
                return { exists: false, value: {} };
            const text = readFileSync(this.filePath, 'utf8');
            if (text.length > LIMITS.maxBodyBytes) {
                console.warn('[dsh-boot-custom] config.json is oversized; ignoring it');
                return { exists: false, value: {} };
            }
            const parsed = JSON.parse(text);
            return { exists: true, value: isRecord(parsed) ? parsed : {} };
        }
        catch (error) {
            console.warn('[dsh-boot-custom] config.json could not be read:', error);
            return { exists: false, value: {} };
        }
    }
    /** Atomically write the JSON fallback document. */
    writeFile(config) {
        const dir = dirname(this.filePath);
        mkdirSync(dir, { recursive: true });
        const temporary = `${this.filePath}.${process.pid}.tmp`;
        writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
        renameSync(temporary, this.filePath);
    }
}
