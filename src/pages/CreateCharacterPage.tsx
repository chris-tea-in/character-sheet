import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function CreateCharacterPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-dvh p-4 sm:p-6 max-w-2xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>
      <p className="text-muted-foreground mt-8 text-center">
        Character creation — coming in Step 6.
      </p>
    </div>
  )
}
