import PDFDocument from "pdfkit";
import type { GrowthReportData } from "~/server/api/routers/dashboard";
import { useJpFont } from "./font";

// 色：ヘッダー＝青強めネイビー、グラフ＝Web画面と同色（棒=#7c6cf6 / 線=#030424）。server.js の
// /api/report/growth-pdf ハンドラをそのまま移植。
const HEADER_NAVY = "#1e2a78";
const BAR_COLOR = "#7c6cf6";
const LINE_COLOR = "#030424";

/** 売上（棒グラフ）・利益（折れ線）の月次推移PDF（A4横）を生成する。 */
export function buildGrowthReportPdf(data: GrowthReportData): Promise<Buffer> {
  const { points, totalRevenue, totalProfit, from, to } = data;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: "A4",
      layout: "landscape",
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    useJpFont(doc);

    const pageW = doc.page.width;

    // ヘッダー
    doc.rect(0, 0, pageW, 48).fill(HEADER_NAVY);
    doc.fillColor("white").fontSize(15).text("WIN WIN", 40, 9);
    doc
      .fontSize(10)
      .fillColor("#cdd3f0")
      .text("レポート（受注・入金推移）", 40, 30);
    doc.fillColor("black");

    doc.fontSize(12).text(`売上・利益レポート　${from} 〜 ${to}`, 40, 68);
    doc.fontSize(10).fillColor("black");
    doc.text(`売上合計：¥${totalRevenue.toLocaleString()}`, 40, 90);
    doc.text(`利益合計：¥${totalProfit.toLocaleString()}`, 320, 90);

    const chartX = 60;
    const chartY = 140;
    const chartW = pageW - 120;
    const chartH = 330;
    doc.lineWidth(1).strokeColor("#d1d5db");
    doc
      .moveTo(chartX, chartY)
      .lineTo(chartX, chartY + chartH)
      .stroke();
    doc
      .moveTo(chartX, chartY + chartH)
      .lineTo(chartX + chartW, chartY + chartH)
      .stroke();

    const maxV = Math.max(
      1,
      ...points.map((p) => Math.max(p.revenue, p.profit))
    );
    const n = points.length || 1;
    const slot = chartW / n;
    const barW = Math.min(30, slot * 0.5);

    // Sales bars（Web同色・半透明）
    for (const [i, p] of points.entries()) {
      const hh = (p.revenue / maxV) * (chartH - 10);
      const x = chartX + slot * i + (slot - barW) / 2;
      const y = chartY + chartH - hh;
      doc.save().fillOpacity(0.55).fill(BAR_COLOR);
      doc.rect(x, y, barW, hh).fill();
      doc.restore();
      doc
        .fillColor("#6b7280")
        .fontSize(6)
        .text(
          p.ym.replace("-", "/").slice(2),
          chartX + slot * i,
          chartY + chartH + 4,
          {
            width: slot,
            align: "center",
          }
        );
      doc.fillColor("black");
    }

    // Profit line
    doc.strokeColor(LINE_COLOR).lineWidth(2);
    for (const [i, p] of points.entries()) {
      const x = chartX + slot * i + slot / 2;
      const y = chartY + chartH - (p.profit / maxV) * (chartH - 10);
      if (i === 0) {
        doc.moveTo(x, y);
      } else {
        doc.lineTo(x, y);
      }
    }
    doc.stroke();

    // 凡例
    doc
      .save()
      .fillOpacity(0.55)
      .fillColor(BAR_COLOR)
      .rect(chartX, chartY - 22, 12, 12)
      .fill()
      .restore();
    doc
      .fillColor("#333")
      .fontSize(9)
      .text("売上", chartX + 16, chartY - 21);
    doc
      .strokeColor(LINE_COLOR)
      .lineWidth(2)
      .moveTo(chartX + 56, chartY - 16)
      .lineTo(chartX + 76, chartY - 16)
      .stroke();
    doc.fillColor("#333").text("利益", chartX + 80, chartY - 21);
    doc
      .fillColor("#888")
      .fontSize(8)
      .text(
        "※ 売上＝案件の工期開始月の契約金額、利益＝売上−注文確定額",
        40,
        chartY + chartH + 24
      );

    doc.end();
  });
}
