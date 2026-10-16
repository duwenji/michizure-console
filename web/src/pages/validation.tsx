import type { Schemas } from '@yorisoi-console/api-types';
import { useSession } from '../main';
import { useLoad } from './common';

/**
 * The machine review's outcome as API-001 C-19 gives it, for producers and operators alike:
 * the errors, how each declared collection resolved (channels), each outside resource, the
 * resources listed channels still use (D-8), and warnings that don't fail it.
 */
export function ValidationView({ validation }: { validation: Schemas['Validation'] | null | undefined }) {
  if (!validation) return <span className="muted">—</span>;
  const v = validation;
  return (
    <div className="small">
      <div>{v.ok ? '合格' : '不合格'}{v.appStage !== undefined && v.appStage > 0 && `（アプリの段 ${v.appStage}）`}</div>
      {v.errors.map((x) => <div key={x.code + x.detail}><code>{x.code}</code> {x.detail}</div>)}
      {(v.collections ?? []).length > 0 && (
        <div>
          使う素材集:
          {v.collections!.map((c) => (
            <div key={c.as}>
              <code>{c.as}</code> → <code>{c.collectionId}</code> {c.status === 'usable' ? '使える' : <>使えない（<code>{c.code}</code> {c.detail}）</>}
            </div>
          ))}
        </div>
      )}
      {(v.external ?? []).length > 0 && (
        <div>
          外部の素材:
          {v.external!.map((e) => <div key={e.resourceId}><code>{e.resourceId}</code> {e.ok ? '大きさ・ハッシュが一致' : e.detail}</div>)}
        </div>
      )}
      {(v.inUse ?? []).length > 0 && (
        <div>
          公開中のチャンネルが使っている素材:
          {v.inUse!.map((u) => <div key={u.channelId + u.resourceId}><code>{u.channelId}</code> が <code>{u.resourceId}</code> を使っています（{u.detail}）</div>)}
        </div>
      )}
      {(v.warnings ?? []).map((w) => <div key={w.code + w.detail} className="warn">注意: <code>{w.code}</code> {w.detail}</div>)}
    </div>
  );
}

/**
 * The version each app needs (DES-011 N-5). A version no app has yet (DES-007 J-9): the material
 * waits for an app that shows it.
 */
export function StageNote({ appStage, minAppVersions }: { appStage?: number | undefined; minAppVersions?: Record<string, number> | undefined }) {
  if (appStage === undefined && minAppVersions === undefined) return null;
  const versions = Object.entries(minAppVersions ?? {});
  const usable = versions.filter(([, v]) => v < 9999);
  return (
    <span>
      {appStage !== undefined && `アプリの段 ${appStage}、`}必要なアプリの版 {usable.length ? usable.map(([app, v]) => `${app} ${v}`).join('・') : '—'}
      {usable.length === 0 && <span className="muted">（対応したアプリが出るまで、アプリの一覧に出ません）</span>}
    </span>
  );
}

const ACTIVITY: Record<string, string> = { walk: '散歩', cycle: 'サイクリング' };
const GENRE: Record<string, string> = { general: '話題を絞らない', history: '歴史', nature: '自然', food: '食', shopping: '買い物' };

/**
 * What a channel is for and needs, and the apps it is offered in (DES-011 N-9). Nothing before
 * the machine review has read the package.
 */
export function EcosystemNote({ activities, genres, requires, offeredIn }: {
  activities?: string[] | undefined; genres?: string[] | undefined; requires?: string[] | undefined; offeredIn?: string[] | undefined;
}) {
  if (!activities) return null;
  return (
    <span>
      過ごし方 {activities.map((a) => ACTIVITY[a] ?? a).join('・')}、ジャンル {(genres ?? []).map((g) => GENRE[g] ?? g).join('・') || '—'}、
      必要な機能 {(requires ?? []).length ? <code>{requires!.join(' ')}</code> : '—'}
      <div>
        このチャンネルが出るアプリ: {offeredIn?.length ? offeredIn.join('・') : <span className="muted">今はどのアプリにも出ません（過ごし方か必要な機能が、どのアプリにも合いません）</span>}
      </div>
    </span>
  );
}

/** Where the review policy says what promotion may be (platform 審査基準 2.4). */
const PROMOTION_POLICY = 'https://github.com/duwenji/yorisoi-platform/blob/main/docs/channel-review-policy.md#24-宣伝';

/** The declaration on a submission form (DES-012 R-1, R-6). */
export function PromotionalField({ checked, onChange, what }: { checked: boolean; onChange: (v: boolean) => void; what: string }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      宣伝を含む（店舗・企業・施設・商品の紹介が主な目的の{what}）。宣伝は素材の中だけで、期限つきの割引やキャンペーンは入れられません（<a href={PROMOTION_POLICY} target="_blank" rel="noreferrer">審査基準 2.4</a>）。
      アプリでは「宣伝を含む」と示され、散策者は設定で宣伝の素材を止められます
    </label>
  );
}

/** Whether a submission or version declares promotion (DES-012 R-6). */
export function PromotionalNote({ declared }: { declared: boolean | undefined }) {
  return declared ? <strong>宣伝を含む（申告あり）</strong> : <span className="muted">申告なし</span>;
}

/**
 * The declared collections that are promotional now, which mark the channel too (DES-012 R-4, R-6).
 * Nothing when none is.
 */
export function PromotedCollections({ ids }: { ids: string[] }) {
  const { api } = useSession();
  const promoted = useLoad(async () => {
    const found = await Promise.all(ids.map(async (collectionId) => (await api.GET('/api/collections/{collectionId}', { params: { path: { collectionId } } })).data));
    return found.filter((c) => c?.listed && c.latestApproved?.promotional).map((c) => c!.collectionId);
  }, [api, ids.join(' ')]);
  if (!promoted.data?.length) return null;
  return <div>宣伝の素材集を使っています: {promoted.data.join('・')}（リストでは「宣伝を含む」と示されます）</div>;
}
