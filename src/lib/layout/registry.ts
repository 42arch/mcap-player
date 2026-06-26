import type React from 'react'

export interface PanelRegistration {
  type: string
  title: string
  icon?: React.ComponentType<{ size?: number, className?: string }>
  component: React.ComponentType
}

class PanelRegistry {
  private registry = new Map<string, PanelRegistration>()

  register(registration: PanelRegistration) {
    this.registry.set(registration.type, registration)
  }

  get(type: string): PanelRegistration | undefined {
    return this.registry.get(type)
  }

  getAll(): PanelRegistration[] {
    return Array.from(this.registry.values())
  }
}

export const panelRegistry = new PanelRegistry()
