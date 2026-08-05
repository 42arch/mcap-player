import { Input } from '@/components/ui/input'

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  className?: string
  disabled?: boolean
}

export function ColorPicker({
  value = '#ffffff',
  onChange,
  className,
  disabled,
}: ColorPickerProps) {
  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value
    if (val && !val.startsWith('#')) {
      val = `#${val}`
    }
    onChange(val)
  }

  return (
    <div className={`relative flex items-center w-full ${className || ''}`}>
      {/* Embedded Compact Color Swatch with Native Picker */}
      <div className="absolute left-2.5 z-10 size-4 rounded-xs border border-border overflow-hidden shrink-0 cursor-pointer shadow-2xs hover:scale-110 transition-transform">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="absolute -inset-2 w-8 h-8 cursor-pointer opacity-0"
        />
        <div
          className="w-full h-full"
          style={{ backgroundColor: value }}
        />
      </div>

      {/* Hex Text Input with left padding for swatch */}
      <Input
        value={value}
        onChange={handleHexChange}
        disabled={disabled}
        placeholder="#ffffff"
        className="font-mono text-[9px] md:text-[9px] uppercase pl-8 w-full"
      />
    </div>
  )
}
