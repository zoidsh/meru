// The words the verification-code extractor reads, as data: what each list
// means is below, and how the extractor weighs them is its own. Sources are
// regular-expression sources, case-insensitive, read on text whose digits are
// already ASCII. Adding a language is entries here and fixtures in the
// corpus.

/**
 * How an entry is bounded, where "bounded" means not touching a letter or a
 * digit of any script (`\b` knows only ASCII, so it cannot bound "mã"):
 * - `word`: on both sides;
 * - `start`: before it only, so a suffixed form such as Turkish "kodunuz" matches;
 * - `end`: after it only, so a German compound such as "Bestätigungscode" matches;
 * - `none`: not at all, for scripts written without spaces.
 */
export type Anchor = "word" | "start" | "end" | "none";

export interface LexiconEntry {
  source: string;
  anchor: Anchor;
}

const entry = (source: string, anchor: Anchor = "word"): LexiconEntry => ({
  source,
  anchor,
});

/**
 * Words that name a one-time code. A PIN on its own is a standing one (a
 * card's, a door's, a meeting's), so only a one-time or sign-in PIN counts.
 * `kod`, `kode` and `koodi` are anchored at each end in turn, for suffixed
 * forms ("kodunuz", "kódu") and compounds ("verifieringskod", "engangskode",
 * "vahvistuskoodi") alike. A TAN is a bank's one-time code.
 */
export const CODE_WORDS: readonly LexiconEntry[] = [
  entry("code", "end"),
  entry("k[oó]d", "start"),
  entry("k[oó]de?", "end"),
  entry("c[oó]digo"),
  entry("codice"),
  entry("koodi", "start"),
  entry("koodi", "end"),
  entry("mã"),
  entry("otp"),
  entry("(?:m|sms|push|chip|photo|app)?tan"),
  entry(String.raw`one[-\s]?time\s?password`),
  entry("ワンタイムパスワード", "none"),
  entry("passcode"),
  entry(
    String.raw`(?:one[-\s]?time|verification|log[-\s]?in|sign[-\s]?in)\s+pin`
  ),
  entry("2fa"),
  entry("код", "none"),
  entry("कोड", "none"),
  entry("コード", "none"),
  entry("验证码", "none"),
  entry("驗證碼", "none"),
  entry(String.raw`인증번호|인증\s?코드|코드`, "none"),
  entry("رمز", "none"),
  entry("קוד", "none"),
];

/** Words of signing in and verifying, which make a code more likely. */
export const CONTEXT_WORDS: readonly LexiconEntry[] = [
  entry("v[eé]rif", "start"),
  entry("confirm", "start"),
  entry("best[äa]tigung", "start"),
  entry("weryfikacj", "start"),
  entry("do[ğg]rulama", "start"),
  entry(String.raw`one[-\s]?time`),
  entry(String.raw`single[-\s]?use`),
  entry(String.raw`sign[-\s]?(?:in|up)`),
  entry(String.raw`log[-\s]?in`),
  entry("security"),
  entry("authentic", "start"),
  entry(String.raw`two[-\s]?factor`),
  entry(String.raw`password\s+reset|reset\s+(?:the\s+|your\s+)?password`),
  entry("passwort", "start"),
  entry("x[áa]c minh", "start"),
  entry("подтвержд", "none"),
  entry("認証", "none"),
  entry("確認", "none"),
  entry("验证|驗證", "none"),
  entry("인증", "none"),
  entry("تحقق", "none"),
  entry("אימות", "none"),
];

/**
 * Words of deliveries. A delivery code is read aloud at the door, so it is
 * out of scope, but a sign-in code can come in mail that mentions shipping.
 */
export const DELIVERY_WORDS: readonly LexiconEntry[] = [
  entry("deliver", "start"),
  entry(String.raw`pick[-\s]?up`),
  entry("collect", "start"),
  entry("ship", "start"),
  entry("track", "start"),
  entry("courier"),
  entry("driver"),
  entry("parcel", "start"),
  entry("packstation"),
  entry("locker", "start"),
  entry("counter"),
  entry("dispatch", "start"),
  entry("liefer", "start"),
  entry("zustell", "start"),
  entry("livrais", "start"),
  entry("colis"),
  entry("retrait"),
  entry("relais"),
  entry("entrega", "start"),
  entry("paquete", "start"),
  entry("recogida", "start"),
  entry("consegna", "start"),
  entry("pacc[oh]i?"),
  entry("ritiro"),
  entry("spedizion", "start"),
  entry("pacote", "start"),
  entry("dostaw", "start"),
  entry("paczk", "start"),
  entry("paczkomat", "start"),
  entry("odbi[oó]r", "start"),
  entry("pakket", "start"),
  entry("af(?:haal|halen)", "start"),
  entry("op(?:haal|halen)", "start"),
  entry("teslim", "start"),
  entry("доставк", "none"),
  entry("выдач", "start"),
  entry("получени", "start"),
  entry("配送|配達", "none"),
  entry("快递|快遞", "none"),
  entry("배송", "none"),
];

