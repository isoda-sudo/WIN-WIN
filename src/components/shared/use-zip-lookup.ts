"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ZIP_CODE_RE } from "~/lib/zipcode";

/**
 * 郵便番号→住所の自動入力ロジック（顧客マスタ・発注先マスタで共通利用）。
 * /api/zipcode（zipcloud APIのサーバー中継）を叩き、見つかった住所を
 * onFound に渡す。
 */
export function useZipCodeLookup(onFound: (address: string) => void) {
  const [lookingUp, setLookingUp] = useState(false);

  const lookup = async (zipRaw: string) => {
    const zip = zipRaw.replaceAll("-", "").trim();
    if (!ZIP_CODE_RE.test(zip)) {
      toast.error("郵便番号は7桁の数字で入力してください");
      return;
    }
    setLookingUp(true);
    try {
      const res = await fetch(`/api/zipcode?zip=${zip}`);
      const data = (await res.json()) as { address?: string; error?: string };
      if (!res.ok) {
        toast.error(
          data.error ?? "住所の検索に失敗しました。住所を手入力してください"
        );
        return;
      }
      if (!data.address) {
        toast.error("該当する住所が見つかりませんでした");
        return;
      }
      onFound(data.address);
    } catch {
      toast.error("住所の検索に失敗しました。住所を手入力してください");
    } finally {
      setLookingUp(false);
    }
  };

  return { lookingUp, lookup };
}
