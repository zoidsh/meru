# Swedish (`sv`)

Swedish follows what Apple ships in macOS Mail and AppKit. Where this sheet and a habit from other software disagree, this sheet wins.

An entry whose `msgctxt` is `macOS`, `Windows` or `Linux` is an OS label, a label each operating system names its own way, such as the File menu or Paste. `macOS` takes Apple's word (Apple Mail's for a mail menu item), `Windows` Microsoft's and `Linux` GNOME's. Only the word changes: this sheet's address, capitalization and punctuation hold on every platform.

## Address

_du_, with _din_, _ditt_, _dina_ and _dig_, lowercase: _Är du säker … din_. Never _ni_.

## Buttons and menu items

The imperative: _Svara_, _Radera_, _Spara_, _Avbryt_, _Markera som läst_, _Stäng flik_. Delete is _Radera_; Remove is _Ta bort_.

## Capitalization

Sentence style: only the first word and proper nouns take a capital.

## Settings

_Inställningar_. The app-menu item with `msgctxt` `macOS` is _Inställningar…_, as AppKit writes it; with `Windows` or `Linux` it takes Microsoft's or GNOME's word, without the ellipsis the English lacks.

## Plural categories

`one` and `other`: `{count, plural, one {# flik} other {# flikar}}`. 0 takes `other`.

## Terms that stay English

Gmail, Google Workspace, Meru, Meru Pro and Pro. A compound joins with a hyphen: _Gmail-inställningar_, _Workspace-app_.

## Traps

- **No split compounds (_särskrivning_).** A compound is one word, or hyphenated after a name or abbreviation: _notistider_, _verifieringskod_, _Workspace-app_; never _notis tider_ or _verifierings kod_.
- **Notification is _notis_.** Apple writes _notis_, never _avisering_ or _meddelande_.
- **Email is _mejl_.** As Apple writes it, never _e-brev_, except where a string repeats Gmail's own text, such as its toast, which says _meddelande_.
- **Placeholders.** Definite endings attach to the noun; put the placeholder after the noun (_kontot {name}_).
- Quotation marks are ”…” (U+201D on both sides).

## Error messages

Say what happened, without _Tyvärr_ or _Ursäkta_: _Det gick inte att lägga till kontot._, as Apple writes _Det gick inte att byta namn på brevlådan ”%1$@”._

## Apple's words

From Mail's `MainMenu`, `Alerts` and `Localizable` tables and AppKit's `MenuCommands`. A string that names something Gmail also shows, such as the Undo button in the message-sent toast, takes Gmail's word from the glossary instead:

- Cancel _Avbryt_, OK _OK_, Undo _Ångra_, Close _Stäng_, Delete _Radera_, Remove _Ta bort_, Add _Lägg till_, Save _Spara_, Edit _Redigera_, Open _Öppna_, Show _Visa_, Hide _Göm_, Quit _Avsluta_, Reload _Uppdatera_, Try Again _Försök igen_, Learn More… _Läs mer…_
- Close Tab _Stäng flik_, Close Other Tabs _Stäng övriga flikar_, Close Window _Stäng fönster_, Pin Tab _Nåla fast flik_, Show Sidebar _Visa sidofältet_, Minimize _Minimera_, Copy Link _Kopiera länk_, Mark as Read _Markera som läst_, Add Account… _Lägg till konto…_, Quit Mail _Avsluta Mail_
- _Är du säker på att du vill radera detta mejl?_ (Are you sure you want to delete this message?)
- _Du kan inte dra bilagor förrän de har hämtats. Vill du hämta den här bilagan?_
