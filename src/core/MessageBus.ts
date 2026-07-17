class MessageBus {
  private listeners = new Map<string, Set<(msg: any) => void>>()

  subscribe(topic: string, callback: (msg: any) => void) {
    if (!this.listeners.has(topic)) {
      this.listeners.set(topic, new Set())
    }
    this.listeners.get(topic)!.add(callback)

    return () => {
      const set = this.listeners.get(topic)
      if (set) {
        set.delete(callback)
        if (set.size === 0) {
          this.listeners.delete(topic)
        }
      }
    }
  }

  publish(topic: string, msg: any) {
    const set = this.listeners.get(topic)
    if (set) {
      set.forEach(cb => cb(msg))
    }
  }
}

export const globalMessageBus = new MessageBus()
