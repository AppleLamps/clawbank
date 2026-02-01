import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");
    const type = searchParams.get("type");

    // Build query for public transaction ledger
    let transactions;
    let countResult;

    if (type) {
      transactions = await sql`
        SELECT
          t.id,
          t.type,
          t.amount,
          t.memo,
          t.created_at,
          t.counterparty_agent_name,
          ag.name as agent_name
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        JOIN agents ag ON a.agent_id = ag.id
        WHERE t.type = ${type}
        ORDER BY t.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      countResult = await sql`
        SELECT COUNT(*) as total
        FROM transactions t
        WHERE t.type = ${type}
      `;
    } else {
      transactions = await sql`
        SELECT
          t.id,
          t.type,
          t.amount,
          t.memo,
          t.created_at,
          t.counterparty_agent_name,
          ag.name as agent_name
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        JOIN agents ag ON a.agent_id = ag.id
        ORDER BY t.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      countResult = await sql`
        SELECT COUNT(*) as total FROM transactions
      `;
    }

    const total = parseInt(countResult[0]?.total || "0");

    return NextResponse.json({
      success: true,
      transactions: transactions.map((t: any) => ({
        id: t.id,
        type: t.type,
        amount: parseFloat(t.amount),
        agent_name: t.agent_name,
        counterparty_agent_name: t.counterparty_agent_name,
        memo: t.memo,
        created_at: t.created_at,
      })),
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + transactions.length < total,
      },
    });
  } catch (error) {
    console.error("Ledger fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch ledger" },
      { status: 500 },
    );
  }
}
