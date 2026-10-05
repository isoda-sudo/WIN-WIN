# ADR-0002: API層にtRPC v11を採用

## メタ情報

- **ステータス**: 承認(Accepted)
- **日付**: 2026-07-03
- **決定者**: テンプレートメンテナー

## コンテキスト（背景と課題）

本テンプレートはフロントエンド（Next.js App Router / React）とバックエンド（サーバーサイドのAPI）を同一リポジトリで扱うTypeScriptフルスタック構成である。クライアントとサーバーの間でAPIの型を一致させる仕組みが必要で、以下を満たしたい。

- クライアント・サーバー間で入力・出力の型がエンドツーエンドで一致すること（型のズレをコンパイル時に検知）
- 入力のランタイムバリデーションを型定義と二重管理せずに行えること
- `Date` 等のリッチな値をシリアライズしても型・値が保たれること
- React（TanStack Query）とのデータ取得統合が容易であること

## 検討した選択肢

### 選択肢A: REST（手書きのAPIルート + fetch）

- 長所:
  - 最も一般的で、外部クライアントからも扱いやすい
  - ツール・エコシステムが豊富
- 短所:
  - クライアント/サーバー間の型を手動で合わせる必要があり、ズレが起きやすい
  - バリデーションスキーマとレスポンス型の二重管理が発生しがち

### 選択肢B: GraphQL

- 長所:
  - スキーマ駆動で型を共有でき、柔軟なクエリが可能
  - 大規模・多クライアント環境に強い
- 短所:
  - スキーマ定義・コード生成・サーバー実装の学習コストとセットアップコストが高い
  - 小〜中規模の単一フロント構成にはオーバースペックになりやすい

### 選択肢C: Next.js Server Actions

- 長所:
  - フレームワーク標準で追加依存が少ない
  - フォーム送信などのミューテーションと相性がよい
- 短所:
  - 体系的なAPI層としての構造化・バリデーション・クライアントキャッシュ統合はやや弱い
  - 入出力の型安全は得られるが、TanStack Queryとの統合パターンは自前で整える必要がある

### 選択肢D: tRPC v11

- 長所:
  - コード生成なしでクライアント・サーバー間のエンドツーエンド型安全を実現
  - Zodによる入力バリデーションがそのまま型に反映される
  - `@trpc/react-query` によりTanStack Queryと統合されたデータ取得ができる
  - T3 Stackの標準構成で、テンプレートの他要素と親和性が高い
- 短所:
  - TypeScriptクライアント前提であり、外部の非TSクライアントには不向き

## 決定内容

API層に **tRPC v11**（`@trpc/server` / `@trpc/client` / `@trpc/react-query`）を採用する。入力バリデーションには **Zod**、シリアライズには **superjson** を用いる。ルーターは `src/server/api/routers/` に定義し、`src/server/api/root.ts` の `appRouter` に集約する。

## 決定の理由

本テンプレートの主なAPI利用者は同一リポジトリ内のNext.jsフロントエンドであり、「コード生成なしでエンドツーエンドの型安全を得られる」というtRPCの利点が最も効く。RESTの型二重管理やGraphQLのセットアップコストを避けつつ、Zodスキーマを入力バリデーションと型の単一ソースとして扱える。

tRPCの初期化（`src/server/api/trpc.ts`）では `superjson` をtransformerに設定し、`Date` などをまたいでも型・値が保持されるようにしている。あわせて `errorFormatter` で `ZodError` を整形し、バリデーションエラーがフロント側で型安全に扱えるようにしている。

```ts
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});
```

外部の非TypeScriptクライアントに公開する必要が生じた場合は、その時点で別途RESTエンドポイントを併設する判断を行う（本ADRの適用範囲外）。

## 影響

### ポジティブ

- クライアント・サーバー間の入出力型がコンパイル時に保証される
- Zodスキーマが入力バリデーションと型の単一ソースになる
- `@trpc/react-query` によりデータ取得・キャッシュがReactに統合される

### ネガティブ

- API層がTypeScriptクライアント前提となり、非TSの外部クライアントには追加対応が必要
- tRPC / TanStack Query / superjson の連携構成に対する理解が前提となる

### フォローアップタスク

- [ ] 新しいエンドポイント追加時は `src/server/api/routers/` にルーターを作り `appRouter` に登録する運用を維持する
- [ ] 外部公開APIが必要になった場合の方針を別ADRで検討する

## 参照

- `src/server/api/trpc.ts`（`initTRPC` / superjson / errorFormatter）
- `src/server/api/root.ts`（`appRouter`）
- `src/server/api/routers/post.ts`
- `src/trpc/react.tsx` / `src/trpc/server.ts` / `src/trpc/query-client.ts`
- ADR-0001: Bunをパッケージマネージャ/ランタイムに採用
- https://trpc.io/docs
