import app from "./app";
import { config } from "./config/env";
import { seedDatabases } from "./services/data/seed-db";
import { assertAuthSecretConfigured } from "./config/auth";
import { assertDemoUsersConfigured } from "./services/auth/demo-user.store";
import { assertFptMarketplaceConfigured } from "./config/fpt-marketplace";
import { createLogger } from "./services/observability/logger";

const logger = createLogger("server");

const startServer = async () => {
  // Fail fast on missing auth secrets/passwords rather than surfacing an obscure
  // error on the first login or approval request.
  assertAuthSecretConfigured();
  assertDemoUsersConfigured();
  assertFptMarketplaceConfigured();

  // Core runtime is fail-closed: serving traffic without migrations, checkpoint tables,
  // workflow/config bindings or governance catalogs would bypass production invariants.
  await seedDatabases();

  app.listen(config.port, () => {
    logger.info("Backend server started", { port: config.port, nodeEnv: config.nodeEnv });
  });
};

startServer();
