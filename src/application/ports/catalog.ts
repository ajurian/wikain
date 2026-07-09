import type { LexicalItem } from "~/domain/lexicalItem.js";

/**
 * Read-only access to the built catalog (spec/12-data-model.md DM-2). Declared by the application;
 * implemented in infrastructure over build/out/items.json.
 */
export interface Catalog {
  get(senseId: string): LexicalItem | undefined;
}
