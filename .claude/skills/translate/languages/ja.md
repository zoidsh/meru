# Japanese (`ja`)

Japanese follows what Apple ships in macOS Mail and AppKit. Where this sheet and a habit from other software disagree, this sheet wins.

## Address

No pronoun for the user: never あなた. Statements end in です or ます, requests in ください, questions in ますか: _このメッセージを削除してもよろしいですか？_. Never a plain だ or である sentence, and never a plain-form verb ending a sentence (_削除する。_).

## Buttons and menu items

A noun or a short verb phrase, as Apple writes them: 返信, 削除, 保存, キャンセル, 開封済みにする, タブを閉じる. No です/ます and no closing 。 in a label.

## Capitalization

None. Latin words inside Japanese keep their own capitals (Gmail, Meru Pro).

## Settings

設定; the app-menu item is 設定…

## Plural categories

`other` only. Every plural carries `other` and nothing else, `=0` and other exact matches aside, with a counter after the number: `{count, plural, other {#個のタブ}}`, or `{count, plural, other {タブ#個}}`. A `one` category is never selected in Japanese, and `bun run i18n:check` reports it as unused.

## Terms that stay English

Gmail, Google Workspace, Meru, Meru Pro and Pro, in Latin letters, never katakana.

## Traps

- **Full-width punctuation.** The comma is 、 (U+3001), the full stop 。 (U+3002), quotation marks 「」, and a question or exclamation mark in a sentence is ？ or ！. Never a half-width `,` `.` `?` `!` or `"…"` in Japanese text. The ellipsis on a label is … as in 設定…
- **No spaces around Latin text or numbers.** _Meru Proにアップグレード_, _3個のタブ_, _Gmailの設定_; never _Meru Pro にアップグレード_.
- **No plain-form sentences.** です/ます throughout, as above.
- **Katakana follows Apple.** ウインドウ, never ウィンドウ; 機能拡張, never 拡張機能.
- **Placeholders.** Particles follow the placeholder (_{name}のアカウント_), and Japanese word order often moves it; keep every placeholder exactly as written.

## Error messages

Say what happened, without すみません or 申し訳ありません: アカウントを追加できませんでした。, as Apple writes メールボックス“%1$@”は名称変更できませんでした。

## Apple's words

From Mail's `MainMenu`, `Alerts` and `Localizable` tables and AppKit's `MenuCommands`:

- Cancel キャンセル, OK OK, Undo 取り消す, Close 閉じる, Delete 削除, Remove 削除, Add 追加, Save 保存, Edit 編集, Open 開く, Show 表示, Hide 非表示, Quit 終了, Reload 再読み込み, Try Again やり直す, Learn More… 詳しい情報…
- Close Tab タブを閉じる, Close Other Tabs その他のタブを閉じる, Close Window ウインドウを閉じる, Pin Tab タブを固定, Show Sidebar サイドバーを表示, Minimize しまう, Copy Link リンクをコピー, Mark as Read 開封済みにする, Add Account… アカウントを追加…, Quit Mail メールを終了
- このメッセージを削除してもよろしいですか？ (Are you sure you want to delete this message?)
- ダウンロードが完了するまで添付ファイルをドラッグすることはできません。この添付ファイルをダウンロードしますか？

Apple itself ends those two questions with a half-width ? and quotes with “”. Meru's catalog uses the full-width forms above throughout instead, as its conventions decide.
