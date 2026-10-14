# 0001 Az ág szakterület, nem ISCO fő csoport és nem RIASEC

**Státusz:** érvényben (Raziel döntése, 2026-10-14; a tábla és az egyedi besorolás jóváhagyva ugyanaznap)

**Kontextus.** A térképen a szög az ágat mutatja, a sugár a szintet, a magasság a pályatípust. Az ESCO
foglalkozásai az ISCO-08 hierarchiában ülnek, ezért kézenfekvő lenne az ISCO 10 fő csoportját ágnak
venni. Az ISCO fő csoportjai azonban nagyrészt képzettségi szint szerint osztanak (1 vezetők,
2 felsőfokú szakmák, 3 technikusok … 9 egyszerű foglalkozások): a szoftverfejlesztő (2512), az
IT-technikus (3512) és az IT-vezető (1330) három különböző fő csoportban van. Így egy pálya körcikkek
között ugrálna, és a szög ugyanazt mondaná, amit a sugár és a magasság már elmond.

**Döntés.**

- **Az ág szakterület:** IT, egészségügy, vendéglátás, ipar, oktatás és így tovább; 13 fő ág, mindegyik
  kisebb ágakra bontva.
- **Saját tábla (`data/branches.json`) sorolja az ISCO-csoportokat kisebb ágakba.** Egy kisebb ág ISCO
  kisebb csoportokat (3 jegy) vagy egységcsoportokat (4 jegy) listáz; az egységcsoport saját listázása
  erősebb a kisebb csoportjáénál. Így ahol egy kisebb csoport több szakterületet fed, ott egységcsoport
  szinten bontunk. Példa: a 134 „Szakmai szolgáltatások vezetői” gyermekgondozást, egészségügyet,
  oktatást és pénzügyet is tartalmaz.
- **Egy ESCO foglalkozás az ISCO-egységcsoportján keresztül örökli az ágát, egy kivétellel.** Ahol egy
  egységcsoport maga is vegyes, ott a kisebbség foglalkozásait ESCO-kódjuk szerint egyenként soroljuk
  a saját szakterületükre. Példa: az 1324 kb. 70 import-export vezetője a nagykereskedelemben marad, a
  repülőtér-igazgató és a vasútüzem-vezető a közlekedésbe kerül. Egyedi besorolás csak kétesnek jelölt
  egységcsoportban van (lásd a `pnpm branches:review` oldalát).
- **A tábla első változatát LLM javasolja, Raziel ellenőrzi.** A fő ágak sorrendjét a körön kézzel
  adjuk meg, hogy a rokon szakterületek egymás mellé kerüljenek.

**Következmények.**

- Az ág kézi döntés, nem hivatalos osztályozás. Ha a tábla változik, az egész térkép átrendeződik.
- A szomszédos ágak közti távolság a kézi sorrendtől függ, nem mért hasonlóságtól.
- Az egyedi besorolás ESCO-kódhoz kötött. Ha egy ESCO-verzió kódot vált, az ellenőrzés megáll, és a
  besorolást kézzel kell frissíteni.
- Egy foglalkozás pontosan egy ágban van. Ami két szakterületen is otthon van, az a tábla döntése
  szerint az egyikbe kerül, a másikkal váltás-él köti össze.

**Elutasítva.**

- ISCO fő csoport mint ág: szintet és vezetői szerepet kódol, nem szakterületet.
- Csak egységcsoport szintű besorolás, egyedi kivétel nélkül: egyszerűbb, de a vegyes csoportok
  kisebbsége (repülőtér-igazgató a kereskedelemben, erőművezető az üzleti szolgáltatásokban) rossz
  helyre kerülne, és ez a térképen azonnal látszana.
- RIASEC (Holland-hatszög) mint szög, az ESCO–O\*NET megfeleltetésen át: szakmailag megalapozott és
  folytonos, de az ágaknak nincs nevük, amerikai adat, és két lépésben kell leképezni. Később
  illeszkedési rétegként visszajöhet.
