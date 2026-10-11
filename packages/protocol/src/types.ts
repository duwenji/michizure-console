/** API-002: the signed document form (P-3). */
export interface SignedDocument {
  payload: string;
  keyId: string;
  sig: string;
}

/** API-002 P-8: the channel list is a body plus a signed digest of it. */
export interface ChannelListDocument {
  payload: string;
  digest: SignedDocument;
}

export interface Keyset {
  type: 'keyset';
  provider: string;
  seq: number;
  issuedAt: string;
  keys: SigningKeyEntry[];
  revokedKeys: string[];
}

export interface SigningKeyEntry {
  keyId: string;
  publicKey: string;
  notBefore: string;
  notAfter: string;
}

export interface Discovery {
  provider: string;
  name: string;
  versions: string[];
  list: string;
  rootKey: string;
  keyset: SignedDocument;
  reviewPolicyUrl?: string;
  termsUrl?: string;
  contact?: string;
}

export interface ChannelEntry {
  id: string;
  version: number;
  publisher: string;
  publisherName: string;
  publisherChange?: { from: string; at: string; reason: string };
  name: string;
  summary: string;
  description?: string;
  lang: string[];
  tags?: string[];
  regions?: string[];
  icon: { url: string; sha256: string };
  package: { url: string; sha256: string; size: number; format: number };
  minAppVersion: number;
  approvedAt: string;
  /** The kinds of material it uses, with its collections' (API-002 1.2 P-14). */
  media?: string[];
  /** Bytes fetched ahead when the channel is chosen, its collections included (P-14). */
  resourcesSize?: number;
}

/** One entry of `collections[]` (API-002 1.2 P-10・P-15). */
export interface CollectionEntry {
  id: string;
  version: number;
  producer: string;
  producerName: string;
  producerChange?: { from: string; at: string; reason: string };
  name: string;
  summary: string;
  media: string[];
  resourcesSize: number;
  tags: string[];
  regions?: string[];
  grants: { publishers: '*' | string[] };
  package: { url: string; sha256: string; size: number; format: number };
  minAppVersion: number;
  approvedAt: string;
}

export interface RevokedEntry {
  id: string;
  versions?: number[];
  reason: string;
  revokedAt: string;
}

export interface ChannelList {
  type: 'channel-list';
  format: 1;
  provider: string;
  seq: number;
  issuedAt: string;
  expiresAt: string;
  channels: ChannelEntry[];
  revoked: RevokedEntry[];
  /** API-002 1.2; absent in lists from before it. */
  collections?: CollectionEntry[];
  /** Kept apart from `revoked`: collection ids are another namespace (P-11). */
  revokedCollections?: RevokedEntry[];
}

export interface ChannelListDigest {
  type: 'channel-list-digest';
  provider: string;
  seq: number;
  issuedAt: string;
  expiresAt: string;
  sha256: string;
  size: number;
}
