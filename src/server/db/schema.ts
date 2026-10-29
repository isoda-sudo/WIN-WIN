// Drizzle schema mirroring the live construct-pro Supabase schema (same instance, no migration).
// Authored against a live `information_schema` introspection (2026-09) rather than only
// `supabase/schema.sql`, since the Express app's `ensureAux()` applies additional
// `ALTER TABLE ADD COLUMN IF NOT EXISTS` at every cold start and is the real source of truth.
// bigint/numeric money columns use `{ mode: "number" }` to replicate db.js's global
// `pg.types.setTypeParser` behavior (OID 20/1700 -> JS number) on a per-column basis.

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ArchiveManifestEntry } from "~/lib/archive";
import type { EmailContact } from "~/lib/contacts";
import type { InvoiceItemInput as InvoiceItemRow } from "~/lib/invoice-tax";

// PostgreSQL bytea <-> Node Buffer（請求書PDFの実体保存用）。
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name"),
    role: text("role").default("user"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
    status: text("status").default("active"), // active | suspended | deleted (soft-delete)
    tokenVersion: integer("token_version").default(1), // forced-logout: bumped on role/status/password change
    emailSignature: text("email_signature"), // メール送信時に本文末尾へ自動付与する署名（管理者がアカウントごとに登録）
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)]
);

// 2段階認証のユーザー単位の状態（有効化日時・試行回数・ロック）。スマホごとの鍵は user_mfa_devices。
export const userMfa = pgTable("user_mfa", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  totpEnabledAt: timestamp("totp_enabled_at", { mode: "date" }),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
});

// 2段階認証に登録したスマホ（1人2台まで）。confirmed_at が NULL の行は登録途中（1人1行まで）。
export const userMfaDevices = pgTable(
  "user_mfa_devices",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    totpSecretEnc: text("totp_secret_enc").notNull(), // secret-box で暗号化した TOTP シークレット
    totpLastStep: bigint("totp_last_step", { mode: "number" }), // 使用済みコードの再利用防止
    confirmedAt: timestamp("confirmed_at", { mode: "date" }),
    lastUsedAt: timestamp("last_used_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    index("user_mfa_devices_user_id_idx").on(t.userId),
    uniqueIndex("user_mfa_devices_one_pending_key")
      .on(t.userId)
      .where(sql`${t.confirmedAt} IS NULL`),
  ]
);

// 2段階認証のリカバリーコード（HMAC ハッシュのみ保存、使用済みは used_at）。
export const userRecoveryCodes = pgTable(
  "user_recovery_codes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    index("user_recovery_codes_user_id_idx").on(t.userId),
    uniqueIndex("user_recovery_codes_user_hash_key").on(t.userId, t.codeHash),
  ]
);

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  action: text("action"), // CREATE | UPDATE | DELETE
  tableName: text("table_name"),
  recordId: integer("record_id"),
  details: jsonb("details"), // { name, changes: string[] }
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export const invitations = pgTable(
  "invitations",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    role: text("role").notNull().default("staff"), // admin | accounting | staff
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    acceptedAt: timestamp("accepted_at", { mode: "date" }),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [uniqueIndex("invitations_token_key").on(t.token)]
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [uniqueIndex("password_resets_token_key").on(t.token)]
);

// toContacts/ccContacts: [{ name: string; email: string; title?: string }] （最大10件、
// アプリ側のzodでバリデーション）。メール送信フォームのTO/CC初期選択肢として使う。
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  company: text("company").notNull(),
  department: text("department"),
  contact: text("contact"),
  contactTitle: text("contact_title"), // 担当者の役職
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  zipCode: text("zip_code"),
  notes: text("notes"),
  capital: bigint("capital", { mode: "number" }),
  companyScale: text("company_scale"), // 表示名: 企業規模（従業員数）
  website: text("website"),
  toContacts: jsonb("to_contacts")
    .$type<EmailContact[]>()
    .default(sql`'[]'::jsonb`),
  ccContacts: jsonb("cc_contacts")
    .$type<EmailContact[]>()
    .default(sql`'[]'::jsonb`),
  deletedAt: timestamp("deleted_at", { mode: "date" }), // soft-delete
});

