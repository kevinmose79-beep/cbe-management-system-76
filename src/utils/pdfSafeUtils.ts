import type { jsPDF } from 'jspdf';

/**
 * Universal safety enhancer for jsPDF instances.
 * Prevents "Invalid arguments passed to jsPDF.text" runtime crashes caused by:
 * - text being undefined, null, or a number
 * - x or y coordinates being NaN or non-numeric
 * - line or circle coordinate arguments being NaN
 */
export function ensureSafeJsPdf<T extends jsPDF>(doc: T): T {
  if (!doc) return doc;
  const anyDoc = doc as any;
  if (anyDoc.__safeTextWrapped) return doc;
  anyDoc.__safeTextWrapped = true;

  const origText = doc.text.bind(doc);
  doc.text = function (text: any, x: any, y: any, options?: any, ...rest: any[]) {
    let safeText: any = text;
    if (safeText === undefined || safeText === null) {
      safeText = '';
    } else if (typeof safeText !== 'string' && !Array.isArray(safeText)) {
      safeText = String(safeText);
    }
    const safeX = typeof x === 'number' && !isNaN(x) ? x : (options?.align === 'center' ? 105 : (options?.align === 'right' ? 190 : 8));
    const safeY = typeof y === 'number' && !isNaN(y) ? y : 10;
    return origText(safeText, safeX, safeY, options, ...rest);
  };

  const origLine = doc.line.bind(doc);
  doc.line = function (x1: number, y1: number, x2: number, y2: number, ...rest: any[]) {
    const sX1 = typeof x1 === 'number' && !isNaN(x1) ? x1 : 0;
    const sY1 = typeof y1 === 'number' && !isNaN(y1) ? y1 : 0;
    const sX2 = typeof x2 === 'number' && !isNaN(x2) ? x2 : 0;
    const sY2 = typeof y2 === 'number' && !isNaN(y2) ? y2 : 0;
    return origLine(sX1, sY1, sX2, sY2, ...rest);
  };

  const origCircle = doc.circle.bind(doc);
  doc.circle = function (x: number, y: number, r: number, style?: string) {
    const sX = typeof x === 'number' && !isNaN(x) ? x : 0;
    const sY = typeof y === 'number' && !isNaN(y) ? y : 0;
    const sR = typeof r === 'number' && !isNaN(r) ? r : 1;
    return origCircle(sX, sY, sR, style);
  };

  return doc;
}
