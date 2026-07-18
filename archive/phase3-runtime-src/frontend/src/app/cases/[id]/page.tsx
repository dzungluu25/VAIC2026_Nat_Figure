import Link from "next/link";
import { ApprovalActions } from "../../../components/ApprovalActions";
import { Badge } from "../../../components/primitives/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/primitives/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/primitives/Table";
import { formatValue, getRequestGovernance, runCase, statusTone } from "../../../lib/api";

const KeyValueGrid = ({ data }: { data: object }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {Object.entries(data as Record<string, unknown>).map(([key, value]) => (
      <div key={key} className="border border-n300 rounded-sm p-3">
        <p className="text-xs font-semibold text-n500 mb-1">{key}</p>
        <p className="text-sm font-semibold text-n900 break-words">{formatValue(value)}</p>
      </div>
    ))}
  </div>
);

const TraceItem = ({ agent, task, summary, status, toolCount }: {
  agent: string;
  task: string;
  summary: string;
  status: string;
  toolCount: number;
}) => (
  <div className="flex gap-4 border-l-2 border-n300 pl-4 py-3 relative">
    <div className="absolute w-3 h-3 rounded-full bg-n300 -left-[7px] top-5 border-2 border-n100" />
    <div className="flex-1">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <span className="font-semibold text-sm text-n900">{agent}</span>
        <Badge variant={statusTone(status)}>{status}</Badge>
      </div>
      <p className="text-sm text-n900 mt-2">{task}</p>
      <p className="text-sm text-n700 mt-1">{summary}</p>
      <p className="text-xs text-n500 mt-2">{toolCount} tool call(s)</p>
    </div>
  </div>
);

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await runCase(id);
  const governance = await getRequestGovernance(run.requestId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/cases" className="text-sm font-medium text-n500 hover:text-n900">
          Back to cases
        </Link>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge variant={statusTone(run.gateStatus)}>{run.gateStatus}</Badge>
            <Badge variant={statusTone(run.approvalRoute)}>{run.approvalRoute}</Badge>
            <Badge variant={statusTone(run.status)}>{run.status}</Badge>
          </div>
          <h1 className="text-2xl font-bold text-n900">{run.title}</h1>
          <p className="text-sm text-n500 mt-1 font-mono">{run.caseId} / {run.requestId}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Decision Summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-n700 leading-relaxed">{governance.decision.narrative}</p>
              <KeyValueGrid data={run.systemProposal} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Customer Request</CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValueGrid data={run.customerRequest} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Agent Trace</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-0 p-6 pt-2">
              {run.traces.map((trace) => (
                <TraceItem
                  key={trace.id}
                  agent={trace.agent}
                  task={trace.task}
                  summary={trace.summary}
                  status={trace.status}
                  toolCount={trace.toolCalls.length}
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Execution Actions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tool</TableHead>
                    <TableHead>Side Effect</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Guard</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {run.executionActions.map((action) => (
                    <TableRow key={`${action.tool}-${action.status}`}>
                      <TableCell className="font-mono text-xs">{action.tool}</TableCell>
                      <TableCell>{action.sideEffect}</TableCell>
                      <TableCell>
                        <Badge variant={statusTone(action.status)}>{action.status}</Badge>
                      </TableCell>
                      <TableCell>{action.requiresApprovalToken ? "approval token" : "none"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card className="border-warning bg-orange-50">
            <CardHeader className="border-orange-200">
              <CardTitle className="flex items-center justify-between gap-3 text-warning">
                Compliance Gate
                <Badge variant={statusTone(run.gateStatus)}>{run.gateStatus}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <p className="text-sm text-n700 leading-relaxed">{run.finalAnswer}</p>
              <div className="border-t border-orange-200 pt-4">
                <ApprovalActions
                  requestId={run.requestId}
                  approvalIntent={governance.approvalReadiness.approvalIntent}
                  readyForApproval={governance.approvalReadiness.readyForApproval}
                />
              </div>
              <p className="text-xs text-n500 font-mono break-all">
                {governance.approvalReadiness.approvalIntent}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Governance Controls</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {governance.controls.map((control) => (
                <div key={control.id} className="border border-n300 rounded-sm p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-n900">{control.label}</span>
                    <Badge variant={statusTone(control.status)}>{control.status}</Badge>
                  </div>
                  <p className="text-xs text-n500 mt-2">{control.evidence}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reviewer Checklist</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-3">
                {governance.reviewerChecklist.map((item) => (
                  <li key={item} className="text-sm text-n700 border-l-2 border-n300 pl-3">
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Document Provenance</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {governance.documentEvidence.length === 0 && (
                <p className="text-sm text-n500">No parsed document provenance is attached.</p>
              )}
              {governance.documentEvidence.map((document) => (
                <div key={document.documentId} className="border border-n300 rounded-sm p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs font-semibold text-n900">{document.documentName}</span>
                    <Badge variant={statusTone(document.status)}>{document.status}</Badge>
                  </div>
                  <p className="text-xs text-n500 mt-2 font-mono break-all">{document.sourceHash}</p>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-xs text-n700">
                    <span>{document.pageCount} page(s)</span>
                    <span>{document.bboxCount} bbox</span>
                    <span>{document.minConfidence?.toFixed(2) ?? "-"} min conf</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rule Evidence</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {governance.ruleEvidence.length === 0 && (
                <p className="text-sm text-n500">No rule evidence matched this request.</p>
              )}
              {governance.ruleEvidence.map((evidence) => (
                <div key={`${evidence.packId}-${evidence.ruleId}`} className="border border-n300 rounded-sm p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs font-semibold text-n900">{evidence.ruleId}</span>
                    <Badge variant={statusTone(evidence.severity ?? "")}>{evidence.severity ?? evidence.sourceType}</Badge>
                  </div>
                  <p className="text-sm font-semibold text-n900 mt-2">{evidence.title}</p>
                  <p className="text-xs text-n700 mt-2 leading-relaxed">{evidence.snippet}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audit Coverage</CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValueGrid data={governance.auditCoverage} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