// vendors.id is a text PK ("001", "002", ...) assigned by MAX(id::int)+1 padStart(3,'0')
// in the current app — not a serial column. Preserve as-is; do not "fix" to serial.
export const vendors = pgTable("vendors", {
  id: text("id").primaryKey(),
  company: text("company").notNull(),
  dept: text("dept"),
  contact: text("contact"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  zipCode: text("zip_code"),
  categories: text("categories").default(""), // CSV of category names (tag list, not a FK)
  bankName: text("bank_name"),
  bankBranch: text("bank_branch"),
  bankType: text("bank_type"), // 普通 | 当座
  bankNumber: text("bank_number"), // masked to last-4 in list views; full only via detail fetch
  bankHolder: text("bank_holder"),
  // 表示・比較用ラベル。paymentClosingDay/paymentDueDayから自動生成する。
  // 新規の既定は「月末締翌々月5日払い」（D-07/D-13）。drizzleの.default()は
  // マイグレーション生成用のメタ情報でありアプリのinsertには影響しない（vendors.createは
  // paymentTermLabelで明示的に値を入れる）。共有DB側の列DEFAULT変更は保守担当がADR-0006の
  // 手順で適用する。
  paymentTerm: text("payment_term").default("月末締翌々月5日払い"),
  // 締め日("末")・支払日("5"|"15"|"末"。旧データの"10"|"20"|"25"は表示のみ維持)。両方nullなら未設定
  // （旧・自由記述時代のデータ）を意味し、自動計算は行わない（手動入力に委ねる）。
  paymentClosingDay: text("payment_closing_day"),
  paymentDueDay: text("payment_due_day"),
  paymentDueMonthOffset: text("payment_due_month_offset"), // 支払月: "1"=翌月払い、"2"=翌々月払い(既定)
  toContacts: jsonb("to_contacts")
    .$type<EmailContact[]>()
    .default(sql`'[]'::jsonb`),
  ccContacts: jsonb("cc_contacts")
    .$type<EmailContact[]>()
    .default(sql`'[]'::jsonb`),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
  capital: bigint("capital", { mode: "number" }),
  companyScale: text("company_scale"),
  website: text("website"),
});

// 銀行マスタ（発注先・自社口座の銀行名プルダウンの元）。名称は一意。発注先・自社口座は銀行名を文字列で保持する。
export const banks = pgTable(
  "banks",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    group: text("group").notNull(), // 主要銀行 | 地方銀行 | ネット銀行
    code: text("code"), // 全銀協の銀行コード（4桁）。支店名の検索に使う
    order: integer("order"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [uniqueIndex("banks_name_key").on(t.name)]
);

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  order: integer("order"),
  note: text("note"),
});

