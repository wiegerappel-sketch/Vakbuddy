export type Klus = {
  id: string
  bedrijf_id: string
  klant_id: string | null
  datum: string
  transcriptie: string | null
  werkbon_json: unknown | null
  status: string
}

export type Klant = {
  id: string
  bedrijf_id: string
  naam: string
  adres: string | null
  postcode: string | null
  plaats: string | null
  email: string | null
  telefoon: string | null
}

export type Bedrijf = {
  id: string
  user_id: string
  naam: string | null
  kvk: string | null
  btw_nummer: string | null
  iban: string | null
  adres: string | null
  telefoon: string | null
  email: string | null
  logo_url: string | null
}
