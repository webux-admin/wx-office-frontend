/**
 * Fills a fresh webux-office database with demo data.
 *
 * The script goes through the REST API only and never writes to the database directly. That
 * way the same rules apply as in production (UID check digit, QR-IBAN and reference
 * combination, roles and permissions), and the result cannot contradict them.
 *
 * Usage:  npm run seed
 * Environment variables:
 *   API_URL         base URL of the backend    (default http://localhost:8080)
 *   ADMIN_USER      name of the superuser      (default admin)
 *   ADMIN_PASSWORD  password of the superuser  (default webux-admin-2026)
 */

const API = process.env.API_URL ?? 'http://localhost:8080'
const ADMIN_USER = process.env.ADMIN_USER ?? 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'webux-admin-2026'

/** One password for every demo user. At least 12 characters, see CreateUserRequest. */
const DEMO_PASSWORD = 'webux-demo-2026'

/** Fiscal year the number ranges are created for. */
const FISCAL_YEAR = new Date().getFullYear()

// ---------------------------------------------------------------------------
// HTTP client: session cookie and CSRF
// ---------------------------------------------------------------------------

/** Every cookie of the session, name to value. */
const cookies = new Map()

function storeCookies(response) {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';')
    const index = pair.indexOf('=')
    if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim())
  }
}

function cookieHeader() {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
}

/**
 * Sends a request with the session cookie and the CSRF token attached.
 *
 * The retry covers the very first write of a session: a client that has not seen the
 * XSRF-TOKEN cookie yet is rejected with 403, and that rejection carries the cookie.
 */
