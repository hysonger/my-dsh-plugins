/** Host platform admission shared by the plugin entry, guard, and settings service. */

/** Operating systems where this plugin activates at all. */
export const SUPPORTED_PLATFORMS = Object.freeze(['darwin', 'win32']);

/** Operating systems where the global, persistent sleep disable exists. */
export const PERSISTENT_SLEEP_PLATFORMS = Object.freeze(['darwin']);

export function isSupportedPlatform(platform) {
  return SUPPORTED_PLATFORMS.includes(platform);
}

export function supportsPersistentSleep(platform) {
  return PERSISTENT_SLEEP_PLATFORMS.includes(platform);
}
