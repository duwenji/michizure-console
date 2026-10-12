import type { Schemas } from '@sanpo-console/api-types';

/**
 * The machine review's outcome as API-001 1.1 C-19 gives it, for producers and operators alike:
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

/** A minAppVersion no app has yet (DES-007 J-9): the material waits for an app that shows it. */
export function StageNote({ appStage, minAppVersion }: { appStage?: number | undefined; minAppVersion?: number | undefined }) {
  if (appStage === undefined && minAppVersion === undefined) return null;
  return (
    <span>
      {appStage !== undefined && `アプリの段 ${appStage}、`}必要なアプリの版 {minAppVersion ?? '—'}
      {(minAppVersion ?? 0) >= 9999 && <span className="muted">（素材に対応したアプリが出るまで、アプリの一覧に出ません）</span>}
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
