import { pgQuery } from "../../config/pg";
import { supabase } from "../../config/supabase";
import { getNeo4jSession } from "../../config/neo4j";
import { RETAIL_CASES } from "./retail-case-data";
import { setupOrchestrationCheckpointer } from "../orchestration/orchestration-graph";

export const seedDatabases = async () => {
  console.log("=== STARTING DATABASE SEED PROCESS ===");

  try {
    // 1. PostgreSQL Seeding
    console.log("Initializing PostgreSQL Tables...");
    
    // Create retail_cases table
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS retail_cases (
        case_id VARCHAR(50) PRIMARY KEY,
        customer_id VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL
      );
    `);

    // Create orchestration_runs table to persist traces in production
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS orchestration_runs (
        run_id VARCHAR(50) PRIMARY KEY,
        case_id VARCHAR(50),
        prompt TEXT,
        status VARCHAR(50),
        response_payload JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

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

    // Seed retail cases using Supabase SDK. Wrapped in its own try/catch — each agent
    // already falls back to the static RETAIL_CASES dict when this table can't be read,
    // so a Supabase outage/misconfiguration must not cascade and block the independent
    // Neo4j seeding step below.
    try {
      const casesToInsert = Object.values(RETAIL_CASES).map(rCase => ({
        case_id: rCase.caseId,
        customer_id: rCase.customerId,
        payload: rCase
      }));

      if (process.env.SUPABASE_DB_URL) {
        const { error: seedError } = await supabase
          .from("retail_cases")
          .upsert(casesToInsert, { onConflict: "case_id" });

        if (seedError) {
          throw seedError;
        }
      } else {
        for (const rCase of Object.values(RETAIL_CASES)) {
          await pgQuery(
            `INSERT INTO retail_cases (case_id, customer_id, payload) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (case_id) DO UPDATE SET customer_id = EXCLUDED.customer_id, payload = EXCLUDED.payload`,
            [rCase.caseId, rCase.customerId, JSON.stringify(rCase)]
          );
        }
      }
      console.log(`PostgreSQL/Supabase: Seeded ${Object.keys(RETAIL_CASES).length} retail loan cases successfully.`);
    } catch (err) {
      console.error("Database case seed error, continuing with static RETAIL_CASES fallback:", err);
    }

    // 2. Neo4j Seeding
    console.log("Initializing Neo4j Graph Databases...");
    const session = getNeo4jSession();
    
    try {
      // Clear old graph data
      await session.run("MATCH (n) DETACH DELETE n;");
      console.log("Neo4j: Cleared existing nodes and relationships.");

      // Create Regulations & Clauses nodes
      await session.run(`
        CREATE (reg1:Regulation {
          regId: "SBV-Circular-39",
          title: "Thông tư 39/2016/TT-NHNN",
          issuedBy: "Ngân hàng Nhà nước Việt Nam",
          effectiveDate: "2017-03-15"
        })
        
        CREATE (c1:Clause {
          clauseId: "Clause-Insurance-Tying",
          code: "SBV-39-CH-I",
          summary: "Cấm ép bán kèm bảo hiểm",
          description: "Nghiêm cấm tổ chức tín dụng ràng buộc điều kiện mua bảo hiểm nhân thọ liên kết để giải ngân hoặc ưu đãi lãi suất vay của khách hàng.",
          vetoPower: true
        })
        
        CREATE (c2:Clause {
          clauseId: "Clause-Marital-Property",
          code: "SBV-39-CH-II",
          summary: "Tài sản hôn nhân chung",
          description: "Đối với tài sản thế chấp hình thành trong thời kỳ hôn nhân, hợp đồng thế chấp phải có chữ ký của cả hai vợ chồng.",
          vetoPower: false
        })
        
        CREATE (c3:Clause {
          clauseId: "Clause-Future-Property",
          code: "SBV-39-CH-III",
          summary: "Bảo lãnh dự án hình thành tương lai",
          description: "Tài sản mua hình thành trong tương lai yêu cầu chủ đầu tư dự án phải được ngân hàng tài trợ cấp thư bảo lãnh bán nhà hợp lệ.",
          vetoPower: true
        })

        CREATE (c4:Clause {
          clauseId: "Clause-Loan-Purpose",
          code: "SBV-39-CH-IV",
          summary: "Kiểm tra tính hợp pháp của mục đích vay",
          description: "Khách hàng vay vốn phải cam kết sử dụng tiền vay đúng mục đích đăng ký, không sử dụng cho các hoạt động bị pháp luật cấm như rửa tiền, tài trợ khủng bố hoặc đầu tư tài chính trái phép.",
          vetoPower: true
        })

        CREATE (reg1)-[:HAS_CLAUSE]->(c1)
        CREATE (reg1)-[:HAS_CLAUSE]->(c2)
        CREATE (reg1)-[:HAS_CLAUSE]->(c3)
        CREATE (reg1)-[:HAS_CLAUSE]->(c4)

        CREATE (reg2:Regulation {
          regId: "SHB-Retail-Credit-Policy-2026",
          title: "Quy chế cấp tín dụng bán lẻ SHB 2026",
          issuedBy: "Ngân hàng TMCP Sài Gòn - Hà Nội (SHB)",
          effectiveDate: "2026-01-01"
        })

        CREATE (c5:Clause {
          clauseId: "Clause-DTI-Limit",
          code: "SHB-CR-DTI",
          summary: "Giới hạn tỷ lệ nợ trên thu nhập (DTI)",
          description: "Tỷ lệ trả nợ trên thu nhập (DTI - Debt-to-Income) đối với sản phẩm cho vay tiêu dùng/vay mua nhà tối đa không vượt quá 60% thu nhập khả dụng hàng tháng sau khi đã áp dụng hệ số giảm trừ rủi ro (haircut).",
          vetoPower: false
        })

        CREATE (c6:Clause {
          clauseId: "Clause-LTV-Limit",
          code: "SHB-CR-LTV",
          summary: "Giới hạn tỷ lệ cho vay trên giá trị tài sản thế chấp (LTV)",
          description: "Tỷ lệ cho vay trên giá trị tài sản bảo đảm (LTV) tối đa là 80% đối với bất động sản đã hoàn công/đất thổ cư, và tối đa 70% đối với tài sản hình thành trong tương lai/căn hộ dự án.",
          vetoPower: false
        })

        CREATE (c7:Clause {
          clauseId: "Clause-Tenure-Limit",
          code: "SHB-CR-TENURE",
          summary: "Thời hạn cho vay tối đa",
          description: "Thời gian vay tối đa đối với sản phẩm vay mua nhà dự án là 25 năm, vay mua nhà đất thổ cư là 20 năm, và vay mua ô tô tiêu dùng là 8 năm.",
          vetoPower: false
        })

        CREATE (reg2)-[:HAS_CLAUSE]->(c5)
        CREATE (reg2)-[:HAS_CLAUSE]->(c6)
        CREATE (reg2)-[:HAS_CLAUSE]->(c7)

        CREATE (reg3:Regulation {
          regId: "SBV-Circular-11-Debt-Classification",
          title: "Thông tư 11/2021/TT-NHNN về phân loại nợ",
          issuedBy: "Ngân hàng Nhà nước Việt Nam",
          effectiveDate: "2021-12-24"
        })

        CREATE (c8:Clause {
          clauseId: "Clause-CIC-History",
          code: "SBV-11-CH-CIC",
          summary: "Kiểm tra lịch sử tín dụng CIC",
          description: "Khách hàng không được có nợ xấu thuộc Nhóm 3 (Nợ dưới tiêu chuẩn) đến Nhóm 5 (Nợ có khả năng mất vốn) tại bất kỳ tổ chức tín dụng nào trong vòng 24 tháng gần nhất.",
          vetoPower: true
        })

        CREATE (reg3)-[:HAS_CLAUSE]->(c8)
      `);

      // Create Collateral Projects
      await session.run(`
        CREATE (p1:Project {
          projectCode: "VIN-OCEANPARK-3",
          name: "Vinhomes Ocean Park 3",
          developer: "Vingroup",
          isGuaranteedBySHB: true,
          guaranteeContractNo: "SHB-VAP-2025-008"
        })
        
        CREATE (p2:Project {
          projectCode: "GALAXY-DIRTY-PROJECT",
          name: "Galaxy Complex",
          developer: "Galaxy Group",
          isGuaranteedBySHB: false,
          guaranteeContractNo: ""
        })

        WITH p1, p2
        MATCH (c3:Clause {clauseId: "Clause-Future-Property"})
        MATCH (c6:Clause {clauseId: "Clause-LTV-Limit"})

        CREATE (p1)-[:GOVERNED_BY]->(c3)
        CREATE (p2)-[:GOVERNED_BY]->(c3)
        CREATE (p1)-[:GOVERNED_BY]->(c6)
        CREATE (p2)-[:GOVERNED_BY]->(c6)
      `);

      console.log("Neo4j: Seeded policy clauses and property projects graph successfully.");
    } finally {
      await session.close();
    }

    console.log("=== DATABASE SEED PROCESS COMPLETED SUCCESSFULLY ===");
  } catch (error) {
    console.error("Error during database seed process:", error);
    throw error;
  }
};
