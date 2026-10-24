# Dutch (`nl`)

Dutch follows what Apple ships in macOS Mail and AppKit. Where this sheet and a habit from other software disagree, this sheet wins.

An entry whose `msgctxt` is `macOS`, `Windows` or `Linux` is an OS label, a label each operating system names its own way, such as the File menu or Paste. `macOS` takes Apple's word (Apple Mail's for a mail menu item), `Windows` Microsoft's and `Linux` GNOME's. Only the word changes: this sheet's address, capitalization and punctuation hold on every platform.

## Address

_je_, with _jouw_ or _je_ for the possessive: _Weet je zeker … je account_. Never _u_ or _uw_.

## Buttons and menu items

The bare imperative, verb first, as Apple writes it: _Antwoord_, _Verwijder_, _Bewaar_, _Annuleer_, _Markeer als gelezen_, _Sluit tabblad_, _Voeg account toe_. Never the infinitive (_Verwijderen_, _Tabblad sluiten_), which most other software uses.

## Capitalization

Sentence style: only the first word and proper nouns take a capital.

## Settings

_Instellingen_. The app-menu item with `msgctxt` `macOS` is _Instellingen…_, as AppKit writes it; with `Windows` or `Linux` it takes Microsoft's or GNOME's word, without the ellipsis the English lacks.

## Plural categories

`one` and `other`: `{count, plural, one {# tabblad} other {# tabbladen}}`. 0 takes `other`.

## Terms that stay English

Gmail, Google Workspace, Meru, Meru Pro and Pro. A compound joins with a hyphen: _Gmail-instellingen_, _Workspace-app_.

## Traps

- **Imperative labels.** The bare imperative applies to every button and menu item, including ones other software would write as an infinitive.
- **Placeholders and articles.** _de_ and _het_ depend on the noun; put the placeholder after a noun that fixes it (_het account {name}_).
- **Compounds.** Write compounds as one word or with a hyphen, never split: _meldingstijden_, _Workspace-app_.
- **Quotes.** Apple writes 'Inkomend' with single quotes; use ‘…’ (U+2018, U+2019).

## Error messages

Say what happened, without _helaas_ or _sorry_: _Het account kan niet worden toegevoegd._, as Apple writes _De naam van de postbus '%1$@' kon niet worden gewijzigd._

## Apple's words

From Mail's `MainMenu`, `Alerts` and `Localizable` tables and AppKit's `MenuCommands`. A string that names something Gmail also shows, such as the Undo button in the message-sent toast, takes Gmail's word from the glossary instead:

- Cancel _Annuleer_, OK _OK_, Undo _Herstel_, Close _Sluit_, Delete _Verwijder_, Remove _Verwijder_, Add _Voeg toe_, Save _Bewaar_, Edit _Wijzig_, Open _Open_, Show _Toon_, Hide _Verberg_, Quit _Stop_, Reload _Laad opnieuw_, Try Again _Probeer opnieuw_, Learn More… _Meer informatie…_
- Close Tab _Sluit tabblad_, Close Other Tabs _Sluit andere tabbladen_, Close Window _Sluit venster_, Pin Tab _Maak tabblad vast_, Show Sidebar _Toon navigatiekolom_, Minimize _Minimaliseer_, Copy Link _Kopieer link_, Mark as Read _Markeer als gelezen_, Add Account… _Voeg account toe…_, Quit Mail _Stop Mail_
- _Weet je zeker dat je dit bericht wilt verwijderen?_ (Are you sure you want to delete this message?)
- _Je kunt bijlagen pas slepen nadat ze zijn gedownload. Wil je deze bijlage downloaden?_

## Platform words

Not yet written. This table, laid out as `de.md`'s, and `nl.json` beside this sheet, which holds the same words by `msgctxt` and `msgid` with the banned words, pinned terms and access-key style that `check.ts` reads, are filled when the language is added.
