import Papa from 'papaparse';

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(content: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header, index) => {
      // Strip BOM from first header
      const cleaned = header.replace(/^\uFEFF/, '').trim();
      return cleaned || `column_${index}`;
    },
  });

  if (result.errors.length > 0) {
    const fatal = result.errors.find((e) => e.type === 'Delimiter' || e.type === 'Quotes');
    if (fatal) throw new Error(`CSV parse error: ${fatal.message}`);
  }

  if (!result.meta.fields || result.meta.fields.length === 0) {
    throw new Error('CSV has no headers');
  }

  if (result.data.length === 0) {
    throw new Error('CSV has no data rows');
  }

  // Deduplicate header names
  const seen: Record<string, number> = {};
  const headers = result.meta.fields.map((h) => {
    if (seen[h] !== undefined) {
      seen[h]++;
      return `${h}_${seen[h]}`;
    }
    seen[h] = 0;
    return h;
  });

  return { headers, rows: result.data };
}
