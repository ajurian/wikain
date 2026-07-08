import { describeCatalogContract } from "./catalogContract.js";
import { DrizzleCatalog } from "./drizzleCatalog.js";
import { seedLexicalItems } from "./db/seedCatalog.js";
import { makePgliteDb } from "./db/pglite.js";

/** DrizzleCatalog is the sole Catalog implementation (STACK-3); run the shared contract over pglite. */
describeCatalogContract("DrizzleCatalog (pglite)", async (items) => {
  const db = await makePgliteDb();
  await seedLexicalItems(db, items);
  return DrizzleCatalog.hydrate(db);
});
