# Polish (`pl`)

Polish follows Apple's conventions in macOS Mail and AppKit for address, label form, capitalization and punctuation. Its words follow two rules:

- **An OS label takes its platform's word.** An entry whose `msgctxt` is `macOS`, `Windows` or `Linux` is a label the operating system names its own way, such as the File menu or Paste. A label only macOS shows, such as the Window menu or Hide Others, is an OS label too and carries `macOS` alone. `macOS` takes Apple's word (Apple Mail's for a mail menu item), `Windows` Microsoft's and `Linux` GNOME's, from [Platform words](#platform-words) below. Only the word changes: address, capitalization, punctuation and the imperative stay this sheet's on every platform.
- **Everything else takes the house word**, from this sheet and the glossary, by the [source order](../source-order.md): Gmail's word for a term Gmail also shows, Google's for Google's names, and in Meru's own copy Chrome's word where Chrome has the term, else the apps' word the glossary counts and marks agent-chosen, with its tally. Apple is never the authority for a house word; its macOS apps are one vote of seven when the glossary counts the apps' word. Meru's own copy reads the same on every platform, and each rule in `pl.json` gives its word's source.

Where this sheet and a habit from other software disagree, this sheet wins.

## Address

Informal second person singular, with every form of the pronoun capitalized as a courtesy: _Ty_, _Ciebie_, _Ci_, _Twój_, _Twoja_, _Twoich_: _Twoich skrzynek_, _przypomnieć Ci_. The verb carries the person, so the pronoun is mostly left out (_Czy na pewno chcesz …?_); when it appears, it is capitalized. Never _Pan_, _Pani_ or _Państwo_, and never a lowercase _twój_, _cię_ or _ci_. A lower-case _ci_ is fine only as the plural _these_ (_ci użytkownicy_).

## Buttons and menu items

The imperative, second person singular: _Odpowiedz_, _Usuń_, _Zapisz_, _Anuluj_, _Zamknij kartę_. Never the infinitive (_Usunąć_) or a noun (_Usuwanie_).

## Label forms

The form and aspect each kind of label takes, decided before the language's first run from Chrome's and Microsoft's Polish. Every label of a kind takes its form, whatever its English does. Counts are of the messages whose English opens with the verb, by the Polish imperative that opens them, perfective against imperfective: Chrome _Otwórz_ 212 against _Otwieraj_ 6, _Zapisz_ 84 against _Zapisuj_ 13, _Zamknij_ 60 against 0, _Ukryj_ 37 against 1, _Pokaż_ 126 against _Pokazuj_ 10, but _Zezwalaj_ 33 against _Zezwól_ 15, _Blokuj_ 16 against 2 and _Kopiuj_ 30 against _Skopiuj_ 17; Microsoft's Terminology Collection _Zamknij_ 5 of 5, _Wyślij_ 9 of 9, _Pokaż_ 7 of 7, _Zezwalaj_ 2 of 2.

- **Button:** The perfective imperative, in sentence style, as Chrome and Microsoft write a one-off action: _Zapisz_, _Usuń_, _Zamknij kartę_, _Uruchom ponownie_; Copy alone is _Kopiuj_, Chrome's word for a bare Copy (Chrome 4/4); never the imperfective (_Zapisuj_), the infinitive (_Usunąć_) or a noun (_Usuwanie_). A question in a dialog's title or button takes Chrome's infinitive: _Usunąć {label}?_
- **Menu bar item:** The imperative, in sentence style, perfective as for a button, the app menu the titlebar button pops up on Windows and Linux included: _Zamknij kartę_, _Odśwież_, _Zarządzaj kontami_; an item that names a menu or a place is its noun: _Widok_, _Pobrane pliki_.
- **Context or popup menu item:** The imperative, in sentence style, as Chrome writes its own, perfective but for Copy, which is _Kopiuj_ as in Chrome's menus (Chrome 4/4 for a bare Copy, 30 of 47 for every Copy): _Kopiuj link_, _Otwórz link w nowej karcie_, _Zamknij inne karty_, _Przypnij kartę_.
- **Select option:** An option that names an action takes the perfective imperative; any other is the word itself, an adverb or a noun as Chrome writes it, else an adjective agreeing with the setting's noun in gender and number, in the nominative, as _Wąska_ under _Szerokość_ and _Zwinięte_ under _Wyświetlanie_: _Automatycznie_, _Brak_, _Zawsze_, _Nigdy_, _Wąska_, _Jasny_. A setting's label never ends in a preposition that would govern its options' case, so it is a noun phrase its nominative options can follow: _Zakres powiadomień_, never _Powiadamiaj o_; _Czas do ustawienia karty jako nieaktywnej_, never _Ustawiaj jako nieaktywne po_.
- **Setting label never ends with:** a preposition, which would govern its options' case: _o_ _od_ _do_ _po_ _na_ _w_ _we_ _z_ _ze_ _za_ _dla_ _przy_ _przed_ _przez_ _nad_ _pod_ _u_ _bez_ _ku_ _między_ _według_ _wobec_ _oprócz_ _zamiast_ _około_ _obok_ _wśród_ _poza_ _dzięki_ _mimo_.
- **Checkbox or switch label:** The imperative, in sentence style: perfective for a thing the switch shows, hides or turns on, as Chrome's _Pokaż pasek zakładek_ and _Pokaż przycisk strony głównej_; imperfective for what the app does again each time, as Chrome's _Blokuj pliki cookie innych firm_, _Sprawdzaj pisownię podczas wpisywania tekstu_, _Pytaj przed pobraniem, gdzie zapisać każdy plik_ and _Zezwalaj witrynom na zapisywanie danych_: _Pokaż plakietkę z liczbą nieprzeczytanych_, _Ukryj logo Gmaila_, _Automatycznie sprawdzaj dostępność aktualizacji_. A label that names a feature rather than an action is its noun: _Akceleracja sprzętowa_.
- **Setting description:** The imperative, as Chrome writes a sentence whose English opens with one (Chrome 70 of 90 such sentences), in the aspect of its label and ending in a period: _Ukryj stopkę u dołu skrzynki odbiorczej._, _Pytaj przed każdym pobraniem, gdzie zapisać plik._ One that says what the setting holds is a noun phrase, and an instruction for a step the user takes, such as Swipe…, the perfective imperative.
- **OS label:** Its platform's word from [Platform words](#platform-words), in the form its source writes it, the imperative or a noun for all three: _Kopiuj_ on Windows and macOS and _Skopiuj_ on Linux, _Zakończ {appName}_, _Plik_.

## Capitalization

Sentence style: only the first word, proper nouns and the courtesy pronouns above take a capital. A label that opens something further ends in an ellipsis with no space before it: _Ustawienia…_, _Dodaj konto…_.

## Settings

_Ustawienia_. The app-menu item with `msgctxt` `macOS` is _Ustawienia…_, as AppKit writes it; with `Windows` or `Linux` it is _Ustawienia…_ too, Microsoft's and GNOME's word with the English's ellipsis.

## Access keys

An `&` in the English marks the access key on Windows and Linux. Keep one `&` inline, before a letter of the Polish word: the English letter where the word has it, else the first free letter, one no other label in the same menu uses. macOS drops the `&`. The labels whose word has the English letter claim it first, in menu order; the rest then take their first free letter, in menu order. `packages/app/access-keys.test.ts` holds every catalog to this: it builds each menu and context menu Windows and Linux show, and fails when two items in one menu share a letter.

The page and text-field context menu, by that policy, on Windows: `&Learn Spelling` _&Dodaj do słownika_, `&Search with Google` _Wy&szukaj w Google_, `Cu&t` _Wy&tnij_, `&Copy` _Ko&piuj_, `&Paste` _&Wklej_, `Paste and &Match Style` _Wklej i dopasuj for&mat_, `Select &All` _Z&aznacz wszystko_, `Sa&ve Image As…` _&Zapisz obraz jako…_, `Copy Link Addr&ess` _Kopiuj adr&es linku_, Chrome's words and key (Chrome 3/3), on the English letter, E, which no item beside it takes, neither _&Wklej_ nor _&Zapisz obraz jako…_, `Cop&y Image` _Kop&iuj grafikę_, `C&opy Image Address` _K&opiuj adres obrazu_. On Linux, where its words differ: `&Copy` _Sko&piuj_, GNOME's word with Windows' key, `Paste and &Match Style` _Wk&lej i dopasuj styl_.

## Plural categories

`one`, `few`, `many` and `other`, all four in every plural. `one` is 1; `few` is 2–4, 22–24, 32–34 and so on; `many` is 0, 5–21, 25–31 and so on; `other` is for fractions and reads like the genitive singular. `{count, plural, one {# karta} few {# karty} many {# kart} other {# karty}}`. A plural missing `few` compiles, then shows `other`'s form for 2 to 4.

## Terms that stay English

Gmail, Google Workspace, Meru, Meru Pro, Meru Portal and Pro. They decline only where Polish would decline a foreign name in running text (_w Gmailu_); in a label, keep the bare name.

## Traps

- **Gendered forms.** A past-tense verb about the user shows their gender (_zapomniałeś_, _zapomniałaś_). Use the present tense, a noun or an impersonal form instead: _nie dodano dokumentu_, as Apple writes.
- **Placeholders and cases.** A placeholder cannot decline. Put it after a noun that carries the case (_na koncie {name}_, _w karcie {name}_), or set it off in parentheses as Apple does with a count: _otworzyć wiadomości (%1$lu)_.
- **One-letter words.** A one-letter word (_a_, _i_, _o_, _u_, _w_, _z_) is joined to the next word by a no-break space (U+00A0), as Chrome and Apple write Polish, so it never ends a line: _w Gmailu_, _Wklej i dostosuj styl_. The Platform words table below carries the same no-break spaces.
- **Numbers and units.** A no-break space (U+00A0) joins a number to its unit, as Chrome writes it: _5 minut_, _30 dni_, and in a plural _# dni_.
- Quotation marks are „…” (U+201E, U+201D).
- **House words, as Chrome writes them.** A link is a _link_, never Apple's _łącze_: _Kopiuj link_. The one exception is the `macOS` context menu's Copy Link Address, whose platform word is WebKit's _Kopiuj łącze_. Saving is _zapisać_: _Zapisz_, _zapisane wyszukiwanie_; _Zachowaj_ is only Apple's word in a `macOS` label such as _Zachowaj jako…_. An update is an _aktualizacja_, never _uaktualnienie_, which is only Apple's word in a `macOS` label. Restarting is _uruchomić ponownie_, never _zrestartować_. The titlebar is the _pasek tytułu_, the tab strip the _pasek kart_, a button a _przycisk_, a passkey a _klucz dostępu_, the clipboard the _schowek_ and a folder a _folder_, never _katalog_. The launcher is the _menu z aplikacjami_. A hibernated tab is _nieaktywna_, Chrome's word for the tabs its Memory Saver unloads (_Karta nieaktywna_), never _uśpiona_, the systems' Sleep. The sound Linen is _Len_.
- **About {appName} on macOS is _{appName}…_ alone.** Apple's Polish names the app by itself in its About item, as in Mail's _Poczta…_, _Kalkulator…_ and _Słownik…_, so the `macOS` translation is the placeholder and an ellipsis. It looks nearly empty to a reviewer and to `i18n:check`, and it is right; Windows and Linux spell the item out, as [Platform words](#platform-words) gives them.
- **macOS's own elements.** The menu bar, the Dock, Finder and System Settings take Apple's names in Meru's own copy too, since they name Apple's interface and show only on macOS: _pasek menu_ (ControlCenterSettings.appex `Localizable` `Show in Menu Bar`), _Dock_ (DesktopSettings.appex `Localizable` `Dock`), _Finder_ and _Ustawienia systemowe_ (System Settings `InfoPlist` `CFBundleDisplayName`), and Finder's Applications folder is _Aplikacje_ (SystemFolderLocalizations `Applications`), never _Programy_.

## Error messages

Say what happened, without _Niestety_ or _Przepraszamy_: _Nie można dodać konta._, as Apple writes _Nie można zmienić nazwy skrzynki pocztowej „%1$@”._

## Common labels

House words for everyday actions, as Chrome writes its labels, in this sheet's label form. A string that names something Gmail also shows, such as the Undo button in the message-sent toast, takes Gmail's word from the glossary instead, and an entry with a platform `msgctxt` takes [its platform's word](#platform-words). Delete and Remove are one word, _Usuń_, as Chrome writes both. The labels:

- Cancel _Anuluj_, OK _OK_, Undo _Cofnij_, Close _Zamknij_, Delete _Usuń_, Remove _Usuń_, Add _Dodaj_, Save _Zapisz_, Edit _Edytuj_, Open _Otwórz_, Show _Pokaż_, Hide _Ukryj_, Quit _Zakończ_, Reload _Odśwież_, Try Again _Spróbuj ponownie_, Learn More… _Więcej informacji…_
- Close Tab _Zamknij kartę_, Close Other Tabs _Zamknij inne karty_, Pin Tab _Przypnij kartę_, Show Sidebar _Pokaż pasek boczny_, Copy Link _Kopiuj link_, Mark as Read _Oznacz jako przeczytane_, Add Account… _Dodaj konto…_
- _Czy na pewno chcesz usunąć tę wiadomość?_ (Are you sure you want to delete this message?)
- _Twoja prośba o wysłanie tej wiadomości została odrzucona przez administratora konta._

## Platform words

The platform words table is in [pl.platform.md](pl.platform.md); read it when an entry has a `macOS`, `Windows` or `Linux` msgctxt.
