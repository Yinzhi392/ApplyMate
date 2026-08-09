import { DomainError } from "./domain-error.js";

export const FREE_RESOURCES = [
  "ocr",
  "model",
  "compute_storage",
] as const;

export type FreeResource = (typeof FREE_RESOURCES)[number];
export type ResourceAvailability = Readonly<Record<FreeResource, boolean>>;

export class ResourceGateService {
  constructor(private readonly availability: ResourceAvailability) {}

  unavailableResources(): FreeResource[] {
    return FREE_RESOURCES.filter((resource) => !this.availability[resource]);
  }

  assertAvailable(requirements: readonly FreeResource[]): void {
    for (const resource of new Set(requirements)) {
      if (!this.availability[resource]) {
        throw new DomainError(
          "RESOURCE_PAUSED",
          "A required free resource is temporarily paused.",
          true,
        );
      }
    }
  }
}
