import type { MapGeoJsonCollection, MapLocationSample } from './map-types'
import type { MapHistoryMode } from '@/panels/core/types'

export class MapDataStore {
  private locations: MapLocationSample[] = []
  private currentLocation: MapLocationSample | null = null
  private geoJsonByTopic = new Map<string, MapGeoJsonCollection>()

  reset() {
    this.locations = []
    this.currentLocation = null
    this.geoJsonByTopic.clear()
  }

  addLocations(samples: readonly MapLocationSample[], mode: MapHistoryMode, maxPoints: number) {
    if (samples.length === 0) {
      return
    }
    this.currentLocation = samples.at(-1) ?? this.currentLocation
    if (mode === 'latest') {
      this.locations = [this.currentLocation].filter((sample): sample is MapLocationSample => sample !== null)
      return
    }

    this.locations.push(...samples)
    if (this.locations.length > maxPoints) {
      this.locations = this.locations.slice(-maxPoints)
    }
  }

  setGeoJson(topic: string, collection: MapGeoJsonCollection) {
    this.geoJsonByTopic.set(topic, collection)
  }

  getLocations(): readonly MapLocationSample[] {
    return this.locations
  }

  getCurrentLocation(): MapLocationSample | null {
    return this.currentLocation
  }

  getGeoJson(): MapGeoJsonCollection {
    const features = Array.from(this.geoJsonByTopic.values()).flatMap(collection => collection.features)
    return { type: 'FeatureCollection', features }
  }
}
