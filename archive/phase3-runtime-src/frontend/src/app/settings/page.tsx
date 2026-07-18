import { Badge } from "../../components/primitives/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/primitives/Card";
import { getEvaluationReport, getModelGatewayStatus, getProductionReadiness, statusTone } from "../../lib/api";

export default async function SettingsPage() {
  const [gateway, evaluation, readiness] = await Promise.all([
    getModelGatewayStatus(),
    getEvaluationReport(),
    getProductionReadiness(),
  ]);
  const rows = [
    {
      label: "Runtime evaluation",
      status: evaluation.status === "PASS" ? "PASS" : "FAIL",
      detail: `${evaluation.passed}/${evaluation.checkCount} checks passed`,
    },
    {
      label: "PII masking",
      status: gateway.piiMaskingEnabled ? "PASS" : "FAIL",
      detail: "Masking is enforced before model calls.",
    },
    {
      label: "Rule evidence",
      status: gateway.ruleEvidenceEnabled ? "PASS" : "FAIL",
      detail: `${gateway.ruleEvidenceRetrieval.provider}; vectorReady=${gateway.ruleEvidenceRetrieval.productionReady}`,
    },
    {
      label: "Document ingestion",
      status: gateway.documentIngestion.productionReady ? "PASS" : "WARN",
      detail: `${gateway.documentIngestion.provider}; endpointReady=${gateway.documentIngestion.endpointConfigured}`,
    },
    {
      label: "Model gateway",
      status: gateway.enabled && gateway.configured && !gateway.circuitOpen ? "PASS" : "WARN",
      detail: gateway.enabled && gateway.configured ? gateway.model : "Deterministic fallback active",
    },
    {
      label: "Workflow queue",
      status: gateway.workflowQueue.distributedReady ? "PASS" : "WARN",
      detail: `${gateway.workflowQueue.backend}; broker=${gateway.workflowQueue.brokerType}`,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n900">Governance Readiness</h1>
        <p className="text-sm text-n500 mt-1">Current local controls, fallbacks, and production gaps.</p>
      </div>

      <Card className={readiness.productionGoLiveStatus === "READY" ? "border-success" : "border-warning"}>
        <CardHeader>
          <CardTitle className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            Production Readiness Gate
            <Badge variant={statusTone(readiness.productionGoLiveStatus)}>{readiness.productionGoLiveStatus}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-n300 rounded-sm p-3">
            <p className="text-xs font-semibold text-n500">Local demo score</p>
            <p className="text-2xl font-bold text-n900 mt-1">{readiness.localDemoScore}</p>
          </div>
          <div className="border border-n300 rounded-sm p-3">
            <p className="text-xs font-semibold text-n500">Go-live score now</p>
            <p className="text-2xl font-bold text-n900 mt-1">{readiness.productionGoLiveScore}</p>
          </div>
          <div className="border border-n300 rounded-sm p-3">
            <p className="text-xs font-semibold text-n500">Target after external controls</p>
            <p className="text-2xl font-bold text-n900 mt-1">{readiness.targetScoreAfterExternalControls}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {rows.map((row) => (
          <Card key={row.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-n900">{row.label}</p>
                <Badge variant={statusTone(row.status)}>{row.status}</Badge>
              </div>
              <p className="text-xs text-n500 mt-3">{row.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Go-Live Blockers</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {readiness.blockers.map((blocker) => (
            <div key={blocker.id} className="border border-n300 rounded-sm p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-n900">{blocker.label}</p>
                <Badge variant={statusTone(blocker.status)}>{blocker.status}</Badge>
              </div>
              <p className="text-xs text-n500 mt-2">{blocker.nextAction}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Control Matrix</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {readiness.controls.map((control) => (
            <div key={control.id} className="border border-n300 rounded-sm p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-n900">{control.label}</p>
                <Badge variant={statusTone(control.status)}>{control.status}</Badge>
              </div>
              <p className="text-xs text-n500 mt-2">{control.evidence}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Document Ingestion Gap</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {gateway.documentIngestion.requiredForProduction.map((item) => (
              <li key={item} className="border border-n300 rounded-sm p-3 text-sm text-n700">
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
