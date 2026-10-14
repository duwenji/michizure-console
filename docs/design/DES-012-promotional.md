# DES-012 宣伝を含むチャンネル・素材集

## 文書情報

| 項目 | 内容 |
|---|---|
| 文書ID | DES-012 |
| ドキュメント種別 | 機能設計書 |
| 対象システム/機能 | 管理 API（申請・承認）、公開（`api/src/publish`）、`packages/protocol`、準拠テスト、画面（`web`）、設定（`infra/lib/config.ts`）、利用ガイド |
| 関連Skill | feature-implementation-unified |
| 作成日 | 2026-10-12 |
| 作成者 | Claude（開発者との検討） |
| 承認者 | 開発者 |
| ステータス | 実装済 |
| 版 | 1.0 |

## 目的・背景

SanpoGuide の [ADR-002](https://github.com/duwenji/yorisoi-platform/blob/main/docs/adr/ADR-002-material-producers.md)（D-29〜D-36）で、宣伝を目的としたチャンネル・素材集を表示つきで認めることにした。契約:

- [API-002](https://github.com/duwenji/yorisoi-platform/blob/main/docs/channel-list-api.md): `channels[].promotional`・`collections[].promotional`（P-16）、宣伝を表示できないアプリへの備え（P-17）
- [API-003](https://github.com/duwenji/yorisoi-platform/blob/main/docs/channel-package-format.md)・審査基準 2.4: 審査で確かめること
- [API-004](https://github.com/duwenji/yorisoi-platform/blob/main/docs/material-producer-api.md): 宣伝の素材集を基準で選ばない

本書は、管理システムがこれをどう実装するかを決める。アプリ側の読み込みは `core-format`、表示は SanpoGuide にある。

## 対応元ID（トレーサビリティ）

| 対応元ID | 内容 | 対応状況 |
|---|---|---|
| SanpoGuide ADR-002 | D-31（申告と審査、宣伝の素材集を宣言するチャンネルにも付ける）、D-36（`promotionalMinAppVersions`） | 本書で実装 |
| SanpoGuide API-002 | P-16・P-17 | 本書で実装 |
| DES-011 | N-4・N-5（アプリごとの版） | 宣伝の版もアプリごとにする |

## 方針・決定事項

| No. | 判断 | 理由 |
|---|---|---|
| R-1 | **申告**は申請の項目 `promotional`（真偽値。省略は偽）にする。チャンネルの申請（`POST …/submissions`）と素材集の申請の両方。パッケージ（`channel.json`・`collection.json`）には書かない | D-31 は「申請のときに申告」。API-003・API-004 に項目がない（形式は変えない） |
| R-2 | **運営は申告を書き換えない**。宣伝なのに申告がなければ差し戻し（理由に「宣伝の申告がない」）、申告があるのに宣伝でなければ、そのまま承認してよい（表示が多めに出るだけで、散策者に害はない） | D-31 のとおり。運営が書き換えると、チャンネル提供者の知らないところで表示が変わる |
| R-3 | **承認**が申告を `latestApproved.promotional` に写す（偽は書かない）。版を上げるたびに申告し直す（前の版の申告は引き継がない） | 版ごとに中身が変わるため |
| R-4 | **リストの `promotional`** は公開のときに決める。素材集は `latestApproved.promotional`。チャンネルは、自分の申告か、`collections` で宣言した素材集のうち**今リストに載っているもの**に宣伝があれば真 | 素材集が後から宣伝の版になったときも、チャンネルの承認をやり直さずに付く。`media`・`resourcesSize` の足し合わせ（DES-009 M-4、`withMaterial`）と同じ場所 |
| R-5 | **宣伝を表示できないアプリへの備え**（P-17・D-36）: 設定 `promotionalMinAppVersions`（アプリの ID → 版。環境変数 `PROMOTIONAL_MIN_APP_VERSIONS`）。宣伝のチャンネル・素材集は、公開のときに `minAppVersions` の各アプリの値をこの値以上に上げる（ないアプリは 9999）。設定が空なら、宣伝はどのアプリにも出ない | R-4 と同じく、素材集の変化で決まるので公開で計算する。アプリごとに対応する版が違う |
| R-6 | **画面**: チャンネル提供者・素材提供者の申請の画面に「宣伝を含む」のチェックと審査基準 2.4 への案内。運営の審査の画面（チャンネル・素材集）に申告の有無を目立つ形で出し、チャンネルでは宣言した素材集のうち宣伝のものも出す。チャンネルの画面に、リストで「宣伝を含む」になっているか（自分の申告か、素材集によるものか） | 申告漏れを審査で見つけやすくする |
| R-7 | **素材集の利用者への知らせ**: 宣伝でなかった素材集が宣伝の版で承認されたとき、それを宣言しているチャンネルの提供者に知らせる（素材集の更新の知らせ `collection.updated` に「宣伝を含む版になった」を添える）。新しい事象は作らない | チャンネルに「宣伝を含む」が付くため。D-18 の知らせの道を使う |
| R-8 | **`packages/protocol`・準拠テスト**: リストの型に `promotional?` を持つ。準拠テストで、`collections` で宣伝の素材集を宣言しているチャンネルが `promotional: true` であることを確かめる（管理システムの確認として。API-002 の確認観点には番号がないので `C-P1` とする） | P-16 の後半を外から確かめられる |
| R-9 | **データモデル**: 申請と `latestApproved` に `promotional`（ない項目は偽） | — |
| R-10 | **利用ガイド**: チャンネル提供者・素材提供者のガイドに、申告のしかた・宣伝を出せる場所（素材だけ）・認めない中身（審査基準 2.4）・アプリでの見え方を書く | 申請する人が分かるように |

## 未決事項・リスク

| No. | 内容 | 案 |
|---|---|---|
| 1 | 申告がないのに宣伝だと分かった公開中のチャンネルをどうするか | 取り下げ（理由つき）で足りる（D-31）。運営が `promotional` を後から付ける操作は作らない |
| 2 | `promotionalMinAppVersions` の SanpoGuide の値をいつ入れるか | 本番は、SanpoGuide（versionCode 1 から宣伝の表示に対応）を Google Play に出したときに、運営が設定に書いて配備する。開発用は `{ sanpoguide: 1 }`（エミュレータで試すため。`tools/e2e/promotional.ts`） |

## 関連ドキュメント・参照リンク

- [DES-009](DES-009-materials-publish.md): 素材集の公開（`withMaterial`）
- [DES-011](DES-011-ecosystem.md): アプリごとの版
- [DM-001](../data-model.md)、[API-001](../console-api.md)
- SanpoGuide [ADR-002](https://github.com/duwenji/yorisoi-platform/blob/main/docs/adr/ADR-002-material-producers.md)、API-002、[審査基準](https://github.com/duwenji/yorisoi-platform/blob/main/docs/channel-review-policy.md) 2.4
