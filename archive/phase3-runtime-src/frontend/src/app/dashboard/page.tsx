import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/primitives/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/primitives/Table";
import { Badge } from "../../components/primitives/Badge";
import { Button } from "../../components/primitives/Button";
import { getEvaluationReport, listCases, statusTone } from "../../lib/api";

export default async function DashboardPage() {
  const [cases, evaluation] = await Promise.all([listCases(), getEvaluationReport()]);
  const runsByCase = new Map(evaluation.runs.map((run) => [run.caseId, run]));
  const autoCount = evaluation.runs.filter((run) => run.approvalRoute === "AUTO_APPROVAL").length;
  const waitingCount = evaluation.runs.filter((run) => run.status === "WAITING_HUMAN_APPROVAL").length;
  const blockedCount = evaluation.runs.filter((run) =>
    ["REPLAN_REQUIRED", "CONSENT_REQUIRED", "REJECT_OR_REQUEST_LOWER_AMOUNT"].includes(run.gateStatus)
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-n900">Operational Dashboard</h1>
          <p className="text-sm text-n500 mt-1">Live local runtime status from backend evaluation APIs.</p>
        </div>
        <Badge variant={evaluation.status === "PASS" ? "success" : "error"}>
          Evaluation {evaluation.passed}/{evaluation.checkCount}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium text-n500">Loaded Cases</p>
            <p className="text-2xl font-bold text-n900 mt-2">{cases.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium text-n500">Auto Approval</p>
            <p className="text-2xl font-bold text-success mt-2">{autoCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium text-n500">Waiting Review</p>
            <p className="text-2xl font-bold text-warning mt-2">{waitingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium text-n500">Blocked/Replan</p>
            <p className="text-2xl font-bold text-error mt-2">{blockedCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>KHCN Runtime Coverage</CardTitle>
          <Link href="/cases" className="text-sm font-medium text-accent hover:text-accent-hover">
            View cases
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Case</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Gate</TableHead>
                <TableHead>Lifecycle</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.slice(0, 6).map((item) => {
                const run = runsByCase.get(item.caseId);
                return (
                  <TableRow key={item.caseId}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-xs font-semibold">{item.caseId}</span>
                        <span className="text-sm text-n700">{item.title}</span>
                      </div>
                    </TableCell>
                    <TableCell>{run?.approvalRoute ?? item.approvalRoute}</TableCell>
                    <TableCell>
                      <Badge variant={statusTone(run?.gateStatus ?? item.approvalRoute)}>
                        {run?.gateStatus ?? item.approvalRoute}
                      </Badge>
                    </TableCell>
                    <TableCell>{run?.status ?? "NOT_RUN"}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/cases/${item.caseId}`}>
                        <Button variant="secondary" className="!px-3 !py-1.5 text-xs">
                          Review
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
