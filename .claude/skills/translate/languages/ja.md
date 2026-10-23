# Japanese (`ja`)

Japanese follows Apple's conventions in macOS Mail and AppKit for address, label form, punctuation and the ellipsis. Its words follow two rules:

- **An OS label takes its platform's word.** An entry whose `msgctxt` is `macOS`, `Windows` or `Linux` is a label the operating system names its own way, such as the File menu or Paste. A label only macOS shows, such as the Window menu or Hide Others, is an OS label too and carries `macOS` alone. `macOS` takes Apple's word (Apple Mail's for a mail menu item), `Windows` Microsoft's and `Linux` GNOME's, from [Platform words](#platform-words) below. Only the word changes: address, punctuation and the ellipsis stay this sheet's on every platform, and so does the katakana spelling of a house word, though a `macOS` label spells a word as Apple does: ウインドウ.
- **Everything else takes the house word**, from this sheet and the glossary: Meru's own copy reads the same on every platform. A term Gmail also shows takes Gmail's word from the glossary.

Where this sheet and a habit from other software disagree, this sheet wins.

## Address

No pronoun for the user: never あなた. Statements end in です or ます, requests in ください, questions in ますか: _このメッセージを削除してもよろしいですか?_. Never a plain だ or である sentence, and never a plain-form verb ending a sentence (_削除する。_).

## Buttons and menu items

A noun or a short verb phrase, as Apple writes them: 返信, 削除, 保存, キャンセル, 開封済みにする, タブを閉じる. No です/ます and no closing 。 in a label.

## Capitalization

None. Latin words inside Japanese keep their own capitals (Gmail, Meru Pro).

## Settings

設定. The app-menu item with `msgctxt` `macOS` is 設定…, as AppKit writes it; with `Windows` or `Linux` it is 設定, since the English has no ellipsis.

## Access keys

An `&` in the English marks the access key on Windows and Linux. Japanese words have no Latin letter to mark, so a label shown there ends in `(&X)`, with the English's letter upper-case, after the word and before a trailing ellipsis: `Cu&t` 切り取り(&T), `Sa&ve Image As…` 名前を付けて画像を保存(&V)…. No space before the parenthesis.

- A label with `msgctxt` `macOS` carries no access key: drop the `&`.
- A label with `&` and no platform context shows on every platform, so it takes `(&X)` too; macOS hides it, since Chromium strips a `(&X)` from every menu label there (`l10n_util::FixUpWindowsStyleLabel`).

## Plural categories

`other` only. Every plural carries `other` and nothing else, `=0` and other exact matches aside, with a counter after the number: `{count, plural, other {#個のタブ}}`, or `{count, plural, other {タブ#個}}`. A `one` category is never selected in Japanese, and `bun run i18n:check` reports it as unused.

## Terms that stay English

Gmail, Google Workspace, Meru, Meru Pro and Pro, in Latin letters, never katakana.

## Traps

- **Punctuation follows Apple.** The comma is the full-width 、 (U+3001) and the full stop the full-width 。 (U+3002), never a half-width `,` or `.` in Japanese text. A question or exclamation mark is the half-width `?` or `!`, never ？ or ！. Quotation marks are “” (U+201C, U+201D), never 「」 or straight `"…"`. The ellipsis on a label is … as in 設定…
- **No spaces around Latin text or numbers.** _Meru Proにアップグレード_, _3個のタブ_, _Gmailの設定_; never _Meru Pro にアップグレード_.
- **No plain-form sentences.** です/ます throughout, as above.
- **House katakana.** A word ending in a long vowel keeps its ー: ブラウザー, フォルダー, ユーザー, never ブラウザ, フォルダ, ユーザ. A window in Meru's own copy is ウィンドウ, never ウインドウ; a `macOS` label takes Apple's ウインドウ, as in ウインドウを閉じる. An extension is 機能拡張, never 拡張機能.
- **Placeholders.** Particles follow the placeholder (_{name}のアカウント_), and Japanese word order often moves it; keep every placeholder exactly as written.

## Error messages

Say what happened, without すみません or 申し訳ありません: アカウントを追加できませんでした。, as Apple writes メールボックス“%1$@”は名称変更できませんでした。

## Common labels

House words for everyday actions, most of them Apple's from Mail's `MainMenu`, `Alerts` and `Localizable` tables and AppKit's `MenuCommands`. A string that names something Gmail also shows, such as the Undo button in the message-sent toast, takes Gmail's word from the glossary instead, and an entry with a platform `msgctxt` takes [its platform's word](#platform-words):

- Cancel キャンセル, OK OK, Close 閉じる, Delete 削除, Remove 削除, Add 追加, Save 保存, Edit 編集, Open 開く, Show 表示, Hide 非表示, Quit 終了, Reload 再読み込み, Try Again やり直す, Learn More… 詳しい情報…
- Close Tab タブを閉じる, Close Other Tabs その他のタブを閉じる, Pin Tab タブを固定, Show Sidebar サイドバーを表示, Copy Link リンクをコピー, Mark as Read 開封済みにする, Add Account… アカウントを追加…
- このメッセージを削除してもよろしいですか? (Are you sure you want to delete this message?)
- ダウンロードが完了するまで添付ファイルをドラッグすることはできません。この添付ファイルをダウンロードしますか?

## Platform words

The word each platform uses for every label with a platform `msgctxt`. A label keeps its English placeholders, and its access key as the rules above say; the table gives the words, without access keys.

Sources: **AppKit** and **Mail** are the `.loctable` files in `/System/Library/Frameworks/AppKit.framework/Versions/C/Resources` and `/System/Applications/Mail.app/Contents/Resources` on macOS 27, named by table and key; **Software Update** is `/System/Library/ExtensionKit/Extensions/SoftwareUpdateSettingsExtension.appex/Contents/Resources/Localizable.loctable`; **TBX** is the Microsoft Terminology Collection, `JAPANESE.tbx`, by `termEntry` id; **gtk4**, **nautilus** and **gedit** are GNOME's `ja.po` for each, by `msgid` (and `msgctxt` where it has one). _Inferred_ marks a word no source gives for that label, built from the source words named.

| English                                              | macOS (Apple)                                                                                                                          | Windows (Microsoft)                                                                                           | Linux (GNOME)                                                                                                    |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| File                                                 | ファイル (AppKit `MenuCommands` `File`)                                                                                                | ファイル (TBX 7285_185699_185706)                                                                             | ファイル (gtk4 `File`)                                                                                           |
| View                                                 | 表示 (AppKit `MenuCommands` `View`)                                                                                                    | 表示 (TBX 9201_185833_185840)                                                                                 | 表示 (nautilus `shortcuts dialog` `View`)                                                                        |
| Undo                                                 | 取り消す (Mail `MainMenu` `281.title`)                                                                                                 | 元に戻す (TBX 5274_168784_168791)                                                                             | 元に戻す (gtk4 `_Undo`)                                                                                          |
| Redo                                                 | やり直す (Mail `MainMenu` `282.title`)                                                                                                 | やり直し (TBX 10268_169412_169417)                                                                            | やり直す (gtk4 `_Redo`)                                                                                          |
| Cut, `Cu&t`                                          | カット (AppKit `MenuCommands` `Cut`)                                                                                                   | 切り取り (TBX 1735_41913_41920)                                                                               | 切り取り (gtk4 `Cu_t`)                                                                                           |
| Paste, `&Paste`                                      | ペースト (AppKit `MenuCommands` `Paste`)                                                                                               | 貼り付け (TBX 11068_91030_91036)                                                                              | 貼り付け (gtk4 `_Paste`)                                                                                         |
| Paste and Match Style, `&Paste And Match Style`      | ペーストしてスタイルを合わせる (AppKit `MenuCommands` `Paste and Match Style`)                                                         | 貼り付けて書式を合わせる, inferred from TBX 11068_91030_91036                                                 | 貼り付けてスタイルを合わせる, inferred from gtk4 `_Paste`                                                        |
| Select All, `Select &All`                            | すべてを選択 (AppKit `MenuCommands` `Select All`)                                                                                      | すべて選択 (TBX 10476_185277_185284)                                                                          | すべて選択 (gtk4 `Select _All`)                                                                                  |
| About {appName}                                      | {appName}について (Mail `MainMenu` `628.title`, メールについて)                                                                        | {appName}のバージョン情報, inferred from TBX 6036_211259_486275 バージョン情報, the About menu item           | {appName}について (gtk4 `About %s`, written there with a space this sheet drops)                                 |
| Check for Updates…                                   | アップデートを確認… (Software Update `Check for Updates`)                                                                              | 更新プログラムの確認…, inferred from TBX 14473_3621_3629 更新プログラム and 4233_30878_2717480 確認する       | 更新を確認…, inferred from gtk4 `Show Graphic Updates`, グラフィックの更新を表示する                             |
| Settings, the app-menu item                          | 設定… (AppKit `MenuCommands` `Settings\U2026`)                                                                                         | 設定 (TBX 21910_780478_1049442)                                                                               | 設定 (gtk4 `Settings`)                                                                                           |
| Compose, the File menu item                          | 新規メッセージ (Mail `MainMenu` `374.title`, New Message)                                                                              | 新しいメール, inferred: TBX 34677_1998714_2002236 gives 新着メール, which is mail received                    | 新しいメール, inferred from nautilus `New _Window`, 新しいウィンドウ                                             |
| Save As, in `Sa&ve Image As…` and the Save As dialog | 別名で保存… (AppKit `Document` `Save As\U2026`); 画像を別名で保存…, inferred with Mail `Localizable` `CopyImageMenuItem`, 画像をコピー | 名前を付けて保存 (TBX 12985_534974_536198); 名前を付けて画像を保存…, inferred with TBX 1294_64520_373217 画像 | 名前を付けて保存… (gedit `Save _As…`); 名前を付けて画像を保存…, inferred                                         |
| Export, the save dialog's button                     | 書き出す (AppKit `Document` `Export`)                                                                                                  | エクスポート (TBX 7948_52504_52511)                                                                           | エクスポート, inferred: no GNOME source has it                                                                   |
| Shift, the key                                       | shift, lower case (AppKit `FunctionKeyNames` `Shift`)                                                                                  | Shift (TBX 3412_112291_112299, Shift キー, with キー only in running prose)                                   | Shift (gtk4 `keyboard label` `Shift`)                                                                            |
| Show Meru, the tray item                             | Meruを表示 (AppKit `Common` `Show`, 表示)                                                                                              | Meruを表示 (TBX 19508_660023_2731321 表示する)                                                                | Meruを表示 (gtk4 `Show`, 表示)                                                                                   |
| Hide Meru, the tray item                             | Meruを非表示 (Mail `MainMenu` `632.title`, メールを非表示)                                                                             | Meruを非表示 (TBX 20202_719546_778268 非表示にする)                                                           | Meruを隠す (gtk4 `Hide %s`, from GTK's macOS app menu)                                                           |
| System tray, in the Appearance settings              | macOS shows the menu bar instead: メニューバー                                                                                         | 通知領域 (TBX 10299_85657_85667, notification area)                                                           | システムトレイ, inferred: GNOME has no tray; TBX 55084_3122863_3122924 gives システム トレイ for the system tray |
| Hide {appName}                                       | {appName}を非表示 (Mail `MainMenu` `632.title`, メールを非表示)                                                                        | macOS only                                                                                                    | macOS only                                                                                                       |
| Hide Others                                          | ほかを非表示 (Mail `MainMenu` `622.title`)                                                                                             | macOS only                                                                                                    | macOS only                                                                                                       |
| Show All                                             | すべてを表示 (Mail `MainMenu` `625.title`)                                                                                             | macOS only                                                                                                    | macOS only                                                                                                       |
| Close Window                                         | ウインドウを閉じる (AppKit `MenuCommands` `Close Window`)                                                                              | macOS only                                                                                                    | macOS only                                                                                                       |
| Window, the menu                                     | ウインドウ (AppKit `MenuCommands` `Window`)                                                                                            | macOS only                                                                                                    | macOS only                                                                                                       |
| Minimize                                             | しまう (AppKit `MenuCommands` `Minimize`; Mail `MainMenu` `4.title`)                                                                   | macOS only                                                                                                    | macOS only                                                                                                       |
| Zoom, the window                                     | 拡大/縮小 (Mail `MainMenu` `295.title`)                                                                                                | macOS only                                                                                                    | macOS only                                                                                                       |
| Bring All to Front                                   | すべてを手前に移動 (AppKit `MenuCommands` `Bring All to Front`)                                                                        | macOS only                                                                                                    | macOS only                                                                                                       |
| Speech                                               | スピーチ (Mail `MainMenu` `1535.title`)                                                                                                | macOS only                                                                                                    | macOS only                                                                                                       |
| Start Speaking                                       | 読み上げを開始 (Mail `MainMenu` `1536.title`)                                                                                          | macOS only                                                                                                    | macOS only                                                                                                       |
| Stop Speaking                                        | 読み上げを停止 (Mail `MainMenu` `1537.title`)                                                                                          | macOS only                                                                                                    | macOS only                                                                                                       |
| Look Up “{selection}”                                | “{selection}”を調べる (AppKit `MenuCommands` `Look Up \U201C%@\U201D`)                                                                 | macOS only                                                                                                    | macOS only                                                                                                       |
| Show in Finder                                       | Finderに表示 (Mail `Preferences` `ShowExtensionApplicationInFinder`)                                                                   | macOS only                                                                                                    | macOS only                                                                                                       |
