# German (`de`)

German follows Apple's conventions in macOS Mail and AppKit for address, label form, capitalization, punctuation and the ellipsis. Its words follow two rules:

- **An OS label takes its platform's word.** An entry whose `msgctxt` is `macOS`, `Windows` or `Linux` is a label the operating system names its own way, such as the File menu or Paste. A label only macOS shows, such as the Window menu or Hide Others, is an OS label too and carries `macOS` alone. `macOS` takes Apple's word (Apple Mail's for a mail menu item), `Windows` Microsoft's and `Linux` GNOME's, from [Platform words](#platform-words) below. Only the word changes: address, capitalization, punctuation and the ellipsis stay this sheet's on every platform.
- **Everything else takes the house word**, from this sheet and the glossary, by the [source order](../source-order.md): Gmail's word for a term Gmail also shows, Google's for Google's names, and in Meru's own copy Chrome's word where Chrome has the term, else the apps' word the glossary counts and marks agent-chosen, with its tally. Apple is never the authority for a house word; its macOS apps are one vote of seven when the glossary counts the apps' word. Meru's own copy reads the same on every platform, and each rule in `de.json` gives its word's source.

Where this sheet and a habit from other software disagree, this sheet wins.

## Address

_du_, lowercase, with _dein_, _dir_ and _dich_ lowercase too: _Möchtest du … deinem Postfach_. Never _Sie_, _Ihr_ or _Ihnen_ for the user. _Sie_ was weighed against _du_ and rejected; it is not a choice a translation makes.

## Buttons and menu items

The infinitive, object first: _Antworten_, _Löschen_, _Abbrechen_, _Als gelesen markieren_, _Tab schließen_. Never an imperative (_Lösche_, _Schließe_).

## Label forms

The form and case each kind of label takes, decided before the language's first run. Every label of a kind takes its form, whatever its English does; the examples are the catalog's own.

- **Button:** The infinitive, object first, in sentence style: _Abbrechen_, _Speichern_, _Tab schließen_.
- **Menu bar item:** The infinitive, object first, in sentence style, the app menu the titlebar button pops up on Windows and Linux included: _Neu laden_, _Nächsten Tab auswählen_, _Konten verwalten_.
- **Context or popup menu item:** The infinitive, object first, in sentence style, as Chrome writes its own: _URL kopieren_, _Andere Tabs schließen_, _Im Standardbrowser öffnen_.
- **Select option:** An option that names an action takes the infinitive, any other is the word itself, in sentence style: _Einblenden_, _Ausblenden_, _Immer_, _Nie_, _Schmal_, _Nur auf Anfrage_. A setting's label never ends in a preposition that would govern its options' case: _Benachrichtigungen für_, whose accusative plural is its options' nominative, never _Benachrichtigen bei_. An adjective option stands uninflected, as a predicate of the setting's noun, whatever its gender: _Schmal_ and _Breit_ under _Breite_, _Eingeklappt_ under _Anzeige des Launchers_, _Dunkel_ under _Design_.
- **Setting label never ends with:** a preposition, unless its options already stand in the case it governs: _ab_ _an_ _auf_ _aus_ _außer_ _bei_ _bis_ _durch_ _für_ _gegen_ _hinter_ _in_ _mit_ _nach_ _neben_ _ohne_ _seit_ _statt_ _trotz_ _über_ _um_ _unter_ _von_ _vor_ _während_ _wegen_ _zu_ _zwischen_. Allowed: Notify for _für_, whose options' nominative plural is the accusative it governs; Hibernate after _nach_, whose options, _1 Minute_, _30 Minuten_ and _1 Stunde_, read the same in the dative.
- **Checkbox or switch label:** The infinitive, object first, in sentence style: _Fenster anzeigen_, _Ordner nach Abschluss öffnen_, _Unbenutzte Tabs inaktiv machen_; a label that names a feature rather than an action is its noun: _Hardwarebeschleunigung_.
- **Checkbox that picks what an action applies to:** A noun phrase naming what it picks, in sentence style, never the infinitive, as Chrome's Cookies and other site data is in its Delete browsing data dialog: _Cookies und andere Websitedaten_, _Bilder und Dateien im Cache_.
- **Setting description:** An infinitive clause, object first, in sentence style and ending in a period: _Nach Abschluss eines Downloads den Ordner mit der Datei öffnen._, _Vor jedem Download fragen, wo die Datei gespeichert werden soll._ One that says what the setting holds is a noun phrase, and an instruction for a step the user takes, such as Swipe…, the _du_ imperative: _Streiche mit zwei Fingern …_
- **Setting description never opens with:** the _du_ imperative of the English verb a description opens with, in its first word or the first word after a leading phrase's comma: Add _Füge_; Ask _Frage_; Block _Blockiere_; Check _Prüfe_ _Suche_; Choose _Wähle_; Close _Schließe_; Detect _Erkenne_; Display _Zeige_; Export _Exportiere_; Extend _Erweitere_ _Wende_; Hide _Blende_; List _Führe_; Mark _Markiere_; Move _Verschiebe_; Open _Öffne_; Play _Spiele_; Prompt _Fordere_; Receive _Erhalte_; Recolor _Färbe_; Remember _Merke_; Render _Rendere_; Run _Führe_; Select _Wähle_; Send _Sende_; Set _Lege_ _Stelle_; Show _Zeige_ _Blende_; Signs _Melde_; Start _Starte_; Stop _Verhindere_; Swipe _Streiche_; Unload _Entlade_; Use _Verwende_ _Nutze_. `scripts/translate-rules.test.ts` fails on one, except a description that is itself an instruction the test names, and fails when a description opens with an English verb this line lacks.
- **OS label:** Its platform's word from [Platform words](#platform-words), in the form its source writes it, the infinitive or a noun for all three: _Einsetzen_ on macOS and _Einfügen_ on Windows and Linux, _{appName} beenden_, _Ablage_.

## Capitalization

Sentence style, with nouns capitalized as German always does. A label that opens something further ends in an ellipsis after a no-break space (U+00A0): _Einstellungen …_, _Konto hinzufügen …_.

## Settings

_Einstellungen_. The app-menu item with `msgctxt` `macOS` is _Einstellungen …_, as AppKit writes it; with `Windows` or `Linux` it is _Einstellungen …_ too, Microsoft's and GNOME's word with the English's ellipsis.

## Access keys

An `&` in the English marks the access key on Windows and Linux. Keep one `&` inline, before a letter of the German word: the English letter where the word has it, else the first free letter, one no other label in the same menu uses. macOS drops the `&`. The labels whose word has the English letter claim it first, in menu order; the rest then take their first free letter, in menu order. `packages/app/access-keys.test.ts` holds every catalog to this: it builds each menu and context menu Windows and Linux show, and fails when two items in one menu share a letter.

The page and text-field context menu, by that policy, on Windows: `&Learn Spelling` _&Zum Wörterbuch hinzufügen_, `&Search with Google` _Mit Google &suchen_, `Cu&t` _A&usschneiden_, `&Copy` _Ko&pieren_, `&Paste` _&Einfügen_, `Paste and &Match Style` _Einfügen und For&mat anpassen_, `Select &All` _&Alles markieren_, `Sa&ve Image As…` _&Bild speichern unter …_, `Copy Link Addr&ess` _Adresse des Lin&ks kopieren_, Chrome's words with the key on K, since a link in a text field shows it beside _&Einfügen_, `Cop&y Image` _Bi&ld kopieren_, `C&opy Image Address` _Bildadresse k&opieren_. On Linux, where its words differ: `Paste and &Match Style` _E&infügen und Stil anpassen_, `Select &All` _&Alles auswählen_.

## Plural categories

`one` and `other`. Every plural carries exactly these two, `=0` and other exact matches aside: `{count, plural, one {# Tab} other {# Tabs}}`.

## Terms that stay English

Gmail, Google Workspace, Meru, Meru Pro, Meru Portal and Pro, never inflected inside the word. A compound joins with a hyphen: _Gmail-Einstellungen_, _Workspace-App_, _Meru-Pro-Funktionen_.

## Traps

- **Placeholders and articles.** An article or adjective before a placeholder must agree with every value it can take, which it usually cannot. Put the placeholder after a noun that carries the case (_im Konto {name}_), or in its own phrase, never _der {name}_.
- **Gendered forms.** Address with _du_ avoids most of them; where a person is described, rewrite around the gender.
- **House words.** _Benachrichtigung_, never _Mitteilung_, for a notification. _Konto_, plural _Konten_, never _Account_, for an account. _Speichern_, never _Sichern_, for keeping something; _Sichern_ is only Apple's word in a `macOS` label such as _Sichern unter …_. _Button_ for an on-screen button, as Chrome writes it, masculine (_der Button_, plural _Buttons_), and a compound joins it with a hyphen, such as the bookmarks button: _der Lesezeichen-Button_, _der Installations-Button_, never _Schaltfläche_, alone or in a compound such as _Installationsschaltfläche_: Chrome compounds with Button 12 times (_Scroll-Buttons_, _Feedback-Button_) and with schaltfläche 3. Chrome writes the compounds both ways, _Scroll-Buttons_ and _Scrollbuttons_; Meru always takes the hyphen. A standalone _Taste_ reads as a keyboard key or a mouse button and means only that, as in the key names _Umschalttaste_ and _Control-Taste_. Pinning a tab is _anpinnen_ (_Anpinnen_, _angepinnter Tab_) and unpinning it _Loslösen_, the launcher the _Launcher_, as Chrome writes them. A hibernated tab is _inaktiv_, Chrome's word for the tabs its Memory Saver unloads (_Inaktiver Tab_), never _Ruhezustand_, which is macOS's Sleep. The sound Linen is _Leinen_.
- English quotation marks become „…“ (U+201E, U+201C).
- **Numbers and units.** A no-break space (U+00A0) joins a number to its unit, as Chrome writes it, so the two never break apart: _5 Minuten_, _30 Tage_, and in a plural _# Tage_.
- **macOS's own elements.** The menu bar, the Dock, Finder and System Settings take Apple's names in Meru's own copy too, since they name Apple's interface and show only on macOS: _Menüleiste_ (ControlCenterSettings.appex `Localizable` `Show in Menu Bar`), _Dock_ (DesktopSettings.appex `Localizable` `Dock`), _Finder_ and _Systemeinstellungen_ (System Settings `InfoPlist` `CFBundleDisplayName`).

## Error messages

Say what happened, without _leider_, _Entschuldigung_ or _Bitte_: _Das Konto konnte nicht hinzugefügt werden._, as Apple writes _Das Postfach „%1$@“ konnte nicht umbenannt werden._

## Common labels

House words for everyday actions, as Chrome writes its labels, in this sheet's label form. A string that names something Gmail also shows, such as the Undo button in the message-sent toast, takes Gmail's word from the glossary instead, and an entry with a platform `msgctxt` takes [its platform's word](#platform-words). Delete and Remove are two words, as Chrome writes them: Remove account never reads as deleting it. The labels:

- Cancel _Abbrechen_, OK _OK_, Close _Schließen_, Delete _Löschen_, Remove _Entfernen_, Add _Hinzufügen_, Save _Speichern_, Edit _Bearbeiten_, Open _Öffnen_, Show _Anzeigen_, Hide _Ausblenden_, Quit _Beenden_, Reload _Neu laden_, Try Again _Erneut versuchen_, Learn More… _Weitere Informationen …_
- Close Tab _Tab schließen_, Close Other Tabs _Andere Tabs schließen_, Pin Tab _Tab anpinnen_, Show Sidebar _Seitenleiste einblenden_, as Chrome's Show side panel, Copy Link _Link kopieren_, Mark as Read _Als gelesen markieren_, Inspect Element _Untersuchen_, as Chrome's Inspect
- _Möchtest du diese Nachricht wirklich löschen?_ (Are you sure you want to delete this message?)
- _Du kannst Anhänge nicht bewegen, solange sie nicht geladen wurden. Möchtest du diesen Anhang laden?_

## Platform words

The platform words table is in [de.platform.md](de.platform.md); read it when an entry has a `macOS`, `Windows` or `Linux` msgctxt.