/** Words of discounts and shopping, whose numeric codes look like sign-in ones. */
export const PROMO_WORDS: readonly LexiconEntry[] = [
  entry(String.raw`\d\s?%|percent\s?off`, "none"),
  entry("sparen"),
  entry("ahorra", "start"),
  entry("discount", "start"),
  entry("promo", "start"),
  entry("referral", "start"),
  entry("coupon", "start"),
  entry("voucher", "start"),
  entry("checkout"),
  entry("spend"),
  entry("redeem", "start"),
  entry("rabatt", "start"),
  entry("gutschein", "start"),
  entry("r[ée]duction", "start"),
  entry("descuento", "start"),
  entry("desconto", "start"),
  entry("sconto", "start"),
  entry("скидк", "none"),
  entry("折扣|优惠|優惠", "none"),
  entry("割引|クーポン", "none"),
  entry("할인|쿠폰", "none"),
];

/** Words of orders, whose numbers sit beside a code they are not. */
export const ORDER_WORDS: readonly LexiconEntry[] = [
  entry("order", "start"),
  entry("bestell", "start"),
  entry("commande", "start"),
  entry("pedido", "start"),
  entry("encomenda", "start"),
  entry("ordine"),
  entry("zam[oó]wieni", "start"),
  entry("sipari[şs]", "start"),
  entry("заказ", "none"),
  entry("注文|订单|訂單", "none"),
  entry("주문", "none"),
];

/**
 * Words of codes that stand rather than expire: a meeting's passcode, a
 * class's join code, a door's or a gate's, a club's or a gym's check-in. They
 * are typed at a keypad or a phone, or kept, never pasted once into a sign-in.
 */
export const STANDING_WORDS: readonly LexiconEntry[] = [
  entry("meeting", "start"),
  entry("invitation"),
  entry("webinar"),
  entry(String.raw`dial[-\s]?in`),
  entry("conferences?"),
  entry(String.raw`zoom\.us`),
  entry("class(?:room)?"),
  entry("door"),
  entry("gate"),
  entry("garage"),
  entry("keypad"),
  entry("club"),
  entry("gym"),
  entry(String.raw`check[-\s]?in`),
];

/**
 * Kinds of code that are never pasted into a website, written right before a
 * code word ("discount code", "exit code", "locker PIN"), the German ones
 * also as the start of a compound ("Rabattcode", "Abholcode").
 */
export const OTHER_KINDS_BEFORE: readonly string[] = [
  "discount",
  "promo(?:tional)?",
  "referral",
  "coupon",
  "voucher",
  "gift",
  "invite",
  "post(?:al)?",
  "zip",
  "area",
  "dress",
  "qr",
  "error",
  "exit",
  "status",
  "return",
  "response",
  "country",
  "bar",
  "tracking",
  "delivery",
  String.raw`pick[\s-]?up`,
  "collection",
  "locker",
  "parcel",
  "package",
  "order",
  "abhol",
  "liefer",
  "paket",
  "afhaal",
  "ophaal",
  "pakket",
  String.raw`check[\s-]?in`,
  "club",
  "gym",
  "rabatt",
  "gutschein",
  "werbe",
  "aktions",
  "empfehlungs",
  "geschenk",
  "промо",
  "ticket",
  "reference",
  "ref",
  "customer",
  "client",
  "account",
  "member",
  "product",
  "sort",
  "tax",
  "vat",
  "tariff",
  "class",
  "door",
  "gate",
  "garage",
  "meeting",
  "source",
  "clean",
];

/**
 * The same, in languages that write the kind after the code word: Polish "kod
 * zamówienia", Spanish "código del pedido", French "code de commande". English
 * puts a program's source here: "code review", "code of conduct".
 */
export const OTHER_KINDS_AFTER: readonly string[] = [
  "review",
  "freeze",
  "coverage",
  "walkthrough",
  "conduct",
  "practice",
  "rastreio",
  "rastreamento",
  "seguimiento",
  "suivi",
  "retrait",
  "livraison",
  "recogida",
  "entrega",
  "ritiro",
  "consegna",
  "retirada",
  String.raw`odbi[oó]r\p{L}*`,
  String.raw`получени\p{L}*`,
  String.raw`выдач\p{L}*`,
  String.raw`доставк\p{L}*`,
  String.raw`zam[oó]wieni\p{L}*`,
  "pedido",
  "commande",
  "ordine",
  "encomenda",
  String.raw`заказ\p{L}*`,
  String.raw`promo\p{L}*`,
  String.raw`rabat\p{L}*`,
  "descuento",
  "r[ée]duction",
  "postal",
];

