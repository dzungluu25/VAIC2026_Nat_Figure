import Link from "next/link";
import { Button } from "../components/primitives/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/primitives/Card";
import { Badge } from "../components/primitives/Badge";

export default function LandingPage() {
  return (
    <div className="flex flex-col gap-16 py-12">
      {/* Hero Section */}
      <section className="flex flex-col items-center text-center gap-6 max-w-3xl mx-auto">
        <Badge variant="success" className="mb-2">Phiên bản Pilot Sandbox</Badge>
        <h1 className="text-3xl md:text-4xl font-bold text-n900 tracking-tight">
          SHB Retail Digital Expert Agents
        </h1>
        <p className="text-lg text-n700 leading-relaxed">
          Hệ thống Workflow-driven Multi-agent giúp lực lượng bán lẻ (RM, CA) thẩm định và phê duyệt hồ sơ tín dụng một cách tự động, tuân thủ và minh bạch. 
          Tách biệt hoàn toàn lập luận của AI khỏi hệ thống Rule Engine cứng để đảm bảo an toàn tuyệt đối.
        </p>
        <div className="flex gap-4 mt-4">
          <Link href="/dashboard">
            <Button variant="primary" className="h-12 px-8 text-base">Vào Bảng điều khiển</Button>
          </Link>
          <Link href="/cases">
            <Button variant="secondary" className="h-12 px-8 text-base">Xem Hồ sơ Mẫu</Button>
          </Link>
        </div>
      </section>

      {/* Feature Section */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Tốc độ & Tự động hóa</CardTitle>
          </CardHeader>
          <CardContent className="text-n700 text-sm leading-relaxed">
            Luồng Auto-Approval cho phép xử lý hồ sơ sạch, rủi ro thấp gần như tức thì dựa trên chính sách định lượng chuẩn hóa. 
            Không có độ trễ trong quá trình ra quyết định.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Human-in-the-loop</CardTitle>
          </CardHeader>
          <CardContent className="text-n700 text-sm leading-relaxed">
            Luồng Hybrid-Approval dành cho hồ sơ phức tạp. AI sẽ phân tích và đề xuất phương án, nhưng 
            quyết định cuối cùng và quyền thực thi hệ thống luôn thuộc về con người thông qua Approval Gate.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Minh bạch 100%</CardTitle>
          </CardHeader>
          <CardContent className="text-n700 text-sm leading-relaxed">
            Mọi thao tác, từ việc bóc tách dữ liệu (PII Masking), truy xuất luật (Vector DB) đến 
            quá trình đàm phán giữa các Agent đều được lưu vết đầy đủ trong Audit Trail phục vụ đối soát.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
