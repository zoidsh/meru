# Polish (`pl`)

Polish follows what Apple ships in macOS Mail and AppKit. Where this sheet and a habit from other software disagree, this sheet wins.

## Address

Informal second person singular, with every form of the pronoun capitalized as a courtesy: _Ty_, _Ciebie_, _Ci_, _Twój_, _Twoja_, _Twoich_: _Twoich skrzynek_, _przypomnieć Ci_. The verb carries the person, so the pronoun is mostly left out (_Czy na pewno chcesz …?_); when it appears, it is capitalized. Never _Pan_, _Pani_ or _Państwo_, and never a lowercase _twój_ or _ci_.

## Buttons and menu items

The imperative, second person singular: _Odpowiedz_, _Usuń_, _Zachowaj_, _Anuluj_, _Zamknij kartę_. Never the infinitive (_Usunąć_) or a noun (_Usuwanie_).

## Capitalization

Sentence style: only the first word, proper nouns and the courtesy pronouns above take a capital.

## Settings

_Ustawienia_; the app-menu item is _Ustawienia…_.

## Plural categories

`one`, `few`, `many` and `other`, all four in every plural. `one` is 1; `few` is 2–4, 22–24, 32–34 and so on; `many` is 0, 5–21, 25–31 and so on; `other` is for fractions and reads like the genitive singular. `{count, plural, one {# karta} few {# karty} many {# kart} other {# karty}}`. A plural missing `few` compiles, then shows `other`'s form for 2 to 4.

## Terms that stay English

Gmail, Google Workspace, Meru, Meru Pro and Pro. They decline only where Polish would decline a foreign name in running text (_w Gmailu_); in a label, keep the bare name.

## Traps

- **Gendered forms.** A past-tense verb about the user shows their gender (_zapomniałeś_, _zapomniałaś_). Use the present tense, a noun or an impersonal form instead: _nie dodano dokumentu_, as Apple writes.
- **Placeholders and cases.** A placeholder cannot decline. Put it after a noun that carries the case (_na koncie {name}_, _w karcie {name}_), or set it off in parentheses as Apple does with a count: _otworzyć wiadomości (%1$lu)_.
- **Link is _łącze_.** Apple writes _Kopiuj łącze_, _Otwórz łącze_.
- Quotation marks are „…” (U+201E, U+201D).

## Error messages

Say what happened, without _Niestety_ or _Przepraszamy_: _Nie można dodać konta._, as Apple writes _Nie można zmienić nazwy skrzynki pocztowej „%1$@”._

## Apple's words

From Mail's `MainMenu`, `Alerts` and `Localizable` tables and AppKit's `MenuCommands`:

- Cancel _Anuluj_, OK _OK_, Undo _Cofnij_, Close _Zamknij_, Delete _Usuń_, Remove _Usuń_, Add _Dodaj_, Save _Zachowaj_, Edit _Edytuj_, Open _Otwórz_, Show _Pokaż_, Hide _Ukryj_, Quit _Zakończ_, Reload _Odśwież_, Try Again _Spróbuj ponownie_, Learn More… _Więcej informacji…_
- Close Tab _Zamknij kartę_, Close Other Tabs _Zamknij pozostałe karty_, Close Window _Zamknij okno_, Pin Tab _Przypnij kartę_, Show Sidebar _Pokaż pasek boczny_, Minimize _Minimalizuj okno_, Copy Link _Kopiuj łącze_, Mark as Read _Oznacz jako przeczytane_, Add Account… _Dodaj konto…_
- _Czy na pewno chcesz usunąć tę wiadomość?_ (Are you sure you want to delete this message?)
- _Twoja prośba o wysłanie tej wiadomości została odrzucona przez administratora konta._
