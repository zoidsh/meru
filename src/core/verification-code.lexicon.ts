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
 * Words that name a one-time code. `pin` is a whole word so that it never
 * matches inside "shipping".
 */
export const CODE_WORDS: readonly LexiconEntry[] = [
  entry("code", "end"),
  entry("kod", "start"),
  entry("c[oó]digo"),
  entry("codice"),
  entry("koodi"),
  entry("mã"),
  entry("otp"),
  entry(String.raw`one[-\s]?time\s?password`),
  entry("passcode"),
  entry("pin"),
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
  entry("dispatch", "start"),
  entry("liefer", "start"),
  entry("zustell", "start"),
  entry("livrais", "start"),
  entry("entrega", "start"),
  entry("consegna", "start"),
  entry("dostaw", "start"),
  entry("teslim", "start"),
  entry("доставк", "none"),
  entry("配送|配達", "none"),
  entry("快递|快遞", "none"),
  entry("배송", "none"),
];

/** Words of discounts and shopping, whose numeric codes look like sign-in ones. */
export const PROMO_WORDS: readonly LexiconEntry[] = [
  entry(String.raw`\d\s?%\s?off|percent\s?off`, "none"),
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
  "rabatt",
  "gutschein",
  "werbe",
  "aktions",
  "empfehlungs",
  "geschenk",
];

/**
 * The same, in languages that write the kind after the code word: Polish "kod
 * zamówienia", Spanish "código del pedido", French "code de commande".
 */
export const OTHER_KINDS_AFTER: readonly string[] = [
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
 * Words a number follows that is not a code: orders, invoices, tickets,
 * flights, and accounts and tax numbers when a number word follows them
 * ("account number", "VAT no.").
 */
export const REFERENCE_WORDS: readonly string[] = [
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

/** What a number before one of these counts, so it is an amount, not a code. */
export const UNITS: readonly string[] = [
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
