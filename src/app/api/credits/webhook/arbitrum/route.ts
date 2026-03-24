import { handleDepositWebhook } from "@/lib/credits/deposit-handler";

export async function POST(req: Request) {
  return handleDepositWebhook("arbitrum", req);
}
