/** Left-edge coil binding for the notebook shell (decorative). */
export function SpiralBinding () {
  const coils = 26
  const step = 24
  return (
    <div className="spiral-binding" aria-hidden>
      <div className="spiral-strip">
        {Array.from({ length: coils }, (_, i) => (
          <span key={i} className="spiral-coil" style={{ top: 10 + i * step }} />
        ))}
      </div>
    </div>
  )
}
