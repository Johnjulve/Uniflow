import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface PlaceholderViewProps {
  title: string
  description: string
}

export function PlaceholderView({ title, description }: PlaceholderViewProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Domain Module Initializing</CardTitle>
          <CardDescription>
            This module will be connected in subsequent phase milestones according to the Uniflow Master Plan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            UI primitives and layout ready for domain components.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
