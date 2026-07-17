import app from "./app";
import { config } from "./config/env";
import { seedDatabases } from "./services/data/seed-db";
import { assertAuthSecretConfigured } from "./config/auth";
import { assertDemoUsersConfigured } from "./services/auth/demo-user.store";
import { assertFptMarketplaceConfigured } from "./config/fpt-marketplace";

const startServer = async () => {
  // Fail fast on missing auth secrets/passwords rather than surfacing an obscure
  // error on the first login or approval request.
  assertAuthSecretConfigured();
  assertDemoUsersConfigured();
  assertFptMarketplaceConfigured();

  try {
    // Run database table setup and Neo4j/Postgres seeds on boot
    await seedDatabases();
  } catch (err) {
    console.error("Database seeding failed. Starting server anyway...", err);
  }

  app.listen(config.port, () => {
    console.log(`Backend server is running on port ${config.port} in ${config.nodeEnv} mode.`);
  });
};

startServer();
