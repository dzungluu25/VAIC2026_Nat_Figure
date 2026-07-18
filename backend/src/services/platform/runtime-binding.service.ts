import { TenantRuntimeConfig, WorkflowVersion } from "../../types/platform.types";
import { getTenantConfig } from "./tenant-config.service";
import { getPublishedWorkflow } from "./workflow-registry.service";

export interface RuntimeBinding { workflow: WorkflowVersion; config: TenantRuntimeConfig; }
export const resolveRuntimeBinding = async (tenantId: string, workflowId = "loan-pre-approval"): Promise<RuntimeBinding> => {
  const [workflow,config]=await Promise.all([getPublishedWorkflow(tenantId,workflowId),getTenantConfig(tenantId)]);
  if(!workflow) throw new Error(`NO_PUBLISHED_WORKFLOW:${workflowId}`);
  if(!config) throw new Error("NO_EFFECTIVE_TENANT_CONFIG");
  return {workflow,config};
};
