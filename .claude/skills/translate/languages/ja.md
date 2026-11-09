# Japanese (`ja`)

Japanese follows Apple's conventions in macOS Mail and AppKit for address, label form, punctuation and the ellipsis. Its words follow two rules:

- **An OS label takes its platform's word.** An entry whose `msgctxt` is `macOS`, `Windows` or `Linux` is a label the operating system names its own way, such as the File menu or Paste. A label only macOS shows, such as the Window menu or Hide Others, is an OS label too and carries `macOS` alone. `macOS` takes Apple's word (Apple Mail's for a mail menu item), `Windows` Microsoft's and `Linux` GNOME's, from [Platform words](#platform-words) below. Only the word changes: address, punctuation and the ellipsis stay this sheet's on every platform, and so does the katakana spelling of a house word, though a `macOS` label spells a word as Apple does: ウインドウ.
- **Everything else takes the house word**, from this sheet and the glossary, by the [source order](../source-order.md): Gmail's word for a term Gmail also shows, Google's for Google's names, and in Meru's own copy Chrome's word where Chrome has the term, else the apps' word the glossary counts and marks agent-chosen, with its tally. Apple is never the authority for a house word; its macOS apps are one vote of seven when the glossary counts the apps' word. Meru's own copy reads the same on every platform, and each rule in `ja.json` gives its word's source.

Where this sheet and a habit from other software disagree, this sheet wins.

## Address

No pronoun for the user: never あなた. Statements end in です or ます, requests in ください, questions in ますか: _このメッセージを削除してもよろしいですか?_. Never a plain だ or である sentence, and never a plain-form verb ending a sentence (_削除する。_).

## Buttons and menu items

A noun or a short verb phrase, as Apple writes them: 返信, 削除, 保存, キャンセル, 開封済みにする, タブを閉じる. No です/ます and no closing 。 in a label.

## Label forms

The form and case each kind of label takes, decided before the language's first run. Every label of a kind takes its form, whatever its English does; the examples are the catalog's own.

- **Button:** A noun or a short verb phrase, with no です/ます and no closing 。: キャンセル, 保存, タブを閉じる.
- **Menu bar item:** A noun or a short verb phrase, as a button: 再読み込み, 次のタブを選択, アカウントを管理.
- **Context or popup menu item:** A noun or a short verb phrase, as a button: URLをコピー, 他のタブをすべて閉じる, 既定のブラウザで開く.
- **Select option:** A noun, an adverb or a plain-form verb: 表示, 非表示, 常に, しない, 狭い.
- **Checkbox or switch label:** A noun phrase or a plain-form verb phrase, with no です/ます: ウィンドウを表示, 完了したらフォルダを開く, 広告をブロック.
- **Setting description:** The polite form, ending in 。: ダウンロードが完了したら、ファイルを含むフォルダを開きます。 One that says what the setting holds ends in です, and an instruction takes ～してください.
- **OS label:** Its platform's word from [Platform words](#platform-words), as its source writes it: ペースト on macOS, 貼り付け on Windows and Linux.

## Capitalization

None. Latin words inside Japanese keep their own capitals (Gmail, Meru Pro).

## Settings

設定. The app-menu item with `msgctxt` `macOS` is 設定…, as AppKit writes it; with `Windows` or `Linux` it is 設定, since the English has no ellipsis.

## Access keys

An `&` in the English marks the access key on Windows and Linux. The key is the English letter where the word has it, else the first free letter, one no other label in the same menu uses; Japanese words have no Latin letter to mark, so the English letter always applies, written as a suffix: a label shown there ends in `(&X)`, the letter upper-case, after the word and before a trailing ellipsis: `Cu&t` 切り取り(&T), `Sa&ve Image As…` 名前を付けて画像を保存(&V)…. No space before the parenthesis. `packages/app/access-keys.test.ts` holds every catalog to this: it builds each menu and context menu Windows and Linux show, and fails when two items in one menu share a letter.

- A label with `msgctxt` `macOS` carries no access key: drop the `&`.
- A label with `&` and no platform context shows on every platform, so it takes `(&X)` too; macOS hides it, since Chromium strips a `(&X)` from every menu label there (`l10n_util::FixUpWindowsStyleLabel`).

## Plural categories

`other` only. Every plural carries `other` and nothing else, `=0` and other exact matches aside, with a counter after the number: `{count, plural, other {#個のタブ}}`, or `{count, plural, other {タブ#個}}`. A `one` category is never selected in Japanese, and `bun run i18n:check` reports it as unused.

## Terms that stay English

Gmail, Google Workspace, Meru, Meru Pro, Meru Portal and Pro, in Latin letters, never katakana.

## Traps

- **Punctuation follows Apple.** The comma is the full-width 、 (U+3001) and the full stop the full-width 。 (U+3002), never a half-width `,` or `.` in Japanese text. A question or exclamation mark is the half-width `?` or `!`, never ？ or ！. Quotation marks are “” (U+201C, U+201D), never 「」 or straight `"…"`. The ellipsis on a label is … as in 設定… An em dash takes a space on each side, as Apple writes it: _%@ — インスペクタ_ (30 of the 31 distinct strings in this Mac's Japanese `.loctable`s with an em dash between text). A range between two values, such as the _to_ between two time fields, is the wave dash 〜 (U+301C) with no spaces, as Apple writes it: _%d〜%d_, _0〜65535_ (107 of the 119 distinct strings in this Mac's Japanese `.loctable`s with a range mark between two values; the other 12 take the full-width tilde ～). Chrome writes ～ (U+FF5E) in all 15 of its range messages, such as _1024～65535_, but a mark is punctuation, which follows Apple; never ～.
- **No spaces around Latin text or numbers.** _Meru Proにアップグレード_, _3個のタブ_, _Gmailの設定_; never _Meru Pro にアップグレード_. A number joins its unit the same way, _5分_: Chrome writes a space there (174 messages with a unit), but spacing is grammar, which follows Apple.
- **No plain-form sentences.** です/ます throughout, as above.
- **House katakana.** Whether a loanword ends in ー follows Chrome, word by word, on every platform: ブラウザ, フォルダ, コンピュータ and エディタ without it, ユーザー, サーバー and マネージャー with it. Apple spells the first four the same way, so a `macOS` label needs no exception. The `long-vowel` rules in `ja.json` are the table: one per word, each banning the other spelling and giving Chrome's count as its source. A word the table lacks takes the form Chrome uses most; name it in your reply so it can be added. A Gmail term such as フィルタ keeps Gmail's spelling. A window in Meru's own copy is ウィンドウ, never ウインドウ; a `macOS` label takes Apple's ウインドウ, as in ウインドウを閉じる. An extension is 拡張機能, as Chrome writes it, never 機能拡張. The tab strip is タブバー, as Chrome writes it. A user interface is インターフェイス, never インターフェース (agent-chosen: インターフェイス: 5 of 7 (Apple, Firefox, LibreOffice, Microsoft, VS Code), since Chrome has the word only for a network interface). A page's zoom is ズーム and its zoom level ズームレベル, never 拡大率, as Chrome writes them; Zoom In and Zoom Out keep Chrome's 拡大 and 縮小. The system's default browser or mail client is 既定の… (Chrome 10/11), and every other default デフォルト (Chrome 96/108). A user agent is ユーザーエージェント, Chrome's word without its space. A website is ウェブサイト, never Webサイト, and Hard Reload ハード再読み込み, as Chrome writes them.
- **Placeholders.** Particles follow the placeholder (_{name}のアカウント_), and Japanese word order often moves it; keep every placeholder exactly as written.
- **macOS's own elements.** The menu bar, the Dock, Finder and System Settings take Apple's names in Meru's own copy too, since they name Apple's interface and show only on macOS: _メニューバー_ (ControlCenterSettings.appex `Localizable` `Show in Menu Bar`), _Dock_ (DesktopSettings.appex `Localizable` `Dock`), _Finder_ and _システム設定_ (System Settings `InfoPlist` `CFBundleDisplayName`).

## Error messages

Say what happened, without すみません or 申し訳ありません: アカウントを追加できませんでした。, as Apple writes メールボックス“%1$@”は名称変更できませんでした。

## Common labels

House words for everyday actions, as Chrome writes its labels, in this sheet's label form. A string that names something Gmail also shows, such as the Undo button in the message-sent toast, takes Gmail's word from the glossary instead, and an entry with a platform `msgctxt` takes [its platform's word](#platform-words). Delete and Remove are one word, _削除_, as Chrome writes both. The labels:

- Cancel キャンセル, OK OK, Close 閉じる, Delete 削除, Remove 削除, Add 追加, Save 保存, Edit 編集, Open 開く, Show 表示, Hide 非表示, Quit 終了, Reload 再読み込み, Try Again もう一度試す, Learn More… 詳細…
- Close Tab タブを閉じる, Close Other Tabs 他のタブをすべて閉じる, Pin Tab タブを固定, Show Sidebar サイドバーを表示, Copy Link リンクをコピー, Mark as Read 既読にする, Gmail's, Add Account… アカウントを追加…, Export エクスポート (Chrome 17/17; a `macOS` label keeps Apple's 書き出す), Inspect Element 検証 (Chrome 2/2)
- このメッセージを削除してもよろしいですか? (Are you sure you want to delete this message?)
- ダウンロードが完了するまで添付ファイルをドラッグすることはできません。この添付ファイルをダウンロードしますか?

## Platform words

The platform words table is in [ja.platform.md](ja.platform.md); read it when an entry has a `macOS`, `Windows` or `Linux` msgctxt.
