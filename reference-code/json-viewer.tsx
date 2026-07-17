import { CaretDownIcon, CaretRightIcon, CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface JsonRowProps {
  className?: string
  indentClass?: string
  onClick?: () => void
  copyText: string
  children: React.ReactNode
}

function JsonRow({ className, indentClass, onClick, copyText, children }: JsonRowProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      setTimeout(setCopied, 1500, false)
    }
    catch (err) {
      console.error('Failed to copy line:', err)
    }
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        'group/row flex items-center w-full select-none text-[10px] py-[1px] leading-normal font-mono relative',
        indentClass,
        onClick && 'cursor-pointer hover:bg-layout-hover/20',
        className,
      )}
    >
      <div className="flex items-start select-text min-w-0">
        {children}
      </div>
      <button
        onClick={handleCopy}
        className="opacity-0 group-hover/row:opacity-100 ml-1 p-0.5 text-zinc-400 hover:text-layout-primary hover:bg-layout-hover/50 shrink-0 transition-opacity rounded-[2px]"
        title="Copy line"
      >
        {copied
          ? (
              <CheckIcon size={10} className="text-emerald-500" />
            )
          : (
              <CopyIcon size={10} />
            )}
      </button>
    </div>
  )
}

interface JsonNodeProps {
  name?: string | number
  value: any
  depth: number
  globalExpanded: boolean | null
}

function JsonNode({ name, value, depth, globalExpanded }: JsonNodeProps) {
  const isObject = value !== null && typeof value === 'object'
  const isArray = Array.isArray(value)
  const [expanded, setExpanded] = useState(depth < 2)

  useEffect(() => {
    if (globalExpanded !== null) {
      setExpanded(globalExpanded)
    }
  }, [globalExpanded])

  const toggleExpand = () => {
    setExpanded(prev => !prev)
  }

  const renderKey = () => {
    if (name === undefined)
      return null
    if (typeof name === 'number') {
      return (
        <span className="text-zinc-400 dark:text-zinc-500 mr-1.5 font-mono select-none">
          {name}
          :
        </span>
      )
    }
    return (
      <span className="text-blue-600 dark:text-sky-400 font-semibold font-mono mr-1.5 break-all select-none">
        &quot;
        {name}
        &quot;:
      </span>
    )
  }

  const rawKey = name !== undefined ? (typeof name === 'number' ? `${name}: ` : `"${name}": `) : ''

  if (value === null) {
    return (
      <JsonRow indentClass="pl-2.5" copyText={`${rawKey}null`}>
        {renderKey()}
        <span className="text-zinc-400 dark:text-zinc-500">null</span>
      </JsonRow>
    )
  }

  if (value === undefined) {
    return (
      <JsonRow indentClass="pl-2.5" copyText={`${rawKey}undefined`}>
        {renderKey()}
        <span className="text-zinc-400 dark:text-zinc-500">undefined</span>
      </JsonRow>
    )
  }

  if (!isObject) {
    let displayValue = String(value)
    let valueClass = 'text-zinc-800 dark:text-zinc-200'

    if (typeof value === 'string') {
      displayValue = `"${value}"`
      valueClass = 'text-emerald-600 dark:text-emerald-400 break-all'
    }
    else if (typeof value === 'number') {
      valueClass = 'text-amber-600 dark:text-amber-400'
    }
    else if (typeof value === 'boolean') {
      valueClass = 'text-purple-600 dark:text-purple-400'
    }

    return (
      <JsonRow indentClass="pl-2.5" copyText={`${rawKey}${displayValue}`}>
        {renderKey()}
        <span className={cn('select-text', valueClass)}>{displayValue}</span>
      </JsonRow>
    )
  }

  // Handle collapsible Objects & Arrays
  const entries = isArray ? value : Object.entries(value)
  const isEmpty = entries.length === 0

  if (isEmpty) {
    const bracket = isArray ? '[]' : '{}'
    return (
      <JsonRow indentClass="pl-2.5" copyText={`${rawKey}${bracket}`}>
        {renderKey()}
        <span className="text-zinc-500">{bracket}</span>
      </JsonRow>
    )
  }

  const openBracket = isArray ? '[' : '{'
  const closeBracket = isArray ? ']' : '}'
  const collapsedPreview = isArray ? `${entries.length} items` : `${entries.length} keys`
  const headerCopyText = `${rawKey}${JSON.stringify(value, null, 2)}`

  return (
    <div className="w-full flex flex-col items-start leading-normal font-mono">
      {/* Node Header Row */}
      <JsonRow
        onClick={toggleExpand}
        className="py-[1px]"
        copyText={headerCopyText}
      >
        <div className="w-3.5 h-3.5 flex items-center justify-center text-zinc-400 dark:text-zinc-500 group-hover/row:text-text-main shrink-0 mr-0.5 select-none">
          {expanded ? <CaretDownIcon size={10} /> : <CaretRightIcon size={10} />}
        </div>
        {renderKey()}
        <span className="text-zinc-400 dark:text-zinc-500 select-none">
          {openBracket}
          {!expanded && (
            <span className="bg-layout-hover text-[9px] text-text-secondary px-1 py-0 mx-0.5 rounded-sm border border-layout-border/20">
              {collapsedPreview}
            </span>
          )}
          {!expanded && closeBracket}
        </span>
      </JsonRow>

      {/* Expanded Node Body */}
      {expanded && (
        <div className="w-full flex flex-col items-start pl-2.5 ml-0.5">
          {entries.map((item, index) => {
            const key = isArray ? index : (item as [string, any])[0]
            const val = isArray ? item : (item as [string, any])[1]
            return (
              <JsonNode
                key={key}
                name={key}
                value={val}
                depth={depth + 1}
                globalExpanded={globalExpanded}
              />
            )
          })}
        </div>
      )}

      {/* Node Footer Row */}
      {expanded && (
        <JsonRow indentClass="pl-3" copyText={closeBracket}>
          <span className="text-zinc-400 dark:text-zinc-500 select-none">{closeBracket}</span>
        </JsonRow>
      )}
    </div>
  )
}

