import dotenv from "dotenv";
import path from "path";
import fs from "fs";

const envCandidates = [
  path.resolve(__dirname, "../../../.env"),
  path.resolve(__dirname, "../../.env"),
  path.resolve(process.cwd(), "../.env"),
  path.resolve(process.cwd(), ".env"),
];

const uniqueCandidates = Array.from(new Set(envCandidates));

for (const candidate of uniqueCandidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate, override: true });
  }
}
