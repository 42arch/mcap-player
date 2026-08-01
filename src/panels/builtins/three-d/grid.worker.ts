import { expose, transfer } from 'comlink'
import { parseGrid } from '@/core/parsers/grid-parser'

const api = {
  parse(payload: unknown) {
    const grid = parseGrid(payload)
    return grid ? transfer(grid, [grid.rgba.buffer]) : null
  },
}

expose(api)
