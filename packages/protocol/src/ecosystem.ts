/**
 * The ecosystem's vocabulary (SanpoGuide API-003 2.0, ADR-003 E-9), as `core-format` holds it.
 * Values are added there first; keep these in step when the console takes a new core-format.
 */
export const ACTIVITIES = ['walk', 'cycle'] as const;
export const GENRES = ['general', 'history', 'nature', 'food', 'shopping'] as const;
export const FEATURES = [
  'slot:guide', 'slot:companion',
  'trigger:spot', 'trigger:point', 'trigger:event',
  'present:speak', 'present:card', 'present:notify', 'present:sheet', 'present:play', 'present:ambient', 'present:fullscreen',
] as const;

/** The apps of the ecosystem, by the id `minAppVersions` and `grants.apps` use (API-002 P-20, API-004 I-11). */
export const APP_IDS = ['sanpoguide'] as const;

/** What a channel written in format 1 is (API-003 G-6). */
export const FORMAT1_ECOSYSTEM = { activities: ['walk'], genres: [] as string[], requires: [] as string[] };

/** Version numbers no app has: what a channel or collection gets for an app that can't use it (API-002 P-21). */
export const NO_APP_VERSION = 9999;
