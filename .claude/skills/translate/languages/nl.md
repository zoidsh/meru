# Dutch (`nl`)

Dutch follows Apple's conventions in macOS Mail and AppKit for address, label form, capitalization and punctuation. Its words follow two rules:

- **An OS label takes its platform's word.** An entry whose `msgctxt` is `macOS`, `Windows` or `Linux` is a label the operating system names its own way, such as the File menu or Paste. A label only macOS shows, such as the Window menu or Hide Others, is an OS label too and carries `macOS` alone. `macOS` takes Apple's word (Apple Mail's for a mail menu item), `Windows` Microsoft's and `Linux` GNOME's, from [Platform words](#platform-words) below, in the form that platform gives its labels: Microsoft and GNOME write the infinitive, _Knippen_, _Alles selecteren_. Address, capitalization and punctuation stay this sheet's on every platform.
- **Everything else takes the house word**, from this sheet and the glossary, by the [source order](../source-order.md): Gmail's word for a term Gmail also shows, Google's for Google's names, and in Meru's own copy Chrome's word where Chrome has the term, else the apps' word the glossary counts and marks agent-chosen, with its tally. Apple is never the authority for a house word; its macOS apps are one vote of seven when the glossary counts the apps' word. Meru's own copy reads the same on every platform, and each rule in `nl.json` gives its word's source.

Where this sheet and a habit from other software disagree, this sheet wins.

## Address

_je_, with _jouw_ or _je_ for the possessive: _Weet je zeker … je account_. Never _u_ or _uw_.

## Buttons and menu items

The bare imperative, verb first, as Apple writes it: _Antwoord_, _Verwijder_, _Sla op_, _Annuleer_, _Markeer als gelezen_, _Sluit tabblad_, _Voeg account toe_. Never the infinitive (_Verwijderen_, _Tabblad sluiten_), which most other software uses, Chrome included; a house word Chrome writes as an infinitive takes the imperative here: Chrome's _Opslaan_ is _Sla op_, its _Bewerken_ is _Bewerk_. Two kinds take the infinitive instead. A `Windows` or `Linux` label takes its platform's word, which Microsoft and GNOME write as an infinitive. Every context-menu item takes Chrome's infinitive on every platform, as Chrome writes every item of its own context menus, and a menu a button pops up counts as a context menu: a page's, a text field's or a tab's context menu, a ⋯ More options menu, Do Not Disturb's menu: _Kopiëren_, _Linkadres kopiëren_, _E-mailadres kopiëren_, _Inspecteren_, _Andere tabbladen sluiten_, _Vastzetten_, _Breedte resetten_. The exception is a context-menu entry with a `macOS` context, which takes Apple's word from [Platform words](#platform-words), as Cut and Paste do: _Kopieer_, _Kopieer link_. The imperative applies to every button and to the menu bar's items, the app menu the titlebar button pops up on Windows and Linux included, since it is the menu bar's own menu, and a `macOS` label takes Apple's word, which is itself imperative. A message a context menu shares with a button or the menu bar has a `context menu` context of its own for its context-menu use, such as Close, Reload and Share. A select option that names an action is no button either, and takes Chrome's infinitive: Window controls' Show and Hide are _Tonen_ and _Verbergen_ (Chrome 1/1 and 2/2 for the bare _Show_ and _Hide_, with _Toon_ and _Verberg_ 0), and a sentence that quotes an option quotes it so. The label form is grammar, which follows Apple's conventions as every sheet's does, so it holds for Chrome's words too: the word is Chrome's, the form Apple's.

## Label forms

The form and case each kind of label takes, decided before the language's first run. Every label of a kind takes its form, whatever its English does; the examples are the catalog's own.

- **Button:** The bare imperative, verb first, in sentence style: _Annuleer_, _Sla op_, _Sluit tabblad_.
- **Menu bar item:** The bare imperative, in sentence style, the app menu the titlebar button pops up on Windows and Linux included: _Laad opnieuw_, _Selecteer volgend tabblad_, _Beheer accounts_.
- **Context or popup menu item:** Chrome's infinitive, in sentence style, on every platform: _URL kopiëren_, _Andere tabbladen sluiten_, _Openen in standaardbrowser_; an entry with a `macOS` context takes Apple's word, which is imperative: _Kopieer_.
- **Select option:** An option that names an action takes Chrome's infinitive, any other is the word itself, in sentence style: _Tonen_, _Verbergen_, _Altijd_, _Nooit_, _Smal_. An adjective option stands uninflected, without the attributive _-e_, as a predicate of the setting's noun: _Smal_ and _Breed_ under _Breedte_, _Samengevouwen_ under _Weergave van launcher_, _Donker_ under _Thema_.
- **Checkbox or switch label:** The bare imperative, in sentence style: _Toon vensters_, _Open map na afloop_, _Maak ongebruikte tabbladen inactief_.
- **Setting description:** An imperative sentence in sentence style, ending in a period: _Open de map met het bestand wanneer een download klaar is._, _Vraag waar je elk bestand wilt opslaan voordat het wordt gedownload._ One that says what the setting holds is a noun phrase: _Hoelang een tabblad ongebruikt moet zijn…_
- **OS label:** Its platform's word from [Platform words](#platform-words), in the form its source writes it: Apple's imperative on macOS, Microsoft's and GNOME's infinitive on Windows and Linux: _Plak_ on macOS, _Plakken_ on Windows and Linux.

## Capitalization

Sentence style: only the first word and proper nouns take a capital. A label that opens something further ends in an ellipsis with no space before it: _Instellingen…_, _Voeg account toe…_.

## Settings

_Instellingen_. The app-menu item with `msgctxt` `macOS` is _Instellingen…_, as AppKit writes it; with `Windows` or `Linux` it is _Instellingen_, since the English has no ellipsis.

## Access keys

An `&` in the English marks the access key on Windows and Linux. Keep one `&` inline, before a letter of the Dutch word: the English letter where the word has it, else the first free letter, one no other label in the same menu uses. macOS drops the `&`. The labels whose word has the English letter claim it first, in menu order; the rest then take their first free letter, in menu order. `packages/app/access-keys.test.ts` holds every catalog to this: it builds each menu and context menu Windows and Linux show, and fails when two items in one menu share a letter.

The page and text-field context menu, by that policy, on Windows: `&Learn Spelling` _&Toevoegen aan woordenboek_, `&Search with Google` _&Zoeken met Google_, `Cu&t` _K&nippen_, `&Copy` _Kop&iëren_, `&Paste` _&Plakken_, `Paste and &Match Style` _Plakken en op&maak aanpassen_, `Select &All` _&Alles selecteren_, `Sa&ve Image As…` _A&fbeelding opslaan als…_, `Copy Link Addr&ess` _Linkadr&es kopiëren_, Chrome's words (Chrome 3/3 in Chromium 156.0.8078.49's .xtb files) with Chrome's key on E, which no item beside it takes, `Cop&y Image` _Af&beelding kopiëren_, `C&opy Image Address` _Adres van afbeelding k&opiëren_. On Linux, where its words differ: `Paste and &Match Style` _P&lakken en stijl aanpassen_.

## Plural categories

`one` and `other`: `{count, plural, one {# tabblad} other {# tabbladen}}`. 0 takes `other`.

## Terms that stay English

Gmail, Google Workspace, Meru, Meru Pro, Meru Portal and Pro. A compound joins with a hyphen: _Gmail-instellingen_, _Workspace-app_.

## Traps

- **Imperative labels.** The bare imperative applies to every button and menu-bar item without a platform context, including ones other software would write as an infinitive; a `Windows` or `Linux` label and every item of a context menu or a button's popup menu without a `macOS` context take the infinitive.
- **Placeholders and articles.** _de_ and _het_ depend on the noun; put the placeholder after a noun that fixes it (_het account {name}_).
- **Compounds.** Write compounds as one word or with a hyphen, never split: _meldingstijden_, _Workspace-app_.
- **Quotes.** Apple writes 'Inkomend' with single quotes, and Chrome writes straight ones too; use ‘…’ (U+2018, U+2019), never straight or double quotes.
- **Numbers and units.** A plain space parts a number from its unit, as Chrome writes it, never a no-break space: _5 minuten_, _# dagen_.
- **House words, as Chrome writes them.** A bookmark is a _bookmark_, never Apple's _bladwijzer_. Saving is _opslaan_: _Sla op_, _opgeslagen zoekopdracht_; _Bewaar_ is only Apple's word in a `macOS` label such as _Bewaar als…_. Pinning is _vastzetten_: _Zet vast_, _vastgezet tabblad_, never _vastmaken_. Updating is _updaten_, never _bijwerken_. Editing is _bewerken_: _Bewerk account_. A notification is a _melding_, never _notificatie_. The tab strip is the _tabbladstrook_, a button a _knop_, a passkey a _toegangssleutel_, the clipboard the _klembord_ and a folder a _map_. Restarting is _opnieuw starten_: _Start Meru opnieuw_. The launcher is the _launcher_ and the sidebar the _zijbalk_, never Apple's _navigatiekolom_. A hibernated tab is _inactief_, Chrome's word for the tabs its Memory Saver unloads (_Inactief tabblad_), never _slaapstand_, the systems' Sleep. The sound Linen is _Linnen_. A setting's Auto is _Auto_ and its None _Geen_, whatever the setting, never _Automatisch_. The Width setting, _Breedte_, offers _Smal_ and _Breed_, _smal en breed_ in a sentence, never Chrome's _Wijd_, which is letter spacing. The app links badge is a _badge_, as the unread badge is, never _markering_. The account color Teal is _Blauwgroen_, as Chrome writes teal, never _Groenblauw_.
- **macOS's own elements.** The menu bar, the Dock, Finder and System Settings take Apple's names in Meru's own copy too, since they name Apple's interface and show only on macOS: _menubalk_ (ControlCenterSettings.appex `Localizable` `Show in Menu Bar`), _Dock_ (DesktopSettings.appex `Localizable` `Dock`), _Finder_ and _Systeeminstellingen_ (System Settings `InfoPlist` `CFBundleDisplayName`).
- **1Password's words.** The steps for connecting 1Password quote its Settings, Browser and Add Browser as _Instellingen_, _Browser_ and _Browser toevoegen_ (_Selecteer Browser en selecteer daarna Browser toevoegen._), and its vault as _kluis_ (agent-chosen, unresolved: 1Password's Dutch interface has not been read). Its Settings is Meru's own _Instellingen_. On Linux, quitting it is GNOME's _afsluiten_: _Sluit 1Password af._

