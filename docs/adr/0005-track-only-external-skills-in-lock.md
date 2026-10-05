# ADR-0005: skills-lock.jsonは外部由来Skillのみを管理対象とする

## メタ情報

- **ステータス**: 承認(Accepted)
- **日付**: 2026-07-03
- **決定者**: テンプレートメンテナー

## コンテキスト（背景と課題）

ADR-0004のとおり、Skillの実体は `.agents/skills/` に集約し、各AIツールディレクトリへはsymlinkでミラーしている。`.agents/skills/` には現時点で36件のSkillが存在するが、リポジトリ直下の `skills-lock.json` には `drawio` と `shadcn` の2件のみが記録されている。

`drawio` と `shadcn` は `bunx skills`（[skills.sh](https://skills.sh/)）経由で外部から取得したSkillであり、`skills-lock.json` にはソース（`source` / `sourceType`）と内容のハッシュ（`computedHash`）が記録されている。一方、`analyze-codebase`・`commit-changes`・`manage-adr` など残りのSkillはこのリポジトリで独自に作成した自作Skillであり、`skills-lock.json` には記録がない。

外部由来Skillは、更新元（どのパッケージ・リポジトリから取得したか）と、取得後に改変されていないか（ハッシュによる完全性）を継続的に追跡する必要がある。改変やアップデートの有無を人手で判断するのは難しく、`bunx skills` とlockファイルによる機械的な管理が適している。

一方、自作Skillはこのリポジトリ自身がソースであり、内容の変更はすべてこのリポジトリのgit履歴とPRレビューに残る。「いつ・誰が・なぜ変更したか」はコミットログとPRの差分から直接追跡でき、外部由来Skillのような追加のソース・ハッシュ管理を必要としない。

この状態が「lockファイルへの記録漏れ（不備）」なのか「意図した運用方針」なのかがコード上からは判別できず、後続の開発者やAIエージェントが誤って全Skillをlockに記録しようとする、あるいは逆に不備だと誤解して調査コストをかける懸念がある。

## 検討した選択肢

### 選択肢A: 全Skill（自作Skill含む）をlockに記録する

- 長所:
  - `skills-lock.json` を見れば全Skillの一覧と状態が一箇所で分かる
  - 管理対象の判定基準がシンプル（「Skillなら全部lockに載せる」）
- 短所:
  - 自作Skillは `source` / `sourceType` に相当する外部取得元が存在せず、スキーマ上不自然な値（自己参照など）を入れる必要がある
  - 自作Skillを変更するたびに `computedHash` の再計算・lock更新という追加作業が発生し、通常のコード変更フローと二重管理になる
  - lockの更新自体はgit履歴で追える情報の再掲に過ぎず、追跡手段が重複する

### 選択肢B: 外部由来Skillのみ記録する（採用）

- 長所:
  - `bunx skills` が管理するもの（外部取得・更新対象）とリポジトリのソースコードそのものであるもの（自作Skill）を、lockという仕組みの責務分界と一致させられる
  - 自作Skillの変更はgit履歴・PRレビューという既存の仕組みだけで十分に追跡でき、追加の管理コストが発生しない
  - `bunx skills add/update/remove` の対象と `skills-lock.json` の記録範囲が一致するため、ツールの動作と実際のファイルの状態に齟齬が生じにくい
- 短所:
  - `skills-lock.json` だけを見ても `.agents/skills/` の全件は把握できない（全件を知るには `.agents/skills/` を直接見る必要がある）
  - 「lockに載っているかどうか」が外部由来/自作の判定基準になることを知らないと、記録漏れと誤解されうる（本ADRで明文化することで解消する）

### 選択肢C: lockファイルを廃止する

- 長所:
  - 管理対象の線引きを考える必要がなくなり、仕組みがシンプルになる
- 短所:
  - 外部由来Skillのソースや取得時点のハッシュを記録する手段が失われ、改変検知や更新元の追跡ができなくなる
  - `bunx skills` のエコシステム（skills.sh）が前提とするlockファイルの仕組みと非互換になり、ツールの恩恵（更新確認など）を受けられなくなる

## 決定内容

`skills-lock.json` は **`bunx skills` 経由で取得した外部由来Skillのみ**を管理対象とする。自作Skillはlockに記録せず、リポジトリのgit履歴・PRレビューによって追跡する。

## 決定の理由

lockファイルの本来の役割は「外部から取得したものの出所と完全性を追跡すること」であり、自作Skillのようにリポジトリ自身がソースであるものには本来不要な仕組みである。選択肢Aのように全Skillを記録すると、自作Skillの変更のたびにハッシュ再計算とlock更新という、通常のコードレビューと重複する管理コストが発生する。選択肢Cはlockの仕組みそのものを失い、外部由来Skillの改変検知ができなくなる。

選択肢Bを採用することで、`bunx skills` というツールの管理範囲（外部由来Skill）と `skills-lock.json` の記録範囲を一致させ、自作Skillは既存のgit履歴・PRレビューという十分な追跡手段に委ねる、という責務分界が明確になる。

## 影響

### ポジティブ

- 自作Skillを追加・変更する際に、lock更新という追加作業が発生しない
- `skills-lock.json` の記録内容と `bunx skills` の管理対象が一致し、ツールの挙動と齟齬が生じない
- 「lockに載っているか否か」で外部由来Skillと自作Skillを機械的に判別できる

### ネガティブ

- `skills-lock.json` だけでは `.agents/skills/` 配下の全Skill一覧を把握できない（全件確認には `.agents/skills/` またはREADMEの自作スキル一覧を参照する必要がある）
- この運用方針を知らない開発者・AIエージェントが「記録漏れ」と誤解し、不要な調査や修正を行う可能性がある（本ADRの存在と参照によって軽減する）

### フォローアップタスク

- [ ] 外部由来Skillを追加する際は `bunx skills add` を使い、`skills-lock.json` に `source` / `sourceType` / `computedHash` が記録されることを確認する
- [ ] 自作Skillと外部由来Skillの区別に迷った場合は、`skills-lock.json` に記載があるか否かで判断する
- [ ] `skills-lock.json` に記録すべきでない自作Skillが誤って登録された場合は、本ADRを根拠にlockから除外する

## 参照

- ADR-0004: エージェント用Skillをsymlinkでミラーする
- `skills-lock.json`（外部由来Skillのソース・ハッシュ管理）
- `.agents/skills/`（全Skill実体の単一ソース）
- README.md「コーディングAIエージェント向けスキル」節
