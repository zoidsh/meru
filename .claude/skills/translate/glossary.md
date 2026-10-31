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
   3. otherwise the word most commonly used for the concept in popular apps in that language, counted across a fixed set with one vote each: Thunderbird, Firefox, VS Code, Android (AOSP's Settings, SystemUI, framework, Messaging and Email), LibreOffice, the Microsoft Terminology Collection and Apple's macOS apps (this Mac's `.loctable`s, one app's vote, not an authority). Each app's vote is the word it uses most in its messages that have the concept, a message counting once, for the candidate it matches longest; the word with most votes wins. When the vote ties, or fewer than 3 of the 7 have the concept, nothing is guessed: the word stays as it is, marked unresolved, until a speaker settles it.

Apple is the authority only for the operating system's words in step 1; in step 4c its macOS apps are one vote of seven. Grammar is not a word: address form, capitalization, label form, punctuation and the ellipsis follow Apple's conventions for each language, as its style sheet says.

Each word carries its source in brackets: **(Chrome n/N)**, Chrome's word in n of the N messages that have the term, counted in Chromium 156's `generated_resources`, `components_strings` and `ui_strings` translations. Every count, here and in the sidecars, is taken one way: N is the messages whose English has the term, matched by the sidecar pin's `msgidPattern` (or its `msgid` as a whole word) where a pin holds the word, and n is those whose translation matches the pin's `expect`, without its anchors and ignoring case; a term Meru alone has, such as a device label, is counted by the Chrome term its word comes from, and a pin on Meru's own phrase or label form by the word it is built on. A ban's count is the messages whose translation has its banned form; **(Apple …)**, **(Microsoft …)** or **(GNOME …)** for an operating system's word, cited as the style sheet's Platform words cite it; **(Gmail …)**; **(Google)**; **(agent-chosen: word: n of 7 (apps))**, the last step's tally; or **(agent-chosen, unresolved by the app count: …)**, with each app's word, for a tie or a concept fewer than 3 apps have. A speaker's review replaces either. Use an agent-chosen word like any other.

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
- pt-BR: Configurações (Chrome 419/436); the macOS menu item _Ajustes…_ (Apple)
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

The page listing new mail across every account. A description, so lower case inside a sentence; the page title capitalizes its first word. Meru's own feature, built on Gmail's word for the inbox. The phrase is unresolved by the app count: of the seven apps only Thunderbird (gruppierte Ordner) and Android (kombinierte Ansicht) have a merged inbox, so each language keeps its phrase until a speaker settles it.

- de: gemeinsamer Posteingang (Gmail's _Posteingang_; agent-chosen, unresolved by the app count)
- fr: boîte de réception unifiée (Gmail's _boîte de réception_; agent-chosen, unresolved by the app count)
- it: posta in arrivo unificata (Gmail's _Posta in arrivo_; agent-chosen, unresolved by the app count)
- es: bandeja de entrada unificada (Gmail's _bandeja de entrada_; agent-chosen, unresolved by the app count)
- es-419: bandeja de entrada unificada (Gmail's _bandeja de entrada_; agent-chosen, unresolved by the app count)
- pt-BR: caixa de entrada unificada (Gmail's _Caixa de entrada_; agent-chosen, unresolved by the app count)
- nl: gecombineerde inbox (Gmail's _inbox_; agent-chosen, unresolved by the app count)
- pl: wspólna skrzynka odbiorcza (agent-chosen, unresolved by the app count)
- sv: samlad inkorg (Gmail's _inkorg_; agent-chosen, unresolved by the app count)
- ja: 統合受信トレイ (Gmail's 受信トレイ; agent-chosen, unresolved by the app count)

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
- nl: melding (Chrome 127/127), never _notificatie_
- pl: powiadomienie (Chrome 125/127)
- sv: avisering, plural aviseringar (Chrome 124/127). Never _notis_, which only a `macOS` label keeps.
- ja: 通知 (Chrome 130/132)

## Notification hours

The time windows outside which no notification is shown. The interface reads _Notification times_; one window is a _time window_. Built on the word for notification above; the window is the apps' word for a time window, counted in their messages with _time window_, _slot_, _range_ or _frame_.

- de: Benachrichtigungszeiten; a window is a _Zeitfenster_ (agent-chosen: Zeitfenster: 2 of 7 (VS Code, Microsoft))
- fr: horaires des notifications; a window is a _plage horaire_ (agent-chosen, unresolved by the app count: Thunderbird and Microsoft tie créneau and intervalle, Firefox writes intervalle, Apple période)
- it: orari delle notifiche; a window is un _intervallo_ (agent-chosen: intervallo: 5 of 7 (Thunderbird, Firefox, LibreOffice, Microsoft, Apple))
- es: horario de notificaciones; a window is un _intervalo_ (agent-chosen: intervalo: 3 of 7 (Thunderbird, Firefox, Apple))
- es-419: horario de notificaciones; a window is un _intervalo de tiempo_ (agent-chosen: intervalo de tiempo: 3 of 7 (Thunderbird, Firefox, Apple))
- pt-BR: horários de notificação; a window is um _intervalo de horário_ (agent-chosen: intervalo de horário: 4 of 7 (Firefox, LibreOffice, Microsoft, Apple))
- nl: meldingstijden; a window is een _periode_ (agent-chosen: periode: 2 of 7 (Thunderbird, Firefox))
- pl: godziny powiadomień; a window is _okres_ (agent-chosen: okres: 2 of 7 (Thunderbird, Firefox))
- sv: aviseringstider; a window is ett _tidsintervall_ (agent-chosen: tidsintervall: 4 of 7 (Thunderbird, Firefox, Microsoft, Apple))
- ja: 通知時間帯; a window is 時間帯 (agent-chosen, unresolved by the app count: Firefox and VS Code write 期間, Microsoft and Apple 時間帯, Thunderbird ties them)

The compounds for _Notification times_ are built on Chrome's notification word and are not counted.

## Hibernation, Hibernate

Unloading an idle tab to give back its memory, keeping it in the list: _Hibernate idle tabs_, _Hibernate after_, _Hibernate When Idle_. It is what Chrome's Memory Saver does to a tab, which Chrome calls an _inactive tab_, so a hibernated tab takes Chrome's word for that state, counted in its 8 messages with _inactive tab_; to hibernate is to make a tab inactive, worded as the sentence needs. Never the operating system's word for sleep, which would read as the computer going to sleep.

- de: inaktiv; _Inaktiver Tab_, _inaktiv machen_ (Chrome 8/8), never _Ruhezustand_
- fr: inactif; _Onglet inactif_, _rendre inactif_ (Chrome 8/8), never _mise en veille_
- it: non attiva, inattiva; _Scheda non attiva_, _rendere inattiva_ (Chrome 8/8)
- es: inactiva; _Pestaña inactiva_, _inactivar_ (Chrome 8/8)
- es-419: inactiva; _Pestaña inactiva_, _volver inactiva_ (Chrome 8/8)
- pt-BR: inativa; _Guia inativa_, _deixar inativa_ (Chrome 8/8)
- nl: inactief; _Inactief tabblad_, _inactief maken_ (Chrome 8/8), never _slaapstand_
- pl: nieaktywna; _Karta nieaktywna_, _ustawić jako nieaktywną_ (Chrome 8/8)
- sv: inaktiv; _Inaktiv flik_, _göra inaktiv_ (Chrome 8/8), never _viloläge_
- ja: アクティブでない, 非アクティブ; アクティブでないタブ, 非アクティブにする (Chrome 8/8)

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

The one tab per app that every link to that app opens in. The badge setting reads _Show app links badge_. Built on Chrome's words for tab, link and app; none of the seven apps has such a tab, so the phrase is not counted and stays agent-chosen.

- de: Tab für App-Links (agent-chosen, not countable: Chrome's _Tab_ and _Link_)
- fr: onglet des liens d’appli (agent-chosen, not countable: Chrome's _onglet_, _lien_ and _appli_)
- it: scheda dei link dell’app (agent-chosen, not countable: Chrome's _scheda_, _link_ and _app_)
- es: pestaña de enlaces de la aplicación (agent-chosen, not countable: Chrome's _pestaña_, _enlace_ and _aplicación_)
- es-419: pestaña de vínculos de la app (agent-chosen, not countable: Chrome's _pestaña_, _vínculo_ and _app_)
- pt-BR: guia de links do app (agent-chosen, not countable: Chrome's _guia_, _link_ and _app_)
- nl: tabblad voor app-links (agent-chosen, not countable: Chrome's _tabblad_, _link_ and _app_)
- pl: karta linków aplikacji (agent-chosen, not countable: Chrome's _karta_, _link_ and _aplikacja_)
- sv: flik för applänkar (agent-chosen, not countable: Chrome's _flik_, _länk_ and _app_)
- ja: アプリリンク用タブ (agent-chosen, not countable: Chrome's タブ, リンク and アプリ)

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
- pl: menu z aplikacjami (Chrome 17/20)
- sv: appstartare (Chrome 11/20)
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
- ja: 縦型タブ (agent-chosen, unresolved by the app count: only Firefox and Microsoft have vertical tabs, both as 垂直タブ)

## Titlebar

The strip across the top of the window.

- de: Titelleiste (Chrome 5/5)
- fr: barre de titre (Chrome 5/5)
- it: barra del titolo (Chrome 5/5)
- es: barra de título (Chrome 5/5)
- es-419: barra de título (Chrome 5/5)
- pt-BR: barra de título (Chrome 5/5)
- nl: titelbalk (Chrome 5/5)
- pl: pasek tytułu (Chrome 5/5), never _pasek tytułowy_
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
- pt-BR: extensão (Chrome 302/307)
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
- pl: Wczytuj podczas uruchamiania (Chrome's _uruchomienie_ 3/10; agent-chosen phrase: podczas uruchamiania: 2 of 7 (Firefox, LibreOffice), counted in the apps' messages with _on startup_ or _at launch_)
- sv: Läs in vid start (Chrome's _start_ 10/10)
- ja: 起動時に読み込む (Chrome's 起動時 9/10)

## Upgrade

Reaching Pro, in buttons and prose alike. Never a word for _purchase_ or _buy_. Chrome's _upgrade to_ moves Chromebooks and sites to something newer, so it is no source; the apps' word is counted in their messages with _upgrade_. Only VS Code and Apple word a paid upgrade, too few to count on their own, so the count is of upgrading in general.

- de: Upgrade; _Auf Meru Pro upgraden_. In a sentence, the noun: _ein Upgrade auf Meru Pro_, as in _Mit einem Upgrade auf Meru Pro kannst du weitere Konten hinzufügen._ (agent-chosen: Upgrade/upgraden: 4 of 7 (Firefox, VS Code, Android, Microsoft))
- fr: Mettre à niveau vers Meru Pro (agent-chosen: mettre à niveau: 5 of 7 (Thunderbird, Firefox, VS Code, Microsoft, Apple))
- it: Aggiorna a Meru Pro (agent-chosen: aggiornare: 5 of 7 (Thunderbird, Firefox, VS Code, Microsoft, Apple))
- es: Actualizar a Meru Pro (agent-chosen: actualizar: 6 of 7 (Thunderbird, Firefox, VS Code, Android, Microsoft, Apple))
- es-419: Actualizar a Meru Pro (agent-chosen: actualizar: 6 of 7 (Thunderbird, Firefox, VS Code, Android, Microsoft, Apple))
- pt-BR: Atualizar para o Meru Pro (agent-chosen: atualizar: 5 of 7 (Thunderbird, Firefox, VS Code, Microsoft, Apple))
- nl: Upgrade naar Meru Pro (agent-chosen: upgrade/upgraden: 4 of 7 (Thunderbird, Firefox, Android, Microsoft))
- pl: Uaktualnij do Meru Pro (agent-chosen: uaktualnić: 4 of 7 (Firefox, VS Code, Microsoft, Apple))
- sv: Uppgradera till Meru Pro (agent-chosen: uppgradera: 5 of 7 (Thunderbird, Firefox, Android, Microsoft, Apple))
- ja: Meru Proにアップグレード. In a sentence, the same verb: _Meru Proにアップグレードすると、アカウントをさらに追加できます_ (agent-chosen: アップグレード: 6 of 7 (Thunderbird, Firefox, VS Code, Android, Microsoft, Apple))

The standalone _Upgrade_ label, a button beside the license, is the same verb toward Pro: de _Upgrade_, fr _Mettre à niveau_, it _Aggiorna a Pro_, es _Actualizar a Pro_, es-419 _Actualizar a Pro_, pt-BR _Atualizar para o Pro_, nl _Upgrade_, pl _Uaktualnij do Pro_, sv _Uppgradera_, ja アップグレード (agent-chosen, by the count above). Where the verb is also the language's word for updating (it, es, es-419, pt-BR), the object _a Pro_ keeps it apart from an update.

## License key, Trial, Device

The device is Chrome's word. The license key is unresolved by the app count: only Microsoft has one, as a product key. The trial is the apps' word, counted in their messages with _trial_.

- de: Lizenzschlüssel; Testversion; Gerät (Chrome 981/1011; license key agent-chosen, unresolved by the app count; trial agent-chosen: Testversion: 2 of 7 (Firefox, Microsoft))
- fr: clé de licence; essai; appareil (Chrome 959/1011; license key agent-chosen, unresolved by the app count; trial agent-chosen: essai: 3 of 7 (Firefox, VS Code, Apple))
- it: chiave di licenza; periodo di prova; dispositivo (Chrome 983/1011; license key agent-chosen, unresolved by the app count; trial agent-chosen, unresolved by the app count: Firefox and Apple write prova, VS Code and Microsoft versione di valutazione)
- es: clave de licencia; prueba; dispositivo (Chrome 985/1011; license key agent-chosen, unresolved by the app count; trial agent-chosen: prueba: 3 of 7 (Firefox, VS Code, Microsoft))
- es-419: clave de licencia; prueba; dispositivo (Chrome 983/1011; license key agent-chosen, unresolved by the app count; trial agent-chosen: prueba: 4 of 7 (Firefox, VS Code, Microsoft, Apple))
- pt-BR: chave de licença; período de avaliação; dispositivo (Chrome 976/1010; license key agent-chosen, unresolved by the app count; trial agent-chosen: período de avaliação: 3 of 7 (VS Code, Microsoft, Apple))
- nl: licentiesleutel; proefabonnement; apparaat (Chrome 984/1011; license key agent-chosen, unresolved by the app count; trial agent-chosen: proefabonnement: 2 of 7 (Microsoft, Apple))
- pl: klucz licencyjny; okres próbny; urządzenie (Chrome 997/1011; license key agent-chosen, unresolved by the app count; trial agent-chosen, unresolved by the app count: Firefox and Apple write okres próbny, VS Code and Microsoft wersja próbna)
- sv: licensnyckel; provperiod; enhet (Chrome 983/1011; license key agent-chosen, unresolved by the app count; trial agent-chosen: provperiod: 2 of 7 (Firefox, Apple))
- ja: ライセンスキー; 試用期間; デバイス (Chrome 984/1011; license key agent-chosen, unresolved by the app count; trial agent-chosen, unresolved by the app count: Firefox and Apple write トライアル, VS Code and Microsoft 試用)

## Download history

Counted in Chrome's messages with _download history_; where a language pins the page and the recent popup apart, the page's count leaves out _recent download history_.

- de: Downloadverlauf for the page, in _Download history_, _Full download history_ and _Close download history_ (Chrome 8/8); the recent download history popup is _Letzte Downloads_ (_Letzte Downloads anzeigen_), never _Aktueller Downloadverlauf_ (the user's call, from Chrome's _Letzte Downloads_)
- fr: historique des téléchargements, in _Historique complet des téléchargements_ and _Fermer l’historique des téléchargements_ (Chrome 8/8); the recent download history popup is _Historique des téléchargements récents_ (Chrome)
- it: cronologia dei download; the page's title _Cronologia download_ (Chrome 8/8); the recent download history popup is _Cronologia dei download recenti_ (Chrome)
- es: historial de descargas (Chrome 10/10), also in _Historial de descargas recientes_
- es-419: historial de descargas (Chrome 10/10), also in _Historial de descargas recientes_
- pt-BR: histórico de downloads (Chrome 8/10), also in _Histórico de downloads recentes_
- nl: downloadgeschiedenis (Chrome 10/10)
- pl: historia pobierania (Chrome 10/10)
- sv: nedladdningshistorik (Chrome 10/10), never _hämtningshistorik_; downloading is _ladda ned_, a download a _nedladdning_
- ja: ダウンロード履歴 (Chrome 10/10)

## Dark theme, Blocker, Spellchecker

The dark theme is Chrome's _Dark theme_ label; the blocker is the apps' word, counted in their messages with _blocker_ or _content blocking_; the spellchecker is counted in its 23 messages with _spell check_.

- de: dunkles Design (Chrome 1/1); Blocker (agent-chosen: Blocker: 2 of 7 (Firefox, Microsoft)); Rechtschreibprüfung (Chrome 22/23)
- fr: thème sombre (Chrome 1/1); bloqueur (agent-chosen: bloqueur: 2 of 7 (Firefox, Microsoft)); correcteur orthographique (Chrome 21/23)
- it: tema scuro (Chrome 1/1); blocco contenuti (agent-chosen: blocco contenuti: 3 of 7 (Thunderbird, Firefox, Microsoft)); controllo ortografico (Chrome 22/23)
- es: tema oscuro (Chrome 1/1); bloqueador (agent-chosen, unresolved by the app count: Firefox ties bloqueador and bloqueo, Thunderbird writes bloqueo, Microsoft bloqueador); corrector ortográfico (Chrome 14/23)
- es-419: tema oscuro (Chrome 1/1); bloqueador (agent-chosen, unresolved by the app count: as for es); corrector ortográfico (Chrome 21/23)
- pt-BR: tema escuro (Chrome 1/1); bloqueador (agent-chosen: bloqueador: 2 of 7 (Firefox, Microsoft)); verificação ortográfica (Chrome 20/23)
- nl: donker thema (Chrome 1/1); blokkering (agent-chosen: blokkering: 3 of 7 (Thunderbird, Firefox, Microsoft)); spellingcontrole (Chrome 22/23)
- pl: ciemny motyw (Chrome 1/1); blokowanie (agent-chosen: blokowanie: 3 of 7 (Thunderbird, Firefox, Microsoft)); sprawdzanie pisowni (Chrome 22/23)
- sv: mörkt tema (Chrome 1/1); blockering (agent-chosen: blockering: 3 of 7 (Thunderbird, Firefox, Microsoft)); stavningskontroll (Chrome 22/23)
- ja: ダークモード (Chrome 1/1); ブロッカー (agent-chosen, unresolved by the app count: only Firefox writes ブロッカー and Microsoft ブロック); スペルチェック (Chrome 22/23)

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

A brief message Meru shows over its window or over Gmail, such as the one after a setting changes, and the region the toasts appear in, which the interface reads as _Notifications_ with `msgctxt` `toasts`. Chrome has no word for one, and the app count leaves it unresolved by the app count: only VS Code and Microsoft have the concept, and both mostly call it a notification or a popup. Never the word for a system [notification](#notification), and in each language clearly apart from it.

- de: Hinweis, plural Hinweise (_Hinweis schließen_) (agent-chosen, unresolved by the app count: VS Code ties Benachrichtigung and Popup, Microsoft writes Popup)
- fr: avis (_Fermer l’avis_), never _notification_ (agent-chosen, unresolved by the app count: VS Code ties notification and toast, Microsoft writes toast)
- it: avviso, plural avvisi (_Chiudi avviso_), never _notifica_ (agent-chosen, unresolved by the app count: VS Code ties avviso, notifica and popup, Microsoft avviso and popup)
- es: aviso, plural avisos (_Cerrar aviso_), never _notificación_ (agent-chosen, unresolved by the app count: VS Code and Microsoft write notificación)
- es-419: aviso, plural avisos (_Cerrar aviso_), never _notificación_ (agent-chosen, unresolved by the app count: VS Code and Microsoft write notificación)
- pt-BR: aviso, plural avisos (_Fechar Aviso_), never _notificação_ (agent-chosen, unresolved by the app count: VS Code and Microsoft write notificação)
- nl: mededeling, plural mededelingen (_Sluit mededeling_), never _melding_ (agent-chosen, unresolved by the app count: only Microsoft, pop-up)
- pl: komunikat, plural komunikaty (_Zamknij komunikat_), never _powiadomienie_ (agent-chosen, unresolved by the app count: VS Code ties powiadomienie and wyskakujące, Microsoft writes powiadomienie)
- sv: inforuta, plural inforutor (_Stäng inforuta_), never _avisering_ (agent-chosen, unresolved by the app count: only Microsoft, popup)
- ja: お知らせ (お知らせを閉じる), never 通知 (agent-chosen, unresolved by the app count: VS Code ties 通知 and トースト, Microsoft writes トースト)

## Unread badge

The count on an account, a tab or the dock icon for its unread emails: _Show unread badge_, _Unread badge_. Chrome has no word for one, so it takes the apps' word for a badge, counted in their messages with _badge_ (work and ID badges left out).

- de: Badge, das; in full _Badge für ungelesene E-Mails_ (_Badge für ungelesene E-Mails anzeigen_), never the coined _Ungelesen-Badge_ (agent-chosen: Badge: 2 of 7 (Microsoft, Apple); Thunderbird writes Zähler)
- fr: badge; in full _badge des e-mails non lus_ (_Afficher le badge des e-mails non lus_) (agent-chosen: badge: 4 of 7 (Thunderbird, Android, LibreOffice, Microsoft); Apple writes pastille)
- it: badge; in full _badge delle email non lette_ (_Mostra il badge delle email non lette_) (agent-chosen: badge: 3 of 7 (Android, LibreOffice, Apple))
- es: insignia; in full _insignia de no leídos_ (_Mostrar insignia de no leídos_) (agent-chosen: insignia: 3 of 7 (Thunderbird, Android, LibreOffice))
- es-419: insignia; in full _insignia de no leídos_ (_Mostrar insignia de no leídos_) (agent-chosen: insignia: 3 of 7 (Thunderbird, Android, LibreOffice))
- pt-BR: selo; in full _selo de não lidos_ (_Mostrar Selo de Não Lidos_) (agent-chosen: selo: 2 of 7 (Android, Microsoft); Thunderbird writes emblema, Apple aviso)
- nl: badge; in full _badge voor ongelezen e-mails_ (_Toon badge voor ongelezen e-mails_) (agent-chosen: badge: 5 of 7 (Thunderbird, Android, LibreOffice, Microsoft, Apple))
- pl: plakietka; in full _plakietka z liczbą nieprzeczytanych_ (_Pokaż plakietkę z liczbą nieprzeczytanych_) (agent-chosen: plakietka: 4 of 7 (Thunderbird, Android, LibreOffice, Apple))
- sv: märke; in full _märke för olästa_ (_Visa märke för olästa_) (agent-chosen: märke: 3 of 7 (Thunderbird, Android, Microsoft))
- ja: 未読バッジ (未読バッジを表示) (agent-chosen: バッジ: 4 of 7 (Thunderbird, Android, Microsoft, Apple), with 未読)

The badge on an account's row in Settings, `msgctxt` `account row badge`, sits on a row that cannot wrap, so it takes the shortest form, the apps' word for unread, counted in their messages with _unread_:

- de: Ungelesen (agent-chosen: ungelesen: 5 of 7 (Thunderbird, VS Code, Android, Microsoft, Apple))
- fr: Non lus (agent-chosen: non lu: 5 of 7 (Thunderbird, VS Code, Android, Microsoft, Apple))
- it: Non lette (agent-chosen: non letto: 5 of 7 (Thunderbird, VS Code, Android, Microsoft, Apple))
- es: No leídos (agent-chosen: no leído: 5 of 7 (Thunderbird, VS Code, Android, Microsoft, Apple))
- es-419: No leídos (agent-chosen: no leído: 5 of 7 (Thunderbird, VS Code, Android, Microsoft, Apple))
- pt-BR: Não lidos (agent-chosen: não lido: 4 of 7 (Thunderbird, VS Code, Microsoft, Apple))
- nl: Ongelezen (agent-chosen: ongelezen: 4 of 7 (Thunderbird, Android, Microsoft, Apple))
- pl: Nieprzeczytane (agent-chosen: nieprzeczytane: 5 of 7 (Thunderbird, VS Code, Android, Microsoft, Apple))
- sv: Olästa (agent-chosen: oläst: 4 of 7 (Thunderbird, Android, Microsoft, Apple))
- ja: 未読 (agent-chosen: 未読: 5 of 7 (Thunderbird, VS Code, Android, Microsoft, Apple))

## Tab strip

The tabs within an account, which Workspace apps' New windows mode leaves out: _Narrow the tab strip_. Counted in Chrome's 7 messages with _tab strip_.

- de: Tableiste (_Tableiste verschmälern_) (Chrome 6/7)
- fr: barre d’onglets (_Réduire la barre d’onglets_) (Chrome 7/7)
- it: tabstrip, feminine (_Restringi la tabstrip_) (Chrome 7/7)
- es: barra de pestañas (_Estrechar la barra de pestañas_) (Chrome 7/7)
- es-419: barra de pestañas (_Estrechar la barra de pestañas_) (Chrome 7/7)
- pt-BR: barra de guias (_Estreitar a Barra de Guias_) (Chrome 7/7)
- nl: tabbladstrook (_Maak de tabbladstrook smaller_) (Chrome 7/7)
- pl: pasek kart (_Zwęź pasek kart_) (Chrome 7/7)
- sv: flikhuvud (_Gör flikhuvudet smalare_) (Chrome 7/7)
- ja: タブバー (タブバーを狭くする) (Chrome 7/7), never タブストリップ

## Label, Meru's

The name Meru shows for an account or a saved search, in its _Label_ field and _Enter a label_ with `msgctxt` `saved search`. Never Gmail's label, which is under [Starred, Snooze, Label](#starred-snooze-label) and carries `msgctxt` `Gmail label`. It is a display name, so it takes the apps' word for a _Name_ field, counted in their messages that are _Name_ alone.

- de: Name (_Namen eingeben_) (agent-chosen: Name: 7 of 7 (Thunderbird, Firefox, VS Code, Android, LibreOffice, Microsoft, Apple))
- fr: nom (_Saisir un nom_) (agent-chosen: nom: 7 of 7 (Thunderbird, Firefox, VS Code, Android, LibreOffice, Microsoft, Apple))
- it: nome (_Inserisci un nome_) (agent-chosen: nome: 7 of 7 (Thunderbird, Firefox, VS Code, Android, LibreOffice, Microsoft, Apple))
- es: nombre (_Introduce un nombre_) (agent-chosen: nombre: 7 of 7 (Thunderbird, Firefox, VS Code, Android, LibreOffice, Microsoft, Apple))
- es-419: nombre (_Ingresa un nombre_) (agent-chosen: nombre: 7 of 7 (Thunderbird, Firefox, VS Code, Android, LibreOffice, Microsoft, Apple))
- pt-BR: nome (_Digite um nome_) (agent-chosen: nome: 7 of 7 (Thunderbird, Firefox, VS Code, Android, LibreOffice, Microsoft, Apple))
- nl: naam (_Voer een naam in_) (agent-chosen: naam: 6 of 7 (Thunderbird, Firefox, Android, LibreOffice, Microsoft, Apple))
- pl: nazwa (_Wpisz nazwę_) (agent-chosen: nazwa: 7 of 7 (Thunderbird, Firefox, VS Code, Android, LibreOffice, Microsoft, Apple))
- sv: namn (_Ange ett namn_) (agent-chosen: namn: 6 of 7 (Thunderbird, Firefox, Android, LibreOffice, Microsoft, Apple))
- ja: 名前 (名前を入力) (agent-chosen: 名前: 7 of 7 (Thunderbird, Firefox, VS Code, Android, LibreOffice, Microsoft, Apple))

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

- de: Update-Kanal; _Beta-Kanal_ (_Zum Beta-Kanal wechseln?_) (Chrome's _Kanal_ 10/11; compounds agent-chosen: Update-Kanal: 2 of 7 (Thunderbird, Firefox))
- fr: version de mise à jour; _version bêta_ (_Passer à la version bêta ?_, with a no-break space before ?) (Chrome 10/11)
- it: canale di aggiornamento; _canale beta_ (_Passare al canale beta?_) (Chrome 11/11)
- es: canal de versiones; _canal beta_ (_¿Cambiar al canal beta?_) (Chrome's _canal_ 11/11)
- es-419: canal de versiones; _canal beta_ (_¿Cambiar al canal beta?_) (Chrome's _canal_ 11/11)
- pt-BR: canal de versões; _canal beta_ (_Mudar para o canal beta?_) (Chrome's _canal_ 11/11)
- nl: updatekanaal; _bètakanaal_ (_Overschakelen naar het bètakanaal?_) (Chrome's _kanaal_ 10/11 and _Bèta_; compounds agent-chosen: updatekanaal: 2 of 7 (Thunderbird, Firefox))
- pl: kanał aktualizacji; _kanał beta_ (_Przełączyć na kanał beta?_) (Chrome's _kanał_ 8/11)
- sv: uppdateringskanal; _betakanal_ (_Vill du byta till betakanalen?_) (Chrome's _kanal_ 11/11; compounds agent-chosen: uppdateringskanal: 2 of 7 (Thunderbird, Firefox))
- ja: リリースチャンネル; ベータチャンネル (ベータチャンネルに切り替えますか?) (Chrome's チャンネル 11/11; compounds agent-chosen, unresolved by the app count: Thunderbird and Firefox write チャンネル in their own compounds)

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
- nl: phishingbescherming (Chrome's _phishing_ 4/4; compound agent-chosen, unresolved by the app count: only Microsoft, phishingfilter)
- pl: ochrona przed wyłudzaniem informacji (Chrome's _wyłudzanie informacji_ 3/4, _phishing_ 1)
- sv: skydd mot nätfiske (Chrome's _nätfiske_ 4/4)
- ja: フィッシング対策 (Chrome's フィッシング 4/4)

## Notify

The verb beside [Notification](#notification): _Notify when updates are available_, _Notify for_. Chrome's _notify_ means telling Google something, so it is no source; the apps' word is counted in their messages with _notify_.

- de: benachrichtigen (_Bei verfügbaren Updates benachrichtigen_) (agent-chosen: benachrichtigen: 7 of 7 (Thunderbird, Firefox, VS Code, Android, LibreOffice, Microsoft, Apple))
- fr: notifier (_Notifier quand des mises à jour sont disponibles_) (agent-chosen: notifier: 3 of 7 (VS Code, Android, Microsoft); Thunderbird writes informer, LibreOffice avertir, Apple prévenir, Firefox ties avertir and informer)
- it: notificare (_Notifica quando sono disponibili aggiornamenti_), never _avvisare_, which would read as the toast's avviso (agent-chosen: notificare: 5 of 7 (Thunderbird, VS Code, Android, LibreOffice, Microsoft))
- es: notificar (_Notificar cuando haya actualizaciones_) (agent-chosen: notificar: 7 of 7 (Thunderbird, Firefox, VS Code, Android, LibreOffice, Microsoft, Apple))
- es-419: notificar (_Notificar cuando haya actualizaciones_) (agent-chosen: notificar: 7 of 7 (Thunderbird, Firefox, VS Code, Android, LibreOffice, Microsoft, Apple))
- pt-BR: notificar (_Notificar Quando Houver Atualizações_) (agent-chosen: notificar: 7 of 7 (Thunderbird, Firefox, VS Code, Android, LibreOffice, Microsoft, Apple))
- nl: melden (_Meld wanneer er updates beschikbaar zijn_) (agent-chosen: melden: 4 of 7 (Android, LibreOffice, Microsoft, Apple))
- pl: powiadamiać (_Powiadamiaj o dostępnych aktualizacjach_) (agent-chosen: powiadamiać: 7 of 7 (Thunderbird, Firefox, VS Code, Android, LibreOffice, Microsoft, Apple))
- sv: meddela (_Meddela när uppdateringar finns_) (agent-chosen: meddela: 6 of 7 (Thunderbird, Firefox, Android, LibreOffice, Microsoft, Apple))
- ja: 通知する (アップデートが利用可能になったら通知) (agent-chosen: 通知: 7 of 7 (Thunderbird, Firefox, VS Code, Android, LibreOffice, Microsoft, Apple))

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

The notification sounds Breeze, Chime, Duet, Knock and Linen, picked in Settings. Chrome has none of them, and the app count leaves them unresolved by the app count: no name is in more than two of the seven apps (Apple's Brise and Leinen, LibreOffice's Windspiel and Breeze, Microsoft's Duet as a product name). They are names, each translated by what one hears, Linen too, as the user settled for German.

- de: Brise, Klangspiel, Duett, Klopfen, Leinen (agent-chosen, unresolved by the app count; Leinen the user's call)
- fr: Brise, Carillon, Duo, Toc-toc, Lin (agent-chosen, unresolved by the app count)
- it: Brezza, Rintocco, Duetto, Bussata, Lino (agent-chosen, unresolved by the app count)
- es: Brisa, Campanilla, Dúo, Golpe, Lino (agent-chosen, unresolved by the app count)
- es-419: Brisa, Campanilla, Dúo, Golpe, Lino (agent-chosen, unresolved by the app count)
- pt-BR: Brisa, Sino, Dueto, Batida, Linho (agent-chosen, unresolved by the app count)
- nl: Bries, Klokkenspel, Duet, Klop, Linnen (agent-chosen, unresolved by the app count)
- pl: Bryza, Dzwonek, Duet, Pukanie, Len (agent-chosen, unresolved by the app count)
- sv: Bris, Klockspel, Duett, Knack, Linne (agent-chosen, unresolved by the app count)
- ja: ブリーズ, チャイム, デュエット, ノック, リネン (agent-chosen, unresolved by the app count)

## Button

A button drawn on screen, such as the bookmarks button, the width button or Gmail's Upgrade button, never a key on the keyboard, which is under [Keyboard keys](#keyboard-keys). Counted in Chrome's 141 messages with _button_.

- de: Button, der, plural Buttons; a compound takes a hyphen, though Chrome writes both _Scroll-Buttons_ and _Scrollbuttons_: _der Lesezeichen-Button_, _der Installations-Button_ (Chrome 102/141; _Schaltfläche_ 3, all in compounds, where Chrome writes Button 12 times). Never _Schaltfläche_, alone or in a compound. Never a standalone _Taste_, which Chrome keeps for a key or a mouse button (_Maustaste_); a key name such as _Umschalttaste_ keeps it.
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

Gmail's vacation responder, as in _Open Gmail settings to turn off out of office_, and the inbox type with several sections. Gmail's terms, so Gmail's words by step 2, but not yet read from Gmail's interface; until they are, out of office takes the apps' word, counted in their messages with _out of office_, _vacation response_ or _automatic reply_. No app has multiple inboxes, so that term is unresolved by the app count.

- de: automatische Antwort; mehrere Posteingänge (out of office agent-chosen: automatische Antwort: 2 of 7 (Thunderbird, Microsoft); multiple inboxes agent-chosen, unresolved by the app count)
- fr: réponse automatique d’absence; boîtes de réception multiples (out of office agent-chosen: réponse automatique d'absence: 2 of 7 (Microsoft, Apple); multiple inboxes agent-chosen, unresolved by the app count)
- it: risposta automatica; Posta in arrivo multipla (agent-chosen, unresolved by the app count: Thunderbird writes risposta automatica, Microsoft fuori sede, Apple assenza)
- es: fuera de la oficina; varias bandejas de entrada (out of office agent-chosen: fuera de la oficina: 2 of 7 (Thunderbird, Microsoft); multiple inboxes agent-chosen, unresolved by the app count)
- es-419: respuesta automática; varias bandejas de entrada (agent-chosen, unresolved by the app count: Microsoft writes fuera de la oficina, Apple respuesta automática, Thunderbird ties them)
- pt-BR: resposta automática; várias caixas de entrada (out of office agent-chosen: resposta automática: 2 of 7 (Microsoft, Apple); multiple inboxes agent-chosen, unresolved by the app count)
- nl: automatisch antwoord bij afwezigheid; meerdere inboxen (agent-chosen, unresolved by the app count: Thunderbird writes automatisch antwoord, Microsoft afwezigheid, Apple ties them)
- pl: autoodpowiedź; wiele skrzynek odbiorczych (agent-chosen, unresolved by the app count: Microsoft writes nieobecność, Apple poza biurem, Thunderbird ties nieobecność and automatyczna odpowiedź)
- sv: frånvaromeddelande; flera inkorgar (agent-chosen, unresolved by the app count: only Microsoft, frånvarande, and Thunderbird, a tie)
- ja: 不在; マルチ受信トレイ (out of office agent-chosen: 不在: 2 of 7 (Thunderbird, Apple); multiple inboxes agent-chosen, unresolved by the app count)

## 1Password's words

The steps for connecting the 1Password desktop app quote its own interface: Settings, Browser and Add Browser. Like Gmail's words, they take the word 1Password shows in that language, read from the app or its support pages, never a fresh translation. Say in your summary which wording you used, so it can be added here.

## Common actions

The labels for everyday actions such as Cancel, Close, Delete, Save, Quit and Copy Link are in each style sheet, under Common labels, as Chrome writes them, in the sheet's label form. Use them for the same actions and as the model for others, except where the string names a Gmail action or folder, where Gmail's word above wins, as for the Undo button in the message-sent toast, and where the entry has a platform `msgctxt`, where the platform's word wins. Delete and Remove are two words wherever Chrome makes them two, and one where Chrome writes the same word for both: Remove account never reads as deleting it in a language that has the second word.
