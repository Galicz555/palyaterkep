# 0004 Az MI-érintettség az ILO 2025-ös indexéből jön, ISCO-egységcsoportonként

**Státusz:** elfogadva (2026-10-15)

**Kontextus.** A térképen egy kapcsoló látványosan kioltja azokat a szerepeket, amelyeket a generatív
MI a legjobban fenyeget. Olyan adat nincs, amely kimondaná, hogy egy munka 5, 10 vagy 20 év alatt
megszűnik. Az ILO 2025-ös indexe (Gmyrek és mtsai., ILO Working Paper 140) azt méri, hogy egy
foglalkozás feladatainak mekkora része érintett, és ez a feladatok között mennyire egyenletes. Az
eredményt az ISCO-08 négyjegyű egységcsoportjaira adja meg, az ESCO-kód pedig ilyen csoporttal kezdődik.

**Döntés.**

- **A forrás a cikk A1-es táblázata.** A gradienst a cikk 5. táblázata definiálja a feladatpontok
  átlagából (μ) és szórásából (σ). A 4-es gradiensbe azok tartoznak, ahol μ ≥ 0,6 és μ − σ ≥ 0,5, vagyis
  ahol szinte minden feladat erősen érintett. A szerzők szerint ez felel meg a korábbi (2023-as)
  „automatizálási kockázat” kategóriának. A `data/genai-exposure.json` az 1–4-es gradienst tartalmazza
  mind a 112 érintett egységcsoportra (17/44/38/13, a cikkel egyezően), a PDF szövegéből kiolvasva. Ami
  nincs a fájlban, azt az ILO minimálisan érintettnek vagy nem érintettnek sorolja.
- **Egy ESCO-foglalkozás a kódja első négy jegye szerinti csoport gradiensét kapja.** Ugyanazt kapja
  minden szintje, ahogy a terhelést is (ADR 0003).
- **A kapcsoló csak a 4-es gradienst oltja ki,** és a felület azt mondja róla, hogy „erősen kiváltható”,
  nem azt, hogy „eltűnik”. A kioltott szerep halvány maradványként a helyén marad, és ugyanúgy
  kiválasztható, mint a többi.

**Következmények.**

- **A 3047 szerepből 52 a 4-es gradiensben van.** Köztük az adatrögzítő, a bérelszámoló, a call center
  operátor, a pénzügyi elemző és a webfejlesztő. 283 a 3-asban, 359 a 2-esben, 106 az 1-esben, 2247
  minimálisan vagy egyáltalán nem érintett.
- **Az egységcsoport tompa eszköz.** A 2513-as csoport (web- és multimédia-fejlesztők) miatt a
  digitálisjáték-fejlesztő és a felhasználói felület tervező is kioltódik. A 3312-es csoport (hitel- és
  kölcsönügyintézők) miatt a hitelezési vezető is.
- **Az érintettség nem megszűnés.** Az index a mai feladatokat méri, nem a foglalkoztatást. Arról nem
  szól, hogy az érintett feladatok helyére kerül-e új feladat, és mikor. Ezért nincs a térképen
  évszám.
- **Lengyel feladatlista, globális becslés.** A feladatok a lengyel foglalkozási osztályozásból
  származnak, a pontokat lengyel dolgozók, szakértők és nyelvi modellek adták. A magyar munkaszervezés
  ehhez közel áll, de ott, ahol eltér, az érték téved.
- **Licenc.** Az ILO munkaanyag CC BY 4.0. A README-ben és a webes láblécben fel kell tüntetni a
  forrást.

**Elutasítva.**

- **Évszám-csúszka (5/10/20 év) a gradiensekből:** az évszámokat nekünk kellene kitalálnunk. Egy
  álláskeresőknek szóló térképen egy kitalált határidő többet árt, mint amennyit mutat.
- **Frey és Osborne (2013) kiváltási valószínűsége:** valóban megszűnést állít, de a nagy nyelvi
  modellek előtt készült, amerikai SOC-kódon át kellene megfeleltetni, és visszatekintve túlbecsült.
- **Az ILO 2023-as indexe:** a 2025-ös felülírja, a feladatok szintjén finomabb, és a szerzők is ezt
  ajánlják.
