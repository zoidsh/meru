# Portuguese, Brazil (`pt-BR`)

Brazilian Portuguese follows Apple's conventions in macOS Mail and AppKit for `pt_BR` for address, label form, capitalization, punctuation and the ellipsis. It is the only Portuguese catalog, so it reads as Brazilian, never European. Its words follow two rules:

- **An OS label takes its platform's word.** An entry whose `msgctxt` is `macOS`, `Windows` or `Linux` is a label the operating system names its own way, such as the File menu or Paste. A label only macOS shows, such as the Window menu or Hide Others, is an OS label too and carries `macOS` alone. `macOS` takes Apple's word (Apple Mail's for a mail menu item), `Windows` Microsoft's and `Linux` GNOME's, from [Platform words](#platform-words) below. Only the word changes: address, capitalization, punctuation and the ellipsis stay this sheet's on every platform, so a Windows or Linux label is title-cased too.
- **Everything else takes the house word**, from this sheet and the glossary, by the [source order](../source-order.md): Gmail's word for a term Gmail also shows, Google's for Google's names, and in Meru's own copy Chrome's word where Chrome has the term, else the apps' word the glossary counts and marks agent-chosen, with its tally. Apple is never the authority for a house word; its macOS apps are one vote of seven when the glossary counts the apps' word. Meru's own copy reads the same on every platform, and each rule in `pt-BR.json` gives its word's source.

Where this sheet and a habit from other software disagree, this sheet wins.

## Address

_você_, with _seu_ and _sua_: _Tem certeza de que deseja …?_, _sua conta_. Never _tu_ or its verb forms (_queres_, _tens_). Chrome addresses the user the same way.

## Buttons and menu items

The infinitive: _Responder_, _Excluir_, _Salvar_, _Cancelar_, _Fechar Guia_. Delete is _Excluir_, as Chrome and Gmail write it, never _Apagar_.

## Label forms

The form and case each kind of label takes, decided before the language's first run. Every label of a kind takes its form, whatever its English does; the examples are the catalog's own.

- **Button:** The infinitive, in title case: _Cancelar_, _Salvar_, _Fechar Guia_.
- **Menu bar item:** The infinitive, in title case, the app menu the titlebar button pops up on Windows and Linux included: _Recarregar_, _Selecionar Próxima Guia_, _Gerenciar Contas_.
- **Context or popup menu item:** The infinitive, in title case: _Copiar URL_, _Fechar Outras Guias_, _Abrir no Navegador Padrão_.
- **Select option:** An option that names an action takes the infinitive, any other is the word itself, in sentence style: _Mostrar_, _Ocultar_, _Sempre_, _Nunca_, _Somente quando você pedir_. An adjective option agrees with the setting's noun in gender and number: _Automática_ and _Estreita_ under _Largura_, _Automático_ under _Posicionamento_, _Escura_ under the tray icon's _Cor_; a colour's name is its noun, masculine whatever the setting's noun: _Preto_, _Branco_. An option that names a mode among options that are actions is no adjective of the label's noun: it takes the singular masculine, whatever the label's number, as _Automático_ beside _Ocultar_ and _Mostrar_ under _Controles da janela_.
- **Checkbox or switch label:** The infinitive, in sentence style: _Mostrar janelas_, _Abrir a pasta ao concluir_, _Marcar e-mail como lido após copiar_.
- **Checkbox that picks what an action applies to:** A noun phrase naming what it picks, in sentence style, never the infinitive, as Chrome's Cookies and other site data is in its Delete browsing data dialog: _Cookies e outros dados do site_, _Imagens e arquivos armazenados em cache_.
- **Setting description:** An infinitive clause in sentence style, ending in a period, as [Settings](#settings) says: _Abrir a pasta que contém o arquivo quando um download terminar._ One that says what the setting holds is a noun phrase, and an instruction for a step the user takes the imperative with _você_: _Deslize…_
- **Setting description never opens with:** the imperative with _você_ of the English verb a description opens with, in its first word or the first word after a leading phrase's comma: Add _Adicione_; Ask _Pergunte_; Block _Bloqueie_; Check _Verifique_; Choose _Escolha_; Close _Feche_; Detect _Detecte_; Display _Mostre_ _Exiba_; Export _Exporte_; Extend _Estenda_; Hide _Oculte_; List _Liste_; Mark _Marque_; Move _Mova_; Open _Abra_; Play _Toque_; Prompt _Peça_; Receive _Receba_; Recolor _Mude_; Remember _Lembre_; Render _Renderize_; Run _Execute_; Select _Selecione_; Send _Envie_; Set _Defina_; Show _Mostre_ _Exiba_; Signs _Saia_ _Desconecte_; Start _Inicie_; Stop _Impeça_; Swipe _Deslize_; Unload _Descarregue_; Use _Use_. `scripts/translate-rules.test.ts` fails on one, except a description that is itself an instruction the test names, and fails when a description opens with an English verb this line lacks.
- **OS label:** Its platform's word from [Platform words](#platform-words), in the form and case its source writes it: _Colar_, _Encerrar {appName}_ on macOS and _Sair do {appName}_ on Windows and Linux, _Arquivo_.

## Capitalization

Title case for menu items and buttons, as Apple writes them: every word except articles, prepositions and conjunctions takes a capital (_Nova Mensagem_, _Marcar como Lida_, _Fechar Outras Guias_). Chrome's sentence-case labels are its own style and are not followed. Sentences, descriptions and dialog text are sentence style. In Settings, a setting's label is sentence style (_Proteção contra phishing_, _Mostrar emblema de não lidos_), and so is each option of its select (_Abrir arquivo_, _Mostrar na pasta_, _Novas janelas_, _Somente a primeira seção_) and a checkbox's label (_Não mostrar novamente_). A tooltip or accessible name that names an icon button is the button's name, so it is title case (_Limpar Cor_, _Mostrar Favoritos_, _Mostrar na Pasta_); a tooltip that tells the user what to do is a sentence (_Abra as configurações do Gmail para desativar a resposta automática de férias_). A label that opens something further ends in an ellipsis with no space before it: _Adicionar Conta…_.

## Settings

_Configurações_, Chrome's word, in Meru's own copy: the window, its title and every mention of it. The app-menu item with `msgctxt` `macOS` is Apple's _Ajustes…_, as AppKit writes it; with `Windows` or `Linux` it is _Configurações…_, Microsoft's and GNOME's word with the English's ellipsis. _Ajustes_ appears in Meru's own copy only as macOS's own _Ajustes do Sistema_.

A setting's description says what the setting does, so it opens with the infinitive, as Chrome's do (_Mostrar notificação pop-up para novos dispositivos USB._, _Selecionar o diretório da extensão._): _Mostrar o ícone do app na barra de menus._, _Escolher a cor do ícone da bandeja do sistema._, _Definir os intervalos de horário em que as notificações ficam ativas._ A sentence that tells the user to do something, such as a step in another app or a later sentence of a description, takes the imperative with _você_, as Chrome's instructions do (_Selecione um campo de texto…_): _Abra e desbloqueie o 1Password._, _Deixe a lista vazia para permitir notificações a qualquer hora._

## Access keys

An `&` in the English marks the access key on Windows and Linux. Keep one `&` inline, before a letter of the Portuguese word: the English letter where the word has it, else the first free letter, one no other label in the same menu uses. macOS drops the `&`. The labels whose word has the English letter claim it first, in menu order; the rest then take their first free letter, in menu order. `packages/app/access-keys.test.ts` holds every catalog to this: it builds each menu and context menu Windows and Linux show, and fails when two items in one menu share a letter.

The page and text-field context menu, by that policy, on Windows: `&Learn Spelling` _A&prender Ortografia_, `&Search with Google` _Pe&squisar com o Google_, `Cu&t` _Recor&tar_, `&Copy` _&Copiar_, `&Paste` _Co&lar_, `Paste and &Match Style` _Colar co&m a Mesma Formatação_, `Select &All` _Selecion&ar Tudo_, `Sa&ve Image As…` _Sal&var Imagem Como…_, `Copy Link Addr&ess` _Copiar &Endereço do Link_, Chrome's words and key (Chrome 3/3), on the English letter, E, which no item beside it takes, `Cop&y Image` _Cop&iar Imagem_, `C&opy Image Address` _C&opiar Endereço da Imagem_. On Linux, where its words differ: `Paste and &Match Style` _Colar co&m o Mesmo Estilo_.

## Plural categories

`one`, `many` and `other`. `one` covers 0 and 1 in Brazilian Portuguese, `many` is for large round numbers (1.000.000), so its text is usually the same as `other`'s: `{count, plural, one {# guia} many {# guias} other {# guias}}`.

## Terms that stay English

Gmail, Google Workspace, Meru, Meru Pro, Meru Portal and Pro. They take Portuguese articles outside the word: _o Gmail_, _o Meru Pro_.

## Traps

- **Brazilian, not European.** _arquivo_, _tela_, _baixar_, _usuário_, gerund (_Baixando…_); never _ficheiro_, _ecrã_, _transferir_, _utilizador_ or _a baixar_. Chrome's Brazilian Portuguese agrees on every one.
- **Punctuation.** Quotation marks are “…” (U+201C, U+201D), as Apple writes them, never straight `"…"`, which Chrome mostly uses. The ellipsis is the single character …, straight after the word with no space, never three periods.
- **Numbers and units.** A plain space parts a number from its unit, as Chrome writes it, never a no-break space: _5 minutos_, _# dias_.
- **Placeholders and articles.** _o_, _a_, _do_ and _da_ change with the value. Put the placeholder after a noun (_a conta {name}_).
- **Gendered forms.** Rewrite around the person rather than use _o(a)_.
- **House words, as Chrome writes them.** A tab is a _guia_, never an _aba_: _Fechar Guia_, _guias verticais_, the tab strip the _barra de guias_. To delete is _excluir_. To pin a tab is _fixar_ and to unpin it _liberar_. To quit is _sair_ (_Sair_); the app menu's Quit is an OS label, Apple's _Encerrar {appName}_ on macOS. To search is _pesquisar_ and a search a _pesquisa_ (_pesquisa salva_), never _buscar_ or _busca_ outside Apple's own `macOS` labels. An email is an _e-mail_, with the hyphen. A bookmark is a _favorito_, an extension an _extensão_, a link a _link_, a website a _site_. The download history is the _histórico de downloads_, the launcher the _iniciador_, the default browser the _navegador padrão_, a password manager a _gerenciador de senhas_ and a passkey a _chave de acesso_. Restarting is _reiniciar_ and an update an _atualização_. The `pt-BR.json` rules beside this sheet give Chrome's count for each.
- **macOS's own elements.** The menu bar, the Dock, Finder and System Settings take Apple's names in Meru's own copy too, since they name Apple's interface and show only on macOS: _barra de menus_ (ControlCenterSettings.appex `Localizable` `Show in Menu Bar`), _Dock_ (DesktopSettings.appex `Localizable` `Dock`), _Finder_ and _Ajustes do Sistema_ (TranslationAPIExtension.appex `Localizable` `SYSTEM_SETTINGS`).
- **1Password's words.** The steps for connecting 1Password quote its Settings, Browser and Add Browser as _configurações_, _Navegador_ and _Adicionar navegador_ (_Selecione Navegador e depois Adicionar navegador._), and its vault as _cofre_ (agent-chosen, unresolved: 1Password's Brazilian Portuguese interface has not been read). Its Settings is Meru's own _Configurações_, so the `ajustes` ban holds there too.

## Error messages

Say what happened, without _Desculpe_ or _Por favor_: _Não foi possível adicionar a conta._, as Apple writes _Não foi possível renomear essa caixa de correio._

## Common labels

House words for everyday actions, as Chrome writes its labels, in this sheet's label form and capitalization. A string that names something Gmail also shows, such as the Undo button in the message-sent toast, takes Gmail's word from the glossary instead, and an entry with a platform `msgctxt` takes [its platform's word](#platform-words). Delete and Remove are two words, as Chrome writes them: Remove account never reads as deleting it. The labels:

- Cancel _Cancelar_, OK _OK_, Close _Fechar_, Delete _Excluir_, Remove _Remover_, Add _Adicionar_, Save _Salvar_, Edit _Editar_, Open _Abrir_, Show _Mostrar_, Hide _Ocultar_, Quit _Sair_, Reload _Recarregar_, Hard Reload _Recarregamento Forçado_, Chrome's own noun phrase kept whole (Chrome 1/1), Try Again _Tentar Novamente_, Done _Concluído_, Learn More… _Saiba Mais…_
- Close Tab _Fechar Guia_, Close Other Tabs _Fechar Outras Guias_, Pin Tab _Fixar Guia_, Unpin _Liberar_, Show Sidebar _Mostrar Barra Lateral_, Copy Link _Copiar Link_, Mark as Read _Marcar como Lida_, Add Account… _Adicionar Conta…_
- _Tem certeza de que deseja excluir esta mensagem?_ (Are you sure you want to delete this message?)
- _Até que os anexos tenham sido baixados, você não poderá arrastá-los. Deseja baixar este anexo?_

## Platform words

The platform words table is in [pt-BR.platform.md](pt-BR.platform.md); read it when an entry has a `macOS`, `Windows` or `Linux` msgctxt.
