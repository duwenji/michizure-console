# DES-007 素材集と素材の機械審査（実装の順番 4a）

## 文書情報

| 項目 | 内容 |
|---|---|
| 文書ID | DES-007 |
| ドキュメント種別 | 機能設計書 |
| 対象システム/機能 | 機械審査の Lambda（Kotlin、station-format 2.1.0）: チャンネルの素材・きっかけ・素材集の参照、素材集のパッケージ |
| 関連Skill | feature-implementation-unified |
| 作成日 | 2026-10-11 |
| 作成者 | Claude（開発者との検討） |
| 承認者 | 開発者（方式の承認待ち。実装は PR でレビュー） |
| ステータス | 草案 |
| 版 | 0.1 |

## 目的・背景

SanpoGuide の [ADR-002](https://github.com/duwenji/SanpoGuide/blob/main/docs/adr/ADR-002-material-producers.md) で素材の制作元を切り出し、管理システムでは [DM-001](../data-model.md) 1.3 と [API-001](../console-api.md) 1.1 でデータと API を決めた（ADR-002 T-6）。本書は、その実装の段階分けと、最初の段階の機械審査を決める。

今の機械審査（[DES-004](DES-004-machine-review.md)）は station-format 2.0.0 で、素材（`resources`）やきっかけ（`cues`）のあるチャンネルを「未対応」として拒む。station-format 2.1.0 で、素材・きっかけ・素材集の確認と、リストを使った参照の解決ができるようになった。

## 実装の段階（ADR-001 T-6 の 4）

| 段階 | 内容 | 設計書 |
|---|---|---|
| 4a | 機械審査: validator を station-format 2.1.0 に切り替え、チャンネルの素材・きっかけ・素材集の参照を確かめる。素材集のパッケージ・外部の素材・D-8 を確かめる | 本書 |
| 4b | API: 制作元の役割、素材集の登録・申請・取り消し・審査・取り下げ、使っているチャンネル、退会・移し替え・上限の拡張、型の生成し直し。利用の記録の書き込み（チャンネルの承認） | DES-008 |
| 4c | 公開: リストの `collections[]`・`revokedCollections[]`・`producerChange`、チャンネルの `media`・`resourcesSize`・`minAppVersion` の足し合わせ、毎日の外部の素材の確認、通知（C-20）、準拠テスト（API-002 1.2 の V-19〜V-26） | DES-009 |
| 4d | 画面: 制作元（役割・素材集・申請・使っているチャンネル）、運用者（素材集の審査・身元の確認・取り下げ） | DES-010 |

4a は 4b の前に入れてよい。素材集の申請はまだ作れないので、4a のあいだは素材集の機械審査は動かず、チャンネルの機械審査だけが変わる。

## 対応元ID（トレーサビリティ）

| 対応元ID | 内容 | 対応状況 |
|---|---|---|
| DM-001 1.3 | M-18（素材集の申請）、M-20（外部の素材の確認）、M-22（D-8）、M-23（段と版の対応表）、`intake-col/` | 実装 |
| API-001 1.1 | C-19（機械審査の結果）、C-21（段と版の対応表） | 実装 |
| SanpoGuide API-003 1.3・API-004 1.3 | 確認の手順 8・9・9a、素材集の確かめる手順 1〜4、エラーコード | station-format 2.1.0 で実装 |

## 方針・決定事項

| No. | 判断 | 理由 |
|---|---|---|
| J-1 | validator を station-format 2.1.0 に切り替え、チャンネルは `mediaStage = ALL_STAGES` で確かめる。結果の `appStage` に、素材集の中身まで数えた段（`MediaStage.required(media, resolution::types)`）を入れる | 管理システムはすべての段を確かめ、アプリの版の制限は `minAppVersion` で行う（API-003 M-1） |
| J-2 | チャンネルが宣言した素材集は、機械審査の時点で公開中のもの（DynamoDB の `LISTED` の `COL#`）を読み、公開用のバケットの `col/{sha256}.zip` を `CollectionValidator` で確かめてから、`CollectionReferences.resolve` で解決する。結果を `validation.collections` に入れ、1 つでも使えなければ不合格 | API-001 C-19。リストに載るものと同じデータで判断する |
| J-3 | 素材集の申請は、S3 の `intake-col/` へのアップロードで起動する（アイコンはないので、パッケージが届いた時点で確かめる）。チャンネルと同じ Lambda で、キーの接頭辞で分ける | 1 つの Lambda で済む（DES-004 J-1） |
| J-4 | 素材集の機械審査: `CollectionValidator`（署名・形式・素材）、素材集 ID・`producer`（申請したときのアカウントの今の鍵）・版（M-5）の一致、外部の素材（J-5）、D-8（J-6）、利用許諾の縮小（J-7）。結果は `validation` の `errors`・`external`・`inUse`・`warnings` に入れる | DM-001 M-20・M-22、API-001 C-19 |
| J-5 | 外部の素材は、HTTPS で 1 つずつ流し読みし、大きさと SHA-256 を確かめる（保存しない）。1 つの素材の上限（API-003: 画像 1MB・音声 10MB・映像 50MB）を超えたら読むのをやめる。1 つあたり 60 秒、全体で 10 分まで | DM-001 M-20 |
| J-6 | **SSRF への備え**: 外部の素材の URL は制作元が書くので、取りに行く前に名前を引き、ループバック・プライベート・リンクローカル・CGNAT・マルチキャストなどのアドレスなら取りに行かない（`bad_resource`）。リダイレクトは追わない（`bad_resource`）。Lambda は VPC の外で動かし、取りに行く処理に AWS の資格情報を送らない | 制作元の書いた URL で、管理システムの内側のものを読ませない |
| J-7 | D-8: 素材集の利用の記録（`COL#{id}` / `USEDBY#`）を読み、記録にある素材の ID が新しい版にあり、種類が同じかを確かめる。違えば `inUse` に入れて不合格（`resource_in_use`）。利用許諾を狭めて、記録にあるチャンネルの配信元（とその前の ID）が外れるときは `warnings`（`grants_narrowed`）に入れる（拒まない） | ADR-002 D-8・D-18 |
| J-8 | 素材集が合格したら、承認のときに写す値（`tags`・`regions`・`media`・`resourcesSize`・`resourceTypes`・`externalResources`・`appStage`）を申請に記録しておく。承認の API（4b）はそれを `latestApproved` に写すだけにする | Kotlin の Lambda だけが station-format を持つ。API（TypeScript）でパッケージを開かない（DM-001 M-8 と同じ考え） |
| J-9 | 段と版の対応表（C-21）は CDK のコンテキスト `appStageVersions`（例 `{ "0": 1, "1": 9999, "2": 9999, "3": 9999 }`）に置き、Lambda の環境変数で渡す。段 0（素材なし）は今の `MIN_APP_VERSION`。素材のあるチャンネルは、アプリの第 1 段が出るまで仮の大きな値になり、今のアプリには出ない | DM-001 未決事項 No.5 の解決（API-001 C-21） |
| J-10 | チャンネルの申請が合格したら、承認のときに写す値（`appStage`・`collections`・`ownPrefetchBytes`・`ownMedia`・使う素材集と素材の ID）を申請に記録しておく。承認の API（4b）は、それで利用の記録を書く | J-8 と同じ |
| J-11 | 見本用のプロンプト（`ReviewSamples`）はチャンネルだけ。素材集にはない | 素材集は AI に話させないため |

## 検証の計画

| 項目 | 内容 |
|---|---|
| 単体テスト（Kotlin） | チャンネル: 素材・きっかけのあるパッケージの合格と `appStage`、宣言した素材集が載っていない・利用許諾がない・素材がないときの不合格。素材集: 合格と記録する値、ID・producer・版の不一致、外部の素材のハッシュ・大きさの違い、SSRF（プライベートのアドレス・リダイレクト）、D-8 の違反、利用許諾の縮小の警告 |
| 外部の素材の取得 | 手元の HTTP サーバーで、正しい素材・大きすぎる素材・遅い応答・リダイレクトを確かめる |
| CDK | `intake-col/` の通知、環境変数 `APP_STAGE_VERSIONS`、Lambda のタイムアウト（15 分）とメモリ |
| 本物の AWS での通しの確認 | 4b の後に、素材集の申請から合格までと、それを使うチャンネルの申請まで |

## 未決事項・リスク

| No. | 内容 | 対応 |
|---|---|---|
| 1 | 外部の素材の合計が 200MB のとき、流し読みに数分かかる。Lambda の 15 分には収まるが、制作元の待ちが長くなる | 画面に「外部の素材を確かめています」と出す（4d） |
| 2 | 制作元のサーバーが Lambda からの取得を拒む（地域・ボットの制限）と不合格になる | 理由を `external` に出し、制作元に置き場所を見直してもらう |
| 3 | 外部の素材を読む通信の費用（NAT は使わないので、Lambda からの外向きの通信だけ） | 申請の回数の上限（1 日 20 回）で抑えられる |

## 関連ドキュメント・参照リンク

- [DES-004](DES-004-machine-review.md): 今の機械審査
- [DM-001](../data-model.md) 1.3・[API-001](../console-api.md) 1.1
- SanpoGuide [ADR-002](https://github.com/duwenji/SanpoGuide/blob/main/docs/adr/ADR-002-material-producers.md)・[API-003](https://github.com/duwenji/SanpoGuide/blob/main/docs/channel-package-format.md)・[API-004](https://github.com/duwenji/SanpoGuide/blob/main/docs/material-producer-api.md)

## 変更履歴

| 日付 | 版 | 変更内容 | 変更者 |
|---|---|---|---|
| 2026-10-11 | 0.1 | 草案 | Claude |
