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
}
