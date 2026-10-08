// supabase/functions/ai-qa/index.ts
//
// AI Q&A Edge Function (T019, v2 feature from PRD.md item "AI spending Q&A").
//
// Architecture (per DECISIONS.md / ARCHITECTURE.md):
//   - Online-only, tool-calling pattern — the LLM NEVER generates raw SQL.
//     It can only ask to run one of the four predefined, safe query
//     functions below. All query functions filter by the caller's own
//     user_id (defense in depth) AND run through a Supabase client built
//     from the caller's own JWT, so RLS scopes every query to that user
//     regardless.
//   - LLM: Google Gemini (free tier, Flash model), called via the
//     Interactions API (https://ai.google.dev/gemini-api/docs/function-calling).
//     Chosen because it has a genuine free tier (not just trial credits)
//     and supports function/tool calling natively.
//   - No chat history is persisted here — each question is answered fresh
//     (small v1 scope, see TASKS.md T019). The client may keep a local
//     message list for display, but nothing round-trips as prior context.
//
// Secret required: GEMINI_API_KEY (set via the Supabase dashboard /
// `create_edge_function_secret`, never committed to this file or the repo).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const GEMINI_MODEL = "gemini-3.8-flash"
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
const MAX_TOOL_ROUNDS = 5

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// ----------------------------------------------------------------------------
// Tool declarations (Gemini function-calling schema)
// ----------------------------------------------------------------------------

const TOOL_DECLARATIONS = [
  {
    type: "function",
    name: "get_spending_by_category",
    description:
      "Get total expense amounts grouped by category and currency, for a date range. Use this to answer questions about where the user's money went, their biggest spending categories, or spending in a specific period.",
    parameters: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Inclusive start date, YYYY-MM-DD." },
        end_date: { type: "string", description: "Inclusive end date, YYYY-MM-DD." },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    type: "function",
    name: "get_income_vs_expense",
    description:
      "Get total income, total expense, and net (income - expense) grouped by currency, for a date range. Use this for questions about how much the user earned, spent, or saved overall in a period.",
    parameters: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Inclusive start date, YYYY-MM-DD." },
        end_date: { type: "string", description: "Inclusive end date, YYYY-MM-DD." },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    type: "function",
    name: "get_account_balances",
    description:
      "Get the current balance of every active (non-archived) account, grouped by currency. Use this for questions about how much money the user currently has, or their balance in a specific account.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "get_budget_status",
    description:
      "Get every category budget's monthly limit, amount spent so far this calendar month, and percentage used. Use this for questions about whether the user is on budget, over budget, or how much budget is left in a category.",
    parameters: { type: "object", properties: {} },
  },
] as const

type ToolName = (typeof TOOL_DECLARATIONS)[number]["name"]

// ----------------------------------------------------------------------------
// Tool implementations — plain Supabase queries only, no raw SQL from the LLM
// ----------------------------------------------------------------------------

async function getSpendingByCategory(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  args: { start_date: string; end_date: string },
) {
  const { data, error } = await supabase
    .from("transactions")
    .select("amount, currency, category_id, categories(name)")
    .eq("user_id", userId)
    .eq("type", "expense")
    .is("deleted_at", null)
    .gte("occurred_at", `${args.start_date}T00:00:00Z`)
    .lte("occurred_at", `${args.end_date}T23:59:59Z`)

  if (error) throw error

  const totals = new Map<string, { category: string; currency: string; total: number }>()
  for (const row of data ?? []) {
    const categoryName = (row as { categories?: { name?: string } }).categories?.name ?? "Uncategorized"
    const key = `${categoryName}__${row.currency}`
    const existing = totals.get(key)
    if (existing) {
      existing.total += Number(row.amount)
    } else {
      totals.set(key, { category: categoryName, currency: row.currency as string, total: Number(row.amount) })
    }
  }
  return { breakdown: Array.from(totals.values()).sort((a, b) => b.total - a.total) }
}

async function getIncomeVsExpense(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  args: { start_date: string; end_date: string },
) {
  const { data, error } = await supabase
    .from("transactions")
    .select("amount, currency, type")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .gte("occurred_at", `${args.start_date}T00:00:00Z`)
    .lte("occurred_at", `${args.end_date}T23:59:59Z`)

  if (error) throw error

  const byCurrency = new Map<string, { currency: string; income: number; expense: number }>()
  for (const row of data ?? []) {
    const currency = row.currency as string
    const existing = byCurrency.get(currency) ?? { currency, income: 0, expense: 0 }
    if (row.type === "income") existing.income += Number(row.amount)
    else existing.expense += Number(row.amount)
    byCurrency.set(currency, existing)
  }
  return {
    by_currency: Array.from(byCurrency.values()).map((v) => ({
      ...v,
      net: v.income - v.expense,
    })),
  }
}

