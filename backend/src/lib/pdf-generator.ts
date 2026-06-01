import PDFDocument from 'pdfkit'

export interface PdfRegel {
  kolom1: string
  kolom2?: string
  kolom3?: string
}

export interface PdfSectie {
  titel: string
  regels: PdfRegel[]
}

/** Genereert een eenvoudig tabel-rapport als Buffer. */
export function genereerRapportPdf(
  titel: string,
  datum: string,
  secties: PdfSectie[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const TEAL   = '#0d9488'
    const GRIJS  = '#6b7280'
    const ZWART  = '#111827'
    const LICHT  = '#f3f4f6'

    // Header
    doc.rect(0, 0, doc.page.width, 60).fill(TEAL)
    doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold')
      .text('Dutch Shape MES', 50, 18)
    doc.fontSize(10).font('Helvetica')
      .text(titel, 50, 40)
    doc.fillColor(ZWART)

    // Datum
    doc.fontSize(9).fillColor(GRIJS)
      .text(`Gegenereerd op ${datum}`, 50, 75, { align: 'right' })
    doc.fillColor(ZWART)

    let y = 95

    for (const sectie of secties) {
      if (y > doc.page.height - 100) { doc.addPage(); y = 50 }

      // Sectie header
      doc.rect(50, y, doc.page.width - 100, 20).fill(TEAL)
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
        .text(sectie.titel, 56, y + 5)
      doc.fillColor(ZWART)
      y += 26

      // Regels
      for (let i = 0; i < sectie.regels.length; i++) {
        if (y > doc.page.height - 60) { doc.addPage(); y = 50 }
        const r = sectie.regels[i]
        if (i % 2 === 0) {
          doc.rect(50, y - 2, doc.page.width - 100, 18).fill(LICHT)
        }
        doc.fillColor(ZWART).fontSize(9).font('Helvetica')
          .text(r.kolom1, 56, y, { width: 220 })
        if (r.kolom2) doc.text(r.kolom2, 280, y, { width: 160 })
        if (r.kolom3) doc.text(r.kolom3, 445, y, { width: 100 })
        y += 18
      }

      if (sectie.regels.length === 0) {
        doc.fillColor(GRIJS).fontSize(9).text('Geen items', 56, y)
        y += 18
      }

      y += 12
    }

    // Footer
    doc.rect(0, doc.page.height - 30, doc.page.width, 30).fill('#f9fafb')
    doc.fillColor(GRIJS).fontSize(8).font('Helvetica')
      .text('Dutch Shape MES — Automatisch gegenereerd rapport', 50, doc.page.height - 18, { align: 'center' })

    doc.end()
  })
}
