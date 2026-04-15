'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Map as MapIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { EntityPlaceMap, EntityPlaceMapPin } from '@/types';

const LIGHT_TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors &copy; CARTO';

type LeafletModule = typeof import('leaflet');

let leafletRuntimePromise: Promise<LeafletModule> | null = null;

async function loadLeafletRuntime(): Promise<LeafletModule> {
  const globalLeaflet = globalThis as typeof globalThis & {
    L?: LeafletModule;
  };

  if (globalLeaflet.L && typeof globalLeaflet.L.markerClusterGroup === 'function') {
    return globalLeaflet.L;
  }

  if (!leafletRuntimePromise) {
    leafletRuntimePromise = (async () => {
      const leafletModule = await import('leaflet');
      const sharedLeaflet = globalLeaflet.L ?? ({ ...leafletModule } as LeafletModule);

      Object.assign(sharedLeaflet, leafletModule);
      globalLeaflet.L = sharedLeaflet;

      await import('leaflet.markercluster');

      if (typeof globalLeaflet.L?.markerClusterGroup !== 'function') {
        throw new Error('Leaflet markercluster failed to initialize');
      }

      return globalLeaflet.L;
    })().catch((error) => {
      leafletRuntimePromise = null;
      throw error;
    });
  }

  return leafletRuntimePromise;
}

function MapSkeleton() {
  return (
    <div
      className="flex h-80 items-center justify-center rounded-2xl animate-pulse"
      style={{ backgroundColor: 'var(--surface-muted)' }}
    >
      <MapIcon className="h-16 w-16 opacity-10 text-gray-600 dark:text-white" />
    </div>
  );
}

function formatPinCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

