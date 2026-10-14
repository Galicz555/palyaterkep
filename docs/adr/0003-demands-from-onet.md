# 0003 A terhelés O\*NET-adatból jön, az ESCO–O\*NET megfeleltetésen át, percentilisként

**Státusz:** javasolt (2026-10-14), Raziel jóváhagyására vár

**Kontextus.** A térkép egy szerepet aszerint is elhelyez, hogy a munkája mennyire terheli a testet,
az elmét és az érzelmeket (fizikai, szellemi, érzelmi terhelés; egy háromszögben az mutatja, melyik
a domináns). Az ESCO ilyet nem ad. Az O\*NET viszont kb. 900 amerikai foglalkozásra méri a
munkakörülményeket (Work Context), a munkatevékenységeket (Work Activities) és a képességeket
(Abilities), dolgozói és elemzői felmérésből. A hivatalos ESCO–O\*NET megfeleltetés (ESCO v1.1.0 ↔
O\*NET-SOC 2019) köti össze a kettőt.

**Döntés.**

- **Tételek dimenziónként** (`ITEMS` a `src/demands/generate.ts`-ben):
  - fizikai: állás, járás, hajolgatás, térdelés, létrán mászás (Work Context); általános fizikai
    tevékenység, tárgyak mozgatása (Work Activities); statikus, dinamikus és törzserő, állóképesség
    (Abilities);
  - szellemi: információfeldolgozás, adatelemzés, döntés és problémamegoldás, kreatív gondolkodás
    (Work Activities); deduktív és induktív gondolkodás (Abilities);
  - érzelmi: konfliktushelyzetek, kellemetlen vagy dühös emberek, agresszív emberek (Work Context);
    mások segítése és gondozása, konfliktusok feloldása és tárgyalás (Work Activities).
- **Egy tétel értéke a fontosság** (Importance) a tevékenységeknél és képességeknél, a gyakoriság vagy
  mérték (Context) a munkakörülményeknél. Mindegyiket a skálája tartományával 0–1 közé hozzuk
  (`scales_reference.csv`), a dimenzió értéke a tételek átlaga. Az O\*NET által elnyomásra javasolt
  („Recommend Suppress”) vagy nem releváns („Not Relevant”) sorokat kihagyjuk. Ha egy O\*NET
  foglalkozásnál egy dimenzió tételeinek legalább fele hiányzik, nem kap pontot (a 31.0-ban ilyen nincs).
- **Ami kimaradt, és miért.** A veszélyes körülmény és a szabadtéri munka körülmény, nem testi
  igénybevétel. A „mások egészségéért és biztonságáért felel” tétel a tetőfedőnél (4,13) ugyanolyan
  magas, mint az ápolónál (4,19): biztonsági felelősséget mér, nem érzelmi megterhelést, és a fizikaihoz
  köti az érzelmit. A szint (Level) skála a munka általános bonyolultságát is hozza, és a mintákat nem
  választja szét jobban.
- **A megfeleltetés mind a négy típusát (exact, close, narrow, broad) egyenlő súllyal átlagoljuk.**
  „Related” típus a fájlban nincs. Az exact/close előnyben részesítése rossz helyre tenné például a
  rendőrt: a close párja a magánnyomozó, a járőrrendőr csak broad.
- **Ahol nincs saját értékelt pár, sorban:** a legközelebbi tágabb ESCO-foglalkozás (kódelőtag) saját
  pontja; a megfeleltetés ISCO-csoportra adott O\*NET-párja (`exactISCO`); végül az ISCO-egységcsoport
  közvetlenül pontozott foglalkozásainak átlaga. Ami egyikkel sem érhető el, az kimarad a fájlból,
  nem kap nullát.
- **A fájlban a pont percentilis:** egy dimenzióban a pontozott foglalkozások közti középrang (a
  legkisebb 0, a legnagyobb 1, a medián 0,5, holtversenyben az átlagrang), 3 tizedesre kerekítve.

**Következmények.**

- **Amerikai adat magyar munkára.** A pont egy amerikai munkakör profilja. Ahol a magyar munkaszervezés
  más (például mit csinál az ápoló és mit az ápolási asszisztens), ott a pont téved, és ezt a térkép
  nem látja.
- **Verzióeltérés.** A megfeleltetés ESCO v1.1.0-ra készült, mi v1.2.1-et használunk. A 3039
  foglalkozásunkból 2607 szerepel benne. 2455 kap közvetlen pontot, ebből 1182 csak narrow vagy broad
  párral. 172 a tágabb ESCO-foglalkozástól, 47 az ISCO-páron át, 320 az egységcsoport-átlagból kap pontot.
  45 marad ki, mert az O\*NET-ben nincs értékelt párjuk: köztük a katonatisztek és altisztek, a
  törvényhozók és politikai vezetők, a jósok és a gépjárművezető-oktatók.
- **A sok-sok kapcsolat átlagol.** A könyvelő a könyvvizsgálók, az adótanácsadók és a könyvelési
  ügyintézők átlaga, ezért a szellemi pontja a medián alatt van. Az átörökölt pont másolat: egy
  ESCO-részfa vagy egy egységcsoport minden tagja ugyanarra a pontra kerül.
- **A percentilis elrejti az abszolút különbséget.** Nyers értékben a szellemi terhelés mindenhol
  magas (medián 0,66), a fizikai alacsony (medián 0,31). A percentilis azt mondja, hogy egy munka
  fizikailag terhelőbb a foglalkozások X%-ánál, nem azt, hogy nehéz. Cserébe a három dimenzió
  összemérhető, és a háromszög kitöltött. A rang a pontozott halmazhoz viszonyít: ha a halmaz változik,
  minden pont elmozdulhat.
- **Licenc.** Az O\*NET CC BY 4.0: a README-ben és a webes láblécben forrásmegjelölés és a módosítás
  jelzése kötelező.
- Új O\*NET- vagy megfeleltetésverziónál `pnpm demands` újraszámol. Ha egy tétel azonosítója vagy neve
  megváltozik, a futás megáll.

**Elutasítva.**

- Fontosság és szint együtt: nem választja szét jobban a mintákat, és mindhárom dimenzióba a munka
  általános nehézségét keveri.
- Csak exact/close pár, ahol van: a megfeleltetés close párjai között is van téves (rendőr →
  magánnyomozó).
- Az egységcsoport-átlag elhagyása: 320 foglalkozás tűnne el, köztük a szociális munkás, akinek egyetlen
  párja az értékelés nélküli „Social Workers, All Other”.
- Nyers vagy z-pont a fájlban: a szellemi dimenzió mindenhol dominálna, és a [0, 1] szerződésbe nem fér.
