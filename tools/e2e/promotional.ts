import { CloudFormationClient, DescribeStackResourcesCommand, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { b64url, utf8 } from '@yorisoi-console/protocol';
import { zipSync } from 'fflate';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ulid } from '../../api/src/console/util.js';
import { checkProvider } from '../../conformance/src/check.js';
import { createKey, sha256, sign, signPackage, type PublisherKey } from '../../web/src/publisher-crypto.js';

/**
 * Promotion on the dev environment, for the app (DES-012, SanpoGuide ADR-002 D-29〜D-36): a text-only
 * collection declared promotional, and a channel (not declared) that shows it as a card and speaks
 * it when chosen (API-003 `event: select`). The list must mark both promotional, with the versions
 * `promotionalMinAppVersions` sets; then the conformance checks (C-P1).
 *
 * `--keep` leaves them listed so SanpoGuide (the emulator) can be checked; `--cleanup` removes them.
 */
const region = 'ap-northeast-1';
const stack = 'YorisoiConsole-dev';
const stateFile = join(tmpdir(), 'sanpo-e2e-promotional.json');
const cfn = new CloudFormationClient({ region });
const outputs = new Map(((await cfn.send(new DescribeStacksCommand({ StackName: stack }))).Stacks?.[0]?.Outputs ?? []).map((o) => [o.OutputKey!, o.OutputValue!]));
const resources = (await cfn.send(new DescribeStackResourcesCommand({ StackName: stack }))).StackResources ?? [];
const consoleFn = resources.find((r) => r.ResourceType === 'AWS::Lambda::Function' && r.LogicalResourceId?.startsWith('ConsoleConsoleApi'))!.PhysicalResourceId!;
const table = outputs.get('TableName')!;
const intakeBucket = outputs.get('IntakeBucketName')!;
const providerUrl = outputs.get('ProviderUrl')!;
const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const lambda = new LambdaClient({ region });
const s3 = new S3Client({ region });
const enc = new TextEncoder();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

async function invoke(sub: string, groups: string, method: string, path: string, options: { body?: unknown; ifMatch?: number } = {}) {
  const event = {
    rawPath: path,
    headers: options.ifMatch !== undefined ? { 'if-match': `"${options.ifMatch}"` } : {},
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    requestContext: { requestId: 'e2e-promotional', http: { method }, authorizer: { jwt: { claims: { sub, 'cognito:groups': groups } } } },
  };
  const res = await lambda.send(new InvokeCommand({ FunctionName: consoleFn, Payload: utf8.encode(JSON.stringify(event)) }));
  const out = JSON.parse(utf8.decode(res.Payload!));
  const body = out.body ? JSON.parse(out.body) : undefined;
  if (out.statusCode >= 400) throw new Error(`${method} ${path}: ${out.statusCode} ${out.body}`);
  return body;
}

/** A collection package signed as a producer signs it (API-004 `collection-package`). */
async function signCollection(files: Record<string, Uint8Array>, key: PublisherKey, id: string, version: number): Promise<Uint8Array> {
  const hashes: Record<string, string> = {};
  for (const name of Object.keys(files).sort()) hashes[name] = hex(await sha256(files[name]!));
  const payload = enc.encode(JSON.stringify({ type: 'collection-package', collection: id, version, producer: key.accountId, files: hashes }));
  const signature = enc.encode(JSON.stringify({ payload: b64url.encode(payload), publisherKey: b64url.encode(key.publicKey), sig: b64url.encode(await sign(key, payload)) }));
  return zipSync({ ...files, 'signature.json': signature });
}

async function waitFor<T>(what: string, read: () => Promise<T | undefined>, ms = 180_000): Promise<T> {
  for (let t = Date.now(); Date.now() - t < ms; await sleep(3000)) {
    const v = await read();
    if (v !== undefined) return v;
  }
  throw new Error(`timed out waiting for ${what}`);
}

const get = async (PK: string, SK: string) => (await db.send(new GetCommand({ TableName: table, Key: { PK, SK }, ConsistentRead: true }))).Item;

async function listBody(): Promise<{ channels: Record<string, unknown>[]; collections?: Record<string, unknown>[] }> {
  const doc = await (await fetch(`${providerUrl}/v1/channels.json?${Date.now()}`)).json();
  return JSON.parse(utf8.decode(b64url.decode(doc.payload)));
}

interface State { operatorSub: string; partitions: string[]; seeded: { PK: string; SK: string }[] }

