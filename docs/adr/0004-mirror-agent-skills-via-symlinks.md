# ADR-0004: エージェント用Skillをsymlinkでミラーする

## メタ情報

- **ステータス**: 承認(Accepted)
- **日付**: 2026-07-03
- **決定者**: テンプレートメンテナー

## コンテキスト（背景と課題）

本テンプレートは、Claude Code・GitHub Copilot（`.github`）・Cursor・Codex など複数のAIコーディングツールでの利用を想定している。これらのツールはそれぞれ固有のディレクトリ（`.claude/skills`、`.github/skills`、`.cursor/skills`、`.codex/skills`）配下のSkillを読み込む。

同じSkillをツールごとにコピーしてしまうとSkillの実体が重複し、内容を更新するたびに複数箇所を手で同期する必要が生じ、齟齬や更新漏れの温床になる。Skillの定義を**単一のソース**で管理しつつ、各ツールから同じ内容を参照できる仕組みが必要である。

## 検討した選択肢

### 選択肢A: 各ツールのディレクトリにSkill実体を重複コピー

- 長所:
  - symlink非対応の環境でも確実に読める
  - 仕組みが単純で直感的
- 短所:
  - 同一Skillの実体がツール数だけ重複する
  - 更新のたびに全コピーを同期する必要があり、更新漏れ・内容の乖離が起きやすい

### 選択肢B: 実体を `.agents/skills/` に集約し、各ツールディレクトリからsymlinkでミラー

- 長所:
  - Skillの実体は `.agents/skills/` の1箇所のみ（単一ソース管理）
  - 更新は実体を1回直すだけで全ツールに反映される
  - どのツールから見ても同じ内容が保証される
- 短所:
  - symlinkを正しく扱えない環境（一部のWindows設定など）では追加の考慮が必要

### 選択肢C: ビルド/スクリプトで各ディレクトリへコピーを生成

- 長所:
  - symlink非対応環境でも配布できる
  - 実体は1箇所で管理できる
- 短所:
  - 生成ステップの実行忘れでツール側が古くなる
  - 生成物とソースの両方がリポジトリ内に存在し、差分管理が煩雑になる

## 決定内容

Skillの実体を **`.agents/skills/`** に集約し、各AIツールのディレクトリ（`.claude/skills`、`.github/skills`、`.cursor/skills`、`.codex/skills`）からは **symlinkでミラー**する方式を採用する。symlinkは相対パス（例: `../../.agents/skills/<skill-name>`）で張る。

## 決定の理由

複数AIツールを1リポジトリで同時にサポートするうえで、Skillを「単一ソースで管理し、各ツールへ同じ内容を届ける」ことが最重要要件である。symlinkミラー方式なら実体は `.agents/skills/` の1箇所に限られ、更新は実体を直すだけで全ツールに即反映される。コピー方式（選択肢A・C）で避けられない同期漏れ・内容乖離のリスクを構造的に排除できる。

実際のリポジトリでも、各ツールディレクトリ配下のSkillは `.agents/skills/` を指す相対symlinkになっている（例）。

```
.claude/skills/analyze-codebase -> ../../.agents/skills/analyze-codebase
.github/skills/analyze-codebase -> ../../.agents/skills/analyze-codebase
.cursor/skills/analyze-codebase -> ../../.agents/skills/analyze-codebase
.codex/skills/analyze-codebase -> ../../.agents/skills/analyze-codebase
```

各ツールディレクトリは、そのツールで必要なSkillだけをミラーすればよく（すべてのツールが全Skillをミラーする必要はない）、ツールごとの取捨選択も可能である。外部由来のSkill（`drawio`、`shadcn` など）は `skills-lock.json` でソースとハッシュを記録し、由来と完全性を追跡する。

## 影響

### ポジティブ

- Skillの実体が `.agents/skills/` の1箇所に集約され、更新箇所が明確
- 実体を1回更新するだけで全ツールに反映され、同期漏れが起きない
- ツールごとに必要なSkillだけをミラーする柔軟性がある

### ネガティブ

- symlinkを正しく扱えない環境では追加の対応（チェックアウト設定など）が必要
- 新しいSkillを追加した際は、対応する各ツールディレクトリにsymlinkを張る手間がある

### フォローアップタスク

- [ ] 新規Skill追加時は実体を `.agents/skills/` に置き、必要なツールディレクトリへ相対symlinkを張る運用を維持する
- [ ] 外部由来Skillを追加する際は `skills-lock.json` にソースとハッシュを登録する

## 参照

- `.agents/skills/`（Skill実体の単一ソース）
- `.claude/skills/` / `.github/skills/` / `.cursor/skills/` / `.codex/skills/`（symlinkミラー）
- `skills-lock.json`（外部由来Skillのソース・ハッシュ管理）
