# 0002 Az ESCO a gerinc, a szint saját skála, szintenkénti készséglista csak kurált létrában

**Státusz:** érvényben (Raziel döntése, 2026-10-14)

**Kontextus.** A térképhez a munkák teljes köre kell, magyarul. Az ESCO nagyjából 3000 foglalkozást és
14 ezer készséget ad, foglalkozás–készség kapcsolatokkal (kötelező vagy opcionális), 28 nyelven,
köztük magyarul. Három dolog viszont nincs benne: szint (junior, medior, senior), szintenkénti
készséglista (a készségek foglalkozásonként vannak megadva), és „következő munka” kapcsolat. Ezek
nélkül az előrelépés hiánylistája üres lenne, pedig az a termék magja.

**Döntés.**

- **A gerinc az ESCO (v1.2.x).** Egy foglalkozás vagy készség azonosítója az ESCO URI.
- **A szint saját, 5 fokú skála** (belépő, önálló, tapasztalt, kiemelt, stratégiai; lásd a glosszáriumot).
- **Szerep csak ott van, ahol a szint értelmes.** Az a foglalkozás, amely maga is egy létra foka
  („sous-chef”), egyetlen szerep a saját szintjén.
- **A nem kurált szerep készséglistája az ESCO foglalkozás kötelező készségei.**
- **Kurált létrában minden szint saját készséglistát kap, az ESCO készségkészletéből.** LLM javasol,
  ember ellenőriz. Saját, nem ESCO-s készség csak akkor kerül be, ha a címkézett CV-készlet olyan hiányt
  mutat, amit az ESCO nem tud kifejezni. Ilyenkor magyar és angol címkét is kap.
- **Az élek két forrásból jönnek.** A váltás-éleket a kötelező készségek átfedéséből számoljuk, az
  előrelépés-élek kuráltak.
- **Az álláshirdetés-adat (kereslet, fizetés) nem része a gerincnek;** később réteg lehet.

**Következmények.**

- Az előrelépés hiánylistája csak kurált létrában értelmes. A nem kurált ágakban a térkép váltásokat
  és az ESCO szerinti hiánylistát mutatja, és jelöli, hogy nem ellenőrzött.
- A kurálás egysége a létra, nem az él. A munka ágról ágra halad: IT, aztán a szabályozott létrák, aztán
  a KSH FEOR-08 létszám szerint.
- A generált és az ellenőrzött tartalom elkülönül, hogy ESCO-verzióváltáskor az újragenerálás ne írja
  felül az ellenőrzöttet.
- Az ESCO forrásmegjelölése a README-ben kötelező.

**Elutasítva.**

- Minden foglalkozás három általános szintje: „junior séf”, „junior főorvos”.
- O\*NET mint gerinc: van felkészültségi szintje (Job Zone), de amerikai, és nincs magyar címkéje.
- Álláshirdetések mint gerinc: frissek, de a scraping jogilag és karbantartásban drága, és nem fedik
  a munkák teljes körét.
- Készségek mint node-ok: 14 ezer pont elárasztaná a térképet.
