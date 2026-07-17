import { getNeo4jSession } from "../../config/neo4j";

export interface ProjectPolicyDetails {
  projectCode: string;
  name: string;
  developer: string;
  isGuaranteedBySHB: boolean;
  guaranteeContractNo: string;
}

export interface RegulationClauseDetails {
  clauseId: string;
  code: string;
  summary: string;
  description: string;
  vetoPower: boolean;
}

/**
 * Service to execute real Neo4j Cypher queries for GraphRAG policy checks
 */
export const queryProjectGuarantee = async (projectCode: string): Promise<ProjectPolicyDetails | null> => {
  const session = getNeo4jSession();
  try {
    const result = await session.run(
      `MATCH (p:Project {projectCode: $projectCode}) 
       RETURN p.projectCode AS projectCode, 
              p.name AS name, 
              p.developer AS developer, 
              p.isGuaranteedBySHB AS isGuaranteedBySHB, 
              p.guaranteeContractNo AS guaranteeContractNo`,
      { projectCode }
    );

    if (result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    return {
      projectCode: record.get("projectCode"),
      name: record.get("name"),
      developer: record.get("developer"),
      isGuaranteedBySHB: record.get("isGuaranteedBySHB"),
      guaranteeContractNo: record.get("guaranteeContractNo"),
    };
  } catch (error) {
    console.error(`Neo4j GraphRAG: Failed to query project guarantee for ${projectCode}:`, error);
    return null;
  } finally {
    await session.close();
  }
};

export const queryRegulationClause = async (clauseId: string): Promise<RegulationClauseDetails | null> => {
  const session = getNeo4jSession();
  try {
    const result = await session.run(
      `MATCH (c:Clause {clauseId: $clauseId}) 
       RETURN c.clauseId AS clauseId, 
              c.code AS code, 
              c.summary AS summary, 
              c.description AS description, 
              c.vetoPower AS vetoPower`,
      { clauseId }
    );

    if (result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    return {
      clauseId: record.get("clauseId"),
      code: record.get("code"),
      summary: record.get("summary"),
      description: record.get("description"),
      vetoPower: record.get("vetoPower"),
    };
  } catch (error) {
    console.error(`Neo4j GraphRAG: Failed to query regulation clause ${clauseId}:`, error);
    return null;
  } finally {
    await session.close();
  }
};
