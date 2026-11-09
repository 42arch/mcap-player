import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { memo, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { cn } from '@/lib/utils'

interface JsonRowProps {
  className?: string
  indentClass?: string
  onClick?: () => void
  copyText: string
  children: React.ReactNode
}

const JsonRow = memo(({ className, indentClass, onClick, copyText, children }: JsonRowProps) => {
  const intl = useIntl()
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
        'group/row flex items-center w-full select-none text-[10px] py-px leading-normal font-mono relative',
        indentClass,
        onClick && 'cursor-pointer hover:bg-muted/30',
        className,
      )}
    >
      <div className="flex items-start select-text min-w-0">
        {children}
      </div>
      <button
        onClick={handleCopy}
        className="opacity-0 group-hover/row:opacity-100 ml-1 p-0.5 text-muted-foreground hover:text-primary hover:bg-muted/80 shrink-0 transition-opacity rounded-xs"
        title={intl.formatMessage({ id: 'common.copyLine', defaultMessage: 'Copy line' })}
      >
        {copied
          ? (
              <Check className="w-2.5 h-2.5 text-emerald-500" />
            )
          : (
              <Copy className="w-2.5 h-2.5" />
            )}
      </button>
    </div>
  )
})

interface JsonNodeProps {
  name?: string | number
  value: any
  depth: number
  expandState: 'default' | 'expanded' | 'collapsed'
  binaryFormat: 'placeholder' | 'hex' | 'raw'
}

const JsonNode = memo(({ name, value, depth, expandState, binaryFormat }: JsonNodeProps) => {
  const isObject = value !== null && typeof value === 'object'
  const isArray = Array.isArray(value)
  const [expanded, setExpanded] = useState(() => {
    if (expandState === 'expanded')
      return true
    if (expandState === 'collapsed')
      return false
    return depth < 2
  })

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
      <span className="text-blue-600 dark:text-blue-400 font-semibold font-mono mr-1.5 break-all select-none">
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

  const isBinary = ArrayBuffer.isView(value) || value instanceof ArrayBuffer

  if (!isObject || isBinary) {
    let displayValue = String(value)
    let valueClass = 'text-zinc-800 dark:text-zinc-200'

    if (isBinary) {
      const len = value instanceof ArrayBuffer ? value.byteLength : (value as any).byteLength
      const typeName = value instanceof ArrayBuffer ? 'ArrayBuffer' : value.constructor.name
      const bytes = value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      const preview = Array.from(bytes.subarray(0, 64))
      if (binaryFormat === 'hex') {
        displayValue = `<${typeName}: ${len} bytes [hex: ${preview.map(byte => byte.toString(16).padStart(2, '0')).join(' ')}${len > 64 ? ' ...' : ''}]>`
      }
      else if (binaryFormat === 'raw') {
        displayValue = `<${typeName}: ${len} bytes [values: ${preview.join(', ')}${len > 64 ? ' ...' : ''}]>`
      }
      else {
        displayValue = `<${typeName}: ${len} bytes>`
      }
      valueClass = 'text-zinc-400 dark:text-zinc-500 font-semibold'
    }
    else if (typeof value === 'string') {
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
        className="py-px"
        copyText={headerCopyText}
      >
        <div className="w-3 h-3 flex items-center justify-center text-zinc-400 dark:text-zinc-500 group-hover/row:text-foreground shrink-0 mr-0.5 select-none">
          {expanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
        </div>
        {renderKey()}
        <span className="text-zinc-400 dark:text-zinc-500 select-none">
          {openBracket}
          {!expanded && (
            <span className="bg-muted text-[9px] text-muted-foreground px-1 py-0 mx-0.5 rounded-sm border border-border/20">
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
                expandState={expandState}
                binaryFormat={binaryFormat}
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
})

interface MessageViewerProps {
  data: any
  binaryFormat?: 'placeholder' | 'hex' | 'raw'
}

export function MessageViewer({ data, binaryFormat = 'placeholder' }: MessageViewerProps) {
  const [expandVersion, setExpandVersion] = useState(0)
  const [expandState, setExpandState] = useState<'default' | 'expanded' | 'collapsed'>('default')
  const [copied, setCopied] = useState(false)

  const handleExpandAll = () => {
    setExpandState('expanded')
    setExpandVersion(v => v + 1)
  }

  const handleCollapseAll = () => {
    setExpandState('collapsed')
    setExpandVersion(v => v + 1)
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
    <div className="h-full flex flex-col bg-background rounded-none">
      {/* Control bar */}
      <div className="flex items-center justify-between px-2.5 py-1 border-b border-border bg-muted/20 shrink-0 text-[9.5px]">
        <div className="flex gap-2">
          <button
            onClick={handleExpandAll}
            className="text-muted-foreground hover:text-primary font-mono cursor-pointer transition-colors uppercase"
          >
            <FormattedMessage id="common.expandAll" defaultMessage="EXPAND ALL" />
          </button>
          <span className="text-border/50 font-mono">|</span>
          <button
            onClick={handleCollapseAll}
            className="text-muted-foreground hover:text-primary font-mono cursor-pointer transition-colors uppercase"
          >
            <FormattedMessage id="common.collapseAll" defaultMessage="COLLAPSE ALL" />
          </button>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-muted-foreground hover:text-primary font-mono cursor-pointer transition-colors"
        >
          {copied
            ? (
                <>
                  <Check className="w-2.5 h-2.5 text-emerald-500" />
                  <span className="text-emerald-500 font-bold">
                    <FormattedMessage id="common.copied" defaultMessage="COPIED!" />
                  </span>
                </>
              )
            : (
                <>
                  <Copy className="w-2.5 h-2.5" />
                  <span className="uppercase">
                    <FormattedMessage id="common.copyRaw" defaultMessage="COPY RAW" />
                  </span>
                </>
              )}
        </button>
      </div>

      {/* JSON content rendering body */}
      <div className="flex-1 overflow-auto p-2 font-mono select-text">
        <JsonNode key={expandVersion} value={data} depth={0} expandState={expandState} binaryFormat={binaryFormat} />
      </div>
    </div>
  )
}
