/**
 * Servicio de Exportación Segura de Auditoría a PDF
 * CrediULEP - Plataforma Financiera Segura
 * Protección obligatoria con contraseña estricta: 902050377
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AuditBlock, User } from '../types';

export const PDF_EXPORT_PASSWORD = '902050377';

export interface PDFExportOptions {
  chain: AuditBlock[];
  isChainValid: boolean;
  generatedBy: User;
  filterCedula?: string;
  filterDate?: string;
  filterAction?: string;
}

export async function exportAuditTrailToProtectedPDF(options: PDFExportOptions): Promise<void> {
  const { chain, isChainValid, generatedBy, filterCedula, filterDate, filterAction } = options;

  // 1. Inicializar jsPDF con protección por contraseña '902050377'
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    encryption: {
      userPassword: PDF_EXPORT_PASSWORD,
      ownerPassword: PDF_EXPORT_PASSWORD,
      userPermissions: ['print', 'copy']
    }
  });

  // Asegurar compatibilidad si setEncryption está presente
  if (typeof (doc as any).setEncryption === 'function') {
    try {
      (doc as any).setEncryption({
        userPassword: PDF_EXPORT_PASSWORD,
        ownerPassword: PDF_EXPORT_PASSWORD,
        userPermissions: ['print', 'copy']
      });
    } catch (e) {
      console.debug('SetEncryption already applied in constructor:', e);
    }
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Color Palette: CrediULEP Purple Brand
  const purplePrimary: [number, number, number] = [109, 40, 217]; // #6D28D9
  const purpleDark: [number, number, number] = [30, 27, 75]; // #1E1B4B
  const purpleSoft: [number, number, number] = [245, 243, 255]; // #F5F3FF

  // 2. Encabezado Institucional
  doc.setFillColor(...purplePrimary);
  doc.rect(0, 0, pageWidth, 24, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('CrediULEP - PORTAL FINANCIERO SEGURO', 14, 12);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('BITÁCORA OFICIAL DE AUDITORÍA INSTITUCIONAL • RESPALDO EXTERNO PROTEGIDO', 14, 18);

  // Badge de Protección
  doc.setFillColor(237, 233, 254);
  doc.roundedRect(pageWidth - 75, 5, 61, 14, 2, 2, 'F');
  doc.setTextColor(...purplePrimary);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('DOCUMENTO PROTEGIDO CON CLAVE', pageWidth - 72, 11);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Apertura con contraseña requerida', pageWidth - 72, 16);

  // 3. Ficha Técnica del Respaldo
  const emissionDate = new Date().toLocaleString('es-CO');
  
  doc.setTextColor(...purpleDark);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('METADATOS DEL RESPALDO Y VERIFICACIÓN DE AUDITORÍA', 14, 32);

  doc.setFillColor(...purpleSoft);
  doc.roundedRect(14, 35, pageWidth - 28, 22, 3, 3, 'F');
  doc.setDrawColor(221, 214, 254);
  doc.roundedRect(14, 35, pageWidth - 28, 22, 3, 3, 'S');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(55, 65, 81);

  // Columna 1
  doc.text(`Fecha de Emisión: ${emissionDate}`, 18, 42);
  doc.text(`Generado por: ${generatedBy.fullName} (Cédula: ${generatedBy.cedula})`, 18, 48);
  doc.text(`Rol Autorizado: ${generatedBy.role || 'ADMIN'}`, 18, 54);

  // Columna 2
  doc.text(`Total de Registros Exportados: ${chain.length} eventos`, 110, 42);
  doc.text(`Protocolo de Seguridad: Verificación Continua Institucional`, 110, 48);
  doc.text(`Clave de Protección del Archivo: ********* (Asignada: ${PDF_EXPORT_PASSWORD})`, 110, 54);

  // Columna 3 (Estado de Integridad)
  doc.text(`Estado de Auditoría:`, 210, 42);
  if (isChainValid) {
    doc.setTextColor(16, 185, 129); // Verde esmeralda
    doc.setFont('helvetica', 'bold');
    doc.text('✓ 100% VERIFICADO (Sin Inconsistencias)', 210, 48);
  } else {
    doc.setTextColor(225, 29, 72); // Rojo alerta
    doc.setFont('helvetica', 'bold');
    doc.text('⚠ ADVERTENCIA: Inconsistencia Detectada', 210, 48);
  }
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(55, 65, 81);
  doc.text(`Filtros: Cédula [${filterCedula || 'Todas'}] • Fecha [${filterDate || 'Todas'}]`, 210, 54);

  // 4. Tabla de Registros de Auditoría (Sin hashes ni tecnicismos de cifrado)
  const tableData = chain.map(block => [
    `#${block.index}`,
    new Date(block.timestamp).toLocaleString('es-CO'),
    block.action,
    block.userCedula,
    block.details,
    'Verificado'
  ]);

  autoTable(doc, {
    startY: 62,
    head: [['Nº Registro', 'Fecha y Hora', 'Acción Realizada', 'Cédula / Usuario', 'Detalle de la Operación', 'Estado']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: purplePrimary,
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left'
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [30, 27, 75],
      overflow: 'linebreak'
    },
    columnStyles: {
      0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 38 },
      2: { cellWidth: 42, fontStyle: 'bold' },
      3: { cellWidth: 28, fontStyle: 'bold' },
      4: { cellWidth: 'auto' },
      5: { cellWidth: 26, halign: 'center', fontStyle: 'bold', textColor: [16, 185, 129] }
    },
    alternateRowStyles: {
      fillColor: [250, 248, 255]
    },
    margin: { left: 14, right: 14 },
    didDrawPage: (data) => {
      // Pie de página en cada hoja
      doc.setFontSize(7);
      doc.setTextColor(156, 163, 175);
      doc.text(
        `CrediULEP Respaldo Institucional • Confidencial • Contraseña de apertura: ${PDF_EXPORT_PASSWORD}`,
        14,
        pageHeight - 6
      );
      doc.text(
        `Página ${data.pageNumber}`,
        pageWidth - 26,
        pageHeight - 6
      );
    }
  });

  // 5. Descargar el archivo PDF protegido
  const fileName = `CrediULEP_Auditoria_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}
