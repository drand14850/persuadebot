type Cell = string | number | null | undefined;

// Visitor text ends up in these files, and spreadsheet apps run cells starting with these
// characters as formulas. A leading apostrophe makes them plain text.
const FORMULA_START = /^[=+\-@\t\r]/;

function formatCell(value: Cell): string {
	if (value === null || value === undefined) return '';
	let text = String(value);
	if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
	if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
	return text;
}

// The byte-order mark makes Excel read the file as UTF-8 instead of mangling non-ASCII text.
export function toCsv(header: string[], rows: Cell[][]): string {
	const lines = [header, ...rows].map((row) => row.map(formatCell).join(','));
	return '﻿' + lines.join('\r\n') + '\r\n';
}

export function csvResponse(filename: string, csv: string): Response {
	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
}
