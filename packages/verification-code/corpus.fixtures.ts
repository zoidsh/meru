// Labeled corpus for the verification-code extractor.
//
// Every entry is a synthetic message modeled on a well-known sender template —
// no real mail, no real people. The extractor sees exactly what the Gmail Atom
// feed gives us: the `subject` and `summary`, a truncated body snippet that is
// usually under ~180 characters and is often cut mid-sentence.
//
// `expected` is the code the extractor must return, digits only with separators
// stripped, or `null` when it must return nothing. The extractor's actions are
// destructive — it can copy, mark read, and delete — so precision beats recall:
// every `null` entry is a guardrail, and the tuning target is zero false
// positives across the negatives before maximizing extracted positives.

export interface CorpusEntry {
  subject: string;
  summary: string;
  expected: string | null;
  language: string;
  note?: string;
}

export const corpus: CorpusEntry[] = [
  // ---------------------------------------------------------------------------
  // Positives — English
  // ---------------------------------------------------------------------------
  {
    subject: "123456 is your verification code",
    summary:
      "Someone requested a verification code for your account. If this wasn't you, don't share this code with anyone.",
    expected: "123456",
    language: "en",
    note: "code in the subject only, the snippet repeats the keyword without digits",
  },
  {
    subject: "Verification code for your account",
    summary: "Your verification code is: 490321. Do not share it with anyone.",
    expected: "490321",
    language: "en",
  },
  {
    subject: "Account security code",
    summary:
      "Please use this security code to finish signing in on your new device. Security code: 7482910",
    expected: "7482910",
    language: "en",
    note: "7 solid digits — currently unextractable, licensed at a low format prior",
  },
  {
    subject: "Please verify your device",
    summary: "Verification code: 483921. This code expires in 15 minutes.",
    expected: "483921",
    language: "en",
  },
  {
    subject: "Sign-in attempt from a new device",
    summary: "To verify your identity, enter the one-time password: 940213",
    expected: "940213",
    language: "en",
    note: "keyword is OTP-shaped, the word code never appears",
  },
  {
    subject: "Your one-time passcode",
    summary: "Use passcode 493 021 to authorize your transfer. Never share this code.",
    expected: "493021",
    language: "en",
    note: "grouped 3-3 with a space separator",
  },
  {
    subject: "Messenger code 402-136",
    summary: "Your messenger code: 402-136. Don't share this code with others.",
    expected: "402136",
    language: "en",
    note: "grouped 3-3 with a hyphen separator, present in both strings",
  },
  {
    subject: "Login code",
    summary:
      "Your login code: 74102. Enter it in the app. Do not give this code to anyone, even if they say they are from support.",
    expected: "74102",
    language: "en",
    note: "5 solid digits — currently unextractable",
  },
  {
    subject: "Your verification code",
    summary: "Enter the code 40391827 to finish setting up your account.",
    expected: "40391827",
    language: "en",
    note: "8 solid digits, the length an order number usually has",
  },
  {
    subject: "Delivery confirmation code",
    summary: "Your delivery code is 4930. Share it with the courier when your parcel arrives.",
    expected: "4930",
    language: "en",
    note: "delivery wording must stay a penalty, not a veto — a genuine delivery OTP survives on proximity",
  },
  {
    subject: "Security code",
    summary: "Your security code is 49 30 21. It expires in 10 minutes.",
    expected: "493021",
    language: "en",
    note: "grouped 2-2-2",
  },
  {
    subject: "Sign-in verification",
    summary: "Verification code: 4930-2178",
    expected: "49302178",
    language: "en",
    note: "grouped 4-4",
  },
  {
    subject: "Your access code",
    summary: "Access code: 49-30-21-78. Enter it to continue.",
    expected: "49302178",
    language: "en",
    note: "grouped 2-2-2-2",
  },
  {
    subject: "Your verification code for the store",
    summary: "Welcome back. Enter 620418 to continue signing in.",
    expected: "620418",
    language: "en",
    note: "the most common real shape — keyword in the subject, digits in the snippet",
  },

  // ---------------------------------------------------------------------------
  // Positives — German (compound forms)
  // ---------------------------------------------------------------------------
  {
    subject: "Ihr Bestätigungscode",
    summary: "Ihr Bestätigungscode lautet 493021. Geben Sie ihn niemals an Dritte weiter.",
    expected: "493021",
    language: "de",
    note: "compound Bestätigungscode — the \\bcode\\b gate misses this",
  },
  {
    subject: "Sicherheitscode für Ihr Konto",
    summary: "Verwenden Sie den Sicherheitscode 7482, um Ihre Anmeldung abzuschließen.",
    expected: "7482",
    language: "de",
    note: "compound Sicherheitscode with a 4-digit code",
  },
  {
    subject: "839217 ist Ihr Verifizierungscode",
    summary:
      "Sie haben eine Anmeldung angefordert. Der Code ist 15 Minuten gültig und gilt nur einmal.",
    expected: "839217",
    language: "de",
    note: "compound Verifizierungscode, digits in the subject",
  },
  {
    subject: "Anmeldung bestätigen",
    summary: "Ihr Einmalcode lautet 40 21 36. Er gilt nur für diesen Auftrag.",
    expected: "402136",
    language: "de",
    note: "compound Einmalcode, grouped 2-2-2",
  },

  // ---------------------------------------------------------------------------
  // Positives — French
  // ---------------------------------------------------------------------------
  {
    subject: "Votre code de vérification",
    summary: "Votre code de vérification est 493021. Ne le communiquez à personne.",
    expected: "493021",
    language: "fr",
  },
  {
    subject: "306142 est votre code de connexion",
    summary: "Utilisez ce code pour vous connecter à votre compte. Il expire dans 10 minutes.",
    expected: "306142",
    language: "fr",
  },
  {
    subject: "Vérification en deux étapes",
    summary: "Votre code à usage unique : 402 136",
    expected: "402136",
    language: "fr",
    note: "grouped 3-3, very short snippet",
  },

  // ---------------------------------------------------------------------------
  // Positives — Spanish
  // ---------------------------------------------------------------------------
  {
    subject: "Tu código de verificación",
    summary: "Tu código de verificación es 493021. No lo compartas con nadie.",
    expected: "493021",
    language: "es",
    note: "accented código must match on its own, not through \\bcode\\b",
  },
  {
    subject: "620418 es tu código de acceso",
    summary: "Introduce este código para iniciar sesión. Caduca en 10 minutos.",
    expected: "620418",
    language: "es",
  },
  {
    subject: "Verificación en dos pasos",
    summary: "Tu código de un solo uso: 40-21-36",
    expected: "402136",
    language: "es",
    note: "grouped 2-2-2 with hyphens",
  },

  // ---------------------------------------------------------------------------
  // Positives — Portuguese
  // ---------------------------------------------------------------------------
  {
    subject: "Seu código de verificação",
    summary: "Seu código de verificação é 493021. Não compartilhe com ninguém.",
    expected: "493021",
    language: "pt",
  },
  {
    subject: "839217 é o seu código de acesso",
    summary: "Use este código para entrar na sua conta. Ele expira em 10 minutos.",
    expected: "839217",
    language: "pt",
  },
  {
    subject: "Código de segurança",
    summary: "Digite o código 5041 para confirmar o pagamento.",
    expected: "5041",
    language: "pt",
  },

  // ---------------------------------------------------------------------------
  // Positives — Italian
  // ---------------------------------------------------------------------------
  {
    subject: "Il tuo codice di verifica",
    summary: "Il tuo codice di verifica è 493021. Non condividerlo con nessuno.",
    expected: "493021",
    language: "it",
  },
  {
    subject: "620418 è il tuo codice di accesso",
    summary: "Inserisci il codice per accedere al tuo account. Scade tra 10 minuti.",
    expected: "620418",
    language: "it",
  },
  {
    subject: "Codice di sicurezza",
    summary: "Usa il codice 40 21 36 per autorizzare il pagamento.",
    expected: "402136",
    language: "it",
  },

  // ---------------------------------------------------------------------------
  // Positives — Polish
  // ---------------------------------------------------------------------------
  {
    subject: "Twój kod weryfikacyjny",
    summary: "Twój kod weryfikacyjny to 493021. Nie udostępniaj go nikomu.",
    expected: "493021",
    language: "pl",
    note: "kod is prefix-anchored, the inflected kodu appears elsewhere in the language",
  },
  {
    subject: "839217 to Twój kod logowania",
    summary: "Użyj tego kodu, aby zalogować się na swoje konto.",
    expected: "839217",
    language: "pl",
    note: "only the inflected kodu appears in the snippet",
  },
  {
    subject: "Kod bezpieczeństwa",
    summary: "Wpisz kod 7482, aby potwierdzić transakcję.",
    expected: "7482",
    language: "pl",
  },

  // ---------------------------------------------------------------------------
  // Positives — Turkish (suffixed forms)
  // ---------------------------------------------------------------------------
  {
    subject: "Doğrulama kodunuz",
    summary: "Doğrulama kodunuz: 493021. Bu kodu kimseyle paylaşmayın.",
    expected: "493021",
    language: "tr",
    note: "suffixed kodunuz and kodu — only a prefix anchor on kod matches both",
  },
  {
    subject: "620418 giriş kodunuz",
    summary: "Hesabınıza giriş yapmak için bu kodu kullanın. Kod 10 dakika geçerlidir.",
    expected: "620418",
    language: "tr",
  },
  {
    subject: "Güvenlik kodu",
    summary: "İşlemi onaylamak için 7482 kodunu girin.",
    expected: "7482",
    language: "tr",
    note: "the code word follows the digits instead of preceding them",
  },

  // ---------------------------------------------------------------------------
  // Positives — Russian
  // ---------------------------------------------------------------------------
  {
    subject: "Ваш код подтверждения",
    summary: "Ваш код подтверждения: 493021. Никому не сообщайте его.",
    expected: "493021",
    language: "ru",
  },
  {
    subject: "839217 — код для входа",
    summary: "Используйте этот код, чтобы войти в аккаунт. Он действует 10 минут.",
    expected: "839217",
    language: "ru",
  },
  {
    subject: "Код безопасности",
    summary: "Введите код 7482, чтобы подтвердить операцию.",
    expected: "7482",
    language: "ru",
  },

  // ---------------------------------------------------------------------------
  // Positives — Japanese (no word boundaries, full-width digits)
  // ---------------------------------------------------------------------------
  {
    subject: "認証コードのお知らせ",
    summary: "認証コードは 493021 です。他人には教えないでください。",
    expected: "493021",
    language: "ja",
    note: "no word boundaries exist around 認証コード",
  },
  {
    subject: "【重要】確認コード：４９３０２１",
    summary: "ログインを完了するには、上記のコードを入力してください。",
    expected: "493021",
    language: "ja",
    note: "full-width digits in the subject — NFKC normalization is required",
  },
  {
    subject: "ワンタイムパスワード",
    summary: "お客様の認証コードは ７４８２ です。有効期限は10分です。",
    expected: "7482",
    language: "ja",
    note: "full-width 4-digit code next to a half-width 10 that must not win",
  },
  {
    subject: "620418 はあなたの確認コードです",
    summary: "心当たりがない場合は、このメールを無視してください。",
    expected: "620418",
    language: "ja",
    note: "code word and digits in the subject, snippet has neither",
  },

  // ---------------------------------------------------------------------------
  // Positives — Chinese
  // ---------------------------------------------------------------------------
  {
    subject: "您的验证码",
    summary: "您的验证码是 493021，10分钟内有效，请勿泄露给他人。",
    expected: "493021",
    language: "zh-hans",
  },
  {
    subject: "【安全提醒】620418 是您的登录验证码",
    summary: "请在页面中输入该验证码完成登录。",
    expected: "620418",
    language: "zh-hans",
  },
  {
    subject: "支付验证码",
    summary: "验证码：７４８２，请勿转发。",
    expected: "7482",
    language: "zh-hans",
    note: "full-width digits, no separating whitespace at all",
  },
  {
    subject: "您的驗證碼",
    summary: "您的驗證碼為 493021，請於 10 分鐘內完成驗證。",
    expected: "493021",
    language: "zh-hant",
    note: "traditional 驗證碼 is a distinct lexicon entry from simplified 验证码",
  },
  {
    subject: "登入驗證碼",
    summary: "驗證碼：８３９２１７，請勿提供給他人。",
    expected: "839217",
    language: "zh-hant",
    note: "full-width digits",
  },

  // ---------------------------------------------------------------------------
  // Positives — Korean
  // ---------------------------------------------------------------------------
  {
    subject: "인증번호 안내",
    summary: "인증번호는 493021 입니다. 타인에게 알려주지 마세요.",
    expected: "493021",
    language: "ko",
    note: "인증번호 spells number, not code — it needs its own lexicon entry",
  },
  {
    subject: "620418 인증 코드입니다",
    summary: "본인 확인을 위해 인증 코드를 입력해 주세요.",
    expected: "620418",
    language: "ko",
  },
  {
    subject: "보안 코드",
    summary: "결제를 완료하려면 보안 코드 7482 를 입력하세요.",
    expected: "7482",
    language: "ko",
  },

  // ---------------------------------------------------------------------------
  // Positives — Arabic, Hebrew, Vietnamese, Hindi spot checks
  // ---------------------------------------------------------------------------
  {
    subject: "رمز التحقق الخاص بك",
    summary: "رمز التحقق الخاص بك هو ٤٩٣٠٢١. لا تشاركه مع أي شخص.",
    expected: "493021",
    language: "ar",
    note: "Arabic-Indic digits — NFKC leaves these alone, they need an explicit mapping",
  },
  {
    subject: "٦٢٠٤١٨ هو رمز تسجيل الدخول",
    summary: "استخدم هذا الرمز لتسجيل الدخول إلى حسابك. تنتهي صلاحيته خلال ١٠ دقائق.",
    expected: "620418",
    language: "ar",
    note: "Arabic-Indic digits in the subject, a 2-digit Arabic-Indic duration in the snippet",
  },
  {
    subject: "קוד האימות שלך",
    summary: "קוד האימות שלך הוא 493021. אין למסור אותו לאף אחד.",
    expected: "493021",
    language: "he",
    note: "RTL text with ASCII digits",
  },
  {
    subject: "Mã xác minh của bạn",
    summary: "Mã xác minh của bạn là 493021. Không chia sẻ mã này với bất kỳ ai.",
    expected: "493021",
    language: "vi",
    note: "mã is two characters — it must be word-bounded so it never fires inside other words",
  },
  {
    subject: "620418 là mã đăng nhập của bạn",
    summary: "Nhập mã này để tiếp tục đăng nhập. Mã có hiệu lực trong 10 phút.",
    expected: "620418",
    language: "vi",
  },
  {
    subject: "आपका सत्यापन कोड",
    summary: "आपका सत्यापन कोड ४९३०२१ है। इसे किसी के साथ साझा न करें।",
    expected: "493021",
    language: "hi",
    note: "Devanagari digits need an explicit mapping alongside Arabic-Indic",
  },
  {
    subject: "620418 आपका लॉगिन कोड है",
    summary: "जारी रखने के लिए यह कोड दर्ज करें। यह 10 मिनट के लिए मान्य है।",
    expected: "620418",
    language: "hi",
  },

  // ---------------------------------------------------------------------------
  // Negatives — orders, shipping, invoices, prices
  // ---------------------------------------------------------------------------
  {
    subject: "Your order 10025431 has shipped",
    summary: "Track your package with tracking number 993412808394. Estimated delivery: Tuesday.",
    expected: null,
    language: "en",
  },
  {
    subject: "Order confirmation 40391827",
    summary: "Thanks for your order. Your order number is 40391827 and your total is $128.50.",
    expected: null,
    language: "en",
    note: "an 8-digit order number is exactly the shape of an 8-digit code",
  },
  {
    subject: "Invoice 2025-0417 is ready",
    summary: "Invoice 20250417 for $1,240.00 is now available. Payment is due within 14 days.",
    expected: null,
    language: "en",
  },
  {
    subject: "Your package is out for delivery",
    summary: "Parcel 493021 will arrive today between 2 and 6 PM.",
    expected: null,
    language: "en",
    note: "same digits as several positives, but no code word anywhere — the gate must hold",
  },
  {
    subject: "Payment receipt",
    summary: "We charged $49.30 to the card ending 2178 on 4 August 2025. Thank you.",
    expected: null,
    language: "en",
    note: "a price, a card suffix and a year in one snippet",
  },
  {
    subject: "Your statement is ready",
    summary: "Your account ending 4021 has a closing balance of $1,384.22 for July 2025.",
    expected: null,
    language: "en",
  },

  // ---------------------------------------------------------------------------
  // Negatives — promotional and other harmless uses of the word code
  // ---------------------------------------------------------------------------
  {
    subject: "20% off everything this weekend",
    summary: "Use promo code SAVE20 at checkout. Offer ends Sunday, 31 August 2025.",
    expected: null,
    language: "en",
    note: "the word code plus percent-off marketing digits",
  },
  {
    subject: "Your discount code inside",
    summary: "Take 15% off your next order with code 55555 — valid until 30 September.",
    expected: null,
    language: "en",
    note: "a numeric promo code sitting right next to the keyword; needs a promo/discount veto",
  },
  {
    subject: "Referral code for your friends",
    summary: "Share your referral code 483921 and you both get $10 off.",
    expected: null,
    language: "en",
    note: "shape-identical to a real code; only the word referral separates them",
  },
  {
    subject: "Postal code required",
    summary:
      "We couldn't deliver your parcel. Confirm the postal code 10115 for the shipping address.",
    expected: null,
    language: "en",
    note: "the word code with a 5-digit postal code and delivery wording",
  },

  // ---------------------------------------------------------------------------
  // Negatives — phone numbers, travel, tickets, calendar
  // ---------------------------------------------------------------------------
  {
    subject: "Your appointment reminder",
    summary: "Call us at +1 (415) 555-0134 if you need to reschedule your appointment on 12 March.",
    expected: null,
    language: "en",
    note: "US-formatted phone number split into runs that look like grouped codes",
  },
  {
    subject: "New voicemail from +49 30 12345678",
    summary: "You have a new voicemail. Listen online or call back +49 30 12345678.",
    expected: null,
    language: "en",
    note: "international phone number with space separators",
  },
  {
    subject: "Flight booking confirmed",
    summary: "Booking reference: KX7T2P. Flight LH 1074 departs 14 June at 09:35 from Terminal 2.",
    expected: null,
    language: "en",
  },
  {
    subject: "Your boarding pass",
    summary: "Flight AA 2841, seat 14C, gate B12. Boarding starts at 18:40.",
    expected: null,
    language: "en",
  },
  {
    subject: "Support ticket 4930218 updated",
    summary: "Our team replied to your ticket 4930218. View the conversation in the help center.",
    expected: null,
    language: "en",
  },
  {
    subject: "Case number 20394812",
    summary: "Your case has been assigned to an agent. Reference this number in future emails.",
    expected: null,
    language: "en",
  },
  {
    subject: "Meeting tomorrow at 10:30",
    summary: "Reminder: quarterly review, 21 October 2025, 10:30 to 11:30, room 4021.",
    expected: null,
    language: "en",
  },
  {
    subject: "Invitation: design sync on 3 September 2025",
    summary: "When: Wednesday 3 September 2025, 16:00 to 16:45 (CEST). Where: room 2178.",
    expected: null,
    language: "en",
  },
  {
    subject: "Save 30% on your next 3 orders",
    summary: "Spend $50, get 30% off. Ends 2025-09-30.",
    expected: null,
    language: "en",
  },

  // ---------------------------------------------------------------------------
  // Negatives — non-English
  // ---------------------------------------------------------------------------
  {
    subject: "Ihre Bestellung 40391827 wurde versandt",
    summary: "Ihr Paket ist unterwegs. Sendungsnummer: 003404346925101234.",
    expected: null,
    language: "de",
  },
  {
    subject: "Rechnung Nr. 2025-0417",
    summary: "Der Rechnungsbetrag von 128,50 € ist bis zum 15.09.2025 fällig.",
    expected: null,
    language: "de",
    note: "German date format produces several short runs and one 4-digit year",
  },
  {
    subject: "Confirmation de commande n° 4930218",
    summary:
      "Merci pour votre commande. Le montant total est de 128,50 €. Livraison prévue le 12 septembre.",
    expected: null,
    language: "fr",
  },
  {
    subject: "Tu pedido 40391827 va en camino",
    summary: "Puedes seguir tu envío con el número de seguimiento 8394812345.",
    expected: null,
    language: "es",
  },
  {
    subject: "Fattura n. 4930218",
    summary: "L'importo di 128,50 € è dovuto entro il 30 settembre 2025.",
    expected: null,
    language: "it",
  },
  {
    subject: "Sua encomenda 20394812 foi enviada",
    summary: "Acompanhe a entrega pelo código de rastreio 8394812345.",
    expected: null,
    language: "pt",
    note: "código appears as tracking code — the gate opens and only scoring can reject it",
  },
  {
    subject: "Potwierdzenie zamówienia 40391827",
    summary:
      "Dziękujemy za zakupy. Kwota do zapłaty: 128,50 zł. Przewidywana dostawa: 12 września.",
    expected: null,
    language: "pl",
  },
  {
    subject: "Siparişiniz kargoya verildi",
    summary: "Sipariş numaranız 40391827. Kargo takip numarası: 8394812345.",
    expected: null,
    language: "tr",
  },
  {
    subject: "Заказ № 4930218 отправлен",
    summary: "Отследить посылку можно по номеру 8394812345. Доставка ожидается 12 сентября.",
    expected: null,
    language: "ru",
  },
  {
    subject: "ご注文 40391827 の発送のお知らせ",
    summary: "お問い合わせ番号は 8394812345 です。お届け予定日は9月12日です。",
    expected: null,
    language: "ja",
  },
  {
    subject: "您的订单 40391827 已发货",
    summary: "快递单号：8394812345，预计9月12日送达。",
    expected: null,
    language: "zh-hans",
  },
  {
    subject: "주문 40391827 배송 안내",
    summary: "송장번호 8394812345 로 배송 조회가 가능합니다.",
    expected: null,
    language: "ko",
  },
  {
    subject: "تم شحن طلبك رقم ٤٠٣٩١٨٢٧",
    summary: "يمكنك تتبع شحنتك برقم التتبع ٨٣٩٤٨١٢٣٤٥.",
    expected: null,
    language: "ar",
    note: "Arabic-Indic order and tracking numbers must normalize and still be rejected",
  },

  // ---------------------------------------------------------------------------
  // Adversarial pairs — a real code alongside a number that must not win
  // ---------------------------------------------------------------------------
  {
    subject: "Your code for order 12345678",
    summary: "Use code 4930 to confirm delivery of order 12345678.",
    expected: "4930",
    language: "en",
    note: "measured failure: digit-length ranking returns the order number instead of the code",
  },
  {
    subject: "Verification code for invoice 20394812",
    summary: "Your verification code is 483921. The invoice total is $1,240.00.",
    expected: "483921",
    language: "en",
    note: "an 8-digit invoice number competes with the 6-digit code",
  },
  {
    subject: "Sign-in code",
    summary: "Your code is 620418. Requested from a device in Berlin on 14 August 2025.",
    expected: "620418",
    language: "en",
    note: "a plausible year in the same snippet as the code",
  },
  {
    subject: "Confirm your payment",
    summary: "Enter the security code 7482 to approve the payment of $1,299.00.",
    expected: "7482",
    language: "en",
    note: "a price competes with a 4-digit code",
  },
  {
    subject: "Your one-time code",
    summary: "Code: 493021. Questions? Call support at +1 (415) 555-0134.",
    expected: "493021",
    language: "en",
    note: "a phone number competes with the code",
  },
  {
    subject: "Ticket 20394812 — verification required",
    summary:
      "Verification code 40 21 36 confirms your identity. Reference ticket 20394812 in your reply.",
    expected: "402136",
    language: "en",
    note: "grouped code against a ticket number that appears twice",
  },
  {
    subject: "Bestätigungscode für Ihre Bestellung 40391827",
    summary: "Ihr Bestätigungscode lautet 5029. Bitte nennen Sie ihn dem Zusteller.",
    expected: "5029",
    language: "de",
    note: "order number in the subject, delivery wording in the snippet, real code wins",
  },
  {
    subject: "Sipariş 40391827 için doğrulama kodunuz",
    summary: "Teslimat kodunuz: 839217. Kuryeye bu kodu iletin.",
    expected: "839217",
    language: "tr",
  },
  {
    subject: "安全验证",
    summary: "您的验证码是493021，请勿泄露给他人。",
    expected: "493021",
    language: "zh-hans",
    note: "code glued to the keyword with no space — the common Chinese shape",
  },
  {
    subject: "認証コードのお知らせ",
    summary: "認証コードは830492です。10分以内に入力してください。",
    expected: "830492",
    language: "ja",
    note: "code glued between kana with no spaces",
  },
  {
    subject: "ご注文の認証コード",
    summary: "認証コードは4930です。ご注文番号12345678。",
    expected: "4930",
    language: "ja",
    note: "glued order number must lose to the glued code",
  },
  {
    subject: "订单 40391827 的验证码",
    summary: "您的验证码是 620418，请勿泄露。订单金额 128.50 元。",
    expected: "620418",
    language: "zh-hans",
  },
  {
    subject: "Код подтверждения для заказа 4930218",
    summary: "Ваш код: 748210. Никому его не сообщайте.",
    expected: "748210",
    language: "ru",
  },
  {
    subject: "Code de vérification — commande n° 4930218",
    summary: "Votre code est 8241. Montant : 128,50 €.",
    expected: "8241",
    language: "fr",
  },

  // ---------------------------------------------------------------------------
  // Truncation — the keyword survives the snippet cutoff but the digits don't.
  // These document the recall ceiling; there is nothing to recover.
  // ---------------------------------------------------------------------------
  {
    subject: "Your verification code",
    summary:
      "Thanks for signing up. To finish creating your account, enter the verification code below. Your code is…",
    expected: null,
    language: "en",
    note: "truncation — digits fall past the snippet cutoff",
  },
  {
    subject: "Ihr Sicherheitscode",
    summary:
      "Guten Tag, um Ihre Anmeldung abzuschließen, geben Sie bitte den folgenden Sicherheitscode ein. Ihr Code lautet…",
    expected: null,
    language: "de",
    note: "truncation",
  },
  {
    subject: "認証コードのご案内",
    summary:
      "いつもご利用いただきありがとうございます。ログインを完了するには、以下の認証コードを入力してください。認証コードは…",
    expected: null,
    language: "ja",
    note: "truncation",
  },
  {
    subject: "Tu código de verificación",
    summary:
      "Hola, hemos recibido una solicitud de inicio de sesión en tu cuenta. Para continuar, introduce el siguiente código de verificación:",
    expected: null,
    language: "es",
    note: "truncation — the snippet ends on the colon",
  },
  {
    subject: "Code de vérification",
    summary:
      "Bonjour, une connexion à votre compte a été demandée depuis un nouvel appareil. Votre code de vérification est le",
    expected: null,
    language: "fr",
    note: "truncation — the snippet ends mid-sentence",
  },

  // ---------------------------------------------------------------------------
  // Alphanumeric codes — genuine codes, but v1 is digits-only
  // ---------------------------------------------------------------------------
  {
    subject: "Your verification code",
    summary: "Your verification code is A3F9K2. It expires in 10 minutes.",
    expected: null,
    language: "en",
    note: "alphanumeric — flip when supported",
  },
  {
    subject: "Confirm your email address",
    summary: "Enter this code to confirm your email: X7QM2B",
    expected: null,
    language: "en",
    note: "alphanumeric — flip when supported",
  },
  {
    subject: "Ihr Bestätigungscode",
    summary: "Ihr Bestätigungscode lautet 4F9K2A. Er ist 15 Minuten gültig.",
    expected: null,
    language: "de",
    note: "alphanumeric — flip when supported",
  },
  {
    subject: "Code de sécurité",
    summary: "Votre code de sécurité : K2P-9XR",
    expected: null,
    language: "fr",
    note: "alphanumeric — flip when supported",
  },
  {
    subject: "Two-factor authentication",
    summary: "Your one-time code is 4A9-2K7. Do not share it.",
    expected: null,
    language: "en",
    note: "alphanumeric — flip when supported; the digit groups must not be extracted on their own",
  },
];
