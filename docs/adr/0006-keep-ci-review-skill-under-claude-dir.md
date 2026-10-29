# ADR-0006: CIレビュー用Skillの実体を `.claude/skills/` に置く（ADR-0004 の例外）

## メタ情報

- **ステータス**: 承認(Accepted)
- **日付**: 2026-09-14
- **決定者**: Claude Code (承認: パニ / QA)

## コンテキスト（背景と課題）

`.github/workflows/claude-review.yml` は `anthropics/claude-code-action@v1` で PR を自動レビューし、レビュー手順はリポジトリ内 Skill `winwin-pr-review` に置いている。ADR-0004 に従い、当初は実体を `.agents/skills/winwin-pr-review/` に置き、`.claude/skills/winwin-pr-review` を相対 symlink にした。

PR #5 の初回実行で Claude は 0 ターン・33ms で終了し、何も投稿しなかった。実行ログには次の記録があった。

```
Restoring .claude, .mcp.json, .claude.json, .gitmodules, .ripgreprc, CLAUDE.md, CLAUDE.local.md, .husky from origin/develop (PR head is untrusted)
Preserved PR's sensitive paths -> .claude-pr/ for review agents (not executed)
```

claude-code-action は `pull_request` 実行時、PR ヘッドを信頼せず、`.claude/` や `CLAUDE.md` などレビュアー自身の設定を**ベースブランチ**から復元する（PR 側の版は `.claude-pr/` に退避）。無効化する入力は無い。復元対象に `.agents/` は含まれないため、次の二つが起きる。

1. Skill を追加する PR 自体では、ベースブランチに Skill が無いので `/winwin-pr-review` が解決されず、無言で成功する。
2. マージ後も、復元された `.claude/skills/winwin-pr-review` は `.agents/` への symlink であり、リンク先は PR ヘッドの内容になる。つまり PR がレビュアーの指示文を書き換えられる（プロンプトインジェクション経路）。アクションが `.claude/` を復元する意図がこれで無効化される。

## 検討した選択肢

### 選択肢A: ADR-0004 のまま（実体 `.agents/`、`.claude/` は symlink）

- 長所:
  - 全 Skill が同じ配置規則に従う
- 短所:
  - 上記 2 のとおり、レビュー対象 PR がレビュアーの手順を差し替えられる
  - アクションの信頼境界（`.claude/` はベースブランチ）が symlink で迂回される

### 選択肢B: 実体を `.claude/skills/winwin-pr-review/` に置き、`.agents/skills/winwin-pr-review` を逆向きの symlink にする（採用）

- 長所:
  - 実体がアクションの復元対象パスに入り、常にベースブランチ版が実行される
  - ローカルの Claude Code / 他ツールからは従来どおり両パスで見える（単一ソースは維持）
  - 他の Skill の配置は変えない
- 短所:
  - この Skill だけ symlink の向きが逆になり、ADR-0004 の例外になる
  - 例外を知らない開発者が `.agents/` 側に実体を戻す可能性がある（本 ADR と `docs/directory-structure.md` で明示）

### 選択肢C: レビュー手順を workflow の `prompt` / `--append-system-prompt` に直書きする

- 長所:
  - ファイル配置の問題が消える
- 短所:
  - 数百行の手順を YAML に埋め込むことになり、ローカルで `/winwin-pr-review` として再利用できない
  - `pull_request` イベントでは workflow ファイル自体も PR ヘッドの版で実行されるため、信頼境界の問題は解決しない（ブランチ保護と人間レビューでしか守れない）

## 決定内容

`winwin-pr-review` Skill の実体は `.claude/skills/winwin-pr-review/SKILL.md` に置き、`.agents/skills/winwin-pr-review` は `../../.claude/skills/winwin-pr-review` への相対 symlink とする。CI で実行されるレビュー手順に限り、ADR-0004 の「実体は `.agents/skills/`」の例外とする。ADR-0004 自体は有効のまま。

併せて workflow に、Claude が 0 ターンで終了した場合（Skill 未ロード）にジョブを失敗させるガードを追加し、無言の成功が起きないようにする。

## 決定の理由

claude-code-action が守ろうとしている境界（レビュアーの設定はベースブランチから）に配置を合わせるのが、最小変更で確実な方法だから。選択肢C は再利用性を失い、しかも問題を解決しない。選択肢A の短所はセキュリティ上受け入れられない。

## 影響

### ポジティブ

- レビュー手順は常にマージ済み（人間がレビューした）版が使われる
- Skill 追加・変更 PR は「前の版のレビュアー」で審査され、`.claude-pr/` に PR 側の差分が残る
- 0 ターン終了が赤いチェックとして見える

### ネガティブ

- Skill を追加する PR（本 PR #5）自体では新しい手順を試せない。マージ後の次の PR が最初の実試験になる
- `pull_request` イベントでは workflow ファイルは PR ヘッド版で動くため、`claude-review.yml` の改変はアクション側の復元では防げない。ブランチ保護 + `CODEOWNERS` で `.github/workflows/**` に人間レビューを必須にする必要がある

### フォローアップタスク

- [ ] `develop` にマージ後、既知課題ファイル（例: `src/server/api/routers/payments.ts`）に触る小さな PR で summary の ⚠️ ブロックとインラインコメントを確認する
- [ ] `CODEOWNERS` に `.github/workflows/**`・`.claude/**`・`CLAUDE*.md` を追加し、人間レビューを必須にする
- [ ] `CLAUDE.template.md` 採用時、Skill 内の Hard Rules 表を `CLAUDE.md#hard-rules` 参照に置き換える

## 参照

- ADR-0004: エージェント用Skillをsymlinkでミラーする（本 ADR はその例外）
- ADR-0005: skills-lock.jsonは外部由来Skillのみを管理対象とする（自作 Skill のため lock 対象外）
- `.github/workflows/claude-review.yml`、`.claude/skills/winwin-pr-review/SKILL.md`
- claude-code-action security notes: https://github.com/anthropics/claude-code-action/blob/main/docs/security.md
- PR #5 実行ログ（Claude step: `num_turns: 0`, `duration_ms: 33`）
