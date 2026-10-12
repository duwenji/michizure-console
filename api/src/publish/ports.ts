import type { ChannelEntry, CollectionEntry, Keyset, RevokedEntry, Signer, SignedDocument } from '@michizure-console/protocol';

/** What started a publication (DM-001 PUBLICATION.trigger). */
export type Trigger = 'approve' | 'revoke' | 'transfer' | 'keyset' | 'daily' | 'manual';

export interface PublicationRecord {
  seq: number;
  issuedAt: string;
  expiresAt: string;
  sha256: string;
  size: number;
  keyId: string;
  archiveKey: string;
  trigger: Trigger;
  channelCount: number;
  revokedCount: number;
  collectionCount: number;
  revokedCollectionCount: number;
}

/**
 * A listed channel: its entry, and what the publisher adds up into `media` and `resourcesSize`
 * from the collections listed now (DM-001 M-24, DES-009 M-4). Channels approved before DES-007
 * have no [material].
 */
export interface ListedChannel {
  entry: ChannelEntry;
  material?: { ownPrefetchBytes: number; ownMedia: string[]; collections: string[] };
}

export interface SigningKeyRecord {
  keyId: string;
  kmsKeyArn: string;
  status: 'registered' | 'active' | 'retiring' | 'revoked';
}

/** Thrown when another publication took the next `seq` first (DM-001 M-11). */
export class SeqConflictError extends Error {
  constructor(expected: number | null) {
    super(`the publication head moved from seq ${String(expected)}`);
  }
}

/** The data the publisher reads and writes (DynamoDB in AWS, memory in tests and local runs). */
export interface PublicationStore {
  /** The latest publication's seq, or null before the first one. */
  headSeq(): Promise<number | null>;
  /** Every channel to list: the latest approved version of each active channel (DM-001 M-8, AP-10). */
  listedChannels(now: Date): Promise<ListedChannel[]>;
  /** Every collection to list (DM-001 M-24, AP-26). */
  listedCollections(now: Date): Promise<CollectionEntry[]>;
  /** Channel revocations still to be listed (within [since, now]) (DM-001 M-9, AP-11). */
  revocations(since: Date): Promise<RevokedEntry[]>;
  /** Collection revocations still to be listed (DM-001 M-25, AP-27). */
  collectionRevocations(since: Date): Promise<RevokedEntry[]>;
  /** Stops listing revocations older than [before]. */
  expireRevocations(before: Date): Promise<void>;
  /** The keyset the root key signed last (AP-15). */
  currentKeyset(): Promise<SignedDocument | null>;
  signingKey(keyId: string): Promise<SigningKeyRecord | null>;
  /** Records the publication if the head is still [previousSeq]; throws [SeqConflictError] otherwise. */
  recordPublication(previousSeq: number | null, record: PublicationRecord): Promise<void>;
}

/** Where the documents go: the public bucket behind CloudFront, and the private archive. */
export interface DocumentStorage {
  putPublic(path: string, body: Uint8Array, contentType: string, cacheControl: string): Promise<void>;
  putArchive(path: string, body: Uint8Array, contentType: string): Promise<void>;
}

export interface Cdn {
  invalidate(paths: string[]): Promise<void>;
}

export type SignerFor = (key: SigningKeyRecord) => Signer;

export type { Keyset };
