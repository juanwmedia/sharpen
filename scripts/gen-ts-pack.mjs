#!/usr/bin/env node
/**
 * Source of truth for the kind=ts pack folders under scenarios/ts/.
 * Regenerates scenario.md / scenario.yaml / walkthrough.md / index.ts per
 * folder. Does NOT touch scenarios/index.ts (hand-wired: git + ts registry;
 * picker may filter by kind).
 *
 * Run from repo root: node scripts/gen-ts-pack.mjs
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const TS = join(ROOT, 'scenarios/ts')

function b64(src) {
  return Buffer.from(src, 'utf8').toString('base64')
}

function yamlWrite(path, content) {
  const indented = content.replace(/\n$/, '').split('\n').map((l) => `        ${l}`).join('\n')
  return `      path: ${path}\n      content: |\n${indented}\n`
}

function pack(s) {
  const dir = join(TS, s.folder)
  mkdirSync(dir, { recursive: true })
  const starterYaml = yamlWrite(s.entry, s.starter)
  const themes = s.themes.map((t) => t).join(', ')
  const tree = s.tree
    .split('\n')
    .map((l) => `    ${l}`)
    .join('\n')

  const checksYaml = s.checks
    .map((c) => {
      const expectKey = Object.keys(c.expect)[0]
      const body = c.expect[expectKey]
      const bodyLines = Object.entries(body)
        .map(([k, v]) => `        ${k}: ${JSON.stringify(v)}`)
        .join('\n')
      return `  - name:
      en: ${JSON.stringify(c.name.en)}
      es: ${JSON.stringify(c.name.es)}
    expect:
      ${expectKey}:
${bodyLines}`
    })
    .join('\n\n')

  writeFileSync(
    join(dir, 'scenario.md'),
    `---
schema: 2
version: 1
id: ts/${s.folder}
kind: ts
pack: ts
title: { en: ${JSON.stringify(s.title.en)}, es: ${JSON.stringify(s.title.es)} }
difficulty: ${s.difficulty}
timeLimitMs: ${s.timeLimitMs}
themes: [${themes}]
spec:
  entry: ${s.entry}
  tree: |
${tree}
---

## Briefing (en)

${s.briefing.en}

## Briefing (es)

${s.briefing.es}

## Objective (en)

${s.objective.en}

## Objective (es)

${s.objective.es}
`
  )

  writeFileSync(
    join(dir, 'scenario.yaml'),
    `# Mechanics document (schema 2): setup as steps, checks as predicates.
setup:
  - write:
${starterYaml}
checks:
${checksYaml}

# Machine proof of solvability: the dry-run validator replays these commands
# and every check must go green. Never shown to the player.
solution:
  commands:
    - writefile ${s.entry} b64:${b64(s.solution)}
`
  )

  writeFileSync(join(dir, 'walkthrough.md'), s.walkthrough.trim() + '\n')
  writeFileSync(
    join(dir, 'index.ts'),
    `import { assembleScenario } from '../../package/assemble.ts'
import scenarioSrc from './scenario.md'
import mechanicsSrc from './scenario.yaml'
import walkthroughSrc from './walkthrough.md'

export default assembleScenario({
  scenarioSrc,
  walkthroughSrc,
  mechanicsSrc,
})
`
  )
}

/** @type {Array<any>} */
const scenarios = [
  // ---------------------------------------------------------------------------
  // Easy band
  // ---------------------------------------------------------------------------
  {
    folder: 'tip-jar-lies',
    title: { en: 'Tip jar lies', es: 'El bote miente' },
    difficulty: 'easy',
    timeLimitMs: 60000,
    themes: ['functions', 'numbers', 'strings'],
    entry: 'src/tip.ts',
    tree: `workspace/
└── src/
    └── tip.ts   (formatTip is cooking the books)`,
    briefing: {
      en: `Friday tip-out. The jar UI shows **"\$100.00"** for a hundred cents. Finance will not find that cute. \`formatTip\` forgot that money has a denominator. Fix the math before someone screenshots the dashboard for Slack.`,
      es: `Reparto de propinas del viernes. La UI del bote enseña **"\$100.00"** por cien céntimos. Finanzas no lo va a encontrar gracioso. \`formatTip\` se olvidó de que el dinero tiene denominador. Arregla la cuenta antes de que alguien lo suba a Slack.`,
    },
    objective: {
      en: `Show tip amounts in dollars, not raw cents. \`formatTip(100)\` must return \`"\$1.00"\`; \`formatTip(0)\` must return \`"\$0.00"\`.`,
      es: `Muestra las propinas en dólares, no en céntimos crudos. \`formatTip(100)\` debe devolver \`"\$1.00"\`; \`formatTip(0)\` debe devolver \`"\$0.00"\`.`,
    },
    starter: `export function formatTip(cents: number): string {
  // Someone shipped cents as dollars. Payroll is already angry.
  return \`$\${cents.toFixed(2)}\`
}
`,
    solution: `export function formatTip(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}
`,
    walkthrough: `Divide cents by 100 before formatting. \`formatTip(100)\` must be \`"\$1.00"\`, not \`"\$100.00"\`. Any equivalent arithmetic passes.`,
    checks: [
      {
        name: { en: 'exports formatTip', es: 'exporta formatTip' },
        expect: { exports: { entry: 'src/tip.ts', export: 'formatTip' } },
      },
      {
        name: { en: 'formatTip(100) returns $1.00', es: 'formatTip(100) devuelve $1.00' },
        expect: {
          returns: { entry: 'src/tip.ts', export: 'formatTip', args: [100], equals: '$1.00' },
        },
      },
      {
        name: { en: 'formatTip(0) returns $0.00', es: 'formatTip(0) devuelve $0.00' },
        expect: {
          returns: { entry: 'src/tip.ts', export: 'formatTip', args: [0], equals: '$0.00' },
        },
      },
    ],
  },

  {
    folder: 'free-shipping-gate',
    title: { en: 'Free shipping gate', es: 'Envío gratis... o no' },
    difficulty: 'easy',
    timeLimitMs: 60000,
    themes: ['control-flow', 'booleans'],
    entry: 'src/shipping.ts',
    tree: `workspace/
└── src/
    └── shipping.ts   (threshold is upside down)`,
    briefing: {
      en: `Growth wanted **"free shipping over \$50"**. What shipped is free shipping *under* \$50. Carts at \$12 sail free; carts at \$80 get charged. Support is already writing the apology email. Flip the gate.`,
      es: `Growth quería **"envío gratis a partir de \$50"**. Lo que salió es envío gratis *por debajo* de \$50. Los carritos de \$12 van gratis; los de \$80 pagan. Soporte ya está redactando la disculpa. Dale la vuelta a la condición.`,
    },
    objective: {
      en: `Free shipping starts at \$50 inclusive (amounts are cents). Just under the threshold must pay shipping; the threshold and above must qualify. \`qualifiesForFreeShipping(4999)\` → \`false\`; \`qualifiesForFreeShipping(5000)\` → \`true\`.`,
      es: `Envío gratis a partir de \$50 inclusive (importes en céntimos). Por debajo se paga; en el umbral o más, califica. \`qualifiesForFreeShipping(4999)\` → \`false\`; \`qualifiesForFreeShipping(5000)\` → \`true\`.`,
    },
    starter: `const FREE_SHIPPING_MIN_CENTS = 5000

export function qualifiesForFreeShipping(subtotalCents: number): boolean {
  // Threshold is inverted. \$49.99 currently "wins".
  return subtotalCents < FREE_SHIPPING_MIN_CENTS
}
`,
    solution: `const FREE_SHIPPING_MIN_CENTS = 5000

export function qualifiesForFreeShipping(subtotalCents: number): boolean {
  return subtotalCents >= FREE_SHIPPING_MIN_CENTS
}
`,
    walkthrough: `Free shipping starts at 5000 cents inclusive. Use \`>=\`, not \`<\`.`,
    checks: [
      {
        name: { en: 'exports qualifiesForFreeShipping', es: 'exporta qualifiesForFreeShipping' },
        expect: { exports: { entry: 'src/shipping.ts', export: 'qualifiesForFreeShipping' } },
      },
      {
        name: { en: '$49.99 does not qualify', es: '$49.99 no califica' },
        expect: {
          returns: {
            entry: 'src/shipping.ts',
            export: 'qualifiesForFreeShipping',
            args: [4999],
            equals: false,
          },
        },
      },
      {
        name: { en: '$50.00 qualifies', es: '$50.00 califica' },
        expect: {
          returns: {
            entry: 'src/shipping.ts',
            export: 'qualifiesForFreeShipping',
            args: [5000],
            equals: true,
          },
        },
      },
    ],
  },

  {
    folder: 'cart-that-lies',
    title: { en: 'Cart that lies', es: 'El carrito miente' },
    difficulty: 'easy',
    timeLimitMs: 60000,
    themes: ['arrays', 'reduce'],
    entry: 'src/cart.ts',
    tree: `workspace/
└── src/
    └── cart.ts   (qty is decorative)`,
    briefing: {
      en: `Checkout totals **one unit per line**, every time. Someone ordered 6 licenses; the invoice billed 1. The customer is not wrong. \`cartTotal\` never met \`qty\`.`,
      es: `El checkout suma **una unidad por línea**, siempre. Alguien pidió 6 licencias; la factura cobró 1. El cliente no está loco. \`cartTotal\` nunca conoció a \`qty\`.`,
    },
    objective: {
      en: `Cart total must multiply price by quantity per line, then sum. For two lines (100¢×2 and 50¢×3) the total is \`350\`. An empty cart is \`0\`.`,
      es: `El total del carrito debe multiplicar precio por cantidad en cada línea y sumar. Con dos líneas (100¢×2 y 50¢×3) el total es \`350\`. Un carrito vacío es \`0\`.`,
    },
    starter: `export type Line = { priceCents: number; qty: number }

export function cartTotal(lines: Line[]): number {
  // qty is ignored. That is the bug, not a feature.
  return lines.reduce((sum, line) => sum + line.priceCents, 0)
}
`,
    solution: `export type Line = { priceCents: number; qty: number }

export function cartTotal(lines: Line[]): number {
  return lines.reduce((sum, line) => sum + line.priceCents * line.qty, 0)
}
`,
    walkthrough: `Multiply \`priceCents * qty\` per line, then sum.`,
    checks: [
      {
        name: { en: 'exports cartTotal', es: 'exporta cartTotal' },
        expect: { exports: { entry: 'src/cart.ts', export: 'cartTotal' } },
      },
      {
        name: { en: 'two lines with qty total 350', es: 'dos líneas con qty suman 350' },
        expect: {
          returns: {
            entry: 'src/cart.ts',
            export: 'cartTotal',
            args: [
              [
                { priceCents: 100, qty: 2 },
                { priceCents: 50, qty: 3 },
              ],
            ],
            equals: 350,
          },
        },
      },
      {
        name: { en: 'empty cart is 0', es: 'carrito vacío es 0' },
        expect: {
          returns: { entry: 'src/cart.ts', export: 'cartTotal', args: [[]], equals: 0 },
        },
      },
    ],
  },

  {
    folder: 'stringly-id',
    title: { en: 'Stringly id', es: 'Id con comillas' },
    difficulty: 'easy',
    timeLimitMs: 60000,
    themes: ['typescript', 'coercion'],
    entry: 'src/ledger.ts',
    tree: `workspace/
└── src/
    └── ledger.ts   (adds strings like a drunk Excel)`,
    briefing: {
      en: `The ledger **"adds"** invoice ids to amounts. \`"1042" + 10\` becomes \`"104210"\` and someone almost paid invoice ten-thousand-something. Treat the id as a number before you do money math, or refuse the garbage.`,
      es: `El ledger **"suma"** ids de factura a importes. \`"1042" + 10\` vira a \`"104210"\` y casi pagan la factura diez-mil-y-pico. Convierte el id a número antes de hacer cuentas, o rechaza la basura.`,
    },
    objective: {
      en: `Add a delta to a numeric invoice id without string concat. A clean id like \`"1042"\` plus \`10\` becomes the number \`1052\`; garbage like \`"nope"\` returns \`null\`.`,
      es: `Suma un delta a un id de factura numérico sin concatenar strings. Un id limpio como \`"1042"\` más \`10\` da el número \`1052\`; basura como \`"nope"\` devuelve \`null\`.`,
    },
    starter: `export function bumpAmount(id: string, delta: number): number | null {
  // String concat in a money path. Classic.
  return (id as unknown as number) + delta
}
`,
    solution: `export function bumpAmount(id: string, delta: number): number | null {
  const n = Number(id)
  if (!Number.isFinite(n)) return null
  return n + delta
}
`,
    walkthrough: `Parse with \`Number\` / \`parseInt\`, reject non-finite values with \`null\`, then add.`,
    checks: [
      {
        name: { en: 'exports bumpAmount', es: 'exporta bumpAmount' },
        expect: { exports: { entry: 'src/ledger.ts', export: 'bumpAmount' } },
      },
      {
        name: { en: 'numeric id bumps by delta', es: 'id numérico suma el delta' },
        expect: {
          returns: { entry: 'src/ledger.ts', export: 'bumpAmount', args: ['1042', 10], equals: 1052 },
        },
      },
      {
        name: { en: 'garbage id returns null', es: 'id basura devuelve null' },
        expect: {
          returns: { entry: 'src/ledger.ts', export: 'bumpAmount', args: ['nope', 10], equals: null },
        },
      },
    ],
  },

  {
    folder: 'maybe-null',
    title: { en: 'Maybe null', es: 'Quizá null' },
    difficulty: 'easy',
    timeLimitMs: 60000,
    themes: ['nullish', 'optional'],
    entry: 'src/title.ts',
    tree: `workspace/
└── src/
    └── title.ts   (page can be null; empty heading is legal)`,
    briefing: {
      en: `CMS preview blows up when the page row is missing, and empty headings get rewritten to **"Untitled"** like the author never meant a blank. \`pageTitle\` trusts \`.heading\` a little too much.`,
      es: `La preview del CMS explota cuando falta la fila de página, y los headings vacíos se reescriben a **"Untitled"** como si el autor no hubiera querido el blanco. \`pageTitle\` confía demasiado en \`.heading\`.`,
    },
    objective: {
      en: `Survive a missing page and keep empty headings empty. \`pageTitle(null)\` → \`"Untitled"\`; \`pageTitle({ heading: "" })\` → \`""\`; \`pageTitle({ heading: "Hi" })\` → \`"Hi"\`.`,
      es: `Sobrevive a una página ausente y mantén un heading vacío como cadena vacía. \`pageTitle(null)\` → \`"Untitled"\`; \`pageTitle({ heading: "" })\` → \`""\`; \`pageTitle({ heading: "Hi" })\` → \`"Hi"\`.`,
    },
    starter: `export function pageTitle(page: { heading?: string } | null): string {
  // Null throws. Empty string wrongly becomes Untitled.
  return page.heading || 'Untitled'
}
`,
    solution: `export function pageTitle(page: { heading?: string } | null): string {
  return page?.heading ?? 'Untitled'
}
`,
    walkthrough: `Use optional chaining and nullish coalescing: \`page?.heading ?? 'Untitled'\`. \`||\` treats \`""\` as missing; \`??\` does not.`,
    checks: [
      {
        name: { en: 'exports pageTitle', es: 'exporta pageTitle' },
        expect: { exports: { entry: 'src/title.ts', export: 'pageTitle' } },
      },
      {
        name: { en: 'null page is Untitled', es: 'página null es Untitled' },
        expect: {
          returns: { entry: 'src/title.ts', export: 'pageTitle', args: [null], equals: 'Untitled' },
        },
      },
      {
        name: { en: 'empty heading stays empty', es: 'heading vacío se queda vacío' },
        expect: {
          returns: {
            entry: 'src/title.ts',
            export: 'pageTitle',
            args: [{ heading: '' }],
            equals: '',
          },
        },
      },
      {
        name: { en: 'heading Hi returns Hi', es: 'heading Hi devuelve Hi' },
        expect: {
          returns: {
            entry: 'src/title.ts',
            export: 'pageTitle',
            args: [{ heading: 'Hi' }],
            equals: 'Hi',
          },
        },
      },
    ],
  },

  {
    folder: 'list-bleed',
    title: { en: 'List bleed', es: 'La lista se sangra' },
    difficulty: 'easy',
    timeLimitMs: 60000,
    themes: ['arrays', 'mutation'],
    entry: 'src/inventory.ts',
    tree: `workspace/
└── src/
    └── inventory.ts   (returns the live stock array)`,
    briefing: {
      en: `Warehouse API promised a **snapshot**. Callers push into the array you returned and suddenly production stock includes \`"leak"\`. \`getStock\` handed out the live shelf.`,
      es: `La API del almacén prometió una **foto**. Los callers hacen push al array que devolviste y de pronto el stock de producción incluye \`"leak"\`. \`getStock\` entregó la estantería en vivo.`,
    },
    objective: {
      en: `Callers may mutate what \`getStock\` returns without corrupting the store. After a push of \`"leak"\`, a fresh \`getStock()\` must still be \`["pen","ink"]\` (length 2).`,
      es: `El caller puede mutar lo que devuelve \`getStock\` sin corromper el almacén. Tras un push de \`"leak"\`, un nuevo \`getStock()\` debe seguir siendo \`["pen","ink"]\` (length 2).`,
    },
    starter: `const STOCK = ['pen', 'ink']

export function getStock(): string[] {
  // Returns the live array. Mutations stick.
  return STOCK
}
`,
    solution: `const STOCK = ['pen', 'ink']

export function getStock(): string[] {
  return [...STOCK]
}
`,
    walkthrough: `Return a copy (\`[...STOCK]\` or \`STOCK.slice()\`). Never hand out the internal array.`,
    checks: [
      {
        name: { en: 'exports getStock', es: 'exporta getStock' },
        expect: { exports: { entry: 'src/inventory.ts', export: 'getStock' } },
      },
      {
        name: { en: 'getStock returns pen and ink', es: 'getStock devuelve pen e ink' },
        expect: {
          returns: {
            entry: 'src/inventory.ts',
            export: 'getStock',
            args: [],
            equals: ['pen', 'ink'],
          },
        },
      },
      {
        name: { en: 'stock length stays 2 after push', es: 'el stock sigue length 2 tras push' },
        expect: {
          arrayPushStable: {
            entry: 'src/inventory.ts',
            export: 'getStock',
            args: [],
            pushValue: 'leak',
            lengthEquals: 2,
          },
        },
      },
    ],
  },

  {
    folder: 'config-bleed',
    title: { en: 'Config bleed', es: 'El config se sangra' },
    difficulty: 'easy',
    timeLimitMs: 60000,
    themes: ['objects', 'mutation'],
    entry: 'src/flags.ts',
    tree: `workspace/
└── src/
    └── flags.ts   (returns the live object)`,
    briefing: {
      en: `Feature flags are **"read-only"** until a test mutates the object you returned and production dark-launches itself. \`getFlags\` hands out something callers can rewrite in place. After that rewrite, the store must not have changed.`,
      es: `Los feature flags son **"de solo lectura"** hasta que un test muta el objeto que devolviste y producción se auto-lanza a oscuras. \`getFlags\` entrega algo que el caller puede reescribir in situ. Tras esa mutación, el almacén no debe haber cambiado.`,
    },
    objective: {
      en: `Callers may mutate what \`getFlags\` returns without corrupting the store. After \`getFlags().beta = true\`, a fresh \`getFlags().beta\` must still be \`false\`.`,
      es: `El caller puede mutar lo que devuelve \`getFlags\` sin corromper el almacén. Tras \`getFlags().beta = true\`, un nuevo \`getFlags().beta\` debe seguir siendo \`false\`.`,
    },
    starter: `const FLAGS = { beta: false, verbose: false }

export function getFlags(): { beta: boolean; verbose: boolean } {
  // Returns the live object. Mutations stick. That is the incident.
  return FLAGS
}
`,
    solution: `const FLAGS = { beta: false, verbose: false }

export function getFlags(): { beta: boolean; verbose: boolean } {
  return { ...FLAGS }
}
`,
    walkthrough: `Return a shallow copy (\`{ ...FLAGS }\` or \`Object.assign\`). Never return the internal object.`,
    checks: [
      {
        name: { en: 'exports getFlags', es: 'exporta getFlags' },
        expect: { exports: { entry: 'src/flags.ts', export: 'getFlags' } },
      },
      {
        name: { en: 'getFlags returns the store shape', es: 'getFlags devuelve la forma del almacén' },
        expect: {
          returns: {
            entry: 'src/flags.ts',
            export: 'getFlags',
            args: [],
            equals: { beta: false, verbose: false },
          },
        },
      },
      {
        name: { en: 'beta stays false after mutate', es: 'beta sigue false tras mutar' },
        expect: {
          stableAfterMutate: {
            entry: 'src/flags.ts',
            export: 'getFlags',
            args: [],
            mutateKey: 'beta',
            mutateValue: true,
            rereadKey: 'beta',
            equals: false,
          },
        },
      },
    ],
  },

  {
    folder: 'weekend-rate',
    title: { en: 'Weekend rate', es: 'Tarifa de fin de semana' },
    difficulty: 'easy',
    timeLimitMs: 60000,
    themes: ['functions'],
    entry: 'src/pricing.ts',
    tree: `workspace/
└── src/
    └── pricing.ts   (weekend surcharge never clocks in)`,
    briefing: {
      en: `Surge pricing: **weekdays 1x, weekends 1.5x**. Right now everything is weekday. Saturday must hurt on purpose.`,
      es: `Surge: **entre semana 1x, fin de semana 1.5x**. Ahora todo es entre semana. El sábado tiene que doler a propósito.`,
    },
    objective: {
      en: `Weekdays keep the base price; weekends apply the 1.5x surcharge. \`priceCents(100, "weekday")\` → \`100\`; \`priceCents(100, "weekend")\` → \`150\`.`,
      es: `Entre semana se mantiene el precio base; el fin de semana aplica el recargo 1.5x. \`priceCents(100, "weekday")\` → \`100\`; \`priceCents(100, "weekend")\` → \`150\`.`,
    },
    starter: `export type DayKind = 'weekday' | 'weekend'

const weekdayRate = (cents: number) => cents
const weekendRate = (cents: number) => Math.round(cents * 1.5)

export function priceCents(baseCents: number, day: DayKind): number {
  // Always weekday. The weekend surcharge never clocks in.
  const rate = weekdayRate
  return rate(baseCents)
}
`,
    solution: `export type DayKind = 'weekday' | 'weekend'

const weekdayRate = (cents: number) => cents
const weekendRate = (cents: number) => Math.round(cents * 1.5)

export function priceCents(baseCents: number, day: DayKind): number {
  const rate = day === 'weekend' ? weekendRate : weekdayRate
  return rate(baseCents)
}
`,
    walkthrough: `Pick \`weekendRate\` vs \`weekdayRate\` from \`day\`, then call it.`,
    checks: [
      {
        name: { en: 'exports priceCents', es: 'exporta priceCents' },
        expect: { exports: { entry: 'src/pricing.ts', export: 'priceCents' } },
      },
      {
        name: { en: 'weekday keeps base', es: 'weekday mantiene la base' },
        expect: {
          returns: {
            entry: 'src/pricing.ts',
            export: 'priceCents',
            args: [100, 'weekday'],
            equals: 100,
          },
        },
      },
      {
        name: { en: 'weekend applies 1.5x', es: 'weekend aplica 1.5x' },
        expect: {
          returns: {
            entry: 'src/pricing.ts',
            export: 'priceCents',
            args: [100, 'weekend'],
            equals: 150,
          },
        },
      },
    ],
  },

  {
    folder: 'make-the-doc',
    title: { en: 'Make the doc', es: 'Haz el documento' },
    difficulty: 'easy',
    timeLimitMs: 60000,
    themes: ['unions', 'functions'],
    entry: 'src/docs.ts',
    tree: `workspace/
└── src/
    └── docs.ts   (always builds an invoice)`,
    briefing: {
      en: `Billing needs \`kind: "invoice" | "credit"\` to produce the right document. Today every call builds an invoice, so credit notes invoice the customer again. Shame. Build the right shape for each kind.`,
      es: `Billing necesita que \`kind: "invoice" | "credit"\` produzca el documento correcto. Hoy todo sale como invoice, así que los abonos vuelven a cobrar. Vergüenza. Construye la forma correcta para cada kind.`,
    },
    objective: {
      en: `Each kind must produce its own document shape: invoices keep a positive total; credits negate it. \`makeDoc("invoice", 10)\` → \`{ type: "invoice", total: 10 }\`; \`makeDoc("credit", 10)\` → \`{ type: "credit", total: -10 }\`.`,
      es: `Cada kind debe producir su propia forma de documento: las facturas mantienen total positivo; los abonos lo niegan. \`makeDoc("invoice", 10)\` → \`{ type: "invoice", total: 10 }\`; \`makeDoc("credit", 10)\` → \`{ type: "credit", total: -10 }\`.`,
    },
    starter: `export type Kind = 'invoice' | 'credit'

export function makeDoc(kind: Kind, amount: number): { type: Kind; total: number } {
  // Credits still invoice. Accounting has screenshots.
  return { type: 'invoice', total: amount }
}
`,
    solution: `export type Kind = 'invoice' | 'credit'

export function makeDoc(kind: Kind, amount: number): { type: Kind; total: number } {
  if (kind === 'credit') return { type: 'credit', total: -Math.abs(amount) }
  return { type: 'invoice', total: amount }
}
`,
    walkthrough: `Branch on \`kind\`. Credits negate the amount; invoices keep it positive.`,
    checks: [
      {
        name: { en: 'exports makeDoc', es: 'exporta makeDoc' },
        expect: { exports: { entry: 'src/docs.ts', export: 'makeDoc' } },
      },
      {
        name: { en: 'invoice keeps positive total', es: 'invoice mantiene total positivo' },
        expect: {
          returns: {
            entry: 'src/docs.ts',
            export: 'makeDoc',
            args: ['invoice', 10],
            equals: { type: 'invoice', total: 10 },
          },
        },
      },
      {
        name: { en: 'credit negates total', es: 'credit niega el total' },
        expect: {
          returns: {
            entry: 'src/docs.ts',
            export: 'makeDoc',
            args: ['credit', 10],
            equals: { type: 'credit', total: -10 },
          },
        },
      },
    ],
  },

  {
    folder: 'pipe-it',
    title: { en: 'Pipe it', es: 'Encádenalo' },
    difficulty: 'easy',
    timeLimitMs: 60000,
    themes: ['functions'],
    entry: 'src/pipeline.ts',
    tree: `workspace/
└── src/
    └── pipeline.ts   (god function; validate unused)`,
    briefing: {
      en: `A "temporary" **god function** inlines parse and format, and quietly drops validation. Garbage like \`"nope"\` still formats. Wire the pipeline so invalid input dies as \`null\`.`,
      es: `Una **"función dios" temporal** inlinea parse y format, y se salta la validación. Basura como \`"nope"\` sigue formateando. Encaja el pipeline para que el input inválido muera como \`null\`.`,
    },
    objective: {
      en: `Valid trimmed digits format to a label; invalid input must stop as \`null\` (not a fake \`VAL:…\`). \`processInput("  42  ")\` → \`"VAL:42"\`; \`processInput("nope")\` → \`null\`.`,
      es: `Los dígitos válidos (tras trim) formatean a una etiqueta; el input inválido debe parar en \`null\` (no un \`VAL:…\` falso). \`processInput("  42  ")\` → \`"VAL:42"\`; \`processInput("nope")\` → \`null\`.`,
    },
    starter: `export function parse(raw: string): string {
  return raw.trim()
}

export function validate(s: string): string | null {
  return /^\\d+$/.test(s) ? s : null
}

export function format(s: string): string {
  return 'VAL:' + s
}

export function processInput(raw: string): string | null {
  // Skips validate. Garbage in, garbage proudly out.
  const s = parse(raw)
  return format(s)
}
`,
    solution: `export function parse(raw: string): string {
  return raw.trim()
}

export function validate(s: string): string | null {
  return /^\\d+$/.test(s) ? s : null
}

export function format(s: string): string {
  return 'VAL:' + s
}

export function processInput(raw: string): string | null {
  const s = parse(raw)
  const v = validate(s)
  if (v === null) return null
  return format(v)
}
`,
    walkthrough: `\`parse → validate → format\`. If validate returns null, stop and return null.`,
    checks: [
      {
        name: { en: 'exports processInput', es: 'exporta processInput' },
        expect: { exports: { entry: 'src/pipeline.ts', export: 'processInput' } },
      },
      {
        name: { en: 'valid input formats', es: 'input válido formatea' },
        expect: {
          returns: {
            entry: 'src/pipeline.ts',
            export: 'processInput',
            args: ['  42  '],
            equals: 'VAL:42',
          },
        },
      },
      {
        name: { en: 'invalid input is null', es: 'input inválido es null' },
        expect: {
          returns: {
            entry: 'src/pipeline.ts',
            export: 'processInput',
            args: ['nope'],
            equals: null,
          },
        },
      },
    ],
  },

  {
    folder: 'pending-receipt',
    title: { en: 'Pending receipt', es: 'Recibo en pending' },
    difficulty: 'easy',
    timeLimitMs: 60000,
    themes: ['callbacks', 'strings'],
    entry: 'src/payout.ts',
    tree: `workspace/
└── src/
    └── payout.ts   (nest from 2014; receipt says pending)`,
    briefing: {
      en: `Payments still has a **callback nest** from another decade. Atmosphere aside, the receipt comes back wrong: \`"pending:42"\` instead of paid. Helpers stay callback-based. Fix the payout result.`,
      es: `Payments sigue con un **nido de callbacks** de otra década. Atmósfera aparte, el recibo sale mal: \`"pending:42"\` en vez de paid. Los helpers se quedan a callbacks. Arregla el resultado del payout.`,
    },
    objective: {
      en: `When payout finishes, the receipt must say paid, not pending. \`runPayout(42)\` resolves to \`"paid:42"\`.`,
      es: `Cuando el payout termina, el recibo debe decir paid, no pending. \`runPayout(42)\` resuelve a \`"paid:42"\`.`,
    },
    starter: `function loadAccount(id: number, cb: (err: Error | null, account?: { id: number }) => void): void {
  cb(null, { id })
}
function authorize(account: { id: number }, cb: (err: Error | null, token?: string) => void): void {
  cb(null, 'tok-' + account.id)
}
function capture(token: string, cb: (err: Error | null, ok?: boolean) => void): void {
  cb(null, token.startsWith('tok-'))
}

export function runPayout(id: number): Promise<string> {
  return new Promise((resolve, reject) => {
    loadAccount(id, (err, account) => {
      if (err || !account) return reject(err || new Error('no account'))
      authorize(account, (err2, token) => {
        if (err2 || !token) return reject(err2 || new Error('no token'))
        capture(token, (err3, ok) => {
          if (err3 || !ok) return reject(err3 || new Error('capture failed'))
          // Wrong receipt token. The nest is atmosphere; the check is this string.
          resolve('pending:' + id)
        })
      })
    })
  })
}
`,
    solution: `function loadAccount(id: number, cb: (err: Error | null, account?: { id: number }) => void): void {
  cb(null, { id })
}
function authorize(account: { id: number }, cb: (err: Error | null, token?: string) => void): void {
  cb(null, 'tok-' + account.id)
}
function capture(token: string, cb: (err: Error | null, ok?: boolean) => void): void {
  cb(null, token.startsWith('tok-'))
}

export function runPayout(id: number): Promise<string> {
  return new Promise((resolve, reject) => {
    loadAccount(id, (err, account) => {
      if (err || !account) return reject(err || new Error('no account'))
      authorize(account, (err2, token) => {
        if (err2 || !token) return reject(err2 || new Error('no token'))
        capture(token, (err3, ok) => {
          if (err3 || !ok) return reject(err3 || new Error('capture failed'))
          resolve('paid:' + id)
        })
      })
    })
  })
}
`,
    walkthrough: `The check only asserts the receipt string (\`"paid:42"\`). Flip \`pending\` to \`paid\`. Rewriting the nest into async helpers is optional craft, not required.`,
    checks: [
      {
        name: { en: 'exports runPayout', es: 'exporta runPayout' },
        expect: { exports: { entry: 'src/payout.ts', export: 'runPayout' } },
      },
      {
        name: { en: 'runPayout(42) pays', es: 'runPayout(42) paga' },
        expect: {
          returns: { entry: 'src/payout.ts', export: 'runPayout', args: [42], equals: 'paid:42' },
        },
      },
    ],
  },

  {
    folder: 'then-chain',
    title: { en: 'Then chain', es: 'Encadena o muere' },
    difficulty: 'easy',
    timeLimitMs: 60000,
    themes: ['promises'],
    entry: 'src/stock.ts',
    tree: `workspace/
└── src/
    └── stock.ts   (.then forgotten; UI shows [object Promise])`,
    briefing: {
      en: `Inventory badge renders **"[object Promise]"** on the warehouse TV. \`stockLabel\` returns the Promise itself instead of waiting for the SKU value. Wait for the number, then build the label string.`,
      es: `El badge de inventario pinta **"[object Promise]"** en la tele del almacén. \`stockLabel\` devuelve la Promise en vez de esperar el SKU. Espera el número y construye la etiqueta.`,
    },
    objective: {
      en: `The inventory badge needs the finished label string, not a Promise on screen. \`stockLabel("sku-1")\` must resolve to \`"SKU sku-1: 3 left"\`.`,
      es: `El badge de inventario necesita la etiqueta ya resuelta, no una Promise en pantalla. \`stockLabel("sku-1")\` debe resolverse a \`"SKU sku-1: 3 left"\`.`,
    },
    starter: `function fetchStock(sku: string): Promise<number> {
  return Promise.resolve(sku === 'sku-1' ? 3 : 0)
}

export function stockLabel(sku: string): Promise<string> {
  // Returns a Promise<number> dressed as Promise<string>. The TV noticed.
  return fetchStock(sku) as unknown as Promise<string>
}
`,
    solution: `function fetchStock(sku: string): Promise<number> {
  return Promise.resolve(sku === 'sku-1' ? 3 : 0)
}

export function stockLabel(sku: string): Promise<string> {
  return fetchStock(sku).then((qty) => 'SKU ' + sku + ': ' + qty + ' left')
}
`,
    walkthrough: `Preferred: \`fetchStock(sku).then(qty => ...)\` building the label. \`async\`/\`await\` also satisfies the checks (state-based).`,
    checks: [
      {
        name: { en: 'exports stockLabel', es: 'exporta stockLabel' },
        expect: { exports: { entry: 'src/stock.ts', export: 'stockLabel' } },
      },
      {
        name: { en: 'stockLabel resolves to the SKU line', es: 'stockLabel resuelve a la línea de SKU' },
        expect: {
          returns: {
            entry: 'src/stock.ts',
            export: 'stockLabel',
            args: ['sku-1'],
            equals: 'SKU sku-1: 3 left',
          },
        },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Medium band
  // ---------------------------------------------------------------------------
  {
    folder: 'forgot-to-await',
    title: { en: 'Forgot to await', es: 'Se te olvidó el await' },
    difficulty: 'medium',
    timeLimitMs: 90000,
    themes: ['async-await', 'promises'],
    entry: 'src/greeter.ts',
    tree: `workspace/
└── src/
    └── greeter.ts   (welcomes "Welcome undefined")`,
    briefing: {
      en: `Onboarding emails say **"Welcome undefined"**. \`welcome\` treated a Promise like a user object and asked it for \`.name\` like it owed you rent.`,
      es: `Los emails de onboarding dicen **"Welcome undefined"**. \`welcome\` trató una Promise como un usuario y le pediste \`.name\` como si te debiera dinero.`,
    },
    objective: {
      en: `The greeting must use the loaded user's name. \`welcome(7)\` resolves to \`"Welcome, Ada"\` (not \`"Welcome undefined"\`).`,
      es: `El saludo debe usar el nombre del usuario ya cargado. \`welcome(7)\` resuelve a \`"Welcome, Ada"\` (no \`"Welcome undefined"\`).`,
    },
    starter: `function fetchUser(id: number): Promise<{ name: string }> {
  return Promise.resolve({ name: id === 7 ? 'Ada' : 'Anon' })
}

export async function welcome(id: number): Promise<string> {
  const user = fetchUser(id)
  // user is a Promise. .name is undefined. The email went out anyway.
  return \`Welcome, \${(user as unknown as { name: string }).name}\`
}
`,
    solution: `function fetchUser(id: number): Promise<{ name: string }> {
  return Promise.resolve({ name: id === 7 ? 'Ada' : 'Anon' })
}

export async function welcome(id: number): Promise<string> {
  const user = await fetchUser(id)
  return 'Welcome, ' + user.name
}
`,
    walkthrough: `\`await fetchUser(id)\` before reading \`.name\`.`,
    checks: [
      {
        name: { en: 'exports welcome', es: 'exporta welcome' },
        expect: { exports: { entry: 'src/greeter.ts', export: 'welcome' } },
      },
      {
        name: { en: 'welcome(7) greets Ada', es: 'welcome(7) saluda a Ada' },
        expect: {
          returns: { entry: 'src/greeter.ts', export: 'welcome', args: [7], equals: 'Welcome, Ada' },
        },
      },
    ],
  },

  {
    folder: 'swallow-the-500',
    title: { en: 'Swallow the 500', es: 'Tragarse el 500' },
    difficulty: 'medium',
    timeLimitMs: 90000,
    themes: ['errors', 'async-await'],
    entry: 'src/api.ts',
    tree: `workspace/
└── src/
    └── api.ts   (catch → null; UI shows "success")`,
    briefing: {
      en: `The API helper **eats every failure** and returns \`null\`. The UI draws an empty success state while ops pages a real 500. On failure, \`fetchOrder\` must reject: do not launder errors into silence.`,
      es: `El helper de API **se traga cada fallo** y devuelve \`null\`. La UI pinta un éxito vacío mientras ops pagina un 500 de verdad. Si falla, \`fetchOrder\` debe rechazar: no blanquees errores en silencio.`,
    },
    objective: {
      en: `Success still returns the order; failures must surface, not become silent \`null\`. \`fetchOrder(1)\` → \`{ id: 1 }\`. \`fetchOrder(500)\` rejects with a message containing \`ORDER_500\`.`,
      es: `El éxito sigue devolviendo el pedido; los fallos deben aflorar, no convertirse en \`null\` silencioso. \`fetchOrder(1)\` → \`{ id: 1 }\`. \`fetchOrder(500)\` rechaza con un mensaje que contenga \`ORDER_500\`.`,
    },
    starter: `function rawFetch(id: number): Promise<{ id: number }> {
  if (id === 500) return Promise.reject(new Error('ORDER_500 upstream down'))
  return Promise.resolve({ id })
}

export async function fetchOrder(id: number): Promise<{ id: number } | null> {
  try {
    return await rawFetch(id)
  } catch {
    // Silent null. Product called it "resilience". It is not.
    return null
  }
}
`,
    solution: `function rawFetch(id: number): Promise<{ id: number }> {
  if (id === 500) return Promise.reject(new Error('ORDER_500 upstream down'))
  return Promise.resolve({ id })
}

export async function fetchOrder(id: number): Promise<{ id: number }> {
  return await rawFetch(id)
}
`,
    walkthrough: `Remove the catch-to-null. Let the rejection surface (or rethrow). Success path still returns \`{ id }\`.`,
    checks: [
      {
        name: { en: 'exports fetchOrder', es: 'exporta fetchOrder' },
        expect: { exports: { entry: 'src/api.ts', export: 'fetchOrder' } },
      },
      {
        name: { en: 'fetchOrder(1) returns the order', es: 'fetchOrder(1) devuelve el pedido' },
        expect: {
          returns: { entry: 'src/api.ts', export: 'fetchOrder', args: [1], equals: { id: 1 } },
        },
      },
      {
        name: { en: 'fetchOrder(500) rejects with ORDER_500', es: 'fetchOrder(500) rechaza con ORDER_500' },
        expect: {
          rejects: {
            entry: 'src/api.ts',
            export: 'fetchOrder',
            args: [500],
            messageIncludes: 'ORDER_500',
          },
        },
      },
    ],
  },

  {
    folder: 'two-doors',
    title: { en: 'Two doors', es: 'Dos puertas' },
    difficulty: 'medium',
    timeLimitMs: 90000,
    themes: ['async-await', 'concurrency'],
    entry: 'src/dashboard.ts',
    tree: `workspace/
└── src/
    └── dashboard.ts   (awaits A before starting B; A refuses)`,
    briefing: {
      en: `The home dashboard loads **user then prefs**, in series. A nasty gate in \`fetchUser\` only resolves if prefs has already been kicked off; sequential waiting dead-ends. The two loads have to overlap.`,
      es: `El dashboard carga **user y luego prefs**, en serie. Un candado en \`fetchUser\` solo resuelve si prefs ya arrancó: esperar en serie se suicida. Las dos cargas tienen que solaparse.`,
    },
    objective: {
      en: `Home must load user and prefs together without deadlocking on the sequential gate. \`loadHome()\` resolves to \`{ user: "Ada", theme: "dark" }\`.`,
      es: `Home debe cargar user y prefs juntos sin quedarse atrapado en el candado secuencial. \`loadHome()\` resuelve a \`{ user: "Ada", theme: "dark" }\`.`,
    },
    starter: `let prefsStarted = false

function fetchUser(): Promise<string> {
  return Promise.resolve().then(() => {
    if (!prefsStarted) {
      throw new Error('user waited on prefs: start both')
    }
    return 'Ada'
  })
}

function fetchPrefs(): Promise<string> {
  prefsStarted = true
  return Promise.resolve('dark')
}

export async function loadHome(): Promise<{ user: string; theme: string }> {
  // Sequential await never starts prefs before user runs. Boom.
  const user = await fetchUser()
  const theme = await fetchPrefs()
  return { user, theme }
}
`,
    solution: `let prefsStarted = false

function fetchUser(): Promise<string> {
  return Promise.resolve().then(() => {
    if (!prefsStarted) {
      throw new Error('user waited on prefs: start both')
    }
    return 'Ada'
  })
}

function fetchPrefs(): Promise<string> {
  prefsStarted = true
  return Promise.resolve('dark')
}

export async function loadHome(): Promise<{ user: string; theme: string }> {
  const [user, theme] = await Promise.all([fetchUser(), fetchPrefs()])
  return { user, theme }
}
`,
    walkthrough: `Start both loads before either settles (e.g. \`Promise.all\`). Sequential await fails the gate inside \`fetchUser\`.`,
    checks: [
      {
        name: { en: 'exports loadHome', es: 'exporta loadHome' },
        expect: { exports: { entry: 'src/dashboard.ts', export: 'loadHome' } },
      },
      {
        name: { en: 'loadHome joins user and theme', es: 'loadHome junta user y theme' },
        expect: {
          returns: {
            entry: 'src/dashboard.ts',
            export: 'loadHome',
            args: [],
            equals: { user: 'Ada', theme: 'dark' },
          },
        },
      },
    ],
  },

  {
    folder: 'one-client',
    title: { en: 'One client', es: 'Un solo cliente' },
    difficulty: 'medium',
    timeLimitMs: 90000,
    themes: ['modules', 'references'],
    entry: 'src/db.ts',
    tree: `workspace/
└── src/
    └── db.ts   (new client every call; pool crying)`,
    briefing: {
      en: `\`getClient()\` **news up a connection** on every call. The pool hit 400 before lunch. Two callers should not each walk away with a brand-new toy.`,
      es: `\`getClient()\` **abre conexión nueva** en cada llamada. El pool tocó 400 antes de comer. Dos callers no deberían irse cada uno con un juguete nuevo.`,
    },
    objective: {
      en: `Stop minting a new connection on every call: two \`getClient()\` results must be the same object reference (pool stays calm).`,
      es: `Deja de abrir conexión nueva en cada llamada: dos resultados de \`getClient()\` deben ser la misma referencia de objeto (el pool se tranquiliza).`,
    },
    starter: `let seq = 0

export type Client = { id: number }

export function getClient(): Client {
  // Fresh toy every time. The pool filed a restraining order.
  seq += 1
  return { id: seq }
}
`,
    solution: `let seq = 0
let cached: { id: number } | null = null

export type Client = { id: number }

export function getClient(): Client {
  if (!cached) {
    seq += 1
    cached = { id: seq }
  }
  return cached
}
`,
    walkthrough: `Cache the first client in module scope and return it on later calls.`,
    checks: [
      {
        name: { en: 'exports getClient', es: 'exporta getClient' },
        expect: { exports: { entry: 'src/db.ts', export: 'getClient' } },
      },
      {
        name: { en: 'getClient returns a client', es: 'getClient devuelve un cliente' },
        expect: {
          returns: { entry: 'src/db.ts', export: 'getClient', args: [], equals: { id: 1 } },
        },
      },
      {
        name: { en: 'two getClient calls share a reference', es: 'dos getClient comparten referencia' },
        expect: {
          sameRef: { entry: 'src/db.ts', export: 'getClient', args: [] },
        },
      },
    ],
  },

  {
    folder: 'narrow-the-status',
    title: { en: 'Narrow the status', es: 'Estrecha el status' },
    difficulty: 'medium',
    timeLimitMs: 90000,
    themes: ['typescript', 'narrowing', 'unions'],
    entry: 'src/result.ts',
    tree: `workspace/
└── src/
    └── result.ts   (treats err like ok)`,
    briefing: {
      en: `\`describe\` gets a tagged union \`{ok:true,value}|{ok:false,error}\` and **always reads \`.value\`**. On errors you concatenate \`undefined\` into the UI copy. Error paths must format the error string.`,
      es: `\`describe\` recibe una unión etiquetada \`{ok:true,value}|{ok:false,error}\` y **siempre lee \`.value\`**. En error concatenas \`undefined\` al copy. Las ramas de error deben formatear el string de error.`,
    },
    objective: {
      en: `Format success and failure differently: ok values as \`"ok:…"\`, errors as \`"err:…"\` (never \`"ok:undefined"\`). \`describe({ok:true,value:"x"})\` → \`"ok:x"\`; \`describe({ok:false,error:"boom"})\` → \`"err:boom"\`.`,
      es: `Formatea éxito y fallo distinto: valores ok como \`"ok:…"\`, errores como \`"err:…"\` (nunca \`"ok:undefined"\`). \`describe({ok:true,value:"x"})\` → \`"ok:x"\`; \`describe({ok:false,error:"boom"})\` → \`"err:boom"\`.`,
    },
    starter: `export type Result = { ok: true; value: string } | { ok: false; error: string }

export function describe(result: Result): string {
  // No narrowing. Error path reads .value and invents "ok:undefined".
  return 'ok:' + (result as { value: string }).value
}
`,
    solution: `export type Result = { ok: true; value: string } | { ok: false; error: string }

export function describe(result: Result): string {
  if (result.ok) return 'ok:' + result.value
  return 'err:' + result.error
}
`,
    walkthrough: `\`if (result.ok)\` narrows the union; use \`.value\` vs \`.error\` on each branch.`,
    checks: [
      {
        name: { en: 'exports describe', es: 'exporta describe' },
        expect: { exports: { entry: 'src/result.ts', export: 'describe' } },
      },
      {
        name: { en: 'ok branch formats value', es: 'rama ok formatea value' },
        expect: {
          returns: {
            entry: 'src/result.ts',
            export: 'describe',
            args: [{ ok: true, value: 'x' }],
            equals: 'ok:x',
          },
        },
      },
      {
        name: { en: 'err branch formats error', es: 'rama err formatea error' },
        expect: {
          returns: {
            entry: 'src/result.ts',
            export: 'describe',
            args: [{ ok: false, error: 'boom' }],
            equals: 'err:boom',
          },
        },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Hard band
  // ---------------------------------------------------------------------------
  {
    folder: 'stale-paint',
    title: { en: 'Stale paint', es: 'Pintura vieja' },
    difficulty: 'hard',
    timeLimitMs: 120000,
    themes: ['async-await', 'concurrency'],
    entry: 'src/search.ts',
    tree: `workspace/
└── src/
    └── search.ts   (slow response paints over the latest)`,
    briefing: {
      en: `Typeahead fires two searches. The **slow one finishes last** and paints over the name you already showed. Support gets screenshots of Ada when Bob was the last query. Last started must win the paint.`,
      es: `El typeahead lanza dos búsquedas. La **lenta termina al final** y pinta encima del nombre que ya mostraste. Soporte recibe capturas de Ada cuando Bob era la última query. Quien arrancó último debe ganar el paint.`,
    },
    objective: {
      en: `When two fetches overlap, the last request started must own the painted name. \`paintNames()\` resolves to \`"Bob"\` (not \`"Ada"\` from the slower first request).`,
      es: `Cuando dos fetches se solapan, la última petición arrancada debe poseer el nombre pintado. \`paintNames()\` resuelve a \`"Bob"\` (no \`"Ada"\` de la primera petición más lenta).`,
    },
    starter: `let paint = 'empty'

function fetchName(req: number): Promise<string> {
  if (req === 1) return Promise.resolve().then(() => 'Ada')
  return Promise.resolve('Bob')
}

export async function paintNames(): Promise<string> {
  const p1 = fetchName(1).then((n) => {
    paint = n
  })
  const p2 = fetchName(2).then((n) => {
    paint = n
  })
  await Promise.all([p1, p2])
  return paint
}
`,
    solution: `function fetchName(req: number): Promise<string> {
  if (req === 1) return Promise.resolve().then(() => 'Ada')
  return Promise.resolve('Bob')
}

export async function paintNames(): Promise<string> {
  let latestReq = 0
  let paint = 'empty'
  const run = async (req: number) => {
    latestReq = req
    const n = await fetchName(req)
    if (req === latestReq) paint = n
  }
  await Promise.all([run(1), run(2)])
  return paint
}
`,
    walkthrough: `Track which request is latest. Only apply paint when the finished \`req\` still matches. Stale completions must not overwrite.`,
    checks: [
      {
        name: { en: 'exports paintNames', es: 'exporta paintNames' },
        expect: { exports: { entry: 'src/search.ts', export: 'paintNames' } },
      },
      {
        name: { en: 'paintNames resolves to Bob', es: 'paintNames resuelve a Bob' },
        expect: {
          returns: {
            entry: 'src/search.ts',
            export: 'paintNames',
            args: [],
            equals: 'Bob',
          },
        },
      },
    ],
  },
]

for (const s of scenarios) pack(s)

// Retired folders (renames / dropped POC drafts).
for (const retired of ['callback-canyon', 'broken-tip']) {
  rmSync(join(TS, retired), { recursive: true, force: true })
}

// scenarios/index.ts is hand-maintained (git + ts; picker filters kind=ts).
console.log('generated', scenarios.length, 'ts scenarios')
console.log(scenarios.map((s) => s.folder).join('\n'))
