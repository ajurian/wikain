import { describeWordSourceContract } from "./wordSourceContract.js";
import { DrizzleWordSource } from "./drizzleWordSource.js";
import { seedLexicalItems } from "./db/seedCatalog.js";
import { makePgliteDb } from "./db/pglite.js";

/** DrizzleWordSource is the sole WordSource implementation (STACK-3); run the shared contract over pglite. */
describeWordSourceContract("DrizzleWordSource (pglite)", async (items) => {
  const db = await makePgliteDb();
  await seedLexicalItems(db, items);
  return new DrizzleWordSource(db);
});