## Error messages

Say what happened, without _helaas_ or _sorry_: _Het account kan niet worden toegevoegd._, as Apple writes _De naam van de postbus '%1$@' kon niet worden gewijzigd._

## Common labels

House words for everyday actions, as Chrome writes its labels, in this sheet's label form. A string that names something Gmail also shows, such as the Undo button in the message-sent toast, takes Gmail's word from the glossary instead, and an entry with a platform `msgctxt` takes [its platform's word](#platform-words). Delete and Remove are one word, _Verwijder_, as Chrome writes both. The labels:

- Cancel _Annuleer_, OK _OK_, Undo _Maak ongedaan_, Close _Sluit_, Delete _Verwijder_, Remove _Verwijder_, Add _Voeg toe_, Save _Sla op_, Edit _Bewerk_, Open _Open_, Show _Toon_, Hide _Verberg_, Quit _Sluit_, Reload _Laad opnieuw_, Try Again _Probeer opnieuw_, Learn More… _Meer informatie…_
- Close Tab _Sluit tabblad_, Pin Tab _Zet tabblad vast_, and in a context menu Close Other Tabs _Andere tabbladen sluiten_, Pin _Vastzetten_, Unpin _Losmaken_, Show Sidebar _Toon zijbalk_, Copy Link _Kopieer link_, Mark as Read _Markeer als gelezen_, Add Account… _Voeg account toe…_
- _Weet je zeker dat je dit bericht wilt verwijderen?_ (Are you sure you want to delete this message?)
- _Je kunt bijlagen pas slepen nadat ze zijn gedownload. Wil je deze bijlage downloaden?_

## Platform words

The platform words table is in [nl.platform.md](nl.platform.md); read it when an entry has a `macOS`, `Windows` or `Linux` msgctxt.
