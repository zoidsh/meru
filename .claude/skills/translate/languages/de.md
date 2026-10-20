# German (`de`)

German follows what Apple ships in macOS Mail and AppKit. Where this sheet and a habit from other software disagree, this sheet wins.

## Address

_du_, lowercase, with _dein_, _dir_ and _dich_ lowercase too: _Möchtest du … deinem Postfach_. Never _Sie_, _Ihr_ or _Ihnen_ for the user. _Sie_ was weighed against _du_ and rejected; it is not a choice a translation makes.

## Buttons and menu items

The infinitive, object first: _Antworten_, _Löschen_, _Abbrechen_, _Als gelesen markieren_, _Tab schließen_. Never an imperative (_Lösche_, _Schließe_).

## Capitalization

Sentence style, with nouns capitalized as German always does. A label that opens something further ends in an ellipsis after a no-break space (U+00A0): _Einstellungen …_, _Account hinzufügen …_.

## Settings

_Einstellungen_; the app-menu item is _Einstellungen …_.

## Plural categories

`one` and `other`. Every plural carries exactly these two, `=0` and other exact matches aside: `{count, plural, one {# Tab} other {# Tabs}}`.

## Terms that stay English

Gmail, Google Workspace, Meru, Meru Pro and Pro, never inflected inside the word. A compound joins with a hyphen: _Gmail-Einstellungen_, _Workspace-App_, _Meru-Pro-Funktionen_.

## Traps

- **Placeholders and articles.** An article or adjective before a placeholder must agree with every value it can take, which it usually cannot. Put the placeholder after a noun that carries the case (_im Account {name}_), or in its own phrase, never _der {name}_.
- **Gendered forms.** Address with _du_ avoids most of them; where a person is described, rewrite around the gender.
- _Mitteilung_, never _Benachrichtigung_, for a notification, as Apple writes it.
- English quotation marks become „…“ (U+201E, U+201C).

## Error messages

Say what happened, without _leider_, _Entschuldigung_ or _Bitte_: _Der Account konnte nicht hinzugefügt werden._, as Apple writes _Das Postfach „%1$@“ konnte nicht umbenannt werden._

## Apple's words

From Mail's `MainMenu`, `Alerts` and `Localizable` tables and AppKit's `MenuCommands`. A string that names something Gmail also shows, such as the Undo button in the message-sent toast, takes Gmail's word from the glossary instead:

- Cancel _Abbrechen_, OK _OK_, Undo _Widerrufen_, Close _Schließen_, Delete _Löschen_, Remove _Entfernen_, Add _Hinzufügen_, Save _Sichern_, Edit _Bearbeiten_, Open _Öffnen_, Show _Einblenden_, Hide _Ausblenden_, Quit _Beenden_, Reload _Neu laden_, Try Again _Erneut versuchen_, Learn More… _Weitere Infos …_
- Close Tab _Tab schließen_, Close Other Tabs _Andere Tabs schließen_, Close Window _Fenster schließen_, Pin Tab _Tab fixieren_, Show Sidebar _Seitenleiste einblenden_, Minimize _Im Dock ablegen_, Copy Link _Link kopieren_, Mark as Read _Als gelesen markieren_, Hide Mail _Mail ausblenden_, Quit Mail _Mail beenden_
- _Möchtest du diese Nachricht wirklich löschen?_ (Are you sure you want to delete this message?)
- _Du kannst Anhänge nicht bewegen, solange sie nicht geladen wurden. Möchtest du diesen Anhang laden?_
