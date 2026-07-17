import app from "./app";
import { config } from "./config/env";

const startServer = () => {
  app.listen(config.port, () => {
    console.log(`Backend server is running on port ${config.port} in ${config.nodeEnv} mode.`);
  });
};

startServer();
