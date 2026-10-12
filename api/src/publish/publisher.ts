import {
  b64url,
  NO_APP_VERSION,
  payloadBytes,
  providerId,
  signChannelList,
  verifyChannelList,
  verifyDiscovery,
  type ChannelEntry,
  type CollectionEntry,
  type Discovery,
  type SigningKeyEntry,
} from '@michizure-console/protocol';
import type { Cdn, DocumentStorage, ListedChannel, PublicationRecord, PublicationStore, SignerFor, Trigger } from './ports.js';

export const DISCOVERY_PATH = '.well-known/sanpo-channels';
export const LIST_PATH = 'v1/channels.json';

const DAY = 24 * 3600_000;

export interface ProviderConfig {
  /** The root public key pinned in the configuration (ADR-001 A-9); everything published must chain to it. */
  rootPublicKey: Uint8Array;
  name: string;
  reviewPolicyUrl?: string;
  termsUrl?: string;
  contact?: string;
  /** How long a list stays valid; at most 14 days (API-002). */
  listLifetimeDays?: number;
  /** How long a revocation stays in `revoked` (DM-001 M-9). */
  revokedDays?: number;
  /**
   * The version each app needs to show promotion (DES-012 R-5, SanpoGuide ADR-002 D-36); an app
   * without one gets a version no app has, so promotion reaches no app that can't label it.
   */
  promotionalMinAppVersions?: Record<string, number>;
}

export interface PublishDeps {
  store: PublicationStore;
  storage: DocumentStorage;
  cdn: Cdn;
  signerFor: SignerFor;
  config: ProviderConfig;
  now?: () => Date;
}

/** The signing key to use now: in the keyset, in its validity, not revoked, and active in the store. */
async function pickSigningKey(deps: PublishDeps, keys: SigningKeyEntry[], revoked: string[], now: Date) {
  const candidates = keys
    .filter((k) => !revoked.includes(k.keyId) && Date.parse(k.notBefore) <= now.getTime() && now.getTime() < Date.parse(k.notAfter))
    .sort((a, b) => Date.parse(b.notBefore) - Date.parse(a.notBefore));
  for (const key of candidates) {
    const record = await deps.store.signingKey(key.keyId);
    if (record?.status === 'active') return { entry: key, record };
  }
  throw new Error('no active signing key in the current keyset');
}

/**
 * A channel's entry with what its collections add (DES-009 M-4): its media and theirs, its prefetch
 * and theirs. A collection not listed now adds nothing (the app can't use it either).
 */
export function withMaterial(listed: ListedChannel, collections: Map<string, CollectionEntry>): ChannelEntry {
  const { entry, material } = listed;
  if (!material) return entry;
  const used = material.collections.map((id) => collections.get(id)).filter((c): c is CollectionEntry => c !== undefined);
  return {
    ...entry,
    media: [...new Set([...material.ownMedia, ...used.flatMap((c) => c.media)])].sort(),
    resourcesSize: material.ownPrefetchBytes + used.reduce((sum, c) => sum + c.resourcesSize, 0),
  };
}

/** A channel that declares a promotional collection listed now is promotional too (DES-012 R-4). */
export function withPromotion(listed: ListedChannel, channel: ChannelEntry, collections: Map<string, CollectionEntry>): ChannelEntry {
  const declared = listed.material?.collections ?? [];
  return !channel.promotional && declared.some((id) => collections.get(id)?.promotional) ? { ...channel, promotional: true } : channel;
}

/**
 * Raises what a promotional entry needs to the versions that label promotion (DES-012 R-5, API-002
 * P-17). `minAppVersion` follows SanpoGuide's, as approval sets it (DES-011 N-6).
 */
export function promotedVersions<T extends ChannelEntry | CollectionEntry>(entry: T, promotionalMinAppVersions: Record<string, number>): T {
  if (!entry.promotional) return entry;
  const needs = (app: string, version: number) => Math.max(version, promotionalMinAppVersions[app] ?? NO_APP_VERSION);
  if (!entry.minAppVersions) return { ...entry, minAppVersion: needs('sanpoguide', entry.minAppVersion) };
  const minAppVersions = Object.fromEntries(Object.entries(entry.minAppVersions).map(([app, v]) => [app, needs(app, v)]));
  return { ...entry, minAppVersions, minAppVersion: minAppVersions.sanpoguide ?? NO_APP_VERSION };
}

