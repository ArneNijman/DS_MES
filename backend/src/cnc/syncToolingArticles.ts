import { inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../db/schema.js'
import { toolLibraryItems, toolingArticles } from '../db/schema.js'

type DB = ReturnType<typeof drizzle<typeof schema>>

// WinTool GeometryClass → Nederlandse article_type
const TOOL_TYPE_MAP: Record<string, string> = {
  Endmill:           'frees',
  Ballmill:          'frees',
  Radiusmill:        'frees',
  TSlotCutter:       'frees',
  ChamferedCutter:   'frees',
  Woodruff:          'frees',
  TangentBarrelTool: 'frees',
  Drilltool:         'boor',
  Tap:               'tap',
  ThreadMill:        'tap',
  BoringBar:         'uitboorder',
  Reamer:            'ruimer',
}

// Alle types die worden afgeleid uit tool_library_items (kunnen veranderen bij sync).
// 'body' is de oude catch-all; wordt meegecleaned zodat geen stale records achterblijven.
const TOOL_DERIVED_TYPES = ['body', 'frees', 'boor', 'tap', 'uitboorder', 'ruimer', 'overig']

function toolType(category: string | null): string {
  if (!category) return 'overig'
  return TOOL_TYPE_MAP[category] ?? 'overig'
}

function parseWisselplaat(comment: string | null): { body: string; wisselplaat: string } | null {
  if (!comment) return null
  const idx = comment.indexOf('WP:')
  if (idx === -1) return null
  const body = comment.slice(0, idx).trim()
  const wisselplaat = comment.slice(idx + 3).trim()
  if (!body || !wisselplaat) return null
  return { body, wisselplaat }
}

async function upsertArticle(
  db: DB,
  values: {
    articleType: string
    name: string
    photoUrl?: string | null
    orderingCode?: string | null
    manufacturer?: string | null
    sourceItemId?: string | null
  },
) {
  if (!values.name) return

  await db
    .insert(toolingArticles)
    .values({
      articleType:  values.articleType,
      name:         values.name,
      photoUrl:     values.photoUrl ?? null,
      orderingCode: values.orderingCode ?? null,
      manufacturer: values.manufacturer ?? null,
      sourceItemId: values.sourceItemId ?? null,
    })
    .onConflictDoUpdate({
      target: [toolingArticles.articleType, toolingArticles.name],
      set: {
        photoUrl:     values.photoUrl ?? null,
        orderingCode: values.orderingCode ?? null,
        manufacturer: values.manufacturer ?? null,
        sourceItemId: values.sourceItemId ?? null,
      },
    })
}

export async function syncToolingArticles(db: DB) {
  // Verwijder alle tool-afgeleide artikelen zodat type-wijzigingen correct worden overgenomen.
  // Wisselplaten, schroeven, holders en adapters worden via upsert bijgewerkt (geen delete nodig).
  await db
    .delete(toolingArticles)
    .where(inArray(toolingArticles.articleType, TOOL_DERIVED_TYPES))

  const items = await db.select().from(toolLibraryItems)

  for (const item of items) {
    const wp = parseWisselplaat(item.comment)
    const type = toolType(item.itemCategory)

    if (item.itemType === 'holder' || item.itemType === 'extension') {
      await upsertArticle(db, {
        articleType:  item.itemType,
        name:         item.name,
        photoUrl:     item.photoUrl,
        orderingCode: item.orderingCode,
        manufacturer: item.manufacturer,
        sourceItemId: item.id,
      })
    } else if (wp) {
      // Tool-body (type op basis van WinTool categorie)
      if (wp.body) {
        await upsertArticle(db, {
          articleType:  type,
          name:         wp.body,
          photoUrl:     item.photoUrl,
          orderingCode: item.orderingCode,
          manufacturer: item.manufacturer,
          sourceItemId: item.id,
        })
      }
      // Wisselplaat
      if (wp.wisselplaat) {
        await upsertArticle(db, {
          articleType:  'wisselplaat',
          name:         wp.wisselplaat,
          photoUrl:     item.wisselplaatPhotoUrl,
          sourceItemId: item.id,
        })
      }
      // Schroef
      if (item.schroefOrderingCode) {
        await upsertArticle(db, {
          articleType:  'schroef',
          name:         item.schroefOrderingCode,
          photoUrl:     item.schroefPhotoUrl,
          sourceItemId: item.id,
        })
      }
    } else {
      // Gewone tool zonder WP
      await upsertArticle(db, {
        articleType:  type,
        name:         item.name,
        photoUrl:     item.photoUrl,
        orderingCode: item.orderingCode,
        manufacturer: item.manufacturer,
        sourceItemId: item.id,
      })
    }
  }
}
