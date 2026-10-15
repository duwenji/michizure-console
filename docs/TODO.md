# TODO

チャンネル管理システムで残っている作業。できている機能は [README](../README.md) と [利用ガイド](guide/README.md)、構成は [architecture.md](architecture.md) にある。

## 本番の準備

1. ルート鍵・署名鍵の手順書（[ADR-001](adr/ADR-001-aws-architecture.md) T-1）
2. 独自ドメイン（ADR-001 T-2）と、SES のサンドボックスの解除（T-3）。そのあと本番の `notify` を `ses` にする（DES-006 J-12・J-13）
3. 鍵の移し替えの本人確認の手順（ADR-001 未決事項 No.5）
4. 本番の `promotionalMinAppVersions` に、SanpoGuide を Google Play に出したときの版を書く（DES-012 未決事項 No.2）

## 確かめること

- [ ] 試用チケットで、素材集・基準を使うチャンネルをアプリで通しで確かめる（SanpoGuide 側。チャンネル提供者の鍵ファイルが届いてから）
