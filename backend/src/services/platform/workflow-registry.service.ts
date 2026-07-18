import { pgQuery } from "../../config/pg";
import { ValidationIssue, WorkflowDefinition, WorkflowVersion } from "../../types/platform.types";

export const validateWorkflow = (definition: WorkflowDefinition): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const ids = new Set(definition.nodes.map(node => node.id));
  if(ids.size!==definition.nodes.length) issues.push({code:"INVALID_SCHEMA",message:"Workflow contains duplicate node IDs.",retryable:false});
  const starts = definition.nodes.filter(node => node.type === "start");
  const ends = definition.nodes.filter(node => node.type === "end");
  if (starts.length !== 1) issues.push({ code: "INVALID_SCHEMA", message: "Workflow must contain exactly one start node.", retryable: false });
  if (!ends.length) issues.push({ code: "INVALID_SCHEMA", message: "Workflow must contain at least one end node.", retryable: false });
  for (const edge of definition.edges) if (!ids.has(edge.from) || !ids.has(edge.to)) issues.push({ code: "INVALID_SCHEMA", message: `Edge ${edge.from}->${edge.to} references an unknown node.`, retryable: false });

  if (starts.length === 1) {
    const reachable = new Set<string>(); const queue = [starts[0].id];
    while (queue.length) { const id = queue.shift()!; if (reachable.has(id)) continue; reachable.add(id); definition.edges.filter(e => e.from === id).forEach(e => queue.push(e.to)); }
    const compensationTargets = new Set(definition.nodes.map(node => node.compensationNodeId).filter(Boolean));
    definition.nodes.filter(node => !reachable.has(node.id) && !compensationTargets.has(node.id)).forEach(node => issues.push({ code: "INVALID_SCHEMA", nodeId: node.id, message: "Isolated or unreachable node.", retryable: false }));
    if (!ends.some(node => reachable.has(node.id))) issues.push({ code: "INVALID_SCHEMA", message: "No path exists from start to end.", retryable: false });
  }
  for (const node of definition.nodes) {
    if (node.type === "agent" && !node.outputSchema) issues.push({ code: "INVALID_SCHEMA", nodeId: node.id, message: "Agent output schema is required.", retryable: false });
    if (node.type === "agent" && node.citationRequired !== true) issues.push({ code: "MISSING_CITATION", nodeId: node.id, message: "Business agents must require citations.", retryable: false });
    if (node.retryLimit !== undefined && node.retryLimit < 1) issues.push({ code: "RETRY_EXCEEDED", nodeId: node.id, message: "Retry limit must be bounded and positive.", retryable: false });
    if (node.type === "action" && !node.compensationNodeId) issues.push({ code: "INVALID_SCHEMA", nodeId: node.id, message: "Action requires a compensation node.", retryable: false });
    if(node.type==="action"&&(!node.allowedTools||node.allowedTools.length===0)) issues.push({code:"BUSINESS_RULE_FAILED",nodeId:node.id,message:"Action requires an explicit tool allowlist.",retryable:false});
    if(node.type==="action"&&node.compensationNodeId&&definition.nodes.find(candidate=>candidate.id===node.compensationNodeId)?.type!=="compensation") issues.push({code:"INVALID_SCHEMA",nodeId:node.id,message:"Compensation target must exist and have type compensation.",retryable:false});
    if (node.type === "action" && node.risk === "high") {
      const incomingGate = definition.edges.some(edge => edge.to === node.id && definition.nodes.find(n => n.id === edge.from)?.type === "human_gate");
      if (!incomingGate) issues.push({ code: "BUSINESS_RULE_FAILED", nodeId: node.id, message: "High-risk action requires a directly preceding human gate.", retryable: false });
    }
  }
  const conditionalSources=new Set(definition.edges.filter(edge=>edge.condition).map(edge=>edge.from));
  for(const source of conditionalSources) if(!definition.edges.some(edge=>edge.from===source&&edge.fallback===true)) issues.push({code:"INVALID_SCHEMA",nodeId:source,message:"Conditional routing requires an explicit fallback edge.",retryable:false});
  const visiting=new Set<string>(); const visited=new Set<string>(); const cyclic=new Set<string>();
  const visit=(id:string)=>{if(visiting.has(id)){cyclic.add(id);return;}if(visited.has(id))return;visiting.add(id);for(const edge of definition.edges.filter(item=>item.from===id)){if(visiting.has(edge.to)){cyclic.add(id);cyclic.add(edge.to);}else visit(edge.to);}visiting.delete(id);visited.add(id);};
  definition.nodes.forEach(node=>visit(node.id));
  for(const id of cyclic){const node=definition.nodes.find(candidate=>candidate.id===id);if(!node?.retryLimit)issues.push({code:"RETRY_EXCEEDED",nodeId:id,message:"Nodes participating in a cycle require an explicit retry limit.",retryable:false});}
  return issues;
};