/**
 * Builds the channel list from the store, signs its digest, checks the result as an app would,
 * and puts it out (ADR-001 A-10). Safe to run at any time: each run takes the next `seq`.
 */
export async function publish(deps: PublishDeps, trigger: Trigger): Promise<PublicationRecord> {
  const now = (deps.now ?? (() => new Date()))();
  const { config, store } = deps;

  const provider = providerId(config.rootPublicKey);
  const keysetDoc = (await store.currentKeyset()) ?? fail('no keyset has been registered');
  const discovery: Discovery = {
    provider,
    name: config.name,
    versions: ['v1'],
    list: `/${LIST_PATH}`,
    rootKey: b64url.encode(config.rootPublicKey),
    keyset: keysetDoc,
    ...(config.reviewPolicyUrl ? { reviewPolicyUrl: config.reviewPolicyUrl } : {}),
    ...(config.termsUrl ? { termsUrl: config.termsUrl } : {}),
    ...(config.contact ? { contact: config.contact } : {}),
  };
  // The keyset must be signed by the pinned root key.
  const { keyset } = verifyDiscovery(discovery, { expectedProvider: provider });

  const { entry, record: keyRecord } = await pickSigningKey(deps, keyset.keys, keyset.revokedKeys, now);
  const signer = deps.signerFor(keyRecord);
  if (signer.keyId !== entry.keyId) fail(`signer for ${entry.keyId} says it is ${signer.keyId}`);

  const previousSeq = await store.headSeq();
  const seq = (previousSeq ?? 0) + 1;
  const lifetimeDays = Math.min(config.listLifetimeDays ?? 14, 14);
  const since = new Date(now.getTime() - (config.revokedDays ?? 7) * DAY);
  const [listed, collections, revoked, revokedCollections] = await Promise.all([
    store.listedChannels(now),
    store.listedCollections(now),
    store.revocations(since),
    store.collectionRevocations(since),
  ]);
  const byId = new Map(collections.map((c) => [c.id, c]));
  const promotionalMin = config.promotionalMinAppVersions ?? {};
  const channels = listed.map((c) => promotedVersions(withPromotion(c, withMaterial(c, byId), byId), promotionalMin));
  const listedCollections = collections.map((c) => promotedVersions(c, promotionalMin));
  const { document, digest } = await signChannelList(
    { provider: keyset.provider, seq, issuedAt: now, expiresAt: new Date(now.getTime() + lifetimeDays * DAY), channels, revoked, collections: listedCollections, revokedCollections },
    signer,
  );

  // Never put out what an app would reject (e.g. a KMS key that isn't the one in the keyset).
  const verified = verifyChannelList(document, keyset, { now, minSeq: seq });
  if (verified.signingKey.keyId !== entry.keyId) fail('signed with an unexpected key');

  const listBytes = payloadBytes(document);
  const record: PublicationRecord = {
    seq,
    issuedAt: digest.issuedAt,
    expiresAt: digest.expiresAt,
    sha256: digest.sha256,
    size: digest.size,
    keyId: entry.keyId,
    archiveKey: `published/${seq}.json`,
    trigger,
    channelCount: channels.length,
    revokedCount: revoked.length,
    collectionCount: collections.length,
    revokedCollectionCount: revokedCollections.length,
  };
  await store.recordPublication(previousSeq, record);
  await deps.storage.putArchive(record.archiveKey, listBytes, 'application/json');
  await deps.storage.putPublic(LIST_PATH, listBytes, 'application/json', 'public, max-age=300');
  await deps.storage.putPublic(DISCOVERY_PATH, payloadBytes(discovery), 'application/json', 'public, max-age=300');
  await deps.cdn.invalidate([`/${LIST_PATH}`, `/${DISCOVERY_PATH}`]);
  await store.expireRevocations(new Date(now.getTime() - (config.revokedDays ?? 7) * DAY));
  return record;
}

function fail(message: string): never {
  throw new Error(message);
}
