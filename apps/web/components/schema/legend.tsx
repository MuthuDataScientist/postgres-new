import { DiamondIcon, Fingerprint, Hash, Key } from 'lucide-react'

const SchemaGraphLegend = () => {
  return (
    <div className="border-t flex justify-center p-4 text-xs text-muted-foreground">
      <ul className="flex flex-wrap items-center justify-center gap-4">
        <li className="flex items-center font-mono gap-1">
          <Key size={15} strokeWidth={1.5} className="flex-shrink-0 text-light" />
          Primary key
        </li>
        <li className="flex items-center font-mono gap-1">
          <Hash size={15} strokeWidth={1.5} className="flex-shrink-0 text-light" />
          Identity
        </li>
        <li className="flex items-center font-mono gap-1">
          <Fingerprint size={15} strokeWidth={1.5} className="flex-shrink-0 text-light" />
          Unique
        </li>
        <li className="flex items-center font-mono gap-1">
          <DiamondIcon size={15} strokeWidth={1.5} className="flex-shrink-0 text-light" />
          Nullable
        </li>
        <li className="flex items-center font-mono gap-1">
          <DiamondIcon
            size={15}
            strokeWidth={1.5}
            fill="currentColor"
            className="flex-shrink-0 text-light"
          />
          Non-Nullable
        </li>
      </ul>
    </div>
  )
}

export default SchemaGraphLegend
