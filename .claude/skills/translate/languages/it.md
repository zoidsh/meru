# Italian (`it`)

Italian follows Apple's conventions in macOS Mail and AppKit for address, label form, capitalization, punctuation and the ellipsis. Its words follow two rules:

- **An OS label takes its platform's word.** An entry whose `msgctxt` is `macOS`, `Windows` or `Linux` is a label the operating system names its own way, such as the File menu or Paste. A label only macOS shows, such as the Window menu or Hide Others, is an OS label too and carries `macOS` alone. `macOS` takes Apple's word (Apple Mail's for a mail menu item), `Windows` Microsoft's and `Linux` GNOME's, from [Platform words](#platform-words) below. Only the word changes: address, capitalization, punctuation and the ellipsis stay this sheet's on every platform.
- **Everything else takes the house word**, from this sheet and the glossary, by the [source order](../source-order.md): Gmail's word for a term Gmail also shows, Google's for Google's names, and in Meru's own copy Chrome's word where Chrome has the term, else the apps' word the glossary counts and marks agent-chosen, with its tally. Apple is never the authority for a house word; its macOS apps are one vote of seven when the glossary counts the apps' word. Meru's own copy reads the same on every platform, and each rule in `it.json` gives its word's source.

Where this sheet and a habit from other software disagree, this sheet wins.

## Address

_tu_, with _tuo_, _tua_ and _ti_: _del tuo account_, _Vuoi …?_. Never _Lei_ or _voi_.

## Buttons and menu items

The imperative, second person singular: _Rispondi_, _Elimina_, _Salva_, _Annulla_, _Chiudi scheda_. Never the infinitive (_Eliminare_).

## Label forms

The form and case each kind of label takes, decided before the language's first run. Every label of a kind takes its form, whatever its English does; the examples are the catalog's own.

- **Button:** The imperative, second person singular, in sentence style: _Annulla_, _Salva_, _Chiudi scheda_.
- **Menu bar item:** The imperative, in sentence style, the app menu the titlebar button pops up on Windows and Linux included: _Ricarica_, _Seleziona scheda successiva_, _Gestisci account_.
- **Context or popup menu item:** The imperative, in sentence style, as Chrome writes its own: _Copia URL_, _Chiudi le altre schede_, _Apri nel browser predefinito_.
- **Select option:** An option that names an action takes the imperative, any other is the word itself, in sentence style: _Mostra_, _Nascondi_, _Sempre_, _Mai_, _Stretta_, _Solo quando lo chiedi_. An adjective option agrees with the setting's noun in gender and number: _Automatica_ and _Stretta_ under _Larghezza_, _Compressa_ under _Visualizzazione_, _Scuro_ under _Tema_; a colour's name is its noun, masculine whatever the setting's noun: _Nero_, _Bianco_. An option that names a mode among options that are actions is no adjective of the label's noun: it takes the singular masculine, whatever the label's number, as _Automatico_ beside _Nascondi_ and _Mostra_ under _Controlli della finestra_.
- **Checkbox or switch label:** The imperative, in sentence style: _Mostra finestre_, _Apri la cartella al termine_, _Rendi inattive le schede inutilizzate_.
- **Setting description:** An imperative sentence in sentence style, ending in a period: _Apri la cartella che contiene il file al termine di un download._, _Chiedi dove salvare ogni file prima di scaricarlo._ One that says what the setting holds is a noun phrase.
- **OS label:** Its platform's word from [Platform words](#platform-words), in the form its source writes it: Apple's and GNOME's imperative, Microsoft's imperative or noun: _Incolla_, _Esci da {appName}_, and for the Help menu Apple's and GNOME's _Aiuto_ but Microsoft's _Guida_.

## Capitalization

Sentence style: only the first word and proper nouns take a capital. A label that opens something further ends in an ellipsis straight after the word, with no space: _Impostazioni…_, _Aggiungi account…_.

## Settings

_Impostazioni_. The app-menu item with `msgctxt` `macOS` is _Impostazioni…_, as AppKit writes it; with `Windows` or `Linux` it is _Impostazioni…_ too, Microsoft's and GNOME's word with the English's ellipsis.

## Access keys

An `&` in the English marks the access key on Windows and Linux. Keep one `&` inline, before a letter of the Italian word: the English letter where the word has it, else the first free letter, one no other label in the same menu uses. macOS drops the `&`. The labels whose word has the English letter claim it first, in menu order; the rest then take their first free letter, in menu order. `packages/app/access-keys.test.ts` holds every catalog to this: it builds each menu and context menu Windows and Linux show, and fails when two items in one menu share a letter.

The page and text-field context menu, by that policy, on Windows: `&Learn Spelling` _Aggiungi a&l dizionario_, `&Search with Google` _C&erca con Google_, `Cu&t` _&Taglia_, `&Copy` _&Copia_, `&Paste` _&Incolla_, `Paste and &Match Style` _Incolla e adegua la for&mattazione_, `Select &All` _Selezion&a tutto_, `Sa&ve Image As…` _Sal&va immagine con nome…_, `Copy Link Addr&ess` _Copia indi&rizzo link_, Chrome's words (Chrome 3/3) with Chrome's key on R rather than its other, I, since a link in a text field shows it beside _&Incolla_, `Cop&y Image` _Co&pia immagine_, `C&opy Image Address` _C&opia l’indirizzo dell’immagine_. On Linux, where its words differ: `Paste and &Match Style` _I&ncolla e adegua lo stile_.

## Plural categories

`one`, `many` and `other`. `many` is for large round numbers (1.000.000), so its text is usually the same as `other`'s: `{count, plural, one {# scheda} many {# schede} other {# schede}}`. 0 takes `other`.

## Terms that stay English

Gmail, Google Workspace, Meru, Meru Pro, Meru Portal and Pro. _account_ is also invariable, as Apple and Chrome write it: _l’account_, _gli account_, never _accounts_. So are _app_ (_le app_), _email_, _passkey_, _host_ and _download_.

Meru names itself _Meru_, masculine (_Meru resta veloce e leggero_, _Avvia Meru ridotto a icona_), in a Settings description too, where the English says the application or the app: _Mostra l’icona di Meru nel Dock_, _Seleziona il tema di Meru_, never _l’app_, as the catalog's Settings descriptions already name it in 32 messages to _l’app_'s 13. _app_ stays for other apps, such as 1Password's desktop app or the Workspace apps, and in a short label, such as _Versione dell’app_.

## Traps

- **Placeholders and articles.** Articles and prepositions merge and change with the value (_del_, _dell’_, _della_). Put the placeholder after a noun (_l’account {name}_).
- **Gendered forms.** Use the masculine or rewrite around the person.
- The apostrophe is ’ (U+2019): _dell’account_, _all’avvio_, never Chrome's straight '.
- Quotation marks are “ ” (U+201C, U+201D), as Apple writes _Cerca info su “%@”_, never straight "…" quotes, which Chrome uses, or « ».
- **Numbers and units.** A plain space parts a number from its unit, as Chrome writes it, never a no-break space: _5 minuti_, _# giorni_.
- **House words.** Where Chrome has a term, Meru's own copy takes Chrome's word; `it.json`'s `banned` and `pinned` rules hold them, each with Chrome's count as its source. A tab is a _scheda_, plural _schede_ (_Chiudi scheda_, _schede verticali_), never Apple's _pannello_. A bookmark is a _preferito_ (_Preferiti_, _Aggiungi ai preferiti_), never a _segnalibro_; inside a sentence it is lower case, even as the place bookmarks are kept in, as Chrome writes it (_ai preferiti_ 21 times to _ai Preferiti_ once), and only a label's first word capitalizes it. An email is an _email_, never _e-mail_. Clicking is _fare clic_ (_Fai clic su_), never _cliccare_. The tab strip is the _tabstrip_, feminine (_la tabstrip_), and the launcher _Avvio app_, as Chrome writes them. The tab context menu's Pin and Unpin are _Fissa_ and _Stacca_. A trusted host is an _host attendibile_, an on-screen button a _pulsante_ (a _tasto_ is a key), the clipboard _gli appunti_, and a release channel a _canale_ (_canale beta_). To notify is _notificare_ (_Notifica quando…_), never _avvisare_, which would read as the toast's _avviso_. Learn more is _Scopri di più_.
- **macOS's own elements.** The menu bar, the Dock, Finder and System Settings take Apple's names in Meru's own copy too, since they name Apple's interface and show only on macOS: _barra dei menu_ (ControlCenterSettings.appex `Localizable` `Show in Menu Bar`), _Dock_ (DesktopSettings.appex `Localizable` `Dock`), _Finder_ and _Impostazioni di Sistema_ (System Settings `InfoPlist` `CFBundleDisplayName`).
- **Linux's file manager** shows only on Linux, so it takes GNOME's word, _gestore file_ (nautilus `_Open in File Manager`, _Apri nel gestore file_): _Mostra nel gestore file_, never the English _file manager_.

## Error messages

Say what happened, without _Spiacenti_ or _Ci dispiace_: _Impossibile aggiungere l’account._, as Apple writes _Impossibile rinominare la casella “%1$@”._

## Common labels

House words for everyday actions, as Chrome writes its labels, in this sheet's label form. A string that names something Gmail also shows, such as the Undo button in the message-sent toast, takes Gmail's word from the glossary instead, and an entry with a platform `msgctxt` takes [its platform's word](#platform-words). Delete and Remove are two words, as Chrome writes them: Remove account never reads as deleting it. The labels:

- Cancel _Annulla_, OK _OK_, Close _Chiudi_, Delete _Elimina_, Remove _Rimuovi_, Add _Aggiungi_, Save _Salva_, Edit _Modifica_, Open _Apri_, Show _Mostra_, Hide _Nascondi_, Quit _Esci_, Reload _Ricarica_, Hard Reload _Ricaricamento manuale_, Not now _Non adesso_, Try Again _Riprova_, Learn More… _Scopri di più…_
- Close Tab _Chiudi scheda_, Close Other Tabs _Chiudi le altre schede_, Pin Tab _Fissa scheda_, Show Sidebar _Mostra la barra laterale_, Copy Link _Copia link_, Mark as Read _Segna come già letto_, Gmail's, Developer Tools _Strumenti per sviluppatori_
- _Confermi di voler eliminare questo messaggio?_ (Are you sure you want to delete this message?)
- _Impossibile trascinare allegati prima di averli scaricati. Vuoi scaricare questo allegato?_

## Platform words

The platform words table is in [it.platform.md](it.platform.md); read it when an entry has a `macOS`, `Windows` or `Linux` msgctxt.
