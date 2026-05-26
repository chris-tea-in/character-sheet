import type { SetupDraft } from '@/lib/characterSetup'
import type { SetupData } from '@/lib/data'

interface Props {
  draft: SetupDraft
  data: SetupData
  errors: string[]
  onChange: (updates: Partial<SetupDraft>) => void
}

export function SetupScreen4({ draft, data }: Props) {
  const cls = data.classes[draft.classSlug]
  const bg = data.backgrounds[draft.backgroundSlug]

  const classEquipment = cls?.starting_equipment ?? []
  const bgEquipment = bg?.starting_equipment ?? []

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Starting equipment is listed below. You can manage your inventory in detail
        from the character sheet after creation.
      </p>

      <Section title="From Class">
        {cls ? (
          classEquipment.length > 0 ? (
            <ul className="space-y-1">
              {classEquipment.map((item, i) => (
                <li key={i} className="text-sm">{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No equipment data available.</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">Select a class to see starting equipment.</p>
        )}
      </Section>

      <Section title="From Background">
        {bg ? (
          bgEquipment.length > 0 ? (
            <ul className="space-y-1">
              {bgEquipment.map((item, i) => (
                <li key={i} className="text-sm">{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No equipment data available.</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">Select a background to see starting equipment.</p>
        )}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {title}
      </h3>
      {children}
    </div>
  )
}