async function request(method, path, body, retry = true) {
  const headers = { Cookie: cookieHeader() }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const csrf = cookies.get('XSRF-TOKEN')
  if (csrf) headers['X-XSRF-TOKEN'] = csrf

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  storeCookies(response)

  if (response.status === 403 && retry && cookies.has('XSRF-TOKEN')) {
    return request(method, path, body, false)
  }
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${method} ${path} → ${response.status} ${response.statusText}\n${text}`)
  }
  return response.status === 204 ? null : response.json()
}

const get = (path) => request('GET', path)
const post = (path, body) => request('POST', path, body ?? {})
const put = (path, body) => request('PUT', path, body ?? {})

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const TENANTS = [
  {
    code: 'WEBUX',
    name: 'Webux GmbH',
    legalForm: 'GMBH',
    uid: 'CHE-116.281.710',
    commercialRegisterName: 'Webux GmbH',
    vat: { vatLiable: true, vatMethod: 'EFFECTIVE', vatLiableFrom: '2020-01-01' },
    address: {
      street: 'Bahnhofstrasse',
      buildingNumber: '12',
      postalCode: '8001',
      town: 'Zürich',
      country: 'CH',
    },
    contact: { email: 'office@webux.ch', phone: '+41 44 500 12 34', website: 'https://webux.ch' },
    bank: {
      qrIban: 'CH4431999123000889012',
      bankName: 'Zürcher Kantonalbank',
      referenceType: 'QRR',
      // The six digits after the institute number in the QR-IBAN. A QR reference is built
      // from it, so a tenant that issues one cannot be stored without it.
      qrCustomerId: '123000',
    },
    baseCurrency: 'CHF',
    fiscalYearStartMonth: 1,
    defaultLanguage: 'de',
    defaultPaymentTerm: '30',
    cashRoundingEnabled: true,
    cashRoundingIncrement: 0.05,
    defaultRevenueAccount: '3400',
    invoiceFooterText:
      'Zahlbar innert 30 Tagen ohne Abzug. Bei Fragen zur Rechnung: office@webux.ch',
  },
  {
    code: 'NORD',
    name: 'Nordwind Handels AG',
    legalForm: 'AG',
    uid: 'CHE-200.512.347',
    vat: { vatLiable: true, vatMethod: 'EFFECTIVE', vatLiableFrom: '2018-07-01' },
    address: {
      street: 'Seestrasse',
      buildingNumber: '44',
      postalCode: '6003',
      town: 'Luzern',
      country: 'CH',
    },
    contact: { email: 'info@nordwind.ch', phone: '+41 41 210 88 00', website: 'https://nordwind.ch' },
    bank: {
      iban: 'CH9300762011623852957',
      bankName: 'Luzerner Kantonalbank',
      referenceType: 'SCOR',
    },
    baseCurrency: 'CHF',
    fiscalYearStartMonth: 1,
    defaultLanguage: 'de',
    defaultPaymentTerm: '30_2_10',
    cashRoundingEnabled: true,
    cashRoundingIncrement: 0.05,
    defaultRevenueAccount: '3200',
    invoiceFooterText: 'Zahlbar innert 20 Tagen. Skonto 2 % innert 10 Tagen.',
  },
]

/**
 * Number ranges per document type. Produces numbers such as RE-2026-0001.
 *
 * The document type is a free upper case code since V11, so the code and the printed prefix
 * are the same two letters here. They are two settings, not one: a tenant may print a
 * different prefix without renaming its counter.
 */
const NUMBER_RANGES = [
  { documentType: 'OF', prefix: 'OF', padding: 4 },
  { documentType: 'AU', prefix: 'AU', padding: 4 },
  { documentType: 'LS', prefix: 'LS', padding: 4 },
  { documentType: 'RE', prefix: 'RE', padding: 4 },
  { documentType: 'GS', prefix: 'GS', padding: 4 },
]

/** Demo users. `role` points at one of the tenant's default roles. */
const USERS = [
  {
    username: 'mmuster',
    email: 'm.muster@webux.ch',
    displayName: 'Martin Muster',
    role: 'Administrator',
    tenantCode: 'WEBUX',
    alsoIn: ['NORD'],
  },
  {
    username: 'sbucher',
    email: 's.bucher@webux.ch',
    displayName: 'Sandra Bucher',
    role: 'Buchhaltung',
    tenantCode: 'WEBUX',
  },
  {
    username: 'lweber',
    email: 'l.weber@webux.ch',
    displayName: 'Luca Weber',
    role: 'Verkauf',
    tenantCode: 'WEBUX',
  },
  {
    username: 'pgast',
    email: 'p.gast@webux.ch',
    displayName: 'Petra Gast',
    role: 'Nur lesen',
    tenantCode: 'WEBUX',
  },
]

/** Customers and suppliers of tenant WEBUX. */
const PARTNERS = [
  {
    partnerNumber: 'KD-1001',
    partnerType: 'ORGANISATION',
    isCustomer: true,
    name: 'Meier Haustechnik AG',
    legalForm: 'AG',
    uid: 'CHE-198.765.434',
    email: 'buchhaltung@meier-haustechnik.ch',
    phone: '+41 62 855 20 10',
    website: 'https://meier-haustechnik.ch',
    paymentTerm: '30',
    creditLimit: 50000,
    priceGroup: 'ENGROS',
    address: {
      label: 'Hauptsitz',
      name: 'Meier Haustechnik AG',
      street: 'Industriestrasse',
      buildingNumber: '7',
      postalCode: '5600',
      town: 'Lenzburg',
      useAsDefault: true,
      usages: ['OFFER', 'ORDER', 'DELIVERY_NOTE', 'INVOICE', 'DUNNING'],
    },
    contacts: [
      {
        salutation: 'HERR',
        firstName: 'Thomas',
        lastName: 'Meier',
        jobTitle: 'Geschäftsführer',
        email: 't.meier@meier-haustechnik.ch',
        phone: '+41 62 855 20 11',
        isPrimary: true,
      },
      {
        salutation: 'FRAU',
        firstName: 'Rita',
        lastName: 'Kunz',
        jobTitle: 'Einkauf',
        email: 'r.kunz@meier-haustechnik.ch',
      },
    ],
  },
  {
    partnerNumber: 'KD-1012',
    partnerType: 'ORGANISATION',
    isCustomer: true,
    name: 'Alpina Bau GmbH',
    legalForm: 'GMBH',
    uid: 'CHE-258.741.362',
    email: 'kreditoren@alpinabau.ch',
    phone: '+41 33 221 45 60',
    paymentTerm: '30',
    creditLimit: 120000,
    priceGroup: 'ENGROS',
    address: {
      label: 'Werkhof',
      name: 'Alpina Bau GmbH',
      street: 'Gewerbeweg',
      buildingNumber: '23',
      postalCode: '3800',
      town: 'Interlaken',
      useAsDefault: true,
      usages: ['OFFER', 'ORDER', 'DELIVERY_NOTE', 'INVOICE'],
    },
    contacts: [
      {
        salutation: 'HERR',
        firstName: 'Marco',
        lastName: 'Brunner',
        jobTitle: 'Bauleiter',
        email: 'm.brunner@alpinabau.ch',
        mobile: '+41 79 412 66 03',
        isPrimary: true,
      },
    ],
  },
  {
    partnerNumber: 'KD-1044',
    partnerType: 'ORGANISATION',
    isCustomer: true,
    name: 'Studio Nordlicht',
    legalForm: 'EINZELUNTERNEHMEN',
    uid: 'CHE-405.060.709',
    email: 'hallo@studionordlicht.ch',
    phone: '+41 31 302 19 88',
    website: 'https://studionordlicht.ch',
    paymentTerm: '10',
    priceGroup: 'DETAIL',
    address: {
      label: 'Atelier',
      name: 'Studio Nordlicht',
      street: 'Kramgasse',
      buildingNumber: '54',
      postalCode: '3011',
      town: 'Bern',
      useAsDefault: true,
      usages: ['OFFER', 'INVOICE'],
    },
    contacts: [
      {
        salutation: 'FRAU',
        firstName: 'Nina',
        lastName: 'Fischer',
        jobTitle: 'Inhaberin',
        email: 'nina@studionordlicht.ch',
        isPrimary: true,
      },
    ],
  },
  {
    partnerNumber: 'KD-1058',
    partnerType: 'ORGANISATION',
    isCustomer: true,
    name: 'Seetal Immobilien AG',
    legalForm: 'AG',
    uid: 'CHE-987.654.326',
    email: 'verwaltung@seetal-immo.ch',
    phone: '+41 41 920 77 12',
    paymentTerm: 'EOM_30',
    creditLimit: 200000,
    priceGroup: 'ENGROS',
    address: {
      label: 'Verwaltung',
      name: 'Seetal Immobilien AG',
      street: 'Luzernerstrasse',
      buildingNumber: '101',
      postalCode: '6280',
      town: 'Hochdorf',
      useAsDefault: true,
      usages: ['OFFER', 'ORDER', 'INVOICE', 'DUNNING'],
    },
    contacts: [
      {
        salutation: 'HERR',
        firstName: 'Andreas',
        lastName: 'Steiner',
        jobTitle: 'Portfolio Manager',
        email: 'a.steiner@seetal-immo.ch',
        isPrimary: true,
      },
    ],
  },
  {
    partnerNumber: 'KD-1063',
    partnerType: 'ORGANISATION',
    isCustomer: true,
    name: 'Gemeinde Wangen',
    legalForm: 'VEREIN',
    email: 'liegenschaften@wangen.ch',
    phone: '+41 32 677 40 00',
    paymentTerm: '60',
    priceGroup: 'ENGROS',
    address: {
      label: 'Werkdienst',
      name: 'Gemeinde Wangen, Werkdienst',
      street: 'Dorfplatz',
      buildingNumber: '1',
      postalCode: '3380',
      town: 'Wangen an der Aare',
      useAsDefault: true,
      usages: ['OFFER', 'ORDER', 'DELIVERY_NOTE', 'INVOICE'],
    },
    contacts: [
      {
        salutation: 'HERR',
        firstName: 'Beat',
        lastName: 'Hofer',
        jobTitle: 'Leiter Werkdienst',
        email: 'b.hofer@wangen.ch',
        isPrimary: true,
      },
    ],
  },
  {
    partnerNumber: 'KD-1071',
    partnerType: 'PERSON',
    isCustomer: true,
    name: 'Claudia Rüegg',
    salutation: 'FRAU',
    firstName: 'Claudia',
    lastName: 'Rüegg',
    email: 'c.rueegg@bluewin.ch',
    phone: '+41 79 330 21 45',
    paymentTerm: '30',
    priceGroup: 'DETAIL',
    address: {
      label: 'Privat',
      name: 'Claudia Rüegg',
      street: 'Rebbergweg',
      buildingNumber: '8a',
      postalCode: '8320',
      town: 'Fehraltorf',
      useAsDefault: true,
      usages: ['OFFER', 'DELIVERY_NOTE', 'INVOICE'],
    },
    contacts: [],
  },
  {
    partnerNumber: 'KD-1082',
    partnerType: 'PERSON',
    isCustomer: true,
    name: 'Jean-Pierre Dubois',
    salutation: 'HERR',
    firstName: 'Jean-Pierre',
    lastName: 'Dubois',
    language: 'fr',
    email: 'jp.dubois@sunrise.ch',
    phone: '+41 78 640 15 22',
    priceGroup: 'DETAIL',
    address: {
      label: 'Domicile',
      name: 'Jean-Pierre Dubois',
      street: 'Route de Berne',
      buildingNumber: '17',
      postalCode: '1010',
      town: 'Lausanne',
      useAsDefault: true,
      usages: ['OFFER', 'INVOICE'],
    },
    contacts: [],
  },
  {
    partnerNumber: 'LF-2001',
    partnerType: 'ORGANISATION',
    isCustomer: false,
    isSupplier: true,
    name: 'Thermotech Systems AG',
    legalForm: 'AG',
    uid: 'CHE-506.070.800',
    email: 'bestellung@thermotech.ch',
    phone: '+41 71 388 90 00',
    website: 'https://thermotech.ch',
    paymentTerm: '30',
    creditorReference: 'WEBUX-4471',
    address: {
      label: 'Lieferwerk',
      name: 'Thermotech Systems AG',
      street: 'Zürcherstrasse',
      buildingNumber: '180',
      postalCode: '9500',
      town: 'Wil',
      useAsDefault: true,
      usages: ['ORDER', 'INVOICE'],
    },
    contacts: [
      {
        salutation: 'FRAU',
        firstName: 'Eveline',
        lastName: 'Graf',
        jobTitle: 'Key Account',
        email: 'e.graf@thermotech.ch',
        isPrimary: true,
      },
    ],
  },
  {
    partnerNumber: 'LF-2008',
    partnerType: 'ORGANISATION',
    isCustomer: false,
    isSupplier: true,
    name: 'Elektro Baumann GmbH',
    legalForm: 'GMBH',
    uid: 'CHE-617.283.944',
    email: 'info@elektro-baumann.ch',
    phone: '+41 56 444 12 30',
    paymentTerm: '30_2_10',
    creditorReference: 'K-8890',
    address: {
      label: 'Hauptsitz',
      name: 'Elektro Baumann GmbH',
      street: 'Bruggerstrasse',
      buildingNumber: '62',
      postalCode: '5400',
      town: 'Baden',
      useAsDefault: true,
      usages: ['ORDER', 'INVOICE'],
    },
    contacts: [],
  },
  {
    partnerNumber: 'PA-3001',
    partnerType: 'ORGANISATION',
    isCustomer: true,
    isSupplier: true,
    name: 'Helvetia Logistik AG',
    legalForm: 'AG',
    uid: 'CHE-778.899.000',
    email: 'disposition@helvetia-logistik.ch',
    phone: '+41 62 869 33 00',
    paymentTerm: '30',
    creditLimit: 75000,
    priceGroup: 'ENGROS',
    creditorReference: 'HL-2291',
    address: {
      label: 'Umschlagplatz',
      name: 'Helvetia Logistik AG',
      street: 'Logistikpark',
      buildingNumber: '4',
      postalCode: '4600',
      town: 'Olten',
      useAsDefault: true,
      usages: ['OFFER', 'ORDER', 'DELIVERY_NOTE', 'INVOICE'],
    },
    contacts: [
      {
        salutation: 'HERR',
        firstName: 'Sven',
        lastName: 'Aebi',
        jobTitle: 'Disposition',
        email: 's.aebi@helvetia-logistik.ch',
        phone: '+41 62 869 33 12',
        isPrimary: true,
      },
    ],
  },
]

/**
 * Products and services of tenant WEBUX.
 * `basePrice`, `retail` and `wholesale` become price rows: the first without a price group,
 * the other two for DETAIL and ENGROS. None of them is limited to a period here.
 */
const PRODUCTS = [
  {
    productNumber: 'AR-4821',
    productType: 'GOODS',
    name: 'Wärmepumpe WP-450',
    description: 'Luft-Wasser-Wärmepumpe, 9 kW, inkl. Regelung und Fühlerset.',
    unit: 'PIECE',
    vatCategory: 'STANDARD',
    basePrice: 12400,
    retail: 13400,
    wholesale: 11150,
  },
  {
    productNumber: 'AR-4835',
    productType: 'GOODS',
    name: 'Pufferspeicher 500 l',
    description: 'Emaillierter Pufferspeicher mit 100 mm Isolation.',
    unit: 'PIECE',
    vatCategory: 'STANDARD',
    basePrice: 1890,
    retail: 2050,
    wholesale: 1690,
  },
  {
    productNumber: 'AR-4902',
    productType: 'GOODS',
    name: 'Umwälzpumpe Hocheffizienz DN25',
    unit: 'PIECE',
    vatCategory: 'STANDARD',
    basePrice: 340,
    retail: 385,
    wholesale: 298,
  },
  {
    productNumber: 'AR-5110',
    productType: 'GOODS',
    name: 'Isolationsmatte Mineralwolle',
    description: 'Rolle à 10 m², Dicke 40 mm.',
    unit: 'SQUARE_METRE',
    vatCategory: 'STANDARD',
    basePrice: 18.5,
    retail: 22.9,
    wholesale: 16.4,
  },
  {
    productNumber: 'AR-5240',
    productType: 'GOODS',
    name: 'Kupferrohr 22 mm',
    unit: 'METRE',
    vatCategory: 'STANDARD',
    basePrice: 14.8,
    retail: 18.5,
    wholesale: 12.9,
  },
  {
    productNumber: 'AR-5301',
    productType: 'GOODS',
    name: 'Wärmeträgerflüssigkeit Glykol',
    unit: 'LITRE',
    vatCategory: 'STANDARD',
    basePrice: 6.4,
    retail: 8.9,
    wholesale: 5.6,
  },
  {
    productNumber: 'AR-5420',
    productType: 'GOODS',
    name: 'Smart-Thermostat Raumregler',
    unit: 'PIECE',
    vatCategory: 'STANDARD',
    basePrice: 189,
    retail: 229,
    wholesale: 164,
  },
  {
    productNumber: 'DL-1001',
    productType: 'SERVICE',
    name: 'Montage Heizungsanlage',
    description: 'Monteurstunde, Werktage 07:00-17:00.',
    unit: 'HOUR',
    vatCategory: 'STANDARD',
    basePrice: 118,
    retail: 132,
    wholesale: 106,
  },
  {
    productNumber: 'DL-1002',
    productType: 'SERVICE',
    name: 'Inbetriebnahme und Einregulierung',
    unit: 'FLAT_RATE',
    vatCategory: 'STANDARD',
    basePrice: 890,
    retail: 950,
    wholesale: 790,
  },
  {
    productNumber: 'DL-1003',
    productType: 'SERVICE',
    name: 'Planung und Projektierung',
    unit: 'HOUR',
    vatCategory: 'STANDARD',
    basePrice: 165,
    retail: 180,
    wholesale: 148,
  },
  {
    productNumber: 'DL-1004',
    productType: 'SERVICE',
    name: 'Notfall-Pikettdienst',
    description: 'Einsatz ausserhalb der Bürozeiten, Anfahrt inklusive.',
    unit: 'HOUR',
    vatCategory: 'STANDARD',
    basePrice: 215,
    retail: 240,
    wholesale: 195,
  },
  {
    productNumber: 'AB-2001',
    productType: 'SERVICE',
    name: 'Servicevertrag Wärmepumpe',
    description: 'Jährliche Wartung, Ferndiagnose und Priorisierung im Störungsfall.',
    unit: 'YEAR',
    vatCategory: 'STANDARD',
    basePrice: 480,
    retail: 540,
    wholesale: 420,
  },
  {
    productNumber: 'AB-2002',
    productType: 'SERVICE',
    name: 'Monitoring-Abo Anlagendaten',
    unit: 'MONTH',
    vatCategory: 'STANDARD',
    basePrice: 29,
    retail: 35,
    wholesale: 24,
  },
  {
    productNumber: 'DL-1101',
    productType: 'SERVICE',
    name: 'Schulung Anlagenbedienung',
    description: 'Ausbildung im Sinne von MWSTG Art. 21, von der Steuer ausgenommen.',
    unit: 'DAY',
    vatCategory: 'EXEMPT_WITHOUT_CREDIT',
    basePrice: 1250,
  },
  {
    productNumber: 'AR-6001',
    productType: 'GOODS',
    name: 'Ersatzteilpaket Export',
    description: 'Ausfuhrlieferung nach MWSTG Art. 23, von der Steuer befreit.',
    unit: 'PIECE',
    vatCategory: 'EXEMPT_WITH_CREDIT',
    basePrice: 760,
  },
  {
    productNumber: 'AR-6100',
    productType: 'GOODS',
    name: 'Handbuch Heizungstechnik',
    description: 'Fachbuch, reduzierter Satz.',
    unit: 'PIECE',
    vatCategory: 'REDUCED',
    basePrice: 64,
    retail: 78,
    wholesale: 58,
  },
]

/**
 * Individually agreed customer prices: product number, minimum quantity, price, and an
 * optional period. The last entry is a campaign, so the mask shows a dated row as well.
 */
const PARTNER_PRICES = [
  { partnerNumber: 'KD-1001', productNumber: 'AR-4821', minQuantity: 1, price: 10900 },
  { partnerNumber: 'KD-1001', productNumber: 'AR-4821', minQuantity: 5, price: 10400 },
  { partnerNumber: 'KD-1001', productNumber: 'DL-1001', minQuantity: 1, price: 98 },
  { partnerNumber: 'KD-1058', productNumber: 'AB-2001', minQuantity: 1, price: 390 },
  { partnerNumber: 'PA-3001', productNumber: 'AR-5240', minQuantity: 100, price: 11.4 },
  {
    partnerNumber: 'KD-1058',
    productNumber: 'AR-4902',
    minQuantity: 1,
    price: 279,
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
  },
]

/** Partners of the second tenant. Deliberately few, so the two tenants look different. */
const NORD_PARTNERS = [
  {
    partnerNumber: 'KD-100',
    partnerType: 'ORGANISATION',
    isCustomer: true,
    name: 'Bergquell Getränke AG',
    legalForm: 'AG',
    uid: 'CHE-135.711.131',
    email: 'einkauf@bergquell.ch',
    paymentTerm: '30_2_10',
    address: {
      label: 'Hauptsitz',
      name: 'Bergquell Getränke AG',
      street: 'Quellenstrasse',
      buildingNumber: '3',
      postalCode: '7000',
      town: 'Chur',
      useAsDefault: true,
      usages: ['OFFER', 'ORDER', 'INVOICE'],
    },
    contacts: [],
  },
  {
    partnerNumber: 'KD-104',
    partnerType: 'PERSON',
    isCustomer: true,
    name: 'Marc Widmer',
    salutation: 'HERR',
    firstName: 'Marc',
    lastName: 'Widmer',
    email: 'm.widmer@gmail.com',
    address: {
      label: 'Privat',
      name: 'Marc Widmer',
      street: 'Alpenblick',
      buildingNumber: '5',
      postalCode: '6045',
      town: 'Meggen',
      useAsDefault: true,
      usages: ['INVOICE'],
    },
    contacts: [],
  },
]

const NORD_PRODUCTS = [
  {
    productNumber: 'HW-100',
    productType: 'GOODS',
    name: 'Mineralwasser Kiste 12 × 1 l',
    unit: 'PIECE',
    vatCategory: 'REDUCED',
    basePrice: 14.4,
  },
  {
    productNumber: 'HW-120',
    productType: 'GOODS',
    name: 'Bergkräutertee 100 g',
    unit: 'PIECE',
    vatCategory: 'REDUCED',
    basePrice: 9.8,
  },
  {
    productNumber: 'DL-500',
    productType: 'SERVICE',
    name: 'Lieferung und Rüstung',
    unit: 'FLAT_RATE',
    vatCategory: 'STANDARD',
    basePrice: 45,
  },
]

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const log = (message) => console.log(message)
const step = (message) => console.log(`\n▸ ${message}`)

/** Creates a tenant and configures its number ranges. */
async function createTenant(definition) {
  const tenant = await post('/api/tenants', definition)
  log(`  Tenant ${tenant.code}: ${tenant.name} (id ${tenant.id})`)
  for (const range of NUMBER_RANGES) {
    const stored = await put(
      `/api/tenants/${tenant.id}/number-ranges/${range.documentType}/${FISCAL_YEAR}`,
      { prefix: range.prefix, padding: range.padding },
    )
    log(`    Number range ${range.documentType.padEnd(3)} → ${stored.nextDocumentNumber}`)
  }
  return tenant
}

/** Creates a partner together with its address, contacts and price group. */
async function createPartner(tenantId, definition, priceGroupsByCode) {
  const { address, contacts, priceGroup, ...master } = definition
  const partner = await post(`/api/tenants/${tenantId}/partners`, {
    ...master,
    // The language is a value of the tenant's LANGUAGE list, so it is the bare code and not
    // a BCP-47 tag with a region: 'de', not 'de-CH'.
    language: master.language ?? 'de',
    isSupplier: master.isSupplier ?? false,
  })
  if (address) {
    await post(`/api/tenants/${tenantId}/partners/${partner.id}/addresses`, {
      country: 'CH',
      ...address,
    })
  }
  for (const contact of contacts ?? []) {
    await post(`/api/tenants/${tenantId}/partners/${partner.id}/contacts`, contact)
  }
  if (priceGroup && priceGroupsByCode.has(priceGroup)) {
    await put(
      `/api/tenants/${tenantId}/partners/${partner.id}/price-group/${priceGroupsByCode.get(priceGroup)}`,
    )
  }
  log(`  ${(partner.partnerNumber ?? '-').padEnd(9)} ${partner.name}`)
  return partner
}

/** Creates a product and sets its prices, base price and group prices in one request. */
async function createProduct(tenantId, definition, priceGroupsByCode) {
  const { retail, wholesale, basePrice, ...master } = definition
  const product = await post(`/api/tenants/${tenantId}/products`, master)

  const prices = []
  if (basePrice !== undefined) prices.push({ price: basePrice })
  for (const [code, price] of [
    ['DETAIL', retail],
    ['ENGROS', wholesale],
  ]) {
    if (price === undefined || !priceGroupsByCode.has(code)) continue
    prices.push({ priceGroupId: priceGroupsByCode.get(code), price })
  }
  if (prices.length > 0) {
    await put(`/api/tenants/${tenantId}/products/${product.id}/prices`, { prices })
  }

  log(`  ${(product.productNumber ?? '-').padEnd(9)} ${product.name}`)
  return product
}

async function main() {
  step(`Signing in at ${API}`)
  const me = await post('/api/auth/login', { username: ADMIN_USER, password: ADMIN_PASSWORD })
  if (!me.superuser) throw new Error(`${ADMIN_USER} is not a superuser, seeding is not possible`)
  log(`  Signed in as ${me.username} (superuser)`)

  const existing = await get('/api/tenants')
  if (existing.length > 0) {
    log(
      `\n✖ There are already ${existing.length} tenants (${existing.map((t) => t.code).join(', ')}).` +
        '\n  Seeding expects an empty database. Recreate it and try again:' +
        '\n    docker compose down -v   (in the backend directory)',
    )
    process.exitCode = 1
    return
  }

  step('Tenants and number ranges')
  const tenants = new Map()
  for (const definition of TENANTS) {
    tenants.set(definition.code, await createTenant(definition))
  }

  // Roles and price groups are created by listeners on TenantCreatedEvent. That runs
  // asynchronously, so wait for them instead of assuming they are already there.
  step('Waiting for the default roles and price groups')
  const rolesByTenant = new Map()
  const priceGroupsByTenant = new Map()
  for (const [code, tenant] of tenants) {
    const roles = await waitFor(() => get(`/api/tenants/${tenant.id}/roles`), (list) => list.length > 0)
    const priceGroups = await waitFor(
      () => get(`/api/tenants/${tenant.id}/price-groups`),
      (list) => list.length > 0,
    )
    rolesByTenant.set(code, new Map(roles.map((role) => [role.name, role.id])))
    priceGroupsByTenant.set(code, new Map(priceGroups.map((group) => [group.code, group.id])))
    log(`  ${code}: ${roles.map((r) => r.name).join(', ')} · price groups ${priceGroups.map((g) => g.code).join(', ')}`)
  }

  step('Users')
  for (const definition of USERS) {
    const user = await post('/api/users', {
      username: definition.username,
      email: definition.email,
      password: DEMO_PASSWORD,
      displayName: definition.displayName,
      language: 'de-CH',
    })
    const home = tenants.get(definition.tenantCode)
    await post(`/api/users/${user.id}/tenants/${home.id}?isDefault=true`)
    const roleId = rolesByTenant.get(definition.tenantCode).get(definition.role)
    await put(`/api/users/${user.id}/tenants/${home.id}/roles`, [roleId])
    for (const code of definition.alsoIn ?? []) {
      const other = tenants.get(code)
      await post(`/api/users/${user.id}/tenants/${other.id}`)
      await put(`/api/users/${user.id}/tenants/${other.id}/roles`, [
        rolesByTenant.get(code).get('Administrator'),
      ])
    }
    log(`  ${definition.username.padEnd(9)} ${definition.displayName}: ${definition.role}`)
  }

  const webux = tenants.get('WEBUX')
  const webuxGroups = priceGroupsByTenant.get('WEBUX')

  step(`Business partners: ${webux.name}`)
  const partnersByNumber = new Map()
  for (const definition of PARTNERS) {
    const partner = await createPartner(webux.id, definition, webuxGroups)
    partnersByNumber.set(definition.partnerNumber, partner)
  }

  step(`Products and services: ${webux.name}`)
  const productsByNumber = new Map()
  for (const definition of PRODUCTS) {
    const product = await createProduct(webux.id, definition, webuxGroups)
    productsByNumber.set(definition.productNumber, product)
  }

  step('Individually agreed customer prices')
  for (const price of PARTNER_PRICES) {
    const partner = partnersByNumber.get(price.partnerNumber)
    const product = productsByNumber.get(price.productNumber)
    await put(`/api/tenants/${webux.id}/partners/${partner.id}/prices`, {
      productId: product.id,
      minQuantity: price.minQuantity,
      validFrom: price.validFrom,
      validTo: price.validTo,
      price: price.price,
    })
    log(`  ${partner.name} · ${product.name} from ${price.minQuantity} → ${price.price}`)
  }

  const nord = tenants.get('NORD')
  const nordGroups = priceGroupsByTenant.get('NORD')

  step(`Business partners: ${nord.name}`)
  for (const definition of NORD_PARTNERS) {
    await createPartner(nord.id, definition, nordGroups)
  }

  step(`Products: ${nord.name}`)
  for (const definition of NORD_PRODUCTS) {
    await createProduct(nord.id, definition, nordGroups)
  }

  step('Done')
  log(`  ${TENANTS.length} tenants, ${USERS.length + 1} users, ` +
    `${PARTNERS.length + NORD_PARTNERS.length} partners, ${PRODUCTS.length + NORD_PRODUCTS.length} products`)
  log('\n  Sign in with:')
  log(`    ${ADMIN_USER.padEnd(9)} / ${ADMIN_PASSWORD}   (superuser, every tenant)`)
  for (const definition of USERS) {
    log(`    ${definition.username.padEnd(9)} / ${DEMO_PASSWORD}   (${definition.role})`)
  }
}

/** Polls an endpoint until the condition holds, for state that arrives through an event. */
async function waitFor(fetcher, predicate, attempts = 25, delayMs = 200) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const value = await fetcher()
    if (predicate(value)) return value
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  throw new Error('The expected state never arrived (timeout)')
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}`)
  process.exitCode = 1
})
