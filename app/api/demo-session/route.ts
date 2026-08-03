export async function GET() {
  return Response.json({
    startedAt: "2026-08-03T10:00:00.000Z",
    projectName: "Demo project",
    isRunning: true,
  });
}