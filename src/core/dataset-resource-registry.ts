type DatasetResourceCleaner = () => void

const cleaners = new Set<DatasetResourceCleaner>()

export function registerDatasetResourceCleaner(cleaner: DatasetResourceCleaner): () => void {
  cleaners.add(cleaner)
  return () => cleaners.delete(cleaner)
}

export function resetDatasetResources(): void {
  for (const cleaner of cleaners) {
    try {
      cleaner()
    }
    catch (error) {
      console.warn('Failed to release dataset resources:', error)
    }
  }
}
