import { randomUUID } from "crypto";
import type { X402Service } from "./types";

interface RegisterInput {
  name: string;
  baseUrl: string;
  mcpPath: string;
  description: string;
  categories: string[];
}

interface SearchOptions {
  query?: string;
  categories?: string[];
}

export class RegistryStore {
  private services: Map<string, X402Service> = new Map();

  register(input: RegisterInput): X402Service {
    const service: X402Service = {
      id: randomUUID(),
      ...input,
      verified: false,
      createdAt: new Date(),
    };
    this.services.set(service.id, service);
    return service;
  }

  getById(id: string): X402Service | undefined {
    return this.services.get(id);
  }

  search(options: SearchOptions): X402Service[] {
    let results = Array.from(this.services.values());

    if (options.categories?.length) {
      results = results.filter((s) =>
        s.categories.some((c) => options.categories!.includes(c))
      );
    }

    if (options.query) {
      const q = options.query.toLowerCase();
      results = results.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
      );
    }

    return results;
  }

  listAll(): X402Service[] {
    return Array.from(this.services.values());
  }
}

// Module-level singleton — resets on cold start (in-memory only)
let _registry: RegistryStore | null = null;
export function getRegistry(): RegistryStore {
  if (!_registry) _registry = new RegistryStore();
  return _registry;
}
