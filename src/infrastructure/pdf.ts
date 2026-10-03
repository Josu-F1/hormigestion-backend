import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import type { Quotation } from "../domain/cotizacion.js";

export function quotationPdf(quote: Quotation): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 45, info: { Title: `Cotización ${quote.codigo}`, Author: "HormiGestión" } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont("Body", fileURLToPath(new URL("./assets/fonts/LiberationSans-Regular.ttf", import.meta.url)));
    doc.registerFont("Bold", fileURLToPath(new URL("./assets/fonts/LiberationSans-Bold.ttf", import.meta.url)));
    doc.lineGap(2).font("Bold").fontSize(20).text("HormiGestión — Cotización");
    doc.moveDown(0.5).font("Body").fontSize(10).text(quote.codigo);
    if (quote.calculo.datosDemostracion) doc.fillColor("#a33").text("DATOS FICTICIOS DE DEMOSTRACIÓN").fillColor("black");
    doc.moveDown().text(`Estado: ${quote.estado}`);
    doc.text(`Contacto: ${quote.contacto.nombre} | ${quote.contacto.telefono}`);
    doc.text(`Obra: ${quote.obra.direccion}`);
    doc.text(`Fecha preferida: ${quote.obra.fechaPreferida} — sujeta a confirmación`);
    doc.text(`Emitida: ${quote.creadoEn} | Válida hasta: ${quote.validaHasta}`);
    doc.text(`Configuración aplicada: versión ${quote.calculo.versionConfiguracion}`);
    doc.moveDown().font("Bold").fontSize(12).text("Detalle").font("Body").fontSize(10);
    for (const detail of quote.calculo.detalles) {
      doc.moveDown(0.5).text(`${detail.elementoNombre} | ${detail.resistenciaCodigo}`);
      doc.text(`Neto ${detail.volumenNetoM3} m³ | Desperdicio ${detail.desperdicioPct}% | Pedido ${detail.volumenTotalM3} m³`);
      doc.text(`USD ${detail.precioUnitarioM3}/m³ | Hormigón: USD ${detail.subtotalHormigon}`);
    }
    doc.moveDown().text(`Volumen total: ${quote.calculo.volumenTotalM3} m³`);
    doc.text(`Hormigón: USD ${quote.calculo.subtotalHormigon}`);
    doc.text(`Flete: USD ${quote.calculo.subtotalFlete}`);
    doc.text(`Bombeo: USD ${quote.calculo.subtotalBombeo}`);
    doc.text(`Subtotal: USD ${quote.calculo.subtotalSinImpuesto}`);
    doc.text(`Impuesto configurado ${quote.calculo.ivaPct}%: USD ${quote.calculo.impuesto}`);
    doc.font("Bold").fontSize(14).text(`TOTAL: USD ${quote.calculo.total}`);
    doc.moveDown().font("Body").fontSize(9).text(quote.calculo.condiciones);
    doc.moveDown(0.5).text("Este comprobante de solicitud no confirma una reserva ni constituye una factura.");
    doc.end();
  });
}
