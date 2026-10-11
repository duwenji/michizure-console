import type { Schemas } from '@sanpo-console/api-types';
/**
 * The machine review's outcome as API-001 1.1 C-19 gives it, for producers and operators alike:
 * the errors, how each declared collection resolved (channels), each outside resource, the
 * resources listed channels still use (D-8), and warnings that don't fail it.
 */
export declare function ValidationView({ validation }: {
    validation: Schemas['Validation'] | null | undefined;
}): import("react").JSX.Element;
/** A minAppVersion no app has yet (DES-007 J-9): the material waits for an app that shows it. */
export declare function StageNote({ appStage, minAppVersion }: {
    appStage?: number | undefined;
    minAppVersion?: number | undefined;
}): import("react").JSX.Element | null;