export const createWorkflowVersion = async (definition: WorkflowDefinition, version: string, actor: string): Promise<WorkflowVersion> => {
  if (definition.tenantId === "") throw new Error("tenantId is required");
  const record: WorkflowVersion = { workflowId: definition.id, tenantId: definition.tenantId, version, status: "draft", definition, createdBy: actor, createdAt: new Date().toISOString() };
  await pgQuery(`INSERT INTO workflow_versions (tenant_id, workflow_id, version, status, definition, created_by, created_at) VALUES ($1,$2,$3,'draft',$4,$5,$6)`, [record.tenantId, record.workflowId, record.version, record.definition, actor, record.createdAt]);
  return record;
};

export const publishWorkflowVersion = async (tenantId: string, workflowId: string, version: string, actor: string): Promise<WorkflowVersion> => {
  const found = await pgQuery(`SELECT * FROM workflow_versions WHERE tenant_id=$1 AND workflow_id=$2 AND version=$3`, [tenantId, workflowId, version]);
  if (!found.rows[0]) throw new Error("WORKFLOW_NOT_FOUND");
  const definition = found.rows[0].definition as WorkflowDefinition;
  const issues = validateWorkflow(definition); if (issues.length) throw Object.assign(new Error("WORKFLOW_INVALID"), { issues });
  if (found.rows[0].status !== "draft") throw new Error("WORKFLOW_IMMUTABLE");
  const publishedAt = new Date().toISOString();
  const updated=await pgQuery(`UPDATE workflow_versions SET status='published', published_by=$4, published_at=$5 WHERE tenant_id=$1 AND workflow_id=$2 AND version=$3 AND status='draft' RETURNING workflow_id`, [tenantId, workflowId, version, actor, publishedAt]);
  if(!updated.rows[0]) throw new Error("WORKFLOW_PUBLISH_CONFLICT");
  return { workflowId, tenantId, version, status: "published", definition, createdBy: found.rows[0].created_by, createdAt: found.rows[0].created_at, publishedBy: actor, publishedAt };
};

export const listWorkflowVersions = async (tenantId: string, workflowId: string): Promise<WorkflowVersion[]> => {
  const result = await pgQuery(`SELECT * FROM workflow_versions WHERE tenant_id=$1 AND workflow_id=$2 ORDER BY created_at DESC`, [tenantId, workflowId]);
  return result.rows.map(row => ({ workflowId: row.workflow_id, tenantId: row.tenant_id, version: row.version, status: row.status, definition: row.definition, createdBy: row.created_by, createdAt: row.created_at, publishedBy: row.published_by, publishedAt: row.published_at }));
};

export const getPublishedWorkflow = async (tenantId: string, workflowId: string): Promise<WorkflowVersion | null> => {
  const result = await pgQuery(`SELECT * FROM workflow_versions WHERE tenant_id=$1 AND workflow_id=$2 AND status='published' AND (published_at IS NULL OR published_at<=NOW()) ORDER BY published_at DESC, created_at DESC LIMIT 1`, [tenantId, workflowId]);
  const row=result.rows[0];
  return row ? { workflowId:row.workflow_id,tenantId:row.tenant_id,version:row.version,status:row.status,definition:row.definition,createdBy:row.created_by,createdAt:row.created_at,publishedBy:row.published_by,publishedAt:row.published_at } : null;
};