interface JsonViewerProps {
  data: any
}

export function JsonViewer({ data }: JsonViewerProps) {
  const [globalExpanded, setGlobalExpanded] = useState<boolean | null>(null)
  const [copied, setCopied] = useState(false)

  // Reset global expanded trigger if data changes
  useEffect(() => {
    setGlobalExpanded(null)
  }, [data])

  const handleExpandAll = () => {
    setGlobalExpanded(true)
  }

  const handleCollapseAll = () => {
    setGlobalExpanded(false)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      setCopied(true)
      setTimeout(setCopied, 2000, false)
    }
    catch (err) {
      console.error('Failed to copy JSON:', err)
    }
  }

  return (
    <div className="h-full flex flex-col bg-workbench rounded-none">
      {/* Control bar */}
      <div className="flex items-center justify-between px-2.5 py-1 border-b border-layout-border/30 bg-titlebar/40 shrink-0 text-[9.5px]">
        <div className="flex gap-2">
          <button
            onClick={handleExpandAll}
            className="text-text-secondary hover:text-layout-primary font-mono cursor-pointer transition-colors"
          >
            EXPAND ALL
          </button>
          <span className="text-layout-border/50 font-mono">|</span>
          <button
            onClick={handleCollapseAll}
            className="text-text-secondary hover:text-layout-primary font-mono cursor-pointer transition-colors"
          >
            COLLAPSE ALL
          </button>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-text-secondary hover:text-layout-primary font-mono cursor-pointer transition-colors"
        >
          {copied
            ? (
                <>
                  <CheckIcon size={11} className="text-emerald-500" />
                  <span className="text-emerald-500 font-bold">COPIED!</span>
                </>
              )
            : (
                <>
                  <CopyIcon size={11} />
                  <span>COPY RAW</span>
                </>
              )}
        </button>
      </div>

      {/* JSON content rendering body */}
      <div className="flex-1 overflow-auto p-2 font-mono select-text">
        <JsonNode value={data} depth={0} globalExpanded={globalExpanded} />
      </div>
    </div>
  )
}
