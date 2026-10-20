# French (`fr`)

French follows what Apple ships in macOS Mail and AppKit, for France. Where this sheet and a habit from other software disagree, this sheet wins.

## Address

_vous_, with _votre_ and _vos_: _votre boîte_, _Voulez-vous vraiment … ?_. Never _tu_.

## Buttons and menu items

The infinitive: _Répondre_, _Supprimer_, _Enregistrer_, _Annuler_, _Fermer l’onglet_. Never an imperative (_Supprimez_).

## Capitalization

Sentence style: only the first word and proper nouns take a capital, in labels and titles alike (_Fermer les autres onglets_, never _Fermer les Autres Onglets_).

## Settings

_Réglages_; the app-menu item is _Réglages…_.

## Plural categories

`one`, `many` and `other`. `one` covers 0 and 1 in French, `many` is for large round numbers (1 000 000), so its text is usually the same as `other`'s: `{count, plural, one {# onglet} many {# onglets} other {# onglets}}`.

## Terms that stay English

Gmail, Google Workspace, Meru, Meru Pro and Pro. They take French articles outside the word: _le compte Gmail_, _passer à Meru Pro_.

## Traps

- **Punctuation.** A no-break space (U+00A0) goes before `:`, `;`, `?` and `!`, and inside « » quotes: _Voulez-vous vraiment supprimer ce message ?_, « Réglages ». Never "…" straight quotes for prose.
- **Gendered forms.** Agree in the masculine (_Vous êtes connecté_) or rewrite around it (_Connexion établie_).
- **Placeholders and articles.** _le_, _la_, _l’_ and _de_/_d’_ change with the value. Put the placeholder after a noun (_le compte {name}_), never _de {name}_ where the value can start with a vowel.
- The apostrophe is ’ (U+2019), as Apple writes _l’onglet_.

## Error messages

Say what happened, without _Désolé_ or _Veuillez_: _Impossible d’ajouter le compte._, as Apple writes _La boîte aux lettres « %1$@ » n’a pu être renommée._

## Apple's words

From Mail's `MainMenu`, `Alerts` and `Localizable` tables and AppKit's `MenuCommands`:

- Cancel _Annuler_, OK _OK_, Undo _Annuler_, Close _Fermer_, Delete _Supprimer_, Remove _Supprimer_, Add _Ajouter_, Save _Enregistrer_, Edit _Modifier_, Open _Ouvrir_, Show _Afficher_, Hide _Masquer_, Quit _Quitter_, Reload _Recharger_, Try Again _Réessayer_, Learn More… _En savoir plus…_
- Close Tab _Fermer l’onglet_, Close Other Tabs _Fermer les autres onglets_, Close Window _Fermer la fenêtre_, Pin Tab _Épingler l’onglet_, Show Sidebar _Afficher la barre latérale_, Minimize _Minimiser_, Copy Link _Copier le lien_, Mark as Read _Marquer comme lu_, Quit Mail _Quitter Mail_
- _Souhaitez-vous vraiment supprimer ce message ?_ (Are you sure you want to delete this message?)
- _Il est impossible de glisser des pièces jointes qui n’ont pas été téléchargées. Souhaitez-vous télécharger cette pièce jointe ?_