/**
 * Words a number follows that is not a code, directly or through a number word
 * from `NUMBER_WORDS` ("account number", "VAT no.", "注文番号"): orders,
 * invoices, tickets, flights, accounts, tax numbers, card endings, the
 * references of software (pull requests, issues, builds, releases, incidents)
 * and of places (rooms, sections, servers).
 */
export const REFERENCE_WORDS: readonly string[] = [
  "pr",
  "issue",
  "build",
  "job",
  "runner",
  "release",
  "version",
  "deployment",
  "incident",
  "alert",
  "case",
  "sku",
  "document",
  "meter",
  "id",
  "room",
  "section",
  "server",
  "host",
  "line",
  "seat",
  "booking",
  String.raw`ending(?:\s+in)?`,
  "order",
  "invoice",
  "receipt",
  "tracking",
  "shipment",
  "ticket",
  "reference",
  String.raw`ref\.?`,
  "transaction",
  "flight",
  String.raw`confirmation\s+number`,
  String.raw`bestell\p{L}*`,
  String.raw`auftrag\p{L}*`,
  String.raw`rechnung\p{L}*`,
  String.raw`sendungs\p{L}*`,
  "commande",
  "facture",
  "pedido",
  "encomenda",
  "factura",
  "fatura",
  "ordine",
  "fattura",
  String.raw`zam[oó]wieni\p{L}*`,
  String.raw`sipari[şs]\p{L}*`,
  String.raw`заказ\p{L}*`,
  "注文",
  "订单",
  "訂單",
  "주문",
  "الطلب",
  "הזמנה",
  "account",
  "acct",
  "customer",
  "client",
  String.raw`member(?:ship)?`,
  "policy",
  "vat",
  "tax",
  "card",
];

/** Words that stand between a reference word and its number. */
export const NUMBER_WORDS: readonly string[] = [
  "number",
  String.raw`no\.?`,
  String.raw`nr\.?`,
  "n[°º]",
  "№",
  "#",
  ":",
  "nummer",
  "num[ée]ro",
  "n[úu]mero",
  "numer",
  "номер",
  "番号",
  "号",
  "번호",
  "رقم",
];

/**
 * Words a phone number follows. "Phone" alone is not one: "enter this code on
 * your phone: 492018" is a code.
 */
export const PHONE_WORDS: readonly string[] = [
  "call",
  "tel",
  "telephone",
  String.raw`dial(?:-in)?`,
  "helpline",
  "hotline",
  "fax",
  String.raw`phone\s+number`,
];

/** Words a time of day follows, as in "at 1700". */
export const TIME_BEFORE: readonly string[] = [
  "at",
  "from",
  "until",
  "till",
  "before",
  "after",
  "um",
  "à",
  "a las",
];

/** Words a time of day comes before, as in "1700 UTC". */
export const TIME_AFTER: readonly string[] = [
  "utc",
  "gmt",
  "cet",
  "cest",
  "hrs?",
  "h",
  "uhr",
];

/** Currencies a price is written beside, as symbols or codes. */
export const CURRENCIES: readonly string[] = [
  "[$€£¥₹₽₩₺₫₪]",
  "usd",
  "eur",
  "gbp",
  "chf",
  "jpy",
  "cny",
  "pln",
  "rub",
  "inr",
  "krw",
  "aud",
  "cad",
  String.raw`rs\.?`,
  "zł",
  "kr",
  "tl",
  "руб",
  "元",
  "円",
  "원",
];

/**
 * What a number before one of these counts, so it is an amount, not a code.
 * Matched in lower case only, so that "482910 Times are in UTC" still reads the
 * capital as the start of a sentence.
 */
export const UNITS: readonly string[] = [
  "messages?",
  "emails?",
  "requests?",
  "events?",
  "errors?",
  "alerts?",
  "readers?",
  "subscribers?",
  "features?",
  "orders?",
  "votes?",
  "likes?",
  "comments?",
  "results?",
  "bytes?",
  "kwh",
  "kWh",
  "points?",
  "lines?",
  "users?",
  "people",
  "developers?",
  "customers?",
  "members?",
  "followers?",
  "words?",
  "steps?",
  "items?",
  "files?",
  "seconds?",
  "minutes?",
  "hours?",
  "days?",
  "weeks?",
  "months?",
  "years?",
  "miles?",
  "km",
  "kg",
  "times",
  "stars?",
  "views?",
  "downloads?",
  "credits?",
  "coins?",
  "punkte",
  "puntos",
];

/** Words a count may put between its number and its unit: "4829 unread messages". */
export const UNIT_ADJECTIVES: readonly string[] = [
  "new",
  "unread",
  "active",
  "more",
  "other",
  "total",
];
