import { pgQuery } from "../../config/pg";
import { getNeo4jSession } from "../../config/neo4j";
import { setupOrchestrationCheckpointer } from "../orchestration/orchestration-graph";
import { seedLegalKnowledgeGraph } from "./knowledge-graph-seed.service";
import { documentChecklistCatalog, checklistItemsForLoanType } from "../../config/document-checklist";
import { USER_ROLES } from "../../config/authorization";
import { config } from "../../config/env";

const SQL_USER_ROLES = USER_ROLES.map(role => `'${role}'`).join(",");

export const seedDatabases = async () => {
  console.log("=== STARTING DATABASE SEED PROCESS ===");

  try {
    // 1. PostgreSQL Seeding
    console.log("Initializing PostgreSQL Tables...");
    
    // Create retail_cases table
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS retail_cases (
        case_id VARCHAR(50) PRIMARY KEY,
        tenant_id VARCHAR(100) NOT NULL DEFAULT 'bank-default',
        customer_id VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL,
        CONSTRAINT retail_cases_payload_identity_check CHECK (
          jsonb_typeof(payload) = 'object'
          AND payload->>'caseId' = case_id
          AND payload->>'customerId' = customer_id
        )
      );
    `);
    await pgQuery(`ALTER TABLE retail_cases ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(100) NOT NULL DEFAULT 'bank-default';`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_retail_cases_tenant_case ON retail_cases (tenant_id,case_id);`);

    // CREATE TABLE IF NOT EXISTS does not retrofit constraints onto an existing table.
    await pgQuery(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'retail_cases_payload_identity_check'
        ) THEN
          ALTER TABLE retail_cases
          ADD CONSTRAINT retail_cases_payload_identity_check CHECK (
            jsonb_typeof(payload) = 'object'
            AND payload->>'caseId' = case_id
            AND payload->>'customerId' = customer_id
          );
        END IF;
      END $$;
    `);

    // Create orchestration_runs table to persist traces in production
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS orchestration_runs (
        run_id VARCHAR(50) PRIMARY KEY,
        case_id VARCHAR(50),
        prompt TEXT,
        status VARCHAR(50) NOT NULL,
        response_payload JSONB NOT NULL,
        CONSTRAINT orchestration_runs_payload_identity_check CHECK (
          jsonb_typeof(response_payload) = 'object'
          AND response_payload->>'runId' = run_id
        ),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pgQuery(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'orchestration_runs_payload_identity_check'
        ) THEN
          ALTER TABLE orchestration_runs
          ADD CONSTRAINT orchestration_runs_payload_identity_check CHECK (
            jsonb_typeof(response_payload) = 'object'
            AND response_payload->>'runId' = run_id
          );
        END IF;
      END $$;
    `);

    await pgQuery(`ALTER TABLE orchestration_runs ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(100) NOT NULL DEFAULT 'bank-default', ADD COLUMN IF NOT EXISTS workflow_id VARCHAR(100), ADD COLUMN IF NOT EXISTS workflow_version VARCHAR(30), ADD COLUMN IF NOT EXISTS config_version VARCHAR(30), ADD COLUMN IF NOT EXISTS saved_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS saved_by VARCHAR(100);`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_runs_tenant_status ON orchestration_runs (tenant_id,status,created_at DESC);`);
    await pgQuery(`CREATE TABLE IF NOT EXISTS workflow_versions (tenant_id VARCHAR(100) NOT NULL, workflow_id VARCHAR(100) NOT NULL, version VARCHAR(30) NOT NULL, status VARCHAR(20) NOT NULL, definition JSONB NOT NULL, created_by VARCHAR(100) NOT NULL, created_at TIMESTAMPTZ NOT NULL, published_by VARCHAR(100), published_at TIMESTAMPTZ, PRIMARY KEY (tenant_id,workflow_id,version));`);
    await pgQuery(`CREATE OR REPLACE FUNCTION prevent_published_workflow_mutation() RETURNS trigger AS $$ BEGIN IF OLD.status='published' THEN RAISE EXCEPTION 'published workflow versions are immutable'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;`);
    await pgQuery(`DROP TRIGGER IF EXISTS trg_published_workflow_immutable ON workflow_versions;`);
    await pgQuery(`CREATE TRIGGER trg_published_workflow_immutable BEFORE UPDATE OR DELETE ON workflow_versions FOR EACH ROW EXECUTE FUNCTION prevent_published_workflow_mutation();`);
    await pgQuery(`CREATE TABLE IF NOT EXISTS tenant_runtime_configs (tenant_id VARCHAR(100) NOT NULL, version VARCHAR(30) NOT NULL, payload JSONB NOT NULL, effective_from TIMESTAMPTZ NOT NULL, updated_by VARCHAR(100) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (tenant_id,version));`);
    await pgQuery(`CREATE TABLE IF NOT EXISTS approval_records (id UUID PRIMARY KEY, tenant_id VARCHAR(100) NOT NULL, run_id VARCHAR(50) NOT NULL, checkpoint_id VARCHAR(200) NOT NULL, workflow_id VARCHAR(100) NOT NULL, workflow_version VARCHAR(30) NOT NULL, required_role VARCHAR(50) NOT NULL, status VARCHAR(30) NOT NULL, expires_at TIMESTAMPTZ NOT NULL, decided_by VARCHAR(100), decided_at TIMESTAMPTZ, comment TEXT, created_at TIMESTAMPTZ NOT NULL);`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_approvals_tenant_run ON approval_records (tenant_id,run_id,status);`);
    await pgQuery(`CREATE UNIQUE INDEX IF NOT EXISTS uq_approvals_pending_run ON approval_records (tenant_id,run_id) WHERE status='pending';`);
    await pgQuery(`CREATE TABLE IF NOT EXISTS action_executions (seq BIGSERIAL PRIMARY KEY, tenant_id VARCHAR(100) NOT NULL, run_id VARCHAR(50) NOT NULL, step_id VARCHAR(100) NOT NULL, idempotency_key VARCHAR(300) NOT NULL, status VARCHAR(30) NOT NULL, attempts INTEGER NOT NULL, result JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (tenant_id,idempotency_key));`);

    const bootstrapWorkflow = { id:"loan-pre-approval",tenantId:"bank-default",name:"Loan pre-approval",nodes:[{id:"start",type:"start"},{id:"planner",type:"planner"},{id:"credit",type:"agent",outputSchema:{type:"object"},citationRequired:true,retryLimit:2},{id:"human-gate",type:"human_gate"},{id:"action",type:"action",risk:"high",allowedTools:["reserveCreditLimit","createLoanCase","createRmTask","updateCrmStatus","sendRejectionNotification","escalateCreditCommittee"],compensationNodeId:"compensate"},{id:"compensate",type:"compensation"},{id:"end",type:"end"}],edges:[{from:"start",to:"planner"},{from:"planner",to:"credit"},{from:"credit",to:"human-gate",condition:"requiresApproval",fallback:true},{from:"human-gate",to:"action"},{from:"action",to:"end"}] };
    const existingWorkflow = await pgQuery(
      `SELECT 1 FROM workflow_versions WHERE tenant_id = $1 AND workflow_id = $2 AND version = $3`,
      ["bank-default", "loan-pre-approval", "1.2.0"]
    );
    if (existingWorkflow.rowCount === 0) {
      await pgQuery(`INSERT INTO workflow_versions (tenant_id,workflow_id,version,status,definition,created_by,created_at,published_by,published_at) VALUES ('bank-default','loan-pre-approval','1.2.0','published',$1,'system',NOW(),'system',NOW()) ON CONFLICT (tenant_id,workflow_id,version) DO NOTHING`,[bootstrapWorkflow]);
      console.log("Seeded bootstrap workflow_versions row (bank-default/loan-pre-approval/1.2.0).");
    } else {
      console.log("Skipping workflow_versions seed: bank-default/loan-pre-approval/1.2.0 already exists.");
    }

    const bootstrapConfig = {tenantId:"bank-default",version:"1.0.0",thresholds:{minCreditScore:650,maxDti:0.45,maxLtvByPropertyType:{apartment:80,house:70,land:50},minimumMonthlyLivingExpenseVnd:5000000,incomeHaircuts:{salary:1,freelance:0.5,rental:0.7},maximumRepaymentAgeMargin:0,fraud:{incomeDebtRatioCeiling:15,collateralValueToLoanCeiling:6}},runtime:{maxRetriesPerAgent:2,maxSteps:100,maxTokens:50000,timeoutSeconds:90},allowedModels:[config.fptPlannerModel],citationPolicy:{required:true,rejectIfMissing:true,minimumConfidence:0.8,allowedSourceTypes:["LAW","DECREE","CIRCULAR","INTERNAL_POLICY","STANDARD"]},effectiveFrom:"2026-01-01T00:00:00.000Z",updatedBy:"system"};
    const existingConfig = await pgQuery(
      `SELECT 1 FROM tenant_runtime_configs WHERE tenant_id = $1 AND version = $2`,
      ["bank-default", "1.0.0"]
    );
    if (existingConfig.rowCount === 0) {
      await pgQuery(`INSERT INTO tenant_runtime_configs (tenant_id,version,payload,effective_from,updated_by) VALUES ('bank-default','1.0.0',$1,$2,'system') ON CONFLICT (tenant_id,version) DO NOTHING`,[bootstrapConfig,bootstrapConfig.effectiveFrom]);
      console.log("Seeded bootstrap tenant_runtime_configs row (bank-default/1.0.0).");
    } else {
      console.log("Skipping tenant_runtime_configs seed: bank-default/1.0.0 already exists.");
    }

    // Create the append-only, hash-chained audit log table required for regulatory audit trails.
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS audit_events (
        seq BIGSERIAL PRIMARY KEY,
        event_id VARCHAR(60) NOT NULL UNIQUE,
        run_id VARCHAR(50) NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        actor VARCHAR(100) NOT NULL,
        action_type VARCHAR(30) NOT NULL,
        status VARCHAR(20) NOT NULL,
        details TEXT NOT NULL,
        prev_hash CHAR(64) NOT NULL,
        hash CHAR(64) NOT NULL
      );
    `);

    await pgQuery(`
      CREATE INDEX IF NOT EXISTS idx_audit_events_run_id ON audit_events (run_id);
    `);

    // Enforce append-only semantics at the database level: even a compromised app
    // credential cannot rewrite or erase history without first dropping this trigger,
    // which itself would be a distinct, auditable DDL event in Postgres's own logs.
    await pgQuery(`
      CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'audit_events is append-only: % is not permitted', TG_OP;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await pgQuery(`
      DROP TRIGGER IF EXISTS trg_audit_events_immutable ON audit_events;
    `);

    await pgQuery(`
      CREATE TRIGGER trg_audit_events_immutable
      BEFORE UPDATE OR DELETE ON audit_events
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
    `);

    // Create LangGraph's own checkpoint tables so an in-flight orchestration run's
    // graph state survives a server restart/crash instead of being lost.
    await setupOrchestrationCheckpointer();
    console.log("LangGraph: Postgres checkpointer tables ready.");

    // retail_cases starts empty — cases are only ever written by case-extraction.service.ts
    // (LLM extraction from a real credit officer's request), never seeded from fixtures.

    // --- Document intake module (checklist / OCR / dossier review queue) ---
    console.log("Initializing document intake module tables...");

    await pgQuery(`
      CREATE TABLE IF NOT EXISTS document_checklist_versions (
        tenant_id VARCHAR(100) NOT NULL,
        loan_type VARCHAR(20) NOT NULL,
        version VARCHAR(30) NOT NULL,
        status VARCHAR(20) NOT NULL,
        items JSONB NOT NULL,
        created_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        published_by VARCHAR(100),
        published_at TIMESTAMPTZ,
        PRIMARY KEY (tenant_id, loan_type, version)
      );
    `);
    // Publishing a checklist version locks it (see constraint: never silently change a published checklist).
    // Changing requirements always means authoring and publishing a new version instead.
    await pgQuery(`CREATE OR REPLACE FUNCTION prevent_published_checklist_mutation() RETURNS trigger AS $$ BEGIN IF OLD.status='published' THEN RAISE EXCEPTION 'published document checklist versions are immutable'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;`);
    await pgQuery(`DROP TRIGGER IF EXISTS trg_checklist_version_immutable ON document_checklist_versions;`);
    await pgQuery(`CREATE TRIGGER trg_checklist_version_immutable BEFORE UPDATE OR DELETE ON document_checklist_versions FOR EACH ROW EXECUTE FUNCTION prevent_published_checklist_mutation();`);

    // Authorization directory only: passwords/login remain in the existing identity adapter.
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS app_users (
        tenant_id VARCHAR(100) NOT NULL,
        user_id VARCHAR(100) NOT NULL,
        username VARCHAR(100) NOT NULL,
        customer_id VARCHAR(50),
        branch_id VARCHAR(100),
        team_id VARCHAR(100),
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_id,user_id),
        UNIQUE (tenant_id,username)
      );
    `);
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS user_roles (
        tenant_id VARCHAR(100) NOT NULL,
        user_id VARCHAR(100) NOT NULL,
        role VARCHAR(40) NOT NULL CHECK (role IN (${SQL_USER_ROLES})),
        assigned_by VARCHAR(100) NOT NULL,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_id,user_id,role),
        FOREIGN KEY (tenant_id,user_id) REFERENCES app_users(tenant_id,user_id)
      );
    `);
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS user_scope_assignments (
        tenant_id VARCHAR(100) NOT NULL,
        user_id VARCHAR(100) NOT NULL,
        scope_type VARCHAR(20) NOT NULL CHECK (scope_type IN ('TENANT','BRANCH','TEAM','CUSTOMER')),
        scope_ref VARCHAR(100) NOT NULL,
        assigned_by VARCHAR(100) NOT NULL,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_id,user_id,scope_type,scope_ref),
        FOREIGN KEY (tenant_id,user_id) REFERENCES app_users(tenant_id,user_id)
      );
    `);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles (tenant_id,role,user_id);`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_user_scopes_lookup ON user_scope_assignments (tenant_id,scope_type,scope_ref,user_id);`);

    const bootstrapUsers = [
      { userId: "officer.tam", role: "CREDIT_OFFICER", customerId: null, branchId: "branch-default", teamId: "team-credit", scopes: [["BRANCH", "branch-default"], ["TEAM", "team-credit"]] },
      { userId: "demo.officer", role: "CREDIT_OFFICER", customerId: null, branchId: "branch-default", teamId: "team-credit", scopes: [["BRANCH", "branch-default"], ["TEAM", "team-credit"]] },
      { userId: "approver.lan", role: "CREDIT_APPROVER", customerId: null, branchId: "branch-default", teamId: "team-credit", scopes: [["BRANCH", "branch-default"], ["TEAM", "team-credit"]] },
      { userId: "demo.approver", role: "CREDIT_APPROVER", customerId: null, branchId: "branch-default", teamId: "team-credit", scopes: [["BRANCH", "branch-default"], ["TEAM", "team-credit"]] },
      { userId: "customer.demo", role: "CUSTOMER", customerId: "customer-demo", branchId: "branch-default", teamId: "team-credit", scopes: [["CUSTOMER", "customer-demo"]] },
      { userId: "admin.demo", role: "ADMIN", customerId: null, branchId: null, teamId: null, scopes: [["TENANT", "bank-default"]] },
      { userId: "auditor.demo", role: "AUDITOR", customerId: null, branchId: null, teamId: null, scopes: [["TENANT", "bank-default"]] },
    ] as const;
    for (const user of bootstrapUsers) {
      await pgQuery(
        `INSERT INTO app_users (tenant_id,user_id,username,customer_id,branch_id,team_id,status)
         VALUES ('bank-default',$1,$1,$2,$3,$4,'ACTIVE') ON CONFLICT (tenant_id,user_id) DO NOTHING`,
        [user.userId, user.customerId, user.branchId, user.teamId]
      );
      const existingRole = await pgQuery(`SELECT 1 FROM user_roles WHERE tenant_id='bank-default' AND user_id=$1 LIMIT 1`, [user.userId]);
      if (!existingRole.rowCount) {
        await pgQuery(
          `INSERT INTO user_roles (tenant_id,user_id,role,assigned_by) VALUES ('bank-default',$1,$2,'system')`,
          [user.userId, user.role]
        );
      }
      const existingScope = await pgQuery(`SELECT 1 FROM user_scope_assignments WHERE tenant_id='bank-default' AND user_id=$1 LIMIT 1`, [user.userId]);
      if (!existingScope.rowCount) {
        for (const [scopeType, scopeRef] of user.scopes) {
          await pgQuery(
            `INSERT INTO user_scope_assignments (tenant_id,user_id,scope_type,scope_ref,assigned_by)
             VALUES ('bank-default',$1,$2,$3,'system')`,
            [user.userId, scopeType, scopeRef]
          );
        }
      }
    }

    await pgQuery(`
      CREATE TABLE IF NOT EXISTS loan_dossiers (
        dossier_id VARCHAR(50) PRIMARY KEY,
        tenant_id VARCHAR(100) NOT NULL,
        customer_id VARCHAR(50) NOT NULL,
        customer_email TEXT NOT NULL,
        branch_id VARCHAR(100),
        team_id VARCHAR(100),
        case_id VARCHAR(50),
        loan_type VARCHAR(20) NOT NULL,
        checklist_version VARCHAR(30) NOT NULL,
        status VARCHAR(30) NOT NULL CHECK (status IN ('COLLECTING','INCOMPLETE','COMPLETE','QUEUED_FOR_SCORING','SCORED','PENDING_REVIEW','APPROVED','REJECTED','NEEDS_MORE_INFO','PENDING_CIC')),
        created_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    // CREATE TABLE IF NOT EXISTS does not retrofit a widened CHECK onto an already-existing table
    // (adding PENDING_CIC — the "chờ chuyên viên bổ sung CIC" state) — drop/recreate is idempotent.
    await pgQuery(`ALTER TABLE loan_dossiers DROP CONSTRAINT IF EXISTS loan_dossiers_status_check;`);
    await pgQuery(`ALTER TABLE loan_dossiers ADD CONSTRAINT loan_dossiers_status_check CHECK (status IN ('COLLECTING','INCOMPLETE','COMPLETE','QUEUED_FOR_SCORING','SCORED','PENDING_REVIEW','APPROVED','REJECTED','NEEDS_MORE_INFO','PENDING_CIC'));`);
    await pgQuery(`ALTER TABLE loan_dossiers ADD COLUMN IF NOT EXISTS run_id VARCHAR(50);`);
    await pgQuery(`CREATE UNIQUE INDEX IF NOT EXISTS uq_loan_dossiers_run ON loan_dossiers (run_id) WHERE run_id IS NOT NULL;`);
    await pgQuery(`ALTER TABLE loan_dossiers ADD COLUMN IF NOT EXISTS branch_id VARCHAR(100);`);
    await pgQuery(`ALTER TABLE loan_dossiers ADD COLUMN IF NOT EXISTS team_id VARCHAR(100);`);
    await pgQuery(`UPDATE loan_dossiers SET branch_id=COALESCE(branch_id,'branch-default'),team_id=COALESCE(team_id,'team-credit') WHERE tenant_id='bank-default' AND (branch_id IS NULL OR team_id IS NULL);`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_dossiers_tenant_status ON loan_dossiers (tenant_id,status,created_at DESC);`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_dossiers_org_scope ON loan_dossiers (tenant_id,branch_id,team_id,updated_at DESC);`);

    await pgQuery(`
      CREATE TABLE IF NOT EXISTS dossier_documents (
        document_id VARCHAR(50) PRIMARY KEY,
        dossier_id VARCHAR(50) NOT NULL REFERENCES loan_dossiers(dossier_id),
        tenant_id VARCHAR(100) NOT NULL,
        document_type VARCHAR(100) NOT NULL,
        storage_path TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        uploaded_by VARCHAR(100) NOT NULL,
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status VARCHAR(30) NOT NULL CHECK (status IN ('UPLOADED','FORM_REJECTED','FORM_ACCEPTED','OCR_PENDING','OCR_NEEDS_REVIEW','OCR_COMPLETE','OCR_FAILED'))
      );
    `);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_dossier_documents_dossier ON dossier_documents (dossier_id,document_type,uploaded_at DESC);`);

    // Separate log table for form-mismatch failures (task requires this luồng lỗi stays distinct from OCR issues below).
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS document_form_validation_log (
        id BIGSERIAL PRIMARY KEY,
        document_id VARCHAR(50) NOT NULL REFERENCES dossier_documents(document_id),
        tenant_id VARCHAR(100) NOT NULL,
        passed BOOLEAN NOT NULL,
        reason TEXT,
        checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_form_validation_log_document ON document_form_validation_log (document_id);`);

    // Separate table for OCR extraction outcomes (missing fields / low confidence) — never merged with form-validation failures above.
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS document_ocr_results (
        id UUID PRIMARY KEY,
        document_id VARCHAR(50) NOT NULL REFERENCES dossier_documents(document_id),
        tenant_id VARCHAR(100) NOT NULL,
        extracted_fields JSONB NOT NULL,
        field_confidence JSONB NOT NULL,
        overall_confidence NUMERIC NOT NULL,
        missing_required_fields JSONB NOT NULL,
        engine VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_ocr_results_document ON document_ocr_results (document_id,created_at DESC);`);

    // CIC is deliberately NOT part of dossier_documents/document_ocr_results: it must never enter
    // through the customer OCR/form-validation pipeline. A staff member types in what they read off
    // the CIC lookup themselves (uploaded_by_role is a literal constant, not derived from any role
    // lookup — this system has no customer account to compare against, see audit). Append-only, same
    // as dossier_documents, so a correction never erases the previous staff entry.
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS dossier_cic_reports (
        id UUID PRIMARY KEY,
        dossier_id VARCHAR(50) NOT NULL REFERENCES loan_dossiers(dossier_id),
        tenant_id VARCHAR(100) NOT NULL,
        storage_path TEXT,
        original_filename TEXT,
        credit_score TEXT NOT NULL,
        total_outstanding_debt TEXT NOT NULL,
        debt_group TEXT NOT NULL,
        report_date TEXT NOT NULL,
        notes TEXT,
        uploaded_by_role VARCHAR(20) NOT NULL DEFAULT 'STAFF' CHECK (uploaded_by_role = 'STAFF'),
        uploaded_by VARCHAR(100) NOT NULL,
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_cic_reports_dossier ON dossier_cic_reports (dossier_id,uploaded_at DESC);`);

    await pgQuery(`
      CREATE TABLE IF NOT EXISTS dossier_missing_document_notices (
        id UUID PRIMARY KEY,
        dossier_id VARCHAR(50) NOT NULL REFERENCES loan_dossiers(dossier_id),
        tenant_id VARCHAR(100) NOT NULL,
        missing_document_types JSONB NOT NULL,
        recipient_email TEXT NOT NULL,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status VARCHAR(20) NOT NULL CHECK (status IN ('sent','failed')),
        error TEXT
      );
    `);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_missing_notices_dossier ON dossier_missing_document_notices (dossier_id,sent_at DESC);`);

    // In-app notification inbox. A notice targets either a staff user (recipient_user_id) or a
    // customer (recipient_customer_id) — the same dossier event can reach both audiences via
    // separate rows. This is the on-screen counterpart to the email side-channel.
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY,
        tenant_id VARCHAR(100) NOT NULL,
        recipient_user_id VARCHAR(100),
        recipient_customer_id VARCHAR(100),
        category VARCHAR(40) NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        dossier_id VARCHAR(50) REFERENCES loan_dossiers(dossier_id),
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (recipient_user_id IS NOT NULL OR recipient_customer_id IS NOT NULL)
      );
    `);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (tenant_id,recipient_user_id,created_at DESC);`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_notifications_customer ON notifications (tenant_id,recipient_customer_id,created_at DESC);`);

    // DB-backed queue (this repo has no external broker) — dossiers become eligible for
    // preliminary scoring the moment checklist-completeness marks them COMPLETE.
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS scoring_queue (
        id UUID PRIMARY KEY,
        dossier_id VARCHAR(50) NOT NULL REFERENCES loan_dossiers(dossier_id),
        tenant_id VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL CHECK (status IN ('queued','scored','failed')),
        enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        scored_at TIMESTAMPTZ,
        score_result JSONB
      );
    `);
    await pgQuery(`CREATE UNIQUE INDEX IF NOT EXISTS uq_scoring_queue_dossier ON scoring_queue (dossier_id);`);

    await pgQuery(`
      CREATE TABLE IF NOT EXISTS dossier_review_assignments (
        dossier_id VARCHAR(50) PRIMARY KEY REFERENCES loan_dossiers(dossier_id),
        tenant_id VARCHAR(100) NOT NULL,
        assigned_officer VARCHAR(100) NOT NULL,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_review_assignments_officer ON dossier_review_assignments (tenant_id,assigned_officer);`);

    await pgQuery(`
      CREATE TABLE IF NOT EXISTS dossier_review_decisions (
        id UUID PRIMARY KEY,
        dossier_id VARCHAR(50) NOT NULL REFERENCES loan_dossiers(dossier_id),
        tenant_id VARCHAR(100) NOT NULL,
        reviewer VARCHAR(100) NOT NULL,
        decision VARCHAR(20) NOT NULL CHECK (decision IN ('approved','rejected','more_info')),
        comment TEXT,
        decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_review_decisions_dossier ON dossier_review_decisions (dossier_id,decided_at DESC);`);
    // Approved dossiers carry the offered product terms (free text entered by the approver).
    await pgQuery(`ALTER TABLE dossier_review_decisions ADD COLUMN IF NOT EXISTS product_terms TEXT;`);

    // Seed the default checklist as an already-published v1.0.0 per loan type so the intake
    // API has something to enforce from boot. Publishing a *new* version is the only way to
    // change it afterward — this seed insert never runs again once the row exists (DO NOTHING).
    for (const loanType of documentChecklistCatalog.loanTypes) {
      const items = checklistItemsForLoanType(loanType);
      await pgQuery(
        `INSERT INTO document_checklist_versions (tenant_id,loan_type,version,status,items,created_by,created_at,published_by,published_at)
         VALUES ('bank-default',$1,$2,'published',$3,'system',NOW(),'system',NOW()) ON CONFLICT (tenant_id,loan_type,version) DO NOTHING`,
        [loanType, documentChecklistCatalog.version, JSON.stringify(items)]
      );
    }
    console.log("Document intake module: checklist/dossier/OCR/review tables ready.");

    // 2. Neo4j Seeding
    console.log("Initializing Neo4j Graph Databases...");
    const session = getNeo4jSession();

    try {
      // The versioned graph catalog is merged instead of clearing Neo4j on every boot.
      // This preserves externally curated nodes while keeping application-owned nodes
      // and relationships idempotently up to date. Collateral Project nodes are not
      // seeded here — they must be registered from real project guarantee data as
      // loan applications reference them (see policy-rag.service.ts queryProjectGuarantee).
      await seedLegalKnowledgeGraph(session);

      console.log("Neo4j: Seeded versioned documents, clauses, policy rules and gates successfully.");
    } finally {
      await session.close();
    }

    console.log("=== DATABASE SEED PROCESS COMPLETED SUCCESSFULLY ===");
  } catch (error) {
    console.error("Error during database seed process:", error);
    throw error;
  }
};
