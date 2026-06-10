import PDFDocument from 'pdfkit'

export interface KalibratieRegel {
  displayId: string
  artikelnaam: string
  merk: string
  afmeting: string
  serienummer: string
  vervaldatum: string
}

/** Genereert een kalibratie-exportlijst als PDF in landscape-formaat met 6 kolommen. */
export function genereerKalibratieExportPdf(
  titel: string,
  datum: string,
  regels: KalibratieRegel[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const TEAL  = '#0d9488'
    const GRIJS = '#6b7280'
    const ZWART = '#111827'
    const LICHT = '#f3f4f6'

    const W = doc.page.width   // 841.89 pt
    const L = 40               // left margin
    const R = W - 40           // right margin
    const USE = R - L          // usable width ≈ 762

    // Kolombreedtes (totaal = USE)
    const COL = [90, 200, 110, 110, 80, 90]  // ID, Artikelnaam, Merk, Afmeting, Serienr., Vervaldatum
    const HDR = ['Meetmiddel ID', 'Artikelnaam', 'Merk', 'Afmeting', 'Serienr.', 'Vervaldatum']

    // Header balk
    doc.rect(0, 0, W, 55).fill(TEAL)
    doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text('Dutch Shape MES', L, 14)
    doc.fontSize(9).font('Helvetica').text(titel, L, 34)
    doc.fontSize(9).fillColor('#ffffff').text(`Gegenereerd op ${datum}`, L, 34, { align: 'right', width: USE })
    doc.fillColor(ZWART)

    let y = 68

    // Kolomheader
    doc.rect(L, y, USE, 18).fill(TEAL)
    let x = L
    for (let i = 0; i < HDR.length; i++) {
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
        .text(HDR[i], x + 3, y + 4, { width: COL[i] - 4, ellipsis: true })
      x += COL[i]
    }
    doc.fillColor(ZWART)
    y += 22

    for (let idx = 0; idx < regels.length; idx++) {
      if (y > doc.page.height - 50) {
        doc.addPage({ layout: 'landscape' })
        y = 40
        // herhaal kolomheader op nieuwe pagina
        doc.rect(L, y, USE, 18).fill(TEAL)
        x = L
        for (let i = 0; i < HDR.length; i++) {
          doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
            .text(HDR[i], x + 3, y + 4, { width: COL[i] - 4, ellipsis: true })
          x += COL[i]
        }
        doc.fillColor(ZWART)
        y += 22
      }

      const r = regels[idx]
      if (idx % 2 === 0) doc.rect(L, y - 1, USE, 16).fill(LICHT)

      const vals = [r.displayId, r.artikelnaam, r.merk, r.afmeting, r.serienummer, r.vervaldatum]
      x = L
      for (let i = 0; i < vals.length; i++) {
        doc.fillColor(ZWART).fontSize(8).font('Helvetica')
          .text(vals[i], x + 3, y + 2, { width: COL[i] - 6, ellipsis: true })
        x += COL[i]
      }
      y += 16
    }

    // Footer
    doc.rect(0, doc.page.height - 25, W, 25).fill('#f9fafb')
    doc.fillColor(GRIJS).fontSize(7).font('Helvetica')
      .text('Dutch Shape MES — Kalibratie-exportlijst', L, doc.page.height - 14, { align: 'center', width: USE })

    doc.end()
  })
}

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
