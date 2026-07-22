import { executeOrchestration } from "@/services/orchestration/planner.service";

const prompt = `Anh Nguyễn Quốc Khánh 42 tuổi, đã kết hôn với chị Mai Phương Thảo. Anh Khánh có CCCD số 001084012345, SĐT 0913999888, email khanh.nq@example.com. Anh Khánh nộp hồ sơ đề nghị vay vốn thế chấp để mua căn hộ thuộc dự án Sunrise Towers (mã dự án: SUNRISE-HN), căn hộ này có giá trị định giá là 4,5 tỷ VND (theo chứng thư định giá đi kèm của công ty định giá độc lập) và đang trong quá trình xây dựng, dự kiến bàn giao vào cuối năm 2027. 

Hồ sơ tài chính của anh Khánh như sau:
1. Thu nhập từ lương chuyển khoản tại Công ty TechCorp là 60 triệu VND/tháng (sao kê tài khoản lương 12 tháng).
2. Thu nhập từ việc làm cố vấn tự do (freelance) trung bình 30 triệu VND/tháng (có hợp đồng dịch vụ dài hạn và lịch sử nhận tiền mặt).
3. Thu nhập từ việc cho thuê một chiếc ô tô du lịch là 15 triệu VND/tháng (có hợp đồng thuê xe 2 năm).
Nghĩa vụ nợ hiện tại: Anh Khánh có một khoản vay mua ô tô tại ngân hàng khác với dư nợ gốc còn lại là 250 triệu VND, số tiền phải trả hàng tháng là 10 triệu VND (theo báo cáo CIC). Ngoài ra, anh có một thẻ tín dụng với hạn mức 100 triệu VND, dư nợ hiện tại là 30 triệu VND, số thanh toán tối thiểu hàng tháng là 1.5 triệu VND.

Yêu cầu khoản vay đề xuất:
Anh Khánh muốn vay thế chấp 3,4 tỷ VND, kỳ hạn vay trong 20 năm. Anh Khánh đồng ý ký các văn bản chấp thuận tra cứu thông tin tín dụng CIC, thuế thu nhập cá nhân và bảo hiểm xã hội, tuy nhiên từ chối nhận thông tin quảng cáo tiếp thị. Nhân viên tín dụng hướng dẫn rằng để được áp dụng mức lãi suất ưu đãi giảm 1%/năm, anh Khánh bắt buộc phải đăng ký mua gói bảo hiểm nhân thọ liên kết trị giá 45 triệu VND/năm đi kèm khoản vay. Toàn bộ căn hộ thế chấp này thuộc sở hữu chung của hai vợ chồng nhưng hồ sơ hiện tại mới chỉ có chữ ký và thông tin định danh của anh Khánh, chưa có chữ ký của người vợ là chị Mai Phương Thảo.`;

async function main() {
  try {
    console.log("Calling executeOrchestration inside container with complex prompt...");
    console.time("Execution time");
    const result = await executeOrchestration(prompt, "officer.tam");
    console.timeEnd("Execution time");
    console.log("\nRESULT SUCCESS!");
    console.log("Final Answer:", result.finalAnswer);
    if ("traces" in result) {
      console.log("\nTraces Summary:");
      result.traces.forEach(t => {
        console.log(`- Agent [${t.agent}]: ${t.summary}`);
      });
    } else {
      console.log(`\nAdvisory mode: ${result.mode}`);
    }
  } catch (error) {
    console.error("Error during execution:", error);
  }
}

main();
