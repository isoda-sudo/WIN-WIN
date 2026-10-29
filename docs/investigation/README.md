# Investigation Reports（抜粋）

QA（パニ）の監査レポートのうち、レビュー運用が直接参照する **1 本だけ** を置いている。残り（INVESTIGATION_01〜08・10、QAシート、法令適合性 03 を含む）は construct-pro-next の `docs/investigation/` にある。

| File | Contents | Used by |
| --- | --- | --- |
| [INVESTIGATION_09_HEAD_REVERIFICATION_AND_PRIORITIES.md](INVESTIGATION_09_HEAD_REVERIFICATION_AND_PRIORITIES.md) | HEAD 6d3510e での再検証と修正優先順位 Tier A/B/C（**抜粋 §0–§3**；QA個人の行動リスト §4–§5 は省略） | `winwin-pr-review` の既知課題チェック。**develop → staging の昇格PRでのみ**実行され、機能PRでは言及されない |

関連: [`../poc-reference/business-rules.md`](../poc-reference/business-rules.md)（業務ルールの正）。
