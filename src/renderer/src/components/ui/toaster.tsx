import { Toaster as SonnerToaster } from 'sonner'
import { useSettings } from '@renderer/hooks/useSettings'

export function Toaster(): React.JSX.Element {
  const { settings } = useSettings()
  return <SonnerToaster theme={settings.theme} position="bottom-right" richColors closeButton />
}