export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    client: text("client").notNull(),
    clientCompany: text("clientCompany"),
    clientPhone: text("clientPhone"),
    clientEmail: text("clientEmail"),
    clientAddress: text("clientAddress"),
    amount: bigint("amount", { mode: "number" }),
    startDate: text("startDate"), // stored as free-text date string, matching current app
    endDate: text("endDate"),
    status: text("status"), // 未対応 | 提案中 | 見積確認中 | 受注 | 失注 | オーダー移行
    notes: text("notes"),
    projectNo: text("project_no"), // WW+期(2桁)-連番(3桁)、例: WW26-001。旧形式(WW-YYYYMM-NNN)のデータも残るがそのまま許容。unique-when-set (partial unique index)
    receiptStatus: text("receipt_status"), // manual override of the auto-computed 入金ステータス
    deliveryMonth: text("delivery_month"),
    processInfo: text("process_info"),
    deliveryMonthChangedAt: timestamp("delivery_month_changed_at", {
      mode: "date",
    }),
    supersededBy: integer("superseded_by"), // set automatically on 引渡月変更複製; never user-selectable
    deletedAt: timestamp("deleted_at", { mode: "date" }),
    version: integer("version").default(1), // optimistic lock
    receiptNotes: text("receipt_notes"), // inline-editable 備考 on 売上管理表
    companyAccountId: integer("company_account_id"), // 工事売上の入金先の自社口座
    lockedAt: timestamp("locked_at", { mode: "date" }), // 確定（フィックス）日時。非nullの間は金額・ステータスの直接編集を禁止
    lockedBy: integer("locked_by"), // フィックスした管理者のusers.id
    plannedAmount: bigint("planned_amount", { mode: "number" }), // 予定売上額（決定＝契約金額のamountとは別枠）
    paidAt: timestamp("paid_at", { mode: "date" }), // 全額入金済みになった日時（入金日の導出元）。全額入金済みから外れたらnull
  },
  (t) => [
    uniqueIndex("idx_projects_project_no_unique")
      .on(t.projectNo)
      .where(sql`${t.projectNo} is not null and ${t.projectNo} != ''`),
    check(
      "projects_amount_nonneg",
      sql`${t.amount} is null or ${t.amount} >= 0`
    ),
    check(
      "projects_planned_amount_nonneg",
      sql`${t.plannedAmount} is null or ${t.plannedAmount} >= 0`
    ),
  ]
);

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").notNull(),
    category: text("category"),
    vendor: text("vendor"), // denormalized company name copy, not a FK (mastar-protection design)
    estimate: bigint("estimate", { mode: "number" }),
    planned: bigint("planned", { mode: "number" }),
    decided: bigint("decided", { mode: "number" }),
    status: text("status"),
    details: text("details"),
    site: text("site"),
    periodStart: text("period_start"),
    periodEnd: text("period_end"),
    handover: text("handover"),
    payment: text("payment").default("月末締翌々月5日払い"),
    paymentStatus: text("paymentStatus").default("未払い"),
    paymentDate: text("paymentDate"),
    companyAccountId: integer("company_account_id"), // 振込元（支払元）の自社口座。振込手数料はこの口座のルールから自動算出
    // 振込手数料。レコード生成時に固定して保存する（手数料ルールを変えても再計算しない）。
    // 支払元口座・発注先を変えたとき（支払前のみ）と、未算出だったときだけ、算出し直す。
    transferFee: bigint("transfer_fee", { mode: "number" }),
    paidOn: text("paid_on"), // 支払ステータスを「支払済み」にした日（YYYY-MM-DD）。未払いに戻すとnull
    paymentNotes: text("paymentNotes"), // inline-editable 備考 on 支払管理
    ackDone: boolean("ack_done"),
    invoiceDone: boolean("invoice_done"),
    orderNo: text("order_no"), // assigned once, at first ORDERED_STATUSES transition
    paymentNo: text("payment_no"), // 支払番号「案件ID-連番3桁」。orders.create で採番し以後凍結
    assignee: text("assignee"),
    version: integer("version").default(1), // optimistic lock
  },
  (t) => [
    check(
      "orders_estimate_nonneg",
      sql`${t.estimate} is null or ${t.estimate} >= 0`
    ),
    check(
      "orders_planned_nonneg",
      sql`${t.planned} is null or ${t.planned} >= 0`
    ),
    check(
      "orders_decided_nonneg",
      sql`${t.decided} is null or ${t.decided} >= 0`
    ),
    check(
      "orders_transfer_fee_nonneg",
      sql`${t.transferFee} is null or ${t.transferFee} >= 0`
    ),
    uniqueIndex("orders_order_no_key").on(t.orderNo),
  ]
);

export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id"),
    invoiceNo: text("invoice_no"),
    registrationNo: text("registration_no"),
    invoiceDate: text("invoice_date"),
    dueDate: text("due_date"),
    subtotal: bigint("subtotal", { mode: "number" }),
    tax: bigint("tax", { mode: "number" }),
    total: bigint("total", { mode: "number" }),
    bankInfo: text("bank_info"),
    status: text("status").default("発行済"), // 発行済 | 発送済み
    // 発行時に印字した明細行（name/note/price/qty/unit）。NULLは旧データ（契約金額1行）。
    items: jsonb("items").$type<InvoiceItemRow[] | null>(),
    // 「分割請求として保存」した請求書か。trueの請求書の小計だけが未請求残金の計算対象。
    isSplit: boolean("is_split").notNull().default(false),
  },
  (t) => [
    check(
      "invoices_subtotal_nonneg",
      sql`${t.subtotal} is null or ${t.subtotal} >= 0`
    ),
    check("invoices_tax_nonneg", sql`${t.tax} is null or ${t.tax} >= 0`),
    check("invoices_total_nonneg", sql`${t.total} is null or ${t.total} >= 0`),
    uniqueIndex("invoices_invoice_no_key").on(t.invoiceNo),
  ]
);