async function cleanup(state: State) {
  for (const pk of state.partitions) {
    const rest = await db.send(new QueryCommand({ TableName: table, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': pk } }));
    for (const item of rest.Items ?? []) await db.send(new DeleteCommand({ TableName: table, Key: { PK: item.PK, SK: item.SK } }));
  }
  for (const item of state.seeded) await db.send(new DeleteCommand({ TableName: table, Key: { PK: item.PK, SK: item.SK } }));
  await invoke(state.operatorSub, '[operator]', 'POST', '/api/admin/publications', { body: { reason: '宣伝の通しの確認の後片付け' } }).catch((e) => console.error(e));
  rmSync(stateFile, { force: true });
  console.log('cleaned up; the list is being rebuilt without', state.partitions.join(', '));
}

if (process.argv.includes('--cleanup')) {
  await cleanup(JSON.parse(readFileSync(stateFile, 'utf8')) as State);
  process.exit(0);
}
const keep = process.argv.includes('--keep');

const stamp = Date.now().toString(36);
const producer = (await createKey('e2e-producer-passphrase')).key;
const publisher = (await createKey('e2e-publisher-passphrase')).key;
const producerSub = `e2e-producer-${stamp}`;
const publisherSub = `e2e-publisher-${stamp}`;
const operatorSub = `e2e-operator-${stamp}`;
const producerId = ulid();
const publisherId = ulid();
const collectionId = `e2e-ads-${stamp}`;
const channelId = `e2e-shops-${stamp}`;
const colSid = ulid();
const chSid = ulid();
const now = new Date().toISOString();

const collectionJson = {
  format: 1, id: collectionId, version: 1, producer: producer.accountId, name: '小町通りのお店', summary: 'お店の紹介（宣伝）', lang: 'ja',
  grants: { publishers: '*' },
  resources: [
    { id: 'shop', type: 'text', file: 'resources/text/shop.md', tags: ['shopping'], about: { type: 'spot', osm: 'way/123456', name: '鶴岡八幡宮', lat: 35.326, lon: 139.5565 } },
  ],
};
const collectionZip = await signCollection(
  { 'collection.json': enc.encode(JSON.stringify(collectionJson)), 'resources/text/shop.md': enc.encode('小町通りの老舗の和菓子屋です。店先で焼きたてのせんべいが買えます。\n') },
  producer, collectionId, 1,
);
const channelJson = {
  format: 1, activities: ['walk'], id: channelId, version: 1, publisher: publisher.accountId, name: '小町通りの買い物', summary: 'お店の紹介を聞きながら歩く', lang: 'ja', greeting: '小町通りへようこそ。',
  talk: { level: 'quiet', events: { spot: true, revisit: false, milestone: false, rest: false, start: true, finish: true } },
  spots: { prefer: ['shop'], skip: [] }, guide: { length: 'short' }, mood: { tone: false, sound: 'auto' },
  collections: [{ as: 'ads', id: collectionId, minVersion: 1 }],
  cues: [{ id: 'chosen', trigger: { type: 'event', event: 'select' }, present: [{ as: 'card', source: ['ads#shop'] }, { as: 'speak', source: ['ads#shop'] }] }],
};
const channelZip = (await signPackage(zipSync({ 'channel.json': enc.encode(JSON.stringify(channelJson)) }), publisher, { channel: channelId })).zip;
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

const seeded = [
  { PK: `USER#${producerSub}`, SK: 'USER', type: 'user', publisherId: producerId },
  { PK: `PUB#${producerId}`, SK: 'PUB', type: 'publisher', publisherId: producerId, displayName: '小町通り商店会', status: 'active', roles: ['publisher', 'producer'], activeAccountId: producer.accountId, channelCount: 0, collectionCount: 1, rev: 2, createdAt: now, updatedAt: now },
  { PK: `PUB#${producerId}`, SK: `KEY#${producer.accountId}`, type: 'publisher-key', accountId: producer.accountId, status: 'active', boundAt: now },
  { PK: `COL#${collectionId}`, SK: 'COL', type: 'collection', kind: 'collection', collectionId, publisherId: producerId, status: 'active', rev: 1, pendingSubmissionId: colSid, createdAt: now, updatedAt: now, GSI1PK: `PUB#${producerId}`, GSI1SK: `COL#${collectionId}` },
  // Declared promotional by the producer (DES-012 R-1).
  { PK: `COL#${collectionId}`, SK: `SUB#${colSid}`, type: 'submission', kind: 'collection', submissionId: colSid, collectionId, publisherId: producerId, accountId: producer.accountId, state: 'uploading', intakeKey: `intake-col/${collectionId}/${colSid}.zip`, promotional: true, rev: 1, createdAt: now, updatedAt: now },
  { PK: `USER#${publisherSub}`, SK: 'USER', type: 'user', publisherId },
  { PK: `PUB#${publisherId}`, SK: 'PUB', type: 'publisher', roles: ['publisher'], publisherId, displayName: '鎌倉お買い物案内', status: 'active', activeAccountId: publisher.accountId, channelCount: 1, rev: 2, createdAt: now, updatedAt: now },
  { PK: `PUB#${publisherId}`, SK: `KEY#${publisher.accountId}`, type: 'publisher-key', accountId: publisher.accountId, status: 'active', boundAt: now },
  { PK: `CH#${channelId}`, SK: 'CH', type: 'channel', channelId, publisherId, status: 'active', rev: 1, pendingSubmissionId: chSid, createdAt: now, updatedAt: now, GSI1PK: `PUB#${publisherId}`, GSI1SK: `CH#${channelId}` },
  // Not declared: the list marks it for the collection it declares (R-4).
  { PK: `CH#${channelId}`, SK: `SUB#${chSid}`, type: 'submission', submissionId: chSid, channelId, publisherId, accountId: publisher.accountId, state: 'uploading', intakeKey: `intake/${channelId}/${chSid}.zip`, iconIntakeKey: `intake/${channelId}/${chSid}.png`, rev: 1, createdAt: now, updatedAt: now },
];
const state: State = {
  operatorSub, partitions: [`COL#${collectionId}`, `CH#${channelId}`, `PUB#${producerId}`, `PUB#${publisherId}`], seeded: seeded.map(({ PK, SK }) => ({ PK, SK })),
};

let ok = true;
try {
  writeFileSync(stateFile, JSON.stringify(state));
  for (const Item of seeded) await db.send(new PutCommand({ TableName: table, Item }));

  // 1. The collection: machine review and approval with the identity check.
  await s3.send(new PutObjectCommand({ Bucket: intakeBucket, Key: `intake-col/${collectionId}/${colSid}.zip`, Body: collectionZip, ContentType: 'application/zip' }));
  const colSub = await waitFor('the collection review', async () => {
    const s = await get(`COL#${collectionId}`, `SUB#${colSid}`);
    return s && s.state !== 'uploading' ? s : undefined;
  });
  console.log(`collection: ${String(colSub.state)}`, JSON.stringify(colSub.validation));
  if (colSub.state !== 'awaiting_review') throw new Error('the collection did not pass');
  const colStarted = await invoke(operatorSub, '[operator]', 'POST', `/api/admin/collections/${collectionId}/submissions/${colSid}/start`, { ifMatch: Number(colSub.rev) });
  await invoke(operatorSub, '[operator]', 'POST', `/api/admin/collections/${collectionId}/submissions/${colSid}/approve`, {
    body: { verification: { method: '通しの確認', detail: '開発用の環境での確認' } }, ifMatch: colStarted.rev,
  });
  await waitFor('the collection on the list', async () => (await listBody()).collections?.find((c) => c.id === collectionId));

  // 2. The channel that shows it when chosen.
  await s3.send(new PutObjectCommand({ Bucket: intakeBucket, Key: `intake/${channelId}/${chSid}.zip`, Body: channelZip, ContentType: 'application/zip' }));
  await s3.send(new PutObjectCommand({ Bucket: intakeBucket, Key: `intake/${channelId}/${chSid}.png`, Body: png, ContentType: 'image/png' }));
  const chSub = await waitFor('the channel review', async () => {
    const s = await get(`CH#${channelId}`, `SUB#${chSid}`);
    return s && s.state !== 'uploading' ? s : undefined;
  });
  console.log(`channel: ${String(chSub.state)}`, JSON.stringify(chSub.validation));
  if (chSub.state !== 'awaiting_review') throw new Error('the channel did not pass');
  const chStarted = await invoke(operatorSub, '[operator]', 'POST', `/api/admin/channels/${channelId}/submissions/${chSid}/start`, { ifMatch: Number(chSub.rev) });
  await invoke(operatorSub, '[operator]', 'POST', `/api/admin/channels/${channelId}/submissions/${chSid}/approve`, { body: {}, ifMatch: chStarted.rev });
  const listedCh = await waitFor('the channel on the list', async () => (await listBody()).channels.find((c) => c.id === channelId));
  const listedCol = (await listBody()).collections?.find((c) => c.id === collectionId);

  // 3. Both marked, with what promotionalMinAppVersions asks of SanpoGuide.
  for (const [what, e] of [['collection', listedCol], ['channel', listedCh]] as const) {
    const marked = e?.promotional === true;
    ok &&= marked;
    console.log(`  ${marked ? 'PASS' : 'FAIL'} ${what} promotional=${String(e?.promotional)} minAppVersions=${JSON.stringify(e?.minAppVersions)}`);
  }

  // 4. The conformance checks.
  const discovery = await (await fetch(`${providerUrl}/.well-known/sanpo-channels`)).json();
  const results = await checkProvider(providerUrl, { expectedProvider: discovery.provider });
  for (const r of results) console.log(`  ${r.status.toUpperCase().padEnd(4)} ${r.id} ${r.detail}`);
  ok &&= results.every((r) => r.status !== 'fail');
} catch (e) {
  ok = false;
  console.error(e);
} finally {
  if (keep && ok) console.log(`kept for the app check (${collectionId}, ${channelId}); remove with --cleanup`);
  else await cleanup(state);
}
process.exit(ok ? 0 : 1);
