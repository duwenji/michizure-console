import type { Schemas } from '@michizure-console/api-types';
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
/** The declaration on a submission form (DES-012 R-1, R-6). */
export declare function PromotionalField({ checked, onChange, what }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    what: string;
}): import("react").JSX.Element;
/** Whether a submission or version declares promotion (DES-012 R-6). */
export declare function PromotionalNote({ declared }: {
    declared: boolean | undefined;
}): import("react").JSX.Element;
/**
 * The declared collections that are promotional now, which mark the channel too (DES-012 R-4, R-6).
 * Nothing when none is.
 */
export declare function PromotedCollections({ ids }: {
    ids: string[];
}): import("react").JSX.Element | null;
