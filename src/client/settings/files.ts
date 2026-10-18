/**
 * Local-file helpers for the settings panel.
 *
 * The desktop renderer is sandboxed: a picked `File` usually has no readable
 * absolute path. The panel therefore offers three outcomes:
 *  - store the real `file:///…` path when the Electron bridge exposes it;
 *  - preview through a temporary Object URL (never persisted);
 *  - convert to base64 only when the user explicitly chooses the
 *    cross-device carry option.
 *
 * @module dsh-boot-custom/client/settings/files
 */

import { toMediaUrl } from '../../shared/config.js'
import { LIMITS } from '../../shared/types.js'
import { extensionOf, filePathOf, readFileAsDataUrl } from '../runtime/env.js'

/** Media families the panel can import. */
export type FileKind = 'video' | 'audio'

/** Accepted extensions. */
const EXTENSIONS: Record<FileKind, readonly string[]> = {
  video: ['mp4', 'webm', 'mov'],
  audio: ['mp3', 'wav', 'ogg'],
}

/** Result of inspecting a picked file. */
export interface InspectedFile {
  /** True when the extension/MIME family matches the picker. */
  allowed: boolean
  /** Real absolute path, when the renderer exposes one. */
  path?: string
  /** Persisted media source (`file:///…`) for a real path. */
  source?: string
  /** Temporary Object URL, created only when no real path exists. */
  objectUrl?: string
  /** Advisory: prefer a path over embedding this file. */
  large: boolean
  /** The file exceeds the hard base64 ceiling for its family. */
  tooLargeForBase64: boolean
  name: string
  size: number
}

/** Accepted `accept` attribute for a picker. */
export function acceptFor(kind: FileKind): string {
  return kind === 'video'
    ? 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov'
    : 'audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg'
}

/** Whether a file looks like the requested family. */
function matchesFamily(file: File, kind: FileKind): boolean {
  const extension = extensionOf(file)
  if (EXTENSIONS[kind].includes(extension)) return true
  return file.type.toLowerCase().startsWith(`${kind}/`)
}

/** Inspect a picked file without reading it. */
export function inspectFile(file: File, kind: FileKind): InspectedFile {
  const allowed = matchesFamily(file, kind)
  const path = allowed ? filePathOf(file) : undefined
  const objectUrl = allowed && path === undefined ? URL.createObjectURL(file) : undefined
  const cap = kind === 'video' ? LIMITS.maxBase64SourceBytes : LIMITS.maxDataAudioChars / 1.4
  return {
    allowed,
    ...(path === undefined ? {} : { path, source: toMediaUrl(path) }),
    ...(objectUrl === undefined ? {} : { objectUrl }),
    large: file.size > LIMITS.largeFileBytes,
    tooLargeForBase64: file.size > cap,
    name: file.name,
    size: file.size,
  }
}

/** Read a file as a data URL for persistence. */
export async function fileToDataUrl(file: File, kind: FileKind): Promise<string> {
  const cap = kind === 'video' ? LIMITS.maxBase64SourceBytes : Math.floor(LIMITS.maxDataAudioChars / 1.4)
  return readFileAsDataUrl(file, cap)
}

/** Release an Object URL without throwing. */
export function revokeObjectUrl(url: string): void {
  try {
    URL.revokeObjectURL(url)
  } catch {
    // Already revoked.
  }
}

/** Human-readable family label. */
export function familyLabel(kind: FileKind): string {
  return kind === 'video' ? '视频' : '音频'
}
