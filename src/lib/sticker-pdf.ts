function trim(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

/** One-page PDF whose only image is the sheet, so a 100% print matches the paper size. */
export function jpegPagePdf(
  jpeg: Uint8Array,
  pixelWidth: number,
  pixelHeight: number,
  pageWidthMm: number,
  pageHeightMm: number,
): Uint8Array {
  const pageW = trim((pageWidthMm / 25.4) * 72);
  const pageH = trim((pageHeightMm / 25.4) * 72);
  const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ`;
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let position = 0;
  const offsets = [0, 0, 0, 0, 0, 0];

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
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Count 1 /Kids [3 0 R] >>");
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>`,
  );
  object(4, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);
  offsets[5] = position;
  append("5 0 obj\n");
  append(
    `<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  append(jpeg);
  append("\nendstream\nendobj\n");

  const xrefAt = position;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let id = 1; id <= 5; id += 1) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  append(xref);

  const out = new Uint8Array(position);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}
