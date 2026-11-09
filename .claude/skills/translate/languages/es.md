# Spanish, Spain (`es`)

Spanish for Spain follows Apple's conventions in macOS Mail and AppKit for `es` for address, label form, capitalization, punctuation and the ellipsis. Latin America has its own catalog, `es-419`; the two never borrow from each other. Its words follow two rules:

- **An OS label takes its platform's word.** An entry whose `msgctxt` is `macOS`, `Windows` or `Linux` is a label the operating system names its own way, such as the File menu or Paste. A label only macOS shows, such as the Window menu or Hide Others, is an OS label too and carries `macOS` alone. `macOS` takes Apple's word (Apple Mail's for a mail menu item), `Windows` Microsoft's and `Linux` GNOME's, from [Platform words](#platform-words) below. Only the word changes: address, capitalization, punctuation and the ellipsis stay this sheet's on every platform.
- **Everything else takes the house word**, from this sheet and the glossary, by the [source order](../source-order.md): Gmail's word for a term Gmail also shows, Google's for Google's names, and in Meru's own copy Chrome's word where Chrome has the term, else the apps' word the glossary counts and marks agent-chosen, with its tally. Apple is never the authority for a house word; its macOS apps are one vote of seven when the glossary counts the apps' word. Meru's own copy reads the same on every platform, and each rule in `es.json` gives its word's source.

Where this sheet and a habit from other software disagree, this sheet wins.

## Address

_tú_, with _tu_ and _te_: _¿Seguro que quieres …?_, _tu cuenta_. Never _vosotros_ or _usted_. Chrome addresses the user the same way.

## Buttons and menu items

The infinitive: _Responder_, _Eliminar_, _Guardar_, _Cancelar_, _Aceptar_, _Cerrar pestaña_. The confirming button is _Aceptar_, not _OK_, both on a button Meru draws (Chrome) and in a native dialog, whose OK has a platform `msgctxt` and takes [its platform's word](#platform-words), _Aceptar_ on all three.

## Label forms

The form and case each kind of label takes, decided before the language's first run. Every label of a kind takes its form, whatever its English does; the examples are the catalog's own.

- **Button:** The infinitive, in sentence style: _Cancelar_, _Guardar_, _Cerrar pestaña_.
- **Menu bar item:** The infinitive, in sentence style, the app menu the titlebar button pops up on Windows and Linux included: _Volver a cargar_, _Seleccionar pestaña siguiente_, _Gestionar cuentas_.
- **Context or popup menu item:** The infinitive, in sentence style, as Chrome writes its own: _Copiar URL_, _Cerrar las demás pestañas_, _Abrir en el navegador predeterminado_.
- **Select option:** An option that names an action takes the infinitive, any other is the word itself, in sentence style: _Mostrar_, _Ocultar_, _Siempre_, _Nunca_, _Estrecho_, _Solo cuando lo pidas_. An adjective option agrees with the setting's noun in gender and number: _Automático_ and _Estrecho_ under _Ancho_, _Automática_ and _Contraída_ under _Visualización_, _Oscuro_ under _Tema_; a colour's name is its noun, masculine whatever the setting's noun: _Negro_, _Blanco_. An option that names a mode among options that are actions is no adjective of the label's noun: it takes the singular masculine, whatever the label's number, as _Automático_ beside _Ocultar_ and _Mostrar_ under _Controles de ventana_.
- **Checkbox or switch label:** The infinitive, in sentence style: _Mostrar ventanas_, _Abrir la carpeta al terminar_, _Inactivar pestañas sin usar_.
- **Checkbox that picks what an action applies to:** A noun phrase naming what it picks, in sentence style, never the infinitive, as Chrome's Cookies and other site data is in its Delete browsing data dialog: _Cookies y otros datos de sitios_, _Archivos e imágenes almacenados en caché_.
- **Setting description:** An infinitive clause in sentence style, ending in a period: _Abrir la carpeta que contiene el archivo cuando termine una descarga._, _Preguntar dónde guardar cada archivo antes de descargarlo._ One that says what the setting holds is a noun phrase, and an instruction for a step the user takes, such as Swipe…, the _tú_ imperative: _Desliza dos dedos…_
- **Setting description never opens with:** the _tú_ imperative of the English verb a description opens with, in its first word or the first word after a leading phrase's comma: Add _Añade_ _Agrega_; Ask _Pregunta_; Block _Bloquea_; Check _Busca_ _Comprueba_; Choose _Elige_; Close _Cierra_; Detect _Detecta_; Display _Muestra_; Export _Exporta_; Extend _Extiende_; Hide _Oculta_; List _Enumera_ _Muestra_; Mark _Marca_; Move _Mueve_; Open _Abre_; Play _Reproduce_; Prompt _Pide_; Receive _Recibe_; Recolor _Cambia_; Remember _Recuerda_; Render _Renderiza_; Run _Ejecuta_; Select _Selecciona_; Send _Envía_; Set _Configura_ _Establece_ _Define_; Show _Muestra_; Signs _Cierra_; Start _Inicia_; Stop _Impide_; Swipe _Desliza_; Unload _Inactiva_; Use _Usa_ _Utiliza_. `scripts/translate-rules.test.ts` fails on one, except a description that is itself an instruction the test names, and fails when a description opens with an English verb this line lacks.
- **OS label:** Its platform's word from [Platform words](#platform-words), in the form its source writes it, the infinitive or a noun for all three: _Pegar_, _Salir de {appName}_, _Archivo_.

## Capitalization

Sentence style: only the first word and proper nouns take a capital. A label that opens something further ends in an ellipsis with no space before it: _Añadir cuenta…_.

## Settings

_Configuración_, Chrome's word, in Meru's own copy: the window, its title and every mention of it. The app-menu item with `msgctxt` `macOS` is Apple's _Ajustes…_, as AppKit writes it; with `Windows` or `Linux` it is _Configuración…_, Microsoft's and GNOME's word with the English's ellipsis. _Ajustes_ appears in Meru's own copy only as macOS's own _Ajustes del Sistema_.

## Access keys

An `&` in the English marks the access key on Windows and Linux. Keep one `&` inline, before a letter of the Spanish word: the English letter where the word has it, else the first free letter, one no other label in the same menu uses. macOS drops the `&`. The labels whose word has the English letter claim it first, in menu order; the rest then take their first free letter, in menu order. `packages/app/access-keys.test.ts` holds every catalog to this: it builds each menu and context menu Windows and Linux show, and fails when two items in one menu share a letter.

The page and text-field context menu, by that policy, on Windows: `&Learn Spelling` _Aprender pa&labra_, `&Search with Google` _Bu&scar con Google_, `Cu&t` _Cor&tar_, `&Copy` _&Copiar_, `&Paste` _&Pegar_, `Paste and &Match Style` _Pegar con el &mismo formato_, `Select &All` _Seleccion&ar todo_, `Sa&ve Image As…` _&Guardar imagen como…_, `Copy Link Addr&ess` _Copiar dir&ección de enlace_, Chrome's words (Chrome 2/3, the third _del enlace_) with the English letter, E, which no item beside it takes, `Cop&y Image` _Copia&r imagen_, `C&opy Image Address` _C&opiar dirección de imagen_. On Linux, where its words differ: `Paste and &Match Style` _Pegar con el &mismo estilo_.

## Plural categories

`one`, `many` and `other`. `many` is for large round numbers (1.000.000), so its text is usually the same as `other`'s: `{count, plural, one {# pestaña} many {# pestañas} other {# pestañas}}`. 0 takes `other`.

## Terms that stay English

Gmail, Google Workspace, Meru, Meru Pro, Meru Portal and Pro.

## Traps

- **Spain's vocabulary and tense.** _ordenador_, _introducir_, _Añadir_; the perfect for a recent past: _No se ha podido …_. Never Latin America's _computadora_, _ingresar_, _Agregar_ or _No se pudo …_. Chrome's Spanish agrees on every one.
- **Punctuation.** A question or exclamation opens with ¿ or ¡. Quotation marks are “…” (U+201C, U+201D), as Apple writes them, never straight `"…"`, which Chrome uses, or «…». The ellipsis is the single character …, straight after the word with no space, never three periods. A sentence that names a menu item or dialog drops the item's ellipsis, as Apple's and Microsoft's style guides do: _Mostrar el cuadro de diálogo “Guardar como” antes de descargar_.
- **Numbers and units.** A plain space parts a number from its unit, as Chrome writes it, never a no-break space: _5 minutos_, _# días_.
- **Placeholders and articles.** _el_, _la_ and _del_ change with the value. Put the placeholder after a noun (_la cuenta {name}_).
- **Gendered forms.** Rewrite around the person rather than use _o/a_ or _@_.
- **House words, as Chrome writes them.** A link is an _enlace_, never a _vínculo_. A bookmark is a _marcador_. An extension is an _extensión_. An app is an _aplicación_, never an _app_ outside Apple's own `macOS` labels: _aplicación de Workspace_. To pin a tab is _fijar_ and to unpin it _desfijar_, never _anclar_; a pinned tab is a _pestaña fija_. To reload is _volver a cargar_, never _recargar_. To remove something from a list is _quitar_ (_Quitar cuenta_); to delete it for good is _eliminar_. The download history is the _historial de descargas_, the tab strip the _barra de pestañas_, the launcher the _menú de aplicaciones_, the default browser the _navegador predeterminado_, a password manager a _gestor de contraseñas_ and a passkey a _llave de acceso_. Restarting is _reiniciar_ and an update an _actualización_. The `es.json` rules beside this sheet give Chrome's count for each.
- **macOS's own elements.** The menu bar, the Dock, Finder and System Settings take Apple's names in Meru's own copy too, since they name Apple's interface and show only on macOS: _barra de menús_ (ControlCenterSettings.appex `Localizable` `Show in Menu Bar`), _Dock_ (DesktopSettings.appex `Localizable` `Dock`), _Finder_ and _Ajustes del Sistema_ (System Settings `InfoPlist` `CFBundleDisplayName`).
- **1Password's words.** The steps for connecting 1Password quote its Settings, Browser and Add Browser as _Configuración_, _Navegador_ and _Añadir navegador_ (_Selecciona Navegador y, después, Añadir navegador._), and its vault as _bóveda_ (agent-chosen, unresolved: 1Password's Spanish interface could not be read, its support site refusing every fetch). Its Settings is Meru's own _Configuración_, so the `ajustes` ban holds there too.

## Error messages

Say what happened, without _Lo sentimos_ or _Por favor_: _No se ha podido añadir la cuenta._, as Apple writes _No se ha podido renombrar el buzón “%1$@”._

## Common labels

House words for everyday actions, as Chrome writes its labels, in this sheet's label form. A string that names something Gmail also shows, such as the Undo button in the message-sent toast, takes Gmail's word from the glossary instead, and an entry with a platform `msgctxt` takes [its platform's word](#platform-words). Delete and Remove are two words, as Chrome writes them: Remove account never reads as deleting it. The labels:

- Cancel _Cancelar_, OK _Aceptar_, Close _Cerrar_, Delete _Eliminar_, Remove _Quitar_, Add _Añadir_, Save _Guardar_, Edit _Editar_, Open _Abrir_, Show _Mostrar_, Hide _Ocultar_, Quit _Salir_, Reload _Volver a cargar_, Try Again _Reintentar_, Done _Hecho_, Learn More… _Más información…_
- Close Tab _Cerrar pestaña_, Close Other Tabs _Cerrar las demás pestañas_, Pin Tab _Fijar pestaña_, Unpin _Desfijar_, Show Sidebar _Mostrar barra lateral_, Copy Link _Copiar enlace_, Mark as Read _Marcar como leído_, Add Account… _Añadir cuenta…_
- Inspect Element _Inspeccionar elemento_ (Chrome 2/2, Inspeccionar), Hard Reload _Volver a cargar de manera forzada_ (Chrome 1/1), Show in folder _Mostrar en carpeta_ (Chrome 4/4); Width _Ancho_ (Chrome 5/5), so its Auto is _Automático_ and Narrow and Wide _Estrecho_ and _Amplio_, in a sentence that names them too (_cambia entre estrecho y amplio_), never _Ancho_, by a recorded call: Chrome's _Ancho_ is Width's own word here, and a select can't show its label as one of its values (agent-chosen, unresolved by the app count: amplio: 2 of 7 (Thunderbird, LibreOffice), with Width's _Ancho_ out of the vote)
- In a sentence, try again is _vuelve a intentarlo_: _Conéctate y vuelve a intentarlo._
- _¿Seguro que quieres eliminar este mensaje?_ (Are you sure you want to delete this message?)
- _Para arrastrar un archivo adjunto, primero debes descargarlo. ¿Quieres descargar el archivo adjunto?_

## Platform words

The platform words table is in [es.platform.md](es.platform.md); read it when an entry has a `macOS`, `Windows` or `Linux` msgctxt.