/**
 * 請求書PDFの保存コピー（1案件あたり最大5件、invoices.createで発行と同時に
 * 生成・保存される）。invoicesはシリアルPKのみで(projectId, kind)のような
 * 複合キーを持たないため、projectFiles/orderFilesの複合PKパターンは使えず、
 * invoiceIdを外部キーに持つ独立テーブルとする。
 * pdf: 発行時に生成したPDFそのもの（bytea）。NULLの行（pdf列追加前の旧データ）は
 * invoicesの凍結値から再生成して返す。台帳（invoices）の行は削除しない。
 */
export const invoiceFiles = pgTable("invoice_files", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull(),
  projectId: integer("project_id").notNull(),
  filename: text("filename"),
  dataUrl: text("data_url"),
  pdf: bytea("pdf"),
  uploadedAt: timestamp("uploaded_at", { mode: "date" }).defaultNow(),
});

export const miscPayments = pgTable(
  "misc_payments",
  {
    id: serial("id").primaryKey(),
    category: text("category"),
    type: text("type").default("支払"),
    payee: text("payee"),
    amount: bigint("amount", { mode: "number" }),
    paymentDate: text("payment_date"),
    status: text("status").default("未払い"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    // 定期支払い（recurring_payments）から作られた行のみ。(recurring_id, period) で1件に限る
    recurringId: integer("recurring_id"),
    period: text("period"), // "YYYY-MM"（定期支払いの対象月）
    // 支払No。案件に紐付かない支払は WW{期2桁}-{月2桁}-{NNN}（ADR-0007）
    paymentNo: text("payment_no"),
    // 振込手数料（円）と支払方法（銀行振込・口座振替・クレジットカード引落・現金など自由記述）
    transferFee: bigint("transfer_fee", { mode: "number" }),
    paymentMethod: text("payment_method"),
    // 支払元の自社口座（company_accounts.id）。transferFee はこの口座の手数料ルールから
    // サーバーが算出した時点のスナップショット（ルール変更では遡及して書き換えない）
    companyAccountId: integer("company_account_id"),
  },
  (t) => [
    check(
      "misc_payments_amount_nonneg",
      sql`${t.amount} is null or ${t.amount} >= 0`
    ),
    check(
      "misc_payments_transfer_fee_nonneg",
      sql`${t.transferFee} is null or ${t.transferFee} >= 0`
    ),
    uniqueIndex("misc_payments_recurring_period_key")
      .on(t.recurringId, t.period)
      .where(sql`${t.recurringId} is not null`),
    uniqueIndex("misc_payments_payment_no_key")
      .on(t.paymentNo)
      .where(sql`${t.paymentNo} is not null`),
  ]
);

// 案件外支払のカテゴリマスタ（賃料・給与など）。論理削除のみ（過去の支払は名称を文字列で保持）。
export const paymentCategories = pgTable(
  "payment_categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    order: integer("order"),
    note: text("note"),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [uniqueIndex("payment_categories_name_key").on(t.name)]
);

// 自社口座マスタ（支払元の選択枠。最大5件）。論理削除のみ。口座番号は一覧では下4桁のみ返す。
export const companyAccounts = pgTable(
  "company_accounts",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(), // 表示名
    bankName: text("bank_name"),
    branchName: text("branch_name"),
    accountType: text("account_type"), // 普通 | 当座
    accountNumber: text("account_number"),
    accountHolder: text("account_holder"), // 口座名義（カナ）。請求書PDFの振込先に印字
    isDefault: boolean("is_default").notNull().default(false), // デフォルト口座（1件だけ。入金口座の初期選択）
    sortOrder: integer("sort_order").notNull().default(0),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("company_accounts_active_name_key")
      .on(t.name)
      .where(sql`${t.deletedAt} is null`),
    check(
      "company_accounts_account_type_valid",
      sql`${t.accountType} is null or ${t.accountType} in ('普通', '当座')`
    ),
  ]
);

