function trim(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

export type JpegSheet = {
  jpeg: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
};

/** PDF pages whose only images are the sheets, so a 100% print matches the paper size. */
export function jpegPagesPdf(
  pages: readonly JpegSheet[],
  pageWidthMm: number,
  pageHeightMm: number,
): Uint8Array {
  const sheets = pages.length > 0 ? pages : [{ jpeg: new Uint8Array(), pixelWidth: 1, pixelHeight: 1 }];
  const pageW = trim((pageWidthMm / 25.4) * 72);
  const pageH = trim((pageHeightMm / 25.4) * 72);
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let position = 0;
  const objectCount = 2 + sheets.length * 3;
  const offsets = new Array<number>(objectCount + 1).fill(0);

  function append(data: string | Uint8Array) {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    position += bytes.length;
  }

  function object(id: number, body: string) {
    offsets[id] = position;
    append(`${id} 0 obj\n${body}\nendobj\n`);
  }

  append("%PDF-1.4\n");
  append(Uint8Array.from([0x25, 0xff, 0xff, 0xff, 0xff, 0x0a]));
  const kids = sheets.map((_, index) => `${3 + index * 3} 0 R`).join(" ");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Count ${sheets.length} /Kids [${kids}] >>`);

  sheets.forEach((sheet, index) => {
    const pageId = 3 + index * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ`;
    object(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${contentId} 0 R /Resources << /XObject << /Im0 ${imageId} 0 R >> >> >>`,
    );
    object(contentId, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);
    offsets[imageId] = position;
    append(`${imageId} 0 obj\n`);
    append(
      `<< /Type /XObject /Subtype /Image /Width ${sheet.pixelWidth} /Height ${sheet.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${sheet.jpeg.length} >>\nstream\n`,
    );
    append(sheet.jpeg);
    append("\nendstream\nendobj\n");
  });

  const xrefAt = position;
  let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objectCount; id += 1) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  append(xref);

  const out = new Uint8Array(position);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}

/** One-page PDF whose only image is the sheet, so a 100% print matches the paper size. */
export function jpegPagePdf(
  jpeg: Uint8Array,
  pixelWidth: number,
  pixelHeight: number,
  pageWidthMm: number,
  pageHeightMm: number,
): Uint8Array {
  return jpegPagesPdf([{ jpeg, pixelWidth, pixelHeight }], pageWidthMm, pageHeightMm);
}