function createPinIcon(
  leaflet: LeafletModule,
  pin: EntityPlaceMapPin,
  isSelected: boolean,
): ReturnType<LeafletModule['divIcon']> {
  return leaflet.divIcon({
    className: 'relation-map-pin-icon',
    html: `<div class="relation-map-pin${isSelected ? ' relation-map-pin--selected' : ''}"><span class="relation-map-pin__count">${formatPinCount(pin.count)}</span></div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    tooltipAnchor: [0, -28],
  });
}

function createClusterIcon(
  leaflet: LeafletModule,
  cluster: import('leaflet').MarkerCluster,
): ReturnType<LeafletModule['divIcon']> {
  return leaflet.divIcon({
    className: 'marker-cluster relation-map-cluster-icon',
    html: `<div class="relation-map-cluster"><span class="relation-map-cluster__count">${cluster.getChildCount()}</span></div>`,
    iconSize: [52, 52],
    iconAnchor: [26, 26],
  });
}

function LeafletCanvas({
  graph,
  onNodeClick,
  actionLabel,
}: {
  graph: EntityPlaceMap;
  onNodeClick: (label: string, category: 'places') => void;
  actionLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const markersRef = useRef<Map<string, import('leaflet').Marker>>(new Map());
  const pinLookupRef = useRef<Map<string, EntityPlaceMapPin>>(new Map());
  const [selectedPin, setSelectedPin] = useState<EntityPlaceMapPin | null>(null);
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const syncTheme = () => setIsDark(root.classList.contains('dark'));

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    setSelectedPin((current) => {
      if (!current) return null;
      return graph.pins.find((pin) => pin.id === current.id) ?? null;
    });
  }, [graph]);

  useEffect(() => {
    if (!containerRef.current || graph.pins.length === 0) return;

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    const timers: number[] = [];

    const init = async () => {
      const leaflet = await loadLeafletRuntime();

      if (cancelled || !containerRef.current) return;

      leafletRef.current = leaflet;
      pinLookupRef.current = new Map(graph.pins.map((pin) => [pin.id, pin]));

      const map = leaflet.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
        worldCopyJump: true,
      });
      mapRef.current = map;

      leaflet
        .tileLayer(isDark ? DARK_TILE_URL : LIGHT_TILE_URL, {
          attribution: TILE_ATTRIBUTION,
          maxZoom: 20,
          subdomains: 'abcd',
        })
        .addTo(map);

      const bounds = leaflet.latLngBounds([]);
      const clusterGroup = leaflet.markerClusterGroup({
        iconCreateFunction: (cluster) => createClusterIcon(leaflet, cluster),
        maxClusterRadius: 42,
        removeOutsideVisibleBounds: true,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        spiderLegPolylineOptions: {
          color: isDark ? '#f3df79' : '#a3891f',
          opacity: 0.72,
          weight: 1.5,
        },
        zoomToBoundsOnClick: true,
      });

      markersRef.current.clear();
      for (const pin of graph.pins) {
        const marker = leaflet.marker([pin.latitude, pin.longitude], {
          bubblingMouseEvents: false,
          icon: createPinIcon(leaflet, pin, selectedPin?.id === pin.id),
          keyboard: true,
          riseOnHover: true,
          title: pin.label,
        });

        marker.bindTooltip(`${pin.label} · ${pin.count}`, {
          direction: 'top',
          offset: [0, -36],
        });
        marker.on('click', (event: import('leaflet').LeafletMouseEvent) => {
          leaflet.DomEvent.stopPropagation(event.originalEvent);
          const originalPin = pinLookupRef.current.get(pin.id) ?? pin;
          setSelectedPin(originalPin);
        });
        clusterGroup.addLayer(marker);
        markersRef.current.set(pin.id, marker);
        bounds.extend([pin.latitude, pin.longitude]);
      }

      clusterGroup.addTo(map);
      clusterGroup.on('clusterclick', () => {
        setSelectedPin(null);
      });

      map.on('click', () => setSelectedPin(null));

      if (graph.pins.length === 1) {
        map.setView([graph.pins[0].latitude, graph.pins[0].longitude], 5);
      } else {
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 5 });
      }

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          map.invalidateSize(false);
        });
        resizeObserver.observe(containerRef.current);
      }

      requestAnimationFrame(() => {
        map.invalidateSize(false);
      });
      timers.push(
        window.setTimeout(() => map.invalidateSize(false), 120),
        window.setTimeout(() => map.invalidateSize(false), 320),
      );
    };

    void init().catch((error) => {
      if (cancelled) return;
      console.error('[relation-map] failed to initialize map:', error);
    });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
      markersRef.current.forEach((marker) => marker.off());
      markersRef.current.clear();
      pinLookupRef.current.clear();
      if (mapRef.current) {
        mapRef.current.off();
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [graph, isDark]);

  useEffect(() => {
    const leaflet = leafletRef.current;
    if (!leaflet) return;

    for (const [id, marker] of markersRef.current) {
      const pin = pinLookupRef.current.get(id);
      if (!pin) continue;
      const isSelected = selectedPin?.id === id;
      marker.setIcon(createPinIcon(leaflet, pin, isSelected));
      marker.setZIndexOffset(isSelected ? 1000 : 0);
    }
  }, [selectedPin]);

  return (
    <div className="relative h-full w-full">
      {selectedPin ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 z-1000 flex justify-center px-3">
          <Button
            type="button"
            size="sm"
            onClick={() => onNodeClick(selectedPin.label, 'places')}
            className="pointer-events-auto border border-[#efd957]/80 bg-white/95 text-gray-900 shadow-sm backdrop-blur hover:bg-[#fff4b0] dark:bg-gray-900/95 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            {actionLabel}
          </Button>
        </div>
      ) : null}
      <div
        ref={containerRef}
        className="relation-map-canvas h-full w-full rounded-2xl overflow-hidden"
        aria-label="Entity place map"
      />
    </div>
  );
}

export interface RelationMapChartProps {
  graph: EntityPlaceMap | null;
  loading: boolean;
  generating: boolean;
  isActive?: boolean;
  onGenerate: () => void;
  onNodeClick: (label: string, category: 'places') => void;
  translations: {
    mapGenerate: string;
    mapNoGraph: string;
    mapNoGraphDesc: string;
    mapGeneratedOn: string;
    mapTotalEmails: string;
    mapPinClick: string;
    openRelatedEmails: string;
  };
}

export function RelationMapChart({
  graph,
  loading,
  generating,
  isActive = true,
  onGenerate,
  onNodeClick,
  translations: tr,
}: RelationMapChartProps) {
  const formattedDate = graph?.generatedAt ? new Date(graph.generatedAt).toLocaleString() : null;
  const isEmpty = graph && graph.pins.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          {graph && !isEmpty && formattedDate && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {tr.mapGeneratedOn.replace('{date}', formattedDate)}
              {' · '}
              {tr.mapTotalEmails.replace('{count}', String(graph.totalEmails))}
            </p>
          )}
        </div>
      </div>

      {loading && <MapSkeleton />}

      {!loading && !graph && !generating && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
          <MapIcon className="h-12 w-12 text-gray-300 dark:text-gray-600" />
          <div className="text-center">
            <p className="text-base font-medium text-gray-600 dark:text-gray-400">
              {tr.mapNoGraph}
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 max-w-xs mx-auto">
              {tr.mapNoGraphDesc}
            </p>
          </div>
          <Button
            onClick={onGenerate}
            className="bg-[#efd957] hover:bg-[#e8cf3c] text-black border-0"
          >
            <MapIcon className="h-4 w-4" />
            {tr.mapGenerate}
          </Button>
        </div>
      )}

      {!loading && generating && !graph && <MapSkeleton />}

      {!loading && graph && isEmpty && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
          <AlertCircle className="h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{tr.mapNoGraph}</p>
        </div>
      )}

      {!loading && graph && !isEmpty && (
        <>
          <div className="h-[calc(50vh-120px)] sm:h-125">
            {isActive ? (
              <LeafletCanvas
                graph={graph}
                onNodeClick={onNodeClick}
                actionLabel={tr.openRelatedEmails}
              />
            ) : null}
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
            <span className="text-xs text-gray-400 dark:text-gray-500">{tr.mapPinClick}</span>
          </div>
        </>
      )}
    </div>
  );
}

export function RelationMapChartFullPageContent({
  graph,
  onNodeClick,
  translations: tr,
}: {
  graph: EntityPlaceMap;
  onNodeClick: (label: string, category: 'places') => void;
  translations: Pick<RelationMapChartProps['translations'], 'mapPinClick' | 'openRelatedEmails'>;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 min-h-0">
        <LeafletCanvas graph={graph} onNodeClick={onNodeClick} actionLabel={tr.openRelatedEmails} />
      </div>
      <div className="shrink-0 px-6 py-3 border-t border-gray-200 dark:border-gray-800">
        <span className="text-xs text-gray-400 dark:text-gray-500">{tr.mapPinClick}</span>
      </div>
    </div>
  );
}