// 振込手数料ルール（自社口座 × 同一銀行宛/他行宛 × 金額帯）。amount_to は上限なし=null（未満）。
export const transferFeeRules = pgTable(
  "transfer_fee_rules",
  {
    id: serial("id").primaryKey(),
    companyAccountId: integer("company_account_id").notNull(),
    bankScope: text("bank_scope").notNull(), // same | other
    amountFrom: bigint("amount_from", { mode: "number" }).notNull().default(0),
    amountTo: bigint("amount_to", { mode: "number" }),
    fee: bigint("fee", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    index("transfer_fee_rules_company_account_id_idx").on(t.companyAccountId),
    check(
      "transfer_fee_rules_bank_scope_valid",
      sql`${t.bankScope} in ('same', 'other')`
    ),
    check("transfer_fee_rules_amount_from_nonneg", sql`${t.amountFrom} >= 0`),
    check(
      "transfer_fee_rules_amount_to_gt_from",
      sql`${t.amountTo} is null or ${t.amountTo} > ${t.amountFrom}`
    ),
    check("transfer_fee_rules_fee_nonneg", sql`${t.fee} >= 0`),
  ]
);

// 定期支払い（毎月・毎年）の定義。月ごとの実体は misc_payments に具体化される。
export const recurringPayments = pgTable(
  "recurring_payments",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    categoryName: text("category_name"),
    payee: text("payee"),
    branch: text("branch"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    frequency: text("frequency").notNull(), // monthly | yearly
    dueDay: integer("due_day"), // 1-31（月の日数を超える場合は月末）
    dueDayIsMonthEnd: boolean("due_day_is_month_end").notNull().default(false),
    monthOfYear: integer("month_of_year"), // yearly のみ 1-12
    startMonth: text("start_month").notNull(), // "YYYY-MM"
    endMonth: text("end_month"),
    notes: text("notes"),
    // 既定の振込手数料・支払方法（markPaid が具体化する misc_payments 行へ複写）
    transferFee: bigint("transfer_fee", { mode: "number" }),
    paymentMethod: text("payment_method"),
    // 既定の支払元自社口座（company_accounts.id）。具体化行へ複写され、手数料の算出に使う
    companyAccountId: integer("company_account_id"),
    version: integer("version").notNull().default(1), // optimistic lock
    deletedAt: timestamp("deleted_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    check("recurring_payments_amount_nonneg", sql`${t.amount} >= 0`),
    check(
      "recurring_payments_transfer_fee_nonneg",
      sql`${t.transferFee} is null or ${t.transferFee} >= 0`
    ),
    check(
      "recurring_payments_frequency_valid",
      sql`${t.frequency} in ('monthly', 'yearly')`
    ),
    check(
      "recurring_payments_due_day_range",
      sql`${t.dueDay} is null or (${t.dueDay} >= 1 and ${t.dueDay} <= 31)`
    ),
    check(
      "recurring_payments_month_of_year_range",
      sql`${t.monthOfYear} is null or (${t.monthOfYear} >= 1 and ${t.monthOfYear} <= 12)`
    ),
  ]
);

// 定期支払いの「今月は支払なし」。該当月は月次・年次ビューから外れる（定義は変えない）。
export const recurringPaymentSkips = pgTable(
  "recurring_payment_skips",
  {
    id: serial("id").primaryKey(),
    recurringId: integer("recurring_id").notNull(),
    period: text("period").notNull(), // "YYYY-MM"
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("recurring_payment_skips_recurring_period_key").on(
      t.recurringId,
      t.period
    ),
  ]
);

// 工事外売上（不動産賃貸収入・備品売上など）。案件（projects）に紐付かない入金予定・実績。
// 定期売上（recurring_receipts）から作られた行は (recurring_id, period) で1件に限る。
export const miscReceipts = pgTable(
  "misc_receipts",
  {
    id: serial("id").primaryKey(),
    category: text("category"),
    type: text("type").default("入金"),
    payer: text("payer"), // 入金元
    amount: bigint("amount", { mode: "number" }),
    receiptDate: text("receipt_date"), // 入金予定日 YYYY-MM-DD
    status: text("status").default("未入金"), // 未入金 | 入金済
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    name: text("name"), // 名称（任意）
    recurringId: integer("recurring_id"),
    period: text("period"), // "YYYY-MM"（定期売上の対象月）
    // 売上ID。WS{期2桁}-{月2桁}-{NNN}（ADR-0013）
    receiptNo: text("receipt_no"),
    // 入金先の自社口座（company_accounts.id）
    companyAccountId: integer("company_account_id"),
  },
  (t) => [
    uniqueIndex("misc_receipts_recurring_period_key")
      .on(t.recurringId, t.period)
      .where(sql`${t.recurringId} is not null`),
    uniqueIndex("misc_receipts_receipt_no_key")
      .on(t.receiptNo)
      .where(sql`${t.receiptNo} is not null`),
  ]
);

// 工事外売上の区分マスタ（賃貸収入・備品売上など）。論理削除のみ（過去の売上は名称を文字列で保持）。
export const receiptCategories = pgTable(
  "receipt_categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    order: integer("order"),
    note: text("note"),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [uniqueIndex("receipt_categories_name_key").on(t.name)]
);

// 定期売上（毎月・毎年）の定義。月ごとの実体は misc_receipts に具体化される。
export const recurringReceipts = pgTable(
  "recurring_receipts",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    categoryName: text("category_name"),
    payer: text("payer"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    frequency: text("frequency").notNull(), // monthly | yearly
    dueDay: integer("due_day"), // 1-31（月の日数を超える場合は月末）
    dueDayIsMonthEnd: boolean("due_day_is_month_end").notNull().default(false),
    monthOfYear: integer("month_of_year"), // yearly のみ 1-12
    startMonth: text("start_month").notNull(), // "YYYY-MM"
    endMonth: text("end_month"),
    notes: text("notes"),
    companyAccountId: integer("company_account_id"), // 入金先の自社口座
    version: integer("version").notNull().default(1), // optimistic lock
    deletedAt: timestamp("deleted_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    check("recurring_receipts_amount_nonneg", sql`${t.amount} >= 0`),
    check(
      "recurring_receipts_frequency_valid",
      sql`${t.frequency} in ('monthly', 'yearly')`
    ),
    check(
      "recurring_receipts_due_day_range",
      sql`${t.dueDay} is null or (${t.dueDay} >= 1 and ${t.dueDay} <= 31)`
    ),
    check(
      "recurring_receipts_month_of_year_range",
      sql`${t.monthOfYear} is null or (${t.monthOfYear} >= 1 and ${t.monthOfYear} <= 12)`
    ),
  ]
);

// 定期売上の「当月入金なし」。該当月は月次ビューから外れる（定義は変えない）。
export const recurringReceiptSkips = pgTable(
  "recurring_receipt_skips",
  {
    id: serial("id").primaryKey(),
    recurringId: integer("recurring_id").notNull(),
    period: text("period").notNull(), // "YYYY-MM"
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("recurring_receipt_skips_recurring_period_key").on(
      t.recurringId,
      t.period
    ),
  ]
);

// Files stored as base64 data URLs directly in Postgres (not object storage) — an explicitly
// unresolved decision in the migration plan (see plan doc "未解決のまま進める判断").
// Composite PK (parent id, kind): one row per document kind per parent.
export const projectFiles = pgTable(
  "project_files",
  {
    projectId: integer("project_id").notNull(),
    kind: text("kind").notNull(), // "contract" (契約書) | others as introduced
    filename: text("filename"),
    dataUrl: text("data_url"),
    uploadedAt: timestamp("uploaded_at", { mode: "date" }).defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.kind] })]
);

