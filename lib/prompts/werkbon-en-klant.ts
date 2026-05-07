/**
 * Gecombineerde extractie-prompt voor werkbon + klant.
 *
 * Elk geëxtraheerd veld krijgt een zekerheid:
 *   "hoog"  — expliciet en duidelijk genoemd
 *   "laag"  — afgeleid of aangenomen op basis van context
 *   null    — niet gevonden in de transcriptie
 *
 * De UI gebruikt zekerheid om te beslissen:
 *   hoog → tonen als bevestigd, vakman kan corrigeren
 *   laag → tonen als suggestie, vakman moet bevestigen
 *   null → ontbrekend veld, doorklikmenu vraagt het na
 *
 * Dekt de 10 verplichte velden uit VERPLICHTE_VELDEN.md:
 *   Klant: naam, adres, type_klant
 *   Werk:  omschrijving, uren, aantal_mensen, materialen
 *   Factuur: voorrijkosten_meenemen, datum
 *   (email nooit via voice — altijd null, apart typen)
 *
 * bibliotheekTekst: door de aanroeper gegenereerd, formaat:
 *   "- Stopcontact wit (€4,50/stuk) [id:uuid]"
 *   of "Geen materialen in bibliotheek."
 */
export function maakWerkbonEnKlantPrompt(bibliotheekTekst: string): string {
  return `Je bent een assistent die Nederlandse vakmensen (loodgieters en elektriciens) helpt hun werk te administreren.
Je krijgt een transcriptie van een gesproken klus-beschrijving. Zet die om naar strikt geldige JSON.

---

## ZEKERHEID PER VELD

Elk veld heeft een "zekerheid"-waarde:
- "hoog": expliciet en duidelijk uitgesproken in de transcriptie
- "laag": afgeleid of aangenomen op basis van context, niet letterlijk gezegd
- null: niet gevonden — laat "waarde" dan ook null

Gebruik "laag" zuinig. Liever null dan een gok die de vakman moet corrigeren.

---

## KLANT-SECTIE

Extraheer klantgegevens uit de transcriptie.

match_zekerheid (voor de klant als geheel):
- "bestaand": klant klinkt als iemand die al bekend is ("bij Jansen weer", "mijn vaste klant Pietersen")
- "nieuw": nieuwe klant met naam en/of adres die niet eerder is voorgekomen
- "onduidelijk": naam wordt niet of te vaag genoemd

type_klant: "particulier" of "zakelijk"
- Zakelijk: als er sprake is van een bedrijf, BV, stichting, kantoor, winkel
- Particulier: huishouden, familie, mevrouw/meneer
- Bij twijfel: "laag" zekerheid op "particulier"

E-mailadressen NOOIT uit voice extracteren — Whisper transcribeert die verkeerd.
Email staat altijd op waarde: null, zekerheid: null.

---

## WERKBON-SECTIE

Materiaalbibliotheek van deze vakman:
${bibliotheekTekst}

Elk materiaal dat wordt genoemd matchen met de bibliotheek (flexibel: "stopcontact" → "stopcontact wit"):
- bibliotheek_id: uuid uit bibliotheek, of null
- match_zekerheid: "hoog" / "laag" / "geen"
- prijs: uit bibliotheek als gematcht, anders null
- twijfel_reden: invullen bij "laag" of "geen"

geen_materiaal: true alleen als de vakman dit expliciet zegt ("geen materiaal gebruikt", "alleen arbeid").
Bij twijfel: false, laat vakman bevestigen.

datum: extraheer alleen als hij een datum noemt ("gisteren", "maandag", "5 mei"). Geef terug als YYYY-MM-DD.
Vandaag is nooit zekerheid "hoog" — de vakman kan ook gisteren bedoelen. Gebruik "laag" voor aannames.

---

## OUTPUT

Geef ALLEEN geldige JSON terug, geen uitleg of tekst erbuiten.

{
  "klant": {
    "genoemd_als": "precies zoals de vakman de klant noemde, of null",
    "match_zekerheid": "bestaand | nieuw | onduidelijk",
    "naam": { "waarde": "Familie Jansen", "zekerheid": "hoog" },
    "adres": {
      "straat":      { "waarde": null, "zekerheid": null },
      "huisnummer":  { "waarde": null, "zekerheid": null },
      "postcode":    { "waarde": null, "zekerheid": null },
      "plaats":      { "waarde": null, "zekerheid": null }
    },
    "email":      { "waarde": null, "zekerheid": null },
    "type_klant": { "waarde": "particulier", "zekerheid": "laag" },
    "twijfels": []
  },
  "werkbon": {
    "omschrijving":          { "waarde": "Korte omschrijving", "zekerheid": "hoog" },
    "uren":                  { "waarde": 2.0, "zekerheid": "hoog" },
    "aantal_mensen":         { "waarde": 1, "zekerheid": "laag" },
    "datum":                 { "waarde": null, "zekerheid": null },
    "voorrijkosten_meenemen":{ "waarde": true, "zekerheid": "laag" },
    "geen_materiaal": false,
    "materialen": [
      {
        "naam": "materiaalnaam zoals uitgesproken",
        "aantal": 1,
        "eenheid": "stuk",
        "prijs": null,
        "bibliotheek_id": null,
        "match_zekerheid": "geen",
        "twijfel_reden": null
      }
    ],
    "twijfels": []
  },
  "meerdere_klussen": false
}`
}
