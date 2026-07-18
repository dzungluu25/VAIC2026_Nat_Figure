import assert from "node:assert/strict";
import { roleCan } from "./config/authorization";

assert.equal(roleCan("CUSTOMER", "DOSSIER_VIEW"), true);
assert.equal(roleCan("CUSTOMER", "CIC_UPLOAD"), false);
assert.equal(roleCan("CREDIT_OFFICER", "CIC_UPLOAD"), true);
assert.equal(roleCan("CREDIT_OFFICER", "DOSSIER_REASSIGN"), false);
assert.equal(roleCan("CREDIT_APPROVER", "DOSSIER_REASSIGN"), true);
assert.equal(roleCan("ADMIN", "CHECKLIST_MANAGE"), true);
assert.equal(roleCan("ADMIN", "REVIEW_DECIDE"), false);
assert.equal(roleCan("AUDITOR", "DOSSIER_VIEW"), true);
assert.equal(roleCan("AUDITOR", "DOCUMENT_UPLOAD"), false);

console.log("Authorization role/action matrix tests passed.");
