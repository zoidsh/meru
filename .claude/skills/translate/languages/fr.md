# French (`fr`)

French follows Apple's conventions in macOS Mail and AppKit, for France, for address, label form, capitalization, punctuation and the ellipsis. Its words follow two rules:

- **An OS label takes its platform's word.** An entry whose `msgctxt` is `macOS`, `Windows` or `Linux` is a label the operating system names its own way, such as the File menu or Paste. A label only macOS shows, such as the Window menu or Hide Others, is an OS label too and carries `macOS` alone. `macOS` takes Apple's word (Apple Mail's for a mail menu item), `Windows` Microsoft's and `Linux` GNOME's, from [Platform words](#platform-words) below. Only the word changes: address, capitalization, punctuation and the ellipsis stay this sheet's on every platform.
- **Everything else takes the house word**, from this sheet and the glossary, by the [source order](../source-order.md): Gmail's word for a term Gmail also shows, Google's for Google's names, and in Meru's own copy Chrome's word where Chrome has the term, else the apps' word the glossary counts and marks agent-chosen, with its tally. Apple is never the authority for a house word; its macOS apps are one vote of seven when the glossary counts the apps' word. Meru's own copy reads the same on every platform, and each rule in `fr.json` gives its word's source.

Where this sheet and a habit from other software disagree, this sheet wins.

## Address

_vous_, with _votre_ and _vos_: _votre boîte_, _Voulez-vous vraiment … ?_. Never _tu_, _toi_, _te_, _t’_, _ton_, _ta_ or _tes_.

## Buttons and menu items

The infinitive: _Répondre_, _Supprimer_, _Enregistrer_, _Annuler_, _Fermer l’onglet_. Never an imperative (_Supprimez_).

## Label forms

The form and case each kind of label takes, decided before the language's first run. Every label of a kind takes its form, whatever its English does; the examples are the catalog's own.

- **Button:** The infinitive, in sentence style: _Annuler_, _Enregistrer_, _Fermer l’onglet_.
- **Menu bar item:** The infinitive, in sentence style, the app menu the titlebar button pops up on Windows and Linux included: _Actualiser_, _Sélectionner l’onglet suivant_, _Gérer les comptes_.
- **Context or popup menu item:** The infinitive, in sentence style, as Chrome writes its own: _Copier l’URL_, _Fermer les autres onglets_, _Ouvrir dans le navigateur par défaut_.
- **Select option:** An option that names an action takes the infinitive, any other is the word itself, in sentence style: _Afficher_, _Masquer_, _Toujours_, _Jamais_, _Étroite_, _Uniquement sur demande_. An adjective option agrees with the setting's noun in gender and number: _Étroite_ under _Largeur_, _Réduit_ under _Affichage du lanceur_, _Claire_ under the tray icon's _Couleur_; a colour's name is its noun, masculine whatever the setting's noun: _Noir_, _Blanc_. An option that names a mode among options that are actions is no adjective of the label's noun: it takes the singular masculine, whatever the label's number, as _Automatique_ beside _Masquer_ and _Afficher_ under _Commandes de la fenêtre_.
- **Checkbox or switch label:** The infinitive, in sentence style: _Afficher les fenêtres_, _Ouvrir le dossier une fois terminé_, _Marquer l’e-mail comme lu après la copie_.
- **Setting description:** An infinitive clause in sentence style, ending in a period: _Ouvrir le dossier contenant le fichier à la fin d’un téléchargement._, _Demander où enregistrer chaque fichier avant de le télécharger._ One that says what the setting holds is a noun phrase, and an instruction for a step the user takes, such as Swipe…, the _vous_ imperative: _Balayez vers la gauche ou la droite…_
- **Setting description never opens with:** the _vous_ imperative of the English verb a description opens with, in its first word or the first word after a leading phrase's comma: Add _Ajoutez_; Ask _Demandez_; Block _Bloquez_; Check _Recherchez_ _Vérifiez_; Choose _Choisissez_; Close _Fermez_; Detect _Détectez_; Display _Affichez_; Export _Exportez_; Extend _Étendez_; Hide _Masquez_; List _Listez_; Mark _Marquez_; Move _Déplacez_; Open _Ouvrez_; Play _Émettez_ _Jouez_; Prompt _Demandez_; Receive _Recevez_; Recolor _Recolorez_; Remember _Mémorisez_; Render _Effectuez_; Run _Exécutez_; Select _Sélectionnez_; Send _Envoyez_; Set _Définissez_; Show _Affichez_; Start _Démarrez_; Stop _Empêchez_; Swipe _Balayez_; Unload _Déchargez_; Use _Utilisez_. `scripts/translate-rules.test.ts` fails on one, except a description that is itself an instruction the test names, and fails when a description opens with an English verb this line lacks.
- **OS label:** Its platform's word from [Platform words](#platform-words), in the form its source writes it, the infinitive or a noun for all three: _Coller_, _Quitter {appName}_, _Fichier_.

## Capitalization

Sentence style: only the first word and proper nouns take a capital, in labels and titles alike (_Fermer les autres onglets_, never _Fermer les Autres Onglets_). A label that opens something further ends in an ellipsis straight after the word, with no space: _Ajouter un compte…_.

## Settings

_Paramètres_, Chrome's word, in Meru's own copy: the window, its title and every mention of it. The app-menu item with `msgctxt` `macOS` is Apple's _Réglages…_, as AppKit writes it; with `Windows` or `Linux` it is Microsoft's and GNOME's _Paramètres_, without the ellipsis the English lacks. _Réglages_ appears in Meru's own copy only as macOS's own _Réglages Système_.

## Access keys

An `&` in the English marks the access key on Windows and Linux. Keep one `&` inline, before a letter of the French word: the English letter where the word has it, else the first free letter, one no other label in the same menu uses. macOS drops the `&`. The labels whose word has the English letter claim it first, in menu order; the rest then take their first free letter, in menu order. `packages/app/access-keys.test.ts` holds every catalog to this: it builds each menu and context menu Windows and Linux show, and fails when two items in one menu share a letter.

The page and text-field context menu, by that policy, on Windows: `&Learn Spelling` _&Ajouter au dictionnaire_, `&Search with Google` _&Rechercher avec Google_, `Cu&t` _Co&uper_, `&Copy` _&Copier_, `&Paste` _Co&ller_, `Paste and &Match Style` _Coller et adapter la &mise en forme_, `Select &All` _&Sélectionner tout_, `Sa&ve Image As…` _&Enregistrer l’image sous…_, `Copy Link Addr&ess` _Co&pier l’adresse du lien_, Chrome's words with the key on P, since a link in a text field shows it beside _Coll&er et adapter le style_ on Linux and never beside _&Enregistrer l’image sous…_, which an image shows in its place, `Cop&y Image` _Cop&ier l’image_, `C&opy Image Address` _C&opier l’adresse de l’image_. On Linux, where its words differ: `Paste and &Match Style` _Coll&er et adapter le style_, `Select &All` _&Tout sélectionner_, `Sa&ve Image As…` _E&nregistrer l’image sous…_.

## Plural categories

`one`, `many` and `other`. `one` covers 0 and 1 in French, `many` is for large round numbers (1 000 000), so its text is usually the same as `other`'s: `{count, plural, one {# onglet} many {# onglets} other {# onglets}}`.

## Terms that stay English

Gmail, Google Workspace, Meru, Meru Pro, Meru Portal and Pro. They take French articles outside the word: _le compte Gmail_, _passer à Meru Pro_.

## Traps

- **Punctuation.** A no-break space (U+00A0) goes before `:`, `;`, `?` and `!`, as Chrome writes it, never a plain or a narrow no-break space: _Voulez-vous vraiment supprimer ce message ?_. Quotation marks are « » with a no-break space inside each, as Apple writes them: « Paramètres ». Never straight "…" or English “…” quotes, which Chrome uses.
- **Numbers and units.** A no-break space (U+00A0) joins a number to its unit or to %, as Chrome writes it: _5 minutes_, _30 jours_, _50 %_, and in a plural _# jours_.
- **Gendered forms.** Agree in the masculine (_Vous êtes connecté_) or rewrite around it (_Connexion établie_).
- **Placeholders and articles.** _le_, _la_, _l’_ and _de_/_d’_ change with the value. Put the placeholder after a noun (_le compte {name}_), never _de {name}_ where the value can start with a vowel.
- The apostrophe is ’ (U+2019), as Apple writes _l’onglet_, never Chrome's straight '.
- **House words.** Where Chrome has a term, Meru's own copy takes Chrome's word; `fr.json`'s `banned` and `pinned` rules hold them, each with Chrome's count as its source. A bookmark is a _favori_, never a _signet_. An app is an _appli_ (_applis Google_, _appli Workspace_), or in full an _application_, never _app_. An email is an _e-mail_, never _email_ or _courriel_. A website is a _site Web_. Reloading is _Actualiser_ (_Actualisation forcée_), never Apple's _Recharger_. A verification code is a _code de validation_. The tab strip is the _barre d’onglets_. The tab context menu's Pin and Unpin are _Épingler_ and _Retirer_. The clipboard is the _presse-papiers_, phishing is _hameçonnage_, an on-screen button a _bouton_, a trusted host an _hôte approuvé_, and a release channel a _version_ (_version bêta_). A hibernated tab is _inactif_, Chrome's word for the tabs its Memory Saver unloads (_Onglet inactif_), never _en veille_, Windows' Sleep. Inspect Element is _Inspecter_, Chrome's Inspect item. The account colors Purple and Violet are _Violet_ and _Mauve_, as Chrome writes Purple and Violet, never _Pourpre_.
- **macOS's own elements.** The menu bar, the Dock, Finder and System Settings take Apple's names in Meru's own copy too, since they name Apple's interface and show only on macOS: _barre des menus_ (ControlCenterSettings.appex `Localizable` `Show in Menu Bar`), _Dock_ (DesktopSettings.appex `Localizable` `Dock`), _Finder_ and _Réglages Système_ (System Settings `InfoPlist` `CFBundleDisplayName`).

## Error messages

Say what happened, without _Désolé_ or _Veuillez_: _Impossible d’ajouter le compte._, as Apple writes _La boîte aux lettres « %1$@ » n’a pu être renommée._

## Common labels

House words for everyday actions, as Chrome writes its labels, in this sheet's label form. A string that names something Gmail also shows, such as the Undo button in the message-sent toast, takes Gmail's word from the glossary instead, and an entry with a platform `msgctxt` takes [its platform's word](#platform-words). Delete and Remove are one word, _Supprimer_, as Chrome writes both. The labels:

- Cancel _Annuler_, OK _OK_, Close _Fermer_, Delete _Supprimer_, Remove _Supprimer_, Add _Ajouter_, Save _Enregistrer_, Edit _Modifier_ as an action, while the Edit menu's title, which has no platform `msgctxt`, is _Édition_, the Edit title of Chrome's menu bar (Chrome 1/1 for the menu title in its macOS `locale.pak`, where its other 11 exact Edit messages are Edit buttons, _Modifier_), Open _Ouvrir_, Show _Afficher_, Hide _Masquer_, Quit _Quitter_, Reload _Actualiser_, Try Again _Réessayer_, Learn More… _En savoir plus…_
- Close Tab _Fermer l’onglet_, Close Other Tabs _Fermer les autres onglets_, Pin Tab _Épingler l’onglet_, Show Sidebar _Afficher la barre latérale_, Copy Link _Copier le lien_, Mark as Read _Marquer comme lu_, Developer Tools _Outils pour les développeurs_
- _Souhaitez-vous vraiment supprimer ce message ?_ (Are you sure you want to delete this message?)
- _Il est impossible de glisser des pièces jointes qui n’ont pas été téléchargées. Souhaitez-vous télécharger cette pièce jointe ?_

## Platform words

The platform words table is in [fr.platform.md](fr.platform.md); read it when an entry has a `macOS`, `Windows` or `Linux` msgctxt.
