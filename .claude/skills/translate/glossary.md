# Glossary

One fixed translation per term and catalog. Use it every time the term appears, inflected as the sentence needs, and never a synonym. **Apple** marks Apple's own word, read from macOS Mail, AppKit or, where noted, macOS's Focus strings; a word without the mark has no Apple equivalent and was chosen to sit beside Apple's. The words here are the house words for Meru's own copy. **An OS label takes its platform's word instead**: an entry whose `msgctxt` is `macOS`, `Windows` or `Linux` is a label each operating system names its own way, such as the File menu or Paste, and takes Apple's word (Apple Mail's for a mail menu item), Microsoft's or GNOME's, from the style sheet's Platform words where it has them. Where a term is missing here, follow the style sheet, whose house words come first and Apple's after, and say in your summary which word you chose so it can be added.

**Gmail's word wins.** When a Meru string names something Gmail also shows, such as a folder, a Gmail action or the text of a toast over Gmail, it uses the word Gmail shows in that language, not Apple's, so the two read the same side by side. The words are under [Gmail's words](#gmails-words) and [Move email to Trash](#move-email-to-trash); a Gmail term missing there takes Gmail's own word too. Gmail's register does not come with it: the style sheet's address form still applies, so German keeps _du_ where Gmail writes _Sie_.

**Chrome** marks Chrome's word, read from Chromium's translations; the sidecar rule that enforces it gives Chrome's count as its source.

**Agent-chosen** marks a word a translating agent picked for its language's first catalog, brought into line with the house words but not yet reviewed by a speaker. Use it like any other entry; a reviewer's word replaces it. An entry that lists only some languages gets the others' words when they are added.

Capitalization below is the base form inside a sentence. A label takes its language's label capitalization from the style sheet: `pt-BR` title-cases menu items, for example _Caixa de Entrada Unificada_.

## Terms that stay English

**Gmail**, **Google**, **Google Workspace**, **Meru**, **Meru Pro** and **Pro** are never translated, inflected inside the word or transliterated. They take the language's articles and case endings outside the word only where the style sheet allows it (Polish _w Gmailu_ is fine; _Gmaila_ in place of _Gmail_ in a label is not). In Japanese they stay in Latin letters with no space on either side: _Meru Proにアップグレード_. The same holds for the names of Google's apps when the interface shows them as names: Calendar, Meet, Chat and Drive follow the Google account and are not Meru's to translate, so they stay as the source writes them unless a comment says otherwise. `Workspace` on its own is short for Google Workspace and stays English too.

## Settings

The window and Meru's own copy, in AppKit's word for each, also the language's row in the style sheet. The app-menu item has a platform `msgctxt`: on macOS it is this word with AppKit's ellipsis, and on Windows and Linux the platform's word, from the style sheet.

- de: Einstellungen; the macOS menu item _Einstellungen …_ with a no-break space before the ellipsis (Apple)
- fr: Réglages (Apple)
- it: Impostazioni (Apple)
- es: Ajustes (Apple)
- es-419: Configuración (Apple)
- pt-BR: Ajustes (Apple)
- nl: Instellingen (Apple)
- pl: Ustawienia (Apple)
- sv: Inställningar (Apple)
- ja: 設定 (Apple)

## Account

A Google account in Meru: _Add account_, _Remove account_, _Manage Accounts_.

- de: Konto, plural Konten (_Konto hinzufügen …_). Never _Account_.
- fr: compte (Apple; _Ajouter un compte…_)
- it: account, invariable (Apple; _Aggiungi account…_)
- es: cuenta (Apple; _Añadir cuenta…_)
- es-419: cuenta (Apple; _Agregar cuenta…_)
- pt-BR: conta (Apple; _Adicionar Conta…_)
- nl: account (Apple; _Voeg account toe…_)
- pl: konto (Apple; _Dodaj konto…_)
- sv: konto, plural konton (Apple; _Lägg till konto…_)
- ja: アカウント (Apple; アカウントを追加…)

## Tab

An entry in an account's vertical tabs strip.

- de: Tab, der; plural Tabs (Apple; _Tab schließen_)
- fr: onglet (Apple; _Fermer l’onglet_)
- it: pannello (Apple; _Chiudi pannello_). Apple's Italian calls a tab a _pannello_, never _scheda_.
- es: pestaña (Apple; _Cerrar pestaña_)
- es-419: pestaña (Apple)
- pt-BR: aba (Apple; _Fechar Aba_)
- nl: tabblad (Apple; _Sluit tabblad_)
- pl: karta (Apple; _Zamknij kartę_)
- sv: flik (Apple; _Stäng flik_)
- ja: タブ (Apple; タブを閉じる)

## Pinned tab, Pin, Unpin

A tab kept in the strip's upper section. _Pin_ and _Unpin_ are the context-menu actions; _Unpinned tabs_ is a hibernation option.

- de: fixierter Tab; _Fixieren_, _Loslösen_ (Apple: _Tab fixieren_, _Tab loslösen_)
- fr: onglet épinglé; _Épingler_, _Ne plus épingler_ (Apple)
- it: pannello fissato; _Fissa_, _Sblocca_ (Apple: _Fissa pannello_, _Sblocca pannello_)
- es: pestaña anclada; _Anclar_, _Desanclar_ (Apple)
- es-419: pestaña anclada; _Anclar_, _Desanclar_ (Apple)
- pt-BR: aba fixada; _Fixar_, _Desafixar_ (Apple: _Fixar Aba_, _Desafixar Aba_)
- nl: vastgemaakt tabblad; _Maak vast_, _Maak los_ (Apple: _Maak tabblad vast_)
- pl: przypięta karta; _Przypnij_, _Odepnij_ (Apple: _Przypnij kartę_, _Odepnij kartę_)
- sv: fastnålad flik; _Nåla fast_, _Lossa_ (Apple: _Nåla fast flik_, _Lossa på flik_)
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
- fr: Ne pas déranger (Apple)
- it: Non disturbare (Apple)
- es: No molestar (Apple)
- es-419: No molestar (Apple)
- pt-BR: Não Perturbe (Apple)
- nl: Niet storen (Apple)
- pl: Nie przeszkadzać (Apple)
- sv: Stör ej (Apple)
- ja: おやすみモード (Apple)

## Notification

- de: Benachrichtigung, plural Benachrichtigungen. Never _Mitteilung_.
- fr: notification (Apple)
- it: notifica, plural notifiche (Apple)
- es: notificación (Apple)
- es-419: notificación (Apple)
- pt-BR: notificação (Apple)
- nl: melding (Apple)
- pl: powiadomienie (Apple)
- sv: notis, plural notiser (Apple)
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
- sv: notistider; a window is ett _tidsfönster_
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
- fr: app Workspace, plural apps Workspace
- it: app di Workspace
- es: app de Workspace
- es-419: app de Workspace
- pt-BR: app do Workspace
- nl: Workspace-app
- pl: aplikacja Workspace
- sv: Workspace-app
- ja: Workspaceアプリ

## App links tab

The one tab per app that every link to that app opens in. The badge setting reads _Show app links badge_.

- de: Tab für App-Links
- fr: onglet des liens d’app
- it: pannello dei link dell’app
- es: pestaña de enlaces de la app
- es-419: pestaña de enlaces de la app
- pt-BR: aba de links do app
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
- pt-BR: busca salva (Apple's _Buscar_, _Salvar_)
- nl: bewaarde zoekopdracht (Apple's _Bewaar_)
- pl: zapisane wyszukiwanie
- sv: sparad sökning (Apple's _Spara_, _Sök_)
- ja: 保存した検索 (Apple's 保存, 検索)

## Bookmark

A saved URL for an account, opened from the bookmarks popup.

- de: Lesezeichen
- fr: signet
- it: segnalibro
- es: marcador
- es-419: marcador
- pt-BR: favorito
- nl: bladwijzer
- pl: zakładka
- sv: bokmärke
- ja: ブックマーク

## Launcher

The titlebar or sidebar dropdown that opens a workspace app.

- de: Starter
- fr: lanceur
- it: launcher, invariable
- es: lanzador
- es-419: lanzador
- pt-BR: inicializador
- nl: starter
- pl: menu aplikacji
- sv: appstartare
- ja: ランチャー

## Vertical tabs

The strip down the left edge of the window.

- de: vertikale Tabs (Apple's _Tab_)
- fr: onglets verticaux (Apple's _onglet_)
- it: pannelli verticali (Apple's _pannello_)
- es: pestañas verticales (Apple's _pestaña_)
- es-419: pestañas verticales (Apple's _pestaña_)
- pt-BR: abas verticais (Apple's _aba_)
- nl: verticale tabbladen (Apple's _tabblad_)
- pl: karty pionowe (Apple's _karta_)
- sv: vertikala flikar (Apple's _flik_)
- ja: 縦型タブ (Apple's タブ)

## Titlebar

The strip across the top of the window.

- de: Titelleiste
- fr: barre de titre
- it: barra del titolo
- es: barra de título
- es-419: barra de título
- pt-BR: barra de título
- nl: titelbalk
- pl: pasek tytułowy
- sv: namnlist
- ja: タイトルバー

## Sidebar

- de: Seitenleiste (Apple)
- fr: barre latérale (Apple)
- it: barra laterale (Apple)
- es: barra lateral (Apple)
- es-419: barra lateral (Apple)
- pt-BR: barra lateral (Apple)
- nl: navigatiekolom (Apple)
- pl: pasek boczny (Apple)
- sv: sidofält (Apple)
- ja: サイドバー (Apple)

## Menu bar icon, System tray icon

The icon in the macOS menu bar, or in the Windows and Linux system tray. The system tray strings carry a `Windows` or `Linux` `msgctxt`; the second word below is Microsoft's, for `Windows`, and `Linux` takes the style sheet's word where it gives one, else this one.

- de: Menüleiste; Infobereich; Linux _Statusbereich_
- fr: barre des menus; zone de notification
- it: barra dei menu; area di notifica
- es: barra de menús; bandeja del sistema
- es-419: barra de menús; bandeja del sistema
- pt-BR: barra de menus; bandeja do sistema
- nl: menubalk; systeemvak
- pl: pasek menu; zasobnik systemowy
- sv: menyrad; meddelandefält
- ja: メニューバー; 通知領域; Linux システムトレイ

## Window

- de: Fenster (Apple)
- fr: fenêtre (Apple)
- it: finestra (Apple)
- es: ventana (Apple)
- es-419: ventana (Apple)
- pt-BR: janela (Apple)
- nl: venster (Apple)
- pl: okno (Apple)
- sv: fönster (Apple)
- ja: ウィンドウ in Meru's own copy, never ウインドウ; a `macOS` label such as the Window menu takes Apple's ウインドウ

## Verification code

A one-time passcode Meru copies to the clipboard.

- de: Bestätigungscode
- fr: code de vérification
- it: codice di verifica
- es: código de verificación
- es-419: código de verificación
- pt-BR: código de verificação
- nl: verificatiecode
- pl: kod weryfikacyjny
- sv: verifieringskod
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
- fr: extension (Apple)
- it: estensione (Apple)
- es: extensión (Apple)
- es-419: extensión (Apple)
- pt-BR: extensão (Apple)
- nl: extensie (Apple)
- pl: rozszerzenie (Apple)
- sv: tillägg (Apple)
- ja: 拡張機能 (Chrome), never 機能拡張, Apple's word

## Experimental, Beta

The two maturity badges, and _Beta_ is also the update channel beside _Stable_. Never a third word.

- de: Experimentell; Beta; Stabil
- fr: Expérimental; Bêta; Stable
- it: Sperimentale; Beta; Stabile
- es: Experimental; Beta; Estable
- es-419: Experimental; Beta; Estable
- pt-BR: Experimental; Beta; Estável
- nl: Experimenteel; Bèta; Stabiel
- pl: Eksperymentalne; Beta; Stabilna
- sv: Experimentell; Beta; Stabil
- ja: 実験的; ベータ; 安定版

## Load on Launch

The pinned tab's context-menu item deciding whether it comes back as a view at start.

- de: Beim Start laden
- fr: Charger au démarrage
- it: Carica all’avvio
- es: Cargar al iniciar
- es-419: Cargar al iniciar
- pt-BR: Carregar ao Iniciar
- nl: Laad bij starten
- pl: Wczytuj przy uruchomieniu
- sv: Läs in vid start
- ja: 起動時に読み込む

## Upgrade

Reaching Pro, in buttons and prose alike. Never a word for _purchase_ or _buy_.

- de: Upgrade; _Auf Meru Pro upgraden_. In a sentence, the noun: _ein Upgrade auf Meru Pro_, as in _Mit einem Upgrade auf Meru Pro kannst du weitere Konten hinzufügen._ (Tim's call)
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
- fr: clé de licence; période d’essai; appareil
- it: chiave di licenza; periodo di prova; dispositivo
- es: clave de licencia; periodo de prueba; dispositivo
- es-419: clave de licencia; período de prueba; dispositivo
- pt-BR: chave de licença; período de avaliação; dispositivo
- nl: licentiesleutel; proefperiode; apparaat
- pl: klucz licencyjny; okres próbny; urządzenie
- sv: licensnyckel; provperiod; enhet
- ja: ライセンスキー; 試用期間; デバイス

## Download history

- de: Downloadverlauf for the page, in _Download history_, _Full download history_ and _Close download history_ (Apple's _Download_); the recent download history popup is _Letzte Downloads_ (_Letzte Downloads anzeigen_), never _Aktueller Downloadverlauf_
- fr: historique des téléchargements (Apple's _Télécharger_)
- it: cronologia dei download (Apple's _download_)
- es: historial de descargas (Apple's _Descargar_)
- es-419: historial de descargas (Apple's _Descargar_)
- pt-BR: histórico de downloads (Apple's _Pasta de downloads_)
- nl: downloadgeschiedenis (Apple's _Download_)
- pl: historia pobierania (Apple's _Pobierz_)
- sv: hämtningshistorik (Apple's _Hämta_)
- ja: ダウンロード履歴 (Apple's ダウンロード)

## Dark theme, Blocker, Spellchecker

- de: dunkles Design; Blocker; Rechtschreibprüfung
- fr: thème sombre; bloqueur; correcteur orthographique (Apple)
- it: tema scuro; blocco contenuti; controllo ortografico
- es: tema oscuro; bloqueador; corrector ortográfico
- es-419: tema oscuro; bloqueador; corrector ortográfico
- pt-BR: tema escuro; bloqueador; verificação ortográfica
- nl: donker thema; blokkering; spellingcontrole
- pl: ciemny motyw; blokowanie; sprawdzanie pisowni (Apple)
- sv: mörkt tema; blockerare; stavningskontroll
- ja: ダークテーマ; ブロッカー; スペルチェック

## Keyboard keys

A key named in a sentence, such as the Workspace apps Mode setting's _hold Cmd_ or _Ctrl_ and _Shift_. The source writes the short form printed on keys, so keep a short form where the language has one: Cmd and Option on macOS, Ctrl, Shift and Alt on Windows and Linux. Cmd and Ctrl are separate messages already, and Shift carries a platform `msgctxt`: `macOS` takes Apple's name, `Windows` Microsoft's and `Linux` GNOME's, from the style sheet's Platform words where it has them. Sources: **Apple** is "Mac keyboard shortcuts" (support.apple.com/<locale>/102650), which names each key with its short form in brackets; **Microsoft** is "Keyboard shortcuts in Windows" (support.microsoft.com/<locale>/windows/keyboard-shortcuts-in-windows-dcc61a57-8ff0-cffe-9796-cb9706c75eec). Each line gives Apple's Command, Shift, Option and Control, then Microsoft's Ctrl, Shift and Alt.

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

A brief message Meru shows over its window or over Gmail, such as the one after a setting changes, and the region the toasts appear in, which the interface reads as _Notifications_ with `msgctxt` `toasts`. Never the word for a system [notification](#notification).

- de: Hinweis, plural Hinweise (_Hinweis schließen_) (agent-chosen)
- ja: お知らせ (お知らせを閉じる), never 通知 (agent-chosen)

## Unread badge

The count on an account, a tab or the dock icon for its unread emails: _Show unread badge_, _Unread badge_.

- de: Kennzeichen; in full _Kennzeichen für ungelesene E-Mails_ (_Kennzeichen für ungelesene E-Mails anzeigen_), never the coined _Ungelesen-Kennzeichen_ (agent-chosen)
- ja: 未読バッジ (未読バッジを表示) (agent-chosen)

The badge on an account's row in Settings, `msgctxt` `account row badge`, sits on a row that cannot wrap, so it takes the shortest form:

- de: Ungelesen
- ja: 未読

## Tab strip

The tabs within an account, which Workspace apps' New windows mode leaves out: _Narrow the tab strip_.

- de: Tableiste (_Tableiste verschmälern_) (agent-chosen)
- ja: タブバー (タブバーを狭くする) (Chrome), never タブストリップ

## Label, Meru's

The name Meru shows for an account or a saved search, in its _Label_ field and _Enter a label_ with `msgctxt` `saved search`. Never Gmail's label, which is under [Starred, Snooze, Label](#starred-snooze-label) and carries `msgctxt` `Gmail label`.

- de: Name (_Namen eingeben_) (agent-chosen)
- ja: 名前 (名前を入力) (agent-chosen)

## Device label

The name this computer goes by among the devices using a license key.

- de: Gerätename (_Gerätenamen eingeben_) (agent-chosen)
- ja: デバイス名 (デバイス名を入力) (agent-chosen)

## Release channel

Which releases Meru updates to, Stable or [Beta](#experimental-beta): _Release channel_, _Switch to the beta channel?_

- de: Update-Kanal; _Beta-Kanal_ (_Zum Beta-Kanal wechseln?_) (agent-chosen)
- ja: リリースチャンネル; ベータチャンネル (ベータチャンネルに切り替えますか?) (agent-chosen)

## Trusted hosts

The hosts whose links open without the link prompt: _Trusted hosts_, _links from untrusted hosts_.

- de: vertrauenswürdige Hosts; _nicht vertrauenswürdige Hosts_ (agent-chosen)
- ja: 信頼するホスト; 信頼されていないホスト (agent-chosen)

## Phishing protection

- de: Phishing-Schutz (agent-chosen)
- ja: フィッシング対策 (agent-chosen)

## Notify

The verb beside [Notification](#notification): _Notify when updates are available_, _Notify for_.

- de: benachrichtigen (_Bei verfügbaren Updates benachrichtigen_) (agent-chosen)
- ja: 通知する (アップデートが利用可能になったら通知) (agent-chosen)

## Move

Moving a tab, an email, an attachment or a file: _Move to New Window_, _Move attachments to top_, _File moved or deleted_.

- de: verschieben (_In neues Fenster verschieben_, _Datei verschoben oder gelöscht_); _bewegen_ is only for dragging or the pointer (agent-chosen)
- ja: 移動 (新しいウィンドウに移動) (agent-chosen)

## Sound names

The notification sounds Breeze, Chime, Duet, Knock and Linen, picked in Settings. They are names, each translated by what one hears, and kept in English where the language's word names something else.

- de: Brise, Klangspiel, Duett, Klopfen (agent-chosen); Leinen (Tim's call)
- ja: ブリーズ, チャイム, デュエット, ノック, リネン (agent-chosen)

## Button

A button drawn on screen, such as the bookmarks button, the width button or Gmail's Upgrade button, never a key on the keyboard, which is under [Keyboard keys](#keyboard-keys).

- de: Schaltfläche (_Lesezeichen-Schaltfläche_). Never a standalone _Taste_, which reads as a keyboard key; a key name such as _Umschalttaste_ keeps it.
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
- nl: Ongedaan maken (undo send; Apple's is _Herstel_)
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
- sv: Meddelandet har skickats (undo send; Apple's word for a message is _mejl_)
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
- es-419: Marcar como leído; Marcar como spam; Eliminar
- pt-BR: Marcar como lida; Denunciar como spam; Excluir
- nl: Markeren als gelezen; Melden als spam; Verwijderen
- pl: Oznacz jako przeczytane; Zgłoś jako spam; Usuń
- sv: Markera som läst; Rapportera som skräppost; Ta bort
- ja: 既読にする; 迷惑メールとして報告; 削除

### Starred, Snooze, Label

From shortcuts: the folder of starred conversations, the action and the folder of snoozed ones, and a label.

- de: Markiert; Zurückstellen, zurückgestellt; Label
- fr: suivi (_conversations dont le suivi est activé_); Mettre en attente, En attente; libellé
- it: Speciali; Posticipa, posticipate; etichetta
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
- pl: nowe okno; _Odpowiedz w nowym oknie_
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
- ja: 不在通知; マルチ受信トレイ (agent-chosen)

## 1Password's words

The steps for connecting the 1Password desktop app quote its own interface: Settings, Browser and Add Browser. Like Gmail's words, they take the word 1Password shows in that language, read from the app or its support pages, never Apple's word or a fresh translation. Say in your summary which wording you used, so it can be added here.

## Common actions

The labels for everyday actions such as Cancel, Close, Delete, Save, Quit and Copy Link are in each style sheet, under Common labels or Apple's words, as its house words. Use them for the same actions and as the model for others, except where the string names a Gmail action or folder, where Gmail's word above wins, as for the Undo button in the message-sent toast, and where the entry has a platform `msgctxt`, where the platform's word wins.
