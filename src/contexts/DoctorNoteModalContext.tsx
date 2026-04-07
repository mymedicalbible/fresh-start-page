import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { DoctorNoteModal } from '../components/DoctorNoteModal'

type OpenOpts = { doctorId?: string | null }

type DoctorNoteModalContextValue = {
  openNoteModal: (opts?: OpenOpts) => void
  closeNoteModal: () => void
}

const DoctorNoteModalContext = createContext<DoctorNoteModalContextValue | null>(null)

export function DoctorNoteModalProvider ({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [initialDoctorId, setInitialDoctorId] = useState<string | null>(null)

  const openNoteModal = useCallback((opts?: OpenOpts) => {
    setInitialDoctorId(opts?.doctorId ?? null)
    setOpen(true)
  }, [])

  const closeNoteModal = useCallback(() => {
    setOpen(false)
    setInitialDoctorId(null)
  }, [])

  const value = useMemo(
    () => ({ openNoteModal, closeNoteModal }),
    [openNoteModal, closeNoteModal],
  )

  return (
    <DoctorNoteModalContext.Provider value={value}>
      {children}
      <DoctorNoteModal
        open={open}
        initialDoctorId={initialDoctorId}
        onClose={closeNoteModal}
      />
    </DoctorNoteModalContext.Provider>
  )
}

export function useDoctorNoteModal () {
  const ctx = useContext(DoctorNoteModalContext)
  if (!ctx) {
    throw new Error('useDoctorNoteModal must be used within DoctorNoteModalProvider')
  }
  return ctx
}
