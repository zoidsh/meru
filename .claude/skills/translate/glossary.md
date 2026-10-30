# Glossary

One fixed translation per term and catalog. Use it every time the term appears, inflected as the sentence needs, and never a synonym. Where a term is missing here, find its word by the source order below, and say in your summary which word you chose and where it came from, so it can be added.

## Where a word comes from

Every word here and in a style sheet comes from the first of these sources that has it, and says which:

1. **The operating system's own words**, its labels (File, Paste, Quit, Save As…) and the names of its parts (menu bar, Dock, Finder, System Settings, Do Not Disturb, system tray), come from the platform showing them: Apple on macOS, Microsoft on Windows, GNOME on Linux. An entry whose `msgctxt` is `macOS`, `Windows` or `Linux` is such a label, and takes its word from the style sheet's Platform words (Apple Mail's for a mail menu item). A part only macOS has, such as the menu bar or the Dock, takes Apple's name in Meru's own copy too.
2. **Gmail's own terms** take Gmail's word in that language: a folder, a Gmail action, the text of a toast over Gmail, so the two read the same side by side. The words are under [Gmail's words](#gmails-words) and [Move email to Trash](#move-email-to-trash); a Gmail term missing there takes Gmail's own word too. Gmail's register does not come with it: the style sheet's address form still applies, so German keeps _du_ where Gmail writes _Sie_.
3. **Google's names** take Google's word. The Workspace apps' names stay English, under [Terms that stay English](#terms-that-stay-english).
4. **Meru's own copy**, everything else, takes:
   1. Chrome's word where Chrome has the term, read from Chromium's translations at the Chromium version of the repository's Electron;
   2. a recorded call of the user's, which overrides Chrome only as a named exception with its reason; there are none now;
   3. otherwise the best-practice word for the language, researched in Microsoft's and GNOME's style guides and terminology and the language's major software localizations, with Apple's word as evidence but never as the authority.

Apple is a source only for the operating system's words in step 1. Grammar is not a word: address form, capitalization, label form, punctuation and the ellipsis follow Apple's conventions for each language, as its style sheet says.

Each word carries its source in brackets: **(Chrome n/N)**, Chrome's word in n of the N messages that have the term, counted in Chromium 156's `generated_resources`, `components_strings` and `ui_strings` translations; **(Apple …)**, **(Microsoft …)** or **(GNOME …)** for an operating system's word, cited as the style sheet's Platform words cite it; **(Gmail …)**; **(Google)**; or **(agent-chosen: reason)**, a word picked by the last step, which a speaker's review replaces. Use an agent-chosen word like any other.

Capitalization below is the base form inside a sentence. A label takes its language's label capitalization from the style sheet: `pt-BR` title-cases menu items, for example _Caixa de Entrada Unificada_.

## Terms that stay English

**Gmail**, **Google**, **Google Workspace**, **Meru**, **Meru Pro** and **Pro** are never translated, inflected inside the word or transliterated. They take the language's articles and case endings outside the word only where the style sheet allows it (Polish _w Gmailu_ is fine; _Gmaila_ in place of _Gmail_ in a label is not). In Japanese they stay in Latin letters with no space on either side: _Meru Proにアップグレード_. The same holds for the names of Google's apps when the interface shows them as names (Google): Calendar, Meet, Chat and Drive follow the Google account and are not Meru's to translate, so they stay as the source writes them unless a comment says otherwise. `Workspace` on its own is short for Google Workspace and stays English too.

## Settings

The window and Meru's own copy, also the Settings section of the language's style sheet. The app-menu item has a platform `msgctxt`: on macOS it is AppKit's word with AppKit's ellipsis, named below, and on Windows and Linux the platform's word, from the style sheet.

- de: Einstellungen (Chrome 430/436); the macOS menu item _Einstellungen …_ with a no-break space before the ellipsis (Apple)
- fr: Paramètres (Chrome 415/436); the macOS menu item _Réglages…_ (Apple)
- it: Impostazioni (Chrome 431/436); the macOS menu item _Impostazioni…_ (Apple)
- es: Configuración (Chrome 299/436, ajustes in the rest); the macOS menu item _Ajustes…_ (Apple)
- es-419: Configuración (Chrome 428/436); the macOS menu item _Configuración…_ (Apple)
- pt-BR: Configurações (Chrome 421/436); the macOS menu item _Ajustes…_ (Apple)
- nl: Instellingen (Chrome 431/436); the macOS menu item _Instellingen…_ (Apple)
- pl: Ustawienia (Chrome 430/436); the macOS menu item _Ustawienia…_ (Apple)
- sv: Inställningar (Chrome 431/436); the macOS menu item _Inställningar…_ (Apple)
- ja: 設定 (Chrome 431/436); the macOS menu item 設定… (Apple)

## Account

A Google account in Meru: _Add account_, _Remove account_, _Manage Accounts_.

- de: Konto, plural Konten (Chrome 392/404; _Konto hinzufügen …_). Never _Account_.
- fr: compte (Chrome 393/404; _Ajouter un compte…_)
- it: account, invariable (Chrome 402/404; _Aggiungi account…_), never _accounts_
- es: cuenta (Chrome 393/404; _Añadir cuenta…_)
- es-419: cuenta (Chrome 393/404; _Agregar cuenta…_)
- pt-BR: conta (Chrome 395/404; _Adicionar Conta…_)
- nl: account (Chrome 403/404; _Voeg account toe…_)
- pl: konto (Chrome 404/404; _Dodaj konto…_)
- sv: konto, plural konton (Chrome 390/404; _Lägg till konto…_)
- ja: アカウント (Chrome 389/404; アカウントを追加…)

## Tab

An entry in an account's vertical tabs strip.

- de: Tab, der; plural Tabs (Chrome 814/819; _Tab schließen_)
- fr: onglet (Chrome 747/819; _Fermer l’onglet_)
- it: scheda, plural schede (Chrome 748/819; _Chiudi scheda_), never _pannello_
- es: pestaña (Chrome 749/819; _Cerrar pestaña_)
- es-419: pestaña (Chrome 750/819)
- pt-BR: guia (Chrome 752/819; _Fechar Guia_), never _aba_
- nl: tabblad (Chrome 753/819; _Sluit tabblad_)
- pl: karta (Chrome 751/819; _Zamknij kartę_)
- sv: flik (Chrome 752/819; _Stäng flik_)
- ja: タブ (Chrome 755/819; タブを閉じる)

## Pinned tab, Pin, Unpin

A tab kept in the strip's upper section. _Pin_ and _Unpin_ are the context-menu actions; _Unpinned tabs_ is a hibernation option. The counts are of the messages with _pinned_; the labels are Chrome's tab context menu's _Pin tab_ and _Unpin_.

- de: angepinnter Tab; _Anpinnen_, _Loslösen_ (Chrome 16/16; _Tab anpinnen_, _Loslösen_)
- fr: onglet épinglé; _Épingler_, _Retirer_ (Chrome 16/16; _Épingler l’onglet_, _Retirer_)
- it: scheda fissata; _Fissa_, _Stacca_ (Chrome 13/16; _Fissa scheda_, _Stacca_)
- es: pestaña fija; _Fijar_, _Desfijar_ (Chrome 16/16; _Fijar pestaña_, _Desfijar_), never _anclar_
- es-419: pestaña fija; _Fijar_, _Dejar de fijar_ (Chrome 8/16, _fijada_ 4; _Fijar pestaña_, _Dejar de fijar_), never _anclar_
- pt-BR: guia fixada; _Fixar_, _Liberar_ (Chrome 16/16; _Fixar Guia_, _Liberar guia_)
- nl: vastgezet tabblad; _Zet vast_, _Maak los_ (Chrome 16/16; _Tabblad vastzetten_, _Losmaken_, in this sheet's imperative), never _vastmaken_
- pl: przypięta karta; _Przypnij_, _Odepnij_ (Chrome 15/16; _Przypnij kartę_, _Odepnij_)
- sv: fäst flik; _Fäst_, _Lossa_ (Chrome 14/16; _Fäst flik_, _Lossa_), never _nåla fast_
- ja: 固定タブ; 固定, 固定を解除 (Chrome 16/16; タブを固定, 固定を解除)

## Unified inbox

The page listing new mail across every account. A description, so lower case inside a sentence; the page title capitalizes its first word. Meru's own feature, built on Gmail's word for the inbox.

- de: gemeinsamer Posteingang (Gmail's _Posteingang_; agent-chosen: _gemeinsam_ reads as one inbox for several accounts)
- fr: boîte de réception unifiée (Gmail's _boîte de réception_; agent-chosen: _unifiée_ is the usual French for a merged inbox)
- it: posta in arrivo unificata (Gmail's _Posta in arrivo_; agent-chosen: _unificata_ is the usual Italian for a merged inbox)
- es: bandeja de entrada unificada (Gmail's _bandeja de entrada_; agent-chosen: _unificada_ is the usual Spanish for a merged inbox)
- es-419: bandeja de entrada unificada (Gmail's _bandeja de entrada_; agent-chosen: as for es)
- pt-BR: caixa de entrada unificada (Gmail's _Caixa de entrada_; agent-chosen: _unificada_ is the usual Portuguese for a merged inbox)
- nl: gecombineerde inbox (Gmail's _inbox_; agent-chosen: _gecombineerd_ is the usual Dutch for a merged inbox)
- pl: wspólna skrzynka odbiorcza (agent-chosen: Gmail's folder _Odebrane_ reads badly as a feature, so the phrase builds on _skrzynka odbiorcza_, the inbox in Polish mail software)
- sv: samlad inkorg (Gmail's _inkorg_; agent-chosen: _samlad_ is the usual Swedish for a merged inbox)
- ja: 統合受信トレイ (Gmail's 受信トレイ; agent-chosen: 統合 is the usual Japanese for a merged inbox)

## Do Not Disturb

A timed or indefinite hold on notifications. A part of the operating system, so Apple's names, from macOS's Focus strings, as each style sheet cites them; they keep Apple's capitalization as a feature name.

- de: Nicht stören (Apple)
- fr: Ne pas déranger (Apple)
- it: Non disturbare (Apple)
- es: No molestar (Apple)
- es-419: No molestar (Apple, DoNotDisturb.framework `MODE_NAME_DEFAULT`); Chrome's _No interrumpir_ is not the system's word
- pt-BR: Não Perturbe (Apple)
- nl: Niet storen (Apple)
- pl: Nie przeszkadzać (Apple)
- sv: Stör ej (Apple)
- ja: おやすみモード (Apple)

## Notification

- de: Benachrichtigung, plural Benachrichtigungen (Chrome 131/132). Never _Mitteilung_.
- fr: notification (Chrome 131/132)
- it: notifica, plural notifiche (Chrome 132/132)
- es: notificación (Chrome 132/132)
- es-419: notificación (Chrome 132/132)
- pt-BR: notificação (Chrome 132/132)
- nl: melding (Chrome 132/132), never _notificatie_
- pl: powiadomienie (Chrome 130/132)
- sv: avisering, plural aviseringar (Chrome 129/132). Never _notis_, which only a `macOS` label keeps.
- ja: 通知 (Chrome 130/132)

## Notification hours

The time windows outside which no notification is shown. The interface reads _Notification times_; one window is a _time window_. Built on the word for notification above; Chrome has neither term.

- de: Benachrichtigungszeiten; a window is a _Zeitfenster_ (agent-chosen: the compound on Benachrichtigung, and _Zeitfenster_, German's word for a slot of time)
- fr: horaires des notifications; a window is a _plage horaire_ (agent-chosen: _plage horaire_, French's word for a slot of time)
- it: orari delle notifiche; a window is una _fascia oraria_ (agent-chosen: _fascia oraria_, Italian's word for a slot of time)
- es: horario de notificaciones; a window is una _franja horaria_ (agent-chosen: _franja horaria_, Spain's word for a slot of time)
- es-419: horario de notificaciones; a window is un _intervalo de tiempo_ (agent-chosen: _intervalo de tiempo_, the Latin American wording)
- pt-BR: horários de notificação; a window is um _intervalo de horário_ (agent-chosen: _intervalo de horário_, Brazil's wording for a slot of time)
- nl: meldingstijden; a window is een _tijdvak_ (agent-chosen: the compound on melding, and _tijdvak_, Dutch's word for a slot of time)
- pl: godziny powiadomień; a window is _przedział czasu_ (agent-chosen: _przedział czasu_, Polish's word for a slot of time)
- sv: aviseringstider; a window is ett _tidsfönster_ (agent-chosen: the compound on avisering, and _tidsfönster_, Swedish's word for a slot of time)
- ja: 通知時間帯; a window is 時間帯 (agent-chosen: 時間帯, Japanese's word for a slot of time)

## Hibernation, Hibernate

Unloading an idle tab to give back its memory: _Hibernate idle tabs_, _Hibernate after_, _Hibernate When Idle_. Chrome has no word for it: its Memory Saver leaves an _inactive tab_, a state rather than the act. Every language takes its word for hibernating itself, never the operating system's word for sleep (macOS's Sleep, Windows' Sleep), which names the whole computer resting and would read as the computer going to sleep.

- de: Winterschlaf; _in den Winterschlaf versetzen_ (agent-chosen: _Ruhezustand_ is macOS's Sleep in German, so the literal hibernation)
- fr: hibernation; _mettre en hibernation_ (agent-chosen: _mise en veille_ is Windows' Sleep in French)
- it: ibernazione; _iberna_ (agent-chosen: the literal hibernation; Windows' Sleep is _sospensione_)
- es: hibernación; _hibernar_ (agent-chosen: the literal hibernation; Windows' Sleep is _suspender_)
- es-419: hibernación; _hibernar_ (agent-chosen: as for es)
- pt-BR: hibernação; _hibernar_ (agent-chosen: the literal hibernation; Windows' Sleep is _suspender_)
- nl: winterslaap; _in winterslaap zetten_ (agent-chosen: _slaapstand_ is Windows' Sleep and _sluimer_ macOS's in Dutch, so the literal hibernation)
- pl: hibernacja; _hibernuj_ (agent-chosen: the literal hibernation; the Sleep of both systems is _uśpij_)
- sv: dvala; _försätt i dvala_ (agent-chosen: _viloläge_ is the systems' Sleep in Swedish, and Chrome's word for it, so the word for an animal's hibernation)
- ja: 休止; 休止する (agent-chosen: the systems' Sleep is スリープ)

## Workspace app

A Google Workspace site opened as a tab or window. _Workspace_ stays English. The app word is Chrome's.

- de: Workspace-App, plural Workspace-Apps (Chrome's _App_ 470/472)
- fr: appli Workspace, plural applis Workspace (Chrome's _appli_ 456/472), never _app_
- it: app di Workspace (Chrome's _app_ 459/472)
- es: aplicación de Workspace (Chrome's _aplicación_ 433/472), never _app_ outside a `macOS` label
- es-419: app de Workspace (Chrome's _app_ 437/472)
- pt-BR: app do Workspace (Chrome's _app_ 441/472)
- nl: Workspace-app (Chrome's _app_ 460/472)
- pl: aplikacja Workspace (Chrome's _aplikacja_ 466/472)
- sv: Workspace-app (Chrome's _app_ 468/472)
- ja: Workspaceアプリ (Chrome's アプリ 457/472)

## App links tab

The one tab per app that every link to that app opens in. The badge setting reads _Show app links badge_. Built on Chrome's words for tab, link and app; the phrase is agent-chosen, since Chrome has no such tab.

- de: Tab für App-Links (agent-chosen: Chrome's _Tab_ and _Link_)
- fr: onglet des liens d’appli (agent-chosen: Chrome's _onglet_, _lien_ and _appli_)
- it: scheda dei link dell’app (agent-chosen: Chrome's _scheda_, _link_ and _app_)
- es: pestaña de enlaces de la aplicación (agent-chosen: Chrome's _pestaña_, _enlace_ and _aplicación_)
- es-419: pestaña de vínculos de la app (agent-chosen: Chrome's _pestaña_, _vínculo_ and _app_)
- pt-BR: guia de links do app (agent-chosen: Chrome's _guia_, _link_ and _app_)
- nl: tabblad voor app-links (agent-chosen: Chrome's _tabblad_, _link_ and _app_)
- pl: karta linków aplikacji (agent-chosen: Chrome's _karta_, _link_ and _aplikacja_)
- sv: flik för applänkar (agent-chosen: Chrome's _flik_, _länk_ and _app_)
- ja: アプリリンク用タブ (agent-chosen: Chrome's タブ, リンク and アプリ)

## Saved search

A named Gmail query an account keeps. Built on Chrome's words for save and search, in the messages with _save_ (N 593) and _search_ (N 356).

- de: gespeicherte Suche (Chrome's _speichern_ 582/593, _Suche_ 348/356)
- fr: recherche enregistrée (Chrome's _enregistrer_ 577/593, _recherche_ 353/356)
- it: ricerca salvata (Chrome's _salvare_ 569/593, _ricerca_ 355/356)
- es: búsqueda guardada (Chrome's _guardar_ 570/593, _búsqueda_ 350/356)
- es-419: búsqueda guardada (Chrome's _guardar_ 563/593, _búsqueda_ 349/356)
- pt-BR: pesquisa salva (Chrome's _salvar_ 578/593, _pesquisa_ 346/356), never _busca_
- nl: opgeslagen zoekopdracht (Chrome's _opslaan_ 505/593, _zoeken_ 350/356); _Bewaar_ only in a `macOS` label
- pl: zapisane wyszukiwanie (Chrome's _zapisać_ 576/593, _wyszukiwanie_ 348/356)
- sv: sparad sökning (Chrome's _spara_ 591/593, _sökning_ 352/356)
- ja: 保存した検索 (Chrome's 保存 582/593, 検索 351/356)

## Bookmark

A saved URL for an account, opened from the bookmarks popup.

- de: Lesezeichen (Chrome 163/163)
- fr: favori, plural favoris (Chrome 163/163; _Ajouter aux favoris_), never _signet_
- it: preferito, plural preferiti (Chrome 158/163; _Preferiti_, _Aggiungi ai Preferiti_), never _segnalibro_
- es: marcador (Chrome 163/163)
- es-419: favorito (Chrome 151/163), never _marcador_
- pt-BR: favorito (Chrome 160/163)
- nl: bookmark (Chrome 161/163), never _bladwijzer_
- pl: zakładka (Chrome 163/163)
- sv: bokmärke (Chrome 163/163)
- ja: ブックマーク (Chrome 163/163)

## Launcher

The titlebar or sidebar dropdown that opens a workspace app. Chrome's word is ChromeOS's launcher, which opens apps as Meru's does.

- de: Launcher (Chrome 18/20)
- fr: lanceur (Chrome 19/20)
- it: Avvio app (Chrome 19/20), capitalized as Chrome writes the name
- es: menú de aplicaciones (Chrome 19/20)
- es-419: selector (Chrome 17/20)
- pt-BR: iniciador (Chrome's _Launcher_ label, 2/2; its launcher key is the _tecla de acesso rápido_)
- nl: launcher (Chrome 20/20)
- pl: menu z aplikacjami (Chrome 19/20)
- sv: appstartare (Chrome 12/20)
- ja: ランチャー (Chrome 19/20)

## Vertical tabs

The strip down the left edge of the window. Chrome writes the term in 2 messages.

- de: vertikale Tabs (Chrome 2/2)
- fr: onglets verticaux (Chrome 1/2)
- it: schede verticali (Chrome 1/2)
- es: pestañas verticales (Chrome 1/2)
- es-419: pestañas verticales (Chrome 2/2)
- pt-BR: guias verticais (Chrome 1/2)
- nl: verticale tabbladen (Chrome 2/2)
- pl: karty pionowe (Chrome 2/2)
- sv: vertikala flikar (Chrome 2/2)
- ja: 縦型タブ (agent-chosen: Chrome's two messages word it as a sentence, not a name; 縦型 is the usual Japanese for an upright layout, with Chrome's タブ)

## Titlebar

The strip across the top of the window.

- de: Titelleiste (Chrome 5/5)
- fr: barre de titre (Chrome 5/5)
- it: barra del titolo (Chrome 5/5)
- es: barra de título (Chrome 5/5)
- es-419: barra de título (Chrome 5/5)
- pt-BR: barra de título (Chrome 5/5)
- nl: titelbalk (Chrome 5/5)
- pl: pasek tytułu (Chrome 4/5), never _pasek tytułowy_
- sv: namnlist (Chrome 5/5)
- ja: タイトルバー (Chrome 4/5)

## Sidebar

The column down the side of the window that holds the vertical tabs. Chrome names one in its _Toggle sidebar_ (1/1); its _side panel_ is a different thing, a panel beside the page.

- de: Seitenleiste (Chrome 1/1)
- fr: barre latérale (Chrome 1/1)
- it: barra laterale (Chrome 1/1)
- es: barra lateral (Chrome 1/1)
- es-419: barra lateral (Chrome 1/1)
- pt-BR: barra lateral (Chrome 1/1)
- nl: zijbalk (Chrome 1/1)
- pl: pasek boczny (Chrome 1/1)
- sv: sidofält (Chrome 1/1)
- ja: サイドバー (Chrome 1/1)

## Menu bar icon, System tray icon

The icon in the macOS menu bar, or in the Windows and Linux system tray. Both are parts of the operating system: the menu bar takes Apple's name, the first word below, and the system tray strings carry a `Windows` or `Linux` `msgctxt` and take Microsoft's word, the second, and on Linux the style sheet's word, the third where it differs.

- de: Menüleiste (Apple); Infobereich (Microsoft); Linux _Statusbereich_ (inferred from Microsoft)
- fr: barre des menus (Apple); zone de notification (Microsoft)
- it: barra dei menu (Apple); area di notifica (Microsoft)
- es: barra de menús (Apple); bandeja del sistema (Microsoft)
- es-419: barra de menús (Apple); bandeja del sistema (Microsoft)
- pt-BR: barra de menus (Apple); bandeja do sistema (Microsoft)
- nl: menubalk (Apple); systeemvak (Microsoft)
- pl: pasek menu (Apple); obszar powiadomień (Microsoft)
- sv: menyrad (Apple); systemfält (Microsoft)
- ja: メニューバー (Apple); 通知領域 (Microsoft); Linux _システムトレイ_ (inferred from Microsoft)

## Window

- de: Fenster (Chrome 203/241)
- fr: fenêtre (Chrome 201/241)
- it: finestra (Chrome 202/241)
- es: ventana (Chrome 202/241)
- es-419: ventana (Chrome 198/241)
- pt-BR: janela (Chrome 200/241)
- nl: venster (Chrome 200/241)
- pl: okno (Chrome 201/241)
- sv: fönster (Chrome 174/241)
- ja: ウィンドウ in Meru's own copy (Chrome 193/241, ウインドウ 7), never ウインドウ; a `macOS` label such as the Window menu takes Apple's ウインドウ

## Verification code

A one-time passcode Meru copies to the clipboard.

- de: Bestätigungscode (Chrome 7/7)
- fr: code de validation (Chrome 7/7), never _code de vérification_
- it: codice di verifica (Chrome 7/7)
- es: código de verificación (Chrome 4/7)
- es-419: código de verificación (Chrome 5/7)
- pt-BR: código de verificação (Chrome 4/7)
- nl: verificatiecode (Chrome 7/7)
- pl: kod weryfikacyjny (Chrome 7/7)
- sv: verifieringskod (Chrome 7/7)
- ja: 確認コード (Chrome 7/7)

## Move email to Trash

The verification-codes switch. It names Gmail's own folder, so _Trash_ takes Gmail's word. Never a word for _delete_. Source: Gmail Help, "Delete or recover deleted Gmail messages" (support.google.com/mail/answer/7401, `hl=<tag>`).

- de: Papierkorb (Gmail)
- fr: Corbeille (Gmail)
- it: Cestino (Gmail)
- es: Papelera (Gmail)
- es-419: Papelera (Gmail)
- pt-BR: Lixeira (Gmail)
- nl: Prullenbak (Gmail)
- pl: Kosz (Gmail)
- sv: Papperskorgen (Gmail)
- ja: ゴミ箱 (Gmail)

## Extension

A Chrome extension from Meru's list.

- de: Erweiterung (Chrome 300/308)
- fr: extension (Chrome 308/308)
- it: estensione (Chrome 306/308)
- es: extensión (Chrome 307/308)
- es-419: extensión (Chrome 308/308)
- pt-BR: extensão (Chrome 307/307)
- nl: extensie (Chrome 303/308)
- pl: rozszerzenie (Chrome 304/308)
- sv: tillägg (Chrome 302/308)
- ja: 拡張機能 (Chrome 299/308), never 機能拡張

## Experimental, Beta

The two maturity badges, and _Beta_ is also the update channel beside _Stable_. Never a third word. Experimental is counted in Chrome's 9 messages with it; Beta and Stable are its channel names.

- de: Experimentell (Chrome 9/9); Beta; Stabil (Chrome)
- fr: Expérimental (Chrome 9/9); Bêta; Stable (Chrome)
- it: Sperimentale (Chrome 8/9); Beta; Stabile (Chrome)
- es: Experimental (Chrome 9/9); Beta; Estable (Chrome)
- es-419: Experimental (Chrome 9/9); Beta; Estable (Chrome)
- pt-BR: Experimental (Chrome 8/9); Beta; Estável (Chrome)
- nl: Experimenteel (Chrome, as _experimentele_ in most of its 9); Bèta; Stabiel (Chrome)
- pl: Eksperymentalne (Chrome 9/9); Beta; Stabilna (Chrome)
- sv: Experimentell (Chrome 9/9); Beta; Stabil (Chrome)
- ja: 試験運用版 (Chrome 9/9, as 試験運用); ベータ版; Stable, in Latin letters (Chrome, both channel names)

## Load on Launch

The pinned tab's context-menu item deciding whether it comes back as a view at start. Built on Chrome's word for startup, in its 10 messages with _on startup_ or _at launch_.

- de: Beim Start laden (Chrome's _Start_ 10/10)
- fr: Charger au démarrage (Chrome's _démarrage_ 10/10)
- it: Carica all’avvio (Chrome's _avvio_ 9/10)
- es: Cargar al iniciar (Chrome's _iniciar_ 8/10)
- es-419: Cargar al iniciar (Chrome's _iniciar_ 8/10)
- pt-BR: Carregar ao Iniciar (Chrome's _iniciar_ 10/10)
- nl: Laad bij opstarten (Chrome's _opstarten_ 8/10)
- pl: Wczytuj przy uruchomieniu (Chrome's _uruchomienie_ 3/10; agent-chosen phrase: _przy uruchomieniu_ is the usual Polish for at startup)
- sv: Läs in vid start (Chrome's _start_ 10/10)
- ja: 起動時に読み込む (Chrome's 起動時 9/10)

## Upgrade

Reaching Pro, in buttons and prose alike. Never a word for _purchase_ or _buy_. Chrome's wording for upgrading to something newer, in its 8 messages with _upgrade to_.

- de: Upgrade; _Auf Meru Pro upgraden_. In a sentence, the noun: _ein Upgrade auf Meru Pro_, as in _Mit einem Upgrade auf Meru Pro kannst du weitere Konten hinzufügen._ (Chrome's noun _Upgrade_, in _Durch dieses Upgrade_; Chrome words the verb around it, with _umstellen_, so the verb _upgraden_ is agent-chosen: the noun's verb, which German software writes)
- fr: Passer à Meru Pro (Chrome 6/8, _passez à_)
- it: Esegui l’upgrade a Meru Pro; in a sentence _fai l’upgrade a Meru Pro_ (Chrome 7/8, _esegui l’upgrade_, _fare l’upgrade a_)
- es: Cambiar a Meru Pro (Chrome 5/8, _cambia este modelo_, _cambie a HTTPS_)
- es-419: Actualizar a Meru Pro (Chrome 5/8, _actualice a HTTPS_)
- pt-BR: Fazer Upgrade para o Meru Pro (Chrome 4/8, _faça upgrade para_)
- nl: Upgrade naar Meru Pro (Chrome 5/8, _Upgrade naar een nieuwer model_)
- pl: Przejdź na Meru Pro (Chrome 6/8, _przejdź na nowszy model_)
- sv: Uppgradera till Meru Pro (Chrome 6/8, _Uppgradera till en nyare modell_)
- ja: Meru Proにアップグレード. In a sentence, the same verb: _Meru Proにアップグレードすると、アカウントをさらに追加できます_ (Chrome 6/8, 新しいモデルにアップグレード)

## License key, Trial, Device

Chrome has no license key or trial; the device is Chrome's word.

- de: Lizenzschlüssel; Testzeitraum; Gerät (Chrome 981/1011; the first two agent-chosen: the usual German for a software license and its trial)
- fr: clé de licence; période d’essai; appareil (Chrome 959/1011; the first two agent-chosen: the usual French for a software license and its trial)
- it: chiave di licenza; periodo di prova; dispositivo (Chrome 983/1011; the first two agent-chosen: the usual Italian for a software license and its trial)
- es: clave de licencia; periodo de prueba; dispositivo (Chrome 985/1011; the first two agent-chosen: the usual Spanish for a software license and its trial)
- es-419: clave de licencia; período de prueba; dispositivo (Chrome 983/1011; the first two agent-chosen: as for es, with the Latin American accent on _período_)
- pt-BR: chave de licença; período de avaliação; dispositivo (Chrome 976/1010; the first two agent-chosen: the usual Brazilian Portuguese for a software license and its trial)
- nl: licentiesleutel; proefperiode; apparaat (Chrome 984/1011; the first two agent-chosen: the usual Dutch for a software license and its trial)
- pl: klucz licencyjny; okres próbny; urządzenie (Chrome 997/1011; the first two agent-chosen: the usual Polish for a software license and its trial)
- sv: licensnyckel; provperiod; enhet (Chrome 983/1011; the first two agent-chosen: the usual Swedish for a software license and its trial)
- ja: ライセンスキー; 試用期間; デバイス (Chrome 984/1011; the first two agent-chosen: the usual Japanese for a software license and its trial)

## Download history

Counted in Chrome's 10 messages with _download history_.

- de: Downloadverlauf for the page, in _Download history_, _Full download history_ and _Close download history_ (Chrome 10/10); the recent download history popup is _Letzte Downloads_ (_Letzte Downloads anzeigen_), never _Aktueller Downloadverlauf_ (the user's call, from Chrome's _Letzte Downloads_)
- fr: historique des téléchargements, in _Historique complet des téléchargements_ and _Fermer l’historique des téléchargements_ (Chrome 7/10); the recent download history popup is _Historique des téléchargements récents_ (Chrome)
- it: cronologia dei download; the page's title _Cronologia download_ (Chrome 10/10); the recent download history popup is _Cronologia dei download recenti_ (Chrome)
- es: historial de descargas (Chrome 10/10), also in _Historial de descargas recientes_
- es-419: historial de descargas (Chrome 10/10), also in _Historial de descargas recientes_
- pt-BR: histórico de downloads (Chrome 8/10), also in _Histórico de downloads recentes_
- nl: downloadgeschiedenis (Chrome 10/10)
- pl: historia pobierania (Chrome 10/10)
- sv: nedladdningshistorik (Chrome 10/10), never _hämtningshistorik_; downloading is _ladda ned_, a download a _nedladdning_
- ja: ダウンロード履歴 (Chrome 10/10)

## Dark theme, Blocker, Spellchecker

The dark theme is Chrome's _Dark theme_ label; Chrome has no blocker; the spellchecker is counted in its 23 messages with _spell check_.

- de: dunkles Design (Chrome 1/1); Blocker (agent-chosen: the English loan German software keeps); Rechtschreibprüfung (Chrome 22/23)
- fr: thème sombre (Chrome 1/1); bloqueur (agent-chosen: the usual French for a content blocker); correcteur orthographique (Chrome 21/23)
- it: tema scuro (Chrome 1/1); blocco contenuti (agent-chosen: the usual Italian for a content blocker); controllo ortografico (Chrome 22/23)
- es: tema oscuro (Chrome 1/1); bloqueador (agent-chosen: the usual Spanish for a content blocker); corrector ortográfico (Chrome 14/23)
- es-419: tema oscuro (Chrome 1/1); bloqueador (agent-chosen: as for es); corrector ortográfico (Chrome 21/23)
- pt-BR: tema escuro (Chrome 1/1); bloqueador (agent-chosen: the usual Portuguese for a content blocker); verificação ortográfica (Chrome 20/23)
- nl: donker thema (Chrome 1/1); blokkering (agent-chosen: the usual Dutch for a content blocker); spellingcontrole (Chrome 22/23)
- pl: ciemny motyw (Chrome 1/1); blokowanie (agent-chosen: the usual Polish for blocking content); sprawdzanie pisowni (Chrome 22/23)
- sv: mörkt tema (Chrome 1/1); blockerare (agent-chosen: the usual Swedish for a content blocker); stavningskontroll (Chrome 22/23)
- ja: ダークモード (Chrome 1/1); ブロッカー (agent-chosen: the loan Japanese software uses); スペルチェック (Chrome 22/23)

## Keyboard keys

A key named in a sentence, such as the Workspace apps Mode setting's _hold Cmd_ or _Ctrl_ and _Shift_. The keys are the operating system's, so they take its names. The source writes the short form printed on keys, so keep a short form where the language has one: Cmd and Option on macOS, Ctrl, Shift and Alt on Windows and Linux. Cmd and Ctrl are separate messages already, and Shift carries a platform `msgctxt`: `macOS` takes Apple's name, `Windows` Microsoft's and `Linux` GNOME's, from the style sheet's Platform words where it has them. Sources: **Apple** is "Mac keyboard shortcuts" (support.apple.com/<locale>/102650), which names each key with its short form in brackets; **Microsoft** is "Keyboard shortcuts in Windows" (support.microsoft.com/<locale>/windows/keyboard-shortcuts-in-windows-dcc61a57-8ff0-cffe-9796-cb9706c75eec). Each line gives Apple's Command, Shift, Option and Control, then Microsoft's Ctrl, Shift and Alt.

- de: Apple Befehlstaste (Cmd), Umschalttaste, Wahltaste (Alt), Control-Taste (Ctrl); Microsoft Strg, Umschalt, Alt (Microsoft writes them in capitals, STRG and UMSCHALT)
- fr: Apple Commande (Cmd), Maj, Option (Alt), Contrôle (Ctrl); Microsoft Ctrl, Maj, Alt
- it: Apple Comando (Cmd), Maiuscole, Opzione (Alt), Control (Ctrl); Microsoft Ctrl, Maiusc, Alt (Microsoft writes them in capitals, CTRL and MAIUSC)
- es: Apple Comando (Cmd), Mayúsculas, Opción (Alt), Control (Ctrl); Microsoft Ctrl, Mayús, Alt
- es-419: Apple Comando (Cmd), Mayúsculas, Opción (Alt), Control (Ctrl); Microsoft Ctrl, Mayús, Alt
- pt-BR: Apple Command (Cmd), Shift, Option (Alt), Control (Ctrl); Microsoft Ctrl, Shift, Alt
- nl: Apple Command (Cmd), Shift, Option (Alt), Control (Ctrl); Microsoft Ctrl, Shift, Alt
- pl: Apple Command (Cmd), Shift, Option (Alt), Control (Ctrl); Microsoft Ctrl, Shift, Alt
- sv: Apple Kommando (Kmd), Skift, Alternativ (Alt), Kontroll (Ctrl); Microsoft Ctrl, Skift, Alt
- ja: Apple command (cmd), shift, option (alt), control (ctrl), in lower case; Microsoft Ctrl, Shift, Alt, with キー after the name in running prose

## Toast

A brief message Meru shows over its window or over Gmail, such as the one after a setting changes, and the region the toasts appear in, which the interface reads as _Notifications_ with `msgctxt` `toasts`. Chrome has no word for one. Never the word for a system [notification](#notification), and in each language clearly apart from it.

- de: Hinweis, plural Hinweise (_Hinweis schließen_) (agent-chosen: a short notice, apart from Benachrichtigung)
- fr: avis (_Fermer l’avis_), never _notification_ (agent-chosen: a short notice, apart from notification)
- it: avviso, plural avvisi (_Chiudi avviso_), never _notifica_ (agent-chosen: a short notice, apart from notifica; to notify is therefore _notificare_, never _avvisare_)
- es: aviso, plural avisos (_Cerrar aviso_), never _notificación_ (agent-chosen: a short notice, apart from notificación)
- es-419: aviso, plural avisos (_Cerrar aviso_), never _notificación_ (agent-chosen: as for es)
- pt-BR: aviso, plural avisos (_Fechar Aviso_), never _notificação_ (agent-chosen: a short notice, apart from notificação)
- nl: mededeling, plural mededelingen (_Sluit mededeling_), never _melding_ (agent-chosen: a short notice, apart from melding)
- pl: komunikat, plural komunikaty (_Zamknij komunikat_), never _powiadomienie_ (agent-chosen: a short message, apart from powiadomienie)
- sv: inforuta, plural inforutor (_Stäng inforuta_), never _avisering_ (agent-chosen: a small information box, apart from avisering)
- ja: お知らせ (お知らせを閉じる), never 通知 (agent-chosen: a notice, apart from 通知)

## Unread badge

The count on an account, a tab or the dock icon for its unread emails: _Show unread badge_, _Unread badge_. Chrome has no word for one; the operating systems' own badge words were weighed as evidence only.

- de: Kennzeichen; in full _Kennzeichen für ungelesene E-Mails_ (_Kennzeichen für ungelesene E-Mails anzeigen_), never the coined _Ungelesen-Kennzeichen_ (agent-chosen: a mark on an icon, spelled out with what it counts)
- fr: pastille; in full _pastille des e-mails non lus_ (_Afficher la pastille des e-mails non lus_) (agent-chosen: the round mark French software puts on an icon)
- it: badge; in full _badge delle email non lette_ (_Mostra il badge delle email non lette_) (agent-chosen: the loan Italian software uses)
- es: indicador de no leídos (_Mostrar indicador de no leídos_) (agent-chosen: says what it shows; Apple's _Globos_ names a balloon)
- es-419: indicador de no leídos (_Mostrar indicador de no leídos_) (agent-chosen: as for es; Apple's _Contadores_ names any counter)
- pt-BR: indicador de não lidos (_Mostrar Indicador de Não Lidos_) (agent-chosen: says what it shows, and apart from the toast's _aviso_)
- nl: badge; in full _badge voor ongelezen e-mails_ (_Toon badge voor ongelezen e-mails_) (agent-chosen: the loan Dutch software uses)
- pl: plakietka; in full _plakietka z liczbą nieprzeczytanych_ (_Pokaż plakietkę z liczbą nieprzeczytanych_) (agent-chosen: the small tag Polish software puts on an icon)
- sv: symbolbricka; in full _symbolbricka för olästa_ (_Visa symbolbricka för olästa_) (agent-chosen: the tag Swedish software puts on an icon, joined to symbol so it reads as the icon's)
- ja: 未読バッジ (未読バッジを表示) (agent-chosen: the loan Japanese software uses, with 未読)

The badge on an account's row in Settings, `msgctxt` `account row badge`, sits on a row that cannot wrap, so it takes the shortest form, the language's plain word for unread (agent-chosen):

- de: Ungelesen
- fr: Non lus
- it: Non lette
- es: No leídos
- es-419: No leídos
- pt-BR: Não lidos
- nl: Ongelezen
- pl: Nieprzeczytane
- sv: Olästa
- ja: 未読

## Tab strip

The tabs within an account, which Workspace apps' New windows mode leaves out: _Narrow the tab strip_. Counted in Chrome's 9 messages with _tab strip_.

- de: Tableiste (_Tableiste verschmälern_) (Chrome 8/9)
- fr: barre d’onglets (_Réduire la barre d’onglets_) (Chrome 9/9)
- it: tabstrip, feminine (_Restringi la tabstrip_) (Chrome 9/9)
- es: barra de pestañas (_Estrechar la barra de pestañas_) (Chrome 9/9)
- es-419: barra de pestañas (_Estrechar la barra de pestañas_) (Chrome 9/9)
- pt-BR: barra de guias (_Estreitar a Barra de Guias_) (Chrome 7/9)
- nl: tabbladstrook (_Maak de tabbladstrook smaller_) (Chrome 9/9)
- pl: pasek kart (_Zwęź pasek kart_) (Chrome 9/9)
- sv: flikhuvud (_Gör flikhuvudet smalare_) (Chrome 9/9)
- ja: タブバー (タブバーを狭くする) (Chrome 9/9), never タブストリップ

## Label, Meru's

The name Meru shows for an account or a saved search, in its _Label_ field and _Enter a label_ with `msgctxt` `saved search`. Never Gmail's label, which is under [Starred, Snooze, Label](#starred-snooze-label) and carries `msgctxt` `Gmail label`. It is a display name, so it takes Chrome's word for a name, in its 7 _Name_ labels; calling it a name rather than a label is agent-chosen, to keep it apart from Gmail's.

- de: Name (_Namen eingeben_) (agent-chosen, with Chrome's _Name_ 6/7)
- fr: nom (_Saisir un nom_) (agent-chosen, with Chrome's _Nom_ 7/7)
- it: nome (_Inserisci un nome_) (agent-chosen, with Chrome's _Nome_ 7/7)
- es: nombre (_Introduce un nombre_) (agent-chosen, with Chrome's _Nombre_ 7/7)
- es-419: nombre (_Ingresa un nombre_) (agent-chosen, with Chrome's _Nombre_ 7/7)
- pt-BR: nome (_Digite um nome_) (agent-chosen, with Chrome's _Nome_ 7/7)
- nl: naam (_Voer een naam in_) (agent-chosen, with Chrome's _Naam_ 7/7)
- pl: nazwa (_Wpisz nazwę_) (agent-chosen, with Chrome's _Nazwa_ 4/7)
- sv: namn (_Ange ett namn_) (agent-chosen, with Chrome's _Namn_ 7/7)
- ja: 名前 (名前を入力) (agent-chosen, with Chrome's 名前 7/7)

## Device label

The name this computer goes by among the devices using a license key. Chrome's word for a device name, counted in its 11 messages with _device name_.

- de: Gerätename (_Gerätenamen eingeben_) (Chrome 11/11)
- fr: nom de l’appareil (_Saisir le nom de l’appareil_) (Chrome 6/11)
- it: nome del dispositivo (_Inserisci il nome del dispositivo_) (Chrome 4/11, the rest _nome dispositivo_)
- es: nombre del dispositivo (_Introduce un nombre del dispositivo_) (Chrome 6/11)
- es-419: nombre del dispositivo (_Ingresa un nombre del dispositivo_) (Chrome 5/11)
- pt-BR: nome do dispositivo (_Digite um nome do dispositivo_) (Chrome 8/11)
- nl: apparaatnaam (_Voer een apparaatnaam in_) (Chrome 9/11)
- pl: nazwa urządzenia (_Wpisz nazwę urządzenia_) (Chrome 10/11)
- sv: enhetsnamn (_Ange ett enhetsnamn_) (Chrome 7/11)
- ja: デバイス名 (デバイス名を入力) (Chrome 10/11)

## Release channel

Which releases Meru updates to, Stable or [Beta](#experimental-beta): _Release channel_, _Switch to the beta channel?_ Chrome's word for a channel, in its 11 messages with _channel_; the compounds are agent-chosen where Chrome has none.

- de: Update-Kanal; _Beta-Kanal_ (_Zum Beta-Kanal wechseln?_) (Chrome's _Kanal_ 10/11; agent-chosen compounds: German joins them with a hyphen)
- fr: version de mise à jour; _version bêta_ (_Passer à la version bêta ?_, with a no-break space before ?) (Chrome 10/11)
- it: canale di aggiornamento; _canale beta_ (_Passare al canale beta?_) (Chrome 11/11)
- es: canal de versiones; _canal beta_ (_¿Cambiar al canal beta?_) (Chrome's _canal_ 11/11)
- es-419: canal de versiones; _canal beta_ (_¿Cambiar al canal beta?_) (Chrome's _canal_ 11/11)
- pt-BR: canal de versões; _canal beta_ (_Mudar para o canal beta?_) (Chrome's _canal_ 11/11)
- nl: updatekanaal; _bètakanaal_ (_Overschakelen naar het bètakanaal?_) (Chrome's _kanaal_ 11/11 and _Bèta_; agent-chosen compounds: Dutch closes them up)
- pl: kanał aktualizacji; _kanał beta_ (_Przełączyć na kanał beta?_) (Chrome's _kanał_ 8/11)
- sv: uppdateringskanal; _betakanal_ (_Vill du byta till betakanalen?_) (Chrome's _kanal_ 11/11; agent-chosen compounds: Swedish closes them up)
- ja: リリースチャンネル; ベータチャンネル (ベータチャンネルに切り替えますか?) (Chrome's チャンネル 11/11; agent-chosen compounds: リリース names what the channel delivers)

## Trusted hosts

The hosts whose links open without the link prompt: _Trusted hosts_, _links from untrusted hosts_. Chrome's word for trusted, in its 22 messages with _trusted_, with its _host_.

- de: vertrauenswürdige Hosts; _nicht vertrauenswürdige Hosts_ (Chrome 20/22)
- fr: hôtes approuvés; _hôtes non approuvés_ (Chrome 14/22)
- it: host attendibili; _host non attendibili_ (Chrome 19/22)
- es: hosts de confianza; _hosts que no son de confianza_ (Chrome 10/22, its most common form)
- es-419: hosts de confianza; _hosts que no son de confianza_ (Chrome 13/22)
- pt-BR: hosts confiáveis; _hosts não confiáveis_ (Chrome 21/22)
- nl: vertrouwde hosts; _niet-vertrouwde hosts_ (Chrome 21/22)
- pl: zaufane hosty; _niezaufane hosty_ (Chrome 19/22)
- sv: betrodda värdar; _ej betrodda värdar_ (Chrome 16/22)
- ja: 信頼するホスト; 信頼されていないホスト (Chrome's 信頼 22/22)

## Phishing protection

Chrome's word for phishing, in its 4 messages with it; the protection phrase is the language's ordinary one.

- de: Phishing-Schutz (Chrome's _Phishing_ 4/4)
- fr: protection contre l’hameçonnage (Chrome's _hameçonnage_ 4/4)
- it: protezione dal phishing (Chrome's _phishing_ 4/4)
- es: protección contra phishing (Chrome's _phishing_ 4/4)
- es-419: protección contra phishing (Chrome's _phishing_ 4/4)
- pt-BR: proteção contra phishing (Chrome's _phishing_ 4/4)
- nl: phishingbescherming (Chrome's _phishing_ 4/4; agent-chosen compound: Dutch closes it up)
- pl: ochrona przed phishingiem (agent-chosen: Chrome writes _phishing_ in 1 of 4 and _wyłudzanie informacji_ in the rest, and _phishing_ is the term Polish security software names)
- sv: skydd mot nätfiske (Chrome's _nätfiske_ 4/4)
- ja: フィッシング対策 (Chrome's フィッシング 4/4)

## Notify

The verb beside [Notification](#notification): _Notify when updates are available_, _Notify for_. Chrome's _notify_ means telling Google something, not sending the user a notification, so it is no source here; each language takes the verb of its notification word.

- de: benachrichtigen (_Bei verfügbaren Updates benachrichtigen_) (agent-chosen: the verb of Benachrichtigung)
- fr: avertir (_M’avertir quand des mises à jour sont disponibles_) (agent-chosen: _notifier_ is stiff in French, and _avertir_ is the usual verb for alerting the user)
- it: notificare (_Notifica quando sono disponibili aggiornamenti_) (agent-chosen: the verb of notifica, and never _avvisare_, which would read as the toast's avviso)
- es: notificar (_Notificar cuando haya actualizaciones_) (agent-chosen: the verb of notificación)
- es-419: notificar (_Notificar cuando haya actualizaciones_) (agent-chosen: the verb of notificación)
- pt-BR: notificar (_Notificar Quando Houver Atualizações_) (agent-chosen: the verb of notificação)
- nl: melden (_Meld wanneer er updates beschikbaar zijn_) (agent-chosen: the verb of melding)
- pl: powiadamiać (_Powiadamiaj o dostępnych aktualizacjach_) (agent-chosen: the verb of powiadomienie)
- sv: avisera (_Avisera när uppdateringar finns_) (agent-chosen: the verb of avisering)
- ja: 通知する (アップデートが利用可能になったら通知) (agent-chosen: the verb of 通知)

## Move

Moving a tab, an email, an attachment or a file: _Move to New Window_, _Move attachments to top_, _File moved or deleted_. Counted in Chrome's 132 messages with _move_.

- de: verschieben (_In neues Fenster verschieben_, _Datei verschoben oder gelöscht_) (Chrome 97/132); _bewegen_ is only for dragging or the pointer
- fr: déplacer (_Déplacer vers une nouvelle fenêtre_, _Fichier déplacé ou supprimé_) (Chrome 106/132)
- it: spostare (_Sposta in una nuova finestra_, _File spostato o eliminato_) (Chrome 119/132)
- es: mover (_Mover a una ventana nueva_, _Archivo movido o eliminado_) (Chrome 116/132)
- es-419: mover (_Mover a una nueva ventana_, _Archivo movido o borrado_) (Chrome 117/132)
- pt-BR: mover (_Mover para uma Nova Janela_, _Arquivo movido ou excluído_) (Chrome 111/132)
- nl: verplaatsen (_Verplaats naar nieuw venster_, _Bestand verplaatst of verwijderd_) (Chrome 103/132)
- pl: przenieść (_Przenieś do nowego okna_, _Plik przeniesiony lub usunięty_) (Chrome 91/132)
- sv: flytta (_Flytta till nytt fönster_, _Filen har flyttats eller raderats_) (Chrome 119/132)
- ja: 移動 (新しいウィンドウに移動) (Chrome 118/132)

## Sound names

The notification sounds Breeze, Chime, Duet, Knock and Linen, picked in Settings. Chrome has none of them. They are names, each translated by what one hears, Linen too, as the user settled for German: a sound named after a fabric keeps the fabric's word.

- de: Brise, Klangspiel, Duett, Klopfen, Leinen (agent-chosen: the user's _Leinen_ for German is the model for the rest)
- fr: Brise, Carillon, Duo, Toc-toc, Lin (agent-chosen: what one hears, and the fabric's word)
- it: Brezza, Rintocco, Duetto, Bussata, Lino (agent-chosen: what one hears, and the fabric's word)
- es: Brisa, Campanilla, Dúo, Golpe, Lino (agent-chosen: what one hears, and the fabric's word)
- es-419: Brisa, Campanilla, Dúo, Golpe, Lino (agent-chosen: as for es)
- pt-BR: Brisa, Sino, Dueto, Batida, Linho (agent-chosen: what one hears, and the fabric's word)
- nl: Bries, Klokkenspel, Duet, Klop, Linnen (agent-chosen: what one hears, and the fabric's word)
- pl: Bryza, Dzwonek, Duet, Pukanie, Len (agent-chosen: what one hears, and the fabric's word)
- sv: Bris, Klockspel, Duett, Knack, Linne (agent-chosen: what one hears, and the fabric's word)
- ja: ブリーズ, チャイム, デュエット, ノック, リネン (agent-chosen: the katakana loans Japanese uses for each)

## Button

A button drawn on screen, such as the bookmarks button, the width button or Gmail's Upgrade button, never a key on the keyboard, which is under [Keyboard keys](#keyboard-keys). Counted in Chrome's 141 messages with _button_.

- de: Button (_Lesezeichen-Button_) (Chrome 102/141; _Schaltfläche_ 3). Never a standalone _Taste_, which Chrome keeps for a key or a mouse button (_Maustaste_); a key name such as _Umschalttaste_ keeps it.
- fr: bouton (_bouton des favoris_) (Chrome 141/141); a key on the keyboard is a _touche_
- it: pulsante (_pulsante dei preferiti_) (Chrome 124/141); a key on the keyboard, or a hardware button, is a _tasto_
- es: botón (_botón de marcadores_) (Chrome 141/141)
- es-419: botón (_botón de favoritos_) (Chrome 141/141)
- pt-BR: botão (_botão de favoritos_) (Chrome 141/141)
- nl: knop (_bookmarkknop_) (Chrome 141/141)
- pl: przycisk (_przycisk zakładek_) (Chrome 141/141)
- sv: knapp (_bokmärkesknapp_) (Chrome 139/141)
- ja: ボタン (ブックマークボタン) (Chrome 141/141)

## Gmail's words

What Gmail itself shows for the things a Meru string can name, by step 2 of the source order. Folder names keep Gmail's capitalization. Sources, all Gmail Help with `hl=<tag>`: **shortcuts** is "Keyboard shortcuts for Gmail" (support.google.com/mail/answer/6594), **undo send** is "Undo sending" (answer/2819488), **spam** is "Mark or unmark Spam" (answer/1366858), **trash** is "Delete or recover deleted Gmail messages" (answer/7401), **categories** is "Add or remove inbox categories & tabs" (answer/3055016) and **importance** is "Importance markers in Gmail" (answer/186543).

### Undo, in the message-sent toast

- de: Rückgängig machen (Gmail's own toast, the user's reading; the undo send page writes _Rückgängig_)
- fr: Annuler (Gmail, undo send)
- it: Annulla (Gmail, undo send)
- es: Deshacer (Gmail, undo send)
- es-419: Deshacer (Gmail, undo send)
- pt-BR: Desfazer (Gmail, undo send)
- nl: Ongedaan maken (Gmail, undo send)
- pl: Cofnij (Gmail, undo send)
- sv: Ångra (Gmail, undo send)
- ja: 取り消し (Gmail, undo send)

### Message sent, the toast

- de: Nachricht gesendet (Gmail, undo send, which has _Ihre Nachricht wurde gesendet_ in Gmail's _Sie_)
- fr: Message envoyé (Gmail, undo send)
- it: Messaggio inviato (Gmail, undo send)
- es: Mensaje enviado (Gmail, undo send)
- es-419: Se envió el mensaje (Gmail, undo send)
- pt-BR: Mensagem enviada (Gmail, undo send)
- nl: Bericht verzonden (Gmail, undo send)
- pl: Wiadomość wysłana (Gmail, undo send)
- sv: Meddelandet har skickats (Gmail, undo send)
- ja: メールを送信しました (Gmail, undo send)

### Inbox

- de: Posteingang (Gmail, trash)
- fr: boîte de réception (Gmail, trash, shortcuts)
- it: Posta in arrivo (Gmail, trash, shortcuts)
- es: Recibidos as the folder, _bandeja de entrada_ in prose (Gmail, shortcuts, trash)
- es-419: Recibidos (Gmail, trash)
- pt-BR: Caixa de entrada (Gmail, trash, shortcuts)
- nl: inbox (Gmail, trash, shortcuts)
- pl: Odebrane (Gmail, trash, shortcuts)
- sv: Inkorgen (Gmail, trash, shortcuts)
- ja: 受信トレイ (Gmail, trash, shortcuts)

### Spam

The folder, and _Not spam_ for the button that takes a message out of it.

- de: Spam; Kein Spam (Gmail, spam)
- fr: Spam; Non-spam (Gmail, spam)
- it: Spam; Non spam (Gmail, spam)
- es: Spam; No es spam (Gmail, spam)
- es-419: Spam; No es spam (Gmail, spam)
- pt-BR: Spam; Não é spam (Gmail, spam)
- nl: Spam; Geen spam (Gmail, spam)
- pl: Spam; To nie jest spam (Gmail, spam)
- sv: Skräppost; Inte skräppost (Gmail, spam)
- ja: 迷惑メール; 迷惑メールではない (Gmail, spam)

### Archive, Compose, Drafts, Sent

From shortcuts, with Sent and Drafts confirmed by undo send. The File menu's Compose is not this one: it carries a platform `msgctxt` and takes the platform's word for a new email, from the style sheet.

- de: Archivieren; Schreiben; Entwürfe; Gesendet (Gmail)
- fr: Archiver; Nouveau message; Brouillons; Messages envoyés (Gmail)
- it: Archivia; Scrivi; Bozze; Posta inviata (Gmail)
- es: Archivar; Redactar; Borradores; Enviados (Gmail)
- es-419: Archivar; Redactar; Borradores; Enviados (Gmail)
- pt-BR: Arquivar; Escrever; Rascunhos; Enviados (Gmail)
- nl: Archiveren; Opstellen; Concepten; Verzonden (Gmail)
- pl: Archiwizuj; Utwórz; Wersje robocze; Wysłane (Gmail)
- sv: Arkivera; Skriv; Utkast; Skickat (Gmail)
- ja: アーカイブ; 作成; 下書き; 送信済み (Gmail)

### Mark as read, Mark as spam, Delete

The actions on a message in the unified inbox, beside Archive above. From shortcuts, which names each beside its key: Shift+i, ! and #.

- de: Als gelesen markieren; Als Spam markieren; Löschen (Gmail)
- fr: Marquer comme lu; Signaler comme spam; Supprimer (Gmail)
- it: Segna come già letto; Segnala come spam; Elimina (Gmail)
- es: Marcar como leído; Marcar como spam; Eliminar (Gmail)
- es-419: Marcar como leído; Marcar como spam; Eliminar (Gmail), though Meru's own Delete is _Borrar_
- pt-BR: Marcar como lida; Denunciar como spam; Excluir (Gmail)
- nl: Markeren als gelezen; Melden als spam; Verwijderen (Gmail)
- pl: Oznacz jako przeczytane; Zgłoś jako spam; Usuń (Gmail)
- sv: Markera som läst; Rapportera som skräppost; Ta bort (Gmail)
- ja: 既読にする; 迷惑メールとして報告; 削除 (Gmail)

### Starred, Snooze, Label

From shortcuts: the folder of starred conversations, the action and the folder of snoozed ones, and a label.

- de: Markiert; Zurückstellen, zurückgestellt; Label (Gmail)
- fr: suivi (_conversations dont le suivi est activé_); Mettre en attente, En attente; libellé (Gmail)
- it: Speciali; Posticipa, posticipate; etichetta (Gmail)
- es: Destacados; Posponer, pospuestas; etiqueta (Gmail)
- es-419: Destacados; Posponer, pospuestas; etiqueta (Gmail)
- pt-BR: Com estrela; Adiar, adiadas; marcador (Gmail)
- nl: Met ster; Snoozen, gesnoozed; label (Gmail)
- pl: Oznaczone gwiazdką; Odłóż, Odłożone; etykieta (Gmail)
- sv: Stjärnmärkt; Skjut upp, uppskjutna; etikett (Gmail)
- ja: スター付き; スヌーズ; ラベル (Gmail)

### Primary

The inbox category, as in _Primary only_. From categories.

- de: Allgemein (Gmail)
- fr: Principale (Gmail)
- it: Principale (Gmail)
- es: Principal (Gmail)
- es-419: Principal (Gmail)
- pt-BR: Principal (Gmail)
- nl: Primair (Gmail)
- pl: Główne (Gmail)
- sv: Primär (Gmail)
- ja: メイン (Gmail)

### Important

What Gmail marks as important, as in _Important only_ and _the emails Gmail marks as important_. From importance, which uses the word in _marked as important_; the label takes the language's label form.

- de: wichtig (Gmail)
- fr: important (Gmail)
- it: importante (Gmail)
- es: importante (Gmail)
- es-419: importante (Gmail)
- pt-BR: importante (Gmail)
- nl: belangrijk (Gmail)
- pl: ważny (Gmail)
- sv: viktig (Gmail)
- ja: 重要 (Gmail)

### Pop-out

A reply or forward opened in a window of its own. Gmail Help calls it a new window, so a pop-out is the window of _Reply in a new window_. From shortcuts.

- de: neues Fenster; _In einem neuen Fenster antworten_ (Gmail)
- fr: nouvelle fenêtre; _Répondre dans une nouvelle fenêtre_ (Gmail)
- it: nuova finestra; _Rispondi in una nuova finestra_ (Gmail)
- es: ventana nueva; _Responder en una ventana nueva_ (Gmail)
- es-419: nueva ventana; _Responder en una nueva ventana_ (Gmail)
- pt-BR: nova janela; _Responder em uma nova janela_ (Gmail)
- nl: nieuw venster; _Beantwoorden in een nieuw venster_ (Gmail)
- pl: nowe okno; _Odpowiedz w nowym oknie_ (Gmail)
- sv: nytt fönster; _Svara i ett nytt fönster_ (Gmail)
- ja: 新しいウィンドウ; _新しいウィンドウで返信_ (Gmail)

### View entire message, Upgrade

_View entire message_ is the link under a message Gmail has clipped, and _Upgrade_ the button Gmail shows for more Google storage, never Meru Pro's [Upgrade](#upgrade). Read from Gmail's interface with the account's display language set to each.

- de: Vollständige Nachricht ansehen; Upgraden (Gmail)
- fr: Afficher l’intégralité du message; Mettre à niveau (Gmail)
- it: Visualizza intero messaggio; Fai l’upgrade (Gmail)
- es: Ver todo el mensaje; Cambiar a plan superior (Gmail)
- es-419: Ver mensaje completo; Actualizar (Gmail)
- pt-BR: Exibir toda a mensagem; Fazer upgrade (Gmail)
- nl: Hele bericht bekijken; Upgraden (Gmail)
- pl: Pokaż całą wiadomość; Zmień na większy pakiet (Gmail)
- sv: Visa hela meddelandet; Uppgradera (Gmail)
- ja: メッセージ全体を表示; アップグレード (Gmail)

### Out of office, Multiple inboxes

Gmail's vacation responder, as in _Open Gmail settings to turn off out of office_, and the inbox type with several sections. Gmail's terms, so Gmail's words by step 2, but not yet read from Gmail's interface: until they are, these stand in.

- de: Abwesenheitsnotiz; mehrere Posteingänge (agent-chosen: Gmail's words not yet read)
- fr: réponse automatique d’absence; boîtes de réception multiples (agent-chosen: Gmail's words not yet read)
- it: risposta automatica; Posta in arrivo multipla (agent-chosen: Gmail's words not yet read)
- es: respuesta automática; varias bandejas de entrada (agent-chosen: Gmail's words not yet read)
- es-419: respuesta automática; varias bandejas de entrada (agent-chosen: Gmail's words not yet read)
- pt-BR: resposta automática; várias caixas de entrada (agent-chosen: Gmail's words not yet read)
- nl: automatisch antwoord bij afwezigheid; meerdere inboxen (agent-chosen: Gmail's words not yet read)
- pl: autoodpowiedź; wiele skrzynek odbiorczych (agent-chosen: Gmail's words not yet read)
- sv: frånvaromeddelande; flera inkorgar (agent-chosen: Gmail's words not yet read)
- ja: 不在通知; マルチ受信トレイ (agent-chosen: Gmail's words not yet read)

## 1Password's words

The steps for connecting the 1Password desktop app quote its own interface: Settings, Browser and Add Browser. Like Gmail's words, they take the word 1Password shows in that language, read from the app or its support pages, never a fresh translation. Say in your summary which wording you used, so it can be added here.

## Common actions

The labels for everyday actions such as Cancel, Close, Delete, Save, Quit and Copy Link are in each style sheet, under Common labels, as Chrome writes them, in the sheet's label form. Use them for the same actions and as the model for others, except where the string names a Gmail action or folder, where Gmail's word above wins, as for the Undo button in the message-sent toast, and where the entry has a platform `msgctxt`, where the platform's word wins. Delete and Remove are two words wherever Chrome makes them two, and one where Chrome writes the same word for both: Remove account never reads as deleting it in a language that has the second word.
