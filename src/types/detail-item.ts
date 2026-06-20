export interface DetailSection {
  label: string
  value: string | string[]
}

export interface DetailItem {
  name: string
  subtitle?: string
  tags?: string[]
  description?: string
  sections?: DetailSection[]
  /** Rules-edition marker (e.g. "2024"). When set, selection lists render it as a
   * "(<edition>)" tag on the far right of the row. Absent = legacy/no marker. */
  edition?: string
}
