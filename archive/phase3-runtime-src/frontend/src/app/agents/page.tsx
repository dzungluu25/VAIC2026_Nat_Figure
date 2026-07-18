import Link from "next/link";
import { Badge } from "../../components/primitives/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/primitives/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/primitives/Table";
import { getCaseAgentNetwork, listCases, statusTone } from "../../lib/api";

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <Card>
    <CardContent className="p-4">
      <p className="text-sm font-medium text-n500">{label}</p>
      <p className="text-2xl font-bold text-n900 mt-2">{value}</p>
    </CardContent>
  </Card>
);

export default async function AgentsPage() {
  const [cases, payload] = await Promise.all([listCases(), getCaseAgentNetwork("case_01_complex_main")]);
  const network = payload.agentNetwork;
  const demoCases = cases.filter((item) => item.approvalRoute === "HYBRID_APPROVAL").slice(0, 4);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-n900">Multi-Agent Operations Center</h1>
          <p className="text-sm text-n500 mt-1">
            Planner-led team of banking specialists with tool use, handoffs, decisions, and guarded actions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={statusTone(network.decisionSynthesis.approvalRoute)}>
            {network.decisionSynthesis.approvalRoute}
          </Badge>
          <Badge variant={statusTone(network.decisionSynthesis.gateStatus)}>
            {network.decisionSynthesis.gateStatus}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Stat label="Specialist Agents" value={network.toolUseSummary.agentCount} />
        <Stat label="Tool Calls" value={network.toolUseSummary.toolCallCount} />
        <Stat label="Agent Handoffs" value={network.handoffs.length} />
        <Stat label="HIGH Actions Blocked" value={network.toolUseSummary.blockedHighSideEffectCount} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Planner Decomposition</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Step</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {network.orchestrationPlan.map((step) => (
                  <TableRow key={`${step.step}-${step.assignedAgent}`}>
                    <TableCell>{step.step}</TableCell>
                    <TableCell className="font-mono text-xs">{step.assignedAgent}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm text-n900">{step.task}</span>
                        <span className="text-xs text-n500">{step.output}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusTone(step.status)}>{step.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Decision Synthesis</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-n700 leading-relaxed">{network.decisionSynthesis.finalAnswer}</p>
            {network.decisionSynthesis.conditions.map((condition) => (
              <div key={`${condition.ruleId}-${condition.blocksAt}`} className="border border-n300 rounded-sm p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-xs font-semibold text-n900">{condition.ruleId}</p>
                  <Badge variant={statusTone(condition.blocksAt)}>{condition.blocksAt}</Badge>
                </div>
                <p className="text-xs text-n700 mt-2">{condition.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Specialist Agent Team</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {network.specialists.map((specialist) => (
            <div key={`${specialist.sequence}-${specialist.agent}`} className="border border-n300 rounded-sm p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-n900">{specialist.label}</p>
                  <p className="text-xs text-n500 mt-1">{specialist.bankingDomain}</p>
                </div>
                <Badge variant={statusTone(specialist.status)}>{specialist.status}</Badge>
              </div>
              <p className="text-sm text-n700 mt-3">{specialist.responsibility}</p>
              <p className="text-xs text-n500 mt-3">{specialist.decision}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {specialist.tools.map((tool) => (
                  <span key={`${specialist.agent}-${tool.name}`} className="text-xs border border-n300 rounded-sm px-2 py-1">
                    {tool.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Collaboration Flow</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {network.handoffs.map((handoff, index) => (
              <div key={`${handoff.from}-${handoff.to}-${index}`} className="border-l-2 border-n300 pl-4 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-xs font-semibold text-n900">
                    {handoff.from} {"->"} {handoff.to}
                  </p>
                  <Badge variant={statusTone(handoff.status)}>{handoff.status}</Badge>
                </div>
                <p className="text-sm text-n700 mt-1">{handoff.artifact}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Multi-Agent vs Single Chatbot</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-n300 rounded-sm p-4">
              <p className="text-sm font-semibold text-n900">{network.singleAgentComparison.baseline.name}</p>
              <p className="text-xs text-n500 mt-2">{network.singleAgentComparison.baseline.expectedBehavior}</p>
              <ul className="flex flex-col gap-2 mt-4">
                {network.singleAgentComparison.baseline.missingCapabilities.map((item) => (
                  <li key={item} className="text-xs text-error border-l-2 border-error pl-2">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border border-success rounded-sm p-4">
              <p className="text-sm font-semibold text-n900">{network.singleAgentComparison.multiAgent.name}</p>
              <p className="text-xs text-n500 mt-2">{network.singleAgentComparison.multiAgent.expectedBehavior}</p>
              <p className="text-2xl font-bold text-success mt-4">
                {network.singleAgentComparison.multiAgent.toolCallCount}
              </p>
              <p className="text-xs text-n500">tool-backed actions and checks</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Hybrid Demo Cases</CardTitle>
          <Link href="/cases" className="text-sm font-medium text-accent hover:text-accent-hover">
            View all cases
          </Link>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {demoCases.map((item) => (
            <Link key={item.caseId} href={`/cases/${item.caseId}`} className="border border-n300 rounded-sm p-3 hover:border-accent">
              <p className="font-mono text-xs font-semibold text-n900">{item.caseId}</p>
              <p className="text-sm text-n700 mt-1">{item.title}</p>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
