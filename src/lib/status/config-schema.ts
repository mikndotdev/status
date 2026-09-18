export interface GeoLocation {
  lat: number;
  lng: number;
}

export type ServerRole = "hub";

export interface ServerConfigEntry {
  id: string;
  name: string;
  visible: boolean;
  label?: string | null;
  group?: string | null;
  location?: GeoLocation | null;
  role?: ServerRole | null;
}

export interface ServiceConfigEntry {
  id: number;
  name: string;
  visible: boolean;
  label?: string | null;
  group?: string | null;
  server?: string | null;
  icon?: string | null;
}

export interface StatusConfig {
  generatedAt?: string;
  groupOrder?: string[];
  servers: ServerConfigEntry[];
  services: ServiceConfigEntry[];
}

export const EMPTY_CONFIG: StatusConfig = { groupOrder: [], servers: [], services: [] };
