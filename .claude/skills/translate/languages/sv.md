# Swedish (`sv`)

Swedish follows Apple's conventions in macOS Mail and AppKit for address, label form, capitalization and punctuation. Its words follow two rules:

- **An OS label takes its platform's word.** An entry whose `msgctxt` is `macOS`, `Windows` or `Linux` is a label the operating system names its own way, such as the File menu or Paste. A label only macOS shows, such as the Window menu or Hide Others, is an OS label too and carries `macOS` alone. `macOS` takes Apple's word (Apple Mail's for a mail menu item), `Windows` Microsoft's and `Linux` GNOME's, from [Platform words](#platform-words) below. Only the word changes: address, capitalization, punctuation and the imperative stay this sheet's on every platform.
- **Everything else takes the house word**, from this sheet and the glossary, by the [source order](../source-order.md): Gmail's word for a term Gmail also shows, Google's for Google's names, and in Meru's own copy Chrome's word where Chrome has the term, else the apps' word the glossary counts and marks agent-chosen, with its tally. Apple is never the authority for a house word; its macOS apps are one vote of seven when the glossary counts the apps' word. Meru's own copy reads the same on every platform, and each rule in `sv.json` gives its word's source.

Where this sheet and a habit from other software disagree, this sheet wins.

## Address

_du_, with _din_, _ditt_, _dina_ and _dig_, lowercase: _Är du säker … din_. Never _ni_.

## Buttons and menu items

The imperative: _Svara_, _Radera_, _Spara_, _Avbryt_, _Markera som läst_, _Stäng flik_. Delete is _Radera_; Remove is _Ta bort_.

## Label forms

The form and case each kind of label takes, decided before the language's first run. Every label of a kind takes its form, whatever its English does. Chrome writes its Swedish labels in the imperative, which for a verb in _-a_ reads the same as the infinitive (_Kopiera_, _Visa_), so the count is taken on the verbs whose two forms differ, in Chromium 156.0.8078.49's `.xtb` files, labels of up to five words opening with the English verb: Close _Stäng_ 58 of 58, never _Stänga_; Hide _Dölj_ 35 of 36; Add _Lägg till_ 143 of 146; Search _Sök_ 56 of 76, the rest nouns such as _Sökmotor_. The Microsoft Terminology Collection agrees: Close _Stäng_ 5 of 6, Hide _Dölj_ 2 of 2, Add _Lägg till_ 13 of 13. Chrome's infinitives, such as _Läsa din data på {}_, are an extension's permissions, never a command.

- **Button:** The imperative, verb first, in sentence style: _Avbryt_, _Spara_, _Stäng flik_, _Lägg till konto…_.
- **Menu bar item:** The imperative, verb first, in sentence style, the app menu the titlebar button pops up on Windows and Linux included: _Läs in igen_, _Stäng flik_, _Visa sidofältet_; a menu's own name is its noun: _Flikar_, _Konton_.
- **Context or popup menu item:** The imperative, verb first, in sentence style, as Chrome writes its own (Close _Stäng_ 58 of 58): _Kopiera länkadress_, _Stäng andra flikar_, _Öppna i standardwebbläsaren_.
- **Select option:** An option that names an action takes the imperative, any other is the word itself, agreeing with the setting's noun, in sentence style: _Visa i mapp_, _Alltid_, _Aldrig_, _Auto_, _Smal_, _Bred_, _Ingen_. Swedish has no case, so a setting's label may end in a preposition, as Hibernate after and Notify for do, and its options follow it unchanged: _30 minuter_ reads the same after _efter_ as on its own. An adjective option agrees in gender and number with the noun the setting names, an en-word, an ett-word or a plural: _Ingen_ for the account's _färg_, _Inga_ for the excluded _appar_, _Ljust_ for the _tema_, _Ljus_ for the tray icon's _färg_; an option that names no noun of its own, such as _Auto_, takes no agreement.
- **Checkbox or switch label:** The imperative, verb first, in sentence style: _Visa bricka för olästa_, _Dölj Gmail-logotypen_; a label that names a feature rather than an action is its noun: _Alla inkorgar_, _Aviseringar_.
- **Checkbox that picks what an action applies to:** A noun phrase naming what it picks, in sentence style, never the imperative, as Chrome's Cookies and other site data is in its Delete browsing data dialog: _Cookies och annan webbplatsdata_, _Cachade bilder och filer_.
- **Setting description:** An imperative sentence, verb first, in sentence style and ending in a period, as Chrome writes its descriptions, counted in its messages of five words or more ending in a period: Use _Använd_ 24 of 28, Open _Öppna_ 5 of 5, Allow _Tillåt_ 4 of 4, Show _Visa_ 2 of 2, and never the present tense, _Använder_, _Öppnar_, _Visar_ (0 in each): _Öppna mappen som innehåller filen när en nedladdning är klar._ One that says what the setting holds is a noun phrase: _Hur länge en flik måste vara oanvänd innan den blir inaktiv. …_
- **OS label:** Its platform's word from [Platform words](#platform-words), in the imperative on all three platforms, as Apple, Microsoft and GNOME write their menu items: _Klistra in_, _Avsluta {appName}_, _Arkiv_ on macOS and Windows, _Fil_ on Linux. A word the Microsoft Terminology Collection gives in the infinitive, such as _klippa ut_, takes its imperative, _Klipp ut_.

## Capitalization

Sentence style: only the first word and proper nouns take a capital. A label that opens something further ends in an ellipsis with no space before it: _Inställningar…_, _Lägg till konto…_.

## Settings

_Inställningar_. The app-menu item with `msgctxt` `macOS` is _Inställningar…_, as AppKit writes it; with `Windows` or `Linux` it is _Inställningar…_ too, Microsoft's and GNOME's word with the English's ellipsis.

## Access keys

An `&` in the English marks the access key on Windows and Linux. Keep one `&` inline, before a letter of the Swedish word: the English letter where the word has it, else the first free letter, one no other label in the same menu uses. macOS drops the `&`. The labels whose word has the English letter claim it first, in menu order; the rest then take their first free letter, in menu order. `packages/app/access-keys.test.ts` holds every catalog to this: it builds each menu and context menu Windows and Linux show, and fails when two items in one menu share a letter.

The page and text-field context menu, by that policy, on Windows: `&Learn Spelling` _&Lägg till i ordlistan_, `&Search with Google` _&Sök med Google_, `Cu&t` _Klipp u&t_, `&Copy` _Ko&piera_, `&Paste` _Kl&istra in_, `Paste and &Match Style` _Klistra in och &matcha formatet_, `Select &All` _M&arkera allt_, `Sa&ve Image As…` _Spa&ra bild som…_, `Copy Link Addr&ess` _Kopiera länkadr&ess_, Chrome's words (Chrome 3/3) with the English letter, E, in the word that holds it in English, rather than Chrome's _länk&adress_, since a link shows it beside _M&arkera allt_; an image never shows it, so it never meets _Kopi&era bild_, `Cop&y Image` _Kopi&era bild_, `C&opy Image Address` _K&opiera bildadress_. On Linux, where its words differ: `Paste and &Match Style` _Klistra in och &matcha stilen_.

## Plural categories

`one` and `other`: `{count, plural, one {# flik} other {# flikar}}`. 0 takes `other`.

## Terms that stay English

Gmail, Google Workspace, Meru, Meru Pro, Meru Portal and Pro. A compound joins with a hyphen: _Gmail-inställningar_, _Workspace-app_.

## Traps

- **No split compounds (_särskrivning_).** A compound is one word, or hyphenated after a name or abbreviation: _aviseringstider_, _verifieringskod_, _Workspace-app_; never _aviserings tider_ or _verifierings kod_.
- **Notification is _avisering_.** Chrome writes _avisering_, never _notis_ or _meddelande_; _notis_ is only Apple's word in a `macOS` label.
- **Email is _e-post_.** An email is an _e-postmeddelande_, the address an _e-postadress_, as Chrome writes them, never _mejl_ or _e-brev_; _mejl_ is only Apple's word in a `macOS` label such as _Nytt mejl_. Where a string repeats Gmail's own text, such as its toast, it says _meddelande_.
- **Placeholders.** Definite endings attach to the noun; put the placeholder after the noun (_kontot {name}_).
- Quotation marks are ”…” (U+201D on both sides).
- **Numbers and units.** A plain space parts a number from its unit, as Chrome writes it, never a no-break space: _5 minuter_, _# dagar_.
- **House words, as Chrome writes them.** Hiding is _dölja_: _Dölj_; _Göm_ is only Apple's word in a `macOS` label. Downloading is _ladda ned_, a download a _nedladdning_, never _hämta_ or _hämtning_ for a download; fetching something else, such as a page, can be _hämta_. Reloading is _läsa in igen_: _Läs in igen_, never _Uppdatera_, which is an update. Pinning is _fästa_: _Fäst_, _fäst flik_, never _nåla fast_. The tab strip is the _flikhuvud_, a button a _knapp_, a passkey a _nyckel_, phishing _nätfiske_, the clipboard _urklipp_ and a folder a _mapp_. Restarting is _starta om_. A hibernated tab is _inaktiv_, Chrome's word for the tabs its Memory Saver unloads (_Inaktiv flik_), never _viloläge_, the systems' Sleep. The sound Linen is _Linne_.
- **macOS's own elements.** The menu bar, the Dock, Finder and System Settings take Apple's names in Meru's own copy too, since they name Apple's interface and show only on macOS: _menyrad_ (ControlCenterSettings.appex `Localizable` `Show in Menu Bar`), _Dock_ (DesktopSettings.appex `Localizable` `Dock`), _Finder_ and _Systeminställningar_ (System Settings `InfoPlist` `CFBundleDisplayName`).
- **1Password's words.** The steps for connecting 1Password quote its Browser and Add Browser in English, _Browser_ and _Add Browser_ (_Välj Browser och välj sedan Add Browser._), its settings as _inställningarna för 1Password_ and its vault as _valv_ (agent-chosen, unresolved: whether 1Password has a Swedish interface was not read, since its supported-languages page, `https://support.1password.com/languages/`, answered HTTP 403 to an unsigned fetch). Once a speaker or the page settles it, a Swedish interface's own words replace the English ones.

## Error messages

Say what happened, without _Tyvärr_ or _Ursäkta_: _Det gick inte att lägga till kontot._, as Apple writes _Det gick inte att byta namn på brevlådan ”%1$@”._

## Common labels

House words for everyday actions, as Chrome writes its labels, in this sheet's label form. A string that names something Gmail also shows, such as the Undo button in the message-sent toast, takes Gmail's word from the glossary instead, and an entry with a platform `msgctxt` takes [its platform's word](#platform-words). Delete and Remove are two words, as Chrome writes them: Remove account never reads as deleting it. The labels:

- Cancel _Avbryt_, OK _OK_, Undo _Ångra_, Close _Stäng_, Delete _Radera_, Remove _Ta bort_, Add _Lägg till_, Save _Spara_, Edit _Redigera_, Open _Öppna_, Show _Visa_, Hide _Dölj_, Quit _Avsluta_, Reload _Läs in igen_, Try Again _Försök igen_, Learn More… _Läs mer…_
- Close Tab _Stäng flik_, Close Other Tabs _Stäng andra flikar_, Pin Tab _Fäst flik_, Show Sidebar _Visa sidofältet_, Copy Link _Kopiera länk_, Mark as Read _Markera som läst_, Add Account… _Lägg till konto…_, Quit Mail _Avsluta Mail_
- _Är du säker på att du vill radera det här e-postmeddelandet?_ (Are you sure you want to delete this message?)
- _Du kan inte dra bilagor förrän de har laddats ned. Vill du ladda ned den här bilagan?_

## Platform words

The platform words table is in [sv.platform.md](sv.platform.md); read it when an entry has a `macOS`, `Windows` or `Linux` msgctxt.
