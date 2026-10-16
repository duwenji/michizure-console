import type { Schemas } from '@yorisoi-console/api-types';
/**
 * The machine review's outcome as API-001 C-19 gives it, for producers and operators alike:
 * the errors, how each declared collection resolved (channels), each outside resource, the
 * resources listed channels still use (D-8), and warnings that don't fail it.
 */
export declare function ValidationView({ validation }: {
    validation: Schemas['Validation'] | null | undefined;
}): import("react").JSX.Element;
/**
 * The version each app needs (DES-011 N-5). A version no app has yet (DES-007 J-9): the material
 * waits for an app that shows it.
 */
export declare function StageNote({ appStage, minAppVersions }: {
    appStage?: number | undefined;
    minAppVersions?: Record<string, number> | undefined;
}): import("react").JSX.Element | null;
/**
 * What a channel is for and needs, and the apps it is offered in (DES-011 N-9). Nothing before
 * the machine review has read the package.
 */
export declare function EcosystemNote({ activities, genres, requires, offeredIn }: {
    activities?: string[] | undefined;
    genres?: string[] | undefined;
    requires?: string[] | undefined;
    offeredIn?: string[] | undefined;
}): import("react").JSX.Element | null;