// 見積書の格納（外部で作成したPDFを案件ごとに複数保管する。システムでは見積書を発行しない）。
export const estimateFiles = pgTable(
  "estimate_files",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").notNull(),
    filename: text("filename"),
    dataUrl: text("data_url"),
    uploadedBy: integer("uploaded_by"),
    uploadedAt: timestamp("uploaded_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    index("estimate_files_project_id_idx").on(t.projectId),
    // 見積書は1案件につき1枚だけ
    uniqueIndex("estimate_files_project_key").on(t.projectId),
  ]
);

// 支店の手動管理（自動データ zengin-code とは別管理）。手動で追加した支店（action=add のみ使用）。
export const bankBranchOverrides = pgTable(
  "bank_branch_overrides",
  {
    id: serial("id").primaryKey(),
    bankCode: text("bank_code").notNull(),
    action: text("action").notNull(), // add | hide
    branchCode: text("branch_code"),
    name: text("name").notNull(),
    kana: text("kana"), // ひらがなの読み（add のみ。並び・頭文字の絞り込み用）
    note: text("note"),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("bank_branch_overrides_key").on(t.bankCode, t.action, t.name),
    index("bank_branch_overrides_bank_idx").on(t.bankCode),
  ]
);

// 自動連携の支店データの最新化結果（銀行ごと）。手動の追加（bank_branch_overrides）とは別管理。
export const bankBranchCache = pgTable("bank_branch_cache", {
  bankCode: text("bank_code").primaryKey(),
  branches: jsonb("branches")
    .$type<{ code: string; hira: string; name: string }[]>()
    .notNull(),
  fetchedAt: timestamp("fetched_at", { mode: "date" }).defaultNow(),
  fetchedBy: integer("fetched_by"),
});

