// "" Export Utility Service """"""""""""""""""""""""""""""""""""""""""""
// Generates professional, school-branded, printable documents for all modules.

import { formatCurrency } from '@/lib/designTokens';
import { format } from 'date-fns';

export interface ExportConfig {
  schoolName: string;
  schoolLogo?: string;
  title: string;
  subtitle?: string;
  headers: string[];
  rows: string[][];
  filename: string;
  orientation?: 'portrait' | 'landscape';
  footerNote?: string;
}

// "" CSS for print documents """"""""""""""""""""""""""""""""""""""""""
const PRINT_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  
  * { margin: 0; padding: 0; box-sizing: border-box; }
  
  @page { 
    size: A4; 
    margin: 15mm 12mm; 
  }
  
  body { 
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #1e293b; 
    background: #fff; 
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-size: 11px;
    line-height: 1.5;
  }
  
  .document-container {
    max-width: 100%;
    padding: 0;
  }
  
  /* "" Header "" */
  .doc-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding-bottom: 16px;
    border-bottom: 2px solid #2563eb;
    margin-bottom: 20px;
  }
  .doc-logo {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    object-fit: contain;
    border: 1px solid #e2e8f0;
  }
  .doc-logo-placeholder {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 700;
    font-size: 20px;
  }
  .doc-header-text h1 {
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.3px;
  }
  .doc-header-text p {
    font-size: 11px;
    color: #64748b;
    margin-top: 2px;
  }
  
  /* "" Title Section "" */
  .doc-title-section {
    text-align: center;
    margin-bottom: 20px;
  }
  .doc-title {
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.2px;
  }
  .doc-subtitle {
    font-size: 11px;
    color: #64748b;
    margin-top: 4px;
  }
  
  /* "" Table "" */
  .doc-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
  }
  .doc-table thead tr {
    background: #f1f5f9;
  }
  .doc-table th {
    text-align: left;
    padding: 8px 12px;
    font-size: 10px;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 2px solid #e2e8f0;
    white-space: nowrap;
  }
  .doc-table td {
    padding: 7px 12px;
    font-size: 11px;
    color: #334155;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
  }
  .doc-table tbody tr:nth-child(even) {
    background: #f8fafc;
  }
  .doc-table tbody tr:hover {
    background: #f1f5f9;
  }
  
  /* "" Footer "" */
  .doc-footer {
    margin-top: 24px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .doc-footer p {
    font-size: 9px;
    color: #94a3b8;
  }
  .doc-footer .doc-timestamp {
    text-align: right;
  }
  
  /* "" Summary Stats "" */
  .doc-stats {
    display: flex;
    gap: 16px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .doc-stat {
    flex: 1;
    min-width: 120px;
    padding: 10px 14px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #f8fafc;
  }
  .doc-stat-label {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #94a3b8;
  }
  .doc-stat-value {
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
    margin-top: 2px;
  }
  
  @media print {
    body { background: white; }
    .no-print { display: none !important; }
    .doc-table { page-break-inside: auto; }
    .doc-table tr { page-break-inside: avoid; }
  }
`;

// "" Generate HTML Document """""""""""""""""""""""""""""""""""""""""""
function generateHTMLDocument(config: ExportConfig): string {
  const {
    schoolName,
    schoolLogo,
    title,
    subtitle,
    headers,
    rows,
    footerNote,
  } = config;

  const timestamp = format(new Date(), 'dd MMM yyyy, hh:mm a');
  const schoolInitial = schoolName.charAt(0).toUpperCase();

  const logoHTML = schoolLogo
    ? `<img src="${schoolLogo}" alt="${schoolName}" class="doc-logo" />`
    : `<div class="doc-logo-placeholder">${schoolInitial}</div>`;

  const headerCells = headers.map((h) => `<th>${h}</th>`).join('');
  const bodyRows = rows
    .map(
      (row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${schoolName}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <div class="document-container">
    <!-- Header -->
    <div class="doc-header">
      ${logoHTML}
      <div class="doc-header-text">
        <h1>${schoolName}</h1>
        <p>School Management System</p>
      </div>
    </div>
    
    <!-- Title -->
    <div class="doc-title-section">
      <div class="doc-title">${title}</div>
      ${subtitle ? `<div class="doc-subtitle">${subtitle}</div>` : ''}
    </div>
    
    <!-- Table -->
    <table class="doc-table">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    
    <!-- Footer -->
    <div class="doc-footer">
      <div>
        <p>${footerNote || `Total Records: ${rows.length}`}</p>
        <p>Generated by SuffaCampus Admin Panel</p>
      </div>
      <div class="doc-timestamp">
        <p>Generated on: ${timestamp}</p>
        <p>${schoolName}</p>
      </div>
    </div>
  </div>
  
  <script>
    // Auto-print on load
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`;
}

// "" Export to Print (HTML) """""""""""""""""""""""""""""""""""""""""""
export function exportToPrint(config: ExportConfig): void {
  const html = generateHTMLDocument(config);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

// "" Export to CSV """"""""""""""""""""""""""""""""""""""""""""""""""""
export function exportToCSV(config: ExportConfig): void {
  const { headers, rows, filename } = config;
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row
        .map((cell) => {
          const escaped = cell.replace(/"/g, '""');
          return /[,"\n]/.test(cell) ? `"${escaped}"` : escaped;
        })
        .join(',')
    ),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// "" Generate Report with Stats """""""""""""""""""""""""""""""""""""""
export function exportReportWithStats(
  config: ExportConfig & {
    stats?: { label: string; value: string }[];
  }
): void {
  const { stats, ...restConfig } = config;
  const html = generateHTMLDocument(restConfig);

  // Insert stats section before the table
  if (stats && stats.length > 0) {
    const statsHTML = `
    <div class="doc-stats">
      ${stats
        .map(
          (s) => `
        <div class="doc-stat">
          <div class="doc-stat-label">${s.label}</div>
          <div class="doc-stat-value">${s.value}</div>
        </div>
      `
        )
        .join('')}
    </div>`;

    const modifiedHTML = html.replace(
      '<!-- Table -->',
      `${statsHTML}\n    <!-- Table -->`
    );

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(modifiedHTML);
      printWindow.document.close();
    }
    return;
  }

  exportToPrint(config);
}

// "" Helper: Format date for export """""""""""""""""""""""""""""""""""
export function formatDateForExport(date: Date | string): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return format(d, 'dd MMM yyyy');
  } catch {
    return '-';
  }
}

// "" Helper: Format currency for export """""""""""""""""""""""""""""""
export function formatCurrencyForExport(amount: number): string {
  return formatCurrency(amount);
}

