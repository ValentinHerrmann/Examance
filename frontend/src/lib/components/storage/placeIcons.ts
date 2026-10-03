import { faCloud, faHouse, faShuffle } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import type { StorageMode } from "#lib/stores/storagePolicy";

/** One icon per place, shared by the navbar, the storage dialog and the settings page. */
export const placeIcons: Record<"local" | "cloud" | "hybrid", IconDefinition> = {
  local: faHouse,
  cloud: faCloud,
  hybrid: faShuffle,
};

export const dataPlaceIcons: Record<StorageMode, IconDefinition> = {
  "all-local": placeIcons.local,
  "all-server": placeIcons.cloud,
  hybrid: placeIcons.hybrid,
};

export const latexPlaceIcons: Record<"local" | "server", IconDefinition> = {
  local: placeIcons.local,
  server: placeIcons.cloud,
};
