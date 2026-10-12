# DES-012 宣伝を含むチャンネル・素材集（SanpoGuide ADR-002 T-13）

## 文書情報

| 項目 | 内容 |
|---|---|
| 文書ID | DES-012 |
| ドキュメント種別 | 機能設計書 |
| 対象システム/機能 | 管理 API（申請・承認）、公開（`api/src/publish`）、`packages/protocol`、準拠テスト、画面（`web`）、設定（`infra/lib/config.ts`）、利用ガイド |
| 関連Skill | feature-implementation-unified |
| 作成日 | 2026-10-12 |
| 作成者 | Claude（開発者との検討） |
| 承認者 | 開発者（1.0: 2026-10-12。未決事項は案のとおり。実装は PR でレビュー） |
| ステータス | 実装済（開発用に配備し、通しの確認済み） |
| 版 | 1.1 |

## 目的・背景

SanpoGuide の [ADR-002](https://github.com/duwenji/SanpoGuide/blob/main/docs/adr/ADR-002-material-producers.md) 1.2（D-29〜D-36）で、宣伝を目的としたチャンネル・素材集を表示つきで認めることにした。契約は 2026-10-11 に承認済み:

- [API-002 1.3](https://github.com/duwenji/SanpoGuide/blob/main/docs/channel-list-api.md): `channels[].promotional`・`collections[].promotional`（P-16）、古いアプリへの備え（P-17）
- [API-003 1.4](https://github.com/duwenji/SanpoGuide/blob/main/docs/channel-package-format.md)・審査基準 2.4: 審査で確かめること
- [API-004 1.4](https://github.com/duwenji/SanpoGuide/blob/main/docs/material-producer-api.md): 宣伝の素材集を基準で選ばない

本書は、管理システムがこれをどう実装するかを決める（ADR-002 T-13）。アプリ側の読み込みは `core-format` 1.3.0（T-12、2026-10-12 公開）で済んでいる。アプリの表示（T-14）はまだ。

## 対応元ID（トレーサビリティ）

| 対応元ID | 内容 | 対応状況 |
|---|---|---|
| SanpoGuide ADR-002 | D-31（申告と審査、宣伝の素材集を宣言するチャンネルにも付ける）、D-36（`promotionalMinAppVersion`） | 本書で実装 |
| SanpoGuide API-002 1.3 | P-16・P-17 | 本書で実装 |
| DES-011 | 未決事項 No.3（`promotionalMinAppVersion` もアプリごと） | 本書で解消 |

## 方針・決定事項

| No. | 判断 | 理由 |
|---|---|---|
| R-1 | **申告**は申請の項目 `promotional`（真偽値。省略は偽）にする。チャンネルの申請（`POST …/submissions`）と素材集の申請の両方。パッケージ（`channel.json`・`collection.json`）には書かない | D-31 は「申請のときに申告」。API-003・API-004 に項目がない（形式は変えない） |
| R-2 | **運営は申告を書き換えない**。宣伝なのに申告がなければ差し戻し（理由に「宣伝の申告がない」）、申告があるのに宣伝でなければ、そのまま承認してよい（表示が多めに出るだけで、散策者に害はない） | D-31 のとおり。運営が書き換えると、チャンネル提供者の知らないところで表示が変わる |
| R-3 | **承認**が申告を `latestApproved.promotional` に写す（偽は書かない）。版を上げるたびに申告し直す（前の版の申告は引き継がない） | 版ごとに中身が変わるため |
| R-4 | **リストの `promotional`** は公開のときに決める。素材集は `latestApproved.promotional`。チャンネルは、自分の申告か、`collections` で宣言した素材集のうち**今リストに載っているもの**に宣伝があれば真 | 素材集が後から宣伝の版になったときも、チャンネルの承認をやり直さずに付く。今の `media`・`resourcesSize` の足し合わせ（DES-009 M-4、`withMaterial`）と同じ場所 |
| R-5 | **古いアプリへの備え**（P-17・D-36）: 設定 `promotionalMinAppVersions`（アプリの ID → 版。環境変数 `PROMOTIONAL_MIN_APP_VERSIONS`）。宣伝のチャンネル・素材集は、公開のときに `minAppVersions` の各アプリの値をこの値以上に上げる（ないアプリは 9999）。`minAppVersion` は上げたあとの SanpoGuide の値（DES-011 N-6）。最初は空（T-14 の版が出るまで、宣伝はどのアプリにも出ない） | R-4 と同じく、素材集の変化で決まるので公開で計算する。アプリごとにするのは DES-011 未決事項 No.3 のとおり |
| R-6 | **画面**: チャンネル提供者・素材提供者の申請の画面に「宣伝を含む」のチェックと審査基準 2.4 への案内。運営の審査の画面（チャンネル・素材集）に申告の有無を目立つ形で出し、チャンネルでは宣言した素材集のうち宣伝のものも出す。チャンネルの画面に、リストで「宣伝を含む」になっているか（自分の申告か、素材集によるものか） | 申告漏れを審査で見つけやすくする |
| R-7 | **素材集の利用者への知らせ**: 宣伝でなかった素材集が宣伝の版で承認されたとき、それを宣言しているチャンネルの提供者に知らせる（今の素材集の更新の知らせ `collection.updated` に「宣伝を含む版になった」を足す）。新しい事象は作らない | チャンネルに「宣伝を含む」が付くため。D-18 の知らせの道を使う |
| R-8 | **`packages/protocol`・準拠テスト**: リストの型に `promotional?` を足す。準拠テストに、`collections` で宣伝の素材集を宣言しているチャンネルが `promotional: true` であることの確認を足す（管理システムの確認として。API-002 の確認観点には番号がないので `C-P1` とする） | P-16 の後半を外から確かめられる |
| R-9 | **データモデル**: 申請と `latestApproved` に `promotional`。移行はしない（ない項目は偽） | 項目の追加だけ |
| R-10 | **利用ガイド**: チャンネル提供者・素材提供者のガイドに、申告のしかた・宣伝を出せる場所（素材だけ）・認めない中身（審査基準 2.4）・アプリでの見え方を足す | 申請する人が分かるように |

## 実装の順番

| 段 | 内容 |
|---|---|
| a | API（R-1・R-3・R-7・R-9）、公開（R-4・R-5）、`packages/protocol`（R-8）、設定（R-5）。OpenAPI・型 |
| b | 画面（R-6）と利用ガイド（R-10） |
| c | 準拠テスト（R-8）と通しの確認（`tools/e2e`）。開発用に配備して確かめる |

## 検証の計画

| 項目 | 内容 |
|---|---|
| API の単体テスト | 申告が申請・承認に写る。省略・偽は書かない。申告は運営の操作で変わらない |
| 公開の単体テスト | 申告したチャンネル・素材集が `promotional: true`。宣伝の素材集を宣言するチャンネルも真、その素材集がリストにないときは偽。宣伝のものの `minAppVersions` が設定の値まで上がり、設定にないアプリは 9999、`minAppVersion` も追従。宣伝でないものは変わらない |
| 準拠テスト | `C-P1` が手元で公開したリストで通り、壊した例で落ちる |
| 通しの確認 | 開発用で、宣伝の素材集とそれを宣言するチャンネル（申告なし）を承認し、リストで両方が `promotional: true`・`minAppVersion: 9999` になる |

## 実装の記録

| 段 | 結果 |
|---|---|
| a | 申請（チャンネル・素材集）に `promotional`（真偽値でなければ 400）。承認が真のときだけ `latestApproved.promotional` に写す。公開の `withPromotion`（宣言した素材集のうち今リストにある宣伝のもの）と `promotedVersions`（`minAppVersions` の各アプリを `promotionalMinAppVersions` まで上げ、ないアプリは 9999、下げない。DES-011 より前の承認は `minAppVersion` だけ）。設定 `promotionalMinAppVersions`（dev・prod とも空）を公開の Lambda の `PROMOTIONAL_MIN_APP_VERSIONS` に。素材集が宣伝の版になったときの `collection.updated` に `becamePromotional` とメールの一文。OpenAPI・型。テスト: API 89 件（追加 5 件）、全体 149 件 |
| b | 申請の画面に「宣伝を含む」（審査基準 2.4 への案内つき）。運営の審査の画面（チャンネル・素材集）に申告の有無、チャンネルでは宣言した素材集のうち宣伝のもの。チャンネル提供者のチャンネルの画面と素材提供者の素材集の画面に宣伝の状態。利用ガイド（チャンネル提供者 3.4・4、素材提供者 4） |
| c | 準拠テストに `C-P1`（`promotional` が真偽値、宣伝の素材集を宣言するチャンネルが `promotional: true`）。`tools/e2e/collections.ts --promotional` |

確認（2026-10-12）: `npx tsc -b`、`npx vitest run`（150 件。Docker の DynamoDB Local で API のテストも手元で流した）、infra のテスト 13 件。開発用に配備し、`collections.ts --promotional` で、宣伝の素材集と、それを宣言するチャンネル（申告なし）の両方が `promotional: true`・`minAppVersion: 9999`・`minAppVersions: { sanpoguide: 9999 }` になり、準拠テスト（`C-P1` を含む）に合格した。既存の通しの確認 5 本も通った。

## 未決事項・リスク

| No. | 内容 | 案 |
|---|---|---|
| 1 | 申告がないのに宣伝だと分かった公開中のチャンネルをどうするか | 今の取り下げ（理由つき）で足りる（D-31）。運営が `promotional` を後から付ける操作は作らない |
| 2 | `promotionalMinAppVersions` の SanpoGuide の値をいつ入れるか | T-14 の版（versionCode）を Google Play に出したときに、運営が設定に書いて配備する |

## 関連ドキュメント・参照リンク

- [DES-009](DES-009-materials-publish.md): 素材集の公開（`withMaterial`）
- [DES-011](DES-011-ecosystem.md): アプリごとの版
- [DM-001](../data-model.md)、[API-001](../console-api.md)
- SanpoGuide [ADR-002](https://github.com/duwenji/SanpoGuide/blob/main/docs/adr/ADR-002-material-producers.md)、API-002、[審査基準](https://github.com/duwenji/SanpoGuide/blob/main/docs/channel-review-policy.md) 2.4

## 変更履歴

| 日付 | 版 | 変更内容 | 変更者 |
|---|---|---|---|
| 2026-10-12 | 0.1 | 草案 | Claude |
| 2026-10-12 | 1.0 | 承認（PR #30 のマージ） | Claude（承認: 開発者） |
| 2026-10-12 | 1.1 | 実装の記録 | Claude |
