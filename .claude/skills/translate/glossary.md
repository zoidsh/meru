# Glossary

One fixed translation per term and catalog. Use it every time the term appears, inflected as the sentence needs, and never a synonym. **Apple** marks Apple's own word, read from macOS Mail, AppKit or, where noted, macOS's Focus strings; a word without the mark has no Apple equivalent and was chosen to sit beside Apple's. The words here are the house words for Meru's own copy. **An OS label takes its platform's word instead**: an entry whose `msgctxt` is `macOS`, `Windows` or `Linux` is a label each operating system names its own way, such as the File menu or Paste, and takes Apple's word (Apple Mail's for a mail menu item), Microsoft's or GNOME's, from the style sheet's Platform words where it has them. Where a term is missing here, follow the style sheet, whose house words come first and Apple's after, and say in your summary which word you chose so it can be added.

**Gmail's word wins.** When a Meru string names something Gmail also shows, such as a folder, a Gmail action or the text of a toast over Gmail, it uses the word Gmail shows in that language, not Apple's, so the two read the same side by side. The words are under [Gmail's words](#gmails-words) and [Move email to Trash](#move-email-to-trash); a Gmail term missing there takes Gmail's own word too. Gmail's register does not come with it: the style sheet's address form still applies, so German keeps _du_ where Gmail writes _Sie_.

**macOS's own elements take Apple's names.** The menu bar, the Dock, Finder and System Settings are named as Apple names them in every language, in Meru's own copy as well as in an OS label, because they name Apple's interface and show only on macOS. Each style sheet gives its language's words, under Traps.

**Chrome** marks Chrome's word, read from Chromium's translations; the sidecar rule that enforces it gives Chrome's count as its source.

**Agent-chosen** marks a word a translating agent picked for its language's first catalog, brought into line with the house words but not yet reviewed by a speaker. Use it like any other entry; a reviewer's word replaces it. An entry that lists only some languages gets the others' words when they are added.

Capitalization below is the base form inside a sentence. A label takes its language's label capitalization from the style sheet: `pt-BR` title-cases menu items, for example _Caixa de Entrada Unificada_.

## Terms that stay English

**Gmail**, **Google**, **Google Workspace**, **Meru**, **Meru Pro** and **Pro** are never translated, inflected inside the word or transliterated. They take the language's articles and case endings outside the word only where the style sheet allows it (Polish _w Gmailu_ is fine; _Gmaila_ in place of _Gmail_ in a label is not). In Japanese they stay in Latin letters with no space on either side: _Meru Proにアップグレード_. The same holds for the names of Google's apps when the interface shows them as names: Calendar, Meet, Chat and Drive follow the Google account and are not Meru's to translate, so they stay as the source writes them unless a comment says otherwise. `Workspace` on its own is short for Google Workspace and stays English too.

## Settings

The window and Meru's own copy, in Chrome's word where Chrome settles it, also the Settings section of the language's style sheet. The app-menu item has a platform `msgctxt`: on macOS it is AppKit's word with AppKit's ellipsis, named below where it differs, and on Windows and Linux the platform's word, from the style sheet.

- de: Einstellungen; the macOS menu item _Einstellungen …_ with a no-break space before the ellipsis (Apple)
- fr: Paramètres (Chrome); the macOS menu item _Réglages…_ (Apple)
- it: Impostazioni (Apple, Chrome)
- es: Configuración (Chrome); the macOS menu item _Ajustes…_ (Apple)
- es-419: Configuración (Apple, Chrome)
- pt-BR: Configurações (Chrome); the macOS menu item _Ajustes…_ (Apple)
- nl: Instellingen; the macOS menu item _Instellingen…_ (Apple, Chrome)
- pl: Ustawienia; the macOS menu item _Ustawienia…_ (Apple, Chrome)
- sv: Inställningar; the macOS menu item _Inställningar…_ (Apple, Chrome)
- ja: 設定 (Apple)

## Account

A Google account in Meru: _Add account_, _Remove account_, _Manage Accounts_.

- de: Konto, plural Konten (_Konto hinzufügen …_). Never _Account_.
- fr: compte (Apple, Chrome; _Ajouter un compte…_)
- it: account, invariable (Apple, Chrome; _Aggiungi account…_), never _accounts_
- es: cuenta (Apple, Chrome; _Añadir cuenta…_)
- es-419: cuenta (Apple, Chrome; _Agregar cuenta…_)
- pt-BR: conta (Apple, Chrome; _Adicionar Conta…_)
- nl: account (Apple, Chrome; _Voeg account toe…_)
- pl: konto (Apple, Chrome; _Dodaj konto…_)
- sv: konto, plural konton (Apple, Chrome; _Lägg till konto…_)
- ja: アカウント (Apple; アカウントを追加…)

## Tab

An entry in an account's vertical tabs strip.

- de: Tab, der; plural Tabs (Apple; _Tab schließen_)
- fr: onglet (Apple, Chrome; _Fermer l’onglet_)
- it: scheda, plural schede (Chrome; _Chiudi scheda_), never Apple's _pannello_
- es: pestaña (Apple, Chrome; _Cerrar pestaña_)
- es-419: pestaña (Apple, Chrome)
- pt-BR: guia (Chrome; _Fechar Guia_), never _aba_, Apple's word
- nl: tabblad (Apple, Chrome; _Sluit tabblad_)
- pl: karta (Apple, Chrome; _Zamknij kartę_)
- sv: flik (Apple, Chrome; _Stäng flik_)
- ja: タブ (Apple; タブを閉じる)

## Pinned tab, Pin, Unpin

A tab kept in the strip's upper section. _Pin_ and _Unpin_ are the context-menu actions; _Unpinned tabs_ is a hibernation option.

- de: fixierter Tab; _Fixieren_, _Loslösen_ (Apple: _Tab fixieren_, _Tab loslösen_)
- fr: onglet épinglé; _Épingler_, _Retirer_ (Chrome: the tab context menu's Pin and Unpin)
- it: scheda fissata; _Fissa_, _Stacca_ (Chrome: the tab context menu's Pin and Unpin)
- es: pestaña fijada; _Fijar_, _Desfijar_ (Chrome: _Fijar pestaña_), never _anclar_, Apple's word
- es-419: pestaña fijada; _Fijar_, _Dejar de fijar_ (Chrome: _Fijar pestaña_), never _anclar_, Apple's word
- pt-BR: guia fixada; _Fixar_, _Liberar_ (Chrome: _Fixar Guia_); Apple's unpin is _Desafixar_
- nl: vastgezet tabblad; _Zet vast_, _Maak los_ (Chrome: _Vastzetten_, _Losmaken_), never _vastmaken_, Apple's word
- pl: przypięta karta; _Przypnij_, _Odepnij_ (Apple, Chrome: _Przypnij kartę_, _Odepnij_)
- sv: fäst flik; _Fäst_, _Lossa_ (Chrome), never _nåla fast_, Apple's word
- ja: 固定タブ; 固定, 固定解除 (Apple: タブを固定, タブを固定解除)

## Unified inbox

The page listing new mail across every account. A description, so lower case inside a sentence; the page title capitalizes its first word. Meru's own feature, built on Gmail's word for the inbox, which is Apple's too except where noted.

- de: gemeinsamer Posteingang (Gmail's and Apple's _Posteingang_)
- fr: boîte de réception unifiée (Gmail's and Apple's _boîte de réception_)
- it: posta in arrivo unificata (Gmail's _Posta in arrivo_; Apple's is _In entrata_)
- es: bandeja de entrada unificada (Gmail's _bandeja de entrada_; Apple's is _buzón de entrada_)
- es-419: bandeja de entrada unificada (Gmail's and Apple's _bandeja de entrada_)
- pt-BR: caixa de entrada unificada (Gmail's and Apple's _Caixa de entrada_)
- nl: gecombineerde inbox (Gmail's _inbox_; Apple's is _Inkomend_)
- pl: wspólna skrzynka odbiorcza. Gmail's folder is _Odebrane_ and Apple's _Przychodzące_, both folder names that read badly as a feature.
- sv: samlad inkorg (Gmail's and Apple's _inkorg_)
- ja: 統合受信トレイ (Gmail's and Apple's 受信トレイ)

## Do Not Disturb

A timed or indefinite hold on notifications. Apple's names, from macOS's Focus strings; they keep Apple's capitalization as a feature name.

- de: Nicht stören (Apple)
- fr: Ne pas déranger (Apple, Chrome)
- it: Non disturbare (Apple, Chrome)
- es: No molestar (Apple, Chrome)
- es-419: No molestar (Apple; Chrome's _No interrumpir_ is not followed)
- pt-BR: Não Perturbe (Apple; Chrome writes _Não perturbe_ in prose)
- nl: Niet storen (Apple, Chrome)
- pl: Nie przeszkadzać (Apple, Chrome)
- sv: Stör ej (Apple, Chrome)
- ja: おやすみモード (Apple)

## Notification

- de: Benachrichtigung, plural Benachrichtigungen. Never _Mitteilung_.
- fr: notification (Apple, Chrome)
- it: notifica, plural notifiche (Apple, Chrome)
- es: notificación (Apple, Chrome)
- es-419: notificación (Apple, Chrome)
- pt-BR: notificação (Apple, Chrome)
- nl: melding (Apple, Chrome), never _notificatie_
- pl: powiadomienie (Apple, Chrome)
- sv: avisering, plural aviseringar (Chrome). Never _notis_, Apple's word, which only a `macOS` label keeps.
- ja: 通知 (Apple)

## Notification hours

The time windows outside which no notification is shown. The interface reads _Notification times_; one window is a _time window_. Built on the word for notification above.

- de: Benachrichtigungszeiten; a window is a _Zeitfenster_
- fr: horaires des notifications; a window is a _plage horaire_
- it: orari delle notifiche; a window is una _fascia oraria_
- es: horario de notificaciones; a window is una _franja horaria_
- es-419: horario de notificaciones; a window is un _intervalo de tiempo_
- pt-BR: horários de notificação; a window is um _intervalo de horário_
- nl: meldingstijden; a window is een _tijdvak_
- pl: godziny powiadomień; a window is _przedział czasu_
- sv: aviseringstider; a window is ett _tidsfönster_
- ja: 通知時間帯; a window is 時間帯

## Hibernation, Hibernate

Unloading an idle tab to give back its memory. _Hibernate idle tabs_, _Hibernate after_, _Hibernate When Idle_.

- de: Ruhezustand; _in den Ruhezustand versetzen_
- fr: mise en veille; _mettre en veille_
- it: ibernazione; _iberna_
- es: hibernación; _hibernar_
- es-419: hibernación; _hibernar_
- pt-BR: hibernação; _hibernar_
- nl: slaapstand; _in slaapstand zetten_
- pl: hibernacja; _hibernuj_
- sv: viloläge; _försätt i viloläge_
- ja: 休止; 休止する

## Workspace app

A Google Workspace site opened as a tab or window. _Workspace_ stays English.

- de: Workspace-App, plural Workspace-Apps
- fr: appli Workspace, plural applis Workspace (Chrome's _appli_), never _app_
- it: app di Workspace (Chrome's _app_)
- es: aplicación de Workspace (Chrome's _aplicación_), never _app_ outside a `macOS` label
- es-419: app de Workspace (Chrome's _app_)
- pt-BR: app do Workspace (Chrome's _app_)
- nl: Workspace-app
- pl: aplikacja Workspace
- sv: Workspace-app
- ja: Workspaceアプリ

## App links tab

The one tab per app that every link to that app opens in. The badge setting reads _Show app links badge_.

- de: Tab für App-Links
- fr: onglet des liens d’appli
- it: scheda dei link dell’app
- es: pestaña de enlaces de la aplicación
- es-419: pestaña de vínculos de la app
- pt-BR: guia de links do app
- nl: tabblad voor app-links
- pl: karta linków aplikacji
- sv: flik för applänkar
- ja: アプリリンク用タブ

## Saved search

A named Gmail query an account keeps.

- de: gespeicherte Suche
- fr: recherche enregistrée (Apple's _Enregistrer_)
- it: ricerca salvata (Apple's _Salva_)
- es: búsqueda guardada (Apple's _Guardar_)
- es-419: búsqueda guardada (Apple's _Guardar_)
- pt-BR: pesquisa salva (Chrome's _pesquisa_), never _busca_
- nl: opgeslagen zoekopdracht (Chrome's _opslaan_; Apple's _Bewaar_ only in a `macOS` label)
- pl: zapisane wyszukiwanie (Chrome's _zapisać_)
- sv: sparad sökning (Apple's and Chrome's _Spara_, Apple's _Sök_)
- ja: 保存した検索 (Apple's 保存, 検索)

## Bookmark

A saved URL for an account, opened from the bookmarks popup.

- de: Lesezeichen
- fr: favori, plural favoris (Chrome; _Ajouter aux favoris_), never _signet_
- it: preferito, plural preferiti (Chrome; _Preferiti_, _Aggiungi ai Preferiti_), never _segnalibro_
- es: marcador (Chrome)
- es-419: favorito (Chrome), never _marcador_
- pt-BR: favorito (Chrome)
- nl: bookmark (Chrome), never _bladwijzer_, Apple's word
- pl: zakładka (Chrome)
- sv: bokmärke (Chrome)
- ja: ブックマーク

## Launcher

The titlebar or sidebar dropdown that opens a workspace app.

- de: Starter
- fr: lanceur (Chrome)
- it: launcher, invariable. Chrome's _Avvio app_ is ChromeOS's name for its own launcher, not taken
- es: menú de aplicaciones (Chrome)
- es-419: selector (Chrome)
- pt-BR: iniciador (Chrome)
- nl: starter
- pl: menu aplikacji
- sv: appstartare
- ja: ランチャー

## Vertical tabs

The strip down the left edge of the window.

- de: vertikale Tabs (Apple's _Tab_)
- fr: onglets verticaux (Apple's _onglet_; Chrome)
- it: schede verticali (Chrome)
- es: pestañas verticales (Apple's and Chrome's _pestaña_)
- es-419: pestañas verticales (Apple's and Chrome's _pestaña_)
- pt-BR: guias verticais (Chrome's _guia_)
- nl: verticale tabbladen (Apple's _tabblad_, Chrome)
- pl: karty pionowe (Apple's _karta_, Chrome)
- sv: vertikala flikar (Apple's _flik_, Chrome)
- ja: 縦型タブ (Apple's タブ)

## Titlebar

The strip across the top of the window.

- de: Titelleiste
- fr: barre de titre (Chrome)
- it: barra del titolo (Chrome)
- es: barra de título (Chrome)
- es-419: barra de título (Chrome)
- pt-BR: barra de título (Chrome)
- nl: titelbalk (Chrome)
- pl: pasek tytułu (Chrome), never _pasek tytułowy_
- sv: namnlist (Chrome)
- ja: タイトルバー

## Sidebar

- de: Seitenleiste (Apple)
- fr: barre latérale (Apple, Chrome)
- it: barra laterale (Apple, Chrome)
- es: barra lateral (Apple)
- es-419: barra lateral (Apple)
- pt-BR: barra lateral (Apple)
- nl: navigatiekolom (Apple)
- pl: pasek boczny (Apple, Chrome)
- sv: sidofält (Apple, Chrome)
- ja: サイドバー (Apple)

## Menu bar icon, System tray icon

The icon in the macOS menu bar, or in the Windows and Linux system tray. The menu bar is macOS's own, so its first word below is Apple's, by the rule for macOS's own elements above. The system tray strings carry a `Windows` or `Linux` `msgctxt`; the second word below is Microsoft's, for `Windows`, and `Linux` takes the style sheet's word where it gives one, else this one.

- de: Menüleiste; Infobereich; Linux _Statusbereich_
- fr: barre des menus (Apple); zone de notification
- it: barra dei menu (Apple, Chrome); area di notifica
- es: barra de menús (Apple); bandeja del sistema (Chrome)
- es-419: barra de menús (Apple); bandeja del sistema (Chrome)
- pt-BR: barra de menus (Apple, Chrome); bandeja do sistema (Chrome)
- nl: menubalk; systeemvak (Chrome both)
- pl: pasek menu; obszar powiadomień (Chrome both)
- sv: menyrad; systemfält (Chrome both)
- ja: メニューバー; 通知領域; Linux システムトレイ

## Window

- de: Fenster (Apple)
- fr: fenêtre (Apple, Chrome)
- it: finestra (Apple, Chrome)
- es: ventana (Apple, Chrome)
- es-419: ventana (Apple, Chrome)
- pt-BR: janela (Apple, Chrome)
- nl: venster (Apple, Chrome)
- pl: okno (Apple, Chrome)
- sv: fönster (Apple, Chrome)
- ja: ウィンドウ in Meru's own copy, never ウインドウ; a `macOS` label such as the Window menu takes Apple's ウインドウ

## Verification code

A one-time passcode Meru copies to the clipboard.

- de: Bestätigungscode
- fr: code de validation (Chrome), never _code de vérification_
- it: codice di verifica (Chrome)
- es: código de verificación (Chrome)
- es-419: código de verificación (Chrome)
- pt-BR: código de verificação (Chrome)
- nl: verificatiecode (Chrome)
- pl: kod weryfikacyjny (Chrome)
- sv: verifieringskod (Chrome)
- ja: 確認コード

## Move email to Trash

The verification-codes switch. It names Gmail's own folder, so _Trash_ takes Gmail's word, as the rule above says. Never a word for _delete_. Source: Gmail Help, "Delete or recover deleted Gmail messages" (support.google.com/mail/answer/7401, `hl=<tag>`).

- de: Papierkorb (Gmail, and Apple's)
- fr: Corbeille (Gmail, and Apple's)
- it: Cestino (Gmail, and Apple's)
- es: Papelera (Gmail, and Apple's)
- es-419: Papelera (Gmail; Apple's is _Basurero_)
- pt-BR: Lixeira (Gmail; Apple's is _Lixo_)
- nl: Prullenbak (Gmail; Apple's is _Prullenmand_)
- pl: Kosz (Gmail, and Apple's)
- sv: Papperskorgen (Gmail; Apple's _Papperskorg_ in the definite)
- ja: ゴミ箱 (Gmail, and Apple's)

## Extension

A Chrome extension from Meru's list.

- de: Erweiterung (Apple)
- fr: extension (Apple, Chrome)
- it: estensione (Apple, Chrome)
- es: extensión (Apple, Chrome)
- es-419: extensión (Apple, Chrome)
- pt-BR: extensão (Apple, Chrome)
- nl: extensie (Apple, Chrome)
- pl: rozszerzenie (Apple, Chrome)
- sv: tillägg (Apple, Chrome)
- ja: 拡張機能 (Chrome), never 機能拡張, Apple's word

## Experimental, Beta

The two maturity badges, and _Beta_ is also the update channel beside _Stable_. Never a third word.

- de: Experimentell; Beta; Stabil
- fr: Expérimental; Bêta; Stable (Chrome)
- it: Sperimentale; Beta; Stabile (Chrome)
- es: Experimental; Beta; Estable (Chrome)
- es-419: Experimental; Beta; Estable (Chrome)
- pt-BR: Experimental; Beta; Estável (Chrome)
- nl: Experimenteel; Bèta; Stabiel (Chrome's _Bèta_ and _Stabiel_)
- pl: Eksperymentalne; Beta; Stabilna
- sv: Experimentell; Beta; Stabil (Chrome)
- ja: 実験的; ベータ; 安定版

## Load on Launch

The pinned tab's context-menu item deciding whether it comes back as a view at start.

- de: Beim Start laden
- fr: Charger au démarrage (Chrome's _démarrage_)
- it: Carica all’avvio (Chrome's _avvio_)
- es: Cargar al iniciar
- es-419: Cargar al iniciar
- pt-BR: Carregar ao Iniciar
- nl: Laad bij starten
- pl: Wczytuj przy uruchomieniu
- sv: Läs in vid start
- ja: 起動時に読み込む

## Upgrade

Reaching Pro, in buttons and prose alike. Never a word for _purchase_ or _buy_.

- de: Upgrade; _Auf Meru Pro upgraden_. In a sentence, the noun: _ein Upgrade auf Meru Pro_, as in _Mit einem Upgrade auf Meru Pro kannst du weitere Konten hinzufügen._ (agent-chosen)
- fr: Passer à Meru Pro
- it: Passa a Meru Pro
- es: Mejorar a Meru Pro
- es-419: Mejorar a Meru Pro
- pt-BR: Fazer Upgrade para o Meru Pro
- nl: Upgrade naar Meru Pro
- pl: Przejdź na Meru Pro
- sv: Uppgradera till Meru Pro
- ja: Meru Proにアップグレード. In a sentence, the same verb: _Meru Proにアップグレードすると、アカウントをさらに追加できます_ (agent-chosen)

## License key, Trial, Device

- de: Lizenzschlüssel; Testzeitraum; Gerät
- fr: clé de licence; période d’essai; appareil (Chrome)
- it: chiave di licenza; periodo di prova; dispositivo (Chrome)
- es: clave de licencia; periodo de prueba; dispositivo (Chrome)
- es-419: clave de licencia; período de prueba; dispositivo (Chrome)
- pt-BR: chave de licença; período de avaliação; dispositivo (Chrome)
- nl: licentiesleutel; proefperiode; apparaat (Chrome's _apparaat_)
- pl: klucz licencyjny; okres próbny; urządzenie (Chrome's _urządzenie_)
- sv: licensnyckel; provperiod; enhet (Chrome's _enhet_)
- ja: ライセンスキー; 試用期間; デバイス

## Download history

- de: Downloadverlauf for the page, in _Download history_, _Full download history_ and _Close download history_ (Apple's _Download_); the recent download history popup is _Letzte Downloads_ (_Letzte Downloads anzeigen_), never _Aktueller Downloadverlauf_
- fr: historique des téléchargements, in _Historique complet des téléchargements_ and _Fermer l’historique des téléchargements_ (Chrome); the recent download history popup is _Historique des téléchargements récents_ (Chrome)
- it: cronologia dei download; the page's title _Cronologia download_ (Chrome); the recent download history popup is _Cronologia dei download recenti_ (Chrome)
- es: historial de descargas (Chrome), also in _Historial de descargas recientes_
- es-419: historial de descargas (Chrome), also in _Historial de descargas recientes_
- pt-BR: histórico de downloads (Chrome), also in _Histórico de downloads recentes_
- nl: downloadgeschiedenis (Chrome; Apple's _Download_)
- pl: historia pobierania (Chrome; Apple's _Pobierz_)
- sv: nedladdningshistorik (Chrome), never _hämtningshistorik_; downloading is _ladda ned_, a download a _nedladdning_
- ja: ダウンロード履歴 (Apple's ダウンロード)

## Dark theme, Blocker, Spellchecker

- de: dunkles Design; Blocker; Rechtschreibprüfung
- fr: thème sombre (Chrome); bloqueur; correcteur orthographique (Apple, Chrome)
- it: tema scuro (Chrome); blocco contenuti; controllo ortografico (Chrome)
- es: tema oscuro (Chrome); bloqueador; corrector ortográfico (Chrome)
- es-419: tema oscuro (Chrome); bloqueador; corrector ortográfico (Chrome)
- pt-BR: tema escuro (Chrome); bloqueador; verificação ortográfica (Chrome)
- nl: donker thema (Chrome); blokkering; spellingcontrole (Chrome)
- pl: ciemny motyw (Chrome); blokowanie; sprawdzanie pisowni (Apple, Chrome)
- sv: mörkt tema (Chrome); blockerare; stavningskontroll (Chrome)
- ja: ダークテーマ; ブロッカー; スペルチェック

## Keyboard keys

A key named in a sentence, such as the Workspace apps Mode setting's _hold Cmd_ or _Ctrl_ and _Shift_. The source writes the short form printed on keys, so keep a short form where the language has one: Cmd and Option on macOS, Ctrl, Shift and Alt on Windows and Linux. Cmd and Ctrl are separate messages already, and Shift carries a platform `msgctxt`: `macOS` takes Apple's name, `Windows` Microsoft's and `Linux` GNOME's, from the style sheet's Platform words where it has them. Sources: **Apple** is "Mac keyboard shortcuts" (support.apple.com/<locale>/102650), which names each key with its short form in brackets; **Microsoft** is "Keyboard shortcuts in Windows" (support.microsoft.com/<locale>/windows/keyboard-shortcuts-in-windows-dcc61a57-8ff0-cffe-9796-cb9706c75eec). Each line gives Apple's Command, Shift, Option and Control, then Microsoft's Ctrl, Shift and Alt.

- de: Apple Befehlstaste (Cmd), Umschalttaste, Wahltaste (Alt), Control-Taste (Ctrl); Microsoft Strg, Umschalt, Alt (Microsoft writes them in capitals, STRG and UMSCHALT)
- fr: Apple Commande (Cmd), Maj, Option (Alt), Contrôle (Ctrl); Microsoft Ctrl, Maj, Alt (Chrome writes Maj too)
- it: Apple Comando (Cmd), Maiuscole, Opzione (Alt), Control (Ctrl); Microsoft Ctrl, Maiusc, Alt (Microsoft writes them in capitals, CTRL and MAIUSC; Chrome writes Maiusc)
- es: Apple Comando (Cmd), Mayúsculas, Opción (Alt), Control (Ctrl); Microsoft Ctrl, Mayús, Alt
- es-419: Apple Comando (Cmd), Mayúsculas, Opción (Alt), Control (Ctrl); Microsoft Ctrl, Mayús, Alt
- pt-BR: Apple Command (Cmd), Shift, Option (Alt), Control (Ctrl); Microsoft Ctrl, Shift, Alt
- nl: Apple Command (Cmd), Shift, Option (Alt), Control (Ctrl); Microsoft Ctrl, Shift, Alt
- pl: Apple Command (Cmd), Shift, Option (Alt), Control (Ctrl); Microsoft Ctrl, Shift, Alt
- sv: Apple Kommando (Kmd), Skift, Alternativ (Alt), Kontroll (Ctrl); Microsoft Ctrl, Skift, Alt
- ja: Apple command (cmd), shift, option (alt), control (ctrl), in lower case; Microsoft Ctrl, Shift, Alt, with キー after the name in running prose

## Toast

A brief message Meru shows over its window or over Gmail, such as the one after a setting changes, and the region the toasts appear in, which the interface reads as _Notifications_ with `msgctxt` `toasts`. Never the word for a system [notification](#notification).

- de: Hinweis, plural Hinweise (_Hinweis schließen_) (agent-chosen)
- fr: avis (_Fermer l’avis_), never _notification_ (agent-chosen)
- it: avviso, plural avvisi (_Chiudi avviso_), never _notifica_ (agent-chosen)
- es: aviso, plural avisos (_Cerrar aviso_), never _notificación_ (agent-chosen)
- es-419: aviso, plural avisos (_Cerrar aviso_), never _notificación_ (agent-chosen)
- pt-BR: aviso, plural avisos (_Fechar Aviso_), never _notificação_ (agent-chosen)
- nl: mededeling, plural mededelingen (_Sluit mededeling_), never _melding_ (agent-chosen)
- pl: komunikat, plural komunikaty (_Zamknij komunikat_), never _powiadomienie_ (agent-chosen)
- sv: inforuta, plural inforutor (_Stäng inforuta_), never _avisering_ (agent-chosen)
- ja: お知らせ (お知らせを閉じる), never 通知 (agent-chosen)

## Unread badge

The count on an account, a tab or the dock icon for its unread emails: _Show unread badge_, _Unread badge_.

- de: Kennzeichen; in full _Kennzeichen für ungelesene E-Mails_ (_Kennzeichen für ungelesene E-Mails anzeigen_), never the coined _Ungelesen-Kennzeichen_ (agent-chosen)
- fr: pastille, Apple's word for a badge; in full _pastille des e-mails non lus_ (_Afficher la pastille des e-mails non lus_) (agent-chosen)
- it: badge, as Apple writes it; in full _badge delle email non lette_ (_Mostra il badge delle email non lette_) (agent-chosen)
- es: indicador de no leídos (_Mostrar indicador de no leídos_) (agent-chosen)
- es-419: indicador de no leídos (_Mostrar indicador de no leídos_) (agent-chosen)
- pt-BR: indicador de não lidos (_Mostrar Indicador de Não Lidos_) (agent-chosen)
- nl: badge; in full _badge voor ongelezen e-mails_ (_Toon badge voor ongelezen e-mails_) (agent-chosen)
- pl: plakietka; in full _plakietka z liczbą nieprzeczytanych_ (_Pokaż plakietkę z liczbą nieprzeczytanych_) (agent-chosen)
- sv: symbolbricka; in full _symbolbricka för olästa_ (_Visa symbolbricka för olästa_) (agent-chosen)
- ja: 未読バッジ (未読バッジを表示) (agent-chosen)

The badge on an account's row in Settings, `msgctxt` `account row badge`, sits on a row that cannot wrap, so it takes the shortest form:

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

The tabs within an account, which Workspace apps' New windows mode leaves out: _Narrow the tab strip_.

- de: Tableiste (_Tableiste verschmälern_) (agent-chosen)
- fr: barre d’onglets (_Réduire la barre d’onglets_) (Chrome)
- it: barra delle schede (_Restringi la barra delle schede_) (the user's call; Chrome's is _tabstrip_)
- es: barra de pestañas (_Estrechar la barra de pestañas_) (Chrome)
- es-419: barra de pestañas (_Estrechar la barra de pestañas_) (Chrome)
- pt-BR: barra de guias (_Estreitar a Barra de Guias_) (Chrome)
- nl: tabbladstrook (_Maak de tabbladstrook smaller_) (Chrome)
- pl: pasek kart (_Zwęź pasek kart_) (Chrome)
- sv: flikhuvud (_Gör flikhuvudet smalare_) (Chrome)
- ja: タブバー (タブバーを狭くする) (Chrome), never タブストリップ

## Label, Meru's

The name Meru shows for an account or a saved search, in its _Label_ field and _Enter a label_ with `msgctxt` `saved search`. Never Gmail's label, which is under [Starred, Snooze, Label](#starred-snooze-label) and carries `msgctxt` `Gmail label`.

- de: Name (_Namen eingeben_) (agent-chosen)
- fr: nom (_Saisir un nom_) (agent-chosen)
- it: nome (_Inserisci un nome_) (agent-chosen)
- es: nombre (_Introduce un nombre_) (agent-chosen)
- es-419: nombre (_Ingresa un nombre_) (agent-chosen)
- pt-BR: nome (_Digite um nome_) (agent-chosen)
- nl: Naam (_Voer een naam in_) (agent-chosen)
- pl: Nazwa (_Wpisz nazwę_) (agent-chosen)
- sv: Namn (_Ange ett namn_) (agent-chosen)
- ja: 名前 (名前を入力) (agent-chosen)

## Device label

The name this computer goes by among the devices using a license key.

- de: Gerätename (_Gerätenamen eingeben_) (agent-chosen)
- fr: nom de l’appareil (_Saisir le nom de l’appareil_) (agent-chosen, with Chrome's _appareil_)
- it: nome del dispositivo (_Inserisci il nome del dispositivo_) (agent-chosen, with Chrome's _dispositivo_)
- es: nombre del dispositivo (_Introduce un nombre del dispositivo_) (Chrome's _nombre de dispositivo_)
- es-419: nombre del dispositivo (_Ingresa un nombre del dispositivo_) (Chrome's _nombre de dispositivo_)
- pt-BR: nome do dispositivo (_Digite um nome do dispositivo_) (Chrome's _nome do dispositivo_)
- nl: apparaatnaam (_Voer een apparaatnaam in_) (Chrome)
- pl: nazwa urządzenia (_Wpisz nazwę urządzenia_) (Chrome)
- sv: enhetsnamn (_Ange ett enhetsnamn_) (Chrome)
- ja: デバイス名 (デバイス名を入力) (agent-chosen)

## Release channel

Which releases Meru updates to, Stable or [Beta](#experimental-beta): _Release channel_, _Switch to the beta channel?_

- de: Update-Kanal; _Beta-Kanal_ (_Zum Beta-Kanal wechseln?_) (agent-chosen)
- fr: version de mise à jour; _version bêta_ (_Passer à la version bêta ?_, with a no-break space before ?) (Chrome)
- it: canale di aggiornamento; _canale beta_ (_Passare al canale beta?_) (Chrome)
- es: canal de versiones; _canal beta_ (_¿Cambiar al canal beta?_) (Chrome's _canal_)
- es-419: canal de versiones; _canal beta_ (_¿Cambiar al canal beta?_) (Chrome's _canal_)
- pt-BR: canal de versões; _canal beta_ (_Mudar para o canal beta?_) (Chrome's _canal_)
- nl: updatekanaal; _bètakanaal_ (_Overschakelen naar het bètakanaal?_) (Chrome's _kanaal_ and _Bèta_; the compounds agent-chosen)
- pl: kanał aktualizacji; _kanał beta_ (_Przełączyć na kanał beta?_) (Chrome's _kanał aktualizacji_)
- sv: uppdateringskanal; _betakanal_ (_Vill du byta till betakanalen?_) (Chrome's _kanal_; the compounds agent-chosen)
- ja: リリースチャンネル; ベータチャンネル (ベータチャンネルに切り替えますか?) (agent-chosen)

## Trusted hosts

The hosts whose links open without the link prompt: _Trusted hosts_, _links from untrusted hosts_.

- de: vertrauenswürdige Hosts; _nicht vertrauenswürdige Hosts_ (agent-chosen)
- fr: hôtes approuvés; _hôtes non approuvés_ (Chrome's _approuvé_)
- it: host attendibili; _host non attendibili_ (Chrome)
- es: hosts de confianza; _hosts que no son de confianza_ (Chrome's _de confianza_)
- es-419: hosts de confianza; _hosts que no son de confianza_ (Chrome's _de confianza_)
- pt-BR: hosts confiáveis; _hosts não confiáveis_ (Chrome's _confiável_)
- nl: vertrouwde hosts; _niet-vertrouwde hosts_ (Chrome's _vertrouwd_ and _host_)
- pl: zaufane hosty; _niezaufane hosty_ (Chrome's _zaufany_ and _host_)
- sv: betrodda värdar; _ej betrodda värdar_ (Chrome's _betrodd_ and _värd_)
- ja: 信頼するホスト; 信頼されていないホスト (agent-chosen)

## Phishing protection

- de: Phishing-Schutz (agent-chosen)
- fr: protection contre l’hameçonnage (Chrome's _hameçonnage_)
- it: protezione dal phishing (Chrome's _phishing_)
- es: protección contra phishing (Chrome's _phishing_)
- es-419: protección contra phishing (Chrome's _phishing_)
- pt-BR: proteção contra phishing (Chrome's _phishing_)
- nl: phishingbescherming (Chrome's _phishing_; agent-chosen compound)
- pl: ochrona przed phishingiem (agent-chosen; Chrome writes both _phishing_ and _wyłudzanie informacji_)
- sv: skydd mot nätfiske (Chrome's _nätfiske_)
- ja: フィッシング対策 (agent-chosen)

## Notify

The verb beside [Notification](#notification): _Notify when updates are available_, _Notify for_.

- de: benachrichtigen (_Bei verfügbaren Updates benachrichtigen_) (agent-chosen)
- fr: avertir (_M’avertir quand des mises à jour sont disponibles_) (agent-chosen)
- it: avvisare (_Avvisa quando sono disponibili aggiornamenti_) (agent-chosen)
- es: notificar (_Notificar cuando haya actualizaciones_) (Chrome)
- es-419: notificar (_Notificar cuando haya actualizaciones_) (Chrome)
- pt-BR: notificar (_Notificar Quando Houver Atualizações_) (agent-chosen; Chrome rewrites it as _enviar notificações_)
- nl: melden (_Meld wanneer er updates beschikbaar zijn_) (agent-chosen)
- pl: powiadamiać (_Powiadamiaj o dostępnych aktualizacjach_) (agent-chosen)
- sv: avisera (_Avisera när uppdateringar finns_) (agent-chosen, beside Chrome's _avisering_)
- ja: 通知する (アップデートが利用可能になったら通知) (agent-chosen)

## Move

Moving a tab, an email, an attachment or a file: _Move to New Window_, _Move attachments to top_, _File moved or deleted_.

- de: verschieben (_In neues Fenster verschieben_, _Datei verschoben oder gelöscht_); _bewegen_ is only for dragging or the pointer (agent-chosen)
- fr: déplacer (_Déplacer vers une nouvelle fenêtre_, _Fichier déplacé ou supprimé_) (Chrome)
- it: spostare (_Sposta in una nuova finestra_, _File spostato o eliminato_) (Chrome)
- es: mover (_Mover a una ventana nueva_, _Archivo movido o eliminado_) (Chrome)
- es-419: mover (_Mover a una nueva ventana_, _Archivo movido o borrado_) (Chrome)
- pt-BR: mover (_Mover para uma Nova Janela_, _Arquivo movido ou excluído_) (Chrome)
- nl: verplaatsen (_Verplaats naar nieuw venster_, _Bestand verplaatst of verwijderd_) (Chrome)
- pl: przenieść (_Przenieś do nowego okna_, _Plik przeniesiony lub usunięty_) (Chrome)
- sv: flytta (_Flytta till nytt fönster_, _Filen har flyttats eller raderats_) (Chrome)
- ja: 移動 (新しいウィンドウに移動) (agent-chosen)

## Sound names

The notification sounds Breeze, Chime, Duet, Knock and Linen, picked in Settings. They are names, each translated by what one hears, and kept in English where the language's word names something else.

- de: Brise, Klangspiel, Duett, Klopfen, Linen; the German _Leinen_ names only the fabric (agent-chosen)
- fr: Brise, Carillon, Duo, Toc-toc, Lin (agent-chosen)
- it: Brezza, Rintocco, Duetto, Bussata, Lino (agent-chosen)
- es: Brisa, Campanilla, Dúo, Golpe, Lino (agent-chosen)
- es-419: Brisa, Campanilla, Dúo, Golpe, Lino (agent-chosen)
- pt-BR: Brisa, Sino, Dueto, Batida, Linho (agent-chosen)
- nl: Bries, Klokkenspel, Duet, Klop, Linen; the Dutch _linnen_ names only the fabric (agent-chosen)
- pl: Bryza, Dzwonek, Duet, Pukanie, Linen; the Polish _len_ names the fabric and the plant (agent-chosen)
- sv: Bris, Klockspel, Duett, Knack, Linen; the Swedish _linne_ names the fabric and a vest (agent-chosen)
- ja: ブリーズ, チャイム, デュエット, ノック, リネン (agent-chosen)

## Button

A button drawn on screen, such as the bookmarks button, the width button or Gmail's Upgrade button, never a key on the keyboard, which is under [Keyboard keys](#keyboard-keys).

- de: Schaltfläche (_Lesezeichen-Schaltfläche_). Never a standalone _Taste_, which reads as a keyboard key; a key name such as _Umschalttaste_ keeps it.
- fr: bouton (_bouton des favoris_) (Chrome); a key on the keyboard is a _touche_
- it: pulsante (_pulsante dei preferiti_) (Chrome); a key on the keyboard, or a hardware button, is a _tasto_
- es: botón (_botón de marcadores_) (Chrome)
- es-419: botón (_botón de favoritos_) (Chrome)
- pt-BR: botão (_botão de favoritos_) (Chrome)
- nl: knop (_bookmarkknop_) (Chrome)
- pl: przycisk (_przycisk zakładek_) (Chrome)
- sv: knapp (_bokmärkesknapp_) (Chrome)
- ja: ボタン (ブックマークボタン)

## Gmail's words

What Gmail itself shows for the things a Meru string can name, used over Apple's word by the rule above. Folder names keep Gmail's capitalization. Sources, all Gmail Help with `hl=<tag>`: **shortcuts** is "Keyboard shortcuts for Gmail" (support.google.com/mail/answer/6594), **undo send** is "Undo sending" (answer/2819488), **spam** is "Mark or unmark Spam" (answer/1366858), **trash** is "Delete or recover deleted Gmail messages" (answer/7401), **categories** is "Add or remove inbox categories & tabs" (answer/3055016) and **importance** is "Importance markers in Gmail" (answer/186543).

### Undo, in the message-sent toast

- de: Rückgängig machen (the user's call, from Gmail's own toast; the undo send page writes _Rückgängig_; Apple's is _Widerrufen_)
- fr: Annuler (undo send)
- it: Annulla (undo send)
- es: Deshacer (undo send)
- es-419: Deshacer (undo send)
- pt-BR: Desfazer (undo send)
- nl: Ongedaan maken (undo send, and Chrome's; Apple's is _Herstel_)
- pl: Cofnij (undo send)
- sv: Ångra (undo send)
- ja: 取り消し (undo send; Apple's is 取り消す)

### Message sent, the toast

- de: Nachricht gesendet (undo send has _Ihre Nachricht wurde gesendet_, in Gmail's _Sie_; Apple's word for a message is _E-Mail_)
- fr: Message envoyé (undo send)
- it: Messaggio inviato (undo send)
- es: Mensaje enviado (undo send)
- es-419: Se envió el mensaje (undo send)
- pt-BR: Mensagem enviada (undo send)
- nl: Bericht verzonden (undo send)
- pl: Wiadomość wysłana (undo send)
- sv: Meddelandet har skickats (undo send; Apple's word for a message is _mejl_, Chrome's _e-postmeddelande_)
- ja: メールを送信しました (undo send)

### Inbox

- de: Posteingang (trash)
- fr: boîte de réception (trash, shortcuts)
- it: Posta in arrivo (trash, shortcuts; Apple's is _In entrata_)
- es: Recibidos as the folder, _bandeja de entrada_ in prose (shortcuts, trash)
- es-419: Recibidos (trash)
- pt-BR: Caixa de entrada (trash, shortcuts)
- nl: inbox (trash, shortcuts; Apple's is _Inkomend_)
- pl: Odebrane (trash, shortcuts; Apple's is _Przychodzące_)
- sv: Inkorgen (trash, shortcuts)
- ja: 受信トレイ (trash, shortcuts)

### Spam

The folder, and _Not spam_ for the button that takes a message out of it.

- de: Spam; Kein Spam (spam, and Apple's _Spam_)
- fr: Spam; Non-spam (spam; Apple's is _Indésirable_)
- it: Spam; Non spam (spam; Apple's is _Indesiderati_)
- es: Spam; No es spam (spam; Apple's is _No deseado_)
- es-419: Spam; No es spam (spam; Apple's is _No deseado_)
- pt-BR: Spam; Não é spam (spam, and Apple's _Spam_)
- nl: Spam; Geen spam (spam, and Apple's _Spam_)
- pl: Spam; To nie jest spam (spam; Apple's is _Niechciana_)
- sv: Skräppost; Inte skräppost (spam; Apple's is _Skräp_)
- ja: 迷惑メール; 迷惑メールではない (spam)

### Archive, Compose, Drafts, Sent

From shortcuts, with Sent and Drafts confirmed by undo send. The File menu's Compose is not this one: it carries a platform `msgctxt` and takes the platform's word for a new email, from the style sheet.

- de: Archivieren; Schreiben; Entwürfe; Gesendet
- fr: Archiver; Nouveau message; Brouillons; Messages envoyés
- it: Archivia; Scrivi; Bozze; Posta inviata
- es: Archivar; Redactar; Borradores; Enviados
- es-419: Archivar; Redactar; Borradores; Enviados
- pt-BR: Arquivar; Escrever; Rascunhos; Enviados
- nl: Archiveren; Opstellen; Concepten; Verzonden
- pl: Archiwizuj; Utwórz; Wersje robocze; Wysłane
- sv: Arkivera; Skriv; Utkast; Skickat
- ja: アーカイブ; 作成; 下書き; 送信済み

### Mark as read, Mark as spam, Delete

The actions on a message in the unified inbox, beside Archive above. From shortcuts, which names each beside its key: Shift+i, ! and #.

- de: Als gelesen markieren; Als Spam markieren; Löschen
- fr: Marquer comme lu; Signaler comme spam; Supprimer
- it: Segna come già letto; Segnala come spam; Elimina
- es: Marcar como leído; Marcar como spam; Eliminar
- es-419: Marcar como leído; Marcar como spam; Eliminar, Gmail's word, though Meru's own Delete is _Borrar_
- pt-BR: Marcar como lida; Denunciar como spam; Excluir
- nl: Markeren als gelezen; Melden als spam; Verwijderen
- pl: Oznacz jako przeczytane; Zgłoś jako spam; Usuń
- sv: Markera som läst; Rapportera som skräppost; Ta bort
- ja: 既読にする; 迷惑メールとして報告; 削除

### Starred, Snooze, Label

From shortcuts: the folder of starred conversations, the action and the folder of snoozed ones, and a label.

- de: Markiert; Zurückstellen, zurückgestellt; Label
- fr: suivi (_conversations dont le suivi est activé_); Mettre en attente, En attente; libellé (Chrome writes _libellé_ too)
- it: Speciali; Posticipa, posticipate; etichetta (Chrome writes _etichetta_ too)
- es: Destacados; Posponer, pospuestas; etiqueta
- es-419: Destacados; Posponer, pospuestas; etiqueta
- pt-BR: Com estrela; Adiar, adiadas; marcador
- nl: Met ster; Snoozen, gesnoozed; label
- pl: Oznaczone gwiazdką; Odłóż, Odłożone; etykieta
- sv: Stjärnmärkt; Skjut upp, uppskjutna; etikett
- ja: スター付き; スヌーズ; ラベル

### Primary

The inbox category, as in _Primary only_. From categories.

- de: Allgemein
- fr: Principale
- it: Principale
- es: Principal
- es-419: Principal
- pt-BR: Principal
- nl: Primair
- pl: Główne
- sv: Primär
- ja: メイン

### Important

What Gmail marks as important, as in _Important only_ and _the emails Gmail marks as important_. From importance, which uses the word in _marked as important_; the label takes the language's label form.

- de: wichtig
- fr: important
- it: importante
- es: importante
- es-419: importante
- pt-BR: importante
- nl: belangrijk
- pl: ważny
- sv: viktig
- ja: 重要

### Pop-out

A reply or forward opened in a window of its own. Gmail Help calls it a new window, so a pop-out is the window of _Reply in a new window_. From shortcuts.

- de: neues Fenster; _In einem neuen Fenster antworten_
- fr: nouvelle fenêtre; _Répondre dans une nouvelle fenêtre_
- it: nuova finestra; _Rispondi in una nuova finestra_
- es: ventana nueva; _Responder en una ventana nueva_
- es-419: nueva ventana; _Responder en una nueva ventana_
- pt-BR: nova janela; _Responder em uma nova janela_
- nl: nieuw venster; _Beantwoorden in een nieuw venster_
- pl: nowe okno; _Odpowiedz w nowym oknie_
- sv: nytt fönster; _Svara i ett nytt fönster_
- ja: 新しいウィンドウ; _新しいウィンドウで返信_

### View entire message, Upgrade

_View entire message_ is the link under a message Gmail has clipped, and _Upgrade_ the button Gmail shows for more Google storage, never Meru Pro's [Upgrade](#upgrade). Read from Gmail's interface with the account's display language set to each.

- de: Vollständige Nachricht ansehen; Upgraden
- fr: Afficher l’intégralité du message; Mettre à niveau
- it: Visualizza intero messaggio; Fai l’upgrade
- es: Ver todo el mensaje; Cambiar a plan superior
- es-419: Ver mensaje completo; Actualizar
- pt-BR: Exibir toda a mensagem; Fazer upgrade
- nl: Hele bericht bekijken; Upgraden
- pl: Pokaż całą wiadomość; Zmień na większy pakiet
- sv: Visa hela meddelandet; Uppgradera
- ja: メッセージ全体を表示; アップグレード

### Out of office, Multiple inboxes

Gmail's vacation responder, as in _Open Gmail settings to turn off out of office_, and the inbox type with several sections. Not yet read from Gmail's interface.

- de: Abwesenheitsnotiz; mehrere Posteingänge (agent-chosen)
- fr: réponse automatique d’absence; boîtes de réception multiples (agent-chosen)
- it: risposta automatica; Posta in arrivo multipla (agent-chosen)
- es: respuesta automática; varias bandejas de entrada (agent-chosen)
- es-419: respuesta automática; varias bandejas de entrada (agent-chosen)
- pt-BR: resposta automática; várias caixas de entrada (agent-chosen)
- nl: automatisch antwoord bij afwezigheid; meerdere inboxen (agent-chosen)
- pl: autoodpowiedź; wiele skrzynek odbiorczych (agent-chosen)
- sv: frånvaromeddelande; flera inkorgar (agent-chosen)
- ja: 不在通知; マルチ受信トレイ (agent-chosen)

## 1Password's words

The steps for connecting the 1Password desktop app quote its own interface: Settings, Browser and Add Browser. Like Gmail's words, they take the word 1Password shows in that language, read from the app or its support pages, never Apple's word or a fresh translation. Say in your summary which wording you used, so it can be added here.

## Common actions

The labels for everyday actions such as Cancel, Close, Delete, Save, Quit and Copy Link are in each style sheet, under Common labels or Apple's words, as its house words. Use them for the same actions and as the model for others, except where the string names a Gmail action or folder, where Gmail's word above wins, as for the Undo button in the message-sent toast, and where the entry has a platform `msgctxt`, where the platform's word wins.
