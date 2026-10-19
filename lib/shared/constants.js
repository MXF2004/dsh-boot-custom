/**
 * Cross-half identifiers. The values in this file are the naming contract:
 * the package name, the bundle patch row id and the host module's `name`
 * export are all `PACKAGE_NAME`, and the settings namespace / route prefix /
 * injected globals derive from it so the halves can never drift apart.
 *
 * @module dsh-boot-custom/shared/constants
 */
/** Package name, `cordis.patch.yml` row id and host export `name`. */
export const PACKAGE_NAME = 'dsh-boot-custom';
/** Release version mirrored into diagnostics and the injected meta row. */
export const PLUGIN_VERSION = '1.0.1';
/** Settings namespace used on hosts that predate `ctx.configEditor`. */
export const SETTINGS_NAMESPACE = 'boot-custom';
/** Directory name under the profile dir used by the JSON fallback store. */
export const DATA_DIR_NAME = 'boot-custom';
/** Exact route paths registered on the host web server. */
export const ROUTES = {
    config: '/plugins/dsh-boot-custom/config',
    reset: '/plugins/dsh-boot-custom/config/reset',
};
/** `globalThis` keys published by the first-frame injection. */
export const GLOBALS = {
    config: '__BOOT_ANIM_CONFIG__',
    meta: '__BOOT_ANIM_META__',
    firstFrame: '__BOOT_ANIM_FIRST_FRAME__',
    firstFrameClaimed: '__BOOT_ANIM_FIRST_FRAME_CLAIMED__',
    bootReady: '__DSH_BOOT_READY__',
};
/** DOM ids for the injected first-frame mask and the client style tag. */
export const DOM_IDS = {
    firstFrame: 'dsh-boot-custom-first-frame',
    clientStyle: 'dsh-boot-custom-style',
    settingsStyle: 'dsh-boot-custom-settings-style',
    overlaySlot: 'dsh-boot-custom-slot',
    overlayRoot: 'dsh-boot-custom-root',
};
/** Classes toggled on `<html>` while a full-window presentation is active. */
export const DOC_CLASSES = {
    /** Hides the Settings modal while a preview owns the whole window. */
    previewing: 'dba-previewing',
};
/** localStorage key remembering the sequential video cursor. */
export const SEQUENCE_STORAGE_KEY = 'dsh-boot-custom.sequence';
/** Slot keys this plugin contributes to. */
export const SLOTS = {
    overlay: 'shell.overlay',
    settingsSection: 'settings.section',
};
