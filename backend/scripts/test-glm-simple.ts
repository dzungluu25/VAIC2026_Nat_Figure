import { getFptMarketplaceClient } from "@/config/fpt-marketplace";
import { config } from "@/config/env";

async function main() {
  try {
    const client = getFptMarketplaceClient();
    const model = config.fptExtractionModel; // GLM-5.1
    console.log(`Sending simple prompt to model ${model} at ${config.fptMarketplaceBaseUrl}...`);
    console.time("Response time");
    const response = await client.chat.completions.create({
      model: model,
      messages: [{ role: "user", content: "Hãy trả lời cực kỳ ngắn gọn (dưới 10 từ): Bạn có đang hoạt động tốt không?" }],
      max_tokens: 1000,
    });
    console.timeEnd("Response time");
    console.log("\nFull Response:", JSON.stringify(response, null, 2));
  } catch (error) {
    console.error("Error calling GLM-5.1:", error);
  }
}

main();
