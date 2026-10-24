# Italian (`it`)

Italian follows what Apple ships in macOS Mail and AppKit. Where this sheet and a habit from other software disagree, this sheet wins.

An entry whose `msgctxt` is `macOS`, `Windows` or `Linux` is an OS label, a label each operating system names its own way, such as the File menu or Paste. `macOS` takes Apple's word (Apple Mail's for a mail menu item), `Windows` Microsoft's and `Linux` GNOME's. Only the word changes: this sheet's address, capitalization and punctuation hold on every platform.

## Address

_tu_, with _tuo_, _tua_ and _ti_: _del tuo account_, _Vuoi …?_. Never _Lei_ or _voi_.

## Buttons and menu items

The imperative, second person singular: _Rispondi_, _Elimina_, _Salva_, _Annulla_, _Chiudi pannello_. Never the infinitive (_Eliminare_).

## Capitalization

Sentence style: only the first word and proper nouns take a capital.

## Settings

_Impostazioni_. The app-menu item with `msgctxt` `macOS` is _Impostazioni…_, as AppKit writes it; with `Windows` or `Linux` it takes Microsoft's or GNOME's word, without the ellipsis the English lacks.

## Plural categories

`one`, `many` and `other`. `many` is for large round numbers (1.000.000), so its text is usually the same as `other`'s: `{count, plural, one {# pannello} many {# pannelli} other {# pannelli}}`. 0 takes `other`.

## Terms that stay English

Gmail, Google Workspace, Meru, Meru Pro and Pro. _account_ is also invariable, as Apple writes it: _l’account_, _gli account_.

## Traps

- **Tab is _pannello_.** Apple's Italian calls a tab a _pannello_ (_Chiudi pannello_, _Mostra tutti i pannelli_), never _scheda_.
- **Placeholders and articles.** Articles and prepositions merge and change with the value (_del_, _dell’_, _della_). Put the placeholder after a noun (_l’account {name}_).
- **Gendered forms.** Use the masculine or rewrite around the person.
- The apostrophe is ’ (U+2019): _dell’account_, _all’avvio_.

## Error messages

Say what happened, without _Spiacenti_ or _Ci dispiace_: _Impossibile aggiungere l’account._, as Apple writes _Impossibile rinominare la casella “%1$@”._

## Apple's words

From Mail's `MainMenu`, `Alerts` and `Localizable` tables and AppKit's `MenuCommands`. A string that names something Gmail also shows, such as the Undo button in the message-sent toast, takes Gmail's word from the glossary instead:

- Cancel _Annulla_, OK _OK_, Undo _Annulla_, Close _Chiudi_, Delete _Elimina_, Remove _Rimuovi_, Add _Aggiungi_, Save _Salva_, Edit _Modifica_, Open _Apri_, Show _Mostra_, Hide _Nascondi_, Quit _Esci_, Reload _Ricarica_, Try Again _Riprova_, Learn More… _Scopri di più…_
- Close Tab _Chiudi pannello_, Close Other Tabs _Chiudi gli altri pannelli_, Close Window _Chiudi finestra_, Pin Tab _Fissa pannello_, Show Sidebar _Mostra la barra laterale_, Minimize _Contrai_, Copy Link _Copia link_, Mark as Read _Segna come letto_, Quit Mail _Esci da Mail_
- _Confermi di voler eliminare questo messaggio?_ (Are you sure you want to delete this message?)
- _Impossibile trascinare allegati prima di averli scaricati. Vuoi scaricare questo allegato?_

## Platform words

Not yet written. This table, laid out as `de.md`'s, and `it.json` beside this sheet, which holds the same words by `msgctxt` and `msgid` with the banned words, pinned terms and access-key style that `check.ts` reads, are filled when the language is added.
