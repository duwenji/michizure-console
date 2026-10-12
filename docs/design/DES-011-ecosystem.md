# DES-011 エコシステムへの対応（format 2・アプリごとの版・素材集の利用アプリ）

## 文書情報

| 項目 | 内容 |
|---|---|
| 文書ID | DES-011 |
| ドキュメント種別 | 機能設計書 |
| 対象システム/機能 | 機械審査（validator）、承認（`api/src/console/review.ts`）、公開（`api/src/publish`）、`packages/protocol`、準拠テスト、画面（`web`）、設定（`infra/lib/config.ts`） |
| 関連Skill | feature-implementation-unified |
| 作成日 | 2026-10-12 |
| 作成者 | Claude（開発者との検討） |
| 承認者 | 開発者（1.0: 2026-10-12。未決事項 No.1・2 は案のとおり。実装は PR でレビュー） |
| ステータス | 実装済（開発用に配備し、通しの確認済み） |
| 版 | 1.2 |

## 目的・背景

SanpoGuide の [ADR-003](https://github.com/duwenji/SanpoGuide/blob/main/docs/adr/ADR-003-companion-app-platform.md)（付き添いアプリのエコシステム）で、チャンネル・素材集はアプリをまたいで使うものになった。管理システムはエコシステムで 1 つのまま、リストも 1 本のまま（E-17）で、アプリが端末で絞り込む。契約は 2026-10-12 に承認済み:

- [API-003 2.0](https://github.com/duwenji/SanpoGuide/blob/main/docs/channel-package-format.md): `format: 2`（`activities`・`genres`・`requires.features`）。審査は一覧にない値を拒む（G-3）。format 1 の受け付けは、format 2 に対応した SanpoGuide の公開から 90 日（G-6）
- [API-002 1.4](https://github.com/duwenji/SanpoGuide/blob/main/docs/channel-list-api.md): リストの `channels[].activities`・`genres`・`requires`（P-19）、`minAppVersions`（P-20）、古いアプリへの備え（P-21）
- [API-004 1.5](https://github.com/duwenji/SanpoGuide/blob/main/docs/material-producer-api.md): 素材集の `grants.apps`（I-11）

本書は、管理システムがこれをどう実装するかを決める（ADR-003 T-7）。SanpoGuide 側（`core-format` 1.2.0・プロンプト・パック 1.1.0）は実装・公開済み。

## 対応元ID（トレーサビリティ）

| 対応元ID | 内容 | 対応状況 |
|---|---|---|
| SanpoGuide ADR-003 | E-17（リストは 1 本）、E-18・E-26（機械審査はコアだけ、見本は過ごし方ごとの代表アプリ）、E-25（アプリの除外はしない） | 本書で実装 |
| SanpoGuide API-003 2.0 | G-1〜G-7、V-24 | 本書で実装 |
| SanpoGuide API-002 1.4 | P-19〜P-21、V-27・V-29・V-30 | 本書で実装 |
| SanpoGuide API-004 1.5 | I-11、W-20 | 本書で実装 |

## 方針・決定事項

| No. | 判断 | 理由 |
|---|---|---|
| N-1 | **validator の依存**を `core-format` 1.2.0・`prompts` 1.1.0 に上げる。確かめ方は既定の `Strictness.REVIEW`（format 1・2 を読み、一覧にない値を拒む）。記録に残す `validatorVersion` も上げる | 審査は共通の一覧で厳しく確かめる（G-3） |
| N-2 | **format 1 の受け付けの期限**を設定 `format1AcceptUntil`（日時。未設定は期限なし）にする。期限を過ぎた format 1 の申請（新規・更新）は、機械審査で `format_retired` として落とす。公開中の format 1 のチャンネルはそのまま載せる。値は、format 2 に対応した SanpoGuide を Google Play に公開した日 + 90 日を、運営が設定に書く | G-6。公開日はまだ決まっていないので、日付は設定にする |
| N-3 | **絞り込みの情報**: 機械審査がパッケージの `activities`・`genres`・`requires.features` を書かれたとおりに記録し（format 1 は `["walk"]`・`[]`・`[]`）、承認が `latestApproved` に写し、公開がリストの `channels[]` に載せる（P-19）。4a より前に承認された項目（これらがない）は format 1 の読み方で載せる | パッケージから写すだけにして、運営の入力を挟まない |
| N-4 | **登録したアプリ**の一覧を設定に置く: `apps: { [id]: { activity, features, stageVersions } }`。最初は `sanpoguide`（`walk`、録音の再生を除く機能、今の `appStageVersions` の値）。今の `appStageVersions` はこれに移す | アプリごとの版（P-20）と、提供者に見せる「出るアプリ」（N-8）の元 |
| N-5 | **`minAppVersions`**（P-20）: チャンネルは、登録したアプリのうち `activity` がチャンネルの `activities` にあり、`features` が `requires` を含むものについて、`stageVersions[チャンネルのアプリの段]`（なければ 9999）を載せる。合わないアプリは載せない。素材集は、`grants.apps` が含むアプリ（ないときはすべて）について同じく載せる。承認のときに計算する（今の `minAppVersion` と同じ。DES-009 M-5） | アプリごとに versionCode と対応する段が違う |
| N-6 | **今の `minAppVersion`**（古い SanpoGuide のため）は、`minAppVersions.sanpoguide` の値。SanpoGuide が合わないチャンネル・`grants.apps` が SanpoGuide を含まない素材集では 9999（どのアプリにもない版。P-21） | 古い SanpoGuide は `minAppVersions` も `grants.apps` も読まない |
| N-7 | **素材集の `grants.apps`**: 機械審査が `core-format` で読み（知らないアプリの ID は拒む）、承認が `latestApproved.grants` に写し、公開がリストの `collections[].grants` に写す（今の `publishers` と同じ道）。チャンネルが素材集を参照するときの確かめ（API-004 手順 3）では、アプリを見ない（チャンネルはアプリをまたぐため。合わないアプリでは、その候補が使われないだけ） | I-11・W-20 |
| N-8 | **審査の見本**（E-26）: AI に話させる見本は、`activities` に `walk` があるとき、今どおり SanpoGuide のプロンプト・パックで作る。`walk` がないチャンネル（今は `cycle` だけのもの）は、代表のアプリがまだないので見本を作らず、運営の画面に「この過ごし方の代表アプリはまだありません。語り手の文章を読んで確かめてください」と出す | サイクリングのアプリができるまで、見本を作るプロンプトがない |
| N-9 | **画面**: 運営の審査の画面と、チャンネル提供者のチャンネルの画面に、過ごし方・ジャンル・必要な機能と、**このチャンネルが出るアプリ**（N-5 で版を載せるアプリの名前。0 なら「今はどのアプリにも出ません」）を出す。素材提供者の素材集の画面と運営の素材集の審査の画面に、使ってよいアプリ（`grants.apps`。なければ「すべてのアプリ」）を出す | E-18（「このチャンネルが出るアプリ」を出す） |
| N-10 | **`packages/protocol`・準拠テスト**: リストの型に `activities`・`genres`・`requires`・`minAppVersions`、素材集の `grants.apps`・`minAppVersions` を足す。準拠テストに V-27（`activities`・`genres`・`requires` がパッケージの値と一致）と、`minAppVersions` の形（アプリの ID → 正の整数）を足す。アプリのテスト用の文書（`app-vectors.ts`）に format 2 のチャンネルを 1 つ足す | P-19・P-20 |
| N-11 | **データモデル**: `latestApproved` と申請の `listing` に `activities`・`genres`・`requires`・`minAppVersions`、素材集の `latestApproved.grants.apps` を足す。移行はしない（ない項目は format 1 の読み方・`grants.apps` なしとして扱う） | 項目の追加だけ |
| N-12 | **利用ガイド**: チャンネル提供者のガイドに format 2 の 3 つの項目と、format 1 の受け付けの期限を、素材提供者のガイドに `grants.apps` を足す | 申請する人が書けるように |

## 実装の順番

| 段 | 内容 |
|---|---|
| a | validator（N-1・N-2・N-3・N-7・N-8）、`packages/protocol` の型（N-10）、設定（N-4）、承認と公開（N-5・N-6・N-11） |
| b | 画面（N-9）と利用ガイド（N-12） |
| c | 準拠テストとアプリのテスト用の文書（N-10）。開発用の環境で通しの確認 |

## 検証の計画

| 項目 | 内容 |
|---|---|
| validator の単体テスト | format 2 の申請が通り、`activities`・`genres`・`requires` が記録される。一覧にない値・`activities` のない format 2 は落ちる。期限を過ぎた format 1 は `format_retired`。`walk` のない format 2 は見本なしで通る。素材集の `grants.apps` が記録され、知らないアプリの ID は落ちる |
| 承認と公開（DynamoDB Local） | `minAppVersions` が合うアプリにだけ入る。`minAppVersion` は SanpoGuide の値、合わなければ 9999。`grants.apps` が SanpoGuide を含まない素材集の `minAppVersion` は 9999（V-30）。4a より前の承認の項目は `["walk"]` で載る |
| 準拠テスト | 手元で公開したリストで V-27 と `minAppVersions` の形が通り、壊した例で落ちる |
| SanpoGuide との通し | 開発用の環境で、format 2 のチャンネル（`walk`・`cycle`）と `cycle` だけのチャンネルを承認して公開し、SanpoGuide（エミュレータ）で前者だけが出ることを確かめる |

## 実装の記録

| 段 | 結果 |
|---|---|
| a | validator を `core-format` 1.2.0・`prompts` 1.1.0 に（`validatorVersion` は `core-format 1.2.0, prompts 1.1.0`）。機械審査が `activities`・`genres`・`requires` を記録、期限を過ぎた format 1 は `format_retired`（`FORMAT1_ACCEPT_UNTIL`、未設定）、`walk` のないチャンネルは見本なしで `noRepresentativeApp` を記録、素材集の `grants.apps` を記録。承認が `minAppVersions` と SanpoGuide の `minAppVersion`（合わなければ 9999）を付け、パッケージの `format` を載せる。公開は DES-011 より前の承認を format 1 の読み方で載せる。テスト: validator 14 → 18、API の承認 4 件 |
| a（整理） | N-4 の「登録したアプリ」は、アプリの名前・過ごし方・機能を `packages/protocol` の `KNOWN_APPS` に、段ごとの版だけを設定 `appStageVersions`（アプリの ID ごと。環境変数 `APP_STAGE_VERSIONS`）に分けた。画面と API の両方で同じ `appsFor` を使うため |
| b | API の申請に `activities`・`genres`・`requires`・`offeredIn`、チャンネルに `offeredIn`。OpenAPI・型を更新。運営の審査とチャンネル提供者のチャンネルに過ごし方・ジャンル・必要な機能と「このチャンネルが出るアプリ」、代表のアプリがないチャンネルでは見本の代わりに案内、素材集に「使ってよいアプリ」。利用ガイド（チャンネル提供者・素材提供者） |
| c | 準拠テストに V-27（`activities`・`genres`・`requires`・`package.format` がパッケージと一致）と V-29（`minAppVersions` の形）。V-25 の `grants` を集合で比べるように直した。通しのテスト 3 件。アプリのテスト用の文書（`app-vectors.ts`）への format 2 のチャンネルの追加は見送った（SanpoGuide 側は `EcosystemSyncTest` で format 2 のリストを確かめている） |

確認: `npx tsc -b`、GitHub Actions の CI（API・CDK・準拠テスト・validator）が通る。この PC は Node 20・Docker なしのため、API のテストは CI でだけ流した。開発用への配備と通しの確認（2026-10-12）: 開発用に配備し、準拠テストに合格。既存の通しの確認（`tools/e2e` の 5 本）も通った（format 1 のチャンネルで V-27・V-29 も確かめた）。`tools/e2e/ecosystem.ts` で、format 2 の `walk`・`cycle` のチャンネルと `cycle` だけのチャンネルを申請・承認し、リストに `activities`・`genres`・`requires`・`package.format: 2` が載り、前者は `minAppVersions: { sanpoguide: 1 }`・`minAppVersion: 1`、後者は `minAppVersions: {}`・`minAppVersion: 9999` になること、準拠テスト（V-07・V-27・V-29 を含む）の合格を確かめた。そのリストを SanpoGuide（main、エミュレータ）に足し、前者だけが出て取り込めること、後者は出ないことを確かめた。この PC では GitHub Packages を読むトークンがないため、validator は SanpoGuide の main から `core-format` 1.2.0・`prompts` 1.1.0 を mavenLocal に公開してビルドした。

## 未決事項・リスク

| No. | 内容 | 対応 |
|---|---|---|
| 1 | `cycle` だけのチャンネルを承認できるようにしておくか（今はどのアプリにも出ない） | 本書では承認できるようにし、画面で「今はどのアプリにも出ません」と出す（N-9）。サイクリングのアプリの準備でチャンネルを先に用意できるように |
| 2 | 登録したアプリの一覧を設定（`infra/lib/config.ts`）に置くと、アプリを足すたびに配備が要る | アプリを足すのはまれなので、設定で足りる。運営の画面で編集したくなったら DynamoDB に移す |
| 3 | 宣伝の `promotionalMinAppVersion`（SanpoGuide ADR-002 T-13、未実装）もアプリごとになる | T-13 を実装するときに、`apps[id]` に `promotionalMinVersion` を足す |

## 関連ドキュメント・参照リンク

- [DES-007](DES-007-materials-review.md)・[DES-008](DES-008-materials-api.md)・[DES-009](DES-009-materials-publish.md): 素材集の審査・API・公開
- [DM-001](../data-model.md)、[API-001](../console-api.md)
- SanpoGuide [ADR-003](https://github.com/duwenji/SanpoGuide/blob/main/docs/adr/ADR-003-companion-app-platform.md)、API-002・API-003・API-004

## 変更履歴

| 日付 | 版 | 変更内容 | 変更者 |
|---|---|---|---|
| 2026-10-12 | 0.1 | 草案 | Claude |
| 2026-10-12 | 1.0 | 承認 | Claude（承認: 開発者） |
| 2026-10-12 | 1.1 | 実装の記録。N-4 の設定を KNOWN_APPS と appStageVersions に分けた | Claude |
| 2026-10-12 | 1.2 | 開発用への配備と通しの確認の記録（`tools/e2e/ecosystem.ts`） | Claude |