async function getAccountBalances(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await supabase
    .from("accounts")
    .select("name, type, currency, balance")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .is("deleted_at", null)

  if (error) throw error
  return { accounts: data ?? [] }
}

async function getBudgetStatus(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data: budgets, error: budgetsError } = await supabase
    .from("budgets")
    .select("monthly_limit, currency, category_id, categories(name)")
    .eq("user_id", userId)
    .is("deleted_at", null)

  if (budgetsError) throw budgetsError
  if (!budgets || budgets.length === 0) return { budgets: [] }

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const results = []
  for (const budget of budgets) {
    const { data: spentRows, error: spentError } = await supabase
      .from("transactions")
      .select("amount")
      .eq("user_id", userId)
      .eq("type", "expense")
      .eq("category_id", budget.category_id)
      .is("deleted_at", null)
      .gte("occurred_at", startOfMonth)

    if (spentError) throw spentError
    const spent = (spentRows ?? []).reduce((sum, r) => sum + Number(r.amount), 0)
    const categoryName = (budget as { categories?: { name?: string } }).categories?.name ?? "Unknown"
    const limit = Number(budget.monthly_limit)
    results.push({
      category: categoryName,
      currency: budget.currency,
      monthly_limit: limit,
      spent_this_month: spent,
      percent_used: limit > 0 ? Math.round((spent / limit) * 100) : 0,
    })
  }
  return { budgets: results }
}

async function runTool(
  name: ToolName,
  args: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  userId: string,
) {
  switch (name) {
    case "get_spending_by_category":
      return getSpendingByCategory(supabase, userId, args as { start_date: string; end_date: string })
    case "get_income_vs_expense":
      return getIncomeVsExpense(supabase, userId, args as { start_date: string; end_date: string })
    case "get_account_balances":
      return getAccountBalances(supabase, userId)
    case "get_budget_status":
      return getBudgetStatus(supabase, userId)
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

// ----------------------------------------------------------------------------
// Gemini Interactions API helpers
// ----------------------------------------------------------------------------

interface GeminiStep {
  type: string
  id?: string
  name?: string
  arguments?: Record<string, unknown>
  content?: { type: string; text?: string }[]
}

interface GeminiInteraction {
  id: string
  steps: GeminiStep[]
}

async function callGemini(body: Record<string, unknown>): Promise<GeminiInteraction> {
  const apiKey = Deno.env.get("GEMINI_API_KEY")
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured")

  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Gemini API error (${response.status}): ${text}`)
  }
  return (await response.json()) as GeminiInteraction
}

function extractText(interaction: GeminiInteraction): string | null {
  for (const step of interaction.steps) {
    if (step.content) {
      const text = step.content
        .filter((p) => p.type === "text" && p.text)
        .map((p) => p.text)
        .join("")
      if (text) return text
    }
  }
  return null
}

function extractFunctionCalls(interaction: GeminiInteraction) {
  return interaction.steps.filter((s) => s.type === "function_call")
}

// ----------------------------------------------------------------------------
// Main handler
// ----------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { question } = await req.json()
    if (!question || typeof question !== "string") {
      return new Response(JSON.stringify({ error: "Missing 'question' string in request body." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Could not verify the signed-in user." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    const userId = userData.user.id

    const todayIso = new Date().toISOString().slice(0, 10)
    const promptPrefix =
      `You are a helpful personal-finance assistant inside the Ploutos app. ` +
      `Today's date is ${todayIso}. Answer the user's question about their own ` +
      `finances using the provided tools — never guess numbers, always call a ` +
      `tool to get real figures before answering. Keep answers short and ` +
      `concrete (amounts with currency). If a tool returns no data for the ` +
      `requested period, say so plainly instead of making something up.\n\n` +
      `User question: ${question}`

    let interaction = await callGemini({
      model: GEMINI_MODEL,
      input: promptPrefix,
      tools: TOOL_DECLARATIONS,
    })

    let rounds = 0
    while (rounds < MAX_TOOL_ROUNDS) {
      const calls = extractFunctionCalls(interaction)
      if (calls.length === 0) break

      const functionResults = []
      for (const call of calls) {
        let resultPayload: unknown
        try {
          resultPayload = await runTool(call.name as ToolName, call.arguments ?? {}, supabase, userId)
        } catch (toolError) {
          resultPayload = { error: toolError instanceof Error ? toolError.message : String(toolError) }
        }
        functionResults.push({
          type: "function_result",
          name: call.name,
          call_id: call.id,
          result: [{ type: "text", text: JSON.stringify(resultPayload) }],
        })
      }

      interaction = await callGemini({
        model: GEMINI_MODEL,
        previous_interaction_id: interaction.id,
        tools: TOOL_DECLARATIONS,
        input: functionResults,
      })
      rounds += 1
    }

    const answer = extractText(interaction) ?? "I wasn't able to put together an answer for that — try rephrasing the question."

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("ai-qa error:", err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
