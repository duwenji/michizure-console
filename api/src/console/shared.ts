import { GetCommand, QueryCommand, type QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import type { Schemas } from '@yorisoi-console/api-types';
import { appsFor, FORMAT1_ECOSYSTEM, KNOWN_APPS } from '@yorisoi-console/protocol';
import type { Deps } from './deps.js';
import { fail, limit, type Request } from './http.js';
import { jstDate } from './util.js';

// Reading and showing the table's items, shared by the operator and publisher routes.

export type Item = Record<string, unknown>;

/** DM-001 M-2・M-19; an operator can change them per account. */
export const DEFAULT_LIMITS = { channels: 5, collections: 5, uploadsPerDay: 20, ticketsPerDay: 10 };

/** An account's roles (DM-001 M-16); one with none written is a publisher. */
export function rolesOf(item: Item): ('publisher' | 'producer')[] {
  return Array.isArray(item.roles) ? (item.roles as ('publisher' | 'producer')[]) : ['publisher'];
}

export async function get(deps: Deps, PK: string, SK: string): Promise<Item | undefined> {
  return (await deps.db.send(new GetCommand({ TableName: deps.table, Key: { PK, SK }, ConsistentRead: true }))).Item;
}

export async function page(deps: Deps, req: Request, input: Omit<QueryCommandInput, 'TableName' | 'Limit' | 'ExclusiveStartKey'>) {
  const out = await deps.db.send(
    new QueryCommand({ ...input, TableName: deps.table, Limit: limit(req), ExclusiveStartKey: deps.cursors.decode(req.query.cursor) }),
  );
  return { items: out.Items ?? [], nextCursor: deps.cursors.encode(out.LastEvaluatedKey) };
}

/** The account as the API shows it; the identity check's record only to operators (API-001 C-17). */
export async function publisherView(deps: Deps, item: Item, forOperator = false): Promise<Schemas['Publisher']> {
  const quota = await get(deps, `PUB#${String(item.publisherId)}`, `QUOTA#${jstDate(deps.now())}`);
  return {
    publisherId: String(item.publisherId),
    displayName: String(item.displayName ?? ''),
    ...(item.contact !== undefined ? { contact: String(item.contact) } : {}),
    status: item.status as Schemas['PublisherStatus'],
    ...(item.statusReason ? { statusReason: String(item.statusReason) } : {}),
    activeAccountId: (item.activeAccountId as string | undefined) ?? null,
    roles: rolesOf(item),
    producerVerified: item.producerVerification !== undefined,
    ...(forOperator && item.producerVerification ? { producerVerification: item.producerVerification as Schemas['Verification'] } : {}),
    limits: { ...DEFAULT_LIMITS, ...((item.limits as object | undefined) ?? {}) },
    usage: {
      channels: Number(item.channelCount ?? 0),
      collections: Number(item.collectionCount ?? 0),
      uploadsToday: Number(quota?.uploads ?? 0),
      ticketsToday: Number(quota?.tickets ?? 0),
    },
    rev: Number(item.rev),
    createdAt: String(item.createdAt),
    updatedAt: String(item.updatedAt),
  };
}

export async function loadPublisher(deps: Deps, publisherId: string): Promise<Item> {
  return (await get(deps, `PUB#${publisherId}`, 'PUB')) ?? fail('not_found', `no publisher ${publisherId}`);
}

export async function channelView(deps: Deps, item: Item): Promise<Schemas['Channel']> {
  const revocations = await deps.db.send(
    new QueryCommand({
      TableName: deps.table,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :r)',
      ExpressionAttributeValues: { ':pk': `CH#${String(item.channelId)}`, ':r': 'REVOKE#' },
    }),
  );
  return {
    channelId: String(item.channelId),
    publisherId: String(item.publisherId),
    status: item.status as 'active' | 'revoked',
    pendingSubmissionId: (item.pendingSubmissionId as string | undefined) ?? null,
    latestApproved: (item.latestApproved as Schemas['LatestApproved'] | undefined) ?? null,
    listed: item.GSI2PK === 'LISTED',
    ...(item.latestApproved ? { offeredIn: offeredIn(item.latestApproved as { activities?: string[]; requires?: string[] }) } : {}),
    publisherChange: (item.publisherChange as Schemas['Channel']['publisherChange']) ?? null,
    revocations: (revocations.Items ?? []).map((r) => ({
      ...(r.versions ? { versions: r.versions as number[] } : {}),
      reason: String(r.reason),
      severity: r.severity as 'high' | 'low',
      revokedAt: String(r.revokedAt),
    })),
    rev: Number(item.rev),
    createdAt: String(item.createdAt),
    updatedAt: String(item.updatedAt),
  };
}

