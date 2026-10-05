# Mermaid図パターン集

画面仕様書で使用するMermaid図のパターン。用途に応じて適切なパターンを選択する。

---

## 1. 画面遷移図（stateDiagram-v2）

画面間のナビゲーションを表現する基本パターン。

```mermaid
stateDiagram-v2
    [*] --> トップページ
    トップページ --> ログイン: 未認証
    トップページ --> ダッシュボード: 認証済み

    ログイン --> ダッシュボード: ログイン成功
    ログイン --> パスワードリセット: パスワードを忘れた
    パスワードリセット --> ログイン: リセット完了

    ダッシュボード --> 一覧画面: メニュー選択
    一覧画面 --> 詳細画面: 項目クリック
    詳細画面 --> 編集画面: 編集ボタン
    編集画面 --> 詳細画面: 保存
    編集画面 --> 詳細画面: キャンセル

    ダッシュボード --> [*]: ログアウト
```

**使いどころ:** 画面全体の遷移を俯瞰する場合

---

## 2. ユーザーフロー図（flowchart）

分岐やエラーパスを含むユーザーフローの表現。

```mermaid
flowchart TD
    A[フォーム入力] --> B{バリデーション}
    B -->|OK| C[確認画面]
    B -->|NG| D[エラー表示]
    D --> A
    C --> E{送信}
    E -->|成功| F[完了画面]
    E -->|失敗| G[エラーダイアログ]
    G --> C
```

**使いどころ:** 特定の操作フローを詳細に描く場合。分岐やエラー処理が複雑な場合に特に有効。

---

## 3. API連携図（sequence diagram）

画面とバックエンドの通信フロー。

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Page as 画面
    participant API as tRPC API
    participant DB as データベース

    User->>Page: フォーム送信
    Page->>API: mutation.create()
    API->>DB: INSERT
    DB-->>API: 結果
    alt 成功
        API-->>Page: 成功レスポンス
        Page-->>User: 完了画面表示
    else 失敗
        API-->>Page: エラーレスポンス
        Page-->>User: エラーメッセージ表示
    end
```

**使いどころ:** フロントエンドとバックエンドの連携を明確にする場合。tRPCのprocedure設計の参考になる。

---

## 4. フォーム/ウィザード状態図

複数ステップのフォームやウィザードの状態遷移。

```mermaid
stateDiagram-v2
    [*] --> Step1_基本情報
    Step1_基本情報 --> Step2_詳細設定: 次へ
    Step2_詳細設定 --> Step1_基本情報: 戻る
    Step2_詳細設定 --> Step3_確認: 次へ
    Step3_確認 --> Step2_詳細設定: 戻る
    Step3_確認 --> 送信中: 送信
    送信中 --> 完了: 成功
    送信中 --> Step3_確認: エラー
    完了 --> [*]
```

**使いどころ:** 多段階の入力フローがある場合。

---

## 5. モーダル/ダイアログフロー

メイン画面とモーダルの関係を表現。

```mermaid
flowchart TD
    A[一覧画面] -->|新規作成ボタン| B[作成モーダル]
    A -->|項目クリック| C[詳細モーダル]
    B -->|保存| A
    B -->|キャンセル| A
    C -->|編集ボタン| D[編集モーダル]
    C -->|削除ボタン| E[削除確認ダイアログ]
    C -->|閉じる| A
    D -->|保存| C
    D -->|キャンセル| C
    E -->|確認| A
    E -->|キャンセル| C
```

**使いどころ:** SPA的なUIでモーダル/ダイアログが多用される場合。

---

## Next.js App Router パス命名規則

画面名からURLパスとファイル配置を導出する規則:

| 画面名 | URLパス | ファイル配置 |
|--------|---------|-------------|
| トップページ | `/` | `src/app/page.tsx` |
| ダッシュボード | `/dashboard` | `src/app/dashboard/page.tsx` |
| ユーザー一覧 | `/users` | `src/app/users/page.tsx` |
| ユーザー詳細 | `/users/[id]` | `src/app/users/[id]/page.tsx` |
| ユーザー編集 | `/users/[id]/edit` | `src/app/users/[id]/edit/page.tsx` |
| 設定画面 | `/settings` | `src/app/settings/page.tsx` |
| 設定(タブ) | `/settings/[tab]` | `src/app/settings/[tab]/page.tsx` |

**命名ルール:**
- URLは kebab-case（例: `/user-profile`）
- 動的パラメータは `[param]` で表現
- レイアウト共有は `layout.tsx` で管理
- ローディングは `loading.tsx`、エラーは `error.tsx` で管理