// 案件の書類格納（工事完了報告書など。複数可）。請求書メールの添付候補になる。
export const projectDocuments = pgTable(
  "project_documents",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").notNull(),
    kind: text("kind").notNull().default("その他"), // 工事完了報告書 | その他
    filename: text("filename").notNull(),
    dataUrl: text("data_url").notNull(),
    uploadedBy: integer("uploaded_by"),
    uploadedAt: timestamp("uploaded_at", { mode: "date" }).defaultNow(),
  },
  (t) => [index("project_documents_project_id_idx").on(t.projectId)]
);

// 5年を過ぎた案件の書類を、画像を再圧縮したZIPにまとめた保管庫（月次バッチ。ADR-0021）。
// 元の書類の本体（data_url / pdf）は、ZIPに入れた後で空にする（行とファイル名は残す）。
export const fileArchives = pgTable(
  "file_archives",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").notNull(),
    archivedAt: timestamp("archived_at", { mode: "date" }).defaultNow(),
    fileCount: integer("file_count").notNull(),
    bytesBefore: bigint("bytes_before", { mode: "number" }).notNull(),
    bytesAfter: bigint("bytes_after", { mode: "number" }).notNull(),
    manifest: jsonb("manifest").notNull().$type<ArchiveManifestEntry[]>(),
    zip: bytea("zip").notNull(),
  },
  (t) => [index("file_archives_project_id_idx").on(t.projectId)]
);

// 画面の排他制御。scope（例: plan:12 / receipts / payments）ごとに編集中の1名を記録する。
export const editLocks = pgTable("edit_locks", {
  scope: text("scope").primaryKey(),
  userId: integer("user_id").notNull(),
  userName: text("user_name").notNull(),
  // 画面（ブラウザのタブ）ごとの識別子。同じユーザーが別のタブで開いても、後から開いた側は閲覧のみにする。
  clientId: text("client_id"),
  // 最後の操作の時刻。これが15分以上前なら、画面を開いたままでも他の人が編集できる。
  activityAt: timestamp("activity_at", { mode: "date" }),
  heartbeatAt: timestamp("heartbeat_at", { mode: "date" })
    .notNull()
    .defaultNow(),
});

// 通知の開封状態（ユーザーごと）。通知はデータから計算するため、キー（種類:対象:日付）で開封済みを覚える。
export const notificationOpens = pgTable(
  "notification_opens",
  {
    userId: integer("user_id").notNull(),
    notifKey: text("notif_key").notNull(),
    openedAt: timestamp("opened_at", { mode: "date" }).defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.notifKey] })]
);

export const orderFiles = pgTable(
  "order_files",
  {
    orderId: integer("order_id").notNull(),
    kind: text("kind").notNull(), // "ack" (請書) | "invoice" (請求書)
    filename: text("filename"),
    dataUrl: text("data_url"),
    uploadedAt: timestamp("uploaded_at", { mode: "date" }).defaultNow(),
    // 電帳法の検索要件（日付・金額）。旧データは NULL（ADR-0010）。
    docDate: text("doc_date"), // 書類の日付 YYYY-MM-DD
    docAmount: bigint("doc_amount", { mode: "number" }), // 書類の金額（円・整数）
  },
  (t) => [
    primaryKey({ columns: [t.orderId, t.kind] }),
    check(
      "order_files_doc_amount_nonneg",
      sql`${t.docAmount} IS NULL OR ${t.docAmount} >= 0`
    ),
  ]
);