export async function loadChannel(deps: Deps, channelId: string): Promise<Item> {
  return (await get(deps, `CH#${channelId}`, 'CH')) ?? fail('not_found', `no channel ${channelId}`);
}

// ---- collections (DM-001) ----

async function revocationsOf(deps: Deps, pk: string) {
  const out = await deps.db.send(
    new QueryCommand({ TableName: deps.table, KeyConditionExpression: 'PK = :pk AND begins_with(SK, :r)', ExpressionAttributeValues: { ':pk': pk, ':r': 'REVOKE#' } }),
  );
  return (out.Items ?? []).map((r) => ({
    ...(r.versions ? { versions: r.versions as number[] } : {}),
    reason: String(r.reason),
    severity: r.severity as 'high' | 'low',
    revokedAt: String(r.revokedAt),
  }));
}

export async function collectionView(deps: Deps, item: Item): Promise<Schemas['Collection']> {
  return {
    collectionId: String(item.collectionId),
    publisherId: String(item.publisherId),
    status: item.status as 'active' | 'revoked',
    pendingSubmissionId: (item.pendingSubmissionId as string | undefined) ?? null,
    latestApproved: (item.latestApproved as Schemas['CollectionLatestApproved'] | undefined) ?? null,
    listed: item.GSI2PK === 'LISTED',
    producerChange: (item.producerChange as Schemas['Collection']['producerChange']) ?? null,
    externalCheck: (item.externalCheck as Schemas['Collection']['externalCheck']) ?? null,
    revocations: await revocationsOf(deps, `COL#${String(item.collectionId)}`),
    rev: Number(item.rev),
    createdAt: String(item.createdAt),
    updatedAt: String(item.updatedAt),
  };
}

export async function loadCollection(deps: Deps, collectionId: string): Promise<Item> {
  return (await get(deps, `COL#${collectionId}`, 'COL')) ?? fail('not_found', `no collection ${collectionId}`);
}

export function collectionSubmissionView(item: Item): Schemas['CollectionSubmission'] {
  return {
    kind: 'collection',
    submissionId: String(item.submissionId),
    collectionId: String(item.collectionId),
    version: (item.version as number | undefined) ?? null,
    accountId: String(item.accountId),
    state: item.state as Schemas['SubmissionState'],
    ...(item.note !== undefined ? { note: String(item.note) } : {}),
    promotional: item.promotional === true,
    sha256: (item.sha256 as string | undefined) ?? null,
    size: (item.size as number | undefined) ?? null,
    validation: (item.validation as Schemas['Validation'] | undefined) ?? null,
    decision: (item.decision as Schemas['Decision'] | undefined) ?? null,
    submittedAt: (item.submittedAt as string | undefined) ?? null,
    decidedAt: (item.decidedAt as string | undefined) ?? null,
    rev: Number(item.rev),
    createdAt: String(item.createdAt),
    updatedAt: String(item.updatedAt),
  };
}

export async function loadCollectionSubmission(deps: Deps, collectionId: string, submissionId: string): Promise<Item> {
  const item = await get(deps, `COL#${collectionId}`, `SUB#${submissionId}`);
  return item?.type === 'submission' ? item : fail('not_found', `no submission ${submissionId}`);
}

/**
 * The names of the apps a channel is offered in (DES-011 N-9): for one of its activities, with what
 * it requires. A review or approval from before DES-011 is format 1's: walking, nothing required.
 */
export function offeredIn(values: { activities?: string[]; requires?: string[] }): string[] {
  return appsFor(values.activities ?? FORMAT1_ECOSYSTEM.activities, values.requires ?? FORMAT1_ECOSYSTEM.requires).map((id) => KNOWN_APPS[id]!.name);
}
