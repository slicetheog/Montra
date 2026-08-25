import { NextResponse } from "next/server";
import { apiError } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { exportTransactionsCsv } from "@/server/services/csv-export";

export async function GET(_request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  try {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    const csv = await exportTransactionsCsv(user.id, budgetId);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="montra-transactions-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
