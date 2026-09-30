import { describe, it, expect } from 'vitest';
import jsPDF from 'jspdf';
import { ensureSafeJsPdf } from './pdfSafeUtils';

describe('ensureSafeJsPdf', () => {
  it('prevents crashes when text is undefined or null', () => {
    const rawDoc = new jsPDF();
    const doc = ensureSafeJsPdf(rawDoc);

    // Normally in jsPDF, passing undefined or null to text causes:
    // "Invalid arguments passed to jsPDF.text"
    expect(() => {
      doc.text(undefined as any, 10, 20);
    }).not.toThrow();

    expect(() => {
      doc.text(null as any, 10, 20);
    }).not.toThrow();
  });

  it('handles non-string primitives cleanly', () => {
    const rawDoc = new jsPDF();
    const doc = ensureSafeJsPdf(rawDoc);

    expect(() => {
      doc.text(12345 as any, 10, 20);
    }).not.toThrow();

    expect(() => {
      doc.text(true as any, 10, 20);
    }).not.toThrow();
  });

  it('prevents crashes when coordinates are NaN or undefined', () => {
    const rawDoc = new jsPDF();
    const doc = ensureSafeJsPdf(rawDoc);

    expect(() => {
      doc.text('Hello', NaN as any, 20);
    }).not.toThrow();

    expect(() => {
      doc.text('Hello', 10, NaN as any);
    }).not.toThrow();

    expect(() => {
      doc.text('Hello', undefined as any, undefined as any);
    }).not.toThrow();
  });

  it('safely handles line and circle with NaN coordinates', () => {
    const rawDoc = new jsPDF();
    const doc = ensureSafeJsPdf(rawDoc);

    expect(() => {
      doc.line(NaN, NaN, 50, 50);
    }).not.toThrow();

    expect(() => {
      doc.circle(NaN, NaN, NaN);
    }).not.toThrow();
  });

  it('is idempotent and does not multiply wrap the doc', () => {
    const rawDoc = new jsPDF();
    const wrapped1 = ensureSafeJsPdf(rawDoc);
    const wrapped2 = ensureSafeJsPdf(wrapped1);

    expect(wrapped1).toBe(wrapped2);
    expect(() => {
      wrapped2.text(undefined as any, 10, 20);
    }).not.toThrow();
  });
});
