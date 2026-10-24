# Portuguese, Brazil (`pt-BR`)

Brazilian Portuguese follows what Apple ships in macOS Mail and AppKit for `pt_BR`. It is the only Portuguese catalog, so it reads as Brazilian, never European. Where this sheet and a habit from other software disagree, this sheet wins.

An entry whose `msgctxt` is `macOS`, `Windows` or `Linux` is an OS label, a label each operating system names its own way, such as the File menu or Paste. `macOS` takes Apple's word (Apple Mail's for a mail menu item), `Windows` Microsoft's and `Linux` GNOME's. Only the word changes: this sheet's address, capitalization and punctuation hold on every platform.

## Address

_você_, with _seu_ and _sua_: _Tem certeza de que deseja …?_, _sua conta_. Never _tu_ or its verb forms (_queres_, _tens_).

## Buttons and menu items

The infinitive: _Responder_, _Apagar_, _Salvar_, _Cancelar_, _Fechar Aba_. Delete is _Apagar_, not _Excluir_.

## Capitalization

Title case for menu items and buttons, as Apple writes them: every word except articles, prepositions and conjunctions takes a capital (_Nova Mensagem_, _Marcar como Lida_, _Fechar as Outras Abas_). Sentences, descriptions and dialog text are sentence style.

## Settings

_Ajustes_. The app-menu item with `msgctxt` `macOS` is _Ajustes…_, as AppKit writes it; with `Windows` or `Linux` it takes Microsoft's or GNOME's word, without the ellipsis the English lacks.

## Plural categories

`one`, `many` and `other`. `one` covers 0 and 1 in Brazilian Portuguese, `many` is for large round numbers (1.000.000), so its text is usually the same as `other`'s: `{count, plural, one {# aba} many {# abas} other {# abas}}`.

## Terms that stay English

Gmail, Google Workspace, Meru, Meru Pro and Pro. They take Portuguese articles outside the word: _o Gmail_, _o Meru Pro_.

## Traps

- **Brazilian, not European.** _arquivo_, _tela_, _baixar_, _usuário_, gerund (_Baixando…_); never _ficheiro_, _ecrã_, _transferir_ or _a baixar_.
- **Placeholders and articles.** _o_, _a_, _do_ and _da_ change with the value. Put the placeholder after a noun (_a conta {name}_).
- **Gendered forms.** Rewrite around the person rather than use _o(a)_.

## Error messages

Say what happened, without _Desculpe_ or _Por favor_: _Não foi possível adicionar a conta._, as Apple writes _Não foi possível renomear essa caixa de correio._

## Apple's words

From Mail's `MainMenu`, `Alerts` and `Localizable` tables and AppKit's `MenuCommands`. A string that names something Gmail also shows, such as the Undo button in the message-sent toast, takes Gmail's word from the glossary instead:

- Cancel _Cancelar_, OK _OK_, Undo _Desfazer_, Close _Fechar_, Delete _Apagar_, Remove _Remover_, Add _Adicionar_, Save _Salvar_, Edit _Editar_, Open _Abrir_, Show _Mostrar_, Hide _Ocultar_, Quit _Encerrar_, Reload _Recarregar_, Try Again _Tentar Novamente_, Learn More… _Saiba mais…_
- Close Tab _Fechar Aba_, Close Other Tabs _Fechar as Outras Abas_, Close Window _Fechar Janela_, Pin Tab _Fixar Aba_, Show Sidebar _Mostrar Barra Lateral_, Minimize _Minimizar_, Copy Link _Copiar Link_, Mark as Read _Marcar como Lida_, Add Account… _Adicionar Conta…_, Quit Mail _Encerrar Mail_
- _Tem certeza de que deseja apagar esta mensagem?_ (Are you sure you want to delete this message?)
- _Até que os anexos tenham sido baixados, você não poderá arrastá-los. Deseja baixar este anexo?_

## Platform words

Not yet written. This table, laid out as `de.md`'s, and `pt-BR.json` beside this sheet, which holds the same words by `msgctxt` and `msgid` with the banned words, pinned terms and access-key style that `check.ts` reads, are filled when the language is added.
