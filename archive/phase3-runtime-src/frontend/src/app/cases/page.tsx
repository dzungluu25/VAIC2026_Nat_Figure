import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/primitives/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/primitives/Table";
import { Badge } from "../../components/primitives/Badge";
import { Button } from "../../components/primitives/Button";
import { listCases, statusTone } from "../../lib/api";

export default async function CasesPage() {
  const cases = await listCases();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-n900">Case Registry</h1>
          <p className="text-sm text-n500 mt-1">8 KHCN runtime cases loaded from the local fixture store.</p>
        </div>
        <Badge variant="success">{cases.length} source-backed cases</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Runtime Cases</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Case</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Trap Count</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((item) => (
                <TableRow key={item.caseId}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-xs font-semibold">{item.caseId}</span>
                      <span className="text-sm text-n700">{item.title}</span>
                    </div>
                  </TableCell>
                  <TableCell>{item.product}</TableCell>
                  <TableCell>
                    <Badge variant={statusTone(item.approvalRoute)}>{item.approvalRoute}</Badge>
                  </TableCell>
                  <TableCell>{item.riskTier}</TableCell>
                  <TableCell>{item.trapCount}</TableCell>
                  <TableCell>{item.targetSlaHours}h</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/cases/${item.caseId}`}>
                      <Button variant="secondary" className="!px-3 !py-1.5 text-xs">
                        Open
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
