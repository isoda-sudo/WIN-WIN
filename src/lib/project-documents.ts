/** 案件の書類格納の種別（受注一覧の「書類」から格納する）。 */
export const PROJECT_DOCUMENT_KINDS = ["工事完了報告書", "その他"] as const;
export type ProjectDocumentKind = (typeof PROJECT_DOCUMENT_KINDS)[number];
