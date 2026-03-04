import { NextResponse } from "next/server";
import { runPlannerWithSupervisor } from "../../../lib/supervisorPlanner";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const scenario = (body?.scenario ?? "").trim();

    if (!scenario) {
      return NextResponse.json(
        { error: "Missing 'scenario' in request body." },
        { status: 400 }
      );
    }

    const interpretation = await runPlannerWithSupervisor(scenario);
    return NextResponse.json(interpretation);
  } catch (err) {
    console.error("Error in /api/interpret:", err);
    return NextResponse.json(
      { error: "Failed to run interpreter." },
      { status: 500 }
    );
  }
}

