import { Badge } from '@/components/ui/badge'
import type { DetailItem } from '@/types/detail-item'

interface DetailBodyProps {
  item: DetailItem
}

export function DetailBody({ item }: DetailBodyProps) {
  return (
    <>
      {item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {item.description && (
        <p className="text-sm leading-relaxed">{item.description}</p>
      )}

      {item.sections && item.sections.length > 0 && (
        <dl className="space-y-3">
          {item.sections.map((section, i) => (
            <div key={i}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.label}
              </dt>
              <dd className="text-sm mt-0.5">
                {Array.isArray(section.value)
                  ? section.value.join(', ')
                  : section.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  )
}
