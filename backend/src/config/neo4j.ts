import neo4j from "neo4j-driver";
import fs from "fs";

let neo4jUri = process.env.NEO4J_URI || "bolt://localhost:7687";
if (neo4jUri.includes("://neo4j:") && !fs.existsSync("/.dockerenv")) {
  neo4jUri = neo4jUri.replace("://neo4j:", "://localhost:");
}
const neo4jUser = process.env.NEO4J_USER || "neo4j";
const neo4jPassword = process.env.NEO4J_PASSWORD || "vaic_neo_pass";

export const neo4jDriver = neo4j.driver(
  neo4jUri,
  neo4j.auth.basic(neo4jUser, neo4jPassword)
);

export const getNeo4jSession = () => {
  return neo4jDriver.session({ defaultAccessMode: neo4j.session.WRITE });
};
