import { pgQuery } from "@/config/pg";

async function main() {
  try {
    const res = await pgQuery(`SELECT payload FROM tenant_runtime_configs WHERE tenant_id = 'bank-default' AND version = '1.0.0'`);
    if (res.rows[0]) {
      const payload = res.rows[0].payload;
      console.log("Current runtime config:", payload.runtime);
      payload.runtime.timeoutSeconds = 200;
      await pgQuery(`UPDATE tenant_runtime_configs SET payload = $1 WHERE tenant_id = 'bank-default' AND version = '1.0.0'`, [payload]);
      console.log("Successfully updated database tenant config timeoutSeconds to 200!");
    } else {
      console.log("Tenant config 'bank-default/1.0.0' not found in database!");
    }
  } catch (error) {
    console.error("Error updating config in database:", error);
  } finally {
    process.exit(0);
  }
}

main();
