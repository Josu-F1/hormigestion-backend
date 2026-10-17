import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import type { Quotation } from "../domain/cotizacion.js";

function formatDate(isoStr?: string): string {
  if (!isoStr) return "-";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const day = String(d.getUTCDate()).padStart(2, "0");
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const year = d.getUTCFullYear();
    return `${day}.${month}.${year}`;
  } catch {
    return isoStr;
  }
}

function formatSimpleDate(dateStr?: string): string {
  if (!dateStr) return "-";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return dateStr;
}

export function quotationPdf(quote: Quotation): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Configuración estricta de márgenes y tamaño A4 para garantizar exactamente 1 página
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 25, left: 45, right: 45 },
      info: {
        Title: `Cotización ${quote.codigo} - Hormigonera Tungurahua`,
        Author: "Hormigonera Tungurahua Cía. Ltda.",
        Subject: "Comprobante oficial de cotización técnica de hormigón premezclado",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("Body", fileURLToPath(new URL("./assets/fonts/LiberationSans-Regular.ttf", import.meta.url)));
    doc.registerFont("Bold", fileURLToPath(new URL("./assets/fonts/LiberationSans-Bold.ttf", import.meta.url)));
    doc.registerFont("Mono", fileURLToPath(new URL("./assets/fonts/Consolas-Regular.ttf", import.meta.url)));
    doc.registerFont("MonoBold", fileURLToPath(new URL("./assets/fonts/Consolas-Bold.ttf", import.meta.url)));

    const left = 45;
    const right = 550;
    const pageWidth = right - left; // 505 pt

    // ==========================================
    // 1. ENCABEZADO SUPERIOR MINIMALISTA
    // ==========================================
    // Izquierda: Identidad de la empresa
    doc.font("Bold").fontSize(15).fillColor("#111827").text("HORMIGONERA TUNGURAHUA", left, 40);
    doc.font("Body").fontSize(7.5).fillColor("#6b7280").text("CÍA. LTDA. · HORMIGÓN PREMEZCLADO Y SERVICIOS", left, 56);
    doc.font("Body").fontSize(7.5).fillColor("#4b5563").text("Planta Salasaca: Vía Ambato – Pelileo Km 10", left, 66);
    doc.font("Body").fontSize(7.5).fillColor("#4b5563").text("San Pedro de Pelileo, Tungurahua, Ecuador", left, 76);

    // Derecha: Datos de contacto y fiscales
    const headerRightX = 280;
    const headerRightW = 270;
    doc.font("Bold").fontSize(8).fillColor("#111827").text("Hormigonera Tungurahua Cía. Ltda.", headerRightX, 40, { width: headerRightW, align: "right" });
    doc.font("Mono").fontSize(7.5).fillColor("#4b5563").text("RUC: 1891784920001", headerRightX, 51, { width: headerRightW, align: "right" });
    doc.font("Mono").fontSize(7.5).fillColor("#4b5563").text("Tel: (03) 287-0123 · Cel: 099 876 5432", headerRightX, 61, { width: headerRightW, align: "right" });
    doc.font("Body").fontSize(7.5).fillColor("#4b5563").text("E-mail: contacto@hormigonera-tungurahua.com", headerRightX, 71, { width: headerRightW, align: "right" });
    doc.font("Body").fontSize(7.5).fillColor("#4b5563").text("Página web: www.hormigestion.ec", headerRightX, 81, { width: headerRightW, align: "right" });

    // Línea separadora horizontal sutil
    doc.moveTo(left, 95).lineTo(right, 95).lineWidth(0.5).strokeColor("#e5e7eb").stroke();

    // ==========================================
    // 2. DATOS DEL CLIENTE Y DEL COMPROBANTE
    // ==========================================
    const infoY = 104;
    
    // Columna Izquierda: Cliente y Obra
    doc.font("Body").fontSize(7.5).fillColor("#6b7280").text("Cotización a:", left, infoY);
    doc.font("Bold").fontSize(9).fillColor("#111827").text(quote.contacto.nombre, left, infoY + 11, { width: 240 });
    
    let curClientY = infoY + 23;
    doc.font("Mono").fontSize(7.5).fillColor("#374151").text(`Tel: ${quote.contacto.telefono}`, left, curClientY, { width: 240 });
    curClientY += 11;
    if (quote.contacto.email) {
      doc.font("Body").fontSize(7.5).fillColor("#374151").text(`E-mail: ${quote.contacto.email}`, left, curClientY, { width: 240 });
      curClientY += 11;
    }
    doc.font("Body").fontSize(7.5).fillColor("#374151").text(`Dirección de obra: ${quote.obra.direccion}`, left, curClientY, { width: 240 });
    curClientY += 11;
    doc.font("Body").fontSize(7.5).fillColor("#374151").text(`Ubicación: ${quote.calculo.zona.sector}, ${quote.calculo.zona.canton}`, left, curClientY, { width: 240 });

    // Columna Derecha: Metadatos de la cotización
    let metaY = infoY;
    const metaX = 300;
    const metaW = 250;

    // Fila 1: Código de cotización
    doc.font("Body").fontSize(7.5).fillColor("#6b7280").text("Cotización:", metaX, metaY);
    doc.font("MonoBold").fontSize(7.5).fillColor("#111827").text(quote.codigo, metaX, metaY, { width: metaW, align: "right" });
    metaY += 13;

    // Fila 2: Emisión
    doc.font("Body").fontSize(7.5).fillColor("#6b7280").text("Fecha de emisión:", metaX, metaY);
    doc.font("Mono").fontSize(7.5).fillColor("#111827").text(formatDate(quote.creadoEn), metaX, metaY, { width: metaW, align: "right" });
    metaY += 13;

    // Fila 3: Colado
    doc.font("Body").fontSize(7.5).fillColor("#6b7280").text("Fecha de colado:", metaX, metaY);
    doc.font("Mono").fontSize(7.5).fillColor("#111827").text(formatSimpleDate(quote.obra.fechaPreferida), metaX, metaY, { width: metaW, align: "right" });
    metaY += 13;

    // Fila 4: Vencimiento
    doc.font("Body").fontSize(7.5).fillColor("#6b7280").text("Fecha de vencimiento:", metaX, metaY);
    doc.font("Mono").fontSize(7.5).fillColor("#111827").text(formatDate(quote.validaHasta), metaX, metaY, { width: metaW, align: "right" });
    metaY += 13;

    // Fila 5: Estado
    doc.font("Body").fontSize(7.5).fillColor("#6b7280").text("Estado:", metaX, metaY);
    doc.font("Bold").fontSize(7.5).fillColor("#111827").text(quote.estado, metaX, metaY, { width: metaW, align: "right" });

    // Línea divisoria antes de la tabla
    const tableStartY = Math.max(curClientY + 16, metaY + 10, 172);
    doc.moveTo(left, tableStartY).lineTo(right, tableStartY).lineWidth(0.5).strokeColor("#e5e7eb").stroke();

    // ==========================================
    // 3. TABLA DE ÍTEMS Y SUMINISTROS
    // ==========================================
    const thY = tableStartY + 9;
    const colDescX = left;
    const colDescW = 230;
    const colCantX = 280;
    const colCantW = 45;
    const colUnidX = 330;
    const colUnidW = 35;
    const colPrecX = 370;
    const colPrecW = 50;
    const colIvaX = 425;
    const colIvaW = 35;
    const colTotX = 465;
    const colTotW = 85;

    doc.font("Bold").fontSize(7.5).fillColor("#4b5563");
    doc.text("Descripción", colDescX, thY);
    doc.text("Cantidad", colCantX, thY, { width: colCantW, align: "right" });
    doc.text("Unidad", colUnidX, thY, { width: colUnidW, align: "center" });
    doc.text("Precio", colPrecX, thY, { width: colPrecW, align: "right" });
    doc.text("IVA", colIvaX, thY, { width: colIvaW, align: "right" });
    doc.text("Importe", colTotX, thY, { width: colTotW, align: "right" });

    // Línea fina debajo de encabezados
    doc.moveTo(left, thY + 12).lineTo(right, thY + 12).lineWidth(0.75).strokeColor("#111827").stroke();

    let rowY = thY + 18;

    // A. Filas de Hormigón
    for (const d of quote.calculo.detalles) {
      doc.font("Bold").fontSize(8).fillColor("#111827").text(`Hormigón f'c ${d.fcKgfCm2} kgf/cm² — ${d.elementoNombre}`, colDescX, rowY, { width: colDescW });
      doc.font("Body").fontSize(6.5).fillColor("#6b7280").text(
        `Slump: ${d.slumpObjetivoMm} mm · Árido máx: ${d.agregadoMaxMm} mm · Desp. técnico: ${d.desperdicioPct}%`,
        colDescX,
        rowY + 10,
        { width: colDescW }
      );

      doc.font("Mono").fontSize(7.5).fillColor("#111827").text(parseFloat(d.volumenTotalM3).toFixed(2), colCantX, rowY, { width: colCantW, align: "right" });
      doc.font("Body").fontSize(7.5).fillColor("#4b5563").text("m³", colUnidX, rowY, { width: colUnidW, align: "center" });
      doc.font("Mono").fontSize(7.5).fillColor("#111827").text(parseFloat(d.precioUnitarioM3).toFixed(2), colPrecX, rowY, { width: colPrecW, align: "right" });
      doc.font("Mono").fontSize(7.5).fillColor("#4b5563").text(`${quote.calculo.ivaPct}%`, colIvaX, rowY, { width: colIvaW, align: "right" });
      doc.font("MonoBold").fontSize(8).fillColor("#111827").text(parseFloat(d.subtotalHormigon).toFixed(2), colTotX, rowY, { width: colTotW, align: "right" });

      rowY += 24;
    }

    // B. Fila de Flete Mixer
    const fleteSub = parseFloat(quote.calculo.subtotalFlete) || 0;
    if (fleteSub > 0) {
      doc.font("Bold").fontSize(8).fillColor("#111827").text("Servicio de Transporte y Flete Mixer", colDescX, rowY, { width: colDescW });
      doc.font("Body").fontSize(6.5).fillColor("#6b7280").text(
        `Destino: ${quote.calculo.zona.sector}, ${quote.calculo.zona.canton} (~${quote.calculo.zona.distanciaKm} km) · ~${quote.calculo.viajesEstimadosReferencia} viajes`,
        colDescX,
        rowY + 10,
        { width: colDescW }
      );

      doc.font("Mono").fontSize(7.5).fillColor("#111827").text(parseFloat(quote.calculo.volumenTotalM3).toFixed(2), colCantX, rowY, { width: colCantW, align: "right" });
      doc.font("Body").fontSize(7.5).fillColor("#4b5563").text("m³", colUnidX, rowY, { width: colUnidW, align: "center" });
      doc.font("Mono").fontSize(7.5).fillColor("#111827").text(parseFloat(quote.calculo.zona.tarifaFleteM3).toFixed(2), colPrecX, rowY, { width: colPrecW, align: "right" });
      doc.font("Mono").fontSize(7.5).fillColor("#4b5563").text(`${quote.calculo.ivaPct}%`, colIvaX, rowY, { width: colIvaW, align: "right" });
      doc.font("MonoBold").fontSize(8).fillColor("#111827").text(fleteSub.toFixed(2), colTotX, rowY, { width: colTotW, align: "right" });

      rowY += 24;
    }

    // C. Fila de Bombeo
    const bombeoSub = parseFloat(quote.calculo.subtotalBombeo) || 0;
    if (quote.calculo.requiereBombeo && bombeoSub > 0) {
      const volNum = parseFloat(quote.calculo.volumenTotalM3) || 1;
      const unitPump = (bombeoSub / volNum).toFixed(2);

      doc.font("Bold").fontSize(8).fillColor("#111827").text("Servicio de Bombeo de Hormigón", colDescX, rowY, { width: colDescW });
      doc.font("Body").fontSize(6.5).fillColor("#6b7280").text(
        "Equipo de bombeo y tubería de impulsión para colocación en obra",
        colDescX,
        rowY + 10,
        { width: colDescW }
      );

      doc.font("Mono").fontSize(7.5).fillColor("#111827").text(volNum.toFixed(2), colCantX, rowY, { width: colCantW, align: "right" });
      doc.font("Body").fontSize(7.5).fillColor("#4b5563").text("m³", colUnidX, rowY, { width: colUnidW, align: "center" });
      doc.font("Mono").fontSize(7.5).fillColor("#111827").text(unitPump, colPrecX, rowY, { width: colPrecW, align: "right" });
      doc.font("Mono").fontSize(7.5).fillColor("#4b5563").text(`${quote.calculo.ivaPct}%`, colIvaX, rowY, { width: colIvaW, align: "right" });
      doc.font("MonoBold").fontSize(8).fillColor("#111827").text(bombeoSub.toFixed(2), colTotX, rowY, { width: colTotW, align: "right" });

      rowY += 24;
    }

    // Línea de cierre de la tabla
    doc.moveTo(left, rowY).lineTo(right, rowY).lineWidth(0.5).strokeColor("#e5e7eb").stroke();

    // ==========================================
    // 4. RESUMEN DE TOTALES (ALINEADO A LA DERECHA)
    // ==========================================
    let totY = rowY + 10;
    const totLabelX = 330;
    const totValX = 450;
    const totValW = 100;

    doc.font("Body").fontSize(7.5).fillColor("#4b5563").text("Subtotal sin IVA", totLabelX, totY);
    doc.font("Mono").fontSize(7.5).fillColor("#111827").text(parseFloat(quote.calculo.subtotalSinImpuesto).toFixed(2), totValX, totY, { width: totValW, align: "right" });

    totY += 12;
    doc.font("Body").fontSize(7.5).fillColor("#4b5563").text(`IVA ${quote.calculo.ivaPct}%`, totLabelX, totY);
    doc.font("Mono").fontSize(7.5).fillColor("#111827").text(parseFloat(quote.calculo.impuesto).toFixed(2), totValX, totY, { width: totValW, align: "right" });

    totY += 14;
    doc.moveTo(totLabelX, totY - 3).lineTo(right, totY - 3).lineWidth(0.75).strokeColor("#111827").stroke();

    doc.font("Bold").fontSize(8.5).fillColor("#111827").text("Total USD", totLabelX, totY);
    doc.font("MonoBold").fontSize(9).fillColor("#111827").text(parseFloat(quote.calculo.total).toFixed(2), totValX, totY - 1, { width: totValW, align: "right" });

    totY += 14;
    doc.moveTo(totLabelX, totY - 3).lineTo(right, totY - 3).lineWidth(0.5).strokeColor("#e5e7eb").stroke();

    doc.font("Bold").fontSize(9).fillColor("#111827").text("Importe a pagar (USD)", totLabelX, totY);
    doc.font("MonoBold").fontSize(10.5).fillColor("#111827").text(parseFloat(quote.calculo.total).toFixed(2), totValX, totY - 1, { width: totValW, align: "right" });

    // ==========================================
    // 5. TÉRMINOS Y CONDICIONES (COMPACTOS Y SIN SOLAPAMIENTO)
    // ==========================================
    let condY = totY + 20;
    doc.font("Bold").fontSize(8).fillColor("#111827").text("Términos y Condiciones", left, condY);
    condY += 11;

    const terms = [
      "Descarga en obra: Incluye hasta 30 minutos de descarga libre por camión mixer en obra; tiempo adicional causa recargo por estadía.",
      "Calidad técnica: Prohibido agregar agua al mixer en obra; cualquier alteración anula la garantía de resistencia f'c a los 28 días (Normas INEN 1855 / ASTM C94).",
      "Accesibilidad: El cliente garantiza accesos firmes y despejados para camiones mixer de hasta 28 toneladas brutas.",
      "Programación y validez: Despacho confirmado con al menos 24 horas de anticipación. Oferta válida por 15 días calendario.",
    ];

    doc.font("Body").fontSize(7).fillColor("#4b5563");
    for (const term of terms) {
      const bulletText = `•  ${term}`;
      const itemHeight = doc.heightOfString(bulletText, { width: pageWidth, lineGap: 1.5 });
      doc.text(bulletText, left, condY, { width: pageWidth, lineGap: 1.5 });
      condY += itemHeight + 3.5;
    }

    // ==========================================
    // 6. INFORMACIÓN BANCARIA Y PIE DE PÁGINA (POSICIÓN SEGURA DE 1 PÁGINA)
    // ==========================================
    const footerRuleY = 740;
    doc.moveTo(left, footerRuleY).lineTo(right, footerRuleY).lineWidth(0.5).strokeColor("#e5e7eb").stroke();

    doc.font("Mono").fontSize(6.8).fillColor("#4b5563").text(
      "Banco: Banco Pichincha · Tipo: Cuenta Corriente Nº 2100894521 · Titular: Hormigonera Tungurahua Cía. Ltda. · RUC: 1891784920001",
      left,
      footerRuleY + 5,
      { width: pageWidth, align: "center" }
    );

    doc.font("Body").fontSize(6.5).fillColor("#9ca3af").text(
      "HormiGestión · Software Integral de Dosificación y Despacho Técnico de Hormigón",
      left,
      footerRuleY + 16,
      { width: 300, align: "left" }
    );

    doc.font("MonoBold").fontSize(6.8).fillColor("#6b7280").text(
      `Página 1 de 1 de cotización #${quote.codigo}`,
      250,
      footerRuleY + 16,
      { width: 300, align: "right" }
    );

    doc.end();
  });
}
