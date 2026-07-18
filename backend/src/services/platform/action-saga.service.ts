import { pgQuery } from "../../config/pg";
import { ActionStepResult, CompensationResult } from "../../types/platform.types";
import { recordAuditEvent } from "../governance/audit-log.service";

export interface PolicyGateInput { tenantId: string; runTenantId: string; workflowAllowsAction: boolean; toolAllowed: boolean; approvalRequired: boolean; approvalGranted: boolean; idempotencyKey: string; }
export const enforcePolicyGate = (input: PolicyGateInput): void => {
  if (input.tenantId !== input.runTenantId) throw new Error("TENANT_MISMATCH");
  if (!input.workflowAllowsAction || !input.toolAllowed) throw new Error("ACTION_NOT_ALLOWED");
  if (input.approvalRequired && !input.approvalGranted) throw new Error("APPROVAL_REQUIRED");
  if (!input.idempotencyKey.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
};

export interface SagaStep { id: string; execute: () => Promise<Record<string, unknown>>; compensate: () => Promise<Record<string, unknown>>; maxAttempts?: number; }
export const executeSaga = async (tenantId: string, runId: string, steps: SagaStep[]): Promise<{ actions: ActionStepResult[]; compensations: CompensationResult[]; manualInterventionRequired: boolean }> => {
  const actions: ActionStepResult[]=[]; const completed: SagaStep[]=[]; const compensations: CompensationResult[]=[];
  for (const step of steps) {
    const key=`${tenantId}:${runId}:${step.id}`;
    const prior=await pgQuery(`SELECT result FROM action_executions WHERE tenant_id=$1 AND idempotency_key=$2 AND status='completed'`,[tenantId,key]);
    if(prior.rows[0]) { actions.push({stepId:step.id,status:"completed",idempotencyKey:key,attempts:0,output:prior.rows[0].result}); completed.push(step); await recordAuditEvent(runId,"saga-executor","tool_call",{tenantId,stepId:step.id,idempotencyKey:key,replayed:true},"allowed","Saga reused an idempotent completed action."); continue; }
    const claimed=await pgQuery(`INSERT INTO action_executions (tenant_id,run_id,step_id,idempotency_key,status,attempts) VALUES ($1,$2,$3,$4,'executing',0) ON CONFLICT (tenant_id,idempotency_key) DO NOTHING RETURNING seq`,[tenantId,runId,step.id,key]);
    if(!claimed.rows[0]){
      const reclaimed=await pgQuery(`UPDATE action_executions SET status='executing',attempts=0,result=NULL WHERE tenant_id=$1 AND idempotency_key=$2 AND status='failed' RETURNING seq`,[tenantId,key]);
      if(!reclaimed.rows[0]) throw new Error(`ACTION_ALREADY_IN_PROGRESS:${step.id}`);
    }
    let error: unknown; const max=step.maxAttempts??1;
    for(let attempt=1;attempt<=max;attempt++) try { const output=await step.execute(); await pgQuery(`UPDATE action_executions SET status='completed',attempts=$3,result=$4 WHERE tenant_id=$1 AND idempotency_key=$2 AND status='executing'`,[tenantId,key,attempt,output]); actions.push({stepId:step.id,status:"completed",idempotencyKey:key,attempts:attempt,output}); completed.push(step); await recordAuditEvent(runId,"saga-executor","tool_call",{tenantId,stepId:step.id,idempotencyKey:key,attempt},"allowed","Saga action completed."); error=undefined; break; } catch(e){ error=e; }
    if(error) { const message=error instanceof Error?error.message:String(error); await pgQuery(`UPDATE action_executions SET status='failed',attempts=$3,result=$4 WHERE tenant_id=$1 AND idempotency_key=$2`,[tenantId,key,max,{error:message}]); actions.push({stepId:step.id,status:"failed",idempotencyKey:key,attempts:max,error:message}); await recordAuditEvent(runId,"saga-executor","tool_call",{tenantId,stepId:step.id,error:message},"blocked","Saga action failed; compensation started."); let manual=false; for(const done of completed.reverse()) try { const output=await done.compensate(); compensations.push({stepId:done.id,status:"completed",output}); await recordAuditEvent(runId,"saga-executor","tool_call",{tenantId,stepId:done.id,compensated:true},"allowed","Saga compensation completed."); } catch(e){ manual=true; const compensationError=e instanceof Error?e.message:String(e); compensations.push({stepId:done.id,status:"failed",error:compensationError}); await recordAuditEvent(runId,"saga-executor","tool_call",{tenantId,stepId:done.id,error:compensationError},"blocked","Saga compensation failed; manual intervention required."); } return {actions,compensations,manualInterventionRequired:manual}; }
  }
  return {actions,compensations,manualInterventionRequired:false};
};
